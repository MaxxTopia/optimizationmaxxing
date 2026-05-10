import type { ReactNode } from 'react'

/**
 * Pure-SVG line chart of Asta Bench composite over time. No dep, no
 * external chart lib — fits the project rule "no helpers we don't need".
 *
 * Renders only when there's >=2 snapshots. Y-axis fixed 0-100 (composite
 * is bounded). X-axis is index, not time, so a 30-snapshot history with
 * uneven gaps still reads as monotonically left-to-right newest-on-right.
 */

export interface HistoryPoint {
  ts: string
  composite: number
  label: string
}

interface Props {
  /** Pass `history` from Benchmark.tsx — newest-first array. */
  points: HistoryPoint[]
}

export function AstaBenchHistoryGraph({ points }: Props): ReactNode {
  if (points.length < 2) return null
  // Reverse so left=oldest, right=newest. Easier to read.
  const ordered = [...points].reverse()
  const width = 600
  const height = 160
  const padX = 28
  const padY = 16
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  function x(i: number) {
    return padX + (innerW * i) / Math.max(1, ordered.length - 1)
  }
  function y(composite: number) {
    return padY + innerH * (1 - Math.max(0, Math.min(100, composite)) / 100)
  }

  const path = ordered
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.composite).toFixed(1)}`)
    .join(' ')

  // Linear regression for the trend overlay — gives the user "are you
  // gaining or losing ground over the last N runs" without us editorializing.
  const n = ordered.length
  const xs = ordered.map((_, i) => i)
  const ys = ordered.map((p) => p.composite)
  const xMean = xs.reduce((a, b) => a + b, 0) / n
  const yMean = ys.reduce((a, b) => a + b, 0) / n
  const slopeNum = xs.reduce((acc, xi, i) => acc + (xi - xMean) * (ys[i] - yMean), 0)
  const slopeDen = xs.reduce((acc, xi) => acc + (xi - xMean) ** 2, 0)
  const slope = slopeDen === 0 ? 0 : slopeNum / slopeDen
  const intercept = yMean - slope * xMean
  const trendStartY = y(intercept)
  const trendEndY = y(intercept + slope * (n - 1))
  const trendDir = slope > 0.5 ? 'rising' : slope < -0.5 ? 'falling' : 'flat'

  // Y-axis grid lines at 25/50/75.
  const gridYs = [25, 50, 75]

  return (
    <section className="surface-card p-5 space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">composite over time</p>
          <h2 className="text-base font-semibold">Asta Bench history</h2>
        </div>
        <span
          className={`text-[11px] uppercase tracking-widest font-semibold ${
            trendDir === 'rising'
              ? 'text-emerald-400'
              : trendDir === 'falling'
              ? 'text-amber-400'
              : 'text-text-subtle'
          }`}
        >
          trend · {trendDir}
        </span>
      </header>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
        role="img"
        aria-label="Composite over time line chart"
      >
        {/* Grid */}
        {gridYs.map((g) => (
          <g key={g}>
            <line
              x1={padX}
              x2={width - padX}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <text
              x={padX - 6}
              y={y(g) + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--text-subtle)"
              fontFamily="ui-monospace, monospace"
            >
              {g}
            </text>
          </g>
        ))}
        {/* Trend line — drawn first so the data line layers on top */}
        <line
          x1={x(0)}
          y1={trendStartY}
          x2={x(n - 1)}
          y2={trendEndY}
          stroke="var(--text-subtle)"
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.5"
        />
        {/* Data line */}
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 6px var(--accent))' }}
        />
        {/* Data points */}
        {ordered.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.composite)}
            r="3"
            fill="var(--bg-base)"
            stroke="var(--accent)"
            strokeWidth="2"
          >
            <title>
              {p.label} · {p.composite.toFixed(0)} · {new Date(p.ts).toLocaleString()}
            </title>
          </circle>
        ))}
      </svg>
      <p className="text-[11px] text-text-subtle">
        {n} snapshots · oldest left · trendline = linear regression over composite. Hover any
        point for label + timestamp.
      </p>
    </section>
  )
}
