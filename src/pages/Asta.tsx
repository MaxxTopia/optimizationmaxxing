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

  const inventory = useMemo(
    () => (spec ? buildAstaPlan(spec, appliedRows) : null),
    [spec, appliedRows],
  )

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

  async function handleApply() {
    if (!isVip) return
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
      if (plan.candidates.length === 0) {
        setApplied({
          requested: 0,
          verified: 0,
          mismatch: 0,
          unknown: 0,
          skipped: plan.alreadyApplied.length,
          transactional: 0,
          explicit: 0,
          reviewSkipped: 0,
          manual: plan.manual.length,
          otherGame: plan.otherGame.length,
          notMatched: plan.notMatched.length,
          ts: new Date().toLocaleTimeString(),
        })
        return
      }
      const safeActionCount = plan.transactional.length + plan.explicit.length
      const reviewActionCount = plan.reviewTransactional.length + plan.reviewExplicit.length
      const experimentalCount = plan.candidates.filter((tweak) => isExperimentalTweak(tweak)).length
      if (!(await confirmAction(
        `Pinnacle Asta found ${plan.candidates.length} applicable Fortnite/Windows tweaks. It can apply ${safeActionCount} standard actions now; ${plan.review.length} rows (${reviewActionCount} actions) need a separate security/compatibility review confirmation. ${experimentalCount} rows are experimental. BIOS/NVRAM/firmware rows and mismatched hardware targets stay excluded. A restore point and a same-condition benchmark are strongly recommended. Continue?`,
      ))) {
        return
      }

      const applyReview =
        plan.review.length === 0 ||
        (await confirmAction(
          `Review lane: apply ${plan.review.length} higher-risk or hard-to-read-back tweak${plan.review.length === 1 ? '' : 's'} too? These can weaken security, affect anti-cheat/tournament eligibility, or lack a deterministic read-back. Review the individual rows first if you are unsure. Continue?`,
        ))

      let transactionStatus: TransactionReport['status'] | undefined
      let requested = 0
      if (plan.transactional.length > 0) {
        const report = await applyTransaction(plan.transactional)
        transactionStatus = report.status
        requested += plan.transactional.length
        if (report.status !== 'committed') {
          const detail = [...report.errors, ...report.rollbackErrors].join(' ')
          throw new Error(`Verified Asta lane ${report.status}.${detail ? ` ${detail}` : ''}`)
        }
      }
      if (plan.explicit.length > 0) {
        const receipts = await applyBatch(plan.explicit)
        requested += receipts.length
      }
      if (applyReview && plan.reviewTransactional.length > 0) {
        const report = await applyTransaction(plan.reviewTransactional)
        transactionStatus = report.status
        requested += plan.reviewTransactional.length
        if (report.status !== 'committed') {
          const detail = [...report.errors, ...report.rollbackErrors].join(' ')
          throw new Error(`Review lane ${report.status}.${detail ? ` ${detail}` : ''}`)
        }
      }
      if (applyReview && plan.reviewExplicit.length > 0) {
        const receipts = await applyBatch(plan.reviewExplicit)
        requested += receipts.length
      }

      const selectedIds = new Set(plan.candidates.map((tweak) => tweak.id))
      const allLive = await verifyApplied()
      const live = allLive.filter(
        (row) => row.status === 'applied' && selectedIds.has(row.tweakId),
      )
      setAppliedRows(allLive)
      setApplied({
        requested,
        verified: live.filter((receipt) => receipt.verificationStatus === 'verified').length,
        mismatch: live.filter((receipt) => receipt.verificationStatus === 'mismatch').length,
        unknown: live.filter((receipt) => receipt.verificationStatus === 'unknown').length,
        skipped: plan.alreadyApplied.length,
        transactional: plan.transactional.length,
        explicit: plan.explicit.length,
        reviewSkipped: applyReview ? 0 : plan.review.length,
        manual: plan.manual.length,
        otherGame: plan.otherGame.length,
        notMatched: plan.notMatched.length,
        transactionStatus,
        ts: new Date().toLocaleTimeString(),
      })
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
              Pinnacle Asta inventories the full catalog, then applies every row that matches this
              rig and Fortnite context. Reversible/read-back-capable actions use the transactional
              lane; unsupported scripts are visibly separated into an explicit review lane and may
              need a second UAC prompt. BIOS/NVRAM/firmware changes never become automatic.
            </p>

            {inventory && (
              <div className="mt-3 rounded-md border border-border bg-bg-base/40 px-3 py-2 text-xs text-text-muted leading-relaxed">
                <strong className="text-text">Current inventory:</strong>{' '}
                <span className="text-emerald-300">{inventory.candidates.length} applicable to apply</span>{' · '}
                <span className="text-sky-300">{inventory.alreadyApplied.length} already on target</span>{' · '}
                <span className="text-amber-200">{inventory.review.length} explicit review</span>{' · '}
                <span className="text-purple-300">{inventory.manual.length} manual firmware excluded</span>.
                <span className="block mt-1 text-[11px] text-text-subtle">
                  {inventory.notMatched.length} hardware mismatches and {inventory.otherGame.length} other-game rows are excluded from this Fortnite run.
                </span>
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
                  <strong className="text-amber-200">Windows was updated since the last tune.</strong>{' '}
                  No update installation or pending restart is detected, so Asta can be activated.
                  Some earlier settings may have drifted; use the immediate readback and run the
                  same benchmark again after your next reboot.
                </div>
              )}

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleApply}
                disabled={busy || !isVip || preflight?.blocksAutoApply}
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
                  : isVip
                  ? '🗡 Activate Pinnacle Asta'
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
 * different game. A verified receipt is skipped; a drifted/unknown receipt is
 * eligible for an explicit re-apply so Windows Update and vendor tools can be
 * recovered instead of silently hiding the row. */
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
