import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalog, tweakMatchesSpec, type TweakRecord } from '../lib/catalog'
import { runBench, score } from '../lib/astaBench'
import { loadImpactStore } from '../lib/benchImpact'
import { useIsVip } from '../store/useVipStore'
import {
  applyBatch,
  detectSpecs,
  inTauri,
  listApplied,
  telemetrySendEvent,
  type BatchItem,
  type SpecProfile,
} from '../lib/tauri'

/**
 * /tune — the lazy-user one-click conversion page.
 *
 * The whole flow on one screen:
 *   1. Scan rig + initial Asta Bench composite
 *   2. Show: "N free tweaks match your rig + M VIP-only worth ~+X composite"
 *   3. ONE Apply button → all matching free tweaks under one UAC
 *   4. Auto re-bench → show before/after delta
 *   5. VIP-gap CTA in context: "You missed Y composite by not being VIP"
 *   6. Restore-Point reassurance — every tweak is one-click reversible
 *
 * Game-agnostic by design — works for any game (even ones we don't have
 * dedicated tweaks for) because the core ~70 rig-level + Windows-level
 * tweaks compound regardless of title.
 *
 * Excludes risk-4 tweaks + tournament-breaking tweaks from the auto-apply
 * set. The user explicitly opts into DANGER tier from /tweaks.
 */

type Phase = 'idle' | 'scanning' | 'ready' | 'applying' | 'measuring' | 'done' | 'error'

interface PlanBuckets {
  /** Free tweaks matching this rig that aren't already applied + are
   *  safe-by-default (risk ≤ 3, anti-cheat-safe). */
  applyFree: TweakRecord[]
  /** VIP tweaks matching this rig — projected composite if user upgrades. */
  vipLocked: TweakRecord[]
  /** Already-applied tweaks (not re-applied). */
  alreadyApplied: TweakRecord[]
  /** Skipped — too risky / tournament-breaking / requires admin opt-in. */
  skippedDanger: TweakRecord[]
}

