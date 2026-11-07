import type { MatchScanReport, SessionCaptureMetrics } from './tauri'

export const CONTROLLED_TEST_RUNS = 3
const STORAGE_KEY = 'optmaxxing-controlled-fortnite-test-v1'

export type ControlledTestPhase = 'baseline' | 'handoff' | 'after' | 'complete'

export interface CaptureRun {
  id: string
  capturedAt: string
  report: MatchScanReport
}

export interface ControlledTestState {
  version: 1
  phase: ControlledTestPhase
  baseline: CaptureRun[]
  after: CaptureRun[]
  createdAt: string
  handoffAt: string | null
}

export interface ComparisonMetric {
  id: string
  label: string
  unit: string
  baseline: number | null
  after: number | null
  delta: number | null
  relativeChange: number | null
  higherIsBetter: boolean
  role: 'game' | 'supporting' | 'context'
  meaningful: boolean
  improved: boolean
  regressed: boolean
}

export interface ClosedLoopComparison {
  complete: boolean
  verdict: 'incomplete' | 'improved' | 'mixed' | 'no-clear-change' | 'regressed'
  baselineRuns: number
  afterRuns: number
  metrics: ComparisonMetric[]
  baselinePresentMode: string | null
  afterPresentMode: string | null
  explanation: string
}

function initialState(): ControlledTestState {
  return {
    version: 1,
    phase: 'baseline',
    baseline: [],
    after: [],
    createdAt: new Date().toISOString(),
    handoffAt: null,
  }
}

function isCaptureRun(value: unknown): value is CaptureRun {
  if (!value || typeof value !== 'object') return false
  const run = value as Partial<CaptureRun>
  return Boolean(
    typeof run.id === 'string' &&
      typeof run.capturedAt === 'string' &&
      run.report &&
      Array.isArray(run.report.findings),
  )
}

function cleanRuns(value: unknown): CaptureRun[] {
  return Array.isArray(value) ? value.filter(isCaptureRun).slice(0, CONTROLLED_TEST_RUNS) : []
}

export function loadControlledTestState(): ControlledTestState {
  if (typeof window === 'undefined') return initialState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as Partial<ControlledTestState>
    if (parsed.version !== 1) return initialState()
    const baseline = cleanRuns(parsed.baseline)
    const after = cleanRuns(parsed.after)
    const phase: ControlledTestPhase =
      parsed.phase === 'handoff' || parsed.phase === 'after' || parsed.phase === 'complete'
        ? parsed.phase
        : 'baseline'
    return {
      version: 1,
      phase,
      baseline,
      after,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      handoffAt: typeof parsed.handoffAt === 'string' ? parsed.handoffAt : null,
    }
  } catch {
    return initialState()
  }
}

export function saveControlledTestState(state: ControlledTestState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // A full/blocked local store should not stop the actual capture.
  }
}

/** A session is only useful to the comparison when the game produced frame data. */
export function isUsableCapture(report: MatchScanReport): boolean {
  const capture = report.capture
  return Boolean(
    capture &&
      capture.durationS >= 30 &&
      (capture.frames ?? 0) >= 120 &&
      Number.isFinite(capture.avgFps) &&
      Number.isFinite(capture.low1Fps) &&
      Number.isFinite(capture.low01Fps),
  )
}

export function appendCapture(
  state: ControlledTestState,
  side: 'baseline' | 'after',
  report: MatchScanReport,
): ControlledTestState {
  if (!isUsableCapture(report)) return state
  const run: CaptureRun = {
    id: `${Date.now().toString(36)}-${side}`,
    capturedAt: new Date().toISOString(),
    report,
  }
  const nextRuns = [...state[side], run].slice(0, CONTROLLED_TEST_RUNS)
  const nextPhase =
    side === 'baseline' && nextRuns.length >= CONTROLLED_TEST_RUNS
      ? 'handoff'
      : side === 'after' && nextRuns.length >= CONTROLLED_TEST_RUNS
        ? 'complete'
        : state.phase
  return {
    ...state,
    [side]: nextRuns,
    phase: nextPhase,
    handoffAt: nextPhase === 'handoff' ? new Date().toISOString() : state.handoffAt,
  }
}

export function beginAfterCaptures(state: ControlledTestState): ControlledTestState {
  return {
    ...state,
    phase: 'after',
    handoffAt: state.handoffAt ?? new Date().toISOString(),
  }
}

export function resetControlledTest(): ControlledTestState {
  const next = initialState()
  saveControlledTestState(next)
  return next
}

