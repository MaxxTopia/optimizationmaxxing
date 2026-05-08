import { useMemo } from 'react'
import { COMMUNITY_PRESETS, type CommunityPreset } from '../lib/communityPresets'
import { catalog, type TweakRecord } from '../lib/catalog'
import { useCustomPresets } from '../store/useCustomPresets'

/**
 * Modal showing the bundled community-curated presets. Each one is a
 * one-click import into the user's local Custom Presets store. Resolves
 * tweak IDs against the catalog so users see what they're actually getting.
 */
interface Props {
  open: boolean
  onClose: () => void
  onImported: (count: number) => void
}

export function CommunityPresetsModal({ open, onClose, onImported }: Props) {
  const importMany = useCustomPresets((s) => s.importMany)
  const existingNames = useCustomPresets((s) =>
    new Set(s.presets.map((p) => p.name)),
  )

  const tweaksById = useMemo(() => {
    const m = new Map<string, TweakRecord>()
    catalog.tweaks.forEach((t) => m.set(t.id, t))
    return m
  }, [])

  if (!open) return null

  function importOne(p: CommunityPreset) {
    const n = importMany([p])
    onImported(n)
  }

  function importAll() {
    const fresh = COMMUNITY_PRESETS.filter((p) => !existingNames.has(p.name))
    const n = importMany(fresh)
    onImported(n)
  }

  const allImported = COMMUNITY_PRESETS.every((p) => existingNames.has(p.name))

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-4">
      <div className="surface-card flex flex-col w-full max-w-3xl max-h-full overflow-hidden">
        <header className="p-5 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Community presets</h3>
            <p className="text-xs text-text-subtle mt-1">
              Hand-curated bundles for common rigs. One-click import → edit later if you want.
            </p>
          </div>
          <button
            onClick={importAll}
            disabled={allImported}
            className="btn-chrome shrink-0 px-3 py-1.5 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
          >
            {allImported ? 'All imported' : 'Import all'}
          </button>
        </header>

        <div className="overflow-y-auto p-5 space-y-3">
          {COMMUNITY_PRESETS.map((p) => {
            const resolved = p.tweakIds.filter((id) => tweaksById.has(id))
            const missing = p.tweakIds.length - resolved.length
            const already = existingNames.has(p.name)
            return (
              <div key={p.name} className="surface-card p-4 space-y-2 border border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-text">
                      {p.glyph && <span aria-hidden className="mr-1.5">{p.glyph}</span>}
                      {p.name}
                    </h4>
                    <p className="text-xs text-accent">{p.tagline}</p>
                  </div>
                  <button
                    onClick={() => importOne(p)}
                    disabled={already}
                    className="shrink-0 px-3 py-1.5 rounded-md border border-border text-xs hover:border-border-glow disabled:opacity-40"
                  >
                    {already ? 'Imported' : 'Import'}
                  </button>
                </div>
                <p className="text-xs text-text-muted leading-snug">{p.description}</p>
                <p className="text-xs text-text-subtle">
                  {resolved.length} tweaks
                  {missing > 0 && (
                    <span className="text-accent"> · {missing} not in this catalog</span>
                  )}
                </p>
              </div>
            )
          })}
        </div>

        <footer className="p-5 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border text-sm hover:border-border-glow"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
