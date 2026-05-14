import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIsVip } from '../store/useVipStore'

/**
 * Asta Mode card — Black Clover anti-magic visual treatment.
 *
 *   - Deeper-than-DMC void background
 *   - White SVG hairline cracks across the surface, occasional flicker
 *   - Crimson border pulse on hover
 *   - 5-leaf grimoire glyph corner mark (one ember-red petal — the 5th)
 *   - Pirata One serif headline
 *   - Rotating manifesto quote band
 *   - Ember-veined active state (when VIP + applied)
 *   - VIP gold crown badge top-right when locked
 *
 * The card is a high-contrast outlier from the rest of the dashboard on
 * purpose. Asta Mode is the ceiling — it should look like the ceiling.
 */

const QUOTES = [
  '"I will surpass my limits."',
  '"It\'s not the gear. It\'s who refuses to lose."',
  '"We don\'t move because we think we can win. We move because the version of me that gives up is someone we refuse to meet."',
  '"Every drop of sweat and every scar we earned can\'t become a lie. We are not liars."',
] as const

export function AstaCard() {
  const isVip = useIsVip()
  const [quoteIdx, setQuoteIdx] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => {
      setQuoteIdx((i) => (i + 1) % QUOTES.length)
    }, 6000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <Link
      to="/asta"
      className="asta-card block relative overflow-hidden rounded-xl p-6 md:p-7 group"
      aria-label="Asta Mode — push your rig to its limits"
    >
      {/* Crimson pulse layer (hover) */}
      <span className="asta-card__pulse" aria-hidden="true" />

      {/* Hairline white cracks across the void — subtle SVG overlay */}
      <svg
        className="asta-card__cracks"
        viewBox="0 0 600 240"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="asta-crack-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.7)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <path
          d="M 0 80 L 120 70 L 180 110 L 320 90 L 440 130 L 600 110"
          stroke="url(#asta-crack-grad)"
          strokeWidth="0.6"
          fill="none"
        />
        <path
          d="M 0 180 L 90 170 L 240 200 L 380 175 L 520 195 L 600 180"
          stroke="url(#asta-crack-grad)"
          strokeWidth="0.5"
          fill="none"
        />
        <path
          d="M 100 0 L 110 60 L 95 120 L 130 180 L 105 240"
          stroke="url(#asta-crack-grad)"
          strokeWidth="0.4"
          fill="none"
        />
        <path
          d="M 480 0 L 470 70 L 495 140 L 480 240"
          stroke="url(#asta-crack-grad)"
          strokeWidth="0.4"
          fill="none"
        />
      </svg>

      {/* 5-leaf grimoire mark — top-left corner */}
      <Grimoire5Leaf />

      {/* VIP lock badge — top-right when not VIP */}
      {!isVip && <VipLockBadge />}

      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.3em] text-asta-bone mb-1">
          Asta Mode
        </p>
        <h2 className="asta-card__title text-3xl md:text-4xl font-bold leading-none">
          Push the rig to its limit.
        </h2>
        <p className="asta-card__quote text-sm md:text-base text-asta-bone-soft mt-3 max-w-2xl leading-snug min-h-[3em]">
          {QUOTES[quoteIdx]}
        </p>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs px-3 py-1 rounded border border-asta-crimson/40 bg-asta-crimson/10 text-asta-bone uppercase tracking-widest">
            {isVip ? 'unlocked' : 'VIP only'}
          </span>
          <span className="text-xs text-asta-bone-soft">
            {isVip
              ? 'Open for the path + apply'
              : 'Tap the $115 price 5x within 3s on Pricing to redeem a code'}
          </span>
        </div>
      </div>

      <style>{`
        .asta-card {
          background: radial-gradient(circle at 18% 20%, rgba(201, 31, 55, 0.16) 0%, transparent 45%),
                      radial-gradient(circle at 82% 80%, rgba(89, 13, 26, 0.4) 0%, transparent 55%),
                      #040003;
          border: 1px solid rgba(201, 31, 55, 0.35);
          --asta-bone: #f0e4d8;
          --asta-bone-soft: #b9a487;
          --asta-crimson: #c91f37;
          color: var(--asta-bone);
          transition: border-color 240ms ease, box-shadow 360ms ease, transform 220ms ease;
          isolation: isolate;
        }
        .asta-card:hover {
          border-color: rgba(201, 31, 55, 0.85);
          box-shadow:
            0 0 24px rgba(201, 31, 55, 0.45),
            0 0 56px rgba(201, 31, 55, 0.18);
          transform: translateY(-1px);
        }
        .asta-card__title {
          font-family: 'Pirata One', 'Cinzel', 'Cormorant Garamond', Georgia, serif;
          letter-spacing: 0.01em;
          color: var(--asta-bone);
          text-shadow:
            0 0 12px rgba(201, 31, 55, 0.45),
            0 0 28px rgba(89, 13, 26, 0.6);
        }
        .asta-card__quote {
          font-family: 'Cinzel', 'Cormorant Garamond', serif;
          letter-spacing: 0.01em;
        }
        .asta-card__cracks {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0.32;
          mix-blend-mode: screen;
          pointer-events: none;
          animation: asta-crack-flicker 8s ease-in-out infinite;
        }
        .asta-card__pulse {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center,
            rgba(201, 31, 55, 0.35) 0%,
            rgba(201, 31, 55, 0) 60%);
          opacity: 0;
          pointer-events: none;
          transition: opacity 480ms ease;
        }
        .asta-card:hover .asta-card__pulse {
          opacity: 0.65;
          animation: asta-pulse 2.4s ease-in-out infinite;
        }
        .text-asta-bone { color: var(--asta-bone); }
        .text-asta-bone-soft { color: var(--asta-bone-soft); }
        .border-asta-crimson\\/40 { border-color: rgba(201, 31, 55, 0.4); }
        .bg-asta-crimson\\/10 { background-color: rgba(201, 31, 55, 0.1); }

        @keyframes asta-crack-flicker {
          0%, 92%, 100% { opacity: 0.32; }
          93% { opacity: 0.7; }
          94% { opacity: 0.18; }
          95% { opacity: 0.55; }
          96% { opacity: 0.3; }
        }
        @keyframes asta-pulse {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.04); opacity: 0.85; }
        }
        @media (prefers-reduced-motion: reduce) {
          .asta-card,
          .asta-card__cracks,
          .asta-card__pulse {
            animation: none !important;
            transition: none !important;
          }
          .asta-card:hover { transform: none; }
        }
      `}</style>
    </Link>
  )
}

