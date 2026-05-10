import { useEffect, useState } from 'react'
import {
  cpuClearPin,
  cpuPinForeground,
  cpuSetInfo,
  inTauri,
  type CpuSetInfo,
  type PinReport,
} from '../lib/tauri'

/**
 * Game-launch core pinning via Windows CPU Sets API. Categorically better
 * than legacy SetProcessAffinityMask:
 *
 * - Affinity mask = "this process can ONLY run on these cores" (hard limit;
 *   off-set cores are still contended for by other processes)
 * - CPU Sets = "prefer these cores for this process" + the scheduler also
 *   prefers off-set cores for everything else. Effective core reservation,
 *   not just constraint.
 *
 * One-shot UX: pick which cores you want games to use, focus the game,
 * click "Pin foreground game". We grab GetForegroundWindow → PID →
 * SetProcessDefaultCpuSets. Pin survives until process exits.
 */

const SETTINGS_KEY = 'optmaxxing-cpu-pin-cores'

function loadCoresPref(maxCores: number): number[] {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultCoreSet(maxCores)
    const parsed = JSON.parse(raw) as number[]
    return parsed.filter((c) => c >= 0 && c < maxCores)
  } catch {
    return defaultCoreSet(maxCores)
  }
}

/** Default: reserve the bottom half (typically the highest-perf cores on
 * Intel hybrid + first 8 cores on Ryzen X3D parts). User can override. */
function defaultCoreSet(maxCores: number): number[] {
  if (maxCores <= 4) return Array.from({ length: maxCores }, (_, i) => i)
  return Array.from({ length: Math.ceil(maxCores / 2) }, (_, i) => i)
}

export function CpuPinningSection() {
  const isNative = inTauri()
  const [info, setInfo] = useState<CpuSetInfo | null>(null)
  const [cores, setCores] = useState<number[]>([])
  const [pinned, setPinned] = useState<PinReport[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!isNative) return
    cpuSetInfo()
      .then((i) => {
        setInfo(i)
        setCores(loadCoresPref(i.logicalProcessorCount))
      })
      .catch((e) => setErr(String(e)))
  }, [isNative])

  function toggleCore(c: number) {
    const next = cores.includes(c) ? cores.filter((x) => x !== c) : [...cores, c].sort((a, b) => a - b)
    setCores(next)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  }

  function applyPreset(name: 'bottom-half' | 'top-half' | 'last-4' | 'all') {
    if (!info) return
    const n = info.logicalProcessorCount
    let next: number[] = []
    if (name === 'bottom-half') next = Array.from({ length: Math.ceil(n / 2) }, (_, i) => i)
    else if (name === 'top-half')
      next = Array.from({ length: Math.floor(n / 2) }, (_, i) => Math.ceil(n / 2) + i)
    else if (name === 'last-4') next = Array.from({ length: Math.min(4, n) }, (_, i) => n - 4 + i).filter((c) => c >= 0)
    else if (name === 'all') next = Array.from({ length: n }, (_, i) => i)
    setCores(next)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  }

  async function handlePinForeground() {
    if (cores.length === 0) {
      setErr('Pick at least one core to pin to.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const report = await cpuPinForeground(cores)
      if (report.ok) {
        setPinned((p) => [report, ...p.filter((x) => x.pid !== report.pid)].slice(0, 10))
      } else {
        setErr(report.error ?? 'unknown')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleClear(pid: number) {
    setBusy(true)
    try {
      await cpuClearPin(pid)
      setPinned((p) => p.filter((x) => x.pid !== pid))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!isNative) {
    return null
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Game core pinning (CPU Sets)</h2>
        <p className="text-sm text-text-muted max-w-3xl leading-snug">
          Modern Windows API ({' '}
          <code className="text-accent">SetProcessDefaultCpuSets</code>
          ) — better than legacy affinity masks because the scheduler treats off-set cores as
          unavailable for the pinned process AND prefers them for everything else. Net effect:
          your game gets the cores effectively reserved instead of just constrained. Pick which
          cores to reserve, focus the game, click "Pin foreground game". Pin survives until the
          process exits.
        </p>
      </div>
      <div className="surface-card p-6 space-y-4">
        {err && <div className="text-xs text-accent">Error: {err}</div>}

        {info && (
          <>
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                cores to reserve for games ({cores.length} of {info.logicalProcessorCount})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: info.logicalProcessorCount }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => toggleCore(i)}
                    disabled={busy}
                    className={`px-2 py-1 text-xs font-mono tabular-nums rounded border transition ${
                      cores.includes(i)
                        ? 'bg-accent text-bg-base border-accent'
                        : 'bg-bg-card text-text-muted border-border hover:border-border-glow'
                    }`}
                    title={`Core ${i}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] pt-1">
                <span className="text-text-subtle uppercase tracking-wider mr-1">Presets:</span>
                <button onClick={() => applyPreset('bottom-half')} className="text-text-muted hover:text-text underline">
                  bottom half
                </button>
                <span className="text-text-subtle">·</span>
                <button onClick={() => applyPreset('top-half')} className="text-text-muted hover:text-text underline">
                  top half
                </button>
                <span className="text-text-subtle">·</span>
                <button onClick={() => applyPreset('last-4')} className="text-text-muted hover:text-text underline">
                  last 4
                </button>
                <span className="text-text-subtle">·</span>
                <button onClick={() => applyPreset('all')} className="text-text-muted hover:text-text underline">
                  all
                </button>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap items-center pt-3 border-t border-border">
              <button
                onClick={handlePinForeground}
                disabled={busy || cores.length === 0}
                className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
              >
                {busy ? '…' : 'Pin foreground game'}
              </button>
              <span className="text-[11px] text-text-subtle">
                Focus your game window first (Alt-Tab to it), then click. Returns immediately.
              </span>
            </div>

            {pinned.length > 0 && (
              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-text-subtle">active pins</p>
                <ul className="space-y-1">
                  {pinned.map((p) => (
                    <li key={p.pid} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-mono text-text">
                        PID {p.pid} · {p.processName || '(unknown name)'}{' '}
                        <span className="text-text-subtle">→ cores [{p.cores.join(',')}]</span>
                      </span>
                      <button
                        onClick={() => handleClear(p.pid)}
                        disabled={busy}
                        className="text-text-subtle hover:text-text underline"
                      >
                        clear
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-text-subtle pt-2 border-t border-border leading-snug">
              Heads up: pin lives in the OS scheduler, not in our app. If the game closes,
              the pin is released automatically. If our app closes, the pin stays. To pin
              the SAME game across launches, click "Pin foreground game" each time you
              start it (or wait for v0.1.66+ when we ship a per-game-name auto-pin daemon).
            </p>
          </>
        )}
      </div>
    </section>
  )
}
