/**
 * Themed circular ring gauge. Shows a percentage as an arc, with a
 * label and value in the center. Theme-aware via CSS vars.
 *
 * Inspired by Hone.gg's CPU/GPU/RAM gauges, but driven by our active
 * profile theme color so Val/Sonic/DMC/BO3 each look distinct.
 */
interface RingGaugeProps {
  /** 0-100 */
  percent: number
  /** Big center value text e.g. "71%" or "9.2 GB". */
  value: string
  /** Top eyebrow label e.g. "CPU USAGE". */
  label: string
  /** Bottom hint e.g. "Intel i9-14900K" or "32 GB total". */
  hint?: string
  /** Override CSS color (defaults to var(--accent)). */
  color?: string
  /** Pixel size of the SVG square. */
  size?: number
}

export function RingGauge({
  percent,
  value,
  label,
  hint,
  color,
  size = 180,
}: RingGaugeProps) {
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percent))
  const dashOffset = circumference * (1 - clamped / 100)
  const accent = color ?? 'var(--accent)'

  return (
    <div className="surface-card relative flex flex-col items-center justify-center p-6 overflow-hidden">
      <p className="text-xs uppercase tracking-widest text-text-subtle mb-3 self-start">
        {label}
      </p>

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 transform">
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--border)"
            strokeWidth={stroke}
            fill="none"
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)',
              filter: `drop-shadow(0 0 12px ${accent})`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-bold text-text leading-none tabular-nums">
            {value}
          </p>
          {hint && <p className="text-xs text-text-subtle mt-1.5">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
