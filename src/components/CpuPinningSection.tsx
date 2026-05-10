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
        <div className="text-sm text-text-muted max-w-3xl leading-snug space-y-2">
          <p>
            <strong className="text-text">What it does in plain English:</strong> tells Windows
            "run my game ONLY on these CPU cores, and run everything else (Discord, browser,
            Spotify, AV, OS background work) on the OTHER cores". The game gets cores
            effectively <em>reserved</em>, not just constrained.
          </p>
          <p>
            <strong className="text-text">Why this is better than legacy affinity masks:</strong>{' '}
            old-school <code>SetProcessAffinityMask</code> was a hard constraint on the game ONLY
            — other processes could still pile onto the same cores and cause stutter. The modern
            API (<code className="text-accent">SetProcessDefaultCpuSets</code>) tells the
            scheduler to <em>prefer</em> off-set cores for everything else too. Real cache + L3
            isolation, not just a kindly suggestion.
          </p>
          <p>
            <strong className="text-text">How to use it:</strong> pick which cores to reserve
            below, Alt-Tab to your game so it's focused, click "Pin foreground game". Pin lives
            in the OS scheduler until the game closes (so you re-pin each launch — or use
            Auto-pin below for set-and-forget by process name).
          </p>
        </div>

        <div
          className="mt-3 rounded-md border p-3 text-xs leading-snug max-w-3xl"
          style={{
            borderColor: 'rgba(255, 215, 0, 0.4)',
            background: 'rgba(255, 215, 0, 0.04)',
          }}
        >
          <p className="font-semibold text-text mb-1.5">🎯 Recommended for Fortnite (UE5)</p>
          <p className="text-text-muted">
            Fortnite is bottlenecked on the <strong className="text-text">render thread</strong>{' '}
            (UE5's main game thread can't be parallelized further). What matters: maximum
            <em> single-thread</em> performance + low contention from background apps.
          </p>
          <ul className="mt-2 ml-1 space-y-1 text-text-muted">
            <li>
              <strong className="text-text">Intel hybrid (12th gen / 13th gen / 14th gen / Core Ultra):</strong>{' '}
              pin to the <strong className="text-text">P-cores only</strong>. E-cores hurt UE5
              perf (the scheduler bounces the render thread between cores → cache thrash, frame
              hitches). Click "bottom half" preset on most boards (P-cores enumerate first); on
              Core Ultra, use the auto-pin daemon below + add per-game rules — Intel APO does
              this automatically for whitelisted games but Fortnite isn't whitelisted.
            </li>
            <li>
              <strong className="text-text">AMD X3D (7800X3D / 9800X3D / 7950X3D):</strong> pin
              to the <strong className="text-text">first 8 cores</strong> (CCD0 — the cache
              die). Cross-CCD latency murders Fortnite. The "bottom half" preset on a 16-core
              7950X3D = exactly CCD0. ✓
            </li>
            <li>
              <strong className="text-text">AMD non-X3D / single-CCD Ryzen:</strong> "all" is
              fine. Single CCD = no cross-die latency to fight.
            </li>
            <li>
              <strong className="text-text">Intel non-hybrid (10th–11th gen, etc.):</strong> "all"
              is fine. Optionally exclude HT siblings (cores 1, 3, 5, 7…) but not worth the
              hassle for most.
            </li>
          </ul>
          <p className="mt-2 text-text-muted">
            <strong className="text-text">If unsure:</strong> click <strong>bottom half</strong>{' '}
            below + Pin foreground game. This is the right default for the majority of competitive
            rigs (P-cores on Intel hybrid, CCD0 on Ryzen X3D).
          </p>
        </div>
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
