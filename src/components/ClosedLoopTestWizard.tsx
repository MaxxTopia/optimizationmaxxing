import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  appendCapture,
  beginAfterCaptures,
  CONTROLLED_TEST_RUNS,
  isUsableCapture,
  loadControlledTestState,
  resetControlledTest,
  saveControlledTestState,
  summarizeClosedLoop,
  type ControlledTestPhase,
  type ControlledTestState,
  type ComparisonMetric,
} from '../lib/closedLoopTest'
import {
  matchScanSessionStart,
  matchScanSessionStatus,
  matchScanSessionStop,
  type SessionStatus,
} from '../lib/tauri'

interface ClosedLoopTestWizardProps {
  isVip: boolean
}

const PHASES: Array<{ id: ControlledTestPhase; label: string }> = [
  { id: 'baseline', label: 'Baseline' },
  { id: 'handoff', label: 'Apply + restart' },
  { id: 'after', label: 'After test' },
  { id: 'complete', label: 'Result' },
]

function elapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`
}

function phaseIndex(phase: ControlledTestPhase): number {
  return PHASES.findIndex((item) => item.id === phase)
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`
}

function metricTone(metric: ComparisonMetric): string {
  if (metric.improved) return 'text-emerald-300'
  if (metric.regressed) return 'text-red-300'
  return 'text-text-muted'
}

function verdictCopy(verdict: ReturnType<typeof summarizeClosedLoop>['verdict']): {
  label: string
  tone: string
} {
  switch (verdict) {
    case 'improved':
      return { label: 'Measured improvement', tone: 'text-emerald-300' }
    case 'regressed':
      return { label: 'Measured regression', tone: 'text-red-300' }
    case 'mixed':
      return { label: 'Mixed result', tone: 'text-amber-300' }
    case 'no-clear-change':
      return { label: 'No clear change', tone: 'text-sky-200' }
    default:
      return { label: 'Waiting for captures', tone: 'text-text-muted' }
  }
}

