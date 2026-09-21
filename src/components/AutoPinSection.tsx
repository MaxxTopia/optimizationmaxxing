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
 * Per-game-name CPU Set rules. The configuration survives app restarts, but
 * the polling daemon runs only while the app is open and enabled.
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
  { label: 'Marvel Rivals', exe: 'Marvel-Win64-Shipping.exe' },
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
    const cores = recommendCoresForRig(info, exe)
    const next: AutoPinConfig = {
      ...config,
      rules: [...config.rules, { processName: exe, cores }],
    }
    persist(next)
    setEditingIdx(next.rules.length - 1)
  }

  function handleAutoPickForRule(idx: number) {
    if (!config || !info) return
    const rule = config.rules[idx]
    if (!rule) return
    const cores = recommendCoresForRig(info, rule.processName)
    handleUpdateRule(idx, { cores })
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
        <div className="text-sm text-text-muted max-w-3xl leading-snug space-y-2">
          <p>
            Add Fortnite, choose <strong className="text-text">all detected CPU Sets</strong>
            for the no-subset baseline or try the Intel P-core preset as an A/B test, then start
            the daemon. It polls while this app is open; the saved rules return when the app is
            reopened, but this is not a Windows service and does not start the app at boot.
          </p>
        </div>

        <div
          className="mt-3 rounded-md border p-3 text-xs leading-snug max-w-3xl"
          style={{
            borderColor: 'rgba(255, 215, 0, 0.4)',
            background: 'rgba(255, 215, 0, 0.04)',
          }}
        >
          <p className="font-semibold text-text mb-1">Fortnite preset</p>
          <p className="text-text-muted">
            On Intel hybrid CPUs, the P-core button selects the IDs Windows actually reports.
            It is an experiment, not a universal Fortnite optimization. Compare identical matches
            and frametime captures against the all-CPU-Set baseline; keep whichever wins
            repeatably. Other CPUs start with all detected CPU Sets.
          </p>
        </div>

        <div
          className="mt-3 rounded-md border p-3 text-xs leading-snug max-w-3xl"
          style={{
            borderColor: 'rgba(226, 91, 255, 0.4)',
            background: 'rgba(226, 91, 255, 0.05)',
          }}
        >
          <p className="font-semibold text-text mb-1">Limits</p>
          <p className="text-text-muted">
            CPU Sets are soft scheduling guidance, not core reservations or a latency guarantee.
            A title or anti-cheat may reject or override the request; use the native scheduler if
            behavior changes or results do not improve.
          </p>
        </div>
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
            {status?.lastError && (
              <p role="alert" className="mt-1 max-w-2xl text-[11px] text-accent">
                Last pin error: {status.lastError}
              </p>
            )}
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
              onAutoPick={() => handleAutoPickForRule(idx)}
              onPcorePreset={
                info?.isHybrid && rule.processName.toLowerCase().includes('fortnite')
                  ? () => handleUpdateRule(idx, { cores: info.highPerformanceIds })
                  : undefined
              }
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
  onAutoPick,
  onPcorePreset,
}: {
  rule: AutoPinRule
  info: CpuSetInfo | null
  busy: boolean
  isEditing: boolean
  isPinned: boolean
  onEditToggle: () => void
  onChange: (patch: Partial<AutoPinRule>) => void
  onRemove: () => void
  onAutoPick: () => void
  onPcorePreset?: () => void
}) {
  const autoPickLabel = 'All detected sets'
  return (
    <div className="border border-border rounded-md p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm text-text font-mono">
            {rule.processName}{' '}
            {isPinned && <span className="text-[10px] text-emerald-300 ml-2">PINNED NOW</span>}
          </p>
          <p className="text-[11px] text-text-subtle">
            CPU Set IDs [{rule.cores.join(', ')}]{' '}
            {rule.cores.length === 0 && <span className="text-amber-300">— no cores selected, won't pin</span>}
          </p>
        </div>
        <div className="flex gap-2 text-[11px]">
          <button onClick={onAutoPick} disabled={busy || !info} className="text-accent hover:text-text underline">
            {autoPickLabel}
          </button>
          {onPcorePreset && (
            <button
              onClick={onPcorePreset}
              disabled={busy}
              title="Measured Fortnite experiment: compare with the all-CPU-Set baseline."
              className="text-emerald-300 hover:text-text underline"
            >
              Fortnite P-core test
            </button>
          )}
          <button onClick={onEditToggle} disabled={busy} className="text-text-muted hover:text-text underline">
            {isEditing ? 'done' : 'edit'}
          </button>
          <button onClick={onRemove} disabled={busy} className="text-text-subtle hover:text-accent underline">
            remove
          </button>
        </div>
      </div>
      {isEditing && info && (
        <CoreGrid info={info} rule={rule} busy={busy} onChange={onChange} />
      )}
    </div>
  )
}

/**
 * Select actual Windows CPU Set IDs. Labels include the processor group and
 * group-relative logical-processor index returned by Windows.
 */
function CoreGrid({
  info,
  rule,
  busy,
  onChange,
}: {
  info: CpuSetInfo
  rule: AutoPinRule
  busy: boolean
  onChange: (patch: Partial<AutoPinRule>) => void
}) {
  function setCores(next: number[]) {
    onChange({ cores: next.slice().sort((a, b) => a - b) })
  }

  function toggle(id: number) {
    setCores(rule.cores.includes(id) ? rule.cores.filter((x) => x !== id) : [...rule.cores, id])
  }

  const highIds = new Set(info.highPerformanceIds)
  const sections: Array<{ label: string; sets: CpuSetInfo['cpuSets']; tag: 'high' | 'other' | '' }> =
    info.isHybrid
      ? [
          {
            label: `Highest performance class (${info.highPerformanceIds.length})`,
            sets: info.cpuSets.filter((set) => highIds.has(set.id)),
            tag: 'high',
          },
          {
            label: `Other efficiency classes (${info.lowerPerformanceIds.length})`,
            sets: info.cpuSets.filter((set) => !highIds.has(set.id)),
            tag: 'other',
          },
        ]
      : [{ label: `Detected CPU Sets (${info.cpuSets.length})`, sets: info.cpuSets, tag: '' }]

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">cores</p>
        <div className="flex items-center gap-2 text-[10px]">
          {info.isHybrid && info.highPerformanceIds.length > 0 && (
            <button
              onClick={() => setCores(info.highPerformanceIds)}
              disabled={busy}
              className="px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
              title="A/B test the highest Windows efficiency class against all detected CPU Sets."
            >
              Highest class A/B test
            </button>
          )}
          <button
            onClick={() => setCores(info.cpuSetIds)}
            disabled={busy}
            className="px-2 py-0.5 rounded border border-border text-text-muted hover:text-text disabled:opacity-50"
          >
            All
          </button>
          <button
            onClick={() => setCores([])}
            disabled={busy}
            className="px-2 py-0.5 rounded border border-border text-text-subtle hover:text-text disabled:opacity-50"
          >
            None
          </button>
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.label} className="space-y-1">
          <p className="text-[10px] text-text-subtle">
            {info.isHybrid ? (
              <span
                className={section.tag === 'high' ? 'text-emerald-300' : 'text-amber-300'}
              >
                ●
              </span>
            ) : (
              ''
            )}{' '}
            {section.label}
          </p>
          <div className="grid grid-cols-8 gap-1">
            {section.sets.map((set) => {
              const selected = rule.cores.includes(set.id)
              const accent =
                section.tag === 'high'
                  ? 'border-emerald-500/40'
                  : section.tag === 'other'
                  ? 'border-amber-500/40'
                  : 'border-border'
              return (
                <button
                  key={set.id}
                  onClick={() => toggle(set.id)}
                  disabled={busy}
                  title={`CPU Set ${set.id} · group ${set.group}, logical processor ${set.logicalProcessorIndex}, core ${set.coreIndex}, efficiency class ${set.efficiencyClass}`}
                  className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded border text-center ${
                    selected
                      ? 'bg-accent text-bg-base border-accent'
                      : `bg-bg-card text-text-muted ${accent} hover:border-border-glow`
                  }`}
                >
                  {set.id}
                  {section.tag && (
                    <span
                      className={`ml-0.5 text-[9px] ${
                        selected
                          ? 'text-bg-base/80'
                          : section.tag === 'high'
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {section.tag === 'high' ? 'H' : 'L'}
                    </span>
                  )}
                  <span className="block text-[8px] text-text-subtle">
                    G{set.group}/L{set.logicalProcessorIndex}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Start from every CPU Set Windows reports. Narrow subsets are manual
 * experiments, not automatic recommendations.
 */
function recommendCoresForRig(info: CpuSetInfo, _exe: string): number[] {
  return [...info.cpuSetIds]
}

function fmtTs(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString()
  } catch {
    return iso
  }
}
