import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIsVip } from '../store/useVipStore'
import {
  applyBatch,
  applyTransaction,
  getTunePreflight,
  inTauri,
  verifyApplied,
  type AppliedTweak,
  type BatchItem,
  type SpecProfile,
  type TransactionReport,
  type TunePreflight,
} from '../lib/tauri'
import { confirmAction } from '../lib/confirm'
import { catalog, isExperimentalTweak, tweakMatchesSpec, type TweakRecord } from '../lib/catalog'
import { isTransactionActionEligible } from '../lib/optimizationSession'
import { isHardBlockedForAutoTune } from '../lib/tuneProfiles'
import { auditMany, type TweakAudit } from '../lib/audit'
import { AstaShareCard } from '../components/AstaShareCard'
import { RebootPersistenceCard } from '../components/RebootPersistenceCard'
import { TournamentAudit } from '../components/TournamentAudit'
import { useRigStore } from '../store/useRigStore'

/**
 * /asta — the path + apply page for Asta Mode. Browsable for non-VIP users
 * (so they see what they could unlock — that's the upsell), but Apply is
 * hard-gated behind the existing VIP store.
 */

const QUOTES = [
  '"I will surpass my limits."',
  '"It\'s not the gear. It\'s who refuses to lose."',
  '"We don\'t move because we think we can win. We move because the version of me that gives up is someone we refuse to meet."',
  '"Every drop of sweat and every scar can\'t become a lie."',
] as const

const ASTA_PHILOSOPHY = `No 4090. No DLSS. No dad-built PC. Just a kid on a stock GPU,
a hand-me-down monitor, and Wi-Fi that probably shouldn't qual —
who refuses to lose more times than the lobby refuses to let him in.

That's the model. That's the path.

This is the mode for the gen running 1660 Ti, 144 Hz IPS, basement
ping, still planning to make Champion League. Asta Mode pulls every
software lever this app can reach — the polite Tournament FPS preset,
but cranked. The core lane is measurable; the experimental lane is
clearly marked because a BIOS/driver/security trade can beat a stock
setup on one rig and hurt another. The bench decides what stays.

Apply only what you understand, then repeat the same game test. Receipts verify the immediate
setting readback where supported; they do not prove reboot persistence or a competitive gain.`

