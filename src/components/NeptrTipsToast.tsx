import { useEffect, useState } from 'react'
import { useProfileStore } from '../store/useProfileStore'

/**
 * NEPTR (Never-Ending Pie Throwing Robot) tips toast — Adventure Time
 * theme only. NEPTR is Finn's robot son; he throws pies. Here he
 * throws *helpful tips* into the bottom-right corner of the viewport.
 *
 * Rotates through a small pool of in-app tips on a 14s interval. Click
 * to dismiss permanently for this session (localStorage). Re-enable by
 * clearing the key or switching themes off and back on.
 *
 * Renders ONLY when the active profile is 'adventure-time' — invisible
 * on every other theme, no DOM overhead.
 */

const DISMISS_KEY = 'optmaxxing-neptr-dismissed'

const TIPS = [
  '“Pre-heat the registry, Father.” — Apply 5+ tweaks before scrim so the snapshot store warms up.',
  '“Pies cool best at low fps caps.” — Cap FPS at refresh-3 to keep G-Sync locked.',
  '“My oven is louder when iCUE runs.” — Kill RGB control apps for ~5% DPC headroom.',
  '“Father, the divinium glows when ready.” — Watch the bottom-left vial cycle to remember the Element 115 theme.',
  '“I throw pies, not microcode.” — Update BIOS to 0x12B if you\'re on a 13/14-gen K-class Intel chip.',
  '“Always rotate, never panic.” — Apply Asta Mode before tournament, revert after.',
  '“BMO says hi. He is also a microwave.” — He\'s on the Dashboard. So am I, technically.',
] as const

export function NeptrTipsToast() {
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
        maxWidth: 320,
        zIndex: 30,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          background: 'linear-gradient(180deg, #e0e6ee 0%, #b8c0c8 100%)',
          border: '2px solid #1a1f3a',
          borderRadius: 12,
          padding: '10px 12px 10px 10px',
          boxShadow: '0 8px 20px rgba(0,0,0,0.35), 0 0 12px rgba(255,143,163,0.25)',
          color: '#1a1f3a',
          fontFamily: "'Fredoka', 'Bungee', 'Comic Sans MS', system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.32,
          animation: 'neptr-pie-toss 380ms cubic-bezier(0.22, 1.4, 0.36, 1)',
        }}
      >
        {/* NEPTR microwave-bot avatar — pure inline SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 60 60"
          style={{ width: 52, height: 52, flexShrink: 0 }}
        >
          {/* microwave body */}
          <rect x="4" y="8" width="52" height="48" rx="4" fill="#9aa3ad" stroke="#1a1f3a" strokeWidth="2.5" />
          {/* door */}
          <rect x="8" y="14" width="32" height="36" rx="3" fill="#3a4250" stroke="#1a1f3a" strokeWidth="2" />
          {/* glass reflection */}
          <rect x="10" y="16" width="14" height="20" rx="2" fill="#5a6478" opacity="0.7" />
          {/* eye 1 */}
          <circle cx="18" cy="32" r="3.5" fill="#ffe4a8" />
          <circle cx="18.5" cy="31.5" r="1.2" fill="#1a1f3a" />
          {/* eye 2 */}
          <circle cx="30" cy="32" r="3.5" fill="#ffe4a8" />
          <circle cx="30.5" cy="31.5" r="1.2" fill="#1a1f3a" />
          {/* speaker grille (right panel) */}
          <rect x="44" y="18" width="8" height="2.5" rx="1" fill="#1a1f3a" />
          <rect x="44" y="24" width="8" height="2.5" rx="1" fill="#1a1f3a" />
          <rect x="44" y="30" width="8" height="2.5" rx="1" fill="#1a1f3a" />
          {/* power button */}
          <circle cx="48" cy="44" r="3" fill="#e74c3c" stroke="#1a1f3a" strokeWidth="1.5" />
          {/* pie launch nozzle (top) */}
          <rect x="22" y="2" width="16" height="6" rx="2" fill="#f0a8c8" stroke="#1a1f3a" strokeWidth="2" />
          {/* pie chunks coming out */}
          <circle cx="26" cy="0" r="2" fill="#f0a8c8" stroke="#1a1f3a" strokeWidth="1" />
          <circle cx="34" cy="-2" r="2.5" fill="#f0a8c8" stroke="#1a1f3a" strokeWidth="1" />
        </svg>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 }}>
            NEPTR · tip
          </p>
          <p style={{ margin: 0 }}>{TIPS[tipIdx]}</p>
        </div>

        <button
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, '1')
            setDismissed(true)
          }}
          aria-label="Dismiss NEPTR tips"
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
        @keyframes neptr-pie-toss {
          0%   { transform: translateY(20px) rotate(-6deg); opacity: 0; }
          100% { transform: translateY(0) rotate(0deg); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          div[role="status"] > div { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
