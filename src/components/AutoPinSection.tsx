import { useEffect, useState } from 'react'
import {
  autoPinGetConfig,
  autoPinSetConfig,
  autoPinStatus,
  cpuSetInfo,
  inTauri,
  type AutoPinConfig,
  type AutoPinRule,
  type AutoPinStatus,
  type CpuSetInfo,
} from '../lib/tauri'

/**
 * Per-game-name auto-pin daemon UI. Maintains a list of {processName, cores}
 * rules; the Rust-side daemon polls every `pollSeconds` and pins matching
 * processes via SetProcessDefaultCpuSets. Pin state survives app restarts —
 * config persists to %LOCALAPPDATA%\optmaxxing\auto-pin.json.
 *
 * Pairs with the click-to-pin section above (CpuPinningSection) — that's
 * one-shot for whatever's in the foreground; this is set-and-forget for
 * games you launch repeatedly.
 */

const COMMON_GAMES: Array<{ label: string; exe: string }> = [
  { label: 'Fortnite', exe: 'FortniteClient-Win64-Shipping.exe' },
  { label: 'Valorant', exe: 'VALORANT-Win64-Shipping.exe' },
  { label: 'CS2', exe: 'cs2.exe' },
  { label: 'Apex Legends', exe: 'r5apex.exe' },
  { label: 'Overwatch 2', exe: 'Overwatch.exe' },
  { label: 'Warzone', exe: 'cod.exe' },
]

