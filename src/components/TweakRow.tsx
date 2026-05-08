import { useEffect, useState } from 'react'
import type { TweakRecord, TweakTargets } from '../lib/catalog'
import { tweakRequiresAdmin, tweakMatchesSpec } from '../lib/catalog'
import { detectSpecs, type SpecProfile } from '../lib/tauri'
import type { TweakAudit } from '../lib/audit'

/**
 * Single tweak row in the catalog list. Click the title to expand and
 * surface the rationale + risk explanation + source citation.
 */

interface TweakRowProps {
  tweak: TweakRecord
  applied: boolean
  busy: boolean
  isVip: boolean
  audit?: TweakAudit
  onApply: () => void
  onRevert: () => void
  onPreview: () => void
}

const RISK_LABEL: Record<number, string> = {
  1: 'Safe',
  2: 'Standard',
  3: 'Expert',
  4: 'Extreme',
}

const RISK_COLOR: Record<number, string> = {
  1: 'text-text-muted',
  2: 'text-text',
  3: 'text-accent',
  4: 'text-accent font-semibold',
}

// Module-level cache so we don't refetch specs for every TweakRow mount.
let cachedSpec: SpecProfile | null = null
let specPromise: Promise<SpecProfile | null> | null = null

function loadSpec(): Promise<SpecProfile | null> {
  if (cachedSpec) return Promise.resolve(cachedSpec)
  if (!specPromise) {
    specPromise = detectSpecs()
      .then((s) => {
        cachedSpec = s
        return s
      })
      .catch(() => null)
  }
  return specPromise
}

