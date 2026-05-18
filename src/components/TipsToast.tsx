import { useEffect, useState } from 'react'
import { useProfileStore } from '../store/useProfileStore'

/**
 * Whimsy-themed pro tips toast. Renders on either of two themes — the
 * glyph swaps to match the show:
 *
 *   * cosmo-wanda    → magic wand + sparkles (Wanda's wand)
 *   * adventure-time → Gunther the penguin (Adventure Time assets cleared
 *                      by Diggy — usage rights confirmed 2026-05-18)
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
        {activeProfile === 'cosmo-wanda' ? <WandGlyph /> : <GuntherGlyph />}

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
        @keyframes gunther-wenk {
          0%, 100% { transform: translateY(0) rotate(-1.5deg); }
          50%      { transform: translateY(-1.5px) rotate(1.5deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          div[role="status"] > div { animation: none !important; }
          svg[data-glyph="gunther"] { animation: none !important; }
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

/** Gunther — Ice King's penguin sidekick from Adventure Time. White rounded
 *  body, black "hood" wrapping the head + back, orange diamond beak, two
 *  black dot eyes, two black flipper-wings, two orange waddle-feet. Adventure
 *  Time house style: solid fills, thick black outlines, no shading. Asset
 *  usage cleared by Diggy 2026-05-18. */
function GuntherGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 60"
      data-glyph="gunther"
      style={{
        width: 48,
        height: 48,
        flexShrink: 0,
        animation: 'gunther-wenk 2.4s ease-in-out infinite',
        transformOrigin: '50% 90%',
      }}
    >
      {/* Two orange waddle-feet under the body (drawn first so body overlaps) */}
      <ellipse
        cx="22"
        cy="55"
        rx="5"
        ry="2.4"
        fill="#ffa724"
        stroke="#1a1a1a"
        strokeWidth="1.6"
      />
      <ellipse
        cx="38"
        cy="55"
        rx="5"
        ry="2.4"
        fill="#ffa724"
        stroke="#1a1a1a"
        strokeWidth="1.6"
      />

      {/* Body — egg-shape, white/cream */}
      <ellipse
        cx="30"
        cy="32"
        rx="17"
        ry="21"
        fill="#fff8e7"
        stroke="#1a1a1a"
        strokeWidth="2.2"
      />

      {/* Black "hood" — covers top of head + wraps down the back/sides like a
          cape. Drawn as a path that hugs the body's upper arc and dips lower
          on each side, leaving the white face/belly visible in the center. */}
      <path
        d="
          M 13 30
          Q 12 14 22 11
          Q 30 8 38 11
          Q 48 14 47 30
          Q 46 24 42 22
          Q 38 21 36 25
          Q 30 28 24 25
          Q 22 21 18 22
          Q 14 24 13 30
          Z
        "
        fill="#1a1a1a"
        stroke="#1a1a1a"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Two flipper-wings — black ellipses jutting from each side */}
      <ellipse
        cx="11.5"
        cy="34"
        rx="3"
        ry="8"
        fill="#1a1a1a"
        stroke="#1a1a1a"
        strokeWidth="1.4"
        transform="rotate(-12 11.5 34)"
      />
      <ellipse
        cx="48.5"
        cy="34"
        rx="3"
        ry="8"
        fill="#1a1a1a"
        stroke="#1a1a1a"
        strokeWidth="1.4"
        transform="rotate(12 48.5 34)"
      />

      {/* Two black dot eyes — high on the face, characteristic Gunther stare */}
      <circle cx="24.5" cy="22" r="1.9" fill="#1a1a1a" />
      <circle cx="35.5" cy="22" r="1.9" fill="#1a1a1a" />
      {/* Tiny eye highlights */}
      <circle cx="25.1" cy="21.4" r="0.55" fill="#fff8e7" />
      <circle cx="36.1" cy="21.4" r="0.55" fill="#fff8e7" />

      {/* Orange diamond beak — short, central, with horizontal mouth line */}
      <path
        d="M 30 25 L 36 29 L 30 33 L 24 29 Z"
        fill="#ffa724"
        stroke="#1a1a1a"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <line
        x1="24"
        y1="29"
        x2="36"
        y2="29"
        stroke="#1a1a1a"
        strokeWidth="1"
      />

      {/* Faint cheek/belly cleft — subtle vertical line down belly */}
      <path
        d="M 30 35 Q 31 42 30 50"
        fill="none"
        stroke="#e8ddc2"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  )
}
