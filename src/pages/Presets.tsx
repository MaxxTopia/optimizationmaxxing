import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyBatch,
  applyTransaction,
  listApplied,
  revertTweak,
  telemetrySendEvent,
  verifyApplied,
  type AppliedTweak,
  type BatchItem,
} from '../lib/tauri'
import { confirmAction } from '../lib/confirm'
import { catalog, isExperimentalTweak, tweakRequiresAdmin, type TweakRecord } from '../lib/catalog'
import {
  PRESETS,
  presetMissingTweakIds,
  presetDeferredReason,
  presetTweaks,
  presetTweaksForRig,
} from '../lib/presets'
import { useIsVip } from '../store/useVipStore'
import { useRigStore } from '../store/useRigStore'
import { useCustomPresets, type CustomPreset } from '../store/useCustomPresets'
import { CustomPresetBuilder } from '../components/CustomPresetBuilder'
import { CommunityPresetsModal } from '../components/CommunityPresetsModal'
import { ComparePresetsModal } from '../components/ComparePresetsModal'
import { RainbowSixSiegePackGuide } from '../components/RainbowSixSiegePackGuide'

/**
 * The native store keeps one receipt per action, while the UI renders one row
 * per catalog tweak. Collapse action receipts without losing the important
 * distinction between "every action still verifies" and "one action drifted".
 * A single representative receipt was previously enough to make a partially
 * drifted multi-action tweak look healthy and skip it on the next apply.
 */
function activeReceiptMap(rows: AppliedTweak[]): Record<string, AppliedTweak> {
  const grouped = new Map<string, AppliedTweak[]>()
  for (const row of rows) {
    if (row.status !== 'applied') continue
    const group = grouped.get(row.tweakId) ?? []
    group.push(row)
    grouped.set(row.tweakId, group)
  }

  const byId: Record<string, AppliedTweak> = {}
  for (const [tweakId, group] of grouped) {
    const firstProblem = group.find((row) => row.verificationStatus !== 'verified')
    const verificationStatus: AppliedTweak['verificationStatus'] = firstProblem
      ? group.some((row) => row.verificationStatus === 'mismatch')
        ? 'mismatch'
        : 'unknown'
      : 'verified'
    byId[tweakId] = {
      ...group[0],
      verificationStatus,
      verificationDetail:
        firstProblem?.verificationDetail ??
        (group.length > 1 ? `${group.length} actions verified.` : group[0].verificationDetail),
    }
  }
  return byId
}

function isActiveReceipt(receipt?: AppliedTweak): boolean {
  return receipt?.status === 'applied'
}

function isVerifiedReceipt(receipt?: AppliedTweak): boolean {
  return isActiveReceipt(receipt) && receipt?.verificationStatus === 'verified'
}

function isDriftedReceipt(receipt?: AppliedTweak): boolean {
  return isActiveReceipt(receipt) && receipt?.verificationStatus !== 'verified'
}

