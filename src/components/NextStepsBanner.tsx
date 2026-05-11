import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * "You've optimized the OS layer — now go deeper" banner shown above the
 * Tweaks list once a user has applied >= NEXT_STEPS_THRESHOLD tweaks.
 *
 * The catalog tops out at the OS layer (registry, services, bcdedit, file
 * writes). Without this banner, friend-tier users hit Apply on a preset,
 * see the green checkmarks, and move on — leaving 30%+ of available
 * latency on the table that lives in NVPI / SCEWIN / standby cleaner /
 * tournament-compliance territory. Each of those has a /guides article;
 * the banner is just a signpost pointing at the doors.
 *
 * Dismissible (localStorage). Comes back if dismissed >30 days ago, in
 * case the user installs a fresh tweak pack and forgets the next-step
 * recommendations they read months prior.
 */

interface Step {
  emoji: string
  title: string
  blurb: string
  /** Anchor inside /guides — Guides.tsx already renders one section per id. */
  guideAnchor?: string
  /** External URL if there's no in-app guide (we own no docs for it). */
  href?: string
}

const NEXT_STEPS_THRESHOLD = 5
const DISMISS_KEY = 'optmaxxing_next_steps_dismissed_at'
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Anchor ids must match lib/research.ts entry ids (ResearchCard renders
// each article's <article id={article.id}>). Adding a new step? Verify the
// id with `grep "id:" src/lib/research.ts` first.
const STEPS: Step[] = [
  {
    emoji: '🎮',
    title: 'NVIDIA Profile Inspector',
    blurb:
      'OS tweaks are done — NVPI is the next-biggest single-tool win. Per-game knobs the NVIDIA Control Panel hides: LLM Ultra, prerender frames, threaded optimization.',
    guideAnchor: 'nvidia-profile-inspector',
  },
  {
    emoji: '⚡',
    title: 'Standby memory cleaner',
    blurb:
      'Fortnite + Unreal-engine titles balloon standby memory over a long session, then stutter when the OS finally reclaims it. The integrated cleaner runs every 5-15 min.',
    guideAnchor: 'standby-list-cleaner',
  },
  {
    emoji: '🛠️',
    title: 'SCEWIN / BIOS tuning',
    blurb:
      'The deepest layer: disabling C-states, fixing P-cores, MSI mode, Above-4G decoding. Articleware — we tell you exactly which BIOS toggles per chipset.',
    guideAnchor: 'scewin-advanced',
  },
]

export function NextStepsBanner({ appliedCount }: { appliedCount: number }) {
  const dismissedRecently = useMemo(() => {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = parseInt(raw, 10)
    if (Number.isNaN(at)) return false
    return Date.now() - at < DISMISS_TTL_MS
  }, [])
  const [dismissed, setDismissed] = useState(dismissedRecently)

  if (dismissed) return null
  if (appliedCount < NEXT_STEPS_THRESHOLD) return null

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  return (
    <div
      className="surface-card p-4 space-y-3 relative"
      style={{
        borderColor: 'rgba(255, 215, 0, 0.35)',
        background:
          'linear-gradient(135deg, rgba(255, 215, 0, 0.06), rgba(255, 215, 0, 0.01))',
      }}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss next-steps banner"
        className="absolute top-2 right-2 text-text-subtle hover:text-text text-lg leading-none px-2"
      >
        ×
      </button>

      <div>
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">
          you've applied {appliedCount} tweaks
        </p>
        <h3 className="text-base font-semibold">
          OS layer done. Squeeze more from your rig:
        </h3>
        <p className="text-xs text-text-muted leading-snug max-w-2xl">
          The biggest wins in this app are behind you — these three live outside the catalog
          because they're external tools or articleware (we walk you through them in /guides
          rather than pressing Apply for you).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {STEPS.map((s) => (
          <NextStepCard key={s.title} step={s} />
        ))}
      </div>

      <p className="text-[11px] text-text-subtle">
        Tip:{' '}
        <Link to="/asta" className="underline hover:text-text">
          re-run Asta Bench
        </Link>{' '}
        before + after each of these so you have a real number to point at.
      </p>
    </div>
  )
}

function NextStepCard({ step }: { step: Step }) {
  const inner = (
    <div className="surface-card p-3 h-full hover:border-border-glow transition-colors cursor-pointer">
      <p className="text-base">
        <span aria-hidden="true">{step.emoji}</span>{' '}
        <span className="font-semibold text-text">{step.title}</span>
      </p>
      <p className="text-[11px] text-text-muted leading-snug mt-1">{step.blurb}</p>
    </div>
  )
  if (step.href) {
    return (
      <a href={step.href} target="_blank" rel="noreferrer" className="no-underline">
        {inner}
      </a>
    )
  }
  return (
    <Link to={`/guides${step.guideAnchor ? `#${step.guideAnchor}` : ''}`} className="no-underline">
      {inner}
    </Link>
  )
}