export function TweakRow({
  tweak,
  applied,
  busy,
  isVip,
  audit,
  onApply,
  onRevert,
  onPreview,
}: TweakRowProps) {
  const adminNeeded = tweakRequiresAdmin(tweak)
  const lockedByVip = tweak.vipGate === 'vip' && !isVip
  const [expanded, setExpanded] = useState(false)
  const [spec, setSpec] = useState<SpecProfile | null>(cachedSpec)

  useEffect(() => {
    if (!expanded || spec) return
    loadSpec().then(setSpec)
  }, [expanded, spec])

  return (
    <div className="surface-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-text">{tweak.title}</span>
            <Badge>{tweak.category}</Badge>
            <Badge color={RISK_COLOR[tweak.riskLevel]}>
              {RISK_LABEL[tweak.riskLevel] ?? `risk ${tweak.riskLevel}`}
            </Badge>
            {tweak.rebootRequired !== 'none' && <Badge>{tweak.rebootRequired}</Badge>}
            {tweak.anticheatRisk !== 'none' && (
              <Badge color="text-accent">AC: {tweak.anticheatRisk}</Badge>
            )}
            {adminNeeded && <Badge color="text-accent">admin</Badge>}
            {tweak.vipGate === 'vip' && (
              <Badge color="text-accent font-semibold">VIP</Badge>
            )}
            {audit && <AuditBadge audit={audit} />}
            <span className="text-text-subtle text-xs">
              {expanded ? '▾' : '▸'}
            </span>
          </div>
          <p className="text-sm text-text-muted leading-snug">{tweak.description}</p>
        </button>

        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={onPreview}
            disabled={busy}
            className="px-3 py-1.5 rounded-md border border-border text-xs hover:border-border-glow disabled:opacity-50"
          >
            Preview
          </button>
          {applied ? (
            <button
              onClick={onRevert}
              disabled={busy}
              className="px-3 py-1.5 rounded-md border border-border text-xs hover:border-border-glow disabled:opacity-50"
            >
              Revert
            </button>
          ) : (
            <button
              onClick={onApply}
              disabled={busy || lockedByVip}
              title={
                lockedByVip
                  ? 'VIP unlocks this tweak'
                  : adminNeeded
                  ? 'Triggers a single UAC prompt for elevation'
                  : undefined
              }
              className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {lockedByVip ? 'VIP only' : adminNeeded ? 'Apply (UAC)' : 'Apply'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2 border-t border-border">
            <Section title="Why it works">{tweak.rationale}</Section>
            <Section title={`Risk ${tweak.riskLevel} — what could go wrong`}>
              {explainRisk(tweak)}
            </Section>
            <Section title="Source">{describeSource(tweak)}</Section>
            <Section title="For this rig">{describeTargeting(tweak, spec)}</Section>
          </div>
          {audit && audit.actions.length > 0 && (
            <div className="text-xs pt-2 border-t border-border">
              <p className="text-text-subtle uppercase tracking-widest text-[10px] mb-2">
                Current state vs target ({audit.matchCount}/{audit.total} match)
              </p>
              <ul className="space-y-1">
                {audit.actions.map((a) => (
                  <li key={a.index} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 ${
                        a.status === 'matches'
                          ? 'text-emerald-400'
                          : a.status === 'differs'
                          ? 'text-accent'
                          : 'text-text-subtle'
                      }`}
                    >
                      {a.status === 'matches' ? '✓' : a.status === 'differs' ? '✗' : '?'}
                    </span>
                    <span className="text-text-muted leading-snug">
                      <span className="text-text-subtle">action {a.index + 1}:</span> {a.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-text-subtle uppercase tracking-widest text-[10px] mb-1">{title}</p>
      <p className="text-text-muted leading-snug">{children}</p>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-border ${
        color ?? 'text-text-subtle'
      }`}
    >
      {children}
    </span>
  )
}

function explainRisk(t: TweakRecord): string {
  const parts: string[] = []
  if (t.riskLevel === 4)
    parts.push(
      'Extreme tradeoff. Real performance gain in exchange for security or compatibility cost — only apply on dedicated single-user rigs.',
    )
  else if (t.riskLevel === 3)
    parts.push(
      'Expert-tier. Has a security or stability tradeoff documented in the rationale. Read it before applying.',
    )
  else if (t.riskLevel === 2)
    parts.push(
      'Standard tweak — well-trodden, predictable effects. Reverts cleanly via the snapshot store.',
    )
  else parts.push('Safe. Reverses cleanly. Worst case: no observable change.')

  if (t.anticheatRisk === 'high')
    parts.push('Anti-cheat HIGH: likely to be flagged by Vanguard/EAC/BattlEye — skip on rigs that play those.')
  else if (t.anticheatRisk === 'medium')
    parts.push('Anti-cheat MEDIUM: may interact with kernel-mode anti-cheat. Test on a non-ranked match first.')
  else if (t.anticheatRisk === 'low')
    parts.push('Anti-cheat LOW: documented edge case (e.g. lower TTL). Most rigs are unaffected.')

  if (t.rebootRequired === 'cold-boot')
    parts.push('Cold-boot required (full power-off, not just restart) for the change to fully take effect.')
  else if (t.rebootRequired === 'reboot')
    parts.push('Reboot required to take effect.')
  else if (t.rebootRequired === 'logout')
    parts.push('Sign out + back in for the change to take effect.')

  return parts.join(' ')
}

function describeTargeting(t: TweakRecord, spec: SpecProfile | null): string {
  const tg = t.targets as TweakTargets | undefined
  if (!tg || Object.keys(tg).length === 0) {
    return 'Universal — applies to every supported Windows rig.'
  }
  const reqs: string[] = []
  if (tg.cpuVendor && tg.cpuVendor.length > 0)
    reqs.push(`CPU vendor: ${tg.cpuVendor.join(' or ')}`)
  if (tg.gpuVendor && tg.gpuVendor.length > 0)
    reqs.push(`GPU vendor: ${tg.gpuVendor.join(' or ')}`)
  if (tg.osMinBuild != null) reqs.push(`Win build ≥ ${tg.osMinBuild}`)
  if (tg.osMaxBuild != null) reqs.push(`Win build ≤ ${tg.osMaxBuild}`)
  if (tg.ramMinGb != null) reqs.push(`RAM ≥ ${tg.ramMinGb} GB`)
  if (tg.formFactor && tg.formFactor.length > 0)
    reqs.push(`Form factor: ${tg.formFactor.join(' or ')}`)

  const reqsLine = `Requires: ${reqs.join(' · ')}.`
  if (!spec) return reqsLine
  const matches = tweakMatchesSpec(t, spec)
  return `${reqsLine} Your rig ${matches ? 'matches ✓' : 'does not match ✗'}.`
}

function describeSource(t: TweakRecord): string {
  // Most curated tweaks bake the source in `rationale` ("From diggy-tweaks/cpu",
  // "Cross-validated by fr33thy + xilly"). Some LLM-extracted tweaks have a
  // structured sourceCitation block. Surface what we have.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cite = (t as any).sourceCitation as
    | { discordChannel?: string; channel?: string; videoUrl?: string; messageId?: string }
    | undefined
  if (cite) {
    if (cite.videoUrl) return `YouTube — ${cite.videoUrl}`
    if (cite.discordChannel || cite.channel) {
      return `Discord — diggy-tweaks/${cite.discordChannel || cite.channel}`
    }
  }
  // Heuristic: pull a "From X" or "fr33thy / lecctron / xilly / lestripez / reknotic" mention
  // out of the rationale.
  const rationale = t.rationale || ''
  const fromMatch = rationale.match(/[Ff]rom (diggy-tweaks\/[a-z-]+|[A-Z][a-z]+ \+ [A-Z][a-z]+)/)
  if (fromMatch) return fromMatch[0]
  const creators = ['fr33thy', 'lecctron', 'xilly', 'lestripez', 'reknotic']
  const found = creators.filter((c) => rationale.toLowerCase().includes(c.toLowerCase()))
  if (found.length > 0) return `Cross-validated by ${found.join(' + ')}`
  return 'Curated by Diggy — see rationale for primary reference.'
}

function AuditBadge({ audit }: { audit: TweakAudit }) {
  const { status, matchCount, total } = audit
  const tooltip =
    status === 'matches'
      ? `Already at target on this rig (${matchCount}/${total} actions match)`
      : status === 'differs'
      ? `None of ${total} actions match target — applying would change all`
      : status === 'partial'
      ? `${matchCount}/${total} actions already match — applying would change the rest`
      : status === 'unknown'
      ? `Current state can't be derived without applying (PowerShell / BCD)`
      : 'Audit error — refresh and retry'
  if (status === 'matches') {
    return (
      <span
        title={tooltip}
        className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400"
      >
        ✓ already set
      </span>
    )
  }
  if (status === 'partial') {
    return (
      <span
        title={tooltip}
        className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-border text-text-muted"
      >
        ◐ {matchCount}/{total}
      </span>
    )
  }
  if (status === 'differs') {
    return (
      <span
        title={tooltip}
        className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-border text-text-subtle"
      >
        ✗ would change
      </span>
    )
  }
  if (status === 'unknown') {
    return (
      <span
        title={tooltip}
        className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-border text-text-subtle"
      >
        ? unknown
      </span>
    )
  }
  return null
}
