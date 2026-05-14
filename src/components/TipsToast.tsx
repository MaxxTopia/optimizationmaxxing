import { useEffect, useState } from 'react'
import { useProfileStore } from '../store/useProfileStore'

/**
 * Whimsy-themed pro tips toast. Renders on either of two themes — the
 * glyph swaps to match the show:
 *
 *   * cosmo-wanda    → magic wand + sparkles (Wanda's wand)
 *   * adventure-time → Finn's Grass Sword (instantly recognizable; less
 *                      risk than trying to nail a penguin character likeness)
 *
 * Both themes share the same rotating tip pool + dismiss behavior.
 * Renders nothing on every other theme (no DOM cost).
 */

const DISMISS_KEY = 'optmaxxing-tips-dismissed'

const TIPS = [
  'Pre-warm the snapshot store by applying 5+ tweaks before scrim — rollback feels cleaner.',
  'Cap FPS refresh-minus-3 if you run G-Sync. Competitive Fortnite at 240+ Hz? Run G-Sync OFF + uncapped + Reflex On+BOOST — pros prioritize the marginal latency over tear elimination.',
  'iCUE and Synapse are eating your input. Run the RGB-shutoff tweak in /tweaks for ~5% DPC headroom.',
  'Watch the divinium vial in the corner if you switch to Element-115 — it cycles like a charging meter.',
  'On a 13900K and getting crashes? Check the WHEA card on /diagnostics — microcode 0x12B or RMA.',
  'Apply Asta Mode before a tournament. Revert after — Tournament Mode automates the swap.',
  'Pick your game on /tweaks first. The catalog filters down to what actually matters for your title.',
  'NVPI .nip downloads live at the top of the NVIDIA Profile Inspector guide — one-click import.',
] as const