export function Asta() {
  const isVip = useIsVip()
  const isNative = inTauri()
  const spec = useRigStore((state) => state.spec)
  const ensureLoaded = useRigStore((state) => state.ensureLoaded)
  const refreshRig = useRigStore((state) => state.refresh)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<{
    requested: number
    verified: number
    mismatch: number
    unknown: number
    skipped: number
    transactional: number
    explicit: number
    reviewSkipped: number
    manual: number
    otherGame: number
    notMatched: number
    transactionStatus?: TransactionReport['status']
    ts: string
  } | null>(null)
  const [quoteIdx, setQuoteIdx] = useState(0)
  const [preflight, setPreflight] = useState<TunePreflight | null>(null)
  const [appliedRows, setAppliedRows] = useState<AppliedTweak[]>([])
  const [reviewedPlan, setReviewedPlan] = useState<AstaPlan | null>(null)
  const [reviewedPlanKey, setReviewedPlanKey] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [planAudit, setPlanAudit] = useState<Record<string, TweakAudit> | null>(null)
  const [previewProgress, setPreviewProgress] = useState({ done: 0, total: 0 })
  const [previewBusy, setPreviewBusy] = useState(false)

  const inventory = useMemo(
    () => (spec ? buildAstaPlan(spec, appliedRows) : null),
    [spec, appliedRows],
  )
  const displayPlan = reviewedPlan ?? inventory
  const previewIsCurrent = Boolean(
    spec && inventory && reviewedPlan && reviewedPlanKey === planFingerprint(spec, inventory),
  )
  const selectedCount = displayPlan?.candidates.filter((tweak) => selectedIds.has(tweak.id)).length ?? 0

  useEffect(() => {
    void ensureLoaded()
      .then((detected) => {
        if (!detected || !isNative) return null
        return verifyApplied()
      })
      .then((rows) => {
        if (rows) setAppliedRows(rows)
      })
      .catch(() => undefined)
    void getTunePreflight().then(setPreflight).catch(() => undefined)
  }, [ensureLoaded, isNative])

  // Rotate quotes on click of the manifesto block — small easter egg.
  function bumpQuote() {
    setQuoteIdx((i) => (i + 1) % QUOTES.length)
  }

  async function handlePreview() {
    if (!isNative) {
      setError('The desktop app is required to read current Windows values. This preview never applies tweaks.')
      return
    }
    setPreviewBusy(true)
    setError(null)
    setPlanAudit(null)
    setPreviewProgress({ done: 0, total: 0 })
    try {
      const detected = await refreshRig()
      if (!detected) throw new Error('Asta needs a fresh rig scan before it can preview this plan.')
      const liveRows = await verifyApplied()
      setAppliedRows(liveRows)
      const nextPlan = buildAstaPlan(detected, liveRows)
      const nextKey = planFingerprint(detected, nextPlan)
      setReviewedPlan(nextPlan)
      setReviewedPlanKey(nextKey)
      setSelectedIds((previous) => {
        const previousKey = reviewedPlanKey
        if (previousKey === nextKey && previous.size > 0) {
          return new Set(nextPlan.candidates.filter((tweak) => previous.has(tweak.id)).map((tweak) => tweak.id))
        }
        return new Set(nextPlan.candidates.map((tweak) => tweak.id))
      })
      setPreviewProgress({ done: 0, total: nextPlan.candidates.length })
      const audit = await auditMany(nextPlan.candidates, (done, total) => setPreviewProgress({ done, total }), 3)
      setPlanAudit(audit)
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as Error).message ?? String(e))
      setReviewedPlan(null)
      setReviewedPlanKey(null)
    } finally {
      setPreviewBusy(false)
    }
  }

  async function handleApply() {
    if (!isVip) return
    if (!reviewedPlan || !reviewedPlanKey || !previewIsCurrent || !planAudit) {
      setError('Preview the current plan first. If the rig or inventory changed, refresh the preview before applying.')
      return
    }
    if (selectedCount === 0) {
      setError('Select at least one tweak in the reviewed plan, or leave without applying.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      try {
        const latestPreflight = await getTunePreflight()
        setPreflight(latestPreflight)
        if (latestPreflight.blocksAutoApply) {
          setError(latestPreflight.detail)
          return
        }
      } catch {
        // Keep compatibility with an older installed shell. The batch still
        // records immediate verification and the post-apply read-back below.
      }
      const detected = await refreshRig()
      if (!detected) {
        setError('Asta needs a fresh desktop rig scan before it can build the full applicable catalog.')
        return
      }
      const latestApplied = await verifyApplied()
      const plan = buildAstaPlan(detected, latestApplied)
      setAppliedRows(latestApplied)
      const currentPlanKey = planFingerprint(detected, plan)
      if (currentPlanKey !== reviewedPlanKey) {
        setReviewedPlan(plan)
        setReviewedPlanKey(currentPlanKey)
        setPlanAudit(null)
        setSelectedIds((previous) => new Set(plan.candidates.filter((tweak) => previous.has(tweak.id)).map((tweak) => tweak.id)))
        setError('The rig or applicable plan changed since preview. Review the refreshed list before applying.')
        return
      }
      const chosen = plan.candidates.filter((tweak) => selectedIds.has(tweak.id))
      if (chosen.length === 0) {
        setError('The selected tweaks are no longer eligible on this rig. Preview the current plan again.')
        setReviewedPlan(null)
        setReviewedPlanKey(null)
        return
      }
      const chosenIds = new Set(chosen.map((tweak) => tweak.id))
      const chosenReview = plan.review.filter((tweak) => chosenIds.has(tweak.id))
      const chosenItems = (items: BatchItem[]) => items.filter((item) => chosenIds.has(item.tweakId))
      const transactional = chosenItems(plan.transactional)
      const explicit = chosenItems(plan.explicit)
      const reviewTransactional = chosenItems(plan.reviewTransactional)
      const reviewExplicit = chosenItems(plan.reviewExplicit)
      const safeActionCount = transactional.length + explicit.length
      const reviewActionCount = reviewTransactional.length + reviewExplicit.length
      const experimentalCount = chosen.filter((tweak) => isExperimentalTweak(tweak)).length
      if (!(await confirmAction(
        `Pinnacle Asta is ready to apply the ${chosen.length} selected Fortnite/Windows tweaks from the reviewed plan. That is ${safeActionCount} standard actions; ${chosenReview.length} selected review rows (${reviewActionCount} actions) need a separate security/compatibility confirmation. ${experimentalCount} selected rows are experimental. Unchecked rows will be left alone; BIOS/NVRAM/firmware and mismatched hardware targets remain excluded. A restore point and same-condition game test are strongly recommended. Continue?`,
      ))) {
        return
      }

      const applyReview =
        chosenReview.length === 0 ||
        (await confirmAction(
          `Review lane: apply the ${chosenReview.length} selected higher-risk or hard-to-read-back tweak${chosenReview.length === 1 ? '' : 's'} too? These can weaken security, affect anti-cheat/tournament eligibility, or lack deterministic read-back. Continue only if you accept the tradeoffs shown in the plan.`,
        ))

      // Confirm dialogs can remain open while other software changes settings.
      // Take one last read-only snapshot immediately before the first mutation.
      const executionIds = new Set([
        ...transactional,
        ...explicit,
        ...(applyReview ? [...reviewTransactional, ...reviewExplicit] : []),
      ].map((item) => item.tweakId))
      const executionTweaks = chosen.filter((tweak) => executionIds.has(tweak.id))
      const freshAudit = await auditMany(executionTweaks, undefined, 3)
      const auditChanged = executionTweaks.some((tweak) =>
        !sameAuditReadback(planAudit[tweak.id], freshAudit[tweak.id]),
      )
      if (auditChanged) {
        setPlanAudit((previous) => ({ ...(previous ?? {}), ...freshAudit }))
        setError('One or more settings in the apply lane changed since preview. The read-back is refreshed; review the updated rows before applying.')
        return
      }

      let transactionStatus: TransactionReport['status'] | undefined
      let requested = 0
      const appliedReceiptIds = new Set<string>()
      if (transactional.length > 0) {
        const report = await applyTransaction(transactional)
        transactionStatus = report.status
        requested += transactional.length
        if (report.status !== 'committed') {
          const detail = [...report.errors, ...report.rollbackErrors].join(' ')
          throw new Error(`Verified Asta lane ${report.status}.${detail ? ` ${detail}` : ''}`)
        }
        for (const item of report.items) {
          if (item.applied && item.receiptId) appliedReceiptIds.add(item.receiptId)
        }
      }
      if (explicit.length > 0) {
        const receipts = await applyBatch(explicit)
        requested += receipts.length
        for (const receipt of receipts) appliedReceiptIds.add(receipt.receiptId)
      }
      if (applyReview && reviewTransactional.length > 0) {
        const report = await applyTransaction(reviewTransactional)
        transactionStatus = report.status
        requested += reviewTransactional.length
        if (report.status !== 'committed') {
          const detail = [...report.errors, ...report.rollbackErrors].join(' ')
          throw new Error(`Review lane ${report.status}.${detail ? ` ${detail}` : ''}`)
        }
        for (const item of report.items) {
          if (item.applied && item.receiptId) appliedReceiptIds.add(item.receiptId)
        }
      }
      if (applyReview && reviewExplicit.length > 0) {
        const receipts = await applyBatch(reviewExplicit)
        requested += receipts.length
        for (const receipt of receipts) appliedReceiptIds.add(receipt.receiptId)
      }

      const allLive = await verifyApplied()
      const live = allLive.filter((row) => appliedReceiptIds.has(row.receiptId))
      setAppliedRows(allLive)
      setApplied({
        requested,
        verified: live.filter((receipt) => receipt.verificationStatus === 'verified').length,
        mismatch: live.filter((receipt) => receipt.verificationStatus === 'mismatch').length,
        unknown: live.filter((receipt) => receipt.verificationStatus === 'unknown').length,
        skipped: plan.alreadyApplied.length,
        transactional: transactional.length,
        explicit: explicit.length,
        reviewSkipped: applyReview ? 0 : chosenReview.length,
        manual: plan.manual.length,
        otherGame: plan.otherGame.length,
        notMatched: plan.notMatched.length,
        transactionStatus,
        ts: new Date().toLocaleTimeString(),
      })
      setReviewedPlan(null)
      setReviewedPlanKey(null)
      setPlanAudit(null)
      setSelectedIds(new Set())
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as Error).message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <Hero />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 surface-card p-6 space-y-4">
          <p className="text-[10px] uppercase tracking-[0.35em] text-text-subtle">the path</p>
          <h2
            className="text-3xl md:text-4xl font-bold leading-tight asta-anti-magic"
            style={{ fontFamily: "'Pirata One', 'Cinzel', serif" }}
          >
            We don't quit. So we built the mode.
          </h2>
          <p
            onClick={bumpQuote}
            title="(click for another quote)"
            className="text-base leading-relaxed text-text italic cursor-pointer select-none"
            style={{ fontFamily: "'Cinzel', 'Cormorant Garamond', serif" }}
          >
            {QUOTES[quoteIdx]}
          </p>
          <pre className="text-sm leading-relaxed text-text-muted whitespace-pre-wrap font-sans">
            {ASTA_PHILOSOPHY}
          </pre>
        </div>

        <div className="theme-stage-asta surface-card p-6 space-y-3 relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(201, 31, 55, 0.4) 0%, transparent 60%)',
            }}
          />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-widest text-text-subtle">apply</p>
            <h3 className="text-xl font-bold mt-1">Activate Asta Mode</h3>
            <p className="text-sm text-text-muted leading-snug mt-1">
              Pinnacle Asta inventories the full catalog for this rig and Fortnite context. Preview
              the live values, choose exactly which rows to include, then apply that selection.
              Reversible/read-back-capable actions use the transactional lane; unsupported scripts
              are visibly separated into an explicit review lane and may need a second UAC prompt.
              BIOS/NVRAM/firmware changes never become automatic.
            </p>

            {displayPlan && (
              <div className="mt-3 rounded-md border border-border bg-bg-base/40 px-3 py-2 text-xs text-text-muted leading-relaxed">
                <strong className="text-text">{reviewedPlan ? 'Reviewed inventory:' : 'Current inventory:'}</strong>{' '}
                <span className="text-emerald-300">{displayPlan.candidates.length} eligible</span>{' · '}
                <span className="text-sky-300">{displayPlan.alreadyApplied.length} already on target</span>{' · '}
                <span className="text-amber-200">{displayPlan.review.length} require separate review</span>{' · '}
                <span className="text-purple-300">{displayPlan.manual.length} manual firmware excluded</span>.
                <span className="block mt-1 text-[11px] text-text-subtle">
                  {displayPlan.notMatched.length} hardware mismatches and {displayPlan.otherGame.length} other-game rows are excluded from this Fortnite run.
                </span>
              </div>
            )}

            {inventory && (
              <div className="mt-3 rounded-md border border-amber-200/20 bg-black/20 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-text">Read-only plan review</p>
                    <p className="text-[11px] text-text-muted">Preview reads current settings only. Nothing changes until you activate the selected rows.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handlePreview()}
                    disabled={!isNative || previewBusy || busy}
                    className="rounded-md border border-amber-200/40 px-3 py-1.5 text-xs text-text hover:bg-white/5 disabled:opacity-40"
                  >
                    {previewBusy
                      ? `Reading plan… ${previewProgress.done}/${previewProgress.total}`
                      : reviewedPlan && previewIsCurrent
                        ? 'Refresh preview'
                        : 'Preview exact changes'}
                  </button>
                </div>
                {previewBusy && (
                  <div className="h-1.5 overflow-hidden rounded bg-white/10" aria-label="Reading current tweak states">
                    <div
                      className="h-full bg-sky-400 transition-all"
                      style={{ width: `${previewProgress.total ? Math.round(previewProgress.done / previewProgress.total * 100) : 5}%` }}
                    />
                  </div>
                )}
                {reviewedPlan && planAudit && previewIsCurrent && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
                      <p className="text-[11px] text-text-muted">
                        {selectedCount} of {reviewedPlan.candidates.length} selected · values read at {new Date(Object.values(planAudit)[0]?.scannedAt ?? Date.now()).toLocaleTimeString()}.
                        {' '}Unknown means this action has no declared read-back contract.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedIds(new Set(reviewedPlan.candidates.map((tweak) => tweak.id)))}
                          className="text-[11px] text-sky-300 underline underline-offset-2"
                        >Select all</button>
                        <button
                          type="button"
                          onClick={() => setSelectedIds(new Set())}
                          className="text-[11px] text-text-muted underline underline-offset-2"
                        >Select none</button>
                      </div>
                    </div>
                    <details open className="rounded border border-white/10 bg-black/10">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-text">
                        Review eligible tweaks ({reviewedPlan.candidates.length}) — unchecked rows stay untouched
                      </summary>
                      <div className="max-h-[34rem] space-y-2 overflow-y-auto p-2">
                        {reviewedPlan.candidates.map((tweak) => (
                          <AstaPlanReviewRow
                            key={tweak.id}
                            tweak={tweak}
                            audit={planAudit[tweak.id] ?? null}
                            selected={selectedIds.has(tweak.id)}
                            disabled={!previewIsCurrent || busy || previewBusy}
                            onToggle={() => setSelectedIds((previous) => {
                              const next = new Set(previous)
                              if (next.has(tweak.id)) next.delete(tweak.id)
                              else next.add(tweak.id)
                              return next
                            })}
                          />
                        ))}
                      </div>
                    </details>
                  </>
                )}
                {reviewedPlan && previewIsCurrent && !planAudit && !previewBusy && (
                  <p className="text-[11px] text-amber-200">Plan loaded, but the read-only preview did not finish. Refresh it before applying.</p>
                )}
                {displayPlan && (
                  <details className="rounded border border-white/10 px-3 py-2">
                    <summary className="cursor-pointer text-[11px] text-text-muted">Why other catalog rows are excluded from this Fortnite run</summary>
                    <div className="mt-2 grid gap-3 md:grid-cols-3">
                      <ExcludedRows label="Manual firmware / BIOS" reason="No BIOS, NVRAM, or firmware changes are applied by Asta." rows={displayPlan.manual} />
                      <ExcludedRows label="Hardware does not match" reason="The exact rig-target filter did not pass; no nearby-hardware substitute is used." rows={displayPlan.notMatched} />
                      <ExcludedRows label="Other game" reason="These catalog entries are scoped to a different game." rows={displayPlan.otherGame} />
                    </div>
                  </details>
                )}
              </div>
            )}

            {!isVip && (
              <div className="mt-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug">
                <strong>VIP required.</strong> Open <Link to="/pricing" className="underline">
                Pricing</Link>, tap the $115 price 5 times within 3 seconds, paste a code from
                Diggy.
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            {applied && (
              <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                {applied.verified}/{applied.requested} actions matched immediate readback
                {applied.mismatch > 0 ? ` · ${applied.mismatch} mismatch` : ''}
                {applied.unknown > 0 ? ` · ${applied.unknown} unverified` : ''} (at {applied.ts}).
                {applied.skipped > 0 ? ` ${applied.skipped} already-on-target tweaks were skipped.` : ''}
                {applied.transactional > 0 ? ` ${applied.transactional} actions used verified transactions.` : ''}
                {applied.explicit > 0 ? ` ${applied.explicit} actions used explicit review.` : ''}
                {applied.reviewSkipped > 0 ? ` ${applied.reviewSkipped} higher-risk rows stayed unapplied because the review confirmation was declined.` : ''}
                {applied.transactionStatus ? ` Transaction status: ${applied.transactionStatus}.` : ''}
                This does not prove reboot persistence or better gameplay; run the same Asta Bench
                before and after, then use Your Tune to re-check drift.
              </div>
            )}

            {preflight?.blocksAutoApply && (
              <div className="mt-3 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-100 leading-snug">
                <strong className="text-red-200">Windows stability gate:</strong> {preflight.detail}{' '}
                Finish the update and re-scan before activating Asta Mode.
                <button
                  type="button"
                  onClick={() => {
                    void getTunePreflight().then(setPreflight).catch(() => undefined)
                  }}
                  className="mt-2 rounded border border-red-300/50 px-2 py-1 text-[11px] text-red-100 hover:bg-red-100/10"
                >
                  Re-check Windows status
                </button>
              </div>
            )}

            {preflight &&
              !preflight.blocksAutoApply &&
              preflight.buildChangedSinceLastApply && (
                <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 leading-snug">
                  <strong className="text-amber-200">The OS build differs from the last recorded tune.</strong>{' '}
                  This can follow Windows servicing or a reinstall; the app cannot identify what
                  caused the difference. No active installation or pending restart is detected.
                  Check live state and reboot persistence after applying.
                </div>
              )}

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={busy || previewBusy || !isVip || !previewIsCurrent || !planAudit || selectedCount === 0 || preflight?.blocksAutoApply}
                className="btn-chrome w-full px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={
                  isVip
                    ? {
                        background:
                          'linear-gradient(135deg, #c91f37 0%, #7a0a1a 60%, #04020a 100%)',
                        color: '#f0e4d8',
                        border: '1px solid rgba(201, 31, 55, 0.65)',
                        boxShadow: '0 0 18px rgba(201, 31, 55, 0.3)',
                      }
                    : {
                        background:
                          'linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #cc9900 100%)',
                        color: '#3a2a00',
                        border: '1px solid rgba(255, 215, 0, 0.65)',
                      }
                }
              >
                {preflight?.blocksAutoApply
                  ? 'Finish Windows Update, then re-scan'
                  : busy
                  ? 'Applying…'
                  : !previewIsCurrent || !planAudit
                    ? 'Preview the plan first'
                  : selectedCount === 0
                    ? 'Select at least one tweak'
                  : isVip
                  ? `🗡 Activate ${selectedCount} selected tweaks`
                  : '👑 VIP only'}
              </button>
              <Link
                to="/benchmark"
                className="text-center text-xs text-text-muted hover:text-text border border-border rounded-md px-3 py-1.5 hover:border-border-glow transition"
              >
                Run Asta Bench (before / after)
              </Link>
            </div>
          </div>
        </div>
      </section>

      <AstaFitCard />

      <RebootPersistenceCard />

      <TournamentAudit />

      <AstaShareCard />

      <section className="surface-card p-6 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">whats next</p>
        <h3 className="text-lg font-semibold">After Asta Mode</h3>
        <p className="text-sm text-text-muted leading-snug max-w-3xl">
          Once the software lane is measured, the next margin is usually your hardware, game
          settings, network route, or practice. This app points you at the evidence instead of
          assigning a fixed percentage to the gap.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <NextCard
            title="RAM profile evidence"
            body="Read SPD and manufacturer-rated profile data, then use the stability checklist. No automatic BIOS timing or voltage recipe is generated."
            cta="Open /diagnostics"
            href="/diagnostics"
          />
          <NextCard
            title="The grind layer"
            body="Sleep, warmup routines, session cadence — what Aussie Antics, Bugha, Clix, Mongraal actually do daily."
            cta="Open /grind"
            href="/grind"
          />
          <NextCard
            title="Latency budget"
            body="The cited per-layer breakdown. What we can move + what's hard cap."
            cta="Open /guides"
            href="/guides"
          />
        </div>
      </section>
    </div>
  )
}

