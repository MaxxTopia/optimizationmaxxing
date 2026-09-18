import { useEffect, useMemo, useState } from 'react'
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

/** Classify CPU for explanatory copy only. This component does not infer that
 * logical processor 0..N maps to P-cores, E-cores, or an AMD CCD. */
type CpuKind =
  | 'intel-hybrid'    // 12th+ gen with E-cores
  | 'amd-x3d-multi'   // 7950X3D / 9950X3D (16-core, X3D on CCD0)
  | 'amd-x3d-single'  // 7800X3D / 9800X3D (8-core)
  | 'amd-multi-ccd'   // 7900X / 7950X (no 3D, multi-CCD)
  | 'amd-single-ccd'  // 7600X / 7700X / 5800X / etc
  | 'intel-classic'   // pre-12th gen Intel, no hybrid
  | 'unknown'

function classifyCpu(cpu: CpuInfo): CpuKind {
  const m = `${cpu.marketing} ${cpu.model}`.toLowerCase()
  if (cpu.vendor.toLowerCase().includes('amd') || cpu.vendor.toLowerCase().includes('authentic')) {
    if (m.includes('x3d')) {
      // 7950X3D / 9950X3D are 16-core; 7800X3D / 9800X3D are 8-core.
      if (cpu.cores >= 12) return 'amd-x3d-multi'
      return 'amd-x3d-single'
    }
    if (cpu.cores >= 12) return 'amd-multi-ccd'
    return 'amd-single-ccd'
  }
  if (cpu.vendor.toLowerCase().includes('intel') || cpu.vendor.toLowerCase().includes('genuine')) {
    // Intel hybrid: 12th gen (Alder Lake), 13/14th gen (Raptor), Core Ultra
    // (Meteor/Arrow). The reliable tell: logical/physical ratio < 2 (E-cores
    // have no HT, so a hybrid CPU has fewer threads than 2x its core count).
    if (
      m.includes('core ultra') ||
      /\b1[2-5]th gen\b/.test(m) ||
      m.includes('-12') || m.includes('-13') || m.includes('-14') ||
      (cpu.cores >= 8 && cpu.logicalCores < cpu.cores * 2)
    ) {
      return 'intel-hybrid'
    }
    return 'intel-classic'
  }
  return 'unknown'
}

interface CpuRec {
  kind: CpuKind
  title: string
  /** The plain-English "your CPU is …" line. */
  cpuLabel: string
  /** Legacy shape retained for saved UI compatibility; safe baseline below. */
  maxPerf: { label: string; description: string; cores: (n: number) => number[] }
  /** Safe baseline — works on every game without topology guessing. */
  stable: { label: string; description: string; cores: (n: number) => number[] }
}

function allCores(max: number): number[] {
  return Array.from({ length: max }, (_, i) => i)
}

function getRec(cpu: CpuInfo): CpuRec {
  const kind = classifyCpu(cpu)
  switch (kind) {
    case 'intel-hybrid':
      return {
        kind,
        title: 'Intel hybrid (P-cores + E-cores)',
        cpuLabel: `${cpu.marketing} — P-cores + E-cores detected (${cpu.cores} physical / ${cpu.logicalCores} logical)`,
        maxPerf: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'Start with all logical processors. Windows and the vendor scheduler know the topology better than a simple logical-index guess. Treat a narrower subset as a measured fallback only.',
          cores: (max) => allCores(max),
        },
        stable: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'The same safe baseline: keep all logical processors available and measure before trying a manual subset.',
          cores: (max) => allCores(max),
        },
      }
    case 'amd-x3d-multi':
      return {
        kind,
        title: 'AMD Ryzen X3D · multi-CCD (7950X3D / 9950X3D)',
        cpuLabel: `${cpu.marketing} — 3D V-Cache on CCD0, frequency CCD on CCD1`,
        maxPerf: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'Do not infer CCD membership from logical IDs. Start with the vendor scheduler and measure any explicit topology-aware fallback separately.',
          cores: (max) => allCores(max),
        },
        stable: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'The vendor scheduler/driver path is the baseline. This app does not claim that the first 16 logical IDs are the cache CCD.',
          cores: (max) => allCores(max),
        },
      }
    case 'amd-x3d-single':
      return {
        kind,
        title: 'AMD Ryzen X3D · single-CCD (7800X3D / 9800X3D)',
        cpuLabel: `${cpu.marketing} — 8 physical / ${cpu.logicalCores} logical, all on the V-cache die`,
        maxPerf: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'A single-CCD X3D does not need a guessed CCD pin. Start with all logical processors; narrow only after a controlled capture proves a benefit.',
          cores: (max) => allCores(max),
        },
        stable: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'All logical processors are the safe default on a single-CCD X3D. This app does not change SMT, voltage, or thermal controls.',
          cores: (max) => allCores(max),
        },
      }
    case 'amd-multi-ccd':
      return {
        kind,
        title: 'AMD Ryzen multi-CCD (no 3D V-Cache)',
        cpuLabel: `${cpu.marketing} — 2 CCDs, no V-cache die`,
        maxPerf: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'Start with all logical processors. A no-SMT or single-CCD experiment is not inferred from processor count and must be measured separately.',
          cores: (max) => allCores(max),
        },
        stable: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'Start with the native scheduler. Logical processor IDs do not prove CCD membership on every firmware.',
          cores: (max) => allCores(max),
        },
      }
    case 'amd-single-ccd':
      return {
        kind,
        title: 'AMD Ryzen single-CCD',
        cpuLabel: `${cpu.marketing} — ${cpu.cores} physical / ${cpu.logicalCores} logical, one die`,
        maxPerf: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'A single-CCD CPU does not need a guessed CCD pin. Start with all logical processors; narrow only after a controlled capture proves a benefit.',
          cores: (max) => allCores(max),
        },
        stable: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'Pinning helps less here — Game Mode and the OS scheduler already have the full topology. "All" is the safe pick.',
          cores: (max) => allCores(max),
        },
      }
    case 'intel-classic':
      return {
        kind,
        title: 'Intel non-hybrid (10th gen or older)',
        cpuLabel: `${cpu.marketing} — ${cpu.cores} physical / ${cpu.logicalCores} logical, no E-cores`,
        maxPerf: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'Start with all logical processors. Excluding SMT siblings is an optional measured experiment, not a universal latency improvement.',
          cores: (max) => allCores(max),
        },
        stable: {
          label: 'All cores',
          description: 'No topology-specific mapping is needed here. "All" is the safe pick; spend the optimization time on measured software and stability checks.',
          cores: (max) => allCores(max),
        },
      }
    default:
      return {
        kind: 'unknown',
        title: 'CPU not recognized',
        cpuLabel: `${cpu.marketing || cpu.model || 'Unknown CPU'} (${cpu.cores}C/${cpu.logicalCores}T)`,
        maxPerf: {
          label: 'Native scheduler baseline · all logical processors',
          description: 'CPU topology is not recognized. Keep all logical processors available and do not guess a mapping from index order.',
          cores: (max) => allCores(max),
        },
        stable: {
          label: 'All cores',
            description: 'No specific recommendation without recognizing your CPU. Start with All, then compare a measured P-core or V-Cache selection if you see hitches.',
          cores: (max) => allCores(max),
        },
      }
  }
}

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

