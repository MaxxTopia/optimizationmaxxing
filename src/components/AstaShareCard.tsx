import { useEffect, useRef, useState } from 'react'

/**
 * Generates a 1080x1080 PNG share card with the user's Asta Bench
 * composite (and optional before/after delta) styled in Asta-Mode
 * visual treatment. Right-click → save → post to X / Discord.
 *
 * Pure Canvas API. No image deps, no external service. Reads the latest
 * composite from localStorage so it's available even if Benchmark hasn't
 * been opened this session.
 *
 * Renders nothing if there's no benchmark history yet (nothing to brag
 * about — the card would be a self-own).
 */

const SNAPSHOTS_KEY = 'optmaxxing-asta-bench-snapshots'

interface BenchSnapshot {
  ts: string
  label: string
  composite: number
}

function readLatestSnapshots(): { latest: BenchSnapshot | null; before: BenchSnapshot | null; after: BenchSnapshot | null } {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY)
    if (!raw) return { latest: null, before: null, after: null }
    const arr = JSON.parse(raw) as BenchSnapshot[]
    if (!Array.isArray(arr) || arr.length === 0) return { latest: null, before: null, after: null }
    return {
      latest: arr[0],
      before: arr.find((h) => /^before/i.test(h.label)) ?? null,
      after: arr.find((h) => /^after/i.test(h.label)) ?? null,
    }
  } catch {
    return { latest: null, before: null, after: null }
  }
}

export function AstaShareCard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [snap, setSnap] = useState(readLatestSnapshots())
  const [pngUrl, setPngUrl] = useState<string | null>(null)

  // Re-read on mount + when localStorage changes (other tab saves a snap).
  useEffect(() => {
    setSnap(readLatestSnapshots())
    const onStorage = (e: StorageEvent) => {
      if (e.key === SNAPSHOTS_KEY) setSnap(readLatestSnapshots())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!snap.latest) return
    const c = canvasRef.current
    if (!c) return
    drawShareCard(c, snap)
    setPngUrl(c.toDataURL('image/png'))
  }, [snap])

  if (!snap.latest) return null

  const delta = snap.before && snap.after ? snap.after.composite - snap.before.composite : null

  return (
    <section className="surface-card p-5 space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">share</p>
          <h2 className="text-base font-semibold">"I'm Asta-modded" card</h2>
          <p className="text-xs text-text-muted">
            1080×1080 PNG of your latest Asta Bench composite + before/after delta. Post to
            X / Discord. Nothing leaves your machine — generated locally in Canvas.
          </p>
        </div>
        {pngUrl && (
          <a
            href={pngUrl}
            download={`asta-modded-${snap.latest.composite.toFixed(0)}.png`}
            className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold"
          >
            Download
          </a>
        )}
      </header>
      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={1080}
          height={1080}
          style={{ width: '100%', maxWidth: 360, height: 'auto', borderRadius: 8 }}
        />
      </div>
      {delta !== null && (
        <p className="text-[11px] text-text-subtle text-center">
          before/after delta included · paired by label prefix
        </p>
      )}
    </section>
  )
}