function mean(runs: CaptureRun[], read: (capture: SessionCaptureMetrics) => number | null): number | null {
  const values = runs
    .map((run) => run.report.capture)
    .map((capture) => (capture ? read(capture) : null))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return values.length === runs.length && values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

function mode(runs: CaptureRun[]): string | null {
  const values = runs
    .map((run) => run.report.capture?.presentMode ?? null)
    .filter((value): value is string => Boolean(value))
  return values.length ? values[values.length - 1] : null
}

const METRICS: Array<{
  id: string
  label: string
  unit: string
  higherIsBetter: boolean
  role: ComparisonMetric['role']
  threshold: number
  read: (capture: SessionCaptureMetrics) => number | null
}> = [
  { id: 'avg-fps', label: 'Average FPS', unit: 'FPS', higherIsBetter: true, role: 'game', threshold: 0.02, read: (c) => c.avgFps },
  { id: 'low-1', label: '1% low', unit: 'FPS', higherIsBetter: true, role: 'game', threshold: 0.02, read: (c) => c.low1Fps },
  { id: 'low-01', label: '0.1% low', unit: 'FPS', higherIsBetter: true, role: 'game', threshold: 0.02, read: (c) => c.low01Fps },
  { id: 'worst-frame', label: 'Worst frame', unit: 'ms', higherIsBetter: false, role: 'game', threshold: 0.02, read: (c) => c.worstFrametimeMs },
  { id: 'spikes', label: '2× frametime spikes', unit: '', higherIsBetter: false, role: 'game', threshold: 0.1, read: (c) => c.spikes2x },
  { id: 'max-dpc', label: 'Peak DPC time', unit: '%', higherIsBetter: false, role: 'supporting', threshold: 0.1, read: (c) => c.maxDpcPct },
  { id: 'min-memory', label: 'Minimum free memory', unit: '%', higherIsBetter: true, role: 'supporting', threshold: 0.05, read: (c) => c.minMemoryAvailablePct },
  { id: 'max-gpu-temp', label: 'Peak GPU temperature', unit: '°C', higherIsBetter: false, role: 'context', threshold: 0.02, read: (c) => c.maxGpuTempC },
  { id: 'cpu-bound', label: 'CPU-bound share', unit: '%', higherIsBetter: false, role: 'context', threshold: 0.1, read: (c) => c.cpuBoundPct },
  { id: 'gpu-bound', label: 'GPU-bound share', unit: '%', higherIsBetter: false, role: 'context', threshold: 0.1, read: (c) => c.gpuBoundPct },
]

export function summarizeClosedLoop(state: ControlledTestState): ClosedLoopComparison {
  const complete =
    state.baseline.length === CONTROLLED_TEST_RUNS &&
    state.after.length === CONTROLLED_TEST_RUNS &&
    state.baseline.every((run) => isUsableCapture(run.report)) &&
    state.after.every((run) => isUsableCapture(run.report))
  const metrics = METRICS.map((definition) => {
    const baseline = mean(state.baseline, definition.read)
    const after = mean(state.after, definition.read)
    const delta = baseline !== null && after !== null ? after - baseline : null
    const relativeChange =
      delta !== null && baseline !== null && Math.abs(baseline) > 0.0001
        ? delta / Math.abs(baseline)
        : null
    const meaningful = relativeChange !== null && Math.abs(relativeChange) >= definition.threshold
    const improved = Boolean(
      meaningful &&
        delta !== null &&
        (definition.higherIsBetter ? delta > 0 : delta < 0),
    )
    const regressed = Boolean(
      meaningful &&
        delta !== null &&
        (definition.higherIsBetter ? delta < 0 : delta > 0),
    )
    return {
      id: definition.id,
      label: definition.label,
      unit: definition.unit,
      baseline,
      after,
      delta,
      relativeChange,
      higherIsBetter: definition.higherIsBetter,
      role: definition.role,
      meaningful,
      improved,
      regressed,
    }
  })
  const gameMetrics = metrics.filter((metric) => metric.role === 'game')
  const improved = gameMetrics.filter((metric) => metric.improved).length
  const regressed = gameMetrics.filter((metric) => metric.regressed).length
  let verdict: ClosedLoopComparison['verdict'] = 'incomplete'
  let explanation = 'Capture three valid baseline sessions and three valid after sessions to compare the same game conditions.'
  if (complete) {
    if (regressed >= 2 && improved === 0) {
      verdict = 'regressed'
      explanation = 'The game metrics moved down in multiple measures. Revert the latest change or repeat the test before keeping it.'
    } else if (improved >= 2 && regressed === 0) {
      verdict = 'improved'
      explanation = 'The game metrics improved across multiple measures under this controlled comparison. This is evidence for this rig and scene, not a guarantee for every game.'
    } else if (improved > 0 || regressed > 0) {
      verdict = 'mixed'
      explanation = 'Some game metrics moved in opposite directions. Treat this as mixed evidence and keep the version that feels and measures better in the same scene.'
    } else {
      verdict = 'no-clear-change'
      explanation = 'The measured movement stayed inside the noise threshold. No clear performance change was proven.'
    }
  }
  return {
    complete,
    verdict,
    baselineRuns: state.baseline.length,
    afterRuns: state.after.length,
    metrics,
    baselinePresentMode: mode(state.baseline),
    afterPresentMode: mode(state.after),
    explanation,
  }
}