/**
 * 5-leaf grimoire SVG — Asta's anti-magic mark. Four black petals plus
 * one ember-red petal (the 5th = devil pact). Pinned top-left.
 */
function Grimoire5Leaf() {
  return (
    <svg
      className="absolute top-4 left-4 w-7 h-7 z-10 opacity-70"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <g>
        {/* 4 black petals at 90/180/270/0 deg */}
        {[0, 90, 180, 270].map((deg) => (
          <path
            key={deg}
            d="M 50 50 Q 50 14 50 8 Q 50 14 50 50 Z"
            fill="rgba(240, 228, 216, 0.5)"
            transform={`rotate(${deg} 50 50)`}
            style={{ filter: 'drop-shadow(0 0 1px rgba(240,228,216,0.6))' }}
          />
        ))}
        {/* 5th petal — ember red, 45deg offset */}
        <path
          d="M 50 50 Q 50 14 50 8 Q 50 14 50 50 Z"
          fill="#c91f37"
          transform="rotate(45 50 50)"
          style={{ filter: 'drop-shadow(0 0 3px rgba(201,31,55,0.8))' }}
        />
        {/* center dot */}
        <circle cx="50" cy="50" r="3" fill="#f0e4d8" opacity="0.85" />
      </g>
    </svg>
  )
}

function VipLockBadge() {
  return (
    <span
      className="absolute top-4 right-4 z-10 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1"
      style={{
        background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #cc9900 100%)',
        color: '#3a2a00',
        border: '1px solid rgba(255, 215, 0, 0.65)',
        boxShadow: '0 0 10px rgba(255, 215, 0, 0.35)',
      }}
    >
      <span aria-hidden="true">👑</span> VIP
    </span>
  )
}