function drawShareCard(
  c: HTMLCanvasElement,
  snap: { latest: BenchSnapshot | null; before: BenchSnapshot | null; after: BenchSnapshot | null },
) {
  const ctx = c.getContext('2d')
  if (!ctx || !snap.latest) return
  const { width: W, height: H } = c
  // Background — Asta void with two crimson radial pools.
  const bg = ctx.createRadialGradient(W * 0.18, H * 0.25, 0, W * 0.18, H * 0.25, W * 0.55)
  bg.addColorStop(0, 'rgba(201, 31, 55, 0.32)')
  bg.addColorStop(1, 'transparent')
  ctx.fillStyle = '#040003'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const bg2 = ctx.createRadialGradient(W * 0.82, H * 0.78, 0, W * 0.82, H * 0.78, W * 0.55)
  bg2.addColorStop(0, 'rgba(89, 13, 26, 0.5)')
  bg2.addColorStop(1, 'transparent')
  ctx.fillStyle = bg2
  ctx.fillRect(0, 0, W, H)

  // Hairline cracks — 6 random faint white strokes.
  ctx.strokeStyle = 'rgba(245, 240, 235, 0.18)'
  ctx.lineWidth = 1.2
  const cracks = [
    [0.12, 0.08, 0.42, 0.28],
    [0.78, 0.05, 0.55, 0.34],
    [0.06, 0.55, 0.32, 0.78],
    [0.92, 0.62, 0.7, 0.92],
    [0.5, 0.0, 0.48, 0.18],
    [0.5, 1.0, 0.5, 0.86],
  ]
  for (const [x1, y1, x2, y2] of cracks) {
    ctx.beginPath()
    ctx.moveTo(x1 * W, y1 * H)
    ctx.lineTo(x2 * W, y2 * H)
    ctx.stroke()
  }

  // Crimson border pulse (single ring, no animation in static png).
  ctx.strokeStyle = 'rgba(201, 31, 55, 0.7)'
  ctx.lineWidth = 4
  ctx.strokeRect(20, 20, W - 40, H - 40)
  ctx.strokeStyle = 'rgba(201, 31, 55, 0.25)'
  ctx.lineWidth = 14
  ctx.strokeRect(20, 20, W - 40, H - 40)

  // Title row.
  ctx.fillStyle = '#f0d4d4'
  ctx.font = 'bold 36px Inter, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('I\'M', 80, 140)
  ctx.font = 'bold 200px Cinzel, "Cormorant Garamond", Georgia, serif'
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(201, 31, 55, 0.7)'
  ctx.shadowBlur = 28
  ctx.fillText('ASTA', 80, 360)
  ctx.shadowBlur = 0
  ctx.font = 'bold 36px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#f0d4d4'
  ctx.fillText('MODDED.', 80, 430)

  // Composite — the hero number.
  const composite = snap.latest.composite
  const compositeColor =
    composite >= 80 ? '#7df0a8' : composite >= 65 ? '#ffe27d' : composite >= 50 ? '#ffba6e' : '#ff7d7d'
  ctx.font = 'bold 320px Inter, system-ui, sans-serif'
  ctx.fillStyle = compositeColor
  ctx.textAlign = 'center'
  ctx.shadowColor = compositeColor
  ctx.shadowBlur = 36
  ctx.fillText(composite.toFixed(0), W / 2, 760)
  ctx.shadowBlur = 0
  ctx.font = '300 36px Inter, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(245, 240, 235, 0.6)'
  ctx.fillText('asta bench composite · /100', W / 2, 810)

  // Optional before/after delta strip.
  if (snap.before && snap.after) {
    const delta = snap.after.composite - snap.before.composite
    const sign = delta >= 0 ? '+' : ''
    const deltaColor = delta >= 5 ? '#7df0a8' : delta >= 0 ? '#ffe27d' : '#ff7d7d'
    ctx.font = 'bold 56px Inter, system-ui, sans-serif'
    ctx.fillStyle = deltaColor
    ctx.fillText(
      `${snap.before.composite.toFixed(0)}  →  ${snap.after.composite.toFixed(0)}   (${sign}${delta.toFixed(1)})`,
      W / 2,
      910,
    )
    ctx.font = '300 28px Inter, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(245, 240, 235, 0.4)'
    ctx.fillText('before  →  after', W / 2, 950)
  }

  // Footer attribution.
  ctx.font = '500 26px Inter, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(245, 240, 235, 0.55)'
  ctx.textAlign = 'left'
  ctx.fillText('optimizationmaxxing.maxxtopia.com', 80, H - 60)
  ctx.textAlign = 'right'
  ctx.fillText(new Date(snap.latest.ts).toISOString().split('T')[0], W - 80, H - 60)
}
