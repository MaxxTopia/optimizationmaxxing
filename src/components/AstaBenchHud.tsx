import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Glanceable Asta Bench score on the Dashboard. Reads the same
 * `optmaxxing-asta-bench-snapshots` localStorage key that /benchmark
 * writes. If no snapshots exist, surfaces a CTA to run the bench.
 *
 * Composite score 0-100 + a 10-snapshot sparkline showing the trajectory.
 * Rising line = tweaks paying off. Flat or falling = look at what
 * regressed.
 */

const SNAPSHOTS_KEY = 'optmaxxing-asta-bench-snapshots'

interface BenchSnapshot {
  ts: string
  label: string
  composite: number
}

export function AstaBenchHud() {
  const [history, setHistory] = useState<BenchSnapshot[]>([])

  useEffect(() => {
    function read() {
      try {
        const raw = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]')
        setHistory(Array.isArray(raw) ? raw : [])
      } catch {
        setHistory([])
      }
    }
    read()
    // Re-read on focus so a fresh /benchmark run reflects when the user
    // navigates back to the dashboard.
    window.addEventListener('focus', read)
    return () => window.removeEventListener('focus', read)
  }, [])

  const latest = history[0]
  const sparkline = useMemo(() => buildSparkline(history.slice(0, 10).reverse()), [history])

  if (!latest) {
    return (
      <Link
        to="/benchmark"
        className="surface-card p-4 flex items-center justify-between gap-3 hover:border-border-glow transition"
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">measure</p>
          <p className="text-sm font-semibold text-text">No bench run yet — run Asta Bench</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            ~30 s, 4 metrics. Save a "before" snapshot, apply tweaks, save "after" — see the
            actual delta.
          </p>
        </div>
        <span className="text-text-muted shrink-0 text-2xl">→</span>
      </Link>
    )
  }

  return (
    <Link
      to="/benchmark"
      className="surface-card p-4 flex items-center justify-between gap-4 hover:border-border-glow transition"
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">latency health</p>
        <p className={`text-3xl font-bold tabular-nums leading-none ${scoreColor(latest.composite)}`}>
          {latest.composite.toFixed(0)}
          <span className="text-base text-text-muted font-normal ml-1">/ 100</span>
        </p>
        <p className="text-[11px] text-text-subtle mt-1 truncate">latest: {latest.label}</p>
      </div>
      <div className="shrink-0">
        {sparkline}
        <p className="text-[10px] text-text-subtle text-right mt-0.5">
          {Math.min(history.length, 10)} runs
        </p>
      </div>
    </Link>
  )
}

function buildSparkline(snaps: BenchSnapshot[]): React.ReactNode {
  if (snaps.length < 2) {
    return (
      <div className="text-[11px] text-text-subtle italic">
        Need 2+ runs for a trend
      </div>
    )
  }
  const w = 120
  const h = 36
  const min = Math.min(...snaps.map((s) => s.composite))
  const max = Math.max(...snaps.map((s) => s.composite))
  const range = Math.max(1, max - min)
  const pts = snaps.map((s, i) => {
    const x = (i / (snaps.length - 1)) * w
    const y = h - ((s.composite - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = snaps[snaps.length - 1]
  const lastX = w
  const lastY = h - ((last.composite - min) / range) * h
  // Trend color: rising = green, flat = muted, falling = red.
  const first = snaps[0]
  const trend = last.composite - first.composite
  const stroke =
    trend > 1.5 ? 'rgb(52, 211, 153)' : trend < -1.5 ? 'rgb(239, 68, 68)' : 'rgb(180, 180, 180)'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={stroke} />
    </svg>
  )
}

function scoreColor(s: number): string {
  if (s >= 85) return 'text-emerald-400'
  if (s >= 70) return 'text-emerald-300'
  if (s >= 55) return 'text-amber-300'
  if (s >= 35) return 'text-orange-400'
  return 'text-red-400'
}