/** Default: keep all logical processors available. Manual subsets are explicit
 * experiments because Windows logical-index order does not prove CPU topology. */
function defaultCoreSet(maxCores: number): number[] {
  return allCores(maxCores)
}

export function CpuPinningSection() {
  const isNative = inTauri()
  const [info, setInfo] = useState<CpuSetInfo | null>(null)
  const [cores, setCores] = useState<number[]>([])
  const [pinned, setPinned] = useState<PinReport[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cpu = useRigStore((state) => state.spec?.cpu ?? null)
  const ensureLoaded = useRigStore((state) => state.ensureLoaded)

  useEffect(() => {
    void ensureLoaded()
    if (!isNative) return
    cpuSetInfo()
      .then((i) => {
        setInfo(i)
        setCores(loadCoresPref(i.logicalProcessorCount))
      })
      .catch((e) => setErr(String(e)))
  }, [ensureLoaded, isNative])

  const rec = useMemo(() => (cpu ? getRec(cpu) : null), [cpu])

  function applyRec(which: 'maxPerf' | 'stable') {
    if (!rec || !info) return
    const next = rec[which].cores(info.logicalProcessorCount).filter((c) => c < info.logicalProcessorCount)
    setCores(next)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  }

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
        <h2 className="text-lg font-semibold">Game core pinning</h2>
        <p className="text-sm text-text-muted max-w-3xl leading-snug">
          Tells Windows "prefer my game on <em>these</em> cores" through the CPU Sets API. The
          selection lives in the OS scheduler until the game closes. Re-pin each launch, or use
          the auto-pin daemon below for a persisted process-name rule.
        </p>

        {rec && info && (
          <div
            className="mt-4 rounded-lg border p-4 space-y-3"
            style={{
              borderColor: 'var(--border-glow)',
              background: 'var(--bg-card)',
            }}
          >
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-subtle">your CPU</p>
              <p className="text-sm font-semibold text-text">{rec.title}</p>
              <p className="text-xs text-text-muted leading-snug">{rec.cpuLabel}</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-md border border-border bg-bg-raised/40 p-3 flex flex-col">
                <p className="text-[10px] uppercase tracking-widest text-emerald-400">recommended baseline</p>
                <p className="text-sm font-semibold text-text mt-0.5">{rec.stable.label}</p>
                <p className="text-xs text-text-muted leading-snug mt-1 flex-1">{rec.stable.description}</p>
                <button
                  onClick={() => applyRec('stable')}
                  disabled={busy}
                  className="mt-3 px-3 py-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-300 text-xs font-semibold disabled:opacity-40 hover:bg-emerald-500/20 transition"
                >
                  Use native baseline
                </button>
              </div>
            </div>

            <p className="text-[11px] text-text-subtle leading-snug">
              The baseline keeps all logical processors available and saves locally. The manual subset buttons below are experiments only: logical IDs do not prove P/E-core or CCD membership, so compare frametime and re-open the native baseline if the result is worse.
            </p>
          </div>
        )}
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
              the pin is released automatically. If our app closes, the pin may stay for the
              running process. To apply the same rule across launches, configure the auto-pin
              daemon below and verify its last-poll/currently-pinned status.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
