import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  catalog,
  experimentalWarningFor,
  isExperimentalTweak,
  tweakMatchesSpec,
  type TweakRecord,
} from '../lib/catalog'
import { GAMES, type GameId } from '../lib/games'
import { runBench, score } from '../lib/astaBench'
import { loadImpactStore } from '../lib/benchImpact'
import { useIsVip } from '../store/useVipStore'
import { useRigStore } from '../store/useRigStore'
import {
  applyBatch,
  applyRepairBatch,
  applyTransaction,
  getTunePreflight,
  inTauri,
  listApplied,
  telemetrySendEvent,
  verifyApplied,
  type BatchItem,
  type AppliedTweak,
  type SpecProfile,
  type TransactionReport,
  type TunePreflight,
} from '../lib/tauri'
import { confirmAction } from '../lib/confirm'
import { isTransactionActionEligible } from '../lib/optimizationSession'
import {
  isHardBlockedForAutoTune,
  recommendedTuneProfile,
  tuneProfile,
  type TuneIntensity,
} from '../lib/tuneProfiles'
import { issueTuneTicket, readTuneTicket, type TuneTicket } from '../lib/tuneTicket'
import { TuneTicketModal } from '../components/TuneTicketModal'
import { DetectedRigCard } from '../components/DetectedRigCard'
import { RebootPersistenceCard } from '../components/RebootPersistenceCard'

/**
 * /tune — the lazy-user one-click conversion page.
 *
 * The whole flow on one screen:
 *   1. Scan rig + initial Asta Bench composite
 *   2. Show: "N free tweaks match your rig + M VIP-only worth ~+X composite"
 *   3. ONE Apply button → all matching free tweaks under one UAC
 *   4. Auto re-bench → show before/after delta
 *   5. VIP-gap CTA in context: "You missed Y composite by not being VIP"
 *   6. Restore-Point reassurance — snapshot-backed changes expose a clear revert path
 *
 * Game-agnostic by design — works for any game (even ones we don't have
 * dedicated tweaks for) because the core ~70 rig-level + Windows-level
 * tweaks compound regardless of title.
 *
 * Applies the safe, profile-matching lane automatically. Security-degrading,
 * cosmetic-only, tournament-breaking, and high anti-cheat-risk tweaks remain
 * protected from silent application, but are surfaced below the plan in an
 * explicit review lane so the user can understand and choose them here.
 */

type Phase = 'idle' | 'scanning' | 'ready' | 'applying' | 'measuring' | 'done' | 'error'

interface PlanBuckets {
  /** Tweaks matching the selected profile that are ready to apply. */
  applyFree: TweakRecord[]
  /** VIP tweaks matching this rig — projected composite if user upgrades. */
  vipLocked: TweakRecord[]
  /** Already-applied tweaks (not re-applied). */
  alreadyApplied: TweakRecord[]
  /** Eligible for this rig/context, but require a visible per-tweak decision. */
  skippedDanger: TweakRecord[]
  /** Valid catalog matches outside the selected intensity. */
  skippedByProfile: TweakRecord[]
  /** Catalog rows whose hardware/OS targeting does not match this rig. */
  skippedBySpec: TweakRecord[]
  /** Tagged for a different game context and therefore not part of this run. */
  skippedOtherGame: TweakRecord[]
}

interface VerificationSummary {
  total: number
  verified: number
  mismatch: number
  unknown: number
}

interface RepairSummary {
  attempted: number
  remaining: number
  status?: TransactionReport['status']
  error?: string
}

