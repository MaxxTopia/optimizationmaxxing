import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIsVip } from '../store/useVipStore'
import {
  applyAstaBatch,
  armRebootValidation,
  getTunePreflight,
  inTauri,
  kvGet,
  listApplied,
  revertBatch,
  verifyApplied,
  type RebootValidation,
  type AppliedTweak,
  type BatchItem,
  type SpecProfile,
  type TransactionReport,
  type TunePreflight,
} from '../lib/tauri'
import { runBenchMedian, score, type BenchScored } from '../lib/astaBench'
import { measurementNoiseFloor } from '../lib/benchMath'
import { confirmAction } from '../lib/confirm'
import { catalog, isExperimentalTweak, tweakMatchesSpec, type TweakRecord } from '../lib/catalog'
import { evaluateClosedLoop, isTransactionActionEligible } from '../lib/optimizationSession'
import { isHardBlockedForAutoTune } from '../lib/tuneProfiles'
import { auditMany, type TweakAudit } from '../lib/audit'
import { manualPowerShellVerificationNote } from '../lib/powershellVerifiers'
import { AstaShareCard } from '../components/AstaShareCard'
import { RebootPersistenceCard } from '../components/RebootPersistenceCard'
import { TournamentAudit } from '../components/TournamentAudit'
import { NvpiManualStepCard } from '../components/NvpiManualStepCard'
import { PinnacleCoverageCard } from '../components/PinnacleCoverageCard'
import { useRigStore } from '../store/useRigStore'

/**
 * /asta — the path + apply page for Asta Mode. Browsable for non-VIP users
 * (so they see what they could unlock — that's the upsell), but Apply is
 * hard-gated behind the existing VIP store.
 */

const QUOTES = [
  '"Measured settings beat assumptions."',
  '"Read back the change before you keep it."',
  '"Stable frame time matters more than a bigger tweak list."',
  '"Keep reversible changes and compare the same game scenario."',
] as const

// These actions can safely establish their own app-owned restore record
// on first apply when the live target is readable but no prior record exists.
// Every other ambiguous read-back remains fail-closed.
const SAFE_FIRST_APPLY_IDS = new Set([
  'ps.power.dt-tournament',
  'net.nic.rss.enable',
  'net.nic.eee-powersave.disable',
])

/**
 * Experimental does not mean “unreviewed apply-all.” These are the small,
 * explicit lane that Asta can select automatically when the action matches
 * the rig and its transaction contract is present. They remain visibly
 * experimental, but are included in the normal one-consent apply when their
 * live read-back is unambiguous. This is the performance ceiling of the
 * reversible Windows/NIC/power/input lane, not a promise that every tweak is
 * faster on every driver or that ISP/server latency can be changed locally.
 *
 * Deliberately excluded: risk-4/security changes, policy-owned QoS, firmware/
 * BIOS, static game-file edits, and actions with ambiguous or lossy restore.
 */
const PINNACLE_EXPERIMENTAL_IDS = new Set([
  'net.nic.interrupt-moderation.disable',
  'net.nic.flow-control.disable',
  'net.nic.lso.disable',
  'net.nic.rsc.disable',
  'process.core-parking.disable',
  'power.device-idle.performance',
  'power.pcie.link-state.off',
  'power.usb3.link-power.disable',
  'hid.mouse.priority-realtime',
  'process.msi-mode.gpu-nic-audio',
  'peripherals.usb.coalescing-disable-pinnacle',
  'process.background-apps.disable',
  'network.delivery-optimization.peer-sharing.disable',
])

// Asta's one named baseline exception: this action creates/activates the
// app-owned Ultimate Performance gaming plan and has a first-run restore
// contract. It is situational by catalog evidence, but it is a core part of
// the requested automatic performance baseline rather than an unreviewed
// apply-all row.
const PINNACLE_BASELINE_IDS = new Set([
  'ps.power.dt-tournament',
])

const ASTA_PHILOSOPHY = `Asta Mode builds a hardware-aware performance plan for this PC.
It prioritizes measurable, reversible Windows, power, graphics, input, and network settings
that match the detected hardware. Unsupported or ambiguous actions stay out of the automatic lane.

The apply receipt shows immediate read-back where supported. Reboot persistence and in-game
results are measured separately, so you can review what changed, revert the latest run, and
compare the same game scenario again.`

type AstaBenchPhase = 'idle' | 'before' | 'after' | 'complete'

type AstaActionDetail = {
  tweakId: string
  kind: string
  status: string
  detail: string
}

type AstaInflightNotice = {
  transactionId: string
  startedAt: string
  actionCount: number
}

