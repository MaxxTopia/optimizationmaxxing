import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalog } from '../lib/catalog'
import { GAMES, type GameId } from '../lib/games'
import { runBenchMedian, score, type BenchScored, type BenchStage } from '../lib/astaBench'
import {
  applyTransaction,
  biosAuditProbe,
  dpcSnapshot,
  driverHealth,
  getRebootValidation,
  inTauri,
  networkAuditProbe,
  spdDimms,
  systemMetrics,
  verifyApplied,
  type BatchItem,
  type SpecProfile,
  type TransactionReport,
} from '../lib/tauri'
import { confirmAction } from '../lib/confirm'
import {
  buildLabScan,
  buildOptimizationPlan,
  buildRigPassportRows,
  compareBench,
  formatSigned,
  redactLabScan,
  type LabPlanRow,
  type LabPlanState,
  type LabScan,
  type PersistedLabSummary,
} from '../lib/optimizationLab'
import { useRigStore } from '../store/useRigStore'
import { useIsVip } from '../store/useVipStore'
import { tuneProfile, type TuneIntensity } from '../lib/tuneProfiles'
import { isFeatureEnabled } from '../lib/featureGates'
import { resolveHardwareProfile } from '../lib/hardwareProfiles'
import {
  evaluateClosedLoop,
  isTransactionActionEligible,
  sessionProfileFor,
} from '../lib/optimizationSession'

const LAST_SCAN_KEY = 'optmaxxing-lab-last-scan-v1'
const RUN_HISTORY_KEY = 'optmaxxing-lab-runs-v1'

interface SavedLabRun {
  ts: string
  label: string
  composite: number
  cpuNsPerIter: number
  dpcPct: number
  pingStddevMs: number
  framePaceStddevMs: number
}

type ScanPhase = 'idle' | 'scanning' | 'reading-spd' | 'ready' | 'error'

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function stateLabel(state: LabPlanState): string {
  const labels: Record<LabPlanState, string> = {
    ready: 'Ready',
    vip: 'VIP',
    manual: 'Manual',
    review: 'Review',
    held: 'Held',
    applied: 'Applied',
    drifted: 'Drifted',
    'not-matched': 'Not matched',
    'other-game': 'Other game',
    'needs-scan': 'Needs scan',
  }
  return labels[state]
}

function stateClass(state: LabPlanState): string {
  switch (state) {
    case 'ready': return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    case 'applied': return 'border-sky-500/40 bg-sky-500/10 text-sky-300'
    case 'vip': return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
    case 'review':
    case 'drifted': return 'border-red-500/40 bg-red-500/10 text-red-300'
    case 'manual':
    case 'held': return 'border-purple-500/40 bg-purple-500/10 text-purple-300'
    default: return 'border-border bg-bg-raised text-text-subtle'
  }
}

function passportClass(state: 'detected' | 'measured' | 'manual' | 'unknown' | 'attention'): string {
  if (state === 'attention') return 'text-red-300'
  if (state === 'measured') return 'text-emerald-300'
  if (state === 'manual') return 'text-amber-300'
  if (state === 'detected') return 'text-sky-300'
  return 'text-text-subtle'
}

function formatStage(stage: BenchStage): string {
  if (stage === 'idle' || stage === 'done') return 'Idle'
  return stage === 'frame' ? 'frame pacing' : stage
}

function metricDelta(value: number, digits = 1): string {
  return formatSigned(value, digits)
}

