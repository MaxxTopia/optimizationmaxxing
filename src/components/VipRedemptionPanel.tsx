import { useEffect, useState } from 'react'
import { inTauri, vipClaimOnline, vipHwid, vipVerify } from '../lib/tauri'
import { useVipStore } from '../store/useVipStore'

/**
 * Hidden redemption panel — revealed by 5 quick clicks on the VIP price.
 * Shows the user's HWID + a code-input field. On verify-success, applies
 * the redemption to useVipStore (persists code + bound HWID), fires a
 * gold-confetti splash for 1.2s.
 *
 * Codes are HWID-bound (see src-tauri/src/vip.rs). Diggy mints them via
 * scripts/mint-vip-code.py <friend-hwid> and DMs the result.
 */

type Status = 'idle' | 'verifying' | 'ok' | 'fail' | 'claimed-elsewhere'

export function VipRedemptionPanel({ onClose }: { onClose?: () => void }) {
  const apply = useVipStore((s) => s.applyRedemption)
  const [hwid, setHwid] = useState<string | null>(null)
  const [hwidErr, setHwidErr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [shake, setShake] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const isNative = inTauri()

  useEffect(() => {
    if (!isNative) {
      setHwidErr('HWID requires the optimizationmaxxing.exe shell.')
      return
    }
    vipHwid()
      .then((h) => setHwid(h))
      .catch((e) => setHwidErr(typeof e === 'string' ? e : (e as Error).message ?? String(e)))
  }, [isNative])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hwid) return
    setStatus('verifying')
    const trimmed = code.trim()

    // Try online (Cloudflare Worker first-claim ledger) first. Two reasons:
    //   1. Unbound codes (random + dropped in DMs) only work this way.
    //   2. HWID-bound codes that were previously claimed by THIS rig will
    //      come back as `idempotent` from the worker — so re-redeeming an
    //      old code on the same machine still succeeds.
    // Fall back to local HWID-bound verify if the worker is unreachable
    // or returns 404 (claim endpoint missing during early bring-up).
    try {
      const r = await vipClaimOnline(trimmed)
      if (r.ok) {
        apply(trimmed, hwid)
        setStatus('ok')
        setConfetti(true)
        window.setTimeout(() => setConfetti(false), 1400)
        return
      }
      if (r.status === 'already-claimed') {
        setStatus('claimed-elsewhere')
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
        return
      }
      // Network errors and 404 fall through to the offline path so a
      // user with the older HWID-bound code can still redeem if Diggy
      // hasn't deployed the worker yet.
      if (r.status !== 'network-error' && r.status !== 'not-found' && r.status !== 'malformed') {
        // 4xx other than 409 — give up; surface the error.
        setStatus('fail')
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
        return
      }
    } catch {
      // fall through to offline path
    }

    // Offline / fallback path — HWID-bound HMAC verify.
    try {
      const ok = await vipVerify(trimmed)
      if (ok) {
        apply(trimmed, hwid)
        setStatus('ok')
        setConfetti(true)
        window.setTimeout(() => setConfetti(false), 1400)
      } else {
        setStatus('fail')
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
      }
    } catch {
      setStatus('fail')
      setShake(true)
      window.setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div
      className={`surface-card p-5 space-y-3 relative overflow-hidden ${
        shake ? 'animate-shake' : ''
      }`}
      style={{
        borderColor: 'rgba(255, 215, 0, 0.45)',
        boxShadow: '0 0 18px rgba(255, 215, 0, 0.18)',
      }}
    >
      {confetti && <ConfettiBurst />}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle flex items-center gap-1">
            <span aria-hidden="true">👑</span>
            Hidden — VIP redemption
          </p>
          <h3 className="text-base font-semibold">Have a maxxer code?</h3>
          <p className="text-xs text-text-muted leading-snug max-w-xl">
            Codes are HWID-bound — they only work on the rig they were minted for.
            Send your fingerprint to whoever's gifting you VIP and they'll DM back
            a code.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide redemption panel"
            className="text-text-subtle hover:text-text text-lg leading-none px-2"
          >
            ×
          </button>
        )}
      </div>

      <div className="surface-card p-3 space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">Your fingerprint</p>
        {hwidErr ? (
          <p className="text-xs text-amber-300">{hwidErr}</p>
        ) : hwid ? (
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-xs text-text bg-bg-base/60 px-2 py-1 rounded select-all break-all">
              {hwid}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(hwid)}
              className="text-[11px] text-accent hover:underline"
            >
              copy
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-subtle italic">computing…</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <label className="block">
          <span className="sr-only">Redemption code</span>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              if (status !== 'idle') setStatus('idle')
            }}
            placeholder="MAXX-XXXX-XXXX-XXXX-XXXX"
            spellCheck={false}
            autoCapitalize="characters"
            className="w-full px-3 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm font-mono tracking-wider"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'verifying' || !hwid || code.trim().length === 0}
            className="btn-chrome px-4 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #cc9900 100%)',
              color: '#3a2a00',
              border: '1px solid rgba(255, 215, 0, 0.65)',
            }}
          >
            {status === 'verifying' ? 'Verifying…' : status === 'ok' ? 'Activated 👑' : 'Activate'}
          </button>
          {status === 'fail' && (
            <span className="text-xs text-red-400">
              Code didn't match. Re-check the spelling, or confirm you sent the right fingerprint.
            </span>
          )}
          {status === 'claimed-elsewhere' && (
            <span className="text-xs text-amber-300">
              That code is already locked to a different rig. Ask Diggy for a fresh one.
            </span>
          )}
          {status === 'ok' && (
            <span className="text-xs text-emerald-300">
              VIP unlocked — bound to this machine.
            </span>
          )}
        </div>
      </form>

      <p className="text-[11px] text-text-subtle pt-2 border-t border-border">
        Lost on a code? DM{' '}
        <code className="text-accent">@diggy</code> with your fingerprint above —
        codes are minted manually for now.
      </p>

      <style>{`
        @keyframes shake-x {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake-x 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
      `}</style>
    </div>
  )
}

/**
 * Tiny inline gold-confetti burst — purely decorative, runs ~1.2 s and
 * unmounts. CSS-only, no canvas, no extra dependencies. Hypixel gold
 * scheme to match the VIP badge styling.
 */
function ConfettiBurst() {
  // Pre-compute positions so React doesn't reshuffle on every paint.
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    angle: (Math.PI * 2 * i) / 24,
    distance: 60 + Math.random() * 80,
    rotate: Math.random() * 360,
    delay: Math.random() * 120,
    color: ['#ffd700', '#ffed4e', '#cc9900', '#ffe680'][i % 4],
  }))
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2 w-1.5 h-3"
          style={{
            background: p.color,
            transform: 'translate(-50%, -50%)',
            animation: `vip-confetti 1.2s ease-out ${p.delay}ms forwards`,
            ['--dx' as string]: `${Math.cos(p.angle) * p.distance}px`,
            ['--dy' as string]: `${Math.sin(p.angle) * p.distance}px`,
            ['--rot' as string]: `${p.rotate}deg`,
          }}
        />
      ))}
      <style>{`
        @keyframes vip-confetti {
          0%   { transform: translate(-50%, -50%) rotate(0) scale(0.4); opacity: 0; }
          15%  { opacity: 1; }
          100% {
            transform:
              translate(calc(-50% + var(--dx)), calc(-50% + var(--dy)))
              rotate(var(--rot))
              scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
