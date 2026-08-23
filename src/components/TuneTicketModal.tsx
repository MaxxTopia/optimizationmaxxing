import { useEffect, useState } from 'react'
import { openExternal } from '../lib/tauri'
import { refreshTuneTicket, type TuneTicket } from '../lib/tuneTicket'

interface Props {
  ticket: TuneTicket | null
  open: boolean
  onClose: () => void
  onTicketChange?: (ticket: TuneTicket) => void
}

export function TuneTicketModal({ ticket, open, onClose, onTicketChange }: Props) {
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open])

  if (!open || !ticket) return null
  const activeTicket = ticket

  const palette = {
    gold: {
      border: 'rgba(255, 215, 0, 0.75)',
      bg: 'linear-gradient(135deg, rgba(255, 215, 0, 0.22), rgba(105, 60, 0, 0.6))',
      text: '#ffe27d',
      glyph: '✦',
    },
    emerald: {
      border: 'rgba(52, 211, 153, 0.75)',
      bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.24), rgba(2, 57, 44, 0.72))',
      text: '#7df0c0',
      glyph: '◆',
    },
    diamond: {
      border: 'rgba(125, 211, 252, 0.9)',
      bg: 'linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(12, 34, 76, 0.78))',
      text: '#b9eaff',
      glyph: '◇',
    },
  }[activeTicket.rarity]

  const expiresAt = Date.parse(activeTicket.expiresAt)
  const expired = Number.isFinite(expiresAt) && expiresAt <= now
  const countdown = expired ? 'expired' : formatRemaining(expiresAt - now)

  async function copyTicket() {
    try {
      await navigator.clipboard.writeText(
        `MaxxTopia VIP offer\nTicket: ${activeTicket.id}\nOffer: ${activeTicket.rarity.toUpperCase()} · $${activeTicket.price}\nExpires: ${new Date(activeTicket.expiresAt).toISOString()}`,
      )
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  async function connectDiscord() {
    if (!activeTicket.connectUrl || expired) return
    await openExternal(activeTicket.connectUrl)
  }

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      onTicketChange?.(await refreshTuneTicket(activeTicket))
    } finally {
      setRefreshing(false)
    }
  }

  const status = expired && activeTicket.status === 'pending' ? 'expired' : activeTicket.status
  const statusCopy =
    status === 'offered'
      ? activeTicket.dmSent
        ? 'Maxx Bot sent this offer to your Discord account.'
        : 'Your Discord account is linked. Maxx Bot is still trying to deliver the offer.'
      : status === 'pending'
        ? 'Connect Discord to lock this offer to your account. You can ignore it if you do not want VIP.'
        : status === 'local'
          ? 'The offer service was unavailable. Reopen the app while online to secure this offer to Discord.'
          : status === 'redeemed'
            ? 'This offer has already been used.'
            : status === 'revoked'
              ? 'This offer is no longer available.'
              : 'This offer expired before it was secured.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg" role="dialog" aria-modal="true" aria-labelledby="tune-ticket-title">
        <div
          className="relative overflow-hidden rounded-2xl border-2 p-1 shadow-2xl"
          style={{ borderColor: palette.border, background: palette.bg, boxShadow: `0 0 45px ${palette.border}` }}
        >
          <div className="absolute inset-y-0 left-0 w-3 border-r-2 border-dashed" style={{ borderColor: palette.border }} />
          <div className="absolute inset-y-0 right-0 w-3 border-l-2 border-dashed" style={{ borderColor: palette.border }} />
          <div className="m-2 rounded-xl border border-white/15 bg-black/35 px-7 py-6 sm:px-10 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/60">first-time VIP offer</p>
                <h2 id="tune-ticket-title" className="text-3xl font-black tracking-tight" style={{ color: palette.text }}>
                  MAXX OFFER
                </h2>
              </div>
              <button onClick={onClose} className="text-white/60 hover:text-white text-xl" aria-label="Close offer">
                ×
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 border-y border-white/15 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-white/60">offer tier</p>
                <p className="text-2xl font-black uppercase" style={{ color: palette.text }}>
                  <span aria-hidden className="mr-2">{palette.glyph}</span>{activeTicket.rarity}
                </p>
                <p className="text-xs text-white/70">{activeTicket.chanceLabel} · one offer per Discord account</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-widest text-white/60">lifetime VIP</p>
                <p className="text-5xl font-black text-white">${activeTicket.price}</p>
                <p className="text-xs text-white/70 line-through">$115 normal</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-white/15 bg-black/25 px-3 py-2 text-xs">
              <span className="uppercase tracking-widest text-white/55">time to decide</span>
              <strong className={expired ? 'text-red-300' : 'text-white'}>{countdown}</strong>
            </div>

            <div className="space-y-1 text-xs text-white/75">
              <p><span className="text-white/50 uppercase tracking-widest">offer no.</span> <span className="font-mono text-white">{activeTicket.id}</span></p>
              <p><span className="text-white/50 uppercase tracking-widest">status.</span> <span className="text-white">{status === 'offered' ? 'linked to Discord' : status}</span></p>
            </div>

            <div className="rounded-md border border-white/15 bg-black/25 p-3 text-xs text-white/80 leading-snug">
              {statusCopy} This is a limited-time discount offer, not a contest. It does not unlock
              VIP automatically. If you decide to use it, open a Maxxtopia Discord ticket before the
              timer ends and give Diggy the offer number.
            </div>

            <div className="flex flex-wrap gap-2">
              {status === 'pending' && activeTicket.connectUrl && !expired && (
                <button onClick={connectDiscord} className="flex-1 min-w-44 rounded-md bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
                  Connect Discord
                </button>
              )}
              {activeTicket.serverSession && status !== 'redeemed' && status !== 'revoked' && (
                <button onClick={refresh} disabled={refreshing} className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50">
                  {refreshing ? 'Checking…' : 'Check status'}
                </button>
              )}
              <button onClick={copyTicket} className="flex-1 min-w-44 rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15">
                {copied ? 'Copied offer ✓' : 'Copy offer details'}
              </button>
              <button onClick={onClose} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:text-white">
                Decide later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
}
