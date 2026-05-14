import { useProfileStore } from '../store/useProfileStore'

/**
 * Element-115 theme — lab-flask vial in the bottom-left corner of the
 * viewport. Real DOM elements (not body pseudo-elements) so we can run
 * multiple independent rising-bubble animations + vapor wisps + a
 * proper test-tube SVG outline + cork stopper.
 *
 * Generic glassware aesthetic — evokes a chemistry-lab divinium flask
 * without copying any specific game asset. Cyan→violet liquid cycles
 * fill ↔ empty on a 10s loop. Bubbles rise inside on independent
 * timings. Vapor wisps drift up off the top.
 *
 * Renders ONLY when activeProfile === 'element-115'. Zero DOM on
 * every other theme.
 */
export function Element115Vial() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  if (activeProfile !== 'element-115') return null

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: 18,
        bottom: 30,
        width: 44,
        height: 150,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* Vapor wisps escaping the top */}
      <div className="e115-vapor e115-vapor-1" />
      <div className="e115-vapor e115-vapor-2" />
      <div className="e115-vapor e115-vapor-3" />

      {/* Cork stopper */}
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 22,
          height: 14,
          borderRadius: 3,
          background: 'linear-gradient(180deg, #c4843a 0%, #8a5a22 100%)',
          border: '1.5px solid #1a0e10',
          boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.18)',
          zIndex: 4,
        }}
      />
      {/* Stopper indent line */}
      <div
        style={{
          position: 'absolute',
          top: 25,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 22,
          height: 1.5,
          background: '#5a3818',
          zIndex: 5,
        }}
      />

      {/* Flask body — narrow neck, flared shoulder, rounded bottom */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: 7,
          width: 30,
          height: 116,
          background: 'rgba(15, 10, 26, 0.55)',
          border: '2px solid rgba(127, 236, 240, 0.65)',
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 18,
          overflow: 'hidden',
          boxShadow:
            'inset 0 0 12px rgba(61, 223, 232, 0.35), 0 0 18px rgba(61, 223, 232, 0.45), 0 0 36px rgba(157, 77, 255, 0.25)',
          zIndex: 2,
        }}
      >
        {/* Liquid (animates fill ↔ empty via height) */}
        <div className="e115-liquid" />

        {/* Three bubbles rising independently */}
        <div className="e115-bubble e115-bubble-a" />
        <div className="e115-bubble e115-bubble-b" />
        <div className="e115-bubble e115-bubble-c" />

        {/* Glass highlight (left side reflection) */}
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 3,
            width: 4,
            height: 90,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%)',
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      </div>

      {/* "115" label below the flask */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -22,
          transform: 'translateX(-50%)',
          fontFamily: "'Cinzel', serif",
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.12em',
          color: 'rgba(127, 236, 240, 0.9)',
          textShadow: '0 0 8px rgba(61, 223, 232, 0.7), 0 0 16px rgba(157, 77, 255, 0.4)',
          whiteSpace: 'nowrap',
        }}
      >
        115
      </div>

      <style>{`
        /* Liquid — fills from 0 → ~95% then drains, on a 10s loop.
           Cyan top, violet bottom gradient. */
        .e115-liquid {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 0;
          background:
            linear-gradient(180deg,
              rgba(127, 236, 240, 0.95) 0%,
              rgba(61, 223, 232, 0.92) 35%,
              rgba(120, 90, 220, 0.88) 75%,
              rgba(157, 77, 255, 0.80) 100%
            );
          box-shadow:
            inset 0 4px 8px rgba(255, 255, 255, 0.25),
            inset 0 -2px 6px rgba(157, 77, 255, 0.4);
          animation: e115-liquid-fill 10s ease-in-out infinite;
          z-index: 1;
        }
        @keyframes e115-liquid-fill {
          0%, 100% { height: 0; }
          40%      { height: 92%; }
          55%      { height: 92%; }
          85%      { height: 0; }
        }

        /* Bubbles — rise from bottom to top, fade out near the top. */
        .e115-bubble {
          position: absolute;
          background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9), rgba(127, 236, 240, 0.6) 70%, transparent);
          border-radius: 50%;
          opacity: 0;
          z-index: 2;
        }
        .e115-bubble-a {
          width: 5px; height: 5px; left: 9px;
          animation: e115-bubble-rise 3.2s ease-in-out infinite;
          animation-delay: 0.4s;
        }
        .e115-bubble-b {
          width: 3.5px; height: 3.5px; left: 16px;
          animation: e115-bubble-rise 2.6s ease-in-out infinite;
          animation-delay: 1.4s;
        }
        .e115-bubble-c {
          width: 4px; height: 4px; left: 21px;
          animation: e115-bubble-rise 3.6s ease-in-out infinite;
          animation-delay: 2.1s;
        }
        @keyframes e115-bubble-rise {
          0%   { bottom: 4px;  opacity: 0; transform: scale(0.6); }
          15%  { opacity: 0.95; transform: scale(1); }
          80%  { opacity: 0.85; }
          100% { bottom: 100px; opacity: 0; transform: scale(0.7) translateX(2px); }
        }

        /* Vapor wisps — soft glowing puffs that drift upward from the
           stopper area. Each wisp has its own timing offset. */
        .e115-vapor {
          position: absolute;
          left: 50%;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(127, 236, 240, 0.55) 0%, rgba(127, 236, 240, 0) 70%);
          filter: blur(2px);
          opacity: 0;
          z-index: 3;
        }
        .e115-vapor-1 {
          top: 16px;
          margin-left: -7px;
          animation: e115-vapor-drift 4.2s ease-out infinite;
        }
        .e115-vapor-2 {
          top: 16px;
          margin-left: -3px;
          animation: e115-vapor-drift 4.8s ease-out infinite;
          animation-delay: 1.3s;
        }
        .e115-vapor-3 {
          top: 16px;
          margin-left: -11px;
          animation: e115-vapor-drift 5.1s ease-out infinite;
          animation-delay: 2.6s;
        }
        @keyframes e115-vapor-drift {
          0%   { transform: translateY(0)   scale(0.6); opacity: 0; }
          20%  { opacity: 0.75; }
          100% { transform: translateY(-20px) scale(1.5); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .e115-liquid { animation: none; height: 60%; }
          .e115-bubble { animation: none; opacity: 0; }
          .e115-vapor  { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
