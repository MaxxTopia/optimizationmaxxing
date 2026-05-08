import { Link } from 'react-router-dom'
import type { SpecProfile } from '../lib/tauri'
import { PRESETS, presetTweaks, type PresetBundle } from '../lib/presets'

/**
 * Looks at the detected SpecProfile and recommends one preset bundle.
 * Heuristic-first — no ML, just well-known per-vendor priors. Compounds
 * naturally as the catalog grows (each preset's tweak list is updated;
 * recommendation logic stays stable).
 */
function pickPreset(spec: SpecProfile | null): { preset: PresetBundle; reason: string } {
  // Default fallback — Esports works for everyone.
  const esports = PRESETS.find((p) => p.id === 'preset.esports')!
  if (!spec) {
    return {
      preset: esports,
      reason: 'Detecting your rig… defaulting to the universal low-input-lag preset.',
    }
  }

  const cpuVendor = (spec.cpu.vendor || '').toLowerCase()
  const isAmd = cpuVendor.includes('amd')
  const isIntel = cpuVendor.includes('intel')
  const ramGb = spec.ram.totalGb || 0
  const stickCount = spec.ram.stickCount || 0

  const framePacing = PRESETS.find((p) => p.id === 'preset.frame-pacing')!
  const network = PRESETS.find((p) => p.id === 'preset.network-low-latency')!

  // AMD Ryzen / Threadripper benefit most from TSC sync + HPET kill — Frame Pacing.
  if (isAmd) {
    return {
      preset: framePacing,
      reason: `Your ${truncate(spec.cpu.model, 28)} benefits most from TSC-only timing + Hyper-V off. Frame Pacing is the AMD-tuned bundle.`,
    }
  }

  // High-RAM rigs (32GB+) — TCP-stack overhaul has the most headroom.
  if (ramGb >= 32 && stickCount >= 2) {
    return {
      preset: network,
      reason: `${ramGb} GB and ${stickCount} sticks — your rig has the headroom to benefit from the TCP stack overhaul.`,
    }
  }

  // Intel default — Esports preset.
  if (isIntel) {
    return {
      preset: esports,
      reason: `${truncate(spec.cpu.model, 28)} responds best to scheduler-bias + DWM-bypass tweaks. Esports is the Intel-tuned bundle.`,
    }
  }

  // Unknown vendor (rare).
  return {
    preset: esports,
    reason: 'Universal low-input-lag preset — works on every rig.',
  }
}

interface Props {
  spec: SpecProfile | null
}

export function RecommendedForRig({ spec }: Props) {
  const { preset, reason } = pickPreset(spec)
  const tweakCount = presetTweaks(preset).length

  return (
    <section className="surface-card p-6 md:p-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(circle at top right, var(--secondary) 0%, transparent 60%)',
        }}
      />
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest text-text-subtle">
            recommended for your rig
          </p>
          <h2 className="text-2xl font-bold mt-1">
            {preset.glyph && <span className="mr-2" aria-hidden>{preset.glyph}</span>}
            {preset.name}
          </h2>
          <p className="text-sm text-text-muted mt-1">{preset.tagline}</p>
          <p className="text-sm text-text mt-3 max-w-xl">{reason}</p>
          <p className="text-xs text-text-subtle mt-3">
            {tweakCount} tweak{tweakCount === 1 ? '' : 's'} · {preset.archetype}
          </p>
        </div>
        <div className="shrink-0 flex md:flex-col gap-2">
          <Link
            to="/presets"
            className="btn-chrome px-5 py-2.5 rounded-md bg-accent text-bg-base font-semibold text-sm whitespace-nowrap"
          >
            Apply preset →
          </Link>
          <Link
            to="/profile"
            className="px-5 py-2.5 rounded-md border border-border text-xs text-text-muted hover:border-border-glow text-center whitespace-nowrap"
          >
            See full rig
          </Link>
        </div>
      </div>
    </section>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
