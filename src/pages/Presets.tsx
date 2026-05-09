import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyBatch,
  listApplied,
  revertTweak,
  type AppliedTweak,
  type BatchItem,
} from '../lib/tauri'
import { catalog, tweakRequiresAdmin, type TweakRecord } from '../lib/catalog'
import { PRESETS, presetTweaks } from '../lib/presets'
import { useIsVip } from '../store/useVipStore'
import { useCustomPresets, type CustomPreset } from '../store/useCustomPresets'
import { CustomPresetBuilder } from '../components/CustomPresetBuilder'
import { CommunityPresetsModal } from '../components/CommunityPresetsModal'
import { ComparePresetsModal } from '../components/ComparePresetsModal'

/**
 * Curated preset bundles + user-built custom presets. Apply / Revert in
 * batch via the apply_batch Tauri command (one UAC for the whole bundle).
 * Custom presets persist to localStorage and export/import as JSON.
 */
export function Presets() {
  const [appliedById, setAppliedById] = useState<Record<string, AppliedTweak>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [communityOpen, setCommunityOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [editing, setEditing] = useState<CustomPreset | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isVip = useIsVip()
  const customPresets = useCustomPresets((s) => s.presets)
  const removeCustom = useCustomPresets((s) => s.remove)
  const importMany = useCustomPresets((s) => s.importMany)

  // Lookup table for resolving custom preset tweakIds → TweakRecord.
  const tweaksById = useMemo(() => {
    const map = new Map<string, TweakRecord>()
    catalog.tweaks.forEach((t) => map.set(t.id, t))
    return map
  }, [])

  function resolveCustomPreset(p: CustomPreset): TweakRecord[] {
    return p.tweakIds.map((id) => tweaksById.get(id)).filter((t): t is TweakRecord => !!t)
  }

  async function refreshApplied() {
    try {
      const list = await listApplied()
      const byId: Record<string, AppliedTweak> = {}
      for (const a of list) {
        if (a.status === 'applied' && !byId[a.tweakId]) byId[a.tweakId] = a
      }
      setAppliedById(byId)
    } catch {
      /* not in Tauri */
    }
  }

  useEffect(() => {
    refreshApplied()
  }, [])

  async function handleApply(presetId: string, tweaks: TweakRecord[]) {
    setBusyId(presetId)
    setError(null)
    try {
      const items: BatchItem[] = []
      for (const t of tweaks) {
        if (appliedById[t.id]) continue
        for (const action of t.actions) items.push({ tweakId: t.id, action })
      }
      if (items.length > 0) await applyBatch(items)
      await refreshApplied()
    } catch (e) {
      setError(formatErr(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleRevert(presetId: string, tweaks: TweakRecord[]) {
    setBusyId(presetId)
    setError(null)
    try {
      const list = await listApplied()
      const ids = new Set(tweaks.map((t) => t.id))
      const ours = list.filter((a) => ids.has(a.tweakId) && a.status === 'applied')
      for (const a of ours.sort((x, y) => y.appliedAt.localeCompare(x.appliedAt))) {
        await revertTweak(a.receiptId)
      }
      await refreshApplied()
    } catch (e) {
      setError(formatErr(e))
    } finally {
      setBusyId(null)
    }
  }

  function handleExport(p: CustomPreset) {
    const exportable = {
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      tweakIds: p.tweakIds,
    }
    const blob = new Blob([JSON.stringify(exportable, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${p.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.preset.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      const valid = list.filter(
        (p) =>
          p &&
          typeof p === 'object' &&
          typeof p.name === 'string' &&
          Array.isArray(p.tweakIds),
      )
      const incoming = valid.map((p) => ({
        name: String(p.name).slice(0, 60),
        tagline: String(p.tagline ?? '').slice(0, 80),
        description: String(p.description ?? '').slice(0, 400),
        tweakIds: p.tweakIds.filter((id: unknown) => typeof id === 'string'),
      }))
      const n = importMany(incoming)
      setError(`Imported ${n} preset${n === 1 ? '' : 's'}.`)
    } catch (err) {
      setError(`Import failed: ${formatErr(err)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleEdit(p: CustomPreset) {
    setEditing(p)
    setBuilderOpen(true)
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">bundles</p>
          <h1 className="text-2xl font-bold">Presets</h1>
          <p className="text-text-muted text-sm max-w-xl">
            Curated bundles + your own custom presets. Each apply runs as one batched UAC.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept="application/json"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => setCompareOpen(true)}
            className="px-3 py-1.5 rounded-md border border-border text-sm hover:border-border-glow"
          >
            Compare
          </button>
          <button
            onClick={() => setCommunityOpen(true)}
            className="px-3 py-1.5 rounded-md border border-border text-sm hover:border-border-glow"
          >
            Browse community
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-md border border-border text-sm hover:border-border-glow"
          >
            Import .json
          </button>
          <button
            onClick={() => {
              setEditing(null)
              setBuilderOpen(true)
            }}
            className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-sm font-semibold"
          >
            + New custom preset
          </button>
        </div>
      </header>

      {error && <div className="surface-card p-3 text-sm text-accent">{error}</div>}

      {customPresets.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-text-subtle">your custom presets</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {customPresets.map((p) => {
              const tweaks = resolveCustomPreset(p)
              const allApplied = tweaks.length > 0 && tweaks.every((t) => appliedById[t.id])
              const anyApplied = tweaks.some((t) => appliedById[t.id])
              const adminCount = tweaks.filter(tweakRequiresAdmin).length
              const busy = busyId === p.id

              return (
                <div
                  key={p.id}
                  className={`surface-card p-5 flex flex-col gap-3 ${
                    allApplied ? 'border-border-glow shadow-accent-glow' : ''
                  }`}
                >
                  <div>
                    <p className="text-xs uppercase tracking-widest text-accent">custom</p>
                    <h2 className="text-xl font-bold">{p.name}</h2>
                    {p.tagline && <p className="text-sm text-text-muted">{p.tagline}</p>}
                  </div>
                  {p.description && (
                    <p className="text-sm text-text-muted leading-relaxed">{p.description}</p>
                  )}
                  <div className="text-xs text-text-subtle">
                    {tweaks.length}/{p.tweakIds.length} tweaks resolved
                    {tweaks.length !== p.tweakIds.length && (
                      <span className="text-accent">
                        {' '}
                        · {p.tweakIds.length - tweaks.length} missing
                      </span>
                    )}
                    · {adminCount > 0 ? `${adminCount} admin` : 'no admin'}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {anyApplied || allApplied ? (
                      <button
                        onClick={() => handleRevert(p.id, tweaks)}
                        disabled={busy}
                        className="flex-1 px-3 py-2 rounded-md border border-border text-xs hover:border-border-glow disabled:opacity-50"
                      >
                        {busy ? 'Reverting…' : 'Revert'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleApply(p.id, tweaks)}
                        disabled={busy || tweaks.length === 0}
                        className="btn-chrome flex-1 px-3 py-2 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-50"
                      >
                        {busy ? 'Applying…' : 'Apply'}
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(p)}
                      className="px-3 py-2 rounded-md border border-border text-xs hover:border-border-glow"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleExport(p)}
                      className="px-3 py-2 rounded-md border border-border text-xs hover:border-border-glow"
                      title="Export as JSON for sharing"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete custom preset "${p.name}"?`)) removeCustom(p.id)
                      }}
                      className="px-3 py-2 rounded-md border border-border text-xs hover:border-accent text-text-subtle"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-text-subtle">curated bundles</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {PRESETS.map((p) => {
            const tweaks = presetTweaks(p)
            const allApplied = tweaks.length > 0 && tweaks.every((t) => appliedById[t.id])
            const anyApplied = tweaks.some((t) => appliedById[t.id])
            const adminCount = tweaks.filter(tweakRequiresAdmin).length
            const lockedByVip = p.vipGate === 'vip' && !isVip
            const busy = busyId === p.id

            return (
              <div
                key={p.id}
                className={`surface-card p-5 flex flex-col gap-4 ${
                  allApplied ? 'border-border-glow shadow-accent-glow' : ''
                }`}
              >
                <div>
                  <p className="text-xs uppercase tracking-widest text-text-subtle flex items-center gap-2 flex-wrap">
                    <span>{p.archetype}</span>
                    {p.vipGate === 'vip' && (
                      <span
                        title="VIP unlocks this preset — see Pricing"
                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1"
                        style={{
                          background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #cc9900 100%)',
                          color: '#3a2a00',
                          border: '1px solid rgba(255, 215, 0, 0.65)',
                          boxShadow: '0 0 10px rgba(255, 215, 0, 0.35)',
                        }}
                      >
                        <span aria-hidden="true">👑</span> VIP
                      </span>
                    )}
                  </p>
                  <h2 className="text-xl font-bold">
                    {p.glyph && <span className="mr-2" aria-hidden>{p.glyph}</span>}
                    {p.name}
                  </h2>
                  <p className="text-sm text-text-muted">{p.tagline}</p>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">{p.description}</p>
                <ul className="text-xs text-text-subtle space-y-1">
                  {tweaks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      <span
                        className={`size-1.5 rounded-full ${
                          appliedById[t.id] ? 'bg-accent' : 'bg-border'
                        }`}
                      />
                      <span className={appliedById[t.id] ? 'text-text' : ''}>{t.title}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between text-xs text-text-subtle">
                  <span>
                    {tweaks.length} tweaks · {adminCount > 0 ? `${adminCount} admin` : 'no admin'}
                  </span>
                  <span>
                    {Object.keys(appliedById).length > 0 &&
                      `${tweaks.filter((t) => appliedById[t.id]).length}/${tweaks.length} applied`}
                  </span>
                </div>
                <div className="flex gap-2 mt-auto">
                  {allApplied || anyApplied ? (
                    <button
                      onClick={() => handleRevert(p.id, tweaks)}
                      disabled={busy}
                      className="flex-1 px-4 py-2 rounded-md border border-border text-sm hover:border-border-glow disabled:opacity-50"
                    >
                      {busy ? 'Reverting…' : 'Revert preset'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleApply(p.id, tweaks)}
                      disabled={busy || lockedByVip}
                      title={lockedByVip ? 'VIP unlocks this preset' : undefined}
                      className="btn-chrome flex-1 px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {lockedByVip ? 'VIP only' : busy ? 'Applying…' : 'Apply preset'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <CustomPresetBuilder
        open={builderOpen}
        editing={editing}
        onClose={() => {
          setBuilderOpen(false)
          setEditing(null)
        }}
      />

      <CommunityPresetsModal
        open={communityOpen}
        onClose={() => setCommunityOpen(false)}
        onImported={(n) => setError(`Imported ${n} community preset${n === 1 ? '' : 's'}.`)}
      />

      <ComparePresetsModal open={compareOpen} onClose={() => setCompareOpen(false)} />
    </div>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
