import { useMemo } from 'react'
import {
  buildUpgradePlan,
  type Impact,
  type UpgradeOpportunity,
  type UpgradePick,
} from '../lib/upgradeAdvisor'
import type { SpecProfile } from '../lib/tauri'

/**
 * Upgrade Advisor card for the Profile page. Reads the detected spec and shows
 * the best real upgrade for each part, ranked by how much it helps competitive
 * Fortnite (bottleneck -> worthwhile -> ceiling polish). Each opportunity is a
 * two-tier call: best drop-in (fits your board) vs best overall (may need a new
 * platform, cost spelled out). Never a dead-end "you're set" — a strong rig
 * still gets its ceiling upgrades shown, just honestly labelled optional.
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

      {plan.opportunities.length > 0 && (
        <div className="mt-5 space-y-4">
          {plan.opportunities.map((opp) => (
            <OpportunityRow key={opp.component} opp={opp} />
          ))}
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

const IMPACT_META: Record<Impact, { label: string; cls: string }> = {
  high: { label: 'Biggest gain · buy this first', cls: 'bg-accent text-bg-base' },
  medium: { label: 'Worthwhile gain', cls: 'bg-secondary/20 text-secondary border border-secondary/40' },
  low: { label: 'Optional · diminishing returns', cls: 'bg-bg-raised text-text-muted border border-border' },
}

const COMPONENT_LABEL: Record<UpgradeOpportunity['component'], string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  ram: 'RAM',
}

function OpportunityRow({ opp }: { opp: UpgradeOpportunity }) {
  const meta = IMPACT_META[opp.impact]
  const singlePick =
    !!opp.dropIn &&
    !!opp.overall &&
    opp.dropIn.part === opp.overall.part &&
    !opp.overallReplatform

  return (
    <div className="rounded-lg bg-bg-raised/40 border border-border p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <p className="text-sm font-bold text-text">
          {COMPONENT_LABEL[opp.component]}
          <span className="text-text-subtle font-normal"> · you have {opp.current}</span>
        </p>
        <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ${meta.cls}`}>
          {meta.label}
        </span>
      </div>

      {singlePick ? (
        <PickBlock badge="Drops right in" tone="drop" pick={opp.overall ?? opp.dropIn!} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {opp.dropIn && <PickBlock badge="Best drop-in · fits your board" tone="drop" pick={opp.dropIn} />}
          {opp.overall && (
            <PickBlock
              badge={opp.overallReplatform ? 'Best overall · new platform' : 'Best overall'}
              tone={opp.overallReplatform ? 'replatform' : 'drop'}
              pick={opp.overall}
              subtext={
                opp.overallReplatform && opp.replatformCost
                  ? `Not one part — needs ${opp.replatformCost}.`
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  )
}

function PickBlock({
  badge,
  tone,
  pick,
  subtext,
}: {
  badge: string
  tone: 'drop' | 'replatform'
  pick: UpgradePick
  subtext?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`self-start text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ${
          tone === 'replatform'
            ? 'bg-secondary/20 text-secondary border border-secondary/40'
            : 'bg-accent text-bg-base'
        }`}
      >
        {badge}
      </span>
      <p className="text-base font-extrabold tracking-tight text-text">{pick.part}</p>
      <p className="text-sm text-text-muted leading-relaxed">{pick.note}</p>
      {subtext && (
        <p className={`text-xs font-semibold leading-snug ${tone === 'replatform' ? 'text-secondary' : 'text-accent'}`}>
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