interface AstaPlan {
  candidates: TweakRecord[]
  alreadyApplied: TweakRecord[]
  review: TweakRecord[]
  manual: TweakRecord[]
  otherGame: TweakRecord[]
  notMatched: TweakRecord[]
  transactional: BatchItem[]
  explicit: BatchItem[]
  reviewTransactional: BatchItem[]
  reviewExplicit: BatchItem[]
}

/** Build Asta's full, rig-aware Fortnite inventory. "Full" means every
 * applicable software row in the catalog, not firmware writes or rows for a
 * different game. A verified receipt is skipped; drifted/unknown receipts are
 * eligible for explicit review because the verifier cannot identify what
 * changed the live value. */
function buildAstaPlan(spec: SpecProfile, applied: AppliedTweak[]): AstaPlan {
  const latest = new Map<string, AppliedTweak>()
  for (const row of applied) {
    if (row.status !== 'applied') continue
    const prior = latest.get(row.tweakId)
    if (!prior || row.appliedAt > prior.appliedAt) latest.set(row.tweakId, row)
  }

  const candidates: TweakRecord[] = []
  const alreadyApplied: TweakRecord[] = []
  const review: TweakRecord[] = []
  const manual: TweakRecord[] = []
  const otherGame: TweakRecord[] = []
  const notMatched: TweakRecord[] = []

  for (const tweak of catalog.tweaks) {
    const taggedForFortnite = !tweak.applicableGames?.length || tweak.applicableGames.includes('fortnite')
    if (!taggedForFortnite) {
      otherGame.push(tweak)
      continue
    }
    if (!tweakMatchesSpec(tweak, spec)) {
      notMatched.push(tweak)
      continue
    }
    if (isManualFirmwareRecipe(tweak)) {
      manual.push(tweak)
      continue
    }
    if (latest.get(tweak.id)?.verificationStatus === 'verified') {
      alreadyApplied.push(tweak)
      continue
    }
    candidates.push(tweak)
    if (isHardBlockedForAutoTune(tweak)) review.push(tweak)
  }

  const transactional: BatchItem[] = []
  const explicit: BatchItem[] = []
  const reviewTransactional: BatchItem[] = []
  const reviewExplicit: BatchItem[] = []
  const reviewIds = new Set(review.map((tweak) => tweak.id))
  for (const tweak of candidates) {
    for (const action of tweak.actions) {
      const item = { tweakId: tweak.id, action }
      const destination = reviewIds.has(tweak.id)
        ? isTransactionActionEligible(action)
          ? reviewTransactional
          : reviewExplicit
        : isTransactionActionEligible(action)
          ? transactional
          : explicit
      destination.push(item)
    }
  }

  return {
    candidates,
    alreadyApplied,
    review,
    manual,
    otherGame,
    notMatched,
    transactional,
    explicit,
    reviewTransactional,
    reviewExplicit,
  }
}

