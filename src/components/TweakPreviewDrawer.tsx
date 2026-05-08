import type { TweakRecord } from '../lib/catalog'
import type { TweakAction, TweakPreview } from '../lib/tauri'

/**
 * Structured before/after preview. Replaces the old raw-JSON dump.
 * Per-action card shows the kind chip, the target (hive\path\name or
 * bcd-name or first PS line), and a Before → After value table.
 */

export interface ResolvedPreview {
  tweak: TweakRecord
  actions: { action: TweakAction; preview: TweakPreview }[]
}

interface Props {
  preview: ResolvedPreview
  onClose: () => void
}

export function TweakPreviewDrawer({ preview, onClose }: Props) {
  const { tweak, actions } = preview
  const anyRequiresAdmin = actions.some((a) => a.preview.requiresAdmin)
  const oneWayActions = actions
    .map(({ action }, i) => ({ action, i, oneWay: isOneWayAction(action) }))
    .filter((x) => x.oneWay !== null)

  return (
    <div className="surface-card p-4 space-y-3 border border-border-glow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">preview</p>
          <h3 className="font-semibold text-text">{tweak.title}</h3>
          <p className="text-xs text-text-muted">{actions.length} action{actions.length === 1 ? '' : 's'} · risk {tweak.riskLevel} · {tweak.rebootRequired === 'none' ? 'no reboot' : tweak.rebootRequired}</p>
        </div>
        <button
          onClick={onClose}
          className="text-text-subtle hover:text-text text-xs underline"
        >
          close
        </button>
      </div>

      {anyRequiresAdmin && (
        <div className="text-xs text-accent flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-accent">UAC</span>
          One UAC prompt covers the whole apply.
        </div>
      )}

      {oneWayActions.length > 0 && (
        <div className="text-xs rounded border border-accent/50 bg-accent/5 p-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-accent text-accent">
              one-way
            </span>
            <span className="text-text">
              {oneWayActions.length === actions.length
                ? 'This tweak cannot be auto-reverted.'
                : `${oneWayActions.length} of ${actions.length} actions are one-way.`}
            </span>
          </div>
          <ul className="text-text-muted space-y-0.5 ml-1">
            {oneWayActions.map((x) => (
              <li key={x.i}>· #{x.i + 1}: {x.oneWay}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        {actions.map(({ action, preview: p }, i) => (
          <ActionCard key={i} action={action} preview={p} index={i} />
        ))}
      </div>
    </div>
  )
}

function isOneWayAction(action: TweakAction): string | null {
  if (action.kind === 'registry_delete' && action.name === null) {
    return 'subkey delete — entire subkey contents are removed; engine cannot restore the children.'
  }
  if (action.kind === 'powershell_script' && action.revert === null) {
    return 'PowerShell script with no revert defined — apply is permanent until manually undone.'
  }
  return null
}

function ActionCard({ action, preview, index }: { action: TweakAction; preview: TweakPreview; index: number }) {
  return (
    <div className="rounded border border-border bg-bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-text-subtle">#{index + 1}</span>
        <KindChip kind={action.kind} />
        {preview.requiresAdmin && (
          <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-accent text-accent">
            admin
          </span>
        )}
      </div>
      <ActionTarget action={action} />
      <BeforeAfter action={action} preview={preview} />
    </div>
  )
}

function KindChip({ kind }: { kind: string }) {
  const meta: Record<string, { label: string; glyph: string }> = {
    registry_set: { label: 'reg set', glyph: '🔑' },
    registry_delete: { label: 'reg delete', glyph: '🗝' },
    bcdedit_set: { label: 'bcdedit', glyph: '⚙' },
    powershell_script: { label: 'powershell', glyph: '⌨' },
    file_write: { label: 'file write', glyph: '📝' },
  }
  const m = meta[kind] ?? { label: kind, glyph: '·' }
  return (
    <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-border text-text">
      <span aria-hidden className="mr-1">{m.glyph}</span>
      {m.label}
    </span>
  )
}

function ActionTarget({ action }: { action: TweakAction }) {
  if (action.kind === 'registry_set' || action.kind === 'registry_delete') {
    const valueName = 'name' in action ? action.name : null
    return (
      <div className="text-xs font-mono break-all">
        <span className="text-text-subtle">{action.hive.toUpperCase()}\</span>
        <span className="text-text-muted">{action.path}</span>
        {valueName && (
          <>
            <span className="text-text-subtle">\</span>
            <span className="text-text">{valueName}</span>
          </>
        )}
      </div>
    )
  }
  if (action.kind === 'bcdedit_set') {
    return (
      <div className="text-xs font-mono break-all">
        <span className="text-text-subtle">bcdedit /set {'{current}'} </span>
        <span className="text-text">{action.name}</span>
      </div>
    )
  }
  if (action.kind === 'powershell_script') {
    const firstLine = action.apply.split('\n').map((s) => s.trim()).find(Boolean) ?? '(empty)'
    return (
      <div className="text-xs font-mono break-all text-text" title={action.apply}>
        $ {firstLine}
      </div>
    )
  }
  if (action.kind === 'file_write') {
    return (
      <div className="text-xs font-mono break-all text-text">
        {action.path}
      </div>
    )
  }
  return null
}

function BeforeAfter({ action, preview }: { action: TweakAction; preview: TweakPreview }) {
  // Pull "before" from the captured pre-state JSON; "after" comes from the action payload.
  const before = formatBefore(action, preview.preState)
  const after = formatAfter(action)
  if (before === null && after === null) {
    return (
      <p className="text-xs text-text-subtle">{preview.summary}</p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <ValueBox label="Before" value={before ?? '—'} muted />
      <ValueBox label="After" value={after ?? '—'} accent />
    </div>
  )
}

function ValueBox({ label, value, muted, accent }: { label: string; value: string; muted?: boolean; accent?: boolean }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="text-[10px] uppercase tracking-widest text-text-subtle mb-0.5">{label}</div>
      <div
        className={`font-mono text-xs break-all ${
          accent ? 'text-accent' : muted ? 'text-text-muted' : 'text-text'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function formatBefore(action: TweakAction, preState: unknown): string | null {
  if (preState === null || preState === undefined) return '(did not exist)'
  if (typeof preState !== 'object') return String(preState)
  const ps = preState as Record<string, unknown>

  if (action.kind === 'registry_set' || action.kind === 'registry_delete') {
    if (ps.value !== undefined) {
      return formatRegValue(ps.value, ps.type as string | undefined)
    }
    if (ps.subkey_existed) return '(subkey existed)'
    return '(did not exist)'
  }
  if (action.kind === 'bcdedit_set') {
    if (ps.found === true) return String(ps.value ?? '(unknown)')
    if (ps.found === false) return '(default)'
    return '(needs admin to read)'
  }
  if (action.kind === 'powershell_script') {
    return '(state captured by script)'
  }
  if (action.kind === 'file_write') {
    if (ps.existed === true) {
      const size = (ps.size_bytes as number | undefined) ?? 0
      return `(existed, ${size} bytes — snapshot retained)`
    }
    return '(did not exist)'
  }
  return null
}

function formatAfter(action: TweakAction): string | null {
  if (action.kind === 'registry_set') {
    return formatRegValue(action.value, action.value_type)
  }
  if (action.kind === 'registry_delete') {
    return '(deleted)'
  }
  if (action.kind === 'bcdedit_set') {
    return action.value
  }
  if (action.kind === 'powershell_script') {
    return '(script-side mutation)'
  }
  if (action.kind === 'file_write') {
    const pad = action.contents_b64.match(/=*$/)?.[0].length ?? 0
    const size = Math.max(0, (action.contents_b64.length / 4) * 3 - pad)
    return `(write ${Math.round(size)} bytes)`
  }
  return null
}

function formatRegValue(value: unknown, type?: string): string {
  if (type === 'dword' || type === 'qword') {
    if (typeof value === 'number') {
      return `${value} (0x${value.toString(16).toUpperCase()})`
    }
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (type === 'binary') return value.map((b) => Number(b).toString(16).padStart(2, '0')).join(' ')
    return JSON.stringify(value)
  }
  return JSON.stringify(value)
}
