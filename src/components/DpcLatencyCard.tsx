import { useEffect, useState } from 'react'
import { dpcSnapshot, inTauri, type DpcSnapshot } from '../lib/tauri'

/**
 * DPC + Interrupt Time card. The differentiator: every other tweak utility
 * applies and asks you to trust them. We measure. Click "Save baseline"
 * before applying a preset; click "Refresh" after. Diff column tells you
 * which way the needle moved — in microseconds, not vibes.
 *
 * Baseline is stored in localStorage so it survives app restarts but is
 * scoped to the current rig (no cloud sync). Move to SQLite when we
 * need cross-machine baselines.
 */

const BASELINE_KEY = 'optmaxxing-dpc-baseline'
const RING_CAPACITY = 60 // 60 samples × 1s = 60s window

interface RingSample {
  ts: number
  dpc: number
  interrupt: number
}

export function DpcLatencyCard() {
  const [snap, setSnap] = useState<DpcSnapshot | null>(null)
  const [baseline, setBaseline] = useState<DpcSnapshot | null>(() => loadBaseline())
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasWarmedUp, setHasWarmedUp] = useState(false)
  const [live, setLive] = useState(false)
  const [ring, setRing] = useState<RingSample[]>([])
  const isNative = inTauri()

  async function refresh() {
    if (!isNative) {
      setErr('DPC snapshot requires the optimizationmaxxing.exe shell.')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const s = await dpcSnapshot()
      setSnap(s)
      const nonZero =
        s.totalDpcPercent > 0 ||
        s.totalInterruptPercent > 0 ||
        s.perCpu.some((c) => c.dpcPercent > 0 || c.interruptPercent > 0)
      if (nonZero) setHasWarmedUp(true)
      // Append to ring buffer; cap at RING_CAPACITY (FIFO).
      setRing((r) => {
        const next = [...r, { ts: Date.now(), dpc: s.totalDpcPercent, interrupt: s.totalInterruptPercent }]
        return next.length > RING_CAPACITY ? next.slice(next.length - RING_CAPACITY) : next
      })
    } catch (e) {
      setErr(formatErr(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const t = setTimeout(() => {
      if (!hasWarmedUp) refresh()
    }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live polling — 1 Hz when toggled on. Per Microsoft's PDH docs, rate
  // counters need a ≥1s interval between samples to produce real numbers;
  // sub-1Hz polling returns the same value at higher cost.
  useEffect(() => {
    if (!live || !isNative) return
    const id = window.setInterval(refresh, 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, isNative])

  function saveBaseline() {
    if (!snap) return
    localStorage.setItem(BASELINE_KEY, JSON.stringify(snap))
    setBaseline(snap)
  }

  function clearBaseline() {
    localStorage.removeItem(BASELINE_KEY)
    setBaseline(null)
  }

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">measurement</p>
          <h2 className="text-lg font-semibold">DPC + interrupt time</h2>
          <p className="text-xs text-text-muted max-w-2xl">
            Healthy idle: under 1-2 % total. Above 5 % means a driver is misbehaving — the kind of
            issue our network/USB tweaks target. Save a baseline before applying a preset, then
            refresh after to see what moved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLive((v) => !v)}
            disabled={!isNative}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border disabled:opacity-40 ${
              live
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                : 'border-border hover:border-border-glow text-text'
            }`}
            title="Live: poll every 1s and update the sparkline. WMI perf counters need ≥1s anyway."
          >
            {live ? '● Live' : 'Live'}
          </button>
          <button
            onClick={refresh}
            disabled={loading || !isNative}
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
          >
            {loading ? 'Reading…' : 'Refresh'}
          </button>
          <button
            onClick={saveBaseline}
            disabled={!snap}
            className="px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
          >
            Save baseline
          </button>
          {baseline && (
            <button
              onClick={clearBaseline}
              className="px-3 py-1.5 rounded-md border border-border text-text-subtle text-xs hover:text-text"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {err && <p className="text-xs text-text-muted italic">{err}</p>}

      {snap && !hasWarmedUp && (
        <p className="text-[11px] text-text-subtle italic">
          ⏳ WMI perf provider warming up — first read can be 0%. Click Refresh after a moment for a real number.
        </p>
      )}

      {ring.length >= 2 && <DpcSparkline ring={ring} />}

      {snap && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <BigStat
              label="Total DPC time"
              value={snap.totalDpcPercent}
              baseline={baseline?.totalDpcPercent}
            />
            <BigStat
              label="Total interrupt time"
              value={snap.totalInterruptPercent}
              baseline={baseline?.totalInterruptPercent}
            />
          </div>

          {snap.perCpu.length > 0 && (
            <details>
              <summary className="text-xs text-text-subtle cursor-pointer hover:text-text">
                Per-CPU breakdown ({snap.perCpu.length} logical processors)
              </summary>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1 text-xs">
                {snap.perCpu.map((c) => (
                  <div
                    key={c.name}
                    className="border border-border rounded px-2 py-1 flex items-baseline gap-2"
                  >
                    <span className="text-text-subtle">CPU {c.name}</span>
                    <span className="ml-auto tabular-nums text-text">
                      {c.dpcPercent.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {baseline && (
            <p className="text-[11px] text-text-subtle italic">
              Baseline saved {new Date(baseline.capturedAt).toLocaleTimeString()} ·{' '}
              <span className="text-text-muted">
                deltas show current minus baseline (negative = improvement)
              </span>
            </p>
          )}

          <p className="text-[11px] text-text-subtle">
            Captured {new Date(snap.capturedAt).toLocaleTimeString()}
          </p>
        </>
      )}
    </section>
  )
}

function BigStat({
  label,
  value,
  baseline,
}: {
  label: string
  value: number
  baseline?: number | null
}) {
  const delta = baseline != null ? value - baseline : null
  const deltaColor =
    delta == null
      ? ''
      : delta < -0.1
      ? 'text-emerald-400'
      : delta > 0.1
      ? 'text-accent'
      : 'text-text-subtle'
  return (
    <div className="border border-border rounded-md p-3">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-3xl font-bold tabular-nums ${
            value > 5 ? 'text-accent' : value > 2 ? 'text-text' : 'text-emerald-400'
          }`}
        >
          {value.toFixed(1)}%
        </span>
        {delta != null && (
          <span className={`text-xs tabular-nums ${deltaColor}`}>
            {delta > 0 ? '+' : ''}
            {delta.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  )
}

function DpcSparkline({ ring }: { ring: RingSample[] }) {
  const w = 600
  const h = 80
  const pad = 4
  // Y scale: 0 to max(8, observed max) so the chart doesn't look empty when
  // values are in healthy <2% range. Cap-floor at 8% to give visible space
  // for spikes, then auto-grow from there.
  const dpcMax = Math.max(8, ...ring.map((r) => r.dpc))
  const intMax = Math.max(8, ...ring.map((r) => r.interrupt))
  const yMax = Math.max(dpcMax, intMax)
  const xs = (i: number) => pad + ((w - 2 * pad) * i) / Math.max(1, ring.length - 1)
  const ys = (v: number) => pad + (h - 2 * pad) * (1 - v / yMax)
  const line = (sel: (r: RingSample) => number) =>
    ring.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(sel(r)).toFixed(1)}`).join(' ')

  return (
    <div className="border border-border rounded p-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-text-subtle mb-1">
        <span>Last {ring.length}s · DPC ▮ red · Interrupt ▮ purple</span>
        <span className="tabular-nums">y-axis 0% to {yMax.toFixed(1)}%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        {/* 5% threshold reference line */}
        {yMax > 5 && (
          <line
            x1={pad}
            x2={w - pad}
            y1={ys(5)}
            y2={ys(5)}
            stroke="currentColor"
            strokeWidth="0.5"
            strokeDasharray="3 3"
            className="text-text-subtle opacity-50"
          />
        )}
        <path d={line((r) => r.dpc)} fill="none" stroke="#ff4655" strokeWidth="1.5" />
        <path d={line((r) => r.interrupt)} fill="none" stroke="#a855f7" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

function loadBaseline(): DpcSnapshot | null {
  try {
    const raw = localStorage.getItem(BASELINE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
