import { useEffect, useState } from 'react'
import {
  cpuClearPin,
  cpuPinForeground,
  cpuSetInfo,
  inTauri,
  type CpuInfo,
  type CpuSetInfo,
  type PinReport,
} from '../lib/tauri'
import { useRigStore } from '../store/useRigStore'

const SETTINGS_KEY = 'optmaxxing-cpu-pin-cores'

function loadSavedIds(validIds: number[]): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    const valid = new Set(validIds)
    return [...new Set(saved.filter((id): id is number => Number.isInteger(id) && valid.has(id)))].sort((a, b) => a - b)
  } catch {
    return []
  }
}

function cpuLabel(cpu: CpuInfo | null): string {
  return cpu?.marketing || cpu?.model || 'CPU detected by Windows'
}

export function CpuPinningSection() {
  const isNative = inTauri()
  const [info, setInfo] = useState<CpuSetInfo | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [pinned, setPinned] = useState<PinReport[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cpu = useRigStore((state) => state.spec?.cpu ?? null)
  const ensureLoaded = useRigStore((state) => state.ensureLoaded)

  useEffect(() => {
    void ensureLoaded()
    if (!isNative) return
    cpuSetInfo()
      .then((result) => {
        setInfo(result)
        setSelectedIds(loadSavedIds(result.cpuSetIds))
      })
      .catch((error) => setErr(String(error)))
  }, [ensureLoaded, isNative])

  if (!isNative) return null

  function choose(ids: number[]) {
    const valid = new Set(info?.cpuSetIds ?? [])
    const next = [...new Set(ids.filter((id) => valid.has(id)))].sort((a, b) => a - b)
    setSelectedIds(next)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  }

  async function applyToForeground(ids: number[]) {
    setBusy(true)
    setErr(null)
    try {
      const report = await cpuPinForeground(ids)
      if (!report.ok) {
        setErr(report.error ?? 'Windows did not apply the CPU Set selection.')
        return
      }
      setPinned((current) => [report, ...current.filter((item) => item.pid !== report.pid)].slice(0, 10))
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function clearPin(pid: number) {
    setBusy(true)
    setErr(null)
    try {
      const report = await cpuClearPin(pid)
      if (!report.ok) {
        setErr(report.error ?? 'Windows did not clear the CPU Set selection.')
        return
      }
      setPinned((current) => current.filter((item) => item.pid !== pid))
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const intelHybrid = Boolean(info?.isHybrid && cpu?.vendor.toLowerCase().includes('intel'))
  const highLabel = intelHybrid
    ? 'Intel P-core CPU Sets'
    : 'Highest-performance CPU Sets'
  const lowerLabel = intelHybrid
    ? 'Intel E-core CPU Sets'
    : 'Lower-performance CPU Sets'

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Game CPU Sets (advanced experiment)</h2>
        <div className="text-sm text-text-muted max-w-3xl leading-relaxed space-y-2">
          <p>
            A <strong className="text-text">CPU Set</strong> is Windows' name for one
            schedulable logical processor thread. The count below is not a count of physical
            cores. A CPU with 8 physical cores and SMT/Hyper-Threading enabled can expose 16
            logical processors; a system with E-cores disabled may expose fewer.
          </p>
          <p>
            IDs such as <code className="text-accent">56</code> are opaque Windows CPU Set
            identifiers. They are not a performance score and are not the core number. Use the
            <strong className="text-text"> P/E class</strong> and the <strong className="text-text">G/L</strong>
            label (processor group / logical-processor position) to understand the topology.
          </p>
          <p>
            <strong className="text-text">Best starting point:</strong> select all detected
            CPU Sets, or press Restore native scheduler. That gives Windows freedom to place the
            game. On a hybrid Intel CPU, test P-core-only as an A/B comparison only if you want
            to investigate scheduling variance; it can reduce E-core involvement, but it can also
            reduce available throughput or worsen frame times.
          </p>
        </div>
      </div>

      <div className="surface-card p-6 space-y-4">
        {err && <div role="alert" className="text-xs text-accent">{err}</div>}
        {!info ? (
          <p className="text-xs text-text-muted">Reading Windows processor topology…</p>
        ) : (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-subtle">detected rig</p>
              <p className="text-sm font-semibold text-text">{cpuLabel(cpu)}</p>
              <p className="text-xs text-text-muted">
                {info.logicalProcessorCount} logical processors visible to Windows · {info.cpuSetIds.length} CPU Set IDs
                {info.isHybrid ? ' · hybrid performance classes detected' : ' · one processor class detected'}
              </p>
              <p className="text-[11px] text-text-subtle mt-1">
                If this count is lower than expected, check BIOS E-core/SMT settings and Windows
                processor limits. The app reports what Windows exposes; it does not disable cores.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                onClick={() => choose(info.cpuSetIds)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-text-muted hover:text-text"
              >
                Use all detected (native-equivalent baseline)
              </button>
              {info.isHybrid && info.highPerformanceIds.length > 0 && (
                <button
                  onClick={() => choose(info.highPerformanceIds)}
                  disabled={busy}
                  title="A/B test only: compare against the native scheduler with the same match, settings, and capture method."
                  className="px-3 py-1.5 rounded-md border border-emerald-500/40 text-xs text-emerald-300 hover:bg-emerald-500/10"
                >
                  Test highest-performance class only
                </button>
              )}
              <button
                onClick={() => choose([])}
                disabled={busy}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-text-subtle hover:text-text"
              >
                Clear pin / use native scheduler
              </button>
            </div>

            <div className="space-y-3">
              {info.isHybrid ? (
                <>
                  <CpuSetGroup
                    title={highLabel}
                    sets={info.cpuSets.filter((set) => info.highPerformanceIds.includes(set.id))}
                    selectedIds={selectedIds}
                    onToggle={(id) => choose(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])}
                    disabled={busy}
                    tone="high"
                  />
                  <CpuSetGroup
                    title={lowerLabel}
                    sets={info.cpuSets.filter((set) => info.lowerPerformanceIds.includes(set.id))}
                    selectedIds={selectedIds}
                    onToggle={(id) => choose(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])}
                    disabled={busy}
                    tone="low"
                  />
                </>
              ) : (
                <CpuSetGroup
                  title="Detected CPU Sets"
                  sets={info.cpuSets}
                  selectedIds={selectedIds}
                  onToggle={(id) => choose(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])}
                  disabled={busy}
                  tone="uniform"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <button
                onClick={() => void applyToForeground(selectedIds)}
                disabled={busy || selectedIds.length === 0}
                className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
              >
                {busy ? 'Applying…' : 'Apply selection to focused game'}
              </button>
              <button
                onClick={() => void applyToForeground([])}
                disabled={busy}
                className="px-3 py-2 rounded-md border border-border text-xs text-text-muted hover:text-text disabled:opacity-40"
              >
                Restore native scheduler
              </button>
              <span className="text-[11px] text-text-subtle">
                Focus the game first. Empty means Windows default for that process; a selection is
                soft guidance, not a reserved-core guarantee.
              </span>
            </div>

            {pinned.length > 0 && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-text-subtle">recent process results</p>
                <ul className="space-y-1">
                  {pinned.map((item) => (
                    <li key={item.pid} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-mono text-text">
                        PID {item.pid} · {item.processName || '(unknown name)'} · selected Windows IDs [{item.cores.join(', ')}]
                      </span>
                      <button
                        onClick={() => void clearPin(item.pid)}
                        disabled={busy}
                        className="text-text-subtle hover:text-text underline"
                      >
                        restore native
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-text-subtle border-t border-border pt-3 leading-snug">
              Test one change at a time. Compare the same Fortnite mode, map, settings, and capture
              method across repeated runs; check 1% lows and frame-time consistency, not only peak
              FPS. If results are mixed or worse, restore the native scheduler. A process may also
              reject or override the request.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

function CpuSetGroup({
  title,
  sets,
  selectedIds,
  onToggle,
  disabled,
  tone,
}: {
  title: string
  sets: CpuSetInfo['cpuSets']
  selectedIds: number[]
  onToggle: (id: number) => void
  disabled: boolean
  tone: 'high' | 'low' | 'uniform'
}) {
  const border = tone === 'high'
    ? 'border-emerald-500/40'
    : tone === 'low'
      ? 'border-amber-500/40'
      : 'border-border'

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">
        {title} · {sets.length} logical processors
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
        {sets.map((set) => {
          const selected = selectedIds.includes(set.id)
          return (
            <button
              key={`${set.group}-${set.id}`}
              onClick={() => onToggle(set.id)}
              disabled={disabled}
              title={`Windows CPU Set ID ${set.id}. Group ${set.group}, logical processor ${set.logicalProcessorIndex}, physical-core index ${set.coreIndex}, efficiency class ${set.efficiencyClass}. The ID is an identifier, not a speed rating.`}
              className={`px-2 py-1 text-[10px] rounded border font-mono text-center disabled:opacity-50 ${
                selected
                  ? 'bg-accent text-bg-base border-accent'
                  : `bg-bg-card text-text-muted ${border} hover:border-border-glow`
              }`}
            >
              <span className="block">ID {set.id}</span>
              <span className="block text-[9px] opacity-80">G{set.group} · LP{set.logicalProcessorIndex}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