export function AutoPinSection() {
  const isNative = inTauri()
  const [info, setInfo] = useState<CpuSetInfo | null>(null)
  const [config, setConfig] = useState<AutoPinConfig | null>(null)
  const [status, setStatus] = useState<AutoPinStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!isNative) return
    Promise.all([cpuSetInfo(), autoPinGetConfig(), autoPinStatus()])
      .then(([i, c, s]) => {
        setInfo(i)
        setConfig(c)
        setStatus(s)
      })
      .catch((e) => setErr(String(e)))
  }, [isNative])

  // Poll status every 5 s when daemon is running so the UI shows fresh
  // "currently pinned" + last-poll timestamp.
  useEffect(() => {
    if (!isNative || !config?.enabled) return
    const t = setInterval(() => {
      autoPinStatus().then(setStatus).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [isNative, config?.enabled])

  if (!isNative) return null

  async function persist(next: AutoPinConfig) {
    setBusy(true)
    setErr(null)
    try {
      const saved = await autoPinSetConfig(next)
      setConfig(saved)
      const s = await autoPinStatus()
      setStatus(s)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function handleToggleEnabled() {
    if (!config) return
    persist({ ...config, enabled: !config.enabled })
  }

  function handleAddRule(exe: string) {
    if (!config || !info) return
    const cores = defaultCores(info.logicalProcessorCount)
    const next: AutoPinConfig = {
      ...config,
      rules: [...config.rules, { processName: exe, cores }],
    }
    persist(next)
    setEditingIdx(next.rules.length - 1)
  }

  function handleRemoveRule(idx: number) {
    if (!config) return
    const next: AutoPinConfig = {
      ...config,
      rules: config.rules.filter((_, i) => i !== idx),
    }
    persist(next)
    setEditingIdx(null)
  }

  function handleUpdateRule(idx: number, patch: Partial<AutoPinRule>) {
    if (!config) return
    const next: AutoPinConfig = {
      ...config,
      rules: config.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }
    persist(next)
  }

  function handlePollSeconds(n: number) {
    if (!config) return
    persist({ ...config, pollSeconds: Math.max(1, Math.min(60, n)) })
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Auto-pin games (CPU Sets daemon)</h2>
        <p className="text-sm text-text-muted max-w-3xl leading-snug">
          Background polling task that watches for game processes by name and
          pins them to your reserved cores automatically — no need to Alt-Tab and
          click "Pin foreground game" every launch. Polls every N seconds (default 5).
          Config persists across app restarts at{' '}
          <code className="text-text-muted">%LOCALAPPDATA%\optmaxxing\auto-pin.json</code>.
        </p>
      </div>
      <div className="surface-card p-6 space-y-4">
        {err && <div className="text-xs text-accent">Error: {err}</div>}

        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-text-subtle">daemon</p>
            <p className="text-base font-semibold">
              {config?.enabled ? (
                <span className="text-emerald-300">Running</span>
              ) : (
                <span className="text-text-muted">Off</span>
              )}
              {status?.lastPoll && (
                <span className="ml-2 text-[11px] text-text-subtle font-mono">
                  last poll · {fmtTs(status.lastPoll)}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
              poll
              <input
                type="number"
                min={1}
                max={60}
                value={config?.pollSeconds ?? 5}
                onChange={(e) => handlePollSeconds(Number(e.target.value))}
                disabled={busy || !config}
                className="w-14 px-2 py-1 rounded-md bg-bg-card border border-border text-xs tabular-nums"
              />
              s
            </label>
            <button
              onClick={handleToggleEnabled}
              disabled={busy || !config}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50 ${
                config?.enabled
                  ? 'border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-amber-500'
                  : 'btn-chrome bg-accent text-bg-base'
              }`}
            >
              {config?.enabled ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-3 border-t border-border">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">rules ({config?.rules.length ?? 0})</p>
          {config?.rules.length === 0 && (
            <p className="text-xs text-text-subtle italic">
              No rules configured. Add a game from the quick-picker below or type a custom .exe name.
            </p>
          )}
          {config?.rules.map((rule, idx) => (
            <RuleRow
              key={idx}
              rule={rule}
              info={info}
              busy={busy}
              isEditing={editingIdx === idx}
              isPinned={!!status?.pinned.find((p) => p.processName.toLowerCase() === rule.processName.toLowerCase())}
              onEditToggle={() => setEditingIdx(editingIdx === idx ? null : idx)}
              onChange={(patch) => handleUpdateRule(idx, patch)}
              onRemove={() => handleRemoveRule(idx)}
            />
          ))}
        </div>

        <div className="space-y-2 pt-3 border-t border-border">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">add common games</p>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_GAMES.map((g) => {
              const already = config?.rules.some((r) => r.processName.toLowerCase() === g.exe.toLowerCase())
              return (
                <button
                  key={g.exe}
                  onClick={() => handleAddRule(g.exe)}
                  disabled={busy || already}
                  className="px-2 py-1 text-xs rounded border border-border bg-bg-card text-text-muted hover:border-border-glow hover:text-text disabled:opacity-40"
                  title={g.exe}
                >
                  + {g.label}
                </button>
              )
            })}
            <button
              onClick={() => {
                const exe = prompt('Process name (with .exe extension):')
                if (exe?.trim()) handleAddRule(exe.trim())
              }}
              disabled={busy}
              className="px-2 py-1 text-xs rounded border border-dashed border-border text-text-muted hover:border-border-glow hover:text-text disabled:opacity-40"
            >
              + custom
            </button>
          </div>
        </div>

        {status && status.pinned.length > 0 && (
          <div className="space-y-1 pt-3 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-emerald-300">currently pinned ({status.pinned.length})</p>
            <ul className="space-y-0.5">
              {status.pinned.map((p) => (
                <li key={p.pid} className="text-xs font-mono text-text">
                  PID {p.pid} · {p.processName}{' '}
                  <span className="text-text-subtle">→ cores [{p.cores.join(',')}]</span>
                  <span className="ml-2 text-[10px] text-text-subtle">since {fmtTs(p.pinnedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function RuleRow({
  rule,
  info,
  busy,
  isEditing,
  isPinned,
  onEditToggle,
  onChange,
  onRemove,
}: {
  rule: AutoPinRule
  info: CpuSetInfo | null
  busy: boolean
  isEditing: boolean
  isPinned: boolean
  onEditToggle: () => void
  onChange: (patch: Partial<AutoPinRule>) => void
  onRemove: () => void
}) {
  return (
    <div className="border border-border rounded-md p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm text-text font-mono">
            {rule.processName}{' '}
            {isPinned && <span className="text-[10px] text-emerald-300 ml-2">PINNED NOW</span>}
          </p>
          <p className="text-[11px] text-text-subtle">
            cores [{rule.cores.join(',')}]{' '}
            {rule.cores.length === 0 && <span className="text-amber-300">— no cores selected, won't pin</span>}
          </p>
        </div>
        <div className="flex gap-2 text-[11px]">
          <button onClick={onEditToggle} disabled={busy} className="text-text-muted hover:text-text underline">
            {isEditing ? 'done' : 'edit'}
          </button>
          <button onClick={onRemove} disabled={busy} className="text-text-subtle hover:text-accent underline">
            remove
          </button>
        </div>
      </div>
      {isEditing && info && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">cores</p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: info.logicalProcessorCount }, (_, i) => (
              <button
                key={i}
                onClick={() => {
                  const next = rule.cores.includes(i)
                    ? rule.cores.filter((x) => x !== i)
                    : [...rule.cores, i].sort((a, b) => a - b)
                  onChange({ cores: next })
                }}
                disabled={busy}
                className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded border ${
                  rule.cores.includes(i)
                    ? 'bg-accent text-bg-base border-accent'
                    : 'bg-bg-card text-text-muted border-border hover:border-border-glow'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function defaultCores(n: number): number[] {
  if (n <= 4) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: Math.ceil(n / 2) }, (_, i) => i)
}

function fmtTs(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString()
  } catch {
    return iso
  }
}