/**
 * Curated preset bundles + user-built custom presets. Apply / Revert in
 * batch via the apply_batch Tauri command (one UAC for the whole bundle).
 * The Siege and Battle Royale packs use the transactional command so a
 * verification mismatch cannot leave a half-applied performance setup behind.
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
  const rigSpec = useRigStore((s) => s.spec)
  const rigStatus = useRigStore((s) => s.status)
  const ensureRigLoaded = useRigStore((s) => s.ensureLoaded)
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

  async function refreshApplied(): Promise<Record<string, AppliedTweak>> {
    // Use native read-back, not only the receipt table. Windows Update,
    // drivers, Group Policy, or another utility can change a setting after
    // the original apply and the preset must expose that drift. Do not turn a
    // verification failure into an empty map: an apply must fail closed rather
    // than treating every tweak as missing and writing blindly.
    const byId = activeReceiptMap(await verifyApplied())
    setAppliedById(byId)
    return byId
  }

  useEffect(() => {
    void refreshApplied().catch(() => {
      // Browser preview has no native receipt store. Apply surfaces report the
      // same error through handleApply when a real action is attempted.
    })
    void ensureRigLoaded()
  }, [ensureRigLoaded])

  async function handleApply(presetId: string, tweaks: TweakRecord[]) {
    setBusyId(presetId)
    setError(null)
    try {
      const experimental = tweaks.filter(isExperimentalTweak)
      if (
        experimental.length > 0 &&
        !(await confirmAction(
          `${experimental.length} experimental tweak${experimental.length === 1 ? '' : 's'} are in this preset:\n\n` +
            `${experimental.map((t) => `• ${t.title}`).join('\n')}\n\n` +
            'Read each warning, create a restore point, and continue only if you accept the tradeoffs.',
        ))
      ) {
        return
      }
      const liveById = await refreshApplied()
      const items: BatchItem[] = []
      for (const t of tweaks) {
        // Only a fresh, fully verified receipt is considered complete. A
        // mismatch or unknown receipt must be repaired or reported, never
        // silently skipped as if it were still active.
        if (isVerifiedReceipt(liveById[t.id])) continue
        for (const action of t.actions) items.push({ tweakId: t.id, action })
      }
      if (items.length > 0) {
        if (presetId === 'preset.rainbow-six-siege' || presetId === 'preset.br') {
          const report = await applyTransaction(items)
          if (report.status !== 'committed' || report.verifiedCount !== report.itemCount) {
            const detail = [...report.errors, ...report.rollbackErrors].slice(0, 2).join(' ')
            throw new Error(
              `${presetId === 'preset.br' ? 'Battle Royale' : 'Siege'} setup ${report.status}: ${detail || `${report.verifiedCount}/${report.itemCount} actions verified.`}`,
            )
          }
        } else {
          await applyBatch(items)
        }
      }
      await refreshApplied()
      telemetrySendEvent('preset.applied', {
        presetId,
        tweakCount: tweaks.length,
        // VIP-gated presets get tagged so the operator side can split adoption
        // funnel between free + VIP without us shipping a per-user flag.
        anyVip: tweaks.some((t) => t.vipGate === 'vip'),
      })
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

  async function handleDeleteCustom(p: CustomPreset) {
    try {
      if (await confirmAction(`Delete custom preset "${p.name}"?`)) removeCustom(p.id)
    } catch (e) {
      setError(formatErr(e))
    }
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
            Curated bundles + your own custom presets. Each apply runs as one batched UAC; Siege also verifies every supported action and rolls back on mismatch.
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
              const allApplied = tweaks.length > 0 && tweaks.every((t) => isVerifiedReceipt(appliedById[t.id]))
              const anyApplied = tweaks.some((t) => isActiveReceipt(appliedById[t.id]))
              const driftedCount = tweaks.filter((t) => isDriftedReceipt(appliedById[t.id])).length
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
                    {driftedCount > 0 && (
                      <span className="text-amber-200"> · {driftedCount} need live repair</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {!allApplied && (
                      <button
                        onClick={() => handleApply(p.id, tweaks)}
                        disabled={busy || tweaks.length === 0}
                        className="btn-chrome flex-1 px-3 py-2 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-50"
                      >
                        {busy ? 'Applying…' : driftedCount > 0 ? 'Repair / apply remaining' : 'Apply'}
                      </button>
                    )}
                    {anyApplied && (
                      <button
                        onClick={() => handleRevert(p.id, tweaks)}
                        disabled={busy}
                        className="flex-1 px-3 py-2 rounded-md border border-border text-xs hover:border-border-glow disabled:opacity-50"
                      >
                        {busy ? 'Reverting…' : 'Revert'}
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
                      onClick={() => void handleDeleteCustom(p)}
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
            const isSiegePack = p.id === 'preset.rainbow-six-siege'
            const isRigAwarePack = isSiegePack || p.id === 'preset.br'
            const allPresetTweaks = presetTweaks(p)
            const { eligible: tweaks, excluded } = presetTweaksForRig(p, rigSpec)
            const experimental = tweaks.filter(isExperimentalTweak)
            const missing = presetMissingTweakIds(p)
            const allApplied = tweaks.length > 0 && tweaks.every((t) => isVerifiedReceipt(appliedById[t.id]))
            const anyApplied = allPresetTweaks.some((t) => isActiveReceipt(appliedById[t.id]))
            const deferredApplied = excluded.filter((t) => isActiveReceipt(appliedById[t.id]))
            const driftedCount = tweaks.filter((t) => isDriftedReceipt(appliedById[t.id])).length
            const verifiedCount = tweaks.filter((t) => isVerifiedReceipt(appliedById[t.id])).length
            const adminCount = tweaks.filter(tweakRequiresAdmin).length
            const actionCount = tweaks.reduce((total, tweak) => total + tweak.actions.length, 0)
            const detectedFormFactor = rigSpec?.mobo?.isLaptop === true
              ? 'laptop'
              : rigSpec?.mobo?.isLaptop === false
                ? 'desktop'
                : 'unknown'
            const lockedByVip = p.vipGate === 'vip' && !isVip
            const busy = busyId === p.id
            const rigScanPending = isRigAwarePack && (rigStatus === 'idle' || rigStatus === 'loading')

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
                {experimental.length > 0 && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 leading-snug">
                    <strong className="text-amber-200">⚠ {experimental.length} experimental opt-in{experimental.length === 1 ? '' : 's'}.</strong>{' '}
                    Applying this preset asks for a second confirmation. These changes can trade security, power, compatibility, or exact restore behavior for a possible local win.
                  </div>
                )}
                {missing.length > 0 && (
                  <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {missing.length} catalog item{missing.length === 1 ? '' : 's'} unavailable in this build; the preset will not pretend they were applied.
                  </div>
                )}
                {isRigAwarePack && excluded.length > 0 && (
                  <div className="rounded-md border border-border bg-bg-base/60 px-3 py-2 text-xs text-text-muted leading-relaxed">
                    <strong className="text-text">Not applicable on this rig:</strong>{' '}
                    {excluded.map((t) => presetDeferredReason(t, detectedFormFactor)).join('; ')}.
                    {rigStatus === 'error' || rigStatus === 'unavailable'
                      ? ' Rig detection is unavailable, so actions requiring hardware confirmation were skipped; re-scan this PC before applying again.'
                      : ''}
                    <span className="block mt-1 text-text-subtle">This is a compatibility skip, not a failed apply. The remaining {tweaks.length} eligible settings stay available to apply.</span>
                  </div>
                )}
                {isSiegePack && deferredApplied.length > 0 && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 leading-relaxed">
                    <strong className="text-amber-200">Older laptop settings are still active.</strong>{' '}
                    This version will not apply them again, but the previous release left {deferredApplied.length} deferred setting{deferredApplied.length === 1 ? '' : 's'} with an app receipt. Restore only those saved values before applying the safe laptop baseline.
                    <button
                      type="button"
                      onClick={() => void handleRevert(p.id, deferredApplied)}
                      disabled={busy}
                      className="mt-2 block rounded-md border border-amber-300/50 px-2.5 py-1.5 text-xs font-semibold text-amber-100 hover:border-amber-200 disabled:opacity-50"
                    >
                      {busy ? 'Restoring…' : 'Restore deferred laptop settings'}
                    </button>
                  </div>
                )}
                <ul className="text-xs text-text-subtle space-y-1">
                  {tweaks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      <span
                        className={`size-1.5 rounded-full ${
                          isVerifiedReceipt(appliedById[t.id])
                            ? 'bg-accent'
                            : isDriftedReceipt(appliedById[t.id])
                              ? 'bg-amber-300'
                              : 'bg-border'
                        }`}
                        title={
                          isDriftedReceipt(appliedById[t.id])
                            ? appliedById[t.id]?.verificationDetail
                            : undefined
                        }
                      />
                      <span className={isVerifiedReceipt(appliedById[t.id]) ? 'text-text' : isDriftedReceipt(appliedById[t.id]) ? 'text-amber-100' : ''}>{t.title}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between text-xs text-text-subtle">
                  <span>
                    {isSiegePack
                      ? `${tweaks.length} eligible settings · ${actionCount} actions · ${excluded.length} skipped${adminCount > 0 ? ` · ${adminCount} admin` : ''}`
                      : `${tweaks.length} eligible · ${excluded.length} skipped · ${experimental.length} experimental · ${adminCount > 0 ? `${adminCount} admin` : 'no admin'}`}
                  </span>
                  <span>
                    {Object.keys(appliedById).length > 0 && `${verifiedCount}/${tweaks.length} verified`}
                    {driftedCount > 0 && <span className="text-amber-200"> · {driftedCount} drifted</span>}
                  </span>
                </div>
                <div className="flex gap-2 mt-auto">
                  {!allApplied && (
                    <button
                      onClick={() => handleApply(p.id, tweaks)}
                      disabled={busy || lockedByVip || rigScanPending || tweaks.length === 0}
                      title={lockedByVip ? 'VIP unlocks this preset' : rigScanPending ? 'Checking this PC before selecting compatible settings' : undefined}
                      className="btn-chrome flex-1 px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {lockedByVip
                        ? 'VIP only'
                        : rigScanPending
                          ? 'Checking this PC…'
                          : busy
                            ? 'Applying…'
                              : driftedCount > 0
                                ? 'Repair drifted settings'
                            : isSiegePack
                              ? anyApplied ? 'Apply remaining verified settings' : 'Apply verified baseline'
                              : anyApplied ? 'Apply remaining' : 'Apply preset'}
                    </button>
                  )}
                  {anyApplied && (
                    <button
                      onClick={() => handleRevert(p.id, allPresetTweaks)}
                      disabled={busy}
                      className="flex-1 px-4 py-2 rounded-md border border-border text-sm hover:border-border-glow disabled:opacity-50"
                    >
                      {busy ? 'Reverting…' : 'Revert preset'}
                    </button>
                  )}
                </div>
                {isSiegePack && (
                  <a
                    href="#rainbow-six-siege-guide"
                    className="text-center text-xs font-semibold text-accent hover:underline"
                  >
                    Open Siege setup values ↓
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <RainbowSixSiegePackGuide gpuVendor={rigSpec?.gpu.vendor ?? null} />

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
