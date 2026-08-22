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
  // Default fallback — Esports is the measured, lower-risk starting lane.
  const esports = PRESETS.find((p) => p.id === 'preset.esports')!
  if (!spec) {
    return {
      preset: esports,
      reason: 'Detecting your rig… starting with the lower-risk measured lane. We do not assume a universal winner.',
    }
  }

  // Avoid pretending that CPU vendor, RAM capacity, or a network stack
  // overhaul proves a preset winner. Those are hypotheses to measure, not
  // reasons to silently apply timing or TCP changes.
  return {
    preset: esports,
    reason: `${truncate(spec.cpu.model || spec.cpu.marketing, 28)} detected. Start with the lower-risk measured lane, then compare Asta Bench and real-game 1% lows before testing anything experimental.`,
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