function planFingerprint(spec: SpecProfile, plan: AstaPlan): string {
  return JSON.stringify({
    cpu: spec.cpu.model,
    gpu: spec.gpu.model,
    ramGb: spec.ram.totalGb,
    board: `${spec.mobo.manufacturer ?? ''} ${spec.mobo.product ?? ''}`,
    osBuild: spec.os.build,
    candidates: plan.candidates.map((tweak) => tweak.id).sort(),
  })
}

function sameAuditReadback(before: TweakAudit | undefined, after: TweakAudit | undefined): boolean {
  if (!before || !after || before.status !== after.status || before.total !== after.total) return false
  if (before.actions.length !== after.actions.length) return false
  return before.actions.every((action, index) => {
    const current = after.actions[index]
    return current?.index === action.index && current.status === action.status && current.detail === action.detail
  })
}

function auditStatusClass(status: string): string {
  if (status === 'matches') return 'text-emerald-300'
  if (status === 'differs' || status === 'partial') return 'text-amber-200'
  if (status === 'error') return 'text-red-300'
  return 'text-text-muted'
}

function AstaPlanReviewRow({
  tweak,
  audit,
  selected,
  disabled,
  onToggle,
}: {
  tweak: TweakRecord
  audit: TweakAudit | null
  selected: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const reviewOnly = isHardBlockedForAutoTune(tweak)
  const transactional = tweak.actions.length > 0 && tweak.actions.every(isTransactionActionEligible)
  const lane = reviewOnly ? 'Separate review confirmation' : transactional ? 'Verified transaction lane' : 'Explicit action lane'
  const matchCount = audit?.actions.filter((action) => action.status === 'matches').length ?? 0
  const differsCount = audit?.actions.filter((action) => action.status === 'differs').length ?? 0
  const unknownCount = audit?.actions.filter((action) => action.status === 'unknown').length ?? 0
  const errorCount = audit?.actions.filter((action) => action.status === 'error').length ?? 0
  return (
    <article className="rounded-md border border-border bg-bg-base/60 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`Include ${tweak.title} in Asta apply`}
          className="mt-1 accent-red-500"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-sm text-text">{tweak.title}</span>
            <span className={`rounded border px-2 py-0.5 text-[10px] ${reviewOnly ? 'border-amber-500/40 text-amber-200' : transactional ? 'border-emerald-500/40 text-emerald-300' : 'border-sky-500/40 text-sky-300'}`}>
              {lane}
            </span>
          </span>
          <span className="mt-1 block text-[11px] text-text-subtle">
            {tweak.category} · risk {tweak.riskLevel}/4 · anti-cheat risk {tweak.anticheatRisk} · reboot {tweak.rebootRequired}
            {tweak.evidenceTier ? ` · evidence ${tweak.evidenceTier}` : ''}
            {isExperimentalTweak(tweak) ? ' · experimental' : ''}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-text-muted">{tweak.description}</span>
          {tweak.rationale && <span className="mt-1 block text-[11px] leading-relaxed text-text-subtle">Why it is listed: {tweak.rationale}</span>}
          {tweak.expectedImpact && <span className="mt-1 block text-[11px] leading-relaxed text-text-subtle">Expected impact / tradeoff: {tweak.expectedImpact}</span>}
          {tweak.experimentalWarning && <span className="mt-1 block text-[11px] leading-relaxed text-amber-200">Caution: {tweak.experimentalWarning}</span>}
          {audit ? (
            <span className="mt-2 block rounded border border-white/10 bg-black/20 px-2 py-1.5">
              <span className={`block text-[11px] font-semibold ${auditStatusClass(audit.status)}`}>
                Read-back: {audit.status} · {matchCount} match · {differsCount} differ · {unknownCount} unknown{errorCount ? ` · ${errorCount} error` : ''}
              </span>
              {audit.actions.length > 0 ? (
                <span className="mt-1 block space-y-1">
                  {audit.actions.map((action) => (
                    <span key={action.index} className="block text-[11px] text-text-muted">
                      <span className={auditStatusClass(action.status)}>{action.status}</span>
                      {' · '}{action.detail}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="mt-1 block text-[11px] text-text-subtle">
                  State could not be read. No change is made by this preview.
                </span>
              )}
            </span>
          ) : (
            <span className="mt-2 block text-[11px] text-text-subtle">Read-back preview is being prepared…</span>
          )}
        </span>
      </label>
    </article>
  )
}

function ExcludedRows({ label, reason, rows }: { label: string; reason: string; rows: TweakRecord[] }) {
  const preview = rows.slice(0, 8)
  return (
    <div className="rounded border border-white/10 bg-black/10 p-2">
      <p className="text-[11px] font-semibold text-text">{label} · {rows.length}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-text-subtle">{reason}</p>
      {preview.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-[10px] leading-relaxed text-text-muted">
          {preview.map((row) => <li key={row.id}>{row.title}</li>)}
        </ul>
      )}
      {rows.length > preview.length && <p className="mt-1 text-[10px] text-text-subtle">and {rows.length - preview.length} more</p>}
    </div>
  )
}

function isManualFirmwareRecipe(tweak: TweakRecord): boolean {
  return tweak.category === 'bios' || /\b(?:xmp|expo|dram timing|memory timing|firmware|nvram)\b/i.test(tweak.title)
}

function Hero() {
  return (
    <section
      className="relative overflow-hidden rounded-2xl p-8 md:p-12"
      style={{
        background:
          'radial-gradient(circle at 18% 25%, rgba(201, 31, 55, 0.22) 0%, transparent 45%), radial-gradient(circle at 82% 75%, rgba(89, 13, 26, 0.5) 0%, transparent 55%), #040003',
        border: '1px solid rgba(201, 31, 55, 0.35)',
        boxShadow: '0 0 28px rgba(201, 31, 55, 0.18)',
      }}
    >
      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.3em] text-asta-bone-soft mb-2">
          Asta Mode
        </p>
        <h1
          className="text-4xl md:text-6xl font-bold leading-none"
          style={{
            fontFamily: "'Pirata One', 'Cinzel', serif",
            color: '#f0e4d8',
            textShadow:
              '0 0 16px rgba(201, 31, 55, 0.45), 0 0 36px rgba(89, 13, 26, 0.7)',
          }}
        >
          Push the rig to its limit.
        </h1>
        <p
          className="mt-4 max-w-2xl text-base md:text-lg leading-snug"
          style={{
            fontFamily: "'Cinzel', 'Cormorant Garamond', serif",
            color: '#b9a487',
            letterSpacing: '0.01em',
          }}
        >
          For the kids on stock rigs born to chase pros they shouldn't be able to catch.
          A measured core plus an opt-in lab lane. Your rig, not a slogan, decides what wins.
        </p>
      </div>

      <style>{`
        .text-asta-bone-soft { color: #b9a487; }

        /* Asta anti-magic text effect — black blade aura + crimson flicker.
           Layered text-shadow simulates the dark-anti-magic glow that bleeds
           off the sword in Black Clover. Animated flicker for "alive" feel. */
        .asta-anti-magic {
          color: #f0e4d8;
          background: linear-gradient(180deg, #f4ebdc 0%, #c2a47a 60%, #6a3a3a 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow:
            0 0 1px rgba(201, 31, 55, 0.5),
            0 0 8px rgba(201, 31, 55, 0.45),
            0 0 22px rgba(89, 13, 26, 0.7),
            0 1px 0 rgba(4, 0, 2, 0.95);
          filter: drop-shadow(0 0 6px rgba(201, 31, 55, 0.35));
          animation: asta-flicker 4.5s ease-in-out infinite;
          position: relative;
        }
        @keyframes asta-flicker {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(201, 31, 55, 0.35)); }
          45%      { filter: drop-shadow(0 0 14px rgba(201, 31, 55, 0.6)); }
          50%      { filter: drop-shadow(0 0 4px rgba(89, 13, 26, 0.5)); }
          55%      { filter: drop-shadow(0 0 14px rgba(201, 31, 55, 0.6)); }
        }
      `}</style>
    </section>
  )
}

function AstaFitCard() {
  const spec = useRigStore((state) => state.spec)
  const status = useRigStore((state) => state.status)
  const error = useRigStore((state) => state.error)
  const loading = status === 'idle' || status === 'loading'

  if (status === 'unavailable') return null

  const desktop = spec ? !spec.mobo.isLaptop : false
  const enoughRam = (spec?.ram.totalGb ?? 0) >= 16
  const enoughThreads = (spec?.cpu.logicalCores ?? 0) >= 8
  const fit = desktop && enoughRam && enoughThreads

  return (
    <section className="surface-card p-5 space-y-3 border border-asta-crimson/40">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">rig fit check</p>
          <h2 className="text-lg font-semibold">Basic rig inventory</h2>
          <p className="text-xs text-text-muted leading-snug max-w-2xl mt-1">
            A few reported-spec thresholds only. This is not a compatibility, stability, safety,
            or performance test and does not decide which tweaks you should apply.
          </p>
        </div>
        {spec && (
          <span className={`text-xs uppercase tracking-widest px-2 py-1 rounded border ${fit ? 'border-emerald-500/50 text-emerald-300' : 'border-amber-500/50 text-amber-200'}`}>
            {fit ? 'thresholds met' : 'thresholds not met'}
          </span>
        )}
      </div>
      {loading && <p className="text-xs text-text-subtle">Reading your rig…</p>}
      {error && <p className="text-xs text-text-muted">{error}</p>}
      {spec && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <FitItem label="Form factor" value={desktop ? 'desktop' : 'laptop / unknown'} ok={desktop} />
          <FitItem label="Memory" value={`${spec.ram.totalGb} GB`} ok={enoughRam} />
          <FitItem label="CPU threads" value={String(spec.cpu.logicalCores)} ok={enoughThreads} />
          <FitItem label="OS" value={`${spec.os.caption} · ${spec.os.build}`} ok={spec.os.build > 0} />
        </div>
      )}
      <p className="text-[11px] text-text-subtle leading-snug">
        It does not inspect the cooler, PSU, BIOS, RAM stability, restore readiness, or anti-cheat
        eligibility. Use{' '}
        <Link to="/diagnostics" className="underline hover:text-text">Diagnostics</Link> for
        evidence; benchmark one change at a time and verify it again after reboot.
      </p>
    </section>
  )
}

function FitItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="border border-border rounded-md p-2">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className={ok ? 'text-emerald-300' : 'text-amber-200'}>{ok ? '✓ ' : '⚠ '}{value}</p>
    </div>
  )
}

function NextCard({
  title,
  body,
  cta,
  href,
}: {
  title: string
  body: string
  cta: string
  href: string
}) {
  return (
    <Link
      to={href}
      className="surface-card p-4 block hover:border-border-glow transition"
    >
      <h4 className="text-base font-semibold">{title}</h4>
      <p className="text-xs text-text-muted leading-snug mt-1">{body}</p>
      <p className="text-[11px] text-accent mt-2 underline-offset-2 group-hover:underline">
        {cta} →
      </p>
    </Link>
  )
}
