import { useMemo, useState } from 'react'
import { catalog, type TweakRecord } from '../lib/catalog'
import { PRESETS, presetTweaks, type PresetBundle } from '../lib/presets'

/**
 * Diff matrix for the curated presets — rows are tweaks that appear in
 * at least one preset, columns are presets, cells are checkmarks. Helps
 * users decide between Esports vs Frame Pacing vs Network Low-Latency
 * by surfacing the per-tweak overlap.
 */
interface Props {
  open: boolean
  onClose: () => void
}

export function ComparePresetsModal({ open, onClose }: Props) {
  const matrix = useMemo(() => buildMatrix(), [])
  const [search, setSearch] = useState('')
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return matrix.rows
    return matrix.rows.filter(({ tweak }) =>
      `${tweak.title} ${tweak.category} ${tweak.id}`.toLowerCase().includes(q),
    )
  }, [matrix.rows, search])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-4">
      <div className="surface-card flex flex-col w-full max-w-5xl max-h-full overflow-hidden">
        <header className="p-5 border-b border-border space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Compare presets</h3>
              <p className="text-xs text-text-subtle mt-1">
                See which tweaks each curated bundle includes. Useful when picking between similar
                presets.
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:border-border-glow"
            >
              Close
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter rows by tweak title, category, or ID…"
            className="w-full px-3 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
          />
          <p className="text-xs text-text-subtle">
            {filteredRows.length} of {matrix.rows.length} rows
          </p>
        </header>

        <div className="overflow-auto p-5">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-base">
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-text-subtle uppercase tracking-widest font-medium">
                  Tweak
                </th>
                {PRESETS.map((p) => (
                  <th
                    key={p.id}
                    className="text-center py-2 px-2 text-text uppercase tracking-widest font-medium whitespace-nowrap"
                  >
                    {p.glyph && <span aria-hidden className="mr-1">{p.glyph}</span>}
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ tweak, presence }) => (
                <tr key={tweak.id} className="border-b border-border">
                  <td className="py-2 pr-4 align-top">
                    <span className="text-text">{tweak.title}</span>
                    <div className="text-[10px] text-text-subtle uppercase tracking-widest mt-0.5">
                      {tweak.category} · risk {tweak.riskLevel}
                    </div>
                  </td>
                  {PRESETS.map((p) => (
                    <td key={p.id} className="text-center py-2 px-2">
                      {presence[p.id] ? (
                        <span className="text-accent text-base" aria-label="included">●</span>
                      ) : (
                        <span className="text-text-subtle" aria-label="not in preset">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="text-left py-2 pr-4 text-text-subtle uppercase tracking-widest font-medium">
                  Total
                </th>
                {PRESETS.map((p) => (
                  <th
                    key={p.id}
                    className="text-center py-2 px-2 text-text-muted font-normal"
                  >
                    {presetTweaks(p).length}
                  </th>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

interface MatrixRow {
  tweak: TweakRecord
  presence: Record<string, boolean>
}

function buildMatrix(): { rows: MatrixRow[] } {
  const tweaksById = new Map<string, TweakRecord>()
  catalog.tweaks.forEach((t) => tweaksById.set(t.id, t))

  // Collect every tweak ID appearing in any preset.
  const idsInPresets = new Set<string>()
  for (const p of PRESETS) for (const id of p.tweakIds) idsInPresets.add(id)

  const rows: MatrixRow[] = []
  for (const id of idsInPresets) {
    const tweak = tweaksById.get(id)
    if (!tweak) continue
    const presence: Record<string, boolean> = {}
    for (const p of PRESETS) presence[p.id] = p.tweakIds.includes(id)
    rows.push({ tweak, presence })
  }

  // Sort by category then title for readability.
  rows.sort((a, b) => {
    if (a.tweak.category !== b.tweak.category)
      return a.tweak.category.localeCompare(b.tweak.category)
    return a.tweak.title.localeCompare(b.tweak.title)
  })

  return { rows }
}

// Type-only re-export so callers don't need to import the type from elsewhere.
export type { PresetBundle }