type AstaPreviewResult = {
  detected: SpecProfile
  plan: AstaPlan
  planKey: string
  audit: Record<string, TweakAudit>
  pinnacleIds: Set<string>
}

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
    attempted: number
    verified: number
    mismatch: number
    unknown: number
    skipped: number
    alreadyAtTarget: number
    firstApplySetup: number
    firstApplySetupDetails: string[]
    notApplicable: number
    notApplicableDetails: string[]
    policySkipped: number
    policySkipDetails: string[]
    preflightSkipped: number
    preflightSkipDetails: string[]
    transactional: number
    explicit: number
    committed: number
    rolledBack: number
    safetyReverted: number
    safetyRevertDetail?: string
    persistenceExcluded: number
    actionDetails: AstaActionDetail[]
    reviewSkipped: number
    manual: number
    otherGame: number
    notMatched: number
    transactionStatus?: TransactionReport['status']
    errors: string[]
    ts: string
  } | null>(null)
  const [quoteIdx, setQuoteIdx] = useState(0)
  const [preflight, setPreflight] = useState<TunePreflight | null>(null)
  const [appliedRows, setAppliedRows] = useState<AppliedTweak[]>([])
  const [reviewedPlan, setReviewedPlan] = useState<AstaPlan | null>(null)
  const [reviewedPlanKey, setReviewedPlanKey] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionCustomized, setSelectionCustomized] = useState(false)
  const [planAudit, setPlanAudit] = useState<Record<string, TweakAudit> | null>(null)
  const [previewProgress, setPreviewProgress] = useState({ done: 0, total: 0 })
  const [previewBusy, setPreviewBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [benchPhase, setBenchPhase] = useState<AstaBenchPhase>('idle')
  const [benchBefore, setBenchBefore] = useState<BenchScored | null>(null)
  const [benchAfter, setBenchAfter] = useState<BenchScored | null>(null)
  const [benchError, setBenchError] = useState<string | null>(null)
  const [benchSafetyNote, setBenchSafetyNote] = useState<string | null>(null)
  const [benchEvidenceNote, setBenchEvidenceNote] = useState<string | null>(null)
  const [rebootProof, setRebootProof] = useState<RebootValidation | null>(null)
  const [inflightNotice, setInflightNotice] = useState<AstaInflightNotice | null>(null)

  const inventory = useMemo(
    () => (spec ? buildAstaPlan(spec, appliedRows) : null),
    [spec, appliedRows],
  )
  const displayPlan = reviewedPlan ?? inventory
  const previewIsCurrent = Boolean(
    spec && inventory && reviewedPlan && reviewedPlanKey === planFingerprint(spec, inventory),
  )
  const selectedCount = displayPlan?.candidates.filter((tweak) => selectedIds.has(tweak.id)).length ?? 0
  const pinnacleDefaultCount = reviewedPlan && planAudit
    ? reviewedPlan.candidates.filter((tweak) => isPinnacleDefaultCandidate(tweak, planAudit[tweak.id])).length
    : 0
  const pinnacleExperimentalCount = reviewedPlan && planAudit
    ? reviewedPlan.candidates.filter((tweak) =>
      PINNACLE_EXPERIMENTAL_IDS.has(tweak.id)
      && isPinnacleDefaultCandidate(tweak, planAudit[tweak.id]),
    ).length
    : 0
  useEffect(() => {
    void ensureLoaded()
      .then((detected) => {
        if (!detected || !isNative) return null
        // Opening Asta must never surprise the user with a protected read or
        // a UAC prompt. Stored receipts are enough to build the initial
        // inventory; Preview is the explicit live read-back boundary.
        return listApplied()
      })
      .then((rows) => {
        if (rows) setAppliedRows(rows)
      })
      .catch(() => undefined)
    void getTunePreflight().then(setPreflight).catch(() => undefined)
    void kvGet('asta_inflight')
      .then((raw) => {
        if (!raw) return
        try {
          const marker = JSON.parse(raw) as Partial<AstaInflightNotice> & { status?: string }
          if (
            marker.status === 'in_flight'
            && typeof marker.transactionId === 'string'
            && typeof marker.startedAt === 'string'
            && typeof marker.actionCount === 'number'
          ) {
            setInflightNotice({
              transactionId: marker.transactionId,
              startedAt: marker.startedAt,
              actionCount: marker.actionCount,
            })
          }
        } catch {
          // An unreadable marker is not a reason to block Asta. Preview will
          // perform the normal live read-back and report any actual drift.
        }
      })
      .catch(() => undefined)
  }, [ensureLoaded, isNative])

  // Rotate quotes on click of the manifesto block — small easter egg.
  function bumpQuote() {
    setQuoteIdx((i) => (i + 1) % QUOTES.length)
  }

  async function prepareAstaPlan(forcePinnacleDefaults = false): Promise<AstaPreviewResult | null> {
    if (!isNative) {
      setError('The desktop app is required to read current Windows values. This preview never applies tweaks.')
      return null
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
      const sameReviewedPlan = reviewedPlanKey === nextKey
      setReviewedPlan(nextPlan)
      setReviewedPlanKey(nextKey)
      // Do not briefly select the whole raw catalog while the live audit is
      // running. The first visible selection is computed from the completed
      // read-back below.
      if (!sameReviewedPlan) {
        setSelectedIds(new Set())
        setSelectionCustomized(false)
      }
      setPreviewProgress({ done: 0, total: nextPlan.candidates.length })
      const audit = await auditMany(nextPlan.candidates, (done, total) => setPreviewProgress({ done, total }), 3)
      setPlanAudit(audit)
      const pinnacleIds = new Set(nextPlan.candidates
        .filter((tweak) => isPinnacleDefaultCandidate(tweak, audit[tweak.id]))
        .map((tweak) => tweak.id))
      setSelectedIds((previous) => {
        if (!forcePinnacleDefaults && sameReviewedPlan && selectionCustomized) {
          const candidateIds = new Set(nextPlan.candidates.map((tweak) => tweak.id))
          return new Set([...previous].filter((id) => candidateIds.has(id)))
        }
        return pinnacleIds
      })
      if (forcePinnacleDefaults || !sameReviewedPlan || !selectionCustomized) setSelectionCustomized(false)
      return { detected, plan: nextPlan, planKey: nextKey, audit, pinnacleIds }
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as Error).message ?? String(e))
      setReviewedPlan(null)
      setReviewedPlanKey(null)
      return null
    } finally {
      setPreviewBusy(false)
    }
  }

  async function handlePreview() {
    await prepareAstaPlan(false)
  }

  async function captureAstaBench(phase: 'before' | 'after'): Promise<BenchScored | null> {
    setBenchPhase(phase)
    const label = phase === 'before' ? 'before' : 'after'
    try {
      const measured = score(await runBenchMedian(
        3,
        (run, total) => setProgress(`Running Asta Bench (${label}) — median run ${run}/${total}…`),
        (stage) => setProgress(`Running Asta Bench (${label}) — ${stage}…`),
      ))
      if (phase === 'before') setBenchBefore(measured)
      else setBenchAfter(measured)
      return measured
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      setBenchError((previous) => previous ? `${previous} ${label}: ${detail}` : `${label}: ${detail}`)
      return null
    }
  }

  async function handleApply(mode: 'pinnacle' | 'selected' = 'selected') {
    if (!isVip) return
    const automaticPinnacle = mode === 'pinnacle'
    if (!automaticPinnacle && (!reviewedPlan || !reviewedPlanKey || !previewIsCurrent || !planAudit)) {
      setError('Preview the current plan first. If the rig or inventory changed, refresh the preview before applying.')
      return
    }
    if (!automaticPinnacle && selectedCount === 0) {
      setError('Select at least one tweak in the reviewed plan, or leave without applying.')
      return
    }
    setBusy(true)
    setError(null)
    setBenchBefore(null)
    setBenchAfter(null)
    setBenchError(null)
    setBenchSafetyNote(null)
    setBenchEvidenceNote(null)
    setBenchPhase('idle')
    setRebootProof(null)
    try {
      // The primary path is intentionally self-contained: it performs the
      // live preview/read-back, selects only the current Pinnacle defaults,
      // and then continues with the existing final preflight and transaction
      // safety checks. React state is asynchronous, so keep this result local
      // instead of relying on setState having completed before apply starts.
      const prepared = automaticPinnacle ? await prepareAstaPlan(true) : null
      if (automaticPinnacle && !prepared) return
      const previewPlan = prepared?.plan ?? reviewedPlan
      const previewPlanKey = prepared?.planKey ?? reviewedPlanKey
      const previewAudit = prepared?.audit ?? planAudit
      const previewSelection = prepared?.pinnacleIds ?? selectedIds
      if (!previewPlan || !previewPlanKey || !previewAudit) {
        setError('Asta could not finish the live plan read-back. Nothing was changed; try again.')
        return
      }
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
      const receiptSnapshot = new Map(latestApplied.map((receipt) => [
        receipt.receiptId,
        `${receipt.verificationStatus}\u0000${receipt.verificationDetail}`,
      ]))
      setAppliedRows(latestApplied)
      const currentPlanKey = planFingerprint(detected, plan)
      if (currentPlanKey !== previewPlanKey) {
        setReviewedPlan(plan)
        setReviewedPlanKey(currentPlanKey)
        setPlanAudit(null)
        setSelectedIds(new Set())
        setSelectionCustomized(false)
        setError(automaticPinnacle
          ? 'The rig changed while Asta was preparing the automatic plan. Nothing was changed; run the one-click apply again.'
          : 'The rig or applicable plan changed since preview. Review the refreshed list before applying.')
        return
      }
      const chosen = plan.candidates.filter((tweak) => previewSelection.has(tweak.id))
      if (chosen.length === 0) {
        setError(automaticPinnacle
          ? 'Asta found no supported settings that need changing on this PC. Nothing was written.'
          : 'The selected tweaks are no longer eligible on this rig. Preview the current plan again.')
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
      const experimentalCount = chosen.filter((tweak) =>
        isExperimentalTweak(tweak) || PINNACLE_EXPERIMENTAL_IDS.has(tweak.id),
      ).length
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
        !sameAuditReadback(previewAudit[tweak.id], freshAudit[tweak.id]),
      )
      if (auditChanged) {
        setPlanAudit((previous) => ({ ...(previous ?? {}), ...freshAudit }))
        setError('One or more settings in the apply lane changed since preview. The read-back is refreshed; review the updated rows before applying.')
        return
      }

      const transactionStatuses: TransactionReport['status'][] = []
      let requested = 0
      let attempted = 0
      let alreadyAtTarget = 0
      let committed = 0
      let rolledBack = 0
      let safetyReverted = 0
      let safetyRevertDetail: string | undefined
      const applyErrors: string[] = []
      const actionDetails: AstaActionDetail[] = []
      const appliedReceiptIds = new Set<string>()
      // Safety rollback may target every active receipt from this run, but
      // reboot persistence proof may target only receipts with an individual
      // verified live read-back. Keeping these sets separate prevents an
      // explicit/unverified action from being presented as persistence proof.
      const verifiedReceiptIds = new Set<string>()
      const appliedReceiptKeys = new Map<string, string>()
      const receiptActionKey = (tweakId: string, kind: string) => `${tweakId}::${kind}`
      const rememberAppliedReceipt = (
        receiptId: string,
        tweakId: string,
        kind: string,
        verificationStatus?: AppliedTweak['verificationStatus'] | null,
      ) => {
        appliedReceiptIds.add(receiptId)
        appliedReceiptKeys.set(receiptId, receiptActionKey(tweakId, kind))
        if (verificationStatus === 'verified') verifiedReceiptIds.add(receiptId)
      }
      const syncVerifiedReceiptIds = (rows: AppliedTweak[]) => {
        for (const row of rows) {
          if (
            appliedReceiptIds.has(row.receiptId)
            && row.status === 'applied'
            && row.verificationStatus === 'verified'
          ) {
            verifiedReceiptIds.add(row.receiptId)
          }
        }
        for (const receiptId of [...verifiedReceiptIds]) {
          const row = rows.find((candidate) => candidate.receiptId === receiptId)
          if (!row || row.status !== 'applied' || row.verificationStatus !== 'verified') {
            verifiedReceiptIds.delete(receiptId)
          }
        }
      }
      const alreadyMatchingIds = new Set(executionTweaks
        .filter((tweak) => freshAudit[tweak.id]?.status === 'matches')
        .map((tweak) => tweak.id))
      alreadyAtTarget = alreadyMatchingIds.size
      const transactionalIds = new Set([
        ...transactional,
        ...reviewTransactional,
      ].map((item) => item.tweakId))
      const firstApplySetupTweaks = executionTweaks.filter((tweak) =>
        isSafeFirstApplyAudit(tweak, freshAudit[tweak.id]),
      )
      const firstApplySetupIds = new Set(firstApplySetupTweaks.map((tweak) => tweak.id))
      const notApplicableTweaks = executionTweaks.filter((tweak) =>
        isNotApplicableAudit(freshAudit[tweak.id]),
      )
      const notApplicableIds = new Set(notApplicableTweaks.map((tweak) => tweak.id))
      const policyOwnedTweaks = executionTweaks.filter((tweak) =>
        isPolicyOwnedOrInactiveAudit(tweak.id, freshAudit[tweak.id]),
      )
      const policyOwnedIds = new Set(policyOwnedTweaks.map((tweak) => tweak.id))
      const unreadableTransactionalIds = new Set(executionTweaks
        .filter((tweak) => transactionalIds.has(tweak.id))
        .filter((tweak) => !firstApplySetupIds.has(tweak.id))
        .filter((tweak) => !notApplicableIds.has(tweak.id))
        .filter((tweak) => freshAudit[tweak.id]?.actions.some((action) =>
          (action.status === 'unknown' || action.status === 'error')
          && !canNativeRetryProtectedRead(tweak, action),
        ))
        .map((tweak) => tweak.id))
      const firstApplySetupDetails = firstApplySetupTweaks.map((tweak) =>
        `${tweak.id}: first-run restore state will be captured before writing.`,
      )
      const notApplicableDetails = notApplicableTweaks.map((tweak) => {
        const detail = freshAudit[tweak.id]?.actions
          .map((action) => action.detail)
          .filter(Boolean)
          .join(' ')
        return `${tweak.id}: ${formatAstaAuditDetail(tweak.id, detail || 'This rig does not expose the requested capability.')}`
      })
      const policySkipDetails = policyOwnedTweaks.map((tweak) => {
        const detail = freshAudit[tweak.id]?.actions
          .map((action) => action.detail)
          .filter(Boolean)
          .join(' ')
        return `${tweak.id}: Asta did not overwrite this rule because Windows reports it as policy-owned or inactive in ActiveStore. ${detail || 'Review the active Group Policy/profile source before retrying.'}`
      })
      const preflightSkipDetails = executionTweaks
        .filter((tweak) => unreadableTransactionalIds.has(tweak.id))
        .map((tweak) => {
          const detail = freshAudit[tweak.id]?.actions
            .filter((action) => action.status === 'unknown' || action.status === 'error')
            .map((action) => action.detail)
            .filter(Boolean)
            .join(' ')
          return `${tweak.id}: ${formatAstaAuditDetail(tweak.id, detail || 'Live state could not be verified before writing.')}`
        })
      const excludeAlreadyMatching = (items: BatchItem[]) =>
        items.filter((item) =>
          !alreadyMatchingIds.has(item.tweakId)
          && !unreadableTransactionalIds.has(item.tweakId)
          && !notApplicableIds.has(item.tweakId)
          && !policyOwnedIds.has(item.tweakId),
        )
      // Review confirmation changes consent, not execution mechanics. Once
      // the user accepts that lane, merge it into the same native Asta batch
      // call so a large run does not reopen the elevation boundary for every
      // category of row.
      const activeTransactional = excludeAlreadyMatching([
        ...transactional,
        ...(applyReview ? reviewTransactional : []),
      ])
      const activeExplicit = excludeAlreadyMatching([
        ...explicit,
        ...(applyReview ? reviewExplicit : []),
      ])

      // apply_batch records receipts before it reports an aggregate elevated
      // error. Reconcile those durable rows instead of letting the frontend
      // report zero attempted actions after a partial native failure.
      const reconcileRecordedReceipts = async (
        items: BatchItem[],
      ): Promise<void> => {
        const keys = new Set(items.map((item) => `${item.tweakId}::${item.action.kind}`))
        let recorded: AppliedTweak[]
        try {
          recorded = await listApplied()
        } catch (e) {
          // Receipt recovery is diagnostic, not a reason to skip the after
          // benchmark. The native batch may have written durable rows even
          // when this read is temporarily unavailable; keep the run moving
          // so the user receives an honest safety result and can retry the
          // receipt read from Diff.
          applyErrors.push(`Receipt recovery could not read the durable apply record: ${e instanceof Error ? e.message : String(e)}`)
          return
        }
        const recovered = recorded.filter((receipt) => {
          // listApplied includes historical/superseded rows for the Diff UI;
          // only a currently active receipt can represent a write from this
          // failed batch or be a target for the later safety comparison.
          if (receipt.status !== 'applied') return false
          if (!keys.has(`${receipt.tweakId}::${receipt.kind}`)) return false
          const previous = receiptSnapshot.get(receipt.receiptId)
          // An aggregate native error confirms that the receipt store was
          // retained, not that every matching historical row was written by
          // this run. Only a new or changed receipt is recoverable evidence.
          return !previous || previous !== `${receipt.verificationStatus}\u0000${receipt.verificationDetail}`
        })
        attempted += recovered.length
        committed += recovered.filter((receipt) =>
          receipt.status === 'applied' && receipt.verificationStatus === 'verified',
        ).length
        for (const receipt of recovered) {
          rememberAppliedReceipt(receipt.receiptId, receipt.tweakId, receipt.kind, receipt.verificationStatus)
        }
        if (recovered.length > 0) {
          actionDetails.push(...recovered.map((receipt) => ({
            tweakId: receipt.tweakId,
            kind: receipt.kind,
            status: receipt.verificationStatus,
            detail: receipt.verificationDetail,
          })))
          applyErrors.push(`Recovered ${recovered.length} receipt${recovered.length === 1 ? '' : 's'} after the native batch reported an error; live verification is shown below.`)
        }
      }

      // Measure the host immediately before the first mutation. This is a
      // proxy for CPU/DPC/network/frame pacing, not a Fortnite FPS or input
      // latency guarantee, but it gives this run a real regression signal.
      const beforeBench = await captureAstaBench('before')
      if (!beforeBench) {
        // Asta must not make a blind mutation when its own safety baseline is
        // unavailable. The user can retry after the benchmark dependency is
        // healthy; no receipt or reboot proof is created by this run.
        setError((previous) => previous
          ? `${previous} Asta did not write any settings because the baseline benchmark could not be captured.`
          : 'Asta did not write any settings because the baseline benchmark could not be captured.')
        setBenchPhase('idle')
        setProgress('')
        return
      }

      const keepRepairReport = (report: TransactionReport) => {
        transactionStatuses.push(report.status)
        attempted += report.attemptedCount
        // Count only live, non-rolled-back verifications as committed. The
        // native report may retain a verified-before-rollback status for audit
        // purposes, but that setting is not still active after rollback.
        committed += report.items.filter((item) =>
          item.attempted
          && item.applied
          && !item.rolledBack
          && item.verificationStatus === 'verified',
        ).length
        rolledBack += report.items.filter((item) => item.rolledBack).length
        applyErrors.push(...report.errors, ...report.rollbackErrors)
        for (const item of report.items) {
          actionDetails.push({
            tweakId: item.tweakId,
            kind: item.actionKind,
            status: item.rolledBack
              ? 'rolled_back'
              : item.verificationStatus ?? (item.attempted ? (item.applied ? 'applied' : 'not_applied') : 'not_attempted'),
            detail: item.detail,
          })
          if (item.attempted && !item.rolledBack && item.receiptId) {
            rememberAppliedReceipt(item.receiptId, item.tweakId, item.actionKind, item.verificationStatus)
          }
          if (item.attempted && (!item.applied || item.rolledBack) && item.detail) {
            applyErrors.push(`${item.tweakId}: ${item.detail}`)
          }
        }
      }

      // Each catalog tweak is one atomic verified group, but the verified and
      // explicit lanes now share one native elevation boundary. A mismatch in
      // one verified group still cannot roll back unrelated groups, and
      // explicit actions remain visible for manual review rather than gaining
      // an automatic rollback contract they do not have.
      const activeItems = [...activeTransactional, ...activeExplicit]
      if (activeItems.length > 0) {
        requested += activeItems.length
        try {
          const report = await applyAstaBatch(activeTransactional, activeExplicit)
          keepRepairReport(report)
          setInflightNotice(null)
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e)
          applyErrors.push(`Asta apply batch: ${detail}`)
          await reconcileRecordedReceipts(activeItems)
        }
      }

      // The Asta batch already performed its own verified
      // read-back. Read durable receipts here instead of reopening a second
      // elevated verification path immediately after the mutation.
      let allLive: AppliedTweak[] = []
      let liveReadAvailable = false
      try {
        allLive = await listApplied()
        liveReadAvailable = true
      } catch (e) {
        // The receipts are still tracked by ID from the batch result or
        // reconciliation. Do not skip the after benchmark merely because the
        // summary read is unavailable; rollback can still use those IDs.
        applyErrors.push(`Apply receipt summary could not be read: ${e instanceof Error ? e.message : String(e)}`)
      }
      let live = allLive.filter((row) => appliedReceiptIds.has(row.receiptId))
      syncVerifiedReceiptIds(allLive)
      setAppliedRows(allLive)
      setApplied({
        requested,
        attempted,
        verified: live.filter((receipt) => receipt.verificationStatus === 'verified').length,
        mismatch: live.filter((receipt) => receipt.verificationStatus === 'mismatch').length,
        unknown: live.filter((receipt) => receipt.verificationStatus === 'unknown').length,
        skipped: plan.alreadyApplied.length + alreadyAtTarget,
        alreadyAtTarget,
        firstApplySetup: firstApplySetupTweaks.length,
        firstApplySetupDetails,
        notApplicable: notApplicableTweaks.length,
        notApplicableDetails,
        policySkipped: policyOwnedTweaks.length,
        policySkipDetails,
        preflightSkipped: unreadableTransactionalIds.size,
        preflightSkipDetails,
        transactional: activeTransactional.length,
        explicit: activeExplicit.length,
        committed,
        rolledBack,
        safetyReverted,
        safetyRevertDetail,
        persistenceExcluded: live.filter((receipt) => receipt.verificationStatus !== 'verified').length,
        actionDetails,
        reviewSkipped: applyReview ? 0 : chosenReview.length,
        manual: plan.manual.length,
        otherGame: plan.otherGame.length,
        notMatched: plan.notMatched.length,
        transactionStatus: summarizeTransactionStatus(transactionStatuses),
        errors: [...new Set(applyErrors)],
        ts: new Date().toLocaleTimeString(),
      })
      setProgress('Settling 4s before the after benchmark…')
      await new Promise((resolve) => window.setTimeout(resolve, 4000))
      const afterBench = await captureAstaBench('after')
      setBenchPhase(beforeBench && afterBench ? 'complete' : 'idle')

      // Asta is allowed to reject its own result. A three-run composite
      // regression is not proof that every setting is bad, but it is enough to
      // avoid leaving a newly applied, reversible batch active by accident.
      const closedLoop = evaluateClosedLoop(beforeBench, afterBench, {
        source: 'asta-proxy',
        baselineRuns: 3,
        afterRuns: 3,
      })
      setBenchEvidenceNote(
        closedLoop.missingMetrics.length > 0
          ? `Incomplete measurement: ${closedLoop.missingMetrics.join(', ')} was unavailable on one side, so the proxy delta is not a keep/revert signal. Repeat the bench when the network probe is healthy.`
          : closedLoop.verdict === 'insufficient'
            ? closedLoop.explanation
            : null,
      )
      const afterBenchMissing = !afterBench
      if ((closedLoop.verdict === 'regression' || afterBenchMissing) && appliedReceiptIds.size > 0) {
        setProgress(afterBenchMissing
          ? 'Asta Bench could not complete after apply; reverting this run…'
          : 'Asta Bench detected a material local regression; reverting this run…')
        const revertibleKeys = new Set(
          [...activeTransactional, ...activeExplicit]
            .filter((item) => isTransactionActionEligible(item.action))
            .map((item) => `${item.tweakId}::${item.action.kind}`),
        )
        const revertibleReceiptIds = [...appliedReceiptIds]
          .filter((receiptId) => revertibleKeys.has(appliedReceiptKeys.get(receiptId) ?? ''))
        const nonRevertibleCount = [...appliedReceiptIds]
          .filter((receiptId) => !revertibleKeys.has(appliedReceiptKeys.get(receiptId) ?? ''))
          .length
        if (revertibleReceiptIds.length > 0) {
          try {
            const revertReport = await revertBatch(revertibleReceiptIds)
            safetyReverted = revertReport.reverted
            rolledBack += revertReport.reverted
            for (const receiptId of revertibleReceiptIds) {
              if (!revertReport.failedReceiptIds.includes(receiptId)) {
                appliedReceiptIds.delete(receiptId)
                verifiedReceiptIds.delete(receiptId)
              }
            }
            const failed = revertReport.failedReceiptIds.length
            const reason = afterBenchMissing
              ? 'the after benchmark did not complete, so the run could not be judged safely'
              : `the proxy regressed by ${closedLoop.compositeDelta.toFixed(1)} points`
            safetyRevertDetail = failed === 0
              ? `Asta safety rollback reverted ${revertReport.reverted} newly applied action${revertReport.reverted === 1 ? '' : 's'} because ${reason}. The run was not armed for reboot persistence.`
              : `Asta could not safely keep this run because ${reason}; the safety rollback reverted ${revertReport.reverted}/${revertibleReceiptIds.length} actions. ${failed} receipt${failed === 1 ? '' : 's'} still need manual review.`
            if (nonRevertibleCount > 0) {
              safetyRevertDetail += ` ${nonRevertibleCount} explicit action${nonRevertibleCount === 1 ? '' : 's'} had no revert contract and remain visible for manual review.`
            }
            setBenchSafetyNote(safetyRevertDetail)
            try {
              allLive = await listApplied()
              liveReadAvailable = true
            } catch (e) {
              applyErrors.push(`Post-rollback receipt summary could not be read: ${e instanceof Error ? e.message : String(e)}`)
            }
            live = allLive.filter((row) => appliedReceiptIds.has(row.receiptId))
            syncVerifiedReceiptIds(allLive)
            setAppliedRows(allLive)
          } catch (e) {
            safetyRevertDetail = afterBenchMissing
              ? `Asta could not complete the after benchmark, and its automatic safety rollback failed: ${e instanceof Error ? e.message : String(e)}`
              : `Asta detected a proxy regression (${closedLoop.compositeDelta.toFixed(1)} points), but its automatic safety rollback failed: ${e instanceof Error ? e.message : String(e)}`
            applyErrors.push(safetyRevertDetail)
            setBenchSafetyNote(safetyRevertDetail)
          }
        } else {
          safetyRevertDetail = afterBenchMissing
            ? 'Asta could not complete the after benchmark, but the selected live actions had no revert contract. They were not silently discarded; review or revert them manually.'
            : `Asta detected a proxy regression (${closedLoop.compositeDelta.toFixed(1)} points), but the selected live actions had no revert contract. They were not silently discarded; review or revert them manually.`
          applyErrors.push(safetyRevertDetail)
          setBenchSafetyNote(safetyRevertDetail)
        }
      }

      // The native batch verifies immediately, but the after benchmark takes
      // time and another utility can change Windows during that window. Do a
      // final non-elevated read-back before arming reboot proof so the proof
      // set reflects the state that actually survived the benchmark.
      if (appliedReceiptIds.size > 0) {
        try {
          allLive = await verifyApplied()
          liveReadAvailable = true
          live = allLive.filter((row) => appliedReceiptIds.has(row.receiptId))
          syncVerifiedReceiptIds(allLive)
          setAppliedRows(allLive)
        } catch (e) {
          liveReadAvailable = false
          applyErrors.push(`Post-benchmark live read-back could not be completed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // Refresh the receipt summary after a possible safety rollback so the
      // UI cannot claim that a reverted setting is still active.
      setApplied({
        requested,
        attempted,
        verified: live.filter((receipt) => receipt.verificationStatus === 'verified').length,
        mismatch: live.filter((receipt) => receipt.verificationStatus === 'mismatch').length,
        unknown: live.filter((receipt) => receipt.verificationStatus === 'unknown').length,
        skipped: plan.alreadyApplied.length + alreadyAtTarget,
        alreadyAtTarget,
        firstApplySetup: firstApplySetupTweaks.length,
        firstApplySetupDetails,
        notApplicable: notApplicableTweaks.length,
        notApplicableDetails,
        policySkipped: policyOwnedTweaks.length,
        policySkipDetails,
        preflightSkipped: unreadableTransactionalIds.size,
        preflightSkipDetails,
        transactional: activeTransactional.length,
        explicit: activeExplicit.length,
        committed,
        rolledBack,
        safetyReverted,
        safetyRevertDetail,
        persistenceExcluded: live.filter((receipt) => receipt.verificationStatus !== 'verified').length,
        actionDetails,
        reviewSkipped: applyReview ? 0 : chosenReview.length,
        manual: plan.manual.length,
        otherGame: plan.otherGame.length,
        notMatched: plan.notMatched.length,
        transactionStatus: summarizeTransactionStatus(transactionStatuses),
        errors: [...new Set(applyErrors)],
        ts: new Date().toLocaleTimeString(),
      })

      // Arm an exact receipt set automatically. This proves only that the
      // reboot check is ready; persistence is not claimed until Windows is
      // restarted and the user runs the explicit post-boot check.
      try {
        const persistenceReceiptIds = [...verifiedReceiptIds].filter((receiptId) =>
          liveReadAvailable
          && live.some((row) => row.receiptId === receiptId && row.status === 'applied' && row.verificationStatus === 'verified'),
        )
        if (persistenceReceiptIds.length === 0) {
          if (appliedReceiptIds.size > 0) {
            setBenchError((previous) => previous
              ? `${previous} persistence: no current action had a verified live read-back after the after-benchmark, so reboot proof was not armed.`
              : 'persistence: no current action had a verified live read-back after the after-benchmark, so reboot proof was not armed.')
          }
          setRebootProof(null)
        } else if (
          !beforeBench ||
          !afterBench ||
          closedLoop.verdict === 'insufficient' ||
          closedLoop.missingMetrics.length > 0 ||
          closedLoop.verdict === 'regression'
        ) {
          // Incomplete evidence, missing metrics, or a material regression
          // must never arm a reboot proof, even if an explicit-only action
          // could not be reverted automatically.
          setRebootProof(null)
        } else {
          setRebootProof(await armRebootValidation(persistenceReceiptIds))
        }
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e)
        setBenchError((previous) => previous ? `${previous} persistence: ${detail}` : `persistence: ${detail}`)
      }
      setProgress('')
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

      {/* 4-Step Self-Explanatory Process Guide */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="surface-card p-4 rounded-xl border border-border space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-bg-base">1</span>
            <span className="text-xs font-semibold text-text uppercase tracking-wider">Rig Audit</span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">Live preflight scans CPU, GPU, and OS build. Policy-owned, unsupported, or ambiguous rows are excluded safely.</p>
        </div>
        <div className="surface-card p-4 rounded-xl border border-border space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-bg-base">2</span>
            <span className="text-xs font-semibold text-text uppercase tracking-wider">1-Click Apply</span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">Applies all supported Pinnacle settings in one native UAC prompt. Immediate read-back receipts verify each tweak.</p>
        </div>
        <div className="surface-card p-4 rounded-xl border border-border space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-bg-base">3</span>
            <span className="text-xs font-semibold text-text uppercase tracking-wider">Reboot Check</span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">Restart Windows, then use <em>Check after reboot</em> to verify settings persisted through Windows boot.</p>
        </div>
        <div className="surface-card p-4 rounded-xl border border-border space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-bg-base">4</span>
            <span className="text-xs font-semibold text-text uppercase tracking-wider">Game Proof</span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">Compare 1% lows and frame pacing in your actual game. Reversible anytime with one-click rollback.</p>
        </div>
      </section>

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
              Pinnacle Asta inventories the full catalog for this rig and Fortnite context, then
              automatically selects every matching, evidence-backed action that has a complete
              native read-back and restore path. Named experimental actions are included only
              when they pass the same contract and hardware checks. Unverifiable, policy-owned,
              firmware, static-file, security-weakening, unreviewed situational, and ambiguous
              rows stay visible but unchecked for intentional review.
              A normal Asta apply uses one batched Windows consent, not one prompt per tweak.
              Protected preflight, read-back, or a failure-only safety rollback can require an
              additional consent.
              Windows UAC is real user consent; the app never bypasses it.
              BIOS/NVRAM/firmware changes never become automatic.
            </p>
            <p className="mt-2 rounded-md border border-sky-300/20 bg-sky-300/5 px-3 py-2 text-xs leading-relaxed text-text-muted">
              <strong className="text-text">Ethernet note:</strong> Asta includes cataloged RSS, EEE,
              and interrupt-moderation controls when they match the rig. Driver scripts without
              exact read-back and restore handling stay in the separate review lane. Wake on Magic
              Packet only wakes a sleeping PC; it is not an active-game latency setting, so Asta
              does not toggle it as a performance tweak.
            </p>

            <div className="mt-3">
              <NvpiManualStepCard gpuVendor={spec?.gpu.vendor} canApply={isVip && isNative} />
            </div>

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
                <span className="block mt-1 text-[11px] text-text-subtle">
                  This catalog contains {catalog.tweaks.length} rows. Eligible means a matching software row that is not already verified;
                  already-on-target rows are skipped without a write. Separate-review rows are included in the eligible count, not added to it.
                </span>
                {reviewedPlan && planAudit && (
                  <span className="block mt-1 text-[11px] text-emerald-200">
                    Pinnacle plan: {pinnacleDefaultCount} setting{pinnacleDefaultCount === 1 ? '' : 's'} selected automatically after read-back, including {pinnacleExperimentalCount} vetted experimental setting{pinnacleExperimentalCount === 1 ? '' : 's'}; only unverifiable, policy-owned, manual, firmware, unsupported, or unreviewed situational rows stay unchecked.
                  </span>
                )}
              </div>
            )}

            {displayPlan && (
              <PinnacleCoverageCard
                automaticCount={reviewedPlan && planAudit ? pinnacleDefaultCount : null}
                eligibleCount={displayPlan.candidates.length}
                alreadyOnTarget={displayPlan.alreadyApplied.length}
                reviewCount={displayPlan.review.length}
                manualCount={displayPlan.manual.length}
                excludedCount={displayPlan.notMatched.length + displayPlan.otherGame.length}
                isLaptop={Boolean(spec?.mobo.isLaptop)}
              />
            )}

            {inflightNotice && (
              <div className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 leading-relaxed">
                <strong className="text-amber-200">Previous Asta run was interrupted.</strong>{' '}
                The last run stopped before it recorded a final receipt state ({inflightNotice.actionCount} planned action{inflightNotice.actionCount === 1 ? '' : 's'}, started {new Date(inflightNotice.startedAt).toLocaleString()}). Asta did not assume that nothing changed and did not auto-revert from this warning. Run <strong>Preview exact changes</strong> to reconcile the live state, then use the receipt details or Revert latest Asta run if needed.
              </div>
            )}

            {inventory && (
              <div className="mt-3 rounded-md border border-amber-200/20 bg-black/20 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-text">Read-only plan review</p>
                    <p className="text-[11px] text-text-muted">Review is optional. The main Asta button reads current settings, selects every supported Pinnacle row, and applies the plan in one guided run. Opening this page alone never requests UAC or changes Windows.</p>
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
                        ? 'Refresh exact changes'
                        : 'Review exact changes (optional)'}
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
                        {selectionCustomized
                          ? `${selectedCount} setting${selectedCount === 1 ? '' : 's'} selected (${pinnacleDefaultCount} Pinnacle defaults available, ${pinnacleExperimentalCount} experimental)`
                          : `${selectedCount} Pinnacle setting${selectedCount === 1 ? '' : 's'} selected automatically (${pinnacleDefaultCount} available, ${pinnacleExperimentalCount} experimental)`}
                        {' '}· values read at {new Date(Object.values(planAudit)[0]?.scannedAt ?? Date.now()).toLocaleTimeString()}.
                        {' '}Unknown means read-back could not prove the target; protected Windows reads are retried under the apply UAC boundary, while other ambiguous rows stay blocked with their fix.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIds(new Set(reviewedPlan.candidates
                              .filter((tweak) => isPinnacleDefaultCandidate(tweak, planAudit[tweak.id]))
                              .map((tweak) => tweak.id)))
                            setSelectionCustomized(false)
                          }}
                          className="text-[11px] text-sky-300 underline underline-offset-2"
                        >Use Pinnacle defaults</button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIds(new Set())
                            setSelectionCustomized(true)
                          }}
                          className="text-[11px] text-text-muted underline underline-offset-2"
                        >Clear selection</button>
                      </div>
                    </div>
                    <details className="rounded border border-white/10 bg-black/10">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-text">
                        Advanced selection (optional) · {reviewedPlan.candidates.length} eligible rows — unchecked rows stay untouched
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
                              setSelectionCustomized(true)
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
              <div className="mt-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3.5 text-xs text-amber-200 leading-snug flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-300 font-bold">👑 Asta Mode (VIP Only)</span>
                    <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] uppercase font-semibold text-amber-300">Free Preview</span>
                  </div>
                  <p className="text-amber-200/90 text-xs">
                    You can preview all hardware-matched settings and read-back diagnostics below. Upgrade to VIP or redeem your code to unlock 1-click apply, composite benchmarking, and reboot persistence.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to="/pricing"
                    className="btn-chrome px-3 py-1.5 rounded-md bg-amber-400 text-bg-base font-semibold text-xs whitespace-nowrap hover:bg-amber-300 transition"
                  >
                    View VIP ($115) →
                  </Link>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            {busy && progress && (
              <div className="mt-3 rounded-md border border-sky-300/20 bg-sky-300/5 px-3 py-2 text-xs text-sky-100">
                {progress}
              </div>
            )}

            {applied && (
              <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${applied.errors.length || applied.mismatch || applied.preflightSkipped || applied.notApplicable || applied.policySkipped || applied.rolledBack || applied.safetyReverted ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>
                {applied.requested === 0
                  ? applied.notApplicable > 0 && applied.preflightSkipped === 0
                    ? 'No applicable settings were changed'
                    : applied.preflightSkipped > 0
                    ? 'No settings were changed'
                    : 'No write was needed for this selection'
                  : `${applied.attempted}/${applied.requested} actions attempted`}
                {applied.requested > 0 && applied.verified > 0 ? ` · ${applied.verified} verified live` : ''}
                {applied.requested > 0 && applied.rolledBack > 0 ? ` · ${applied.rolledBack} rolled back` : ''}
                {applied.requested > 0 && applied.mismatch > 0 ? ` · ${applied.mismatch} mismatch` : ''}
                {applied.requested > 0 && applied.unknown > 0 ? ` · ${applied.unknown} unverified` : ''} (at {applied.ts}).
                {applied.alreadyAtTarget > 0 ? ` ${applied.alreadyAtTarget} selected tweak${applied.alreadyAtTarget === 1 ? ' was' : 's were'} already at target and left unchanged.` : ''}
                {applied.skipped > applied.alreadyAtTarget ? ` ${applied.skipped - applied.alreadyAtTarget} previously verified tweak${applied.skipped - applied.alreadyAtTarget === 1 ? ' was' : 's were'} skipped.` : ''}
                {applied.firstApplySetup > 0 ? ` ${applied.firstApplySetup} first-run restore record${applied.firstApplySetup === 1 ? ' was' : 's were'} created before writing.` : ''}
                {applied.transactional > 0 ? ` ${applied.transactional} actions used verified transactions.` : ''}
                {applied.explicit > 0 ? ` ${applied.explicit} actions used explicit review.` : ''}
                {applied.reviewSkipped > 0 ? ` ${applied.reviewSkipped} higher-risk rows stayed unapplied because the review confirmation was declined.` : ''}
                {applied.notApplicable > 0 ? ` ${applied.notApplicable} selected tweak${applied.notApplicable === 1 ? ' was' : 's were'} not applicable to this rig; no write was attempted for ${applied.notApplicable === 1 ? 'it' : 'them'}.` : ''}
                {applied.policySkipped > 0 ? ` ${applied.policySkipped} selected tweak${applied.policySkipped === 1 ? ' was' : 's were'} skipped because Windows reported a managed or inactive policy; no write was attempted.` : ''}
                {applied.preflightSkipped > 0 ? ` ${applied.preflightSkipped} selected tweak${applied.preflightSkipped === 1 ? ' was' : 's were'} not attempted because its live state was still ambiguous; no write was attempted. Protected permission reads are retried inside the apply UAC boundary.` : ''}
                {applied.persistenceExcluded > 0 ? ` ${applied.persistenceExcluded} active action${applied.persistenceExcluded === 1 ? ' remains' : 's remain'} unverified and is excluded from reboot-persistence proof.` : ''}
                {applied.transactionStatus ? ` Transaction status: ${applied.transactionStatus}.` : ''}
                {applied.firstApplySetupDetails.length > 0 && <span className="block mt-1 text-emerald-200">First-run setup: {applied.firstApplySetupDetails.join(' · ')}</span>}
                {applied.notApplicableDetails.length > 0 && <span className="block mt-1 text-sky-200">Not applicable / no action taken: {applied.notApplicableDetails.slice(0, 5).join(' · ')}</span>}
                {applied.policySkipDetails.length > 0 && <span className="block mt-1 text-sky-200">Policy-owned / inactive; no action taken: {applied.policySkipDetails.slice(0, 5).join(' · ')}</span>}
                {applied.preflightSkipDetails.length > 0 && <span className="block mt-1 text-amber-200">Not attempted / next fix: {applied.preflightSkipDetails.slice(0, 5).join(' · ')}</span>}
                {applied.safetyRevertDetail && <span className="block mt-1 text-amber-200">Safety action: {applied.safetyRevertDetail}</span>}
                {applied.errors.length > 0 && <span className="block mt-1 text-amber-200">Some independent tweaks need attention: {applied.errors.slice(0, 5).join(' · ')}</span>}
                {applied.actionDetails.length > 0 && (
                  <details className="mt-2 rounded border border-white/10 bg-black/10">
                    <summary className="cursor-pointer px-2 py-1.5 text-[11px] text-text-muted">
                      Action receipt details ({applied.actionDetails.length})
                    </summary>
                    <div className="max-h-64 space-y-1 overflow-y-auto px-2 pb-2">
                      {applied.actionDetails.map((detail, index) => (
                        <div key={`${detail.tweakId}-${detail.kind}-${index}`} className="rounded border border-white/10 px-2 py-1 text-[11px]">
                          <span className={detail.status === 'verified' ? 'text-emerald-300' : detail.status === 'mismatch' || detail.status === 'rolled_back' ? 'text-amber-200' : 'text-text-muted'}>
                            {detail.status}
                          </span>
                          <span className="text-text-subtle"> · {detail.tweakId} · {detail.kind}</span>
                          {detail.detail && <span className="mt-0.5 block text-text-muted">{detail.detail}</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                Immediate receipt status is separate from reboot persistence and gameplay outcome. Asta does not leave a newly applied reversible run armed when the three-run local proxy materially regresses.
              </div>
            )}

            {(benchBefore || benchAfter || benchError) && (
              <AstaBenchResult
                phase={benchPhase}
                before={benchBefore}
                after={benchAfter}
                error={benchError}
                safetyNote={benchSafetyNote}
                evidenceNote={benchEvidenceNote}
                rebootProof={rebootProof}
              />
            )}

            {preflight?.blocksAutoApply && (
              <div className="mt-3 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-100 leading-snug">
                <strong className="text-red-200">Windows stability gate:</strong> {preflight.detail}{' '}
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

            {preflight?.pendingReboot && !preflight.windowsUpdateActive && (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 leading-snug">
                <strong className="text-amber-200">Pending Windows restart:</strong> Asta can apply now.
                Restart before using the reboot-persistence check so Windows can finish the pending update.
              </div>
            )}

            {preflight &&
              !preflight.blocksAutoApply &&
              preflight.buildChangedSinceLastApply &&
              !preflight.pendingReboot && (
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
                onClick={() => void handleApply('pinnacle')}
                disabled={busy || previewBusy || !isNative || !isVip || preflight?.blocksAutoApply}
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
                  : !isVip
                    ? '👑 VIP only'
                    : pinnacleDefaultCount > 0 && previewIsCurrent
                      ? `🗡 Apply all supported Pinnacle settings (${pinnacleDefaultCount})`
                      : '🗡 Apply all supported Pinnacle settings'}
              </button>
              {reviewedPlan && planAudit && previewIsCurrent && selectionCustomized && selectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleApply('selected')}
                  disabled={busy || previewBusy || !isNative || !isVip || preflight?.blocksAutoApply}
                  className="w-full rounded-md border border-sky-300/30 px-4 py-2 text-xs text-sky-200 hover:bg-sky-300/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Apply selected advanced rows ({selectedCount})
                </button>
              )}
              <p className="text-center text-[11px] text-text-subtle">
                One click reads live state first. It applies only supported, read-back-safe Pinnacle settings;
                review-only, policy-owned, unsupported, and ambiguous rows stay out automatically.
              </p>
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
    // Keep every row outside the automatic policy in the explicit review
    // lane. This prevents a manual checkbox from quietly bypassing the same
    // evidence/contract boundary that the automatic selector uses.
    if (!isPinnacleAutomaticShapeCandidate(tweak)) review.push(tweak)
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

function AstaBenchResult({
  phase,
  before,
  after,
  error,
  safetyNote,
  evidenceNote,
  rebootProof,
}: {
  phase: AstaBenchPhase
  before: BenchScored | null
  after: BenchScored | null
  error: string | null
  safetyNote: string | null
  evidenceNote: string | null
  rebootProof: RebootValidation | null
}) {
  const delta = before && after ? after.composite - before.composite : null
  const noiseFloor = measurementNoiseFloor(
    before ? { mad: before.runMad, spread: before.runSpread } : null,
    after ? { mad: after.runMad, spread: after.runSpread } : null,
  )
  const insideNoise = delta != null && noiseFloor != null && Math.abs(delta) < noiseFloor
  const verdict = evidenceNote
    ? 'inconclusive — repeat the proxy bench'
    : delta == null
    ? 'inconclusive — one side of the proxy bench is missing'
    : insideNoise
      ? 'inside normal run-to-run noise'
    : Math.abs(delta) < 1
      ? 'no meaningful proxy change'
      : delta > 0
        ? 'proxy improved'
        : 'proxy regressed'
  const verdictClass = evidenceNote || delta == null || insideNoise || Math.abs(delta) < 1
    ? 'text-amber-200'
    : delta > 0
      ? 'text-emerald-300'
      : 'text-red-300'
  const persistence = rebootProof?.status === 'armed'
    ? 'armed — restart Windows, then use Check after reboot'
    : rebootProof?.status === 'verified'
      ? 'verified after a real Windows reboot'
      : rebootProof?.status === 'mismatch'
        ? 'mismatch after reboot — inspect the listed receipts'
        : rebootProof?.status === 'unknown'
          ? 'unknown after reboot — at least one read-back was unavailable'
          : rebootProof?.status === 'awaiting_reboot'
            ? 'awaiting a real Windows reboot'
            : 'not proven yet'

  return (
    <div className="mt-3 rounded-md border border-sky-300/30 bg-sky-300/5 px-3 py-3 text-xs text-text-muted leading-relaxed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-text">Automatic Asta Bench (median of 3)</strong>
        <span className={verdictClass}>{phase === 'before' || phase === 'after' ? 'measuring…' : verdict}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BenchValue label="before" value={before?.composite} />
        <BenchValue label="after" value={after?.composite} />
        <BenchValue label="delta" value={delta} signed />
        <BenchValue label="persistence" value={undefined} text={persistence} />
      </div>
      <p className="mt-2 text-[11px]">
        The composite is the median of three runs combining CPU, DPC, ping-jitter to 1.1.1.1, and
        desktop frame pacing. It is a host proxy, not proof of Fortnite FPS, server ping, or input
        latency. A negative or tiny result is a reason to revert/compare under the same game
        conditions.
      </p>
      {before && after ? (
        <p className="mt-2 text-[11px] text-sky-200/90">
          Measurement stability: typical run variation was {formatBenchVariation(before)} before and{' '}
          {formatBenchVariation(after)} after. Treat a before/after delta smaller than about{' '}
          {noiseFloor?.toFixed(1) ?? '—'} points as noise, not a performance claim.
        </p>
      ) : null}
      {evidenceNote ? <p className="mt-2 text-amber-200">Measurement quality: {evidenceNote}</p> : null}
      {safetyNote ? <p className="mt-2 text-amber-200">Safety action: {safetyNote}</p> : null}
      {error ? <p className="mt-2 text-amber-200">Measurement/persistence note: {error}</p> : null}
    </div>
  )
}

function formatBenchVariation(sample: BenchScored): string {
  if (sample.runMad == null || sample.runSpread == null) return 'not recorded'
  return `${sample.runMad.toFixed(1)} points (range ${sample.runSpread.toFixed(1)})`
}

function BenchValue({
  label,
  value,
  text,
  signed = false,
}: {
  label: string
  value?: number | null
  text?: string
  signed?: boolean
}) {
  const shown = text ?? (value == null ? '—' : `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}`)
  return (
    <div className="rounded border border-white/10 bg-black/10 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="mt-0.5 text-[11px] text-text">{shown}</p>
    </div>
  )
}

function sameAuditReadback(before: TweakAudit | undefined, after: TweakAudit | undefined): boolean {
  if (!before || !after || before.status !== after.status || before.total !== after.total) return false
  if (before.actions.length !== after.actions.length) return false
  return before.actions.every((action, index) => {
    const current = after.actions[index]
    return current?.index === action.index && current.status === action.status && current.detail === action.detail
  })
}

function isSafeFirstApplyAudit(tweak: TweakRecord, audit: TweakAudit | undefined): boolean {
  if (!SAFE_FIRST_APPLY_IDS.has(tweak.id) || !audit?.actions.length) return false
  return audit.actions.every((action) => {
    const detail = action.detail.trim()
    return action.status === 'unknown' && detail.startsWith('NOT_CONFIGURED:')
  })
}

/**
 * Decide which rows the one-click Asta plan may select automatically.
 *
 * A successful read-back proves that a setting landed, not that it improved
 * Fortnite. The automatic plan therefore uses the catalog's evidence grade,
 * risk/anti-cheat metadata, and transaction contract instead of a stale
 * hand-maintained ID allow-list. Standard measured/mechanism rows are
 * included when they pass the policy; only the named experimental lane may
 * add situational rows. Every selected row still needs a readable live state
 * (or one of the documented first-apply records).
 */
function isPinnacleAutomaticShapeCandidate(tweak: TweakRecord): boolean {
  const pinnacleExperimental = PINNACLE_EXPERIMENTAL_IDS.has(tweak.id)
  const pinnacleBaseline = PINNACLE_BASELINE_IDS.has(tweak.id)
  const hardBlocked = isHardBlockedForAutoTune(tweak)
  if (!pinnacleExperimental && !pinnacleBaseline && (hardBlocked || isExperimentalTweak(tweak))) return false
  // Named experimental hardware actions may be risk 3, but risk 4/security
  // changes never enter the automatic plan. These named rows remain visibly
  // experimental in the plan and confirmation copy.
  if (tweak.riskLevel > (pinnacleExperimental ? 3 : 2) || tweak.anticheatRisk !== 'none') return false
  if (Object.values(tweak.tournamentCompliance ?? {}).some((value) => value === 'breaks')) return false
  if (tweak.actions.some((action) =>
    action.kind === 'file_write'
      && /(?:GameUserSettings\.ini|Engine\.ini|videoconfig\.txt|autoexec\.cfg)$/i.test(action.path ?? ''),
  )) return false
  if (tweak.actions.length === 0 || !tweak.actions.every(isTransactionActionEligible)) return false
  const evidenceIsAutomatic = ['measured', 'mechanism'].includes(tweak.evidenceTier ?? '')
  const evidenceIsNamed = (pinnacleExperimental || pinnacleBaseline)
    && ['situational', 'measured', 'mechanism'].includes(tweak.evidenceTier ?? '')
  if (!evidenceIsAutomatic && !evidenceIsNamed) return false
  return true
}

function isPinnacleDefaultCandidate(tweak: TweakRecord, audit: TweakAudit | undefined): boolean {
  if (!isPinnacleAutomaticShapeCandidate(tweak)) return false
  if (!audit?.actions.length) return false
  if (isSafeFirstApplyAudit(tweak, audit)) return true
  if (audit.actions.some((action) => action.status === 'unknown' || action.status === 'error')) return false
  return audit.actions.some((action) => action.status === 'differs')
}

function pinnacleExclusionReason(tweak: TweakRecord, audit: TweakAudit | undefined): string {
  const pinnacleExperimental = PINNACLE_EXPERIMENTAL_IDS.has(tweak.id)
  const pinnacleBaseline = PINNACLE_BASELINE_IDS.has(tweak.id)
  if (isHardBlockedForAutoTune(tweak) && !pinnacleExperimental && !pinnacleBaseline) return 'Review-only: Windows cannot prove this action safely in the automatic lane.'
  if (isExperimentalTweak(tweak) && !pinnacleExperimental) return 'Experimental: visible for advanced testing, not part of the reviewed Pinnacle lane.'
  if (tweak.riskLevel > (pinnacleExperimental ? 3 : 2) || tweak.anticheatRisk !== 'none') return 'Held for explicit review because its risk or anti-cheat compatibility is outside the automatic policy.'
  if (Object.values(tweak.tournamentCompliance ?? {}).some((value) => value === 'breaks')) return 'Held for explicit review because its tournament-compatibility metadata requires a deliberate decision.'
  if (tweak.actions.some((action) =>
    action.kind === 'file_write'
      && /(?:GameUserSettings\.ini|Engine\.ini|videoconfig\.txt|autoexec\.cfg)$/i.test(action.path ?? ''),
  )) return 'Manual game-file action: Asta does not rewrite static game configuration automatically.'
  if (!tweak.actions.every(isTransactionActionEligible)) return 'Manual/explicit action: it has no complete native read-back and restore contract.'
  if (!['measured', 'mechanism'].includes(tweak.evidenceTier ?? '') && !pinnacleExperimental && !pinnacleBaseline) return 'Evidence is situational or cosmetic; Asta leaves it opt-in until the local condition is confirmed.'
  if (audit?.actions.some((action) => action.status === 'unknown' || action.status === 'error')) return pinnacleExperimental
    ? 'Vetted experimental action held back because live state is ambiguous; Asta will not write without a safe read-back.'
    : 'Not selected: live state is ambiguous, so Asta will not write it automatically.'
  if (audit?.actions.every((action) => action.status === 'matches')) return 'Already at the requested live value; no write is needed.'
  return pinnacleExperimental
    ? 'Vetted experimental action is waiting for a compatible live read-back.'
    : 'Not selected by the current automatic safety gate.'
}

function isNotApplicableAudit(audit: TweakAudit | undefined): boolean {
  if (!audit?.actions.length) return false
  return audit.actions.every((action) => {
    return action.status === 'unknown' && /^NOT_APPLICABLE:/i.test(action.detail.trim())
  })
}

function isPolicyOwnedOrInactiveAudit(tweakId: string, audit: TweakAudit | undefined): boolean {
  // This guard is intentionally narrow. Asta must not infer policy ownership
  // from an arbitrary unknown row, but it must fail closed for the known QoS
  // case where a local rule exists without an effective ActiveStore entry.
  if (tweakId !== 'network.qos.dscp-tag' || !audit?.actions.length) return false
  return audit.actions.some((action) => {
    const detail = action.detail
    const inactiveLocalRule = /unknown:\s*[\s\S]*(?:stored\s+locally|not\s+present\s+in\s+activestore|review\s+the\s+policy\s+source)/i.test(detail)
    // A valid target may itself be owned by Group Policy and mention
    // ActiveStore. Only treat ownership as a write-block when the audit did
    // not confirm the requested live target; never skip a matching effective
    // rule merely because its owner is managed.
    const managedRule = action.status !== 'matches'
      && /owner\s*=\s*(?:group\s+policy|mdm|domain|managed)/i.test(detail)
    return inactiveLocalRule || managedRule
  })
}

function canNativeRetryProtectedRead(
  tweak: TweakRecord,
  action: TweakAudit['actions'][number],
): boolean {
  if (action.status !== 'unknown' && action.status !== 'error') return false
  const catalogAction = tweak.actions[action.index]
  const protectedRead = catalogAction?.kind === 'bcdedit_set'
    || (catalogAction?.kind === 'powershell_script' && Boolean(catalogAction.verify?.trim()))
  if (!protectedRead) return false
  const detail = action.detail.toLowerCase()
  return /access[\s_-]*(?:is[\s_-]*)?denied|permission[\s_-]*denied|error[\s_-]*5|preflight[\s_-]*could not[\s_-]*read|get-netqospolicy|get-mmagent|bcdedit/.test(detail)
}

function summarizeTransactionStatus(
  statuses: TransactionReport['status'][],
): TransactionReport['status'] | undefined {
  if (statuses.length === 0) return undefined
  if (statuses.length === 1) return statuses[0]
  if (statuses.every((status) => status === 'committed')) return 'committed'
  if (statuses.every((status) => status === 'rolled_back')) return 'rolled_back'
  if (statuses.every((status) => status === 'failed')) return 'failed'
  return 'partial'
}

function formatAstaAuditDetail(tweakId: string, detail: string): string {
  const text = detail.trim()
  if (/no declared read-back contract/i.test(text)) {
    const note = manualPowerShellVerificationNote(tweakId)
    if (note) return note
  }
  if (text.startsWith('NOT_APPLICABLE:')) {
    const reason = text.slice('NOT_APPLICABLE:'.length).trim()
    return `${reason} No write was attempted because this capability is not exposed on this rig.`
  }
  if (text.startsWith('NOT_CONFIGURED:')) {
    const reason = text.slice('NOT_CONFIGURED:'.length).trim()
    if (SAFE_FIRST_APPLY_IDS.has(tweakId)) {
      return `${reason} Fix: Asta will capture the restore state before enabling this setting on first apply.`
    }
    return `${reason} Fix: use the named setup or restore path before retrying.`
  }
  if (/access[\s_-]*(?:is[\s_-]*)?denied|permission[\s_-]*denied|permissiondenied|error[\s_-]*5|get-netqospolicy|get-mmagent/i.test(text)) {
    return `${text} Fix: this is a protected Windows read, not proof of drift. Asta retries it inside the apply UAC boundary; if Windows still refuses it, no write is treated as verified.`
  }
  if (/ownership record|recovery data|recovery record/i.test(text)) {
    return `${text} Fix: use Settings -> Restore/repair, or revert the named app-owned change before retrying.`
  }
  if (/^MISMATCH:/i.test(text)) {
    return `${text} Fix: re-apply this row after confirming the active adapter, policy, or power plan has not changed.`
  }
  return text
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
  const pinnacleExperimental = PINNACLE_EXPERIMENTAL_IDS.has(tweak.id)
  const pinnacleDefault = isPinnacleDefaultCandidate(tweak, audit ?? undefined)
  const lane = pinnacleDefault
    ? pinnacleExperimental ? 'Pinnacle experimental' : 'Pinnacle default'
    : reviewOnly
      ? 'Separate review confirmation'
      : isExperimentalTweak(tweak)
        ? 'Advanced experimental'
        : transactional
          ? 'Verified, opt-in'
          : 'Explicit review'
  const matchCount = audit?.actions.filter((action) => action.status === 'matches').length ?? 0
  const differsCount = audit?.actions.filter((action) => action.status === 'differs').length ?? 0
  const unknownCount = audit?.actions.filter((action) => action.status === 'unknown').length ?? 0
  const errorCount = audit?.actions.filter((action) => action.status === 'error').length ?? 0
  const manualVerificationNote = manualPowerShellVerificationNote(tweak.id)
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
            <span className={`rounded border px-2 py-0.5 text-[10px] ${pinnacleDefault && !pinnacleExperimental ? 'border-emerald-500/50 text-emerald-200' : pinnacleExperimental || reviewOnly || isExperimentalTweak(tweak) ? 'border-amber-500/40 text-amber-200' : transactional ? 'border-sky-500/40 text-sky-300' : 'border-slate-400/40 text-slate-200'}`}>
              {lane}
            </span>
          </span>
          <span className="mt-1 block text-[11px] text-text-subtle">
            {tweak.category} · risk {tweak.riskLevel}/4 · anti-cheat risk {tweak.anticheatRisk} · reboot {tweak.rebootRequired}
            {tweak.evidenceTier ? ` · evidence ${tweak.evidenceTier}` : ''}
            {isExperimentalTweak(tweak) || pinnacleExperimental ? ' · experimental' : ''}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-text-muted">{tweak.description}</span>
          {tweak.rationale && <span className="mt-1 block text-[11px] leading-relaxed text-text-subtle">Why it is listed: {tweak.rationale}</span>}
          {tweak.expectedImpact && <span className="mt-1 block text-[11px] leading-relaxed text-text-subtle">Expected impact / tradeoff: {tweak.expectedImpact}</span>}
          {tweak.experimentalWarning && <span className="mt-1 block text-[11px] leading-relaxed text-amber-200">Caution: {tweak.experimentalWarning}</span>}
          {manualVerificationNote && (
            <span className="mt-1 block rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] leading-relaxed text-amber-100">
              <strong className="text-amber-200">Manual verification:</strong> {manualVerificationNote}
            </span>
          )}
          {!pinnacleDefault && (
            <span className="mt-1 block text-[11px] leading-relaxed text-amber-200">
              Not in automatic Pinnacle: {pinnacleExclusionReason(tweak, audit ?? undefined)}
            </span>
          )}
          {audit ? (
            <span className="mt-2 block rounded border border-white/10 bg-black/20 px-2 py-1.5">
              <span className={`block text-[11px] font-semibold ${auditStatusClass(audit.status)}`}>
                Read-back: {audit.status} · {matchCount} match · {differsCount} differ · {unknownCount} unknown{errorCount ? ` · ${errorCount} error` : ''}
              </span>
              {isSafeFirstApplyAudit(tweak, audit) && (
                <span className="mt-1 block text-[11px] text-emerald-200">
                  First-run setup is safe here: Asta will save the current restore state before enabling this setting.
                </span>
              )}
              {audit.actions.length > 0 ? (
                <span className="mt-1 block space-y-1">
                  {audit.actions.map((action) => (
                    <span key={action.index} className="block text-[11px] text-text-muted">
                      <span className={auditStatusClass(action.status)}>{action.status}</span>
                      {' · '}{formatAstaAuditDetail(tweak.id, action.detail)}
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
          Hardware-aware settings for competitive play, with live read-back before apply and a
          reversible path after. Your rig determines which changes are supported; anything that
          cannot be verified stays visible for manual review.
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
