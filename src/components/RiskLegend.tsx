import { useEffect, useRef, useState } from 'react'

/**
 * Click-to-open legend explaining risk levels 1–4. Lives next to the risk
 * filter chips on the Tweaks page so users have one place to learn what
 * Safe / Standard / Expert / Extreme actually mean — instead of guessing
 * from the chip number.
 */

const ROWS = [
  {
    level: 1,
    label: 'Safe',
    desc: 'Reverses cleanly. Worst case: no observable change.',
    swatch: 'text-text-muted',
  },
  {
    level: 2,
    label: 'Standard',
    desc: 'Well-trodden, predictable effects. Reverts cleanly via the snapshot store.',
    swatch: 'text-text',
  },
  {
    level: 3,
    label: 'Expert',
    desc: 'Has a security or stability tradeoff documented in the rationale. Read it before applying.',
    swatch: 'text-accent',
  },
  {
    level: 4,
    label: 'Extreme',
    desc: 'Real perf gain in exchange for a security or compatibility cost — only apply on dedicated single-user rigs.',
    swatch: 'text-accent font-semibold',
  },
] as const

export function RiskLegend() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="What do risk levels mean?"
        title="What do risk levels mean?"
        className="ml-1 w-5 h-5 inline-flex items-center justify-center rounded-full border border-border text-[10px] text-text-subtle hover:text-text hover:border-border-glow transition"
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Risk level legend"
          className="absolute z-30 left-0 top-7 w-72 surface-card p-3 shadow-2xl"
        >
          <p className="text-text-subtle uppercase tracking-widest text-[10px] mb-2">
            Risk levels
          </p>
          <ul className="space-y-2 text-[11px] leading-snug">
            {ROWS.map((r) => (
              <li key={r.level} className="flex gap-2">
                <span className={`${r.swatch} font-mono shrink-0 w-4 text-center`}>{r.level}</span>
                <div className="min-w-0">
                  <p className={`${r.swatch} font-semibold`}>{r.label}</p>
                  <p className="text-text-muted">{r.desc}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 pt-2 border-t border-border text-[10px] text-text-subtle leading-snug">
            Every tweak ships with a rationale + source. Risk is a quick read,
            not the whole story — expand the row before applying anything 3+.
          </p>
        </div>
      )}
    </div>
  )
}