export function TuneNow() {
  const isNative = inTauri()
  const isVip = useIsVip()
  const spec = useRigStore((state) => state.spec)
  const ensureLoaded = useRigStore((state) => state.ensureLoaded)
  const refreshRig = useRigStore((state) => state.refresh)
  const [phase, setPhase] = useState<Phase>('idle')
  const [beforeComposite, setBeforeComposite] = useState<number | null>(null)
  const [afterComposite, setAfterComposite] = useState<number | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>('')
  const [intensity, setIntensity] = useState<TuneIntensity>('competitive')
  const [targetGame, setTargetGame] = useState<GameId | 'any'>('fortnite')
  const [profileAutoSelected, setProfileAutoSelected] = useState(false)
  const [intensityManuallySelected, setIntensityManuallySelected] = useState(false)
  const [verification, setVerification] = useState<VerificationSummary | null>(null)
  const [repairSummary, setRepairSummary] = useState<RepairSummary | null>(null)
  const [preflight, setPreflight] = useState<TunePreflight | null>(null)
  const [transactionReport, setTransactionReport] = useState<TransactionReport | null>(null)
  const [ticket, setTicket] = useState<TuneTicket | null>(() => readTuneTicket())
  const [showTicket, setShowTicket] = useState(false)
  const [explicitSelectedIds, setExplicitSelectedIds] = useState<Set<string>>(new Set())
  const [explicitApplying, setExplicitApplying] = useState(false)
  const [explicitNotice, setExplicitNotice] = useState<string | null>(null)

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  useEffect(() => {
    if (!spec || profileAutoSelected || intensityManuallySelected) return
    setIntensity(recommendedTuneProfile(spec).profile.id)
    setProfileAutoSelected(true)
  }, [spec, profileAutoSelected])

  useEffect(() => {
    if (!isNative) return
    // A receipt is not proof that the setting is still live. Re-read native
    // state before planning so a Windows Update, driver update, or another
    // optimizer can be repaired on the next tune.
    verifyApplied()
      .catch(() => listApplied())
      .then((rows) => setAppliedIds(appliedTweakIdsReadyForReapply(rows)))
      .catch(() => {})
  }, [isNative])

  const plan = useMemo<PlanBuckets>(
    () => buildPlan(catalog.tweaks, spec, appliedIds, isVip, tuneProfile(intensity), targetGame),
    [spec, appliedIds, isVip, intensity, targetGame],
  )

  useEffect(() => {
    // Intensity/game changes can replace the review list. Do not leave a
    // hidden selection armed for a different plan.
    const available = new Set(plan.skippedDanger.map((tweak) => tweak.id))
    setExplicitSelectedIds((previous) => {
      const next = new Set([...previous].filter((id) => available.has(id)))
      if (next.size === previous.size && [...previous].every((id) => next.has(id))) return previous
      return next
    })
  }, [plan.skippedDanger])

  const recommendation = useMemo(() => recommendedTuneProfile(spec), [spec])
  const profile = tuneProfile(intensity)

  /** Sum measured-impact composite deltas across a tweak set. Falls back
   * to a heuristic (0.6 per low-risk, 1.1 per mid-risk) for tweaks with
   * no recorded measurement on this rig. */
  const projection = useMemo(() => projectGain(plan.vipLocked), [plan.vipLocked])

  async function ensureFirstTuneTicket(show: boolean) {
    if (isVip || !isNative) return
    const existing = readTuneTicket()
    const issued = await issueTuneTicket()
    setTicket(issued)
    if (show && !existing) setShowTicket(true)
  }

  function updateTicket(next: TuneTicket) {
    setTicket(next)
  }

  async function startScan() {
    if (!isNative) {
      setError('Tune Now requires the optimizationmaxxing.exe shell.')
      setPhase('error')
      return
    }
    setPhase('scanning')
    setError(null)
    setTransactionReport(null)
    setVerification(null)
    setRepairSummary(null)
    setExplicitSelectedIds(new Set())
    setExplicitNotice(null)
    setProgress('Detecting rig…')
    try {
      const detected = await refreshRig()
      if (!detected) {
        throw new Error('The native rig scan returned no hardware profile. Open Profile and re-scan before tuning.')
      }
      try {
        setPreflight(await getTunePreflight())
      } catch {
        // Older installed shells may not expose this newer read-only command.
        // Keep the scan usable; the transaction path still verifies/rolls back.
        setPreflight(null)
      }
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
    // Re-read immediately before mutation. A scan can sit open while Windows
    // Update starts, so the scan-time result is only advisory.
    if (isNative) {
      try {
        const latestPreflight = await getTunePreflight()
        setPreflight(latestPreflight)
        if (latestPreflight.blocksAutoApply) {
          setError(latestPreflight.detail)
          setPhase('error')
          return
        }
      } catch {
        // Keep compatibility with an older installed shell; applyTransaction
        // remains the final safety net when the preflight command is absent.
      }
    }
    if (profile.requiresConfirmation && plan.applyFree.length > 0) {
      let confirmed: boolean
      try {
        confirmed = await confirmAction(
          `${profile.label} tune will apply ${plan.applyFree.length} catalog tweaks, including experimental OS/driver settings. It will not change voltage or thermal limits, and tournament-breaking/high anti-cheat-risk items remain excluded. Continue only on a restore-backed test install?`,
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('error')
        return
      }
      if (!confirmed) return
    }
    if (plan.applyFree.length === 0) {
      // Nothing to apply — jump straight to the gap CTA so the user sees value.
      setAfterComposite(beforeComposite)
      try {
        const live = await verifyApplied()
        setVerification(summarizeVerification(live))
      } catch {
        setVerification(null)
      }
      await ensureFirstTuneTicket(true)
      setPhase('done')
      return
    }
    setPhase('applying')
    setError(null)
    setTransactionReport(null)
    setRepairSummary(null)
    setProgress(`Applying and verifying ${plan.applyFree.length} tweaks under one UAC…`)
    const selectedIds = new Set(plan.applyFree.map((t) => t.id))
    try {
      const items: BatchItem[] = []
      for (const t of plan.applyFree) {
        for (const a of t.actions) items.push({ tweakId: t.id, action: a })
      }
      // Use independent per-tweak repair semantics for the automatic lane.
      // One externally-owned or race-prone row must not undo unrelated rows
      // that applied and verified successfully.
      const report = await applyRepairBatch(items)
      setTransactionReport(report)
      let live = await verifyApplied()
      setVerification(
        summarizeVerification(live.filter((row) => selectedIds.has(row.tweakId))),
      )
      setAppliedIds(appliedTweakIdsReadyForReapply(live))
      if (report.status !== 'committed' && report.status !== 'partial') {
        const details = [...report.errors, ...report.rollbackErrors].join(' ')
        const outcome =
          report.status === 'rolled_back'
            ? 'The automatic tune was rolled back because live verification did not pass.'
            : `The automatic tune did not commit safely (${report.status}).`
        setError(`${outcome}${details ? ` ${details}` : ''}`)
        setPhase('error')
        setProgress('')
        return
      }

      // A successful transaction should already be verified, but Windows or a
      // vendor utility can race the final read-back. Repair only the safe,
      // transaction-capable subset, and only once per explicit Tune Now click.
      // Unknown/script-only actions stay visible for manual review instead of
      // becoming an invisible retry loop.
      const driftedIds = mismatchedTweakIds(live, selectedIds)
      if (driftedIds.size > 0) {
        setProgress(`Repairing ${driftedIds.size} drifted tweak${driftedIds.size === 1 ? '' : 's'} once…`)
        const repairItems: BatchItem[] = []
        for (const tweak of plan.applyFree) {
          if (!driftedIds.has(tweak.id)) continue
          for (const action of tweak.actions) {
            if (isTransactionActionEligible(action)) repairItems.push({ tweakId: tweak.id, action })
          }
        }
        if (repairItems.length > 0) {
          try {
            const repairReport = await applyRepairBatch(repairItems)
            live = await verifyApplied()
            const remaining = mismatchedTweakIds(live, selectedIds)
            setRepairSummary({
              attempted: driftedIds.size,
              remaining: remaining.size,
              status: repairReport.status,
              error:
                repairReport.status === 'committed'
                  ? undefined
                  : [...repairReport.errors, ...repairReport.rollbackErrors].join(' '),
            })
          } catch (repairError) {
            setRepairSummary({
              attempted: driftedIds.size,
              remaining: driftedIds.size,
              error: repairError instanceof Error ? repairError.message : String(repairError),
            })
          }
          setVerification(summarizeVerification(live.filter((row) => selectedIds.has(row.tweakId))))
          setAppliedIds(appliedTweakIdsReadyForReapply(live))
        } else {
          setRepairSummary({
            attempted: 0,
            remaining: driftedIds.size,
            error: 'The drifted actions do not expose a safe native repair contract.',
          })
        }
      }
      setPhase('measuring')
      setProgress('Settling 4s before re-bench…')
      await new Promise((r) => setTimeout(r, 4000))
      setProgress('Running Asta Bench (after)…')
      const after = score(await runBench())
      setAfterComposite(after.composite)
      setPhase('done')
      setProgress('')
      await ensureFirstTuneTicket(true)
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
      // Refresh the durable state here so the error screen does not leave the
      // next scan planning from stale receipts.
      try {
        const live = await verifyApplied()
        setVerification(
          summarizeVerification(live.filter((row) => selectedIds.has(row.tweakId))),
        )
        setAppliedIds(appliedTweakIdsReadyForReapply(live))
      } catch {
        // The original apply error is more useful than hiding it behind a
        // second verification failure.
      }
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  async function applyExplicitSelected() {
    const selected = plan.skippedDanger.filter((tweak) => explicitSelectedIds.has(tweak.id))
    if (selected.length === 0) {
      setExplicitNotice('Select at least one review row first. Nothing was changed.')
      return
    }
    if (!isNative) {
      setExplicitNotice('The explicit review lane requires the desktop app shell.')
      return
    }

    // The same Windows-update stability gate applies to the review lane. A
    // deliberate choice does not make a concurrent servicing operation safe.
    try {
      const latestPreflight = await getTunePreflight()
      setPreflight(latestPreflight)
      if (latestPreflight.blocksAutoApply) {
        setExplicitNotice(`Review apply is paused: ${latestPreflight.detail}`)
        return
      }
    } catch {
      // Older installed shells may not expose this read-only command. The
      // native apply/read-back path remains the compatibility fallback.
    }

    let confirmed = false
    try {
      confirmed = await confirmAction(
        `You selected ${selected.length} explicit-review tweak${selected.length === 1 ? '' : 's'}. Some may weaken Windows security, change boot/update behavior, affect compatibility or anti-cheat eligibility, or lack deterministic read-back. Tune Now will show the result and keep the normal revert path where one exists. Continue only after reading each selected row?`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
      return
    }
    if (!confirmed) return

    setExplicitApplying(true)
    setExplicitNotice(null)
    setError(null)
    setTransactionReport(null)
    setProgress(`Applying ${selected.length} explicitly selected tweak${selected.length === 1 ? '' : 's'}…`)
    const selectedIds = new Set(selected.map((tweak) => tweak.id))

    try {
      const transactional: BatchItem[] = []
      const explicit: BatchItem[] = []
      for (const tweak of selected) {
        for (const action of tweak.actions) {
          const item = { tweakId: tweak.id, action }
          if (isTransactionActionEligible(action)) transactional.push(item)
          else explicit.push(item)
        }
      }

      let requestedActions = 0
      if (transactional.length > 0) {
        const report = await applyTransaction(transactional)
        setTransactionReport(report)
        requestedActions += transactional.length
        if (report.status !== 'committed') {
          const detail = [...report.errors, ...report.rollbackErrors].join(' ')
          throw new Error(`The verified review lane ${report.status}.${detail ? ` ${detail}` : ''}`)
        }
      }
      if (explicit.length > 0) {
        const receipts = await applyBatch(explicit)
        requestedActions += receipts.length
      }

      const live = await verifyApplied()
      const selectedLive = live.filter((row) => selectedIds.has(row.tweakId))
      setVerification(summarizeVerification(selectedLive))
      setAppliedIds(appliedTweakIdsReadyForReapply(live))
      const verified = selectedLive.filter((row) => row.verificationStatus === 'verified').length
      const mismatch = selectedLive.filter((row) => row.verificationStatus === 'mismatch').length
      const unknown = selectedLive.filter((row) => row.verificationStatus === 'unknown').length
      const readback =
        mismatch > 0 || unknown > 0
          ? `${mismatch} mismatch and ${unknown} unknown; inspect Diff/Settings before relying on them.`
          : 'Every selected action returned a verified read-back.'
      setExplicitNotice(
        `Review lane applied ${selected.length} tweak${selected.length === 1 ? '' : 's'} (${requestedActions} action${requestedActions === 1 ? '' : 's'}): ${verified} verified. ${readback}`,
      )
      setExplicitSelectedIds(new Set())
      telemetrySendEvent('tweak.applied', {
        tweakId: '__tune_now_explicit_review__',
        tweakCount: selected.length,
        actionCount: requestedActions,
        verified,
        mismatch,
        unknown,
      })
    } catch (e) {
      // Keep the next plan grounded in live state even if a mixed review batch
      // partially applied before the native engine reported an error.
      try {
        const live = await verifyApplied()
        setVerification(summarizeVerification(live.filter((row) => selectedIds.has(row.tweakId))))
        setAppliedIds(appliedTweakIdsReadyForReapply(live))
      } catch {
        // Preserve the original apply error when the follow-up read-back also fails.
      }
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    } finally {
      setExplicitApplying(false)
      setProgress('')
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-text-subtle">one click</p>
        <h1 className="text-3xl font-bold">Tune now</h1>
        <p className="text-sm text-text-muted max-w-2xl">
          Don't want to wipe Windows or read 90 tweak descriptions? Hit scan. We'll detect your
          rig, measure where you are, apply every eligible catalog tweak that matches your hardware, and
          show you what changed. <span className="text-text">Works for any game</span>{' '}
          — the rig + Windows levers are measured on your machine instead of sold as a universal FPS promise.
        </p>
      </header>

      <DetectedRigCard compact />

      {phase === 'idle' && (
        <IdleState
          onStart={startScan}
          isNative={isNative}
          intensity={intensity}
          targetGame={targetGame}
          recommendedId={recommendation.profile.id}
          recommendationReason={recommendation.reason}
          onIntensityChange={(next) => {
            setIntensityManuallySelected(true)
            setProfileAutoSelected(true)
            setIntensity(next)
          }}
          onTargetGameChange={setTargetGame}
        />
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
          intensity={intensity}
          targetGame={targetGame}
          profile={profile}
          recommendedId={recommendation.profile.id}
          recommendationReason={recommendation.reason}
          preflight={preflight}
          onIntensityChange={(next) => {
            setIntensityManuallySelected(true)
            setProfileAutoSelected(true)
            setIntensity(next)
            setVerification(null)
            setRepairSummary(null)
            setExplicitSelectedIds(new Set())
            setExplicitNotice(null)
          }}
          onTargetGameChange={(next) => {
            setTargetGame(next)
            setVerification(null)
            setExplicitSelectedIds(new Set())
            setExplicitNotice(null)
          }}
          onApply={applyAll}
          explicitSelectedIds={explicitSelectedIds}
          explicitApplying={explicitApplying}
          explicitNotice={explicitNotice}
          onToggleExplicit={(id) => {
            setExplicitSelectedIds((previous) => {
              const next = new Set(previous)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          onSelectAllExplicit={() => setExplicitSelectedIds(new Set(plan.skippedDanger.map((tweak) => tweak.id)))}
          onClearExplicit={() => setExplicitSelectedIds(new Set())}
          onApplyExplicit={applyExplicitSelected}
        />
      )}

      {phase === 'done' && beforeComposite != null && (
        <DoneState
          beforeComposite={beforeComposite}
          afterComposite={afterComposite ?? beforeComposite}
          plan={plan}
          projection={projection}
          isVip={isVip}
          intensity={intensity}
          targetGame={targetGame}
          verification={verification}
          repairSummary={repairSummary}
          transactionReport={transactionReport}
          ticket={ticket}
          onShowTicket={() => setShowTicket(true)}
          onRescan={startScan}
        />
      )}

      {phase === 'error' && (
        <section className="surface-card p-5 space-y-3 border-red-500/40">
          <p className="text-sm text-red-300">Tune failed: {error}</p>
          {transactionReport && (
            <p className="text-xs text-text-muted">
              Transaction {transactionReport.status}: {transactionReport.verifiedCount}/
              {transactionReport.itemCount} actions verified; {transactionReport.rolledBackCount}{' '}
              rolled back.
              {transactionReport.rollbackErrors.length > 0 && (
                <span className="block text-red-200 mt-1">
                  Rollback needs attention: {transactionReport.rollbackErrors.join(' · ')}
                </span>
              )}
            </p>
          )}
          <button
            onClick={() => setPhase('idle')}
            className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-sm font-semibold"
          >
            Try again
          </button>
        </section>
      )}

      <RestorePointStrip />
      <TuneTicketModal
        ticket={ticket}
        open={showTicket}
        onClose={() => setShowTicket(false)}
        onTicketChange={updateTicket}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Phase components
// ────────────────────────────────────────────────────────────────────────

function IdleState({
  onStart,
  isNative,
  intensity,
  targetGame,
  recommendedId,
  recommendationReason,
  onIntensityChange,
  onTargetGameChange,
}: {
  onStart: () => void
  isNative: boolean
  intensity: TuneIntensity
  targetGame: GameId | 'any'
  recommendedId: TuneIntensity
  recommendationReason: string
  onIntensityChange: (next: TuneIntensity) => void
  onTargetGameChange: (next: GameId | 'any') => void
}) {
  const options: TuneIntensity[] = ['light', 'competitive', 'aggressive', 'extreme']
  const profile = tuneProfile(intensity)
  return (
    <section className="surface-card p-6 md:p-8 space-y-4">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Choose the lane first · then scan</h2>
        <p className="text-sm text-text-muted">
          Your choice is saved for this run and is visible before any scan or system action starts.
          Scanning only detects the rig and measures a baseline; it does not apply tweaks.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
          {options.map((id) => {
            const option = tuneProfile(id)
            const selected = id === intensity
            return (
              <button
                key={id}
                onClick={() => onIntensityChange(id)}
                className={`rounded-md border p-3 text-left transition ${
                  selected ? 'border-accent bg-accent/10' : 'border-border hover:border-border-glow'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{option.label}</span>
                  {id === recommendedId && <span className="text-[10px] uppercase tracking-wider text-emerald-300">recommended</span>}
                </div>
                <p className="text-xs text-text-muted mt-1 leading-snug">{option.summary}</p>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-text-subtle">{recommendationReason}</p>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,18rem)_1fr] gap-3 items-end">
          <label className="text-xs text-text-muted">
            <span className="block mb-1 uppercase tracking-wider text-text-subtle">game context</span>
            <select
              value={targetGame}
              onChange={(event) => onTargetGameChange(event.target.value as GameId | 'any')}
              className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text"
            >
              <option value="fortnite">🎯 Fortnite</option>
              {GAMES.filter((game) => game.id !== 'fortnite').map((game) => (
                <option key={game.id} value={game.id}>{game.glyph} {game.label}</option>
              ))}
              <option value="any">Windows baseline only</option>
            </select>
          </label>
          <p className="text-xs text-text-subtle leading-snug">
            {profile.label} applies only eligible catalog rows for this rig and context. Game-tagged
            rows for another title stay out of the run.
          </p>
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-1.5">
        <p className="text-sm font-semibold text-text">Three steps · about 90 seconds</p>
        <ol className="space-y-1.5 text-sm text-text-muted">
          <li>
            <span className="text-accent font-semibold">1.</span> Scan + initial Asta Bench (≈30 s)
          </li>
          <li>
            <span className="text-accent font-semibold">2.</span> Review the exact eligible count and confirmation gates
          </li>
          <li>
            <span className="text-accent font-semibold">3.</span> Apply once, verify, and re-bench
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
        Tournament-breaking, high anti-cheat-risk, and other explicit-review actions are never
        silently applied. The scan shows those rows below with a short explanation and an opt-in
        button. You can inspect every catalog item from{' '}
        <Link to="/tweaks" className="underline hover:text-text">/tweaks</Link>. Every applied
        changes with a recorded inverse are one-click reversible from{' '}
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
  intensity,
  profile,
  recommendedId,
  recommendationReason,
  targetGame,
  onIntensityChange,
  onTargetGameChange,
  preflight,
  onApply,
  explicitSelectedIds,
  explicitApplying,
  explicitNotice,
  onToggleExplicit,
  onSelectAllExplicit,
  onClearExplicit,
  onApplyExplicit,
}: {
  spec: SpecProfile
  beforeComposite: number
  plan: PlanBuckets
  projection: { vipGainEstimate: number; vipGainRange: [number, number] }
  isVip: boolean
  intensity: TuneIntensity
  profile: ReturnType<typeof tuneProfile>
  recommendedId: TuneIntensity
  recommendationReason: string
  targetGame: GameId | 'any'
  onIntensityChange: (next: TuneIntensity) => void
  onTargetGameChange: (next: GameId | 'any') => void
  preflight: TunePreflight | null
  onApply: () => void
  explicitSelectedIds: Set<string>
  explicitApplying: boolean
  explicitNotice: string | null
  onToggleExplicit: (id: string) => void
  onSelectAllExplicit: () => void
  onClearExplicit: () => void
  onApplyExplicit: () => void
}) {
  const options: TuneIntensity[] = ['light', 'competitive', 'aggressive', 'extreme']
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
          <p className="text-xs uppercase tracking-widest text-text-subtle">tune intensity</p>
          <h2 className="text-xl font-bold">Choose how far the scan is allowed to go</h2>
          <p className="text-sm text-text-muted">{profile.summary}</p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {options.map((id) => {
            const option = tuneProfile(id)
            const selected = id === intensity
            return (
              <button
                key={id}
                onClick={() => onIntensityChange(id)}
                className={`rounded-md border p-3 text-left transition ${
                  selected
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-border-glow'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{option.label}</span>
                  {id === recommendedId && (
                    <span className="text-[10px] uppercase tracking-wider text-emerald-300">recommended</span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1 leading-snug">{option.summary}</p>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-text-subtle">{recommendationReason}</p>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,18rem)_1fr] gap-3 items-end">
          <label className="text-xs text-text-muted">
            <span className="block mb-1 uppercase tracking-wider text-text-subtle">game context</span>
            <select
              value={targetGame}
              onChange={(event) => onTargetGameChange(event.target.value as GameId | 'any')}
              className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text"
            >
              <option value="fortnite">🎯 Fortnite</option>
              {GAMES.filter((game) => game.id !== 'fortnite').map((game) => (
                <option key={game.id} value={game.id}>
                  {game.glyph} {game.label}
                </option>
              ))}
              <option value="any">Windows baseline only</option>
            </select>
          </label>
          <p className="text-xs text-text-subtle leading-snug">
            Windows baseline tweaks are always eligible. Game-tagged config and priority tweaks are
            included only for the selected context, so a Fortnite file cannot be applied during a
            Valorant or baseline-only run.
          </p>
        </div>
        {profile.requiresConfirmation && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            Experimental settings are opt-in and may trade security, compatibility, battery life, or
            exact restore behavior for a possible latency change. Extreme does not disable voltage or
            thermal safeguards, and tournament-breaking/high anti-cheat-risk items stay excluded.
          </p>
        )}
        {preflight?.blocksAutoApply && (
          <p className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-100">
            <strong className="text-red-200">Windows stability gate:</strong> {preflight.detail}{' '}
            This is intentional: applying while an update is writing can make a successful command
            look like a tweak that did not stick.
          </p>
        )}
        {preflight?.pendingReboot && !preflight.windowsUpdateActive && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            <strong className="text-amber-200">Pending Windows restart:</strong> Tune Now can apply.
            Restart before checking reboot persistence so Windows can finish the pending update.
          </p>
        )}
      </section>

      <section className="surface-card p-5 space-y-3">
        <header>
          <p className="text-xs uppercase tracking-widest text-text-subtle">the plan</p>
          <h2 className="text-xl font-bold">
            {plan.applyFree.length} {profile.label.toLowerCase()} tweaks ready to apply
          </h2>
          <p className="text-xs text-text-subtle mt-1">
            {catalog.tweaks.length} catalog entries were evaluated. Only entries that match this
            rig, game context, profile, and safety policy are included in the automatic run.
          </p>
        </header>
        <ul className="space-y-1.5 text-sm text-text-muted">
          <li>
            <span className="text-emerald-300 font-semibold">{plan.applyFree.length}</span> eligible tweaks match your rig and profile
          </li>
          {plan.alreadyApplied.length > 0 && (
            <li>
              <span className="text-text-subtle">{plan.alreadyApplied.length}</span> already applied (skipped)
            </li>
          )}
          <li>
            <span className="text-amber-300 font-semibold">{plan.skippedDanger.length}</span> require explicit review — shown below with an explanation instead of being silently skipped
          </li>
          {plan.skippedByProfile.length > 0 && (
            <li>
              <span className="text-text-subtle font-semibold">{plan.skippedByProfile.length}</span> outside this profile's risk allowance
            </li>
          )}
          {plan.skippedBySpec.length > 0 && (
            <li>
              <span className="text-text-subtle font-semibold">{plan.skippedBySpec.length}</span> target a different CPU, GPU, Windows build, RAM tier, or form factor
            </li>
          )}
          {plan.skippedOtherGame.length > 0 && (
            <li>
              <span className="text-text-subtle font-semibold">{plan.skippedOtherGame.length}</span> game-specific tweaks are outside this context
            </li>
          )}
          {plan.vipLocked.length > 0 && (
            <li>
              <span className="text-accent font-semibold">{plan.vipLocked.length}</span>{' '}
              {isVip ? 'outside the automatic VIP lane' : 'VIP/profile-gated'} — projected{' '}
              <span className="text-accent">+{projection.vipGainRange[0].toFixed(1)} to +{projection.vipGainRange[1].toFixed(1)} composite</span>
            </li>
          )}
        </ul>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onApply}
            disabled={Boolean(preflight?.blocksAutoApply && plan.applyFree.length > 0)}
            className="btn-chrome px-5 py-2.5 rounded-md bg-accent text-bg-base font-semibold"
          >
            {preflight?.blocksAutoApply && plan.applyFree.length > 0
              ? 'Finish Windows Update, then re-scan'
              : plan.applyFree.length > 0
              ? `Apply ${plan.applyFree.length} at ${profile.label} (1 UAC) →`
              : 'Continue to results'}
          </button>
          <Link to="/tweaks" className="text-xs underline text-text-muted hover:text-text">
            See the list first ↗
          </Link>
        </div>
      </section>

      {plan.skippedDanger.length > 0 && (
        <ExplicitReviewSection
          tweaks={plan.skippedDanger}
          selectedIds={explicitSelectedIds}
          applying={explicitApplying}
          notice={explicitNotice}
          blocked={Boolean(preflight?.blocksAutoApply)}
          onToggle={onToggleExplicit}
          onSelectAll={onSelectAllExplicit}
          onClear={onClearExplicit}
          onApply={onApplyExplicit}
        />
      )}
      {explicitNotice && plan.skippedDanger.length === 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100 leading-relaxed">
          {explicitNotice}
        </p>
      )}
    </div>
  )
}

function ExplicitReviewSection({
  tweaks,
  selectedIds,
  applying,
  notice,
  blocked,
  onToggle,
  onSelectAll,
  onClear,
  onApply,
}: {
  tweaks: TweakRecord[]
  selectedIds: Set<string>
  applying: boolean
  notice: string | null
  blocked: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
  onApply: () => void
}) {
  const selectedCount = tweaks.filter((tweak) => selectedIds.has(tweak.id)).length
  return (
    <section className="surface-card p-5 space-y-4 border-amber-500/40">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-amber-300">explicit review lane</p>
        <h2 className="text-xl font-bold">{tweaks.length} eligible rows need your decision</h2>
        <p className="text-sm text-text-muted leading-relaxed">
          These are applicable to this rig and game context, but Tune Now will not change them
          silently. Select only the rows whose tradeoff you understand. Some security, boot,
          update, compatibility, anti-cheat, or read-back risks cannot be made safe by putting them
          behind a bigger preset.
        </p>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onSelectAll}
          disabled={applying || blocked}
          className="btn-chrome px-3 py-1.5 rounded-md border border-amber-500/50 text-amber-100 text-xs font-semibold disabled:opacity-50"
        >
          Select all review rows
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={applying || selectedCount === 0}
          className="btn-chrome px-3 py-1.5 rounded-md border border-border text-text-muted text-xs disabled:opacity-50"
        >
          Clear selection
        </button>
        <span className="text-xs text-text-subtle">{selectedCount} selected</span>
      </div>

      <div className="space-y-2">
        {tweaks.map((tweak) => {
          const checked = selectedIds.has(tweak.id)
          const warning = explicitReviewReason(tweak)
          return (
            <label
              key={tweak.id}
              className={`block rounded-md border p-3 cursor-pointer transition ${
                checked
                  ? 'border-amber-400/70 bg-amber-500/10'
                  : 'border-border hover:border-amber-500/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(tweak.id)}
                  disabled={applying || blocked}
                  className="mt-1 accent-amber-400"
                />
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-text">{tweak.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-amber-200 border border-amber-500/40 rounded px-1.5 py-0.5">
                      risk {tweak.riskLevel}
                    </span>
                    {isExperimentalTweak(tweak) && (
                      <span className="text-[10px] uppercase tracking-wider text-red-200 border border-red-500/40 rounded px-1.5 py-0.5">
                        experimental
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-muted leading-snug">{tweak.description}</p>
                  <p className="text-xs text-amber-100/90 leading-snug">
                    <strong>Why review:</strong> {warning}
                  </p>
                  {tweak.expectedImpact && (
                    <p className="text-xs text-text-subtle leading-snug">
                      <strong className="text-text-muted">Tradeoff:</strong> {tweak.expectedImpact}
                    </p>
                  )}
                  {isExperimentalTweak(tweak) && (
                    <p className="text-xs text-text-subtle leading-snug">
                      {experimentalWarningFor(tweak)}
                    </p>
                  )}
                  <p className="text-[11px] text-text-subtle">
                    {tweak.actions.length} action{tweak.actions.length === 1 ? '' : 's'} ·{' '}
                    {tweak.rebootRequired === 'none' ? 'no reboot tagged' : `${tweak.rebootRequired} may be required`} ·{' '}
                    {tweak.anticheatRisk === 'none' ? 'no documented anti-cheat interaction' : `${tweak.anticheatRisk} anti-cheat interaction`}
                  </p>
                </div>
              </div>
            </label>
          )
        })}
      </div>

      {notice && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100 leading-relaxed">
          {notice}
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onApply}
          disabled={applying || blocked || selectedCount === 0}
          className="btn-chrome px-5 py-2.5 rounded-md bg-amber-400 text-bg-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {blocked
            ? 'Finish Windows Update, then re-scan'
            : applying
            ? 'Applying selected review rows…'
            : selectedCount > 0
            ? `Apply ${selectedCount} selected with review (UAC) →`
            : 'Select rows to apply'}
        </button>
        <Link to="/diff" className="text-xs underline text-text-muted hover:text-text">
          Review active state / revert path ↗
        </Link>
      </div>
    </section>
  )
}

function DoneState({
  beforeComposite,
  afterComposite,
  plan,
  projection,
  isVip,
  intensity,
  targetGame,
  verification,
  repairSummary,
  transactionReport,
  ticket,
  onShowTicket,
  onRescan,
}: {
  beforeComposite: number
  afterComposite: number
  plan: PlanBuckets
  projection: { vipGainEstimate: number; vipGainRange: [number, number] }
  isVip: boolean
  intensity: TuneIntensity
  targetGame: GameId | 'any'
  verification: VerificationSummary | null
  repairSummary: RepairSummary | null
  transactionReport: TransactionReport | null
  ticket: TuneTicket | null
  onShowTicket: () => void
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
          {delta.toFixed(1)}). Snapshot-backed changes can be reverted from the strip below; the
          <strong className="text-text">{tuneProfile(intensity).label}</strong> profile was selected.
          {' '}Context: <strong className="text-text">{gameContextLabel(targetGame)}</strong>.
        </p>
      </section>

      {verification && (
        <section className="surface-card p-5 space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-text-subtle">live state check</p>
          <p className="text-sm text-text-muted">
            {verification.verified} verified · {verification.mismatch} mismatch · {verification.unknown} unknown
            {' '}of {verification.total} applied actions. A mismatch means the live value differs
            from the recorded target. This check cannot tell whether a later change or the
            original apply caused that difference. It is not counted as a successful tune.
          </p>
        </section>
      )}

      {repairSummary && (
        <section className={`surface-card p-5 space-y-2 ${repairSummary.remaining === 0 ? 'border-emerald-500/40' : 'border-amber-500/40'}`}>
          <p className="text-[11px] uppercase tracking-widest text-text-subtle">persistence guard</p>
          <p className="text-sm text-text-muted">
            Tune Now made one bounded repair attempt for {repairSummary.attempted} drifted tweak{repairSummary.attempted === 1 ? '' : 's'} immediately after verification.
            {repairSummary.remaining === 0
              ? ' The repaired rows now match the requested state.'
              : ` ${repairSummary.remaining} still need${repairSummary.remaining === 1 ? 's' : ''} attention in Your Tune.`}
          </p>
          {repairSummary.error && <p className="text-xs text-amber-200">{repairSummary.error}</p>}
          <p className="text-[11px] text-text-subtle">
            This protects against a race during this run; it cannot prevent Windows Update, a driver
            utility, or a later manual setting from changing Windows again.
          </p>
        </section>
      )}

      {transactionReport && (
        <section className="surface-card p-5 space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-text-subtle">apply integrity</p>
          <p className="text-sm text-text-muted">
            Transaction <strong className="text-text">{transactionReport.status}</strong> ·{' '}
            {transactionReport.verifiedCount}/{transactionReport.itemCount} actions verified ·{' '}
            {transactionReport.rolledBackCount} rolled back on failure.
          </p>
        </section>
      )}

      <RebootPersistenceCard />

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
            your rig and are in the lower-risk VIP lane. They're in Asta Mode + the curated VIP presets.
            Projection range
            uses your previously-measured per-tweak deltas where available; otherwise the
            community baseline.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {ticket && (
              <button
                onClick={onShowTicket}
                className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:border-amber-400"
              >
                Open your {ticket.rarity} VIP offer · ${ticket.price}
              </button>
            )}
            <Link
              to="/pricing"
              className="btn-chrome px-5 py-2.5 rounded-md bg-accent text-bg-base font-semibold"
            >
              See lifetime VIP — $115 →
            </Link>
            <Link to="/asta" className="text-xs underline text-text-muted hover:text-text">
              See what Asta Mode does ↗
            </Link>
          </div>
        </section>
      )}

      {!isVip && ticket && plan.vipLocked.length === 0 && (
        <section className="surface-card p-5 flex items-center justify-between gap-3 flex-wrap border-amber-500/40">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-text-subtle">your first-time offer</p>
            <p className="text-sm text-text-muted">
              Your {ticket.rarity} VIP offer is available at ${ticket.price} for three days. Decide later
              or link Discord if you want to use it.
            </p>
          </div>
          <button
            onClick={onShowTicket}
            className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:border-amber-400"
          >
            Open offer
          </button>
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
              "Your Tune" lists every applied tweak with its current state — still in place, drifted
              from target, or not safely re-readable. Copy as text to share in Discord.
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
          Snapshot-backed changes can be reverted. If a script has a special recovery path, the
          catalog names it before you apply it.
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
  profile: ReturnType<typeof tuneProfile>,
  targetGame: GameId | 'any',
): PlanBuckets {
  const applyFree: TweakRecord[] = []
  const vipLocked: TweakRecord[] = []
  const alreadyApplied: TweakRecord[] = []
  const skippedDanger: TweakRecord[] = []
  const skippedByProfile: TweakRecord[] = []
  const skippedBySpec: TweakRecord[] = []
  const skippedOtherGame: TweakRecord[] = []

  for (const t of all) {
    if (!tweakMatchesSpec(t, spec)) {
      skippedBySpec.push(t)
      continue
    }
    if (!tweakMatchesGame(t, targetGame)) {
      skippedOtherGame.push(t)
      continue
    }
    if (applied.has(t.id)) {
      alreadyApplied.push(t)
      continue
    }
    // Keep the existing VIP gate authoritative even when a row also needs
    // explicit review. Otherwise a hard-blocked VIP row could accidentally
    // bypass the normal entitlement check through the review lane.
    if ((profile.vipRequired || t.vipGate === 'vip') && !isVip) {
      vipLocked.push(t)
      continue
    }
    // Security-degrading, cosmetic-only, tournament-breaking, high
    // anti-cheat-risk, and script-only actions without a native read-back
    // contract are never part of automatic Tune Now, including Extreme. They
    // remain visible in the explicit lane with a reason and opt-in control.
    if (isHardBlockedForAutoTune(t)) {
      skippedDanger.push(t)
      continue
    }
    if (
      t.riskLevel > profile.maxRisk ||
      (isExperimentalTweak(t) && !profile.includeExperimental)
    ) {
      skippedByProfile.push(t)
      continue
    }
    applyFree.push(t)
  }
  return { applyFree, vipLocked, alreadyApplied, skippedDanger, skippedByProfile, skippedBySpec, skippedOtherGame }
}

function tweakMatchesGame(tweak: TweakRecord, targetGame: GameId | 'any'): boolean {
  const tagged = tweak.applicableGames && tweak.applicableGames.length > 0
  if (!tagged) return true
  return targetGame !== 'any' && tweak.applicableGames!.includes(targetGame)
}

/** Keep the review lane useful without making users open every row in /tweaks. */
function explicitReviewReason(tweak: TweakRecord): string {
  const id = tweak.id.toLowerCase()
  const actionKinds = new Set(tweak.actions.map((action) => action.kind))
  const hasUnreadableScript = tweak.actions.some(
    (action) => action.kind === 'powershell_script' && (!action.verify || !action.revert),
  )

  if (id.includes('mitigation') || id.includes('hvci') || id.includes('smartscreen')) {
    return 'Reduces a Windows security boundary or mitigation. The possible latency upside is hardware-dependent and the security cost is real.'
  }
  if (id === 'network.tcp.ack-nodelay') {
    return 'TCP-only and reboot-tagged: Fortnite gameplay uses UDP, so this cannot lower in-match ping. Keep it out of the automatic batch; select it only if you specifically want to test launcher, login, download, browser, or other TCP traffic.'
  }
  if (id.includes('hypervisor') || actionKinds.has('bcdedit_set') || id.startsWith('bcd.')) {
    return 'Changes boot or virtualization policy. It may affect drivers, security features, or boot behavior and normally needs a restart.'
  }
  if (id.includes('windows-update') || id.includes('delivery-optimization') || id.includes('microsoft-store')) {
    return 'Changes Windows servicing or Store behavior. It can reduce background activity, but it can also delay updates or break app maintenance.'
  }
  if (id.includes('search') || id.includes('spotlight') || id.includes('background-apps') || id.includes('sysmain')) {
    return 'Changes a Windows background feature. The benefit depends on whether that feature is contending with your game; the usability tradeoff is intentional.'
  }
  if (tweak.tournamentCompliance && Object.values(tweak.tournamentCompliance).some((value) => value === 'breaks')) {
    return 'The catalog marks this as tournament-breaking for at least one supported game. Keep it off any competitive install unless you have checked the current rules.'
  }
  if (tweak.anticheatRisk === 'high') {
    return 'The catalog marks this as high anti-cheat risk. Test only outside ranked/tournament play and review the current game rules first.'
  }
  if (hasUnreadableScript) {
    return 'The native engine cannot prove or fully reverse at least one command. The live result must be checked manually after applying.'
  }
  if (actionKinds.has('file_write')) {
    return 'Writes a game or system configuration file. The game may overwrite it, and the final result should be checked in-game.'
  }
  if (isExperimentalTweak(tweak)) {
    return 'Marked experimental because the result is configuration-dependent or carries a compatibility, power, or restore tradeoff.'
  }
  return 'Tune Now requires a deliberate choice because this row is not covered by the safe automatic read-back policy.'
}

function gameContextLabel(targetGame: GameId | 'any'): string {
  if (targetGame === 'any') return 'Windows baseline'
  return GAMES.find((game) => game.id === targetGame)?.label ?? targetGame
}

function summarizeVerification(
  rows: Array<{ verificationStatus?: string }>,
): VerificationSummary {
  const verified = rows.filter((r) => r.verificationStatus === 'verified').length
  const mismatch = rows.filter((r) => r.verificationStatus === 'mismatch').length
  const unknown = rows.filter((r) => r.verificationStatus !== 'verified' && r.verificationStatus !== 'mismatch').length
  return { total: rows.length, verified, mismatch, unknown }
}

/**
 * Return tweak IDs that do not need an automatic repair. Use the newest active
 * receipt per tweak: older app versions could leave duplicate receipts after
 * a re-apply, and an old mismatch must not keep a successfully repaired tweak
 * in an infinite re-apply loop.
 */
function appliedTweakIdsReadyForReapply(rows: AppliedTweak[]): Set<string> {
  const latest = new Map<string, AppliedTweak>()
  for (const row of rows) {
    if (row.status !== 'applied') continue
    const prior = latest.get(row.tweakId)
    if (!prior || row.appliedAt > prior.appliedAt) latest.set(row.tweakId, row)
  }
  return new Set(
    [...latest.values()]
      .filter((row) => row.verificationStatus !== 'mismatch')
      .map((row) => row.tweakId),
  )
}

function mismatchedTweakIds(rows: AppliedTweak[], selectedIds: Set<string>): Set<string> {
  const latest = new Map<string, AppliedTweak>()
  for (const row of rows) {
    if (row.status !== 'applied' || !selectedIds.has(row.tweakId)) continue
    const prior = latest.get(row.tweakId)
    if (!prior || row.appliedAt > prior.appliedAt) latest.set(row.tweakId, row)
  }
  return new Set(
    [...latest.values()]
      .filter((row) => row.verificationStatus === 'mismatch')
      .map((row) => row.tweakId),
  )
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
