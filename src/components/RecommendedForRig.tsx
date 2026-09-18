import { Link } from 'react-router-dom'
import type { SpecProfile } from '../lib/tauri'
import { recommendedTuneProfile } from '../lib/tuneProfiles'

/**
 * Looks at the detected SpecProfile and recommends a Tune Now intensity.
 * The catalog remains the source of individual actions; this surface should
 * not silently select a static preset that ignores the current rig.
 */
interface Props {
  spec: SpecProfile | null
}

export function RecommendedForRig({ spec }: Props) {
  const { profile, reason } = recommendedTuneProfile(spec)

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
            {profile.label} tune
          </h2>
          <p className="text-sm text-text-muted mt-1">{profile.summary}</p>
          <p className="text-sm text-text mt-3 max-w-xl">{reason}</p>
          <p className="text-xs text-text-subtle mt-3">
            Auto-detected profile · no voltage or thermal-limit changes · live verification after apply
          </p>
        </div>
        <div className="shrink-0 flex md:flex-col gap-2">
          <Link
            to="/tune"
            className="btn-chrome px-5 py-2.5 rounded-md bg-accent text-bg-base font-semibold text-sm whitespace-nowrap"
          >
            Scan and tune →
          </Link>
          <Link
            to="/presets"
            className="px-5 py-2.5 rounded-md border border-border text-xs text-text-muted hover:border-border-glow text-center whitespace-nowrap"
          >
            Browse presets
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