function PlanRow({ row }: { row: LabPlanRow }) {
  const tier = row.tweak.evidenceTier ?? 'ungraded'
  return (
    <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm text-text truncate">{row.tweak.title}</p>
          <p className="text-[11px] text-text-subtle mt-0.5">
            {String(row.tweak.category)} · risk {row.tweak.riskLevel} · evidence {tier}
          </p>
        </div>
        <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${stateClass(row.state)}`}>
          {stateLabel(row.state)}
        </span>
      </div>
      <p className="text-xs text-text-muted leading-relaxed">{row.reason}</p>
      {row.tweak.expectedImpact && (
        <p className="text-[11px] text-text-subtle">Expected impact: {row.tweak.expectedImpact}</p>
      )}
      {row.experimental && (
        <p className="text-[11px] text-amber-300/90">
          Experimental lane — measure before/after and keep a rollback path.
        </p>
      )}
    </div>
  )
}

function CountCard({ label, value, tone = 'text-text' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-base/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function BenchCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-base/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="text-sm font-semibold text-text tabular-nums mt-1">{value}</p>
    </div>
  )
}

function savedRunFromBench(label: string, sample: BenchScored): SavedLabRun {
  return {
    ts: new Date().toISOString(),
    label,
    composite: sample.composite,
    cpuNsPerIter: sample.cpu.nsPerIter,
    dpcPct: sample.dpc.totalDpcPercent,
    pingStddevMs: sample.ping.stddevMs ?? 0,
    framePaceStddevMs: sample.framePaceStddevMs,
  }
}

export function OptimizationLab() {
  const isNative = inTauri()
  const isVip = useIsVip()
  const spec = useRigStore((state) => state.spec)
  const ensureLoaded = useRigStore((state) => state.ensureLoaded)
  const refreshRig = useRigStore((state) => state.refresh)
  const [level, setLevel] = useState<TuneIntensity>('competitive')
  const [targetGame, setTargetGame] = useState<GameId | 'any'>('fortnite')
  const [scan, setScan] = useState<LabScan | null>(null)
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle')
  const [scanError, setScanError] = useState<string | null>(null)
  const [lastScanSummary, setLastScanSummary] = useState<PersistedLabSummary | null>(() =>
    readJson<PersistedLabSummary | null>(LAST_SCAN_KEY, null),
  )
  const [benchStage, setBenchStage] = useState<BenchStage>('idle')
  const [benchRunning, setBenchRunning] = useState(false)
  const [benchError, setBenchError] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<BenchScored | null>(null)
  const [after, setAfter] = useState<BenchScored | null>(null)
  const [history, setHistory] = useState<SavedLabRun[]>(() => readJson<SavedLabRun[]>(RUN_HISTORY_KEY, []))
  const [transactionRunning, setTransactionRunning] = useState(false)
  const [transactionReport, setTransactionReport] = useState<TransactionReport | null>(null)
  const [transactionError, setTransactionError] = useState<string | null>(null)

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  const plan = useMemo(
    () => buildOptimizationPlan({
      tweaks: catalog.tweaks,
      spec: scan?.spec ?? spec,
      applied: scan?.applied ?? [],
      isVip,
      level,
      targetGame,
    }),
    [isVip, level, scan, spec, targetGame],
  )

  const visiblePlanRows = useMemo(() => {
    const order: LabPlanState[] = ['ready', 'drifted', 'review', 'vip', 'manual', 'held', 'applied']
    return plan.rows
      .filter((row) => !['other-game', 'not-matched', 'needs-scan'].includes(row.state))
      .sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state))
  }, [plan.rows])

  const comparison = useMemo(() => compareBench(baseline, after), [after, baseline])
  const closedLoop = useMemo(
    () => evaluateClosedLoop(baseline, after, {
      source: 'asta-proxy',
      baselineRuns: baseline ? 3 : 0,
      afterRuns: after ? 3 : 0,
    }),
    [after, baseline],
  )
  const sessionProfile = sessionProfileFor(targetGame === 'any' ? 'fortnite' : targetGame)
  const hardwareProfile = useMemo(
    () => scan?.bios ? resolveHardwareProfile(scan.bios, scan.spec, scan.spd) : null,
    [scan],
  )
  const transactionRows = useMemo(
    () => plan.rows.filter((row) => (
      row.state === 'ready' &&
      row.tweak.actions.length > 0 &&
      row.tweak.actions.every(isTransactionActionEligible)
    )),
    [plan.rows],
  )
  const transactionActionCount = useMemo(
    () => transactionRows.reduce((total, row) => total + row.tweak.actions.length, 0),
    [transactionRows],
  )
  const profile = tuneProfile(level)

  async function scanRig() {
    if (!isNative) {
      setScanError('The native optimizationmaxxing.exe shell is required for a real rig scan.')
      setScanPhase('error')
      return
    }
    setScanPhase('scanning')
    setScanError(null)
    try {
      const detected = await refreshRig()
      if (!detected) throw new Error('The native rig scan returned no hardware profile.')
      const results = await Promise.allSettled([
        biosAuditProbe(),
        verifyApplied(),
        getRebootValidation(),
        systemMetrics(),
        dpcSnapshot(),
        networkAuditProbe(),
        driverHealth(),
      ])
      const value = <T,>(result: PromiseSettledResult<T>): T | null =>
        result.status === 'fulfilled' ? result.value : null
      const next = buildLabScan({
        spec: detected,
        bios: value(results[0]),
        applied: value(results[1]) ?? [],
        reboot: value(results[2]),
        metrics: value(results[3]),
        dpc: value(results[4]),
        network: value(results[5]),
        drivers: value(results[6]),
      })
      setScan(next)
      const summary = redactLabScan(next)
      setLastScanSummary(summary)
      localStorage.setItem(LAST_SCAN_KEY, JSON.stringify(summary))
      setScanPhase('ready')
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error))
      setScanPhase('error')
    }
  }

  async function readSpd() {
    if (!isNative) {
      setScanError('SPD evidence requires the native shell.')
      setScanPhase('error')
      return
    }
    if (!scan) {
      setScanError('Run the rig scan first so the SPD result is attached to the current snapshot.')
      setScanPhase('error')
      return
    }
    setScanPhase('reading-spd')
    setScanError(null)
    try {
      const spd = await spdDimms()
      const next = { ...scan, spd }
      setScan(next)
      const summary = redactLabScan(next)
      setLastScanSummary(summary)
      localStorage.setItem(LAST_SCAN_KEY, JSON.stringify(summary))
      setScanPhase('ready')
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error))
      setScanPhase('error')
    }
  }

  async function runMeasurement(slot: 'baseline' | 'after') {
    if (!isNative) {
      setBenchError('Asta Bench requires the native optimizationmaxxing.exe shell.')
      return
    }
    if (benchRunning) return
    setBenchRunning(true)
    setBenchError(null)
    setBenchStage('idle')
    try {
      const result = score(await runBenchMedian(3, undefined, (stage) => setBenchStage(stage)))
      if (slot === 'baseline') setBaseline(result)
      else setAfter(result)
      const label = slot === 'baseline' ? 'lab baseline' : 'lab after'
      const saved = savedRunFromBench(label, result)
      setHistory((previous) => {
        const next = [saved, ...previous].slice(0, 12)
        localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(next))
        return next
      })
      setBenchStage('done')
    } catch (error) {
      setBenchError(error instanceof Error ? error.message : String(error))
      setBenchStage('idle')
    } finally {
      setBenchRunning(false)
    }
  }

  async function applyEligibleTransaction() {
    if (!isNative) {
      setTransactionError('Transactional apply requires the native optimizationmaxxing.exe shell.')
      return
    }
    if (!scan) {
      setTransactionError('Scan the rig first so this transaction is matched to the current hardware.')
      return
    }
    if (!isFeatureEnabled('transactional-apply')) {
      setTransactionError('Transactional apply is disabled by the local feature policy.')
      return
    }
    if (transactionRows.length === 0) {
      setTransactionError('There are no ready rows with a native rollback and read-back contract in this lane.')
      return
    }
    const items: BatchItem[] = transactionRows.flatMap((row) => row.tweak.actions.map((action) => ({
      tweakId: row.tweak.id,
      action,
    })))
    try {
      if (!(await confirmAction(
        `Apply ${transactionActionCount} verified action${transactionActionCount === 1 ? '' : 's'} from ${transactionRows.length} ready tweak${transactionRows.length === 1 ? '' : 's'}?\n\nOnly ready, reversible, read-back-capable rows are included. If apply or verification fails, optimizationmaxxing will attempt to restore every captured pre-state.`,
      ))) return
    } catch (error) {
      setTransactionError(error instanceof Error ? error.message : String(error))
      return
    }

    setTransactionRunning(true)
    setTransactionError(null)
    setTransactionReport(null)
    try {
      const report = await applyTransaction(items)
      setTransactionReport(report)
      if (report.status === 'committed') {
        const applied = await verifyApplied()
        setScan((previous) => previous ? { ...previous, applied } : previous)
      }
    } catch (error) {
      setTransactionError(error instanceof Error ? error.message : String(error))
    } finally {
      setTransactionRunning(false)
    }
  }

  const currentSpec: SpecProfile | null = scan?.spec ?? spec
  const passport = scan ? buildRigPassportRows(scan) : []
  const reviewRows = plan.rows.filter((row) => row.state === 'review')
  const scanStatus = scanPhase === 'scanning'
    ? 'Scanning Windows, firmware visibility, receipts, network, and drivers…'
    : scanPhase === 'reading-spd'
      ? 'Reading SPD through the elevated read-only path…'
      : scanPhase === 'ready'
        ? `Snapshot captured ${scan ? new Date(scan.capturedAt).toLocaleTimeString() : ''}`
        : scanPhase === 'error'
          ? 'Scan needs attention'
          : 'Not scanned in this session'

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-text-subtle">rig intelligence</p>
        <h1 className="text-3xl font-bold">Optimization Lab</h1>
        <p className="text-sm text-text-muted max-w-3xl">
          One place to scan the actual PC, choose the tuning depth, see the exact reasons behind
          every recommendation, and measure before/after. The Lab is the evidence/planning cockpit:
          its ready transactional lane can apply only captured, verified, rollback-capable actions.
          Tune Now is the guided safe-by-default lane; Asta is the full applicable catalog with
          explicit review gates.
        </p>
        <div className="grid gap-2 pt-2 md:grid-cols-3">
          <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
            <p className="text-xs font-semibold text-text">Optimization Lab · measure and plan</p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">Scan this PC, inspect why a recommendation exists, then compare controlled before/after evidence. It is not an auto-apply-all button.</p>
          </div>
          <Link to="/tune" className="rounded-md border border-border bg-bg-base/40 p-3 transition hover:border-border-glow">
            <p className="text-xs font-semibold text-text">Tune Now · guided lane →</p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">Choose intensity and game first; apply the eligible policy rows with live verification.</p>
          </Link>
          <Link to="/asta" className="rounded-md border border-border bg-bg-base/40 p-3 transition hover:border-border-glow">
            <p className="text-xs font-semibold text-text">Asta · full reviewed catalog →</p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">Preview current values, select rows, and confirm higher-risk actions separately. Firmware stays manual.</p>
          </Link>
        </div>
      </header>

      <section className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text">1. Detect the rig</p>
            <p className="text-xs text-text-muted mt-1">Hardware, Windows-visible firmware, active receipts, network path, DPC sample, and driver health.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={scanRig}
              disabled={!isNative || scanPhase === 'scanning' || scanPhase === 'reading-spd'}
              className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
            >
              {scanPhase === 'scanning' ? 'Scanning…' : 'Scan my rig'}
            </button>
            <button
              onClick={readSpd}
              disabled={!isNative || !scan || scanPhase === 'scanning' || scanPhase === 'reading-spd'}
              className="px-3 py-2 rounded-md border border-border text-sm text-text hover:border-border-glow disabled:opacity-40"
              title="One elevated, read-only SPD probe. It may install PawnIO."
            >
              {scanPhase === 'reading-spd' ? 'Reading SPD…' : 'Read SPD (optional)'}
            </button>
          </div>
        </div>
        <p className="text-xs text-text-subtle">{isNative ? scanStatus : 'Browser preview: install the desktop shell for native detection.'}</p>
        {scanError && <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{scanError}</p>}
        {!scan && lastScanSummary && (
          <div className="rounded-md border border-border bg-bg-base/40 p-3 text-xs text-text-muted">
            Last local scan summary: <span className="text-text">{lastScanSummary.cpu}</span> · {lastScanSummary.gpu} · {lastScanSummary.os} · reboot proof {lastScanSummary.rebootStatus}.
            <span className="block text-[11px] text-text-subtle mt-1">Stored locally without serials, UUIDs, MAC addresses, or IP addresses. Scan again to refresh it.</span>
          </div>
        )}
      </section>

      <section className="surface-card p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-text">2. Choose the lane</p>
          <p className="text-xs text-text-muted mt-1">The lane changes what the planner will consider; it never turns uncertain folklore into a measured claim.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-text-muted">
            Tune intensity
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as TuneIntensity)}
              className="mt-1 w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text"
            >
              <option value="light">Light — low-risk foundation</option>
              <option value="competitive">Competitive — measured/mechanism-backed</option>
              <option value="aggressive">Aggressive — higher-risk, VIP review</option>
              <option value="extreme">Extreme — expose every eligible experiment for review</option>
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Target game
            <select
              value={targetGame}
              onChange={(event) => setTargetGame(event.target.value as GameId | 'any')}
              className="mt-1 w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text"
            >
              <option value="fortnite">Fortnite</option>
              <option value="any">Any game / rig-wide</option>
              {GAMES.filter((game) => game.id !== 'fortnite').map((game) => (
                <option key={game.id} value={game.id}>{game.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100 leading-relaxed">
          <strong>{profile.label}:</strong> {profile.summary} {level === 'extreme' && 'Extreme makes security-degrading and undocumented-style entries visible as Review items; it does not silently apply them.'}
        </div>
      </section>

      {scan && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-text-subtle">detected passport</p>
              <h2 className="text-xl font-bold">What this PC actually reported</h2>
            </div>
            <Link to="/diagnostics" className="text-xs text-accent hover:underline">Open full diagnostics →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {passport.map((row) => (
              <div key={row.id} className="surface-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-widest text-text-subtle">{row.label}</p>
                  <span className={`text-[10px] uppercase ${passportClass(row.state)}`}>{row.state}</span>
                </div>
                <p className="text-sm font-semibold text-text mt-1">{row.value}</p>
                <p className="text-[11px] text-text-muted leading-relaxed mt-1">{row.detail}</p>
              </div>
            ))}
          </div>
          {scan.boardEvidence && (
            <div className="rounded-md border border-border bg-bg-base/40 px-3 py-2 text-xs text-text-muted">
              Board evidence: <span className="text-text">{scan.boardEvidence.boardMatchStatus}</span> · CPU support: <span className="text-text">{scan.boardEvidence.cpuSupport.status}</span>. BIOS/SCEWIN remains a manual, exact-board workflow; Windows visibility is not proof that every hidden firmware option is present.
              <Link to="/hardware" className="ml-2 text-accent hover:underline">Open hardware evidence →</Link>
            </div>
          )}
          {hardwareProfile && (
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-3 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-text">Exact hardware profile</p>
                <span className="text-[10px] uppercase tracking-widest text-sky-300">{hardwareProfile.status}</span>
              </div>
              <p className="text-xs text-text-muted">
                {hardwareProfile.profile
                  ? `${hardwareProfile.profile.boardLabel} · evidence checked ${hardwareProfile.profile.lastChecked} · CPU support ${hardwareProfile.cpuStatus}`
                  : 'This board is not in the exact evidence catalog, so no nearby-board recipe is substituted.'}
              </p>
              {hardwareProfile.memoryIdentity && (
                <p className="text-[11px] text-text-subtle">SPD identity: <span className="text-text">{hardwareProfile.memoryIdentity}</span> · {hardwareProfile.memoryStatus}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-muted">
                {hardwareProfile.recommendations.slice(0, 4).map((recommendation) => (
                  <p key={recommendation}>• {recommendation}</p>
                ))}
              </div>
              <p className="text-[11px] text-amber-200/80">{hardwareProfile.manualFallback}</p>
            </div>
          )}
        </section>
      )}

      <section className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-text-subtle">explainable plan</p>
            <h2 className="text-xl font-bold">{targetGame === 'any' ? 'Rig-wide' : GAMES.find((game) => game.id === targetGame)?.label} plan</h2>
          </div>
          <div className="flex gap-2">
            <Link to="/tune" className="px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold">Open Tune Now</Link>
            <Link to="/tweaks" className="px-3 py-1.5 rounded-md border border-border text-xs text-text hover:border-border-glow">Inspect Tweaks</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <CountCard label="Ready" value={plan.counts.ready} tone="text-emerald-300" />
          <CountCard label="Applied" value={plan.counts.applied} tone="text-sky-300" />
          <CountCard label="VIP" value={plan.counts.vip} tone="text-amber-300" />
          <CountCard label="Review" value={plan.counts.review} tone="text-red-300" />
          <CountCard label="Drifted" value={plan.counts.drifted} tone="text-red-300" />
          <CountCard label="Manual" value={plan.counts.manual} tone="text-purple-300" />
          <CountCard label="Held" value={plan.counts.held} tone="text-purple-300" />
        </div>
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-text">Transactional apply</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                {transactionRows.length} ready tweak{transactionRows.length === 1 ? '' : 's'} · {transactionActionCount} native action{transactionActionCount === 1 ? '' : 's'} · unsupported scripts are excluded
              </p>
            </div>
            <button
              onClick={() => void applyEligibleTransaction()}
              disabled={!isNative || !scan || !isFeatureEnabled('transactional-apply') || transactionRunning || transactionRows.length === 0}
              className="btn-chrome px-3 py-1.5 rounded-md bg-emerald-400 text-bg-base text-xs font-semibold disabled:opacity-40"
              title="Capture pre-state, apply, verify, and restore on failure"
            >
              {transactionRunning ? 'Applying + verifying…' : 'Apply ready transaction lane'}
            </button>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            This is the new evidence-backed path. It captures every pre-state before mutation, applies one transaction, reads each setting back, and attempts reverse-order rollback if any action fails or mismatches. It does not promise rollback for arbitrary PowerShell or firmware changes.
          </p>
          {transactionError && <p className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">{transactionError}</p>}
          {transactionReport && (
            <div className="rounded border border-border bg-bg-base/40 px-2 py-1.5 text-[11px] text-text-muted">
              Result: <span className="text-text font-semibold">{transactionReport.status}</span> · {transactionReport.verifiedCount}/{transactionReport.itemCount} verified · {transactionReport.rolledBackCount} rolled back.
              {transactionReport.errors.length > 0 && <span className="block text-red-300 mt-1">{transactionReport.errors.join(' · ')}</span>}
              {transactionReport.rollbackErrors.length > 0 && <span className="block text-red-200 mt-1">Rollback needs attention: {transactionReport.rollbackErrors.join(' · ')}</span>}
            </div>
          )}
        </div>
        {!currentSpec && <p className="text-xs text-text-muted">Scan the desktop rig to replace generic matches with exact CPU/GPU/OS/memory targeting.</p>}
        {currentSpec && visiblePlanRows.length === 0 && <p className="text-xs text-text-muted">No rows match this game and detected hardware at the selected lane.</p>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visiblePlanRows.slice(0, 18).map((row) => <PlanRow key={row.tweak.id} row={row} />)}
        </div>
        {visiblePlanRows.length > 18 && <p className="text-xs text-text-subtle">Showing 18 of {visiblePlanRows.length} in-lane rows. Open Tweaks for the complete catalog.</p>}
        {(plan.counts.notMatched > 0 || plan.counts.otherGame > 0) && (
          <p className="text-xs text-text-subtle">Also excluded: {plan.counts.notMatched} hardware mismatches and {plan.counts.otherGame} rows tagged for another game.</p>
        )}
      </section>

      <section className="surface-card p-5 space-y-3 border-amber-500/30">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-300/80">Extreme review lane</p>
          <h2 className="text-xl font-bold">Undocumented-style and security tradeoffs stay visible, not disguised</h2>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          The catalog already contains aggressive entries such as SmartScreen/HVCI changes, CPU-mitigation changes, Hyper-V boot changes, timer flags, NIC interrupt moderation, MSI mode, and service cleanup. This lab surfaces them as Review when their security, compatibility, anti-cheat, tournament, or read-back risk is material. A creator saying “pros use it” is not a measurement, so these rows need an explicit per-tweak decision, a restore path, native read-back, and a same-condition A/B result.
        </p>
        {reviewRows.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {reviewRows.slice(0, 10).map((row) => (
              <span key={row.tweak.id} className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[11px] text-red-200">{row.tweak.title}</span>
            ))}
            {reviewRows.length > 10 && <span className="text-[11px] text-text-subtle self-center">+{reviewRows.length - 10} more in Tweaks</span>}
          </div>
        ) : (
          <p className="text-xs text-text-subtle">Run a native scan and select Extreme to populate this review set.</p>
        )}
        <p className="text-[11px] text-text-subtle">No anti-cheat bypasses, visual exploits, voltage overrides, or thermal-limit writes are part of this lane.</p>
      </section>

      <section className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-text-subtle">measurement loop</p>
            <h2 className="text-xl font-bold">Prove a change on this PC</h2>
          </div>
          <Link to="/benchmark" className="text-xs text-accent hover:underline">Open full Asta Bench →</Link>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          Each button runs the existing median-of-three Asta Bench. It is a local proxy for CPU work, DPC tail latency, network jitter, and frame pacing—not a click-to-pixel Fortnite measurement. Keep the game, driver, scene, power state, background load, and route consistent.
        </p>
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text">Actual Fortnite check · separate from the proxy</p>
            <Link to="/match-scan" className="text-xs text-accent hover:underline">Open Fight Capture →</Link>
          </div>
          <p className="text-xs leading-relaxed text-text-muted">
            For a real gameplay comparison, capture the same repeatable Fortnite scene or Creative route with the same resolution, render mode, graphics, driver, and background load. Match Scan can report PresentMon average FPS, 1%/0.1% lows, and the worst frame-time spike. Repeat after the PC reboots to check persistence; keep network/server ping separate from local frame-time results. Neither test alone proves click-to-photon latency or tournament eligibility.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void runMeasurement('baseline')}
            disabled={!isNative || benchRunning}
            className="btn-chrome px-3 py-2 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
          >
            {benchRunning ? `Running… (${formatStage(benchStage)})` : 'Run baseline (median 3)'}
          </button>
          <button
            onClick={() => void runMeasurement('after')}
            disabled={!isNative || benchRunning}
            className="px-3 py-2 rounded-md border border-border text-xs text-text hover:border-border-glow disabled:opacity-40"
          >
            Run after (median 3)
          </button>
        </div>
        {benchError && <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{benchError}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <BenchCard label="Baseline" value={baseline ? `${baseline.composite.toFixed(1)} / 100` : '—'} />
          <BenchCard label="After" value={after ? `${after.composite.toFixed(1)} / 100` : '—'} />
          <BenchCard label="Composite delta" value={comparison ? formatSigned(comparison.compositeDelta, 1) : '—'} />
          <BenchCard label="DPC delta" value={comparison ? `${metricDelta(comparison.dpcDeltaPct, 2)}%` : '—'} />
        </div>
        {comparison && (
          <div className="rounded-md border border-border bg-bg-base/40 p-3 text-xs text-text-muted">
            CPU {metricDelta(comparison.cpuDeltaNs, 0)} ns/op · ping jitter {metricDelta(comparison.pingDeltaMs, 2)} ms · frame pacing {metricDelta(comparison.frameDeltaMs, 2)} ms. Lower is better for these component deltas; repeat in the actual game before calling a tweak a win.
          </div>
        )}
        {isFeatureEnabled('closed-loop-evidence') && (
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text">Closed-loop game evidence</p>
                <p className="text-[11px] text-text-muted">Target session: {sessionProfile.label} · {sessionProfile.processNames.join(', ')}</p>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-sky-300">{closedLoop.verdict}</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">{closedLoop.explanation}</p>
            <p className="text-[11px] text-text-subtle">The current buttons are still the Asta proxy. Use the same scene in Match Scan for PresentMon frametime evidence, then repeat after reboot before treating a change as persistent.</p>
            <Link to="/match-scan" className="inline-flex text-xs text-accent hover:underline">Open {targetGame === 'any' ? 'Fortnite' : GAMES.find((game) => game.id === targetGame)?.label} capture →</Link>
          </div>
        )}
        {history.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-text-subtle">local run history</p>
            {history.slice(0, 5).map((run) => (
              <div key={`${run.ts}-${run.label}`} className="flex flex-wrap justify-between gap-2 text-xs text-text-muted">
                <span>{run.label} · {new Date(run.ts).toLocaleString()}</span>
                <span className="text-text tabular-nums">{run.composite.toFixed(1)} · DPC {run.dpcPct.toFixed(2)}% · jitter ±{run.pingStddevMs.toFixed(2)} ms</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="surface-card p-5 space-y-3">
        <p className="text-xs uppercase tracking-widest text-text-subtle">workflow</p>
        <h2 className="text-xl font-bold">The useful next click</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-text-muted">
          <div><span className="text-text font-semibold">Tune Now:</span> applies only rows eligible for the selected policy, then verifies native state.</div>
          <div><span className="text-text font-semibold">Asta:</span> handles the explicitly aggressive preset and its confirmation/restore workflow.</div>
          <div><span className="text-text font-semibold">Diagnostics / SCEWIN:</span> show what Windows cannot prove and give the exact manual board path.</div>
        </div>
        {!isVip && <p className="text-xs text-amber-300">VIP-gated rows stay visible in the plan so the tradeoff is clear; the lock is not hidden.</p>}
      </section>
    </div>
  )
}
