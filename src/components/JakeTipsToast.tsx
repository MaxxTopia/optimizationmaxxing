import { useEffect, useState } from 'react'
import { useProfileStore } from '../store/useProfileStore'

/**
 * Jake the Dog tips toast — Adventure Time theme only. Replaces the
 * previous NEPTR toast (user feedback: NEPTR is annoying). Jake is
 * Finn's older brother and the show's mentor-voice — perfect fit for
 * dropping casual, slightly-too-confident gaming wisdom.
 *
 * Rotates through 8 in-app tips every 14s. Click × to dismiss for the
 * session. Re-enable: clear sessionStorage or switch theme away + back.
 *
 * Renders ONLY when profile === 'adventure-time'. Pure DOM-free on
 * every other theme.
 */

const DISMISS_KEY = 'optmaxxing-jake-dismissed'

const TIPS = [
  'Bro. Pre-warm the snapshot store by applying 5+ tweaks before scrim — the rollback feels chiller.',
  'Dude. Cap your FPS at refresh-minus-3. G-Sync stays locked. Best feeling.',
  'Pro tip — iCUE and Synapse are eating your input. RGB-shutoff tweak in /tweaks, my man.',
  'See that vial in the corner if you switch to Element-115? That\'s how I feel after a sandwich.',
  'On a 13900K and getting crashes? Check the WHEA card on /diagnostics. Microcode 0x12B or RMA, dude.',
  'Asta Mode before tournament. Revert after. Don\'t be the guy who forgets.',
  'BMO over there is technically a microwave. Pretty cool guy. Real chill.',
  'Pick your game on /tweaks first. Catalog filters down. You\'re welcome, dude.',
] as const

export function JakeTipsToast() {
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
          padding: '11px 13px 11px 10px',
          boxShadow: '0 8px 22px rgba(0,0,0,0.4), 0 0 14px rgba(247, 185, 74, 0.35)',
          color: '#1a1f3a',
          fontFamily: "'Fredoka', 'Bungee', 'Comic Sans MS', system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.34,
          animation: 'jake-stretch-in 420ms cubic-bezier(0.22, 1.4, 0.36, 1)',
        }}
      >
        {/* Jake the Dog SVG — yellow body, stubby legs, casual smile */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 60 60"
          style={{ width: 56, height: 56, flexShrink: 0 }}
        >
          {/* Body (yellow, rounded) */}
          <ellipse cx="30" cy="34" rx="22" ry="20" fill="#f7b94a" stroke="#1a1f3a" strokeWidth="2.5" />
          {/* Belly highlight */}
          <ellipse cx="30" cy="40" rx="12" ry="8" fill="#fad590" opacity="0.6" />
          {/* Ear left */}
          <ellipse cx="14" cy="20" rx="6" ry="9" fill="#f7b94a" stroke="#1a1f3a" strokeWidth="2" transform="rotate(-25 14 20)" />
          {/* Ear right */}
          <ellipse cx="46" cy="20" rx="6" ry="9" fill="#f7b94a" stroke="#1a1f3a" strokeWidth="2" transform="rotate(25 46 20)" />
          {/* Eyes */}
          <ellipse cx="22" cy="26" rx="4" ry="5" fill="#ffffff" stroke="#1a1f3a" strokeWidth="1.5" />
          <ellipse cx="38" cy="26" rx="4" ry="5" fill="#ffffff" stroke="#1a1f3a" strokeWidth="1.5" />
          <circle cx="23" cy="27" r="1.8" fill="#1a1f3a" />
          <circle cx="39" cy="27" r="1.8" fill="#1a1f3a" />
          {/* Nose */}
          <ellipse cx="30" cy="32" rx="2" ry="1.4" fill="#1a1f3a" />
          {/* Mouth — happy smirk */}
          <path d="M 24 36 Q 27 40 30 38 Q 33 40 36 36" stroke="#1a1f3a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          {/* Tongue peek */}
          <path d="M 28 39 Q 30 41 32 39" stroke="#e74c3c" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 }}>
            Jake · tip
          </p>
          <p style={{ margin: 0 }}>{TIPS[tipIdx]}</p>
        </div>

        <button
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, '1')
            setDismissed(true)
          }}
          aria-label="Dismiss Jake's tips"
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
        @keyframes jake-stretch-in {
          0%   { transform: scaleX(0.3) translateY(20px); opacity: 0; }
          50%  { transform: scaleX(1.15) translateY(-2px); opacity: 1; }
          100% { transform: scaleX(1) translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          div[role="status"] > div { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