export function TuneNow() {
  const isNative = inTauri()
  const isVip = useIsVip()
  const [phase, setPhase] = useState<Phase>('idle')
  const [spec, setSpec] = useState<SpecProfile | null>(null)
  const [beforeComposite, setBeforeComposite] = useState<number | null>(null)
  const [afterComposite, setAfterComposite] = useState<number | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>('')

  useEffect(() => {
    if (!isNative) return
    listApplied()
      .then((rows) =>
        setAppliedIds(new Set(rows.filter((r) => r.status === 'applied').map((r) => r.tweakId))),
      )
      .catch(() => {})
  }, [isNative])

  const plan = useMemo<PlanBuckets>(
    () => buildPlan(catalog.tweaks, spec, appliedIds, isVip),
    [spec, appliedIds, isVip],
  )

  /** Sum measured-impact composite deltas across a tweak set. Falls back
   * to a heuristic (0.6 per low-risk, 1.1 per mid-risk) for tweaks with
   * no recorded measurement on this rig. */
  const projection = useMemo(() => projectGain(plan.vipLocked), [plan.vipLocked])

  async function startScan() {
    if (!isNative) {
      setError('Tune Now requires the optimizationmaxxing.exe shell.')
      setPhase('error')
      return
    }
    setPhase('scanning')
    setError(null)
    setProgress('Detecting rig…')
    try {
      const detected = await detectSpecs(false)
      setSpec(detected)
      setProgress('Running Asta Bench (before)…')
      const before = score(await runBench())
      setBeforeComposite(before.composite)
      setPhase('ready')
      setProgress('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  async function applyAll() {
    if (plan.applyFree.length === 0) {
      // Nothing to apply — jump straight to the gap CTA so the user sees value.
      setAfterComposite(beforeComposite)
      setPhase('done')
      return
    }
    setPhase('applying')
    setError(null)
    setProgress(`Applying ${plan.applyFree.length} tweaks under one UAC…`)
    try {
      const items: BatchItem[] = []
      for (const t of plan.applyFree) {
        for (const a of t.actions) items.push({ tweakId: t.id, action: a })
      }
      await applyBatch(items)
      const list = await listApplied()
      setAppliedIds(new Set(list.filter((r) => r.status === 'applied').map((r) => r.tweakId)))
      setPhase('measuring')
      setProgress('Settling 4s before re-bench…')
      await new Promise((r) => setTimeout(r, 4000))
      setProgress('Running Asta Bench (after)…')
      const after = score(await runBench())
      setAfterComposite(after.composite)
      setPhase('done')
      setProgress('')
      const delta = beforeComposite != null ? after.composite - beforeComposite : null
      telemetrySendEvent('preset.applied', {
        presetId: '__tune_now__',
        tweakCount: plan.applyFree.length,
        beforeComposite,
        afterComposite: after.composite,
        delta,
        vipLockedCount: plan.vipLocked.length,
        anyVip: false,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-text-subtle">one click</p>
        <h1 className="text-3xl font-bold">Tune now</h1>
        <p className="text-sm text-text-muted max-w-2xl">
          Don't want to wipe Windows or read 90 tweak descriptions? Hit scan. We'll detect your
          rig, measure where you are, apply every safe tweak that matches your hardware, and
          show you exactly what changed. <span className="text-text">Works for any game</span>{' '}
          — the ~70 rig + Windows tweaks compound no matter what title is in the foreground.
        </p>
      </header>

      {phase === 'idle' && (
        <IdleState onStart={startScan} isNative={isNative} />
      )}

      {(phase === 'scanning' || phase === 'applying' || phase === 'measuring') && (
        <ProgressState phase={phase} progress={progress} />
      )}

      {phase === 'ready' && spec && beforeComposite != null && (
        <ReadyState
          spec={spec}
          beforeComposite={beforeComposite}
          plan={plan}
          projection={projection}
          isVip={isVip}
          onApply={applyAll}
        />
      )}

      {phase === 'done' && beforeComposite != null && (
        <DoneState
          beforeComposite={beforeComposite}
          afterComposite={afterComposite ?? beforeComposite}
          plan={plan}
          projection={projection}
          isVip={isVip}
          onRescan={startScan}
        />
      )}

      {phase === 'error' && (
        <section className="surface-card p-5 space-y-3 border-red-500/40">
          <p className="text-sm text-red-300">Tune failed: {error}</p>
          <button
            onClick={() => setPhase('idle')}
            className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-sm font-semibold"
          >
            Try again
          </button>
        </section>
      )}

      <RestorePointStrip />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Phase components
// ────────────────────────────────────────────────────────────────────────

function IdleState({ onStart, isNative }: { onStart: () => void; isNative: boolean }) {
  return (
    <section className="surface-card p-6 md:p-8 space-y-4">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Three steps · ~90 seconds total</h2>
        <ol className="space-y-1.5 text-sm text-text-muted">
          <li>
            <span className="text-accent font-semibold">1.</span> Scan + initial Asta Bench (≈30 s)
          </li>
          <li>
            <span className="text-accent font-semibold">2.</span> Apply every safe tweak that matches your rig — one UAC prompt
          </li>
          <li>
            <span className="text-accent font-semibold">3.</span> Re-bench + see exactly how many composite points you gained, and how many you'd unlock with VIP
          </li>
        </ol>
      </div>
      <button
        onClick={onStart}
        disabled={!isNative}
        className="btn-chrome px-5 py-2.5 rounded-md bg-accent text-bg-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isNative ? 'Start tune →' : 'Requires the desktop app'}
      </button>
      <p className="text-[11px] text-text-subtle">
        Skipped: risk-4 tweaks (CPU mitigations off, etc.) and tournament-breaking tweaks. You
        opt into those individually from{' '}
        <Link to="/tweaks" className="underline hover:text-text">/tweaks</Link>. Every applied
        tweak is one-click reversible from{' '}
        <Link to="/settings" className="underline hover:text-text">Settings</Link>.
      </p>
    </section>
  )
}

function ProgressState({ phase, progress }: { phase: Phase; progress: string }) {
  return (
    <section className="surface-card p-6 space-y-3">
      <p className="text-xs uppercase tracking-widest text-text-subtle">working · {phase}</p>
      <p className="text-base text-text">{progress}</p>
      <div className="h-1 w-full bg-bg-raised rounded overflow-hidden">
        <div className="h-full w-1/3 bg-accent animate-pulse" />
      </div>
    </section>
  )
}

function ReadyState({
  spec,
  beforeComposite,
  plan,
  projection,
  isVip,
  onApply,
}: {
  spec: SpecProfile
  beforeComposite: number
  plan: PlanBuckets
  projection: { vipGainEstimate: number; vipGainRange: [number, number] }
  isVip: boolean
  onApply: () => void
}) {
  return (
    <div className="space-y-4">
      <section className="surface-card p-5 space-y-3">
        <p className="text-xs uppercase tracking-widest text-text-subtle">your rig</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="CPU" value={spec.cpu?.marketing || spec.cpu?.model || 'unknown'} />
          <Stat label="GPU" value={spec.gpu?.model || spec.gpu?.vendor || 'unknown'} />
          <Stat label="RAM" value={spec.ram?.totalGb ? `${spec.ram.totalGb} GB` : 'unknown'} />
          <Stat label="Composite (now)" value={beforeComposite.toFixed(0)} highlight />
        </div>
      </section>

      <section className="surface-card p-5 space-y-3">
        <header>
          <p className="text-xs uppercase tracking-widest text-text-subtle">the plan</p>
          <h2 className="text-xl font-bold">
            {plan.applyFree.length} safe tweaks ready to apply
          </h2>
        </header>
        <ul className="space-y-1.5 text-sm text-text-muted">
          <li>
            <span className="text-emerald-300 font-semibold">{plan.applyFree.length}</span> free tweaks match your rig + are safe-by-default
          </li>
          {plan.alreadyApplied.length > 0 && (
            <li>
              <span className="text-text-subtle">{plan.alreadyApplied.length}</span> already applied (skipped)
            </li>
          )}
          <li>
            <span className="text-amber-300 font-semibold">{plan.skippedDanger.length}</span> risk-4 / tournament-breaking (you opt-in from /tweaks)
          </li>
          {!isVip && (
            <li>
              <span className="text-accent font-semibold">{plan.vipLocked.length}</span> VIP-only — projected{' '}
              <span className="text-accent">+{projection.vipGainRange[0].toFixed(1)} to +{projection.vipGainRange[1].toFixed(1)} composite</span>{' '}
              left on the table
            </li>
          )}
        </ul>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onApply}
            className="btn-chrome px-5 py-2.5 rounded-md bg-accent text-bg-base font-semibold"
          >
            {plan.applyFree.length > 0
              ? `Apply ${plan.applyFree.length} (1 UAC) →`
              : 'Continue to results'}
          </button>
          <Link to="/tweaks" className="text-xs underline text-text-muted hover:text-text">
            See the list first ↗
          </Link>
        </div>
      </section>
    </div>
  )
}

function DoneState({
  beforeComposite,
  afterComposite,
  plan,
  projection,
  isVip,
  onRescan,
}: {
  beforeComposite: number
  afterComposite: number
  plan: PlanBuckets
  projection: { vipGainEstimate: number; vipGainRange: [number, number] }
  isVip: boolean
  onRescan: () => void
}) {
  const delta = afterComposite - beforeComposite
  const sign = delta >= 0 ? '+' : ''
  const deltaColor =
    delta >= 5 ? 'text-emerald-300' : delta >= 0 ? 'text-amber-200' : 'text-red-300'

  return (
    <div className="space-y-4">
      <section className="surface-card p-6 space-y-3">
        <p className="text-xs uppercase tracking-widest text-text-subtle">result</p>
        <div className="grid grid-cols-3 gap-3 items-baseline">
          <BigStat label="before" value={beforeComposite.toFixed(0)} muted />
          <BigStat label="after" value={afterComposite.toFixed(0)} highlight />
          <BigStat label="delta" value={`${sign}${delta.toFixed(1)}`} colorClass={deltaColor} />
        </div>
        <p className="text-sm text-text-muted leading-snug">
          We applied <strong className="text-text">{plan.applyFree.length}</strong> tweaks. Composite
          went from {beforeComposite.toFixed(0)} → {afterComposite.toFixed(0)} ({sign}
          {delta.toFixed(1)}). Every change is reversible — see the strip at the bottom of this
          page.
        </p>
      </section>

      {!isVip && plan.vipLocked.length > 0 && (
        <section
          className="surface-card p-6 space-y-3"
          style={{
            background:
              'linear-gradient(135deg, rgba(201, 31, 55, 0.18) 0%, rgba(20, 8, 12, 0.6) 100%)',
            borderColor: 'rgba(201, 31, 55, 0.5)',
          }}
        >
          <p className="text-xs uppercase tracking-widest text-text-subtle">left on the table</p>
          <h3 className="text-2xl font-bold text-text">
            <span className="text-accent">+{projection.vipGainRange[0].toFixed(1)} to +{projection.vipGainRange[1].toFixed(1)}</span>{' '}
            composite you didn't get
          </h3>
          <p className="text-sm text-text-muted leading-snug">
            <strong className="text-text">{plan.vipLocked.length} VIP-only tweaks</strong> match
            your rig and are safe-by-default. They're in Asta Mode + the curated VIP presets —
            the ones that close the last 30% of the latency gap to a $5K rig. Projection range
            uses your previously-measured per-tweak deltas where available; otherwise the
            community baseline.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              to="/pricing"
              className="btn-chrome px-5 py-2.5 rounded-md bg-accent text-bg-base font-semibold"
            >
              Unlock VIP — $8/mo →
            </Link>
            <Link to="/asta" className="text-xs underline text-text-muted hover:text-text">
              See what Asta Mode does ↗
            </Link>
          </div>
        </section>
      )}

      {isVip && plan.vipLocked.length > 0 && (
        <section className="surface-card p-5 space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-text-subtle">vip · still on the table</p>
          <p className="text-sm text-text-muted">
            <strong className="text-text">{plan.vipLocked.length}</strong> VIP-tier tweaks aren't
            in your applied set. Tune Now applies the safe-by-default subset — the rest live in{' '}
            <Link to="/asta" className="underline hover:text-text">Asta Mode</Link> and require an
            explicit opt-in (some are tournament-flagged or higher-risk).
          </p>
        </section>
      )}

      <section className="surface-card p-5 space-y-2">
        <p className="text-[11px] uppercase tracking-widest text-text-subtle">next moves</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link
            to="/diff"
            className="surface-card p-4 hover:border-border-glow transition block"
          >
            <p className="text-sm font-semibold">See exactly what changed</p>
            <p className="text-xs text-text-muted mt-1 leading-snug">
              /diff lists every applied tweak vs vanilla state. Copy as text to share.
            </p>
          </Link>
          <Link
            to="/benchmark"
            className="surface-card p-4 hover:border-border-glow transition block"
          >
            <p className="text-sm font-semibold">Watch composite over time</p>
            <p className="text-xs text-text-muted mt-1 leading-snug">
              History graph shows the trajectory + linear-regression trend.
            </p>
          </Link>
          <button
            onClick={onRescan}
            className="surface-card p-4 hover:border-border-glow transition text-left"
          >
            <p className="text-sm font-semibold">Re-tune later</p>
            <p className="text-xs text-text-muted mt-1 leading-snug">
              New version of optimizationmaxxing? More tweaks may match your rig — re-run.
            </p>
          </button>
        </div>
      </section>
    </div>
  )
}

function RestorePointStrip() {
  return (
    <section className="surface-card p-4 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-text-subtle">safety</p>
        <p className="text-sm text-text-muted">
          Every applied tweak is reversible. One click → back to vanilla.
        </p>
      </div>
      <Link
        to="/settings"
        className="text-xs px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
      >
        Settings → Restore Point
      </Link>
    </section>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p
        className={`text-sm font-semibold tabular-nums ${highlight ? 'text-accent' : 'text-text'}`}
      >
        {value}
      </p>
    </div>
  )
}

function BigStat({
  label,
  value,
  muted,
  highlight,
  colorClass,
}: {
  label: string
  value: string
  muted?: boolean
  highlight?: boolean
  colorClass?: string
}) {
  const cls = colorClass ?? (highlight ? 'text-accent' : muted ? 'text-text-subtle' : 'text-text')
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className={`text-4xl md:text-5xl font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Planning + projection
// ────────────────────────────────────────────────────────────────────────

function buildPlan(
  all: TweakRecord[],
  spec: SpecProfile | null,
  applied: Set<string>,
  isVip: boolean,
): PlanBuckets {
  const applyFree: TweakRecord[] = []
  const vipLocked: TweakRecord[] = []
  const alreadyApplied: TweakRecord[] = []
  const skippedDanger: TweakRecord[] = []

  for (const t of all) {
    if (applied.has(t.id)) {
      alreadyApplied.push(t)
      continue
    }
    if (!tweakMatchesSpec(t, spec)) continue
    // Skip the dangerous + tournament-breaking by default — user opts in
    // explicitly from /tweaks.
    if (t.riskLevel >= 4) {
      skippedDanger.push(t)
      continue
    }
    if (t.anticheatRisk === 'high') {
      skippedDanger.push(t)
      continue
    }
    if (t.vipGate === 'vip' && !isVip) {
      vipLocked.push(t)
      continue
    }
    applyFree.push(t)
  }
  return { applyFree, vipLocked, alreadyApplied, skippedDanger }
}

function projectGain(vipLocked: TweakRecord[]): {
  vipGainEstimate: number
  vipGainRange: [number, number]
} {
  if (vipLocked.length === 0) {
    return { vipGainEstimate: 0, vipGainRange: [0, 0] }
  }
  const measured = loadImpactStore()
  let measuredSum = 0
  let measuredCount = 0
  let unmeasuredCount = 0
  for (const t of vipLocked) {
    const row = measured[t.id]
    if (row && Number.isFinite(row.delta)) {
      // Cap any single per-tweak measured delta at +5 / -5 — outliers are
      // likely measurement noise (DPC spike, ping anomaly), not signal.
      const capped = Math.max(-5, Math.min(5, row.delta))
      measuredSum += capped
      measuredCount += 1
    } else {
      unmeasuredCount += 1
    }
  }
  // Heuristic for unmeasured: low-risk → +0.4, mid-risk → +0.9. Conservative
  // because users hate over-promised numbers.
  let unmeasuredEstimate = 0
  for (const t of vipLocked) {
    const row = measured[t.id]
    if (row) continue
    unmeasuredEstimate += t.riskLevel <= 2 ? 0.4 : 0.9
  }
  const point = measuredSum + unmeasuredEstimate
  // ±25% range around the point estimate. Honest about uncertainty.
  const low = Math.max(0, point * 0.75)
  const high = point * 1.25
  return { vipGainEstimate: point, vipGainRange: [low, high] }
}
