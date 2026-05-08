import { useEffect, useState } from 'react'
import { inTauri, pcieLinks, type PcieLink } from '../lib/tauri'

/**
 * Reads PCIe link width + gen for every Display-class PnP device. Surfaces
 * "GPU running x8 instead of x16" — common silent regression from the
 * wrong slot, a loose card, or PCIe bifurcation misconfig.
 *
 * Caveat: at idle the GPU may report a lower link gen due to ASPM. If the
 * user hasn't applied the PCIe-ASPM-off catalog tweak yet, run a GPU
 * benchmark first (FurMark, 3DMark) and re-check while it's loading.
 */

export function PcieLinkCard() {
  const [links, setLinks] = useState<PcieLink[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isNative = inTauri()

  async function refresh() {
    if (!isNative) {
      setErr('PCIe probe requires the optimizationmaxxing.exe shell.')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      setLinks(await pcieLinks())
    } catch (e) {
      setErr(formatErr(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">pcie</p>
          <h2 className="text-lg font-semibold">GPU link width + gen</h2>
          <p className="text-xs text-text-muted max-w-2xl">
            Verifies your GPU is running at full PCIe lane width + generation. A x16-capable card
            stuck at x8 silently halves bandwidth. Common causes: wrong slot (some boards split
            x16 → x8/x8 when slot 2 is populated), loose card, BIOS PCIe Gen forced to a lower
            value. At idle, ASPM can drop the link gen — for a true reading, run a GPU benchmark
            and re-check while it's loading.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading || !isNative}
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
        >
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      </div>

      {err && <p className="text-xs text-text-muted italic">{err}</p>}

      {links && links.length === 0 && (
        <p className="text-sm text-text-muted italic">
          No Display-class PCIe devices reported. iGPU-only systems show nothing here.
        </p>
      )}

      {links && links.length > 0 && (
        <div className="space-y-2">
          {links.map((l, i) => (
            <PcieLinkRow key={i} link={l} />
          ))}
        </div>
      )}
    </section>
  )
}

function PcieLinkRow({ link }: { link: PcieLink }) {
  const widthOk =
    link.currentWidth != null &&
    link.maxWidth != null &&
    link.currentWidth >= link.maxWidth
  const genOk =
    link.currentGen != null && link.maxGen != null && link.currentGen >= link.maxGen
  const widthRegression =
    link.currentWidth != null &&
    link.maxWidth != null &&
    link.currentWidth < link.maxWidth

  return (
    <div className="border border-border rounded p-3 text-xs">
      <div className="font-semibold text-text mb-1">{link.device}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-subtle">Width</div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-lg font-bold tabular-nums ${
                widthRegression ? 'text-accent' : widthOk ? 'text-emerald-400' : 'text-text'
              }`}
            >
              {link.currentWidth != null ? `x${link.currentWidth}` : '—'}
            </span>
            <span className="text-text-subtle tabular-nums">
              / max {link.maxWidth != null ? `x${link.maxWidth}` : '—'}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-subtle">Gen</div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-lg font-bold tabular-nums ${
                link.currentGen != null && link.maxGen != null && link.currentGen < link.maxGen
                  ? 'text-text'
                  : genOk
                  ? 'text-emerald-400'
                  : 'text-text'
              }`}
            >
              {link.currentGen != null ? `Gen ${link.currentGen}` : '—'}
            </span>
            <span className="text-text-subtle tabular-nums">
              / max {link.maxGen != null ? `Gen ${link.maxGen}` : '—'}
            </span>
          </div>
        </div>
      </div>
      {widthRegression && (
        <div className="mt-2 text-[11px] text-accent">
          ⚠ Running below max width — verify slot, BIOS PCIe config, and that no x4 expansion
          card is forcing bifurcation.
        </div>
      )}
      {!widthRegression && link.currentGen != null && link.maxGen != null && link.currentGen < link.maxGen && (
        <div className="mt-2 text-[11px] text-text-subtle italic">
          Gen lower than max — likely ASPM at idle. Re-check during a GPU benchmark for the true
          reading.
        </div>
      )}
    </div>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
