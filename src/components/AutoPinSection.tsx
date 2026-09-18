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
            <strong className="text-text">What it does in plain English:</strong> a background
            poll task that watches for specific game processes by their <code>.exe</code> name
            and applies the right CPU Set pin <em>automatically</em> the moment the game
            launches — no Alt-Tab + click required. Set up your rules once, every launch is
            already pinned.
          </p>
          <p>
            <strong className="text-text">Why this is better than click-to-pin:</strong> the
            click-to-pin section above is one-shot; close the game + re-launch and you'd have
            to re-pin. The daemon watches <em>continuously</em> so the second the game spawns
            (even from Steam / Epic / Discord launches), it gets pinned before its render
            thread does any real work.
          </p>
          <p>
            <strong className="text-text">How to use it:</strong> Click "Add Fortnite" (or
            another quick-pick) below, choose which cores to pin it to, then flip the daemon ON.
            Polls every 5s by default. Config persists across app restarts at{' '}
            <code className="text-text-muted">%LOCALAPPDATA%\optmaxxing\auto-pin.json</code>.
          </p>
        </div>

        <div
          className="mt-3 rounded-md border p-3 text-xs leading-snug max-w-3xl"
          style={{
            borderColor: 'rgba(255, 215, 0, 0.4)',
            background: 'rgba(255, 215, 0, 0.04)',
          }}
        >
          <p className="font-semibold text-text mb-1.5">🎯 Recommended Fortnite setup</p>
          <ol className="list-decimal pl-5 space-y-1 text-text-muted">
            <li>
              Click the <strong className="text-text">"+ Fortnite"</strong> quick-pick chip
              below — adds <code>FortniteClient-Win64-Shipping.exe</code> as a rule.
            </li>
            <li>
              <strong className="text-text">Pick the right cores</strong> based on your CPU:
              <ul className="mt-1 ml-2 list-disc pl-4 space-y-0.5">
                <li><strong className="text-text">Intel hybrid (12th gen and newer):</strong> start with all cores and the native Windows scheduler. A P-core-only rule is a measured fallback, not a universal UE5 rule; the correct logical IDs come from the scan and cannot be inferred from a simple 0–N/2 range.</li>
                <li><strong className="text-text">AMD single-CCD X3D:</strong> leave all cores available. There is no second CCD to route away from, and this tool does not change EXPO, Curve Optimizer, voltage, or thermal controls.</li>
                <li><strong className="text-text">AMD dual-CCD X3D:</strong> prefer the vendor scheduler/driver path first. CCD and cache mappings vary by firmware and logical-processor numbering, so this app does not guess that cores 0–7 or 0–15 are the cache CCD; use a manual rule only after measuring the real topology and game frametimes.</li>
                <li><strong className="text-text">AMD non-X3D and Intel non-hybrid:</strong> start with all logical processors. Excluding SMT siblings is an optional experiment only if a before/after capture shows a repeatable benefit.</li>
              </ul>
            </li>
            <li>
              Flip the daemon to <strong className="text-text">ON</strong>.
            </li>
            <li>
              Launch Fortnite normally. After the next poll, the process should appear in the
              "currently pinned" list below. The daemon re-applies the CPU Set when the process
              is seen; it cannot guarantee a game or anti-cheat process will retain that state.
            </li>
          </ol>
          <p className="mt-2 text-text-muted">
            <strong className="text-text">Verify it's working:</strong> use the app's
            "currently pinned" status and a before/after frametime capture. Task Manager's
            "Set affinity" dialog shows process affinity, which is not the same Windows API as
            CPU Sets and therefore is not conclusive proof of this daemon's rule.
          </p>
        </div>

        <div
          className="mt-3 rounded-md border p-3 text-xs leading-snug max-w-3xl"
          style={{
            borderColor: 'rgba(226, 91, 255, 0.4)',
            background: 'rgba(226, 91, 255, 0.05)',
          }}
        >
          <p className="font-semibold text-text mb-1.5">⚠️ Honest note on Fortnite + anti-cheat</p>
          <p className="text-text-muted">
            Easy Anti-Cheat and other anti-cheat systems can change or reject runtime process
            behavior. CPU Sets are an OS scheduling feature, but that is not a guarantee of
            compatibility or tournament eligibility; stop the daemon if the title, launcher, or
            event rules object. On a single-CCD X3D, pinning usually has no separate cache CCD to
            target. Treat auto-pin as a measured power-user fallback; the native scheduler and
            officially supported vendor features remain the default path.
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
}) {
  const autoPickLabel = 'Auto-pick (native baseline)'
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
          <button onClick={onAutoPick} disabled={busy || !info} className="text-accent hover:text-text underline">
            {autoPickLabel}
          </button>
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
 * Per-core selector grid. Renders one button per logical processor in
 * 8-wide rows. Hybrid Intel rigs get a visual P-block / E-block split
 * with class-color borders and a quick-select chip row below for the
 * common picks (All P, All E, All cores).
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

  function toggle(i: number) {
    setCores(rule.cores.includes(i) ? rule.cores.filter((x) => x !== i) : [...rule.cores, i])
  }

  // Hybrid: render P block + E block separately so the boundary is obvious.
  // Uniform: one continuous grid sized to the logical count.
  const sections: Array<{ label: string; ids: number[]; tag: 'P' | 'E' | '' }> = info.isHybrid
    ? [
        { label: `Performance cores (${info.pCoreIds.length})`, ids: info.pCoreIds, tag: 'P' },
        { label: `Efficient cores (${info.eCoreIds.length})`, ids: info.eCoreIds, tag: 'E' },
      ]
    : [
        {
          label: `Cores (${info.logicalProcessorCount})`,
          ids: Array.from({ length: info.logicalProcessorCount }, (_, i) => i),
          tag: '',
        },
      ]

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">cores</p>
        <div className="flex items-center gap-2 text-[10px]">
          {info.isHybrid && info.pCoreIds.length > 0 && (
            <button
              onClick={() => setCores(info.pCoreIds)}
              disabled={busy}
              className="px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
              title="Measured fallback only: compare against the all-core baseline before keeping this rule."
            >
              P-only fallback
            </button>
          )}
          {info.isHybrid && info.eCoreIds.length > 0 && (
            <button
              onClick={() => setCores(info.eCoreIds)}
              disabled={busy}
              className="px-2 py-0.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            >
              All E
            </button>
          )}
          <button
            onClick={() =>
              setCores(Array.from({ length: info.logicalProcessorCount }, (_, i) => i))
            }
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
                className={section.tag === 'P' ? 'text-emerald-300' : 'text-amber-300'}
              >
                ●
              </span>
            ) : (
              ''
            )}{' '}
            {section.label}
          </p>
          <div className="grid grid-cols-8 gap-1">
            {section.ids.map((i) => {
              const selected = rule.cores.includes(i)
              const accent =
                section.tag === 'P'
                  ? 'border-emerald-500/40'
                  : section.tag === 'E'
                  ? 'border-amber-500/40'
                  : 'border-border'
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  disabled={busy}
                  title={
                    section.tag === 'P'
                      ? `Logical CPU ${i} — Performance core`
                      : section.tag === 'E'
                      ? `Logical CPU ${i} — Efficient core`
                      : `Logical CPU ${i}`
                  }
                  className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded border text-center ${
                    selected
                      ? 'bg-accent text-bg-base border-accent'
                      : `bg-bg-card text-text-muted ${accent} hover:border-border-glow`
                  }`}
                >
                  {i}
                  {section.tag && (
                    <span
                      className={`ml-0.5 text-[9px] ${
                        selected
                          ? 'text-bg-base/80'
                          : section.tag === 'P'
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {section.tag}
                    </span>
                  )}
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
 * Recommend a conservative core list for the given .exe on this rig.
 *
 * The native Windows/vendor scheduler is the baseline. The scan can expose
 * P-core IDs for a manually measured fallback, but this helper deliberately
 * does not guess AMD CCD/cache mappings from logical numbering.
 */
function recommendCoresForRig(info: CpuSetInfo, _exe: string): number[] {
  return Array.from({ length: Math.max(0, info.logicalProcessorCount) }, (_, i) => i)
}

function fmtTs(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString()
  } catch {
    return iso
  }
}
