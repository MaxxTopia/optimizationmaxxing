import { useMemo, useState } from 'react'
import { AstaBenchHistoryGraph } from '../components/AstaBenchHistoryGraph'
import { ThirdPartyBenchLogger } from '../components/ThirdPartyBenchLogger'
import {
  inTauri,
  telemetrySendEvent,
  type CpuLatencySample,
  type PingJitterSample,
  type DpcSnapshot,
} from '../lib/tauri'
import {
  PING_COUNT,
  PING_TARGET,
  runBench,
  runBenchMedian,
  scoreCpu,
  scoreDpc,
  scoreFrame,
  scorePing,
  type BenchStage,
} from '../lib/astaBench'

/**
 * Asta Bench — 4-metric synthetic that maps to actual Fortnite click-to-pixel cost.
 *
 *   - CPU sha256 single-thread (~5 s) — game-thread tail proxy
 *   - DPC %    sampled over 5 s     — driver misbehavior surfaces here
 *   - Ping jitter to 1.1.1.1, 50 samples (~12 s) — network variance
 *   - Frame pacing 10 s in canvas (rAF) — same compositor Fortnite uses
 *
 * Composite Latency Health Score 0-100. Snapshots persist to
 * localStorage (`optmaxxing-asta-bench-snapshots`) so users can compare
 * before/after they apply Asta Mode.
 */

const SNAPSHOTS_KEY = 'optmaxxing-asta-bench-snapshots'

interface BenchSnapshot {
  ts: string
  label: string
  cpuNsPerIter: number
  dpcPct: number
  pingP50Ms: number | null
  pingStddevMs: number | null
  framePaceStddevMs: number | null
  composite: number
}