export function TipsToast() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  })
  const [tipIdx, setTipIdx] = useState(0)

  useEffect(() => {
    if (dismissed) return
    const t = window.setInterval(() => {
      setTipIdx((i) => (i + 1) % TIPS.length)
    }, 14000)
    return () => window.clearInterval(t)
  }, [dismissed])

  if (activeProfile !== 'adventure-time' && activeProfile !== 'cosmo-wanda') return null
  if (dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 18,
        right: 18,
        maxWidth: 340,
        zIndex: 30,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          background: 'linear-gradient(180deg, #fff8e7 0%, #f0e4c0 100%)',
          border: '2.5px solid #1a1f3a',
          borderRadius: 14,
          padding: '11px 13px 11px 12px',
          boxShadow: '0 8px 22px rgba(0,0,0,0.4), 0 0 14px rgba(255, 215, 0, 0.35)',
          color: '#1a1f3a',
          fontFamily: "'Fredoka', 'Bungee', 'Comic Sans MS', system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.34,
          animation: 'tips-toast-in 420ms cubic-bezier(0.22, 1.4, 0.36, 1)',
        }}
      >
        {activeProfile === 'cosmo-wanda' ? <WandGlyph /> : <GrassSwordGlyph />}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 9.5,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              opacity: 0.7,
              marginBottom: 2,
            }}
          >
            pro tip
          </p>
          <p style={{ margin: 0 }}>{TIPS[tipIdx]}</p>
        </div>

        <button
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, '1')
            setDismissed(true)
          }}
          aria-label="Dismiss tips toast"
          title="Dismiss until next session"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#1a1f3a',
            cursor: 'pointer',
            fontSize: 18,
            padding: 0,
            lineHeight: 1,
            opacity: 0.6,
            alignSelf: 'flex-start',
          }}
        >
          ×
        </button>
      </div>

      <style>{`
        @keyframes tips-toast-in {
          0%   { transform: translateY(20px) scale(0.85); opacity: 0; }
          60%  { transform: translateY(-3px) scale(1.05); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes grass-sword-shimmer {
          0%, 100% { filter: drop-shadow(0 0 1px rgba(120, 220, 80, 0.4)); }
          50%      { filter: drop-shadow(0 0 4px rgba(120, 220, 80, 0.75)); }
        }
        @media (prefers-reduced-motion: reduce) {
          div[role="status"] > div { animation: none !important; }
          svg[data-glyph="grass-sword"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

/** Wand + sparkles — Wanda's wand from Cosmo & Wanda. Generic-shaped so it
 *  doesn't replicate any specific show asset. */
function WandGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 60"
      style={{ width: 48, height: 48, flexShrink: 0 }}
    >
      {/* Wand stick (diagonal) */}
      <line x1="14" y1="48" x2="40" y2="22" stroke="#1a1f3a" strokeWidth="3" strokeLinecap="round" />
      <line x1="14" y1="48" x2="40" y2="22" stroke="#a47233" strokeWidth="1.5" strokeLinecap="round" />
      {/* Big star at the top */}
      <path
        d="M 42 8 L 46 18 L 56 18 L 48 25 L 51 35 L 42 29 L 33 35 L 36 25 L 28 18 L 38 18 Z"
        fill="#ffd700"
        stroke="#1a1f3a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M 42 12 L 44 18 L 50 18 L 45 22 L 47 28"
        fill="none"
        stroke="#fff5b0"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <g fill="#ff77bb">
        <path d="M 56 6 L 57 9 L 60 10 L 57 11 L 56 14 L 55 11 L 52 10 L 55 9 Z" />
      </g>
      <g fill="#5db94a">
        <path d="M 8 30 L 9 33 L 12 34 L 9 35 L 8 38 L 7 35 L 4 34 L 7 33 Z" />
      </g>
      <g fill="#4fc3f7">
        <path d="M 22 56 L 23 58 L 25 59 L 23 60 L 22 58 L 21 60 L 19 59 L 21 58 Z" opacity="0.85" />
      </g>
    </svg>
  )
}

/** Finn's Grass Sword — distinctive curved green blade from the grass-arm
 *  arc in Adventure Time. Built from SVG primitives: curved leaf-shape
 *  blade with serrated edges, brown wooden grip, simple crossguard, faint
 *  magical green glow. Recognizable without copying a specific frame. */
function GrassSwordGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 60"
      data-glyph="grass-sword"
      style={{
        width: 48,
        height: 48,
        flexShrink: 0,
        animation: 'grass-sword-shimmer 3.4s ease-in-out infinite',
      }}
    >
      {/* Blade — curved leaf-shape sweeping from lower-left grip to upper-right point */}
      <path
        d="M 18 42 Q 14 28 22 16 Q 30 6 44 8 Q 38 16 34 22 Q 30 28 26 34 Q 22 40 18 42 Z"
        fill="#5db94a"
        stroke="#1a1f3a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Blade inner gradient highlight (lighter green core) */}
      <path
        d="M 20 38 Q 18 28 24 18 Q 30 10 40 10 Q 32 18 28 26 Q 24 32 20 38 Z"
        fill="#86d36c"
        opacity="0.7"
      />
      {/* Spine highlight along the curved back of the blade */}
      <path
        d="M 22 40 Q 18 30 24 18 Q 30 10 42 9"
        fill="none"
        stroke="#c4f0a8"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Serrated grass-blade nicks along the cutting edge */}
      <path
        d="M 34 22 L 36 21 L 35 24 Z M 30 28 L 32 27 L 31 30 Z M 26 34 L 28 33 L 27 36 Z"
        fill="#3d8a30"
        stroke="#1a1f3a"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* Tiny leaf sprouting off the back of the blade — grass-magic detail */}
      <path
        d="M 36 14 Q 40 12 42 16 Q 38 16 36 14 Z"
        fill="#3d8a30"
        stroke="#1a1f3a"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* Crossguard — small brown horizontal bar */}
      <rect
        x="14"
        y="40"
        width="12"
        height="3.5"
        rx="0.8"
        fill="#8b5a2b"
        stroke="#1a1f3a"
        strokeWidth="1.2"
        transform="rotate(-30 20 41.75)"
      />
      {/* Grip — wooden handle below the crossguard */}
      <rect
        x="12"
        y="44"
        width="4"
        height="10"
        rx="1.4"
        fill="#a47233"
        stroke="#1a1f3a"
        strokeWidth="1.4"
        transform="rotate(-30 14 49)"
      />
      {/* Grip wrap detail */}
      <line
        x1="12"
        y1="48"
        x2="16"
        y2="48"
        stroke="#1a1f3a"
        strokeWidth="0.8"
        transform="rotate(-30 14 49)"
      />
      <line
        x1="12"
        y1="51"
        x2="16"
        y2="51"
        stroke="#1a1f3a"
        strokeWidth="0.8"
        transform="rotate(-30 14 49)"
      />
      {/* Pommel — small round end-cap */}
      <circle
        cx="9"
        cy="54"
        r="2"
        fill="#a47233"
        stroke="#1a1f3a"
        strokeWidth="1.2"
      />
      {/* Magical green sparkles around the blade */}
      <g fill="#c4f0a8">
        <circle cx="50" cy="10" r="1.2" />
        <circle cx="48" cy="20" r="0.9" opacity="0.85" />
        <circle cx="40" cy="6" r="0.9" opacity="0.85" />
      </g>
    </svg>
  )
}