export function ClosedLoopTestWizard({ isVip }: ClosedLoopTestWizardProps) {
  const [state, setState] = useState<ControlledTestState>(() => loadControlledTestState())
  const [session, setSession] = useState<SessionStatus>({ running: false, elapsedS: 0, samples: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejected, setRejected] = useState<string | null>(null)

  const comparison = useMemo(() => summarizeClosedLoop(state), [state])
  const activeSide = state.phase === 'baseline' || state.phase === 'after' ? state.phase : null
  const index = phaseIndex(state.phase)

  useEffect(() => {
    if (!isVip) return
    let alive = true
    const poll = async () => {
      try {
        const next = await matchScanSessionStatus()
        if (alive) setSession(next)
      } catch {
        // The individual scan tools remain usable if a session is unavailable.
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 2000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [isVip])

  function commit(next: ControlledTestState) {
    setState(next)
    saveControlledTestState(next)
  }

  async function startCapture() {
    if (!isVip || !activeSide || busy) return
    setBusy(true)
    setError(null)
    setRejected(null)
    try {
      await matchScanSessionStart()
      setSession(await matchScanSessionStatus())
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function stopCapture() {
    if (!isVip || !activeSide || busy) return
    setBusy(true)
    setError(null)
    setRejected(null)
    try {
      const report = await matchScanSessionStop()
      if (!isUsableCapture(report)) {
        setRejected(
          'This capture did not contain enough real game frame data. Keep Fortnite open in the same scene for at least 30 seconds, then try that run again.',
        )
      } else {
        commit(appendCapture(state, activeSide, report))
      }
      setSession(await matchScanSessionStatus())
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  function startAfter() {
    if (state.baseline.length !== CONTROLLED_TEST_RUNS) return
    commit(beginAfterCaptures(state))
    setRejected(null)
  }

  function reset() {
    if (!window.confirm('Clear the saved before/after captures and start a new comparison?')) return
    commit(resetControlledTest())
    setError(null)
    setRejected(null)
  }

  return (
    <section className="surface-card border border-accent/35 bg-accent/5 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent">Controlled proof</div>
          <h2 className="text-xl font-semibold text-text mt-1">Did Asta actually help this PC?</h2>
          <p className="text-sm text-text-muted leading-relaxed mt-2 max-w-2xl">
            Capture three real Fortnite sessions, apply Asta and complete its reboot check, then capture three more. The app compares FPS, 1% lows, 0.1% lows and frame-time spikes instead of guessing from one run.
          </p>
        </div>
        <button onClick={reset} className="text-xs text-text-subtle hover:text-text underline">
          Start over
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2" aria-label="Controlled test progress">
        {PHASES.map((item, itemIndex) => {
          const done = itemIndex < index || (state.phase === 'complete' && item.id === 'complete')
          const current = item.id === state.phase
          return (
            <div key={item.id} className="space-y-1">
              <div className={`h-1.5 rounded-full ${done || current ? 'bg-accent' : 'bg-border'}`} />
              <div className={`text-[11px] ${current ? 'text-text font-semibold' : 'text-text-subtle'}`}>
                {itemIndex + 1}. {item.label}
              </div>
            </div>
          )
        })}
      </div>

      {!isVip ? (
        <div className="rounded border border-amber-300/30 bg-amber-300/5 p-3 text-sm text-amber-100">
          The controlled comparison is a VIP feature. <Link to="/pricing" className="underline">See VIP</Link>.
        </div>
      ) : (
        <>
          {state.phase === 'baseline' && (
            <CaptureStep
              label="Baseline"
              count={state.baseline.length}
              session={session}
              busy={busy}
              side="baseline"
              onStart={startCapture}
              onStop={stopCapture}
            />
          )}

          {state.phase === 'handoff' && (
            <div className="rounded border border-sky-300/25 bg-sky-300/5 p-4 space-y-3">
              <div className="font-semibold text-text">Baseline locked: 3/3 sessions</div>
              <p className="text-sm text-text-muted leading-relaxed">
                Now open Asta, apply the supported settings, restart Windows, reopen the app, and make sure its reboot check says Passed. This wizard does not apply or silently reapply anything.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to="/asta" className="btn-chrome bg-accent px-4 py-2 font-semibold">Open Asta</Link>
                <button onClick={startAfter} className="btn-chrome px-4 py-2 font-semibold">I passed the reboot check — start after test</button>
              </div>
            </div>
          )}

          {state.phase === 'after' && (
            <CaptureStep
              label="After Asta + reboot"
              count={state.after.length}
              session={session}
              busy={busy}
              side="after"
              onStart={startCapture}
              onStop={stopCapture}
            />
          )}

          {state.phase === 'complete' && <ComparisonResult comparison={comparison} />}

          {rejected && <div className="rounded border border-amber-300/30 bg-amber-300/5 p-3 text-sm text-amber-100">{rejected}</div>}
          {error && <div className="rounded border border-red-300/30 bg-red-300/5 p-3 text-sm text-red-200">Capture failed: {error}</div>}
        </>
      )}

      <p className="text-xs text-text-subtle leading-relaxed">
        Match Scan is read-only. It measures the game process through Windows telemetry and PresentMon; it cannot prove server ping, click-to-pixel latency, or aim/build skill. Keep the map, route, FPS cap, render mode, driver, network route and background apps the same on both sides.
      </p>
    </section>
  )
}

function CaptureStep({
  label,
  count,
  session,
  busy,
  side,
  onStart,
  onStop,
}: {
  label: string
  count: number
  session: SessionStatus
  busy: boolean
  side: 'baseline' | 'after'
  onStart: () => void
  onStop: () => void
}) {
  return (
    <div className="rounded border border-border bg-bg/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-text">{label}: {count}/{CONTROLLED_TEST_RUNS}</div>
          <p className="text-sm text-text-muted mt-1">
            {session.running
              ? `Recording ${side} session — ${elapsed(session.elapsedS)}, ${session.samples} sensor samples. Play the same real route, then stop after at least 30 seconds.`
              : 'Open Fortnite first, enter the same real game route, then start. Do not record the lobby or menu.'}
          </p>
        </div>
        <button
          onClick={session.running ? onStop : onStart}
          disabled={busy}
          className={`btn-chrome px-4 py-2 font-semibold whitespace-nowrap ${session.running ? 'bg-accent' : ''} ${busy ? 'opacity-60 cursor-wait' : ''}`}
        >
          {busy ? 'Working…' : session.running ? 'Stop & save session' : `Start ${side}`}
        </button>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${(count / CONTROLLED_TEST_RUNS) * 100}%` }} />
      </div>
    </div>
  )
}

function ComparisonResult({ comparison }: { comparison: ReturnType<typeof summarizeClosedLoop> }) {
  const verdict = verdictCopy(comparison.verdict)
  const visibleMetrics = comparison.metrics.filter((metric) => metric.role !== 'context')
  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-bg/20 p-4">
        <div className="text-xs uppercase tracking-widest text-text-subtle">Comparison complete</div>
        <div className={`text-xl font-semibold mt-1 ${verdict.tone}`}>{verdict.label}</div>
        <p className="text-sm text-text-muted mt-2 leading-relaxed">{comparison.explanation}</p>
      </div>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg/30 text-text-subtle text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Metric</th>
              <th className="text-right px-3 py-2">Before</th>
              <th className="text-right px-3 py-2">After</th>
              <th className="text-right px-3 py-2">Change</th>
            </tr>
          </thead>
          <tbody>
            {visibleMetrics.map((metric) => (
              <tr key={metric.id} className="border-t border-border/70">
                <td className="px-3 py-2 text-text">{metric.label}</td>
                <td className="px-3 py-2 text-right text-text-muted">{formatValue(metric.baseline, metric.unit)}</td>
                <td className="px-3 py-2 text-right text-text-muted">{formatValue(metric.after, metric.unit)}</td>
                <td className={`px-3 py-2 text-right font-medium ${metricTone(metric)}`}>
                  {metric.delta === null ? '—' : `${metric.delta >= 0 ? '+' : ''}${formatValue(metric.delta, metric.unit)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-text-subtle space-y-1">
        <div>Baseline present mode: {comparison.baselinePresentMode ?? 'not captured'} · After: {comparison.afterPresentMode ?? 'not captured'}</div>
        <div>Three-run averages are shown. Small changes inside the noise threshold are deliberately not called an improvement.</div>
      </div>
    </div>
  )
}