export function Benchmark() {
  const isNative = inTauri()
  const [stage, setStage] = useState<BenchStage>('idle')
  const [cpu, setCpu] = useState<CpuLatencySample | null>(null)
  const [dpc, setDpc] = useState<DpcSnapshot | null>(null)
  const [ping, setPing] = useState<PingJitterSample | null>(null)
  const [framePaceStddev, setFramePaceStddev] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [medianRun, setMedianRun] = useState<{ idx: number; total: number } | null>(null)
  const [history, setHistory] = useState<BenchSnapshot[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]')
    } catch {
      return []
    }
  })

  const composite = useMemo(() => {
    if (!cpu || !dpc || !ping || framePaceStddev == null) return null
    return scoreComposite({
      cpuNsPerIter: cpu.nsPerIter,
      dpcPct: dpc.totalDpcPercent,
      pingStddevMs: ping.stddevMs ?? 0,
      framePaceStddevMs: framePaceStddev,
    })
  }, [cpu, dpc, ping, framePaceStddev])

  async function run() {
    if (!isNative) {
      setErr('Bench requires the optimizationmaxxing.exe shell.')
      return
    }
    setErr(null)
    setCpu(null)
    setDpc(null)
    setPing(null)
    setFramePaceStddev(null)
    try {
      const sample = await runBench((s) => {
        setStage(s)
        // Surface partial results as each metric resolves so the UI
        // doesn't look frozen during the 30 s run.
      })
      setCpu(sample.cpu)
      setDpc(sample.dpc)
      setPing(sample.ping)
      setFramePaceStddev(sample.framePaceStddevMs)
    } catch (e) {
      setErr(typeof e === 'string' ? e : (e as Error).message ?? String(e))
      setStage('idle')
    }
  }

  /** Run the bench 3 times and use the median per metric. ~90 s total
   * but cuts run-to-run variance from ~3-4 composite points to ~1. The
   * right call when measuring per-tweak deltas. */
  async function runMedian3() {
    if (!isNative) {
      setErr('Bench requires the optimizationmaxxing.exe shell.')
      return
    }
    setErr(null)
    setCpu(null)
    setDpc(null)
    setPing(null)
    setFramePaceStddev(null)
    try {
      const sample = await runBenchMedian(
        3,
        (idx, total) => setMedianRun({ idx, total }),
        (s) => setStage(s),
      )
      setCpu(sample.cpu)
      setDpc(sample.dpc)
      setPing(sample.ping)
      setFramePaceStddev(sample.framePaceStddevMs)
    } catch (e) {
      setErr(typeof e === 'string' ? e : (e as Error).message ?? String(e))
      setStage('idle')
    } finally {
      setMedianRun(null)
    }
  }

  function saveSnapshot(label: string) {
    if (!cpu || !dpc || !ping || framePaceStddev == null || composite == null) return
    const snap: BenchSnapshot = {
      ts: new Date().toISOString(),
      label,
      cpuNsPerIter: cpu.nsPerIter,
      dpcPct: dpc.totalDpcPercent,
      pingP50Ms: ping.p50Ms,
      pingStddevMs: ping.stddevMs,
      framePaceStddevMs: framePaceStddev,
      composite,
    }
    const next = [snap, ...history].slice(0, 20)
    setHistory(next)
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next))
    telemetrySendEvent('bench.composite', {
      composite,
      cpuNsPerIter: cpu.nsPerIter,
      dpcPct: dpc.totalDpcPercent,
      pingP50Ms: ping.p50Ms,
      pingStddevMs: ping.stddevMs,
      framePaceStddevMs: framePaceStddev,
      // Label kind only — not the timestamp suffix — so the worker side
      // can bucket "before/after/run" snapshots separately.
      labelKind: /^before/i.test(label) ? 'before' : /^after/i.test(label) ? 'after' : 'run',
    })
  }

  const before = history.find((h) => /before/i.test(h.label))
  const after = history.find((h) => /after/i.test(h.label))

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">measurement</p>
        <h1 className="text-3xl font-bold">Asta Bench</h1>
        <p className="text-text-muted text-sm max-w-2xl mt-1">
          4 metrics that map to actual Fortnite click-to-pixel cost. ~30 s total. Composite{' '}
          <strong>Latency Health Score 0-100</strong>. Save a snapshot before applying Asta Mode,
          run again after, see the delta.
        </p>
      </header>

      <section className="surface-card p-6 space-y-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <button
            onClick={run}
            disabled={!isNative || (stage !== 'idle' && stage !== 'done')}
            className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
          >
            {stage === 'idle' || stage === 'done' ? 'Run Bench (~30s)' : `Running… (${stage})`}
          </button>
          <button
            onClick={runMedian3}
            disabled={!isNative || (stage !== 'idle' && stage !== 'done')}
            className="px-3 py-2 rounded-md border border-border hover:border-border-glow text-sm text-text disabled:opacity-40"
            title="Runs the bench 3 times and uses the median per metric. Cuts run-to-run noise from ~3-4 composite points to ~1. The right call when measuring per-tweak deltas."
          >
            {medianRun
              ? `Median run ${medianRun.idx} / ${medianRun.total}…`
              : 'Median of 3 (~90s)'}
          </button>
          {composite != null && (
            <span className={`text-3xl font-bold tabular-nums ${scoreColor(composite)}`}>
              {composite.toFixed(0)}
              <span className="text-sm text-text-muted font-normal ml-1">/ 100</span>
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-subtle leading-snug max-w-3xl">
          Two consecutive single runs typically vary by ±2-4 composite points — CPU scheduler,
          background processes, network jitter, browser compositor noise. Use <strong className="text-text">Median of 3</strong> when
          you're measuring before/after a tweak; the noise drops to ~±1 and the delta becomes trustworthy.
        </p>

        {err && (
          <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric
            label="CPU"
            running={stage === 'cpu'}
            value={cpu ? `${cpu.nsPerIter.toFixed(0)} ns/op` : '—'}
            score={cpu ? `${scoreCpu(cpu.nsPerIter).toFixed(0)}/25` : null}
            sub={cpu ? 'sha256 1M iter, single-thread' : 'idle'}
          />
          <Metric
            label="DPC"
            running={stage === 'dpc'}
            value={dpc ? `${dpc.totalDpcPercent.toFixed(2)}%` : '—'}
            score={dpc ? `${scoreDpc(dpc.totalDpcPercent).toFixed(0)}/25` : null}
            sub={dpc ? 'driver tail-latency proxy' : 'idle'}
          />
          <Metric
            label="Ping jitter"
            running={stage === 'ping'}
            value={
              ping
                ? `${ping.p50Ms ?? '—'} ms · ±${ping.stddevMs?.toFixed(1) ?? '—'}`
                : '—'
            }
            score={ping ? `${scorePing(ping.stddevMs ?? 0).toFixed(0)}/20` : null}
            sub={ping ? `${PING_COUNT} pings to ${PING_TARGET}` : 'idle'}
          />
          <Metric
            label="Frame pacing"
            running={stage === 'frame'}
            value={framePaceStddev != null ? `±${framePaceStddev.toFixed(2)} ms` : '—'}
            score={framePaceStddev != null ? `${scoreFramePace(framePaceStddev).toFixed(0)}/30` : null}
            sub={framePaceStddev != null ? '10 s rAF, browser canvas' : 'idle'}
          />
        </div>

        {stage === 'done' && composite != null && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <p className="text-xs text-text-subtle uppercase tracking-widest mr-2">Save as:</p>
            <button
              onClick={() => saveSnapshot(`before · ${new Date().toLocaleTimeString()}`)}
              className="px-3 py-1.5 rounded-md border border-border text-xs hover:border-border-glow"
            >
              Before snapshot
            </button>
            <button
              onClick={() => saveSnapshot(`after · ${new Date().toLocaleTimeString()}`)}
              className="px-3 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-300 hover:border-emerald-500"
            >
              After snapshot
            </button>
            <button
              onClick={() => saveSnapshot(`run · ${new Date().toLocaleTimeString()}`)}
              className="px-3 py-1.5 rounded-md text-text-subtle hover:text-text underline text-xs"
            >
              Just save
            </button>
          </div>
        )}
      </section>

      {before && after && (
        <BeforeAfterDiff before={before} after={after} />
      )}

      <AstaBenchHistoryGraph
        points={history.map((h) => ({ ts: h.ts, composite: h.composite, label: h.label }))}
      />

      {history.length > 0 && (
        <section className="surface-card p-5 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">history</p>
          <ul className="space-y-1 text-xs">
            {history.map((h, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1 border-b border-border last:border-0">
                <span className="text-text">{h.label}</span>
                <span className={`tabular-nums font-semibold ${scoreColor(h.composite)}`}>
                  {h.composite.toFixed(0)} / 100
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              if (confirm('Clear all snapshots?')) {
                setHistory([])
                localStorage.removeItem(SNAPSHOTS_KEY)
              }
            }}
            className="text-[11px] text-text-subtle hover:text-text underline"
          >
            clear history
          </button>
        </section>
      )}

      <ThirdPartyBenchLogger />
    </div>
  )
}

function BeforeAfterDiff({ before, after }: { before: BenchSnapshot; after: BenchSnapshot }) {
  const compositeDelta = after.composite - before.composite
  return (
    <section
      className="surface-card p-6 space-y-3"
      style={{
        borderColor: compositeDelta >= 0 ? 'rgba(52, 211, 153, 0.5)' : 'rgba(239, 68, 68, 0.5)',
        boxShadow: `0 0 18px ${compositeDelta >= 0 ? 'rgba(52, 211, 153, 0.18)' : 'rgba(239, 68, 68, 0.18)'}`,
      }}
    >
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">before / after</p>
      <h3 className="text-xl font-bold">
        Composite{' '}
        <span className="tabular-nums">{before.composite.toFixed(0)}</span> →{' '}
        <span className={`tabular-nums ${compositeDelta >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
          {after.composite.toFixed(0)}
        </span>{' '}
        <span className={`text-sm font-normal ${compositeDelta >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
          ({compositeDelta >= 0 ? '+' : ''}{compositeDelta.toFixed(0)})
        </span>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
        <DiffRow label="CPU ns/op" before={before.cpuNsPerIter} after={after.cpuNsPerIter} lowerIsBetter />
        <DiffRow label="DPC %" before={before.dpcPct} after={after.dpcPct} lowerIsBetter unit="%" />
        <DiffRow label="Ping stddev" before={before.pingStddevMs ?? 0} after={after.pingStddevMs ?? 0} lowerIsBetter unit="ms" />
        <DiffRow label="Frame stddev" before={before.framePaceStddevMs ?? 0} after={after.framePaceStddevMs ?? 0} lowerIsBetter unit="ms" />
      </div>
    </section>
  )
}

function DiffRow({
  label,
  before,
  after,
  lowerIsBetter,
  unit,
}: {
  label: string
  before: number
  after: number
  lowerIsBetter: boolean
  unit?: string
}) {
  const delta = after - before
  const better = lowerIsBetter ? delta < 0 : delta > 0
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="text-xs tabular-nums">
        <span>{before.toFixed(2)}</span>
        {unit && <span className="text-text-subtle">{unit}</span>}
        <span className="text-text-subtle mx-1">→</span>
        <span>{after.toFixed(2)}</span>
        {unit && <span className="text-text-subtle">{unit}</span>}
      </p>
      <p className={`text-[11px] font-semibold ${better ? 'text-emerald-300' : delta === 0 ? 'text-text-muted' : 'text-red-400'}`}>
        {delta >= 0 ? '+' : ''}
        {delta.toFixed(2)}
        {unit ? unit : ''}
      </p>
    </div>
  )
}

function Metric({
  label,
  running,
  value,
  score,
  sub,
}: {
  label: string
  running: boolean
  value: string
  score: string | null
  sub: string
}) {
  return (
    <div className="surface-card p-3">
      <p className={`text-[10px] uppercase tracking-widest ${running ? 'text-accent' : 'text-text-subtle'}`}>
        {label} {running && '· running…'}
      </p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-text-subtle">{sub}</p>
      {score && <p className="text-[11px] text-emerald-300 mt-0.5">{score}</p>}
    </div>
  )
}

function scoreFramePace(stddevMs: number): number {
  return scoreFrame(stddevMs)
}

function scoreComposite(m: {
  cpuNsPerIter: number
  dpcPct: number
  pingStddevMs: number
  framePaceStddevMs: number
}): number {
  return (
    scoreCpu(m.cpuNsPerIter) +
    scoreDpc(m.dpcPct) +
    scorePing(m.pingStddevMs) +
    scoreFrame(m.framePaceStddevMs)
  )
}

function scoreColor(s: number): string {
  if (s >= 85) return 'text-emerald-400'
  if (s >= 70) return 'text-emerald-300'
  if (s >= 55) return 'text-amber-300'
  if (s >= 35) return 'text-orange-400'
  return 'text-red-400'
}
