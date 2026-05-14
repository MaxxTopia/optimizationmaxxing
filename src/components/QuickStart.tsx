import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { GAMES } from '../lib/games'

/**
 * First-time-user onboarding card. Three big tap-cards: pick your game →
 * apply our preset → tune later. Dismissible with localStorage. Reappears
 * on every major version bump (re-uses the lastSeenVersion plumbing pattern
 * from WhatsNewModal — but cheaper: just compares the stored version string
 * to the current one).
 *
 * Slot: Dashboard.tsx, between RecentlyApplied and the Game Benchmarks
 * section. Keeps the credibility-claim section uninterrupted while still
 * surfacing onboarding above-the-fold for first-time users (the dismiss
 * gesture pushes the section down so power users never see it after click).
 */

const DISMISS_KEY = 'optmaxxing-quickstart-dismissed-version'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const APP_VERSION: string = (import.meta as any).env?.VITE_APP_VERSION ?? '0.1'

export function QuickStart() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return localStorage.getItem(DISMISS_KEY) === APP_VERSION
  })

  useEffect(() => {
    if (dismissed) {
      localStorage.setItem(DISMISS_KEY, APP_VERSION)
    }
  }, [dismissed])

  if (dismissed) return null

  return (
    <section className="theme-stage-bmo surface-card p-6 md:p-7 relative overflow-hidden">
      <div className="hero-gradient pointer-events-none opacity-50" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-text-subtle">first run</p>
            <h2 className="text-2xl font-bold leading-tight">Three taps to faster.</h2>
            <p className="text-sm text-text-muted max-w-xl mt-1">
              Pick the game you actually play. Apply our preset. Roll back any tweak
              that doesn't feel right. Snapshot-backed — undo isn't a paid tier.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss quick start"
            title="Dismiss quick start"
            className="text-text-subtle hover:text-text text-lg leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StepCard
            step="1"
            title="Pick your game"
            body="Filters the 90-tweak catalog down to what matters for your title."
            cta={
              <div className="flex flex-wrap gap-1.5 mt-3">
                {GAMES.slice(0, 4).map((g) => (
                  <Link
                    key={g.id}
                    to={`/tweaks?game=${g.id}`}
                    className="px-2 py-1 rounded text-xs border border-border bg-bg-card text-text-muted hover:text-text hover:border-border-glow transition"
                  >
                    {g.glyph} {g.label}
                  </Link>
                ))}
                <Link
                  to="/tweaks"
                  className="px-2 py-1 rounded text-xs text-text-muted hover:text-text underline-offset-2 hover:underline"
                >
                  more →
                </Link>
              </div>
            }
          />
          <StepCard
            step="2"
            title="Apply our preset"
            body="One UAC prompt for the whole bundle. Snapshot saved before anything changes."
            cta={
              <Link
                to="/presets"
                className="inline-block mt-3 px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold btn-chrome"
              >
                Browse presets →
              </Link>
            }
          />
          <StepCard
            step="3"
            title="Tune later"
            body="Anything feels off? Hit Restore Point in Settings — every applied tweak rolls back in one prompt."
            cta={
              <Link
                to="/settings"
                className="inline-block mt-3 px-3 py-1.5 rounded-md text-text-muted hover:text-text border border-border hover:border-border-glow text-xs"
              >
                Settings → Restore
              </Link>
            }
          />
        </div>

        <p className="text-[11px] text-text-subtle mt-4">
          Already know what you're doing?{' '}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="underline hover:text-text"
          >
            Skip the intro
          </button>{' '}
          — it'll come back on the next major update.
        </p>
      </div>
    </section>
  )
}

function StepCard({
  step,
  title,
  body,
  cta,
}: {
  step: string
  title: string
  body: string
  cta: React.ReactNode
}) {
  return (
    <div className="surface-card p-4 flex flex-col">
      <div className="flex items-baseline gap-2 mb-1">
        <span
          aria-hidden="true"
          className="text-3xl font-bold text-accent leading-none tabular-nums"
        >
          {step}
        </span>
        <span className="text-text-subtle text-[10px] uppercase tracking-widest">step</span>
      </div>
      <h3 className="text-base font-semibold mb-1 leading-tight">{title}</h3>
      <p className="text-xs text-text-muted leading-snug">{body}</p>
      {cta}
    </div>
  )
}
