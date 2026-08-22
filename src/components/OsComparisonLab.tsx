import { useState } from 'react'
import {
  detectSpecs,
  inTauri,
  type SpecProfile,
} from '../lib/tauri'
import { runBenchMedian, score, type BenchStage } from '../lib/astaBench'

const STORAGE_KEY = 'optmaxxing-os-lab-runs'

interface OsRun {
  id: string
  ts: string
  label: string
  osLabel: string
  build: number
  cpu: string
  gpu: string
  ramGb: number
  composite: number
  cpuNsPerIter: number
  dpcPct: number
  pingStddevMs: number | null
  framePaceStddevMs: number
}

function loadRuns(): OsRun[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/**
 * Repeatable local comparison lab for Windows versions and custom OS builds.
 * It intentionally stores the OS label beside the run so users can boot a
 * second installation, repeat the same test, and compare without pretending
 * that one score proves a whole operating system is better.
 */
export function OsComparisonLab() {
  const isNative = inTauri()
  const [runs, setRuns] = useState<OsRun[]>(loadRuns)
  const [label, setLabel] = useState('')
  const [stage, setStage] = useState<BenchStage>('idle')
  const [runNumber, setRunNumber] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!isNative) {
      setError('OS Lab requires the optimizationmaxxing.exe shell.')
      return
    }
    setError(null)
    setStage('cpu')
    try {
      const spec: SpecProfile = await detectSpecs(false)
      const sample = await runBenchMedian(
        3,
        (idx) => setRunNumber(idx),
        (nextStage) => setStage(nextStage),
      )
      const scored = score(sample)
      const osLabel = formatOs(spec)
      const next: OsRun = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: new Date().toISOString(),
        label: label.trim() || osLabel,
        osLabel,
        build: spec.os.build,
        cpu: spec.cpu.marketing || spec.cpu.model,
        gpu: spec.gpu.model || spec.gpu.vendor,
        ramGb: spec.ram.totalGb,
        composite: scored.composite,
        cpuNsPerIter: scored.cpu.nsPerIter,
        dpcPct: scored.dpc.totalDpcPercent,
        pingStddevMs: scored.ping.stddevMs,
        framePaceStddevMs: scored.framePaceStddevMs,
      }
      const stored = [next, ...runs].slice(0, 12)
      setRuns(stored)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      setLabel('')
    } catch (e) {
      setError(formatErr(e))
    } finally {
      setStage('idle')
      setRunNumber(0)
    }
  }

  function remove(id: string) {
    const next = runs.filter((r) => r.id !== id)
    setRuns(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const best = runs.length > 0 ? Math.max(...runs.map((r) => r.composite)) : null

  return (
    <section className="surface-card p-5 space-y-4">
      <header>
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">controlled comparison</p>
        <h2 className="text-xl font-semibold">Windows / OS Lab</h2>
        <p className="text-sm text-text-muted leading-snug max-w-3xl mt-1">
          Boot the same rig into Windows 10, Windows 11, or a custom build, then run the same
          median-of-3 screen. We save the OS caption, build, hardware label, and four Asta Bench
          metrics locally so the comparison is readable instead of relying on memory.
        </p>
      </header>

      <div className="rounded-md border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs text-sky-100 leading-snug">
        For a fair result: keep BIOS, GPU driver, Fortnite settings, power plan, background apps,
        network route, and test scene the same. A different driver or game patch can matter more
        than the OS label. This is a rig comparison, not a universal Windows ranking.
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Win11 24H2 stock, Atlas test 2)"
          disabled={!isNative || stage !== 'idle'}
          className="flex-1 px-3 py-2 rounded-md bg-bg-card border border-border text-sm outline-none focus:border-border-glow"
        />
        <button
          onClick={run}
          disabled={!isNative || stage !== 'idle'}
          className="px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
        >
          {stage === 'idle' ? 'Run OS Lab (≈90s)' : `Run ${runNumber || 1}/3 · ${stage}`}
        </button>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      {runs.length === 0 ? (
        <p className="text-xs text-text-subtle italic">
          No OS snapshots yet. Save one on this installation, then repeat after you boot the next
          Windows or custom build.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-text-subtle">
                <th className="py-2 pr-3">Run</th>
                <th className="py-2 pr-3">OS / build</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">CPU</th>
                <th className="py-2 pr-3">DPC</th>
                <th className="py-2 pr-3">Ping jitter</th>
                <th className="py-2 pr-3">Frame</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-text">{r.label}</p>
                    <p className="text-[10px] text-text-subtle">{new Date(r.ts).toLocaleString()}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <p className="text-text">{r.osLabel}</p>
                    <p className="text-[10px] text-text-subtle truncate max-w-48" title={`${r.cpu} · ${r.gpu} · ${r.ramGb} GB`}>
                      {r.cpu} · {r.ramGb} GB
                    </p>
                  </td>
                  <td className={`py-2 pr-3 font-bold tabular-nums ${scoreColor(r.composite)}`}>
                    {r.composite.toFixed(0)}
                    {best === r.composite && <span className="block text-[10px] text-emerald-300">best here</span>}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{r.cpuNsPerIter.toFixed(0)} ns</td>
                  <td className="py-2 pr-3 tabular-nums">{r.dpcPct.toFixed(2)}%</td>
                  <td className="py-2 pr-3 tabular-nums">{r.pingStddevMs == null ? '—' : `±${r.pingStddevMs.toFixed(1)} ms`}</td>
                  <td className="py-2 pr-3 tabular-nums">±{r.framePaceStddevMs.toFixed(2)} ms</td>
                  <td className="py-2 text-right">
                    <button onClick={() => remove(r.id)} className="text-[10px] text-text-subtle underline hover:text-text">
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-text-subtle border-t border-border pt-2 leading-snug">
        Runs stay on this device. Scores are synthetic diagnostics, not Fortnite FPS, and a clean
        run does not prove an OS is stable over a full session.
      </p>
    </section>
  )
}

function formatOs(spec: SpecProfile): string {
  const caption = spec.os.caption || spec.os.edition || 'Windows'
  const version = spec.os.displayVersion ? ` ${spec.os.displayVersion}` : ''
  const build = spec.os.build ? ` (build ${spec.os.build}${spec.os.ubr ? `.${spec.os.ubr}` : ''})` : ''
  return `${caption}${version}${build}`
}

function scoreColor(value: number): string {
  if (value >= 85) return 'text-emerald-400'
  if (value >= 70) return 'text-emerald-300'
  if (value >= 55) return 'text-amber-300'
  return 'text-red-300'
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
