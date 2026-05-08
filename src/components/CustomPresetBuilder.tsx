import { useEffect, useMemo, useState } from 'react'
import { catalog, type TweakRecord } from '../lib/catalog'
import { useCustomPresets, type CustomPreset } from '../store/useCustomPresets'

/**
 * Modal for creating + editing a user-built preset. Lets the user
 * multi-select catalog tweaks, name + describe the bundle, save to
 * localStorage. Apply flow lives in Presets page — this is just the editor.
 */

interface Props {
  open: boolean
  onClose: () => void
  /** When set, edit mode for an existing preset. */
  editing?: CustomPreset | null
}

export function CustomPresetBuilder({ open, onClose, editing }: Props) {
  const add = useCustomPresets((s) => s.add)
  const update = useCustomPresets((s) => s.update)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setTagline(editing.tagline)
      setDescription(editing.description)
      setSelected(new Set(editing.tweakIds))
    } else {
      setName('')
      setTagline('')
      setDescription('')
      setSelected(new Set())
    }
    setSearch('')
  }, [open, editing])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return catalog.tweaks
    return catalog.tweaks.filter((t) =>
      `${t.title} ${t.description} ${t.category} ${t.id}`.toLowerCase().includes(q),
    )
  }, [search])

  function toggle(id: string) {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  function save() {
    const trimmedName = name.trim() || 'Untitled preset'
    const payload = {
      name: trimmedName,
      tagline: tagline.trim() || `${selected.size} custom tweaks`,
      description: description.trim() || 'User-built preset.',
      tweakIds: Array.from(selected),
    }
    if (editing) update(editing.id, payload)
    else add(payload)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-4">
      <div className="surface-card flex flex-col w-full max-w-3xl max-h-full overflow-hidden">
        <header className="p-5 border-b border-border">
          <h3 className="text-lg font-semibold">
            {editing ? 'Edit custom preset' : 'Create custom preset'}
          </h3>
          <p className="text-xs text-text-subtle mt-1">
            Pick any tweaks from the catalog. Saved locally — never uploaded.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 overflow-y-auto">
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preset name"
              className="w-full px-3 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
            />
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Tagline (optional)"
              className="w-full px-3 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm resize-none"
            />
            <div className="text-xs text-text-subtle">
              {selected.size} tweak{selected.size === 1 ? '' : 's'} selected
            </div>
          </div>

          <div className="space-y-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalog…"
              className="w-full px-3 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
            />
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {filtered.map((t) => (
                <CatalogRow
                  key={t.id}
                  tweak={t}
                  checked={selected.has(t.id)}
                  onToggle={() => toggle(t.id)}
                />
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-text-subtle text-center py-6">No matches.</p>
              )}
            </div>
          </div>
        </div>

        <footer className="p-5 border-t border-border flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border text-sm hover:border-border-glow"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={selected.size === 0}
            className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-50"
          >
            {editing ? 'Save changes' : `Save (${selected.size} tweak${selected.size === 1 ? '' : 's'})`}
          </button>
        </footer>
      </div>
    </div>
  )
}

function CatalogRow({
  tweak,
  checked,
  onToggle,
}: {
  tweak: TweakRecord
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label
      className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-bg-card ${
        checked ? 'bg-bg-card border border-border-glow' : 'border border-transparent'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-text leading-tight">{tweak.title}</span>
        <span className="block text-[10px] text-text-subtle uppercase tracking-widest mt-0.5">
          {tweak.category} · risk {tweak.riskLevel}
          {tweak.vipGate === 'vip' && <span className="text-accent"> · VIP</span>}
        </span>
      </span>
    </label>
  )
}
