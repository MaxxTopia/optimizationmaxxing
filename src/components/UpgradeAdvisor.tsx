import { useMemo } from 'react'
import { buildUpgradePlan, type UpgradePick, type UpgradePlan } from '../lib/upgradeAdvisor'
import type { SpecProfile } from '../lib/tauri'

/**
 * Upgrade Advisor card for the Profile page. Reads the detected spec, finds the
 * Fortnite bottleneck, and shows the two-tier call:
 *   - Best drop-in  (fits your current board)
 *   - Best overall  (may need a new platform — cost spelled out)
 * When the drop-in IS the best overall (already on AM5, or a GPU/RAM pick that
 * fits any board), it collapses to a single "drops right in" card.
 */
export function UpgradeAdvisor({ spec }: { spec: SpecProfile }) {
  const plan = useMemo(() => buildUpgradePlan(spec), [spec])

  return (
    <section className="surface-card p-6 border-l-4 border-l-accent">
      <p className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">upgrade advisor</p>
      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">{plan.headline}</h2>
      <p className="text-[15px] md:text-base text-text leading-relaxed font-medium mt-2 max-w-3xl">
        {plan.detail}
      </p>

      {plan.bottleneck !== 'none' && (
        <div className="mt-5">
          {isSinglePick(plan) ? (
            <PickCard
              badge="Best upgrade · drops right in"
              badgeTone="drop"
              pick={plan.overall ?? plan.dropIn!}
              subtext={dropInSubtext(plan)}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plan.dropIn && (
                <PickCard
                  badge="Best drop-in · fits your board"
                  badgeTone="drop"
                  pick={plan.dropIn}
                  subtext={dropInSubtext(plan)}
                />
              )}
              {plan.overall && (
                <PickCard
                  badge={plan.overallReplatform ? 'Best overall · new platform' : 'Best overall'}
                  badgeTone={plan.overallReplatform ? 'replatform' : 'drop'}
                  pick={plan.overall}
                  subtext={
                    plan.overallReplatform && plan.replatformCost
                      ? `Heads up: this is not one part — it needs ${plan.replatformCost}.`
                      : undefined
                  }
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-border space-y-1.5">
        {plan.notes.map((n, i) => (
          <p key={i} className="text-xs text-text-muted leading-snug flex gap-2">
            <span className="text-accent shrink-0" aria-hidden="true">▸</span>
            <span>{n}</span>
          </p>
        ))}
        <p className="text-[11px] text-text-subtle pt-1">
          Fortnite-weighted read of your detected specs · CPU {plan.scores.cpu} · GPU{' '}
          {plan.scores.gpu} · RAM {plan.scores.ram} (higher = healthier). Prices move fast in the
          2026 memory market — check current pricing before you buy.
        </p>
      </div>
    </section>
  )
}

function isSinglePick(plan: UpgradePlan): boolean {
  return (
    !!plan.dropIn &&
    !!plan.overall &&
    plan.dropIn.part === plan.overall.part &&
    !plan.overallReplatform
  )
}

function dropInSubtext(plan: UpgradePlan): string | undefined {
  // When the best overall requires a replatform, reassure that the drop-in is
  // the recommended one-part move.
  if (plan.overallReplatform && plan.dropIn) {
    return 'Recommended — this is the single-part move that fits what you already own.'
  }
  return undefined
}

function PickCard({
  badge,
  badgeTone,
  pick,
  subtext,
}: {
  badge: string
  badgeTone: 'drop' | 'replatform'
  pick: UpgradePick
  subtext?: string
}) {
  return (
    <div className="rounded-lg bg-bg-raised/60 border border-border p-4 flex flex-col gap-2">
      <span
        className={`self-start text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ${
          badgeTone === 'replatform'
            ? 'bg-secondary/20 text-secondary border border-secondary/40'
            : 'bg-accent text-bg-base'
        }`}
      >
        {badge}
      </span>
      <p className="text-lg font-extrabold tracking-tight text-text">{pick.part}</p>
      <p className="text-sm text-text-muted leading-relaxed">{pick.note}</p>
      {subtext && (
        <p
          className={`text-xs font-semibold leading-snug ${
            badgeTone === 'replatform' ? 'text-secondary' : 'text-accent'
          }`}
        >
          {subtext}
        </p>
      )}
      {pick.link && (
        <a
          href={pick.link}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline text-accent hover:text-text mt-auto pt-1"
        >
          View specs ↗
        </a>
      )}
    </div>
  )
}
