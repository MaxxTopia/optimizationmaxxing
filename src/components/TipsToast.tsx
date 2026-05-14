import { useEffect, useState } from 'react'
import { useProfileStore } from '../store/useProfileStore'

/**
 * Whimsy-themed pro tips toast — only renders when the active profile
 * is Adventure Time. Uses a generic magic-wand-and-stars glyph (no
 * show character likeness) + a rotating pool of helpful in-app tips
 * on a 14s cycle. Click × to dismiss for the session.
 *
 * Renders nothing on every other theme (no DOM cost).
 */

const DISMISS_KEY = 'optmaxxing-tips-dismissed'

const TIPS = [
  'Pre-warm the snapshot store by applying 5+ tweaks before scrim — rollback feels cleaner.',
  'Cap your FPS at refresh-minus-3. G-Sync stays locked, frame pacing tightens.',
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

  if (activeProfile !== 'adventure-time') return null
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
        {/* Generic magic-wand-and-star glyph — NOT a show character. */}
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
          {/* Star inner highlight */}
          <path
            d="M 42 12 L 44 18 L 50 18 L 45 22 L 47 28"
            fill="none"
            stroke="#fff5b0"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />
          {/* Sparkle 1 (top-right) */}
          <g fill="#ff77bb">
            <path d="M 56 6 L 57 9 L 60 10 L 57 11 L 56 14 L 55 11 L 52 10 L 55 9 Z" />
          </g>
          {/* Sparkle 2 (left) */}
          <g fill="#5db94a">
            <path d="M 8 30 L 9 33 L 12 34 L 9 35 L 8 38 L 7 35 L 4 34 L 7 33 Z" />
          </g>
          {/* Sparkle 3 (bottom) */}
          <g fill="#4fc3f7">
            <path d="M 22 56 L 23 58 L 25 59 L 23 60 L 22 58 L 21 60 L 19 59 L 21 58 Z" opacity="0.85" />
          </g>
        </svg>

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
        @media (prefers-reduced-motion: reduce) {
          div[role="status"] > div { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
