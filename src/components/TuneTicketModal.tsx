import { useState } from 'react'
import type { TuneTicket } from '../lib/tuneTicket'

interface Props {
  ticket: TuneTicket | null
  open: boolean
  onClose: () => void
}

export function TuneTicketModal({ ticket, open, onClose }: Props) {
  const [copied, setCopied] = useState(false)
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

  async function copyTicket() {
    try {
      await navigator.clipboard.writeText(`${activeTicket.id}\n${activeTicket.rigProof}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

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
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/60">first Tune Now pull</p>
                <h2 id="tune-ticket-title" className="text-3xl font-black tracking-tight" style={{ color: palette.text }}>
                  MAXX TICKET
                </h2>
              </div>
              <button onClick={onClose} className="text-white/60 hover:text-white text-xl" aria-label="Close ticket">
                ×
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 border-y border-white/15 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-white/60">rarity</p>
                <p className="text-2xl font-black uppercase" style={{ color: palette.text }}>
                  <span aria-hidden className="mr-2">{palette.glyph}</span>{activeTicket.rarity}
                </p>
                <p className="text-xs text-white/70">{activeTicket.chanceLabel} · one pull per rig</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-widest text-white/60">lifetime VIP</p>
                <p className="text-5xl font-black text-white">${activeTicket.price}</p>
                <p className="text-xs text-white/70 line-through">$115 normal</p>
              </div>
            </div>

            <div className="space-y-1 text-xs text-white/75">
              <p><span className="text-white/50 uppercase tracking-widest">ticket no.</span> <span className="font-mono text-white">{activeTicket.id}</span></p>
              <p><span className="text-white/50 uppercase tracking-widest">rig proof.</span> <span className="font-mono text-white">{activeTicket.rigProof}</span></p>
            </div>

            <div className="rounded-md border border-white/15 bg-black/25 p-3 text-xs text-white/80 leading-snug">
              Screenshot this ticket and show it to Diggy in the MaxxTopia Discord. The ticket
              number and rig proof must match. A copied screenshot cannot be automatically verified
              yet, so redemption is manual and Diggy has the final say.
            </div>

            <div className="flex gap-2">
              <button onClick={copyTicket} className="flex-1 rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15">
                {copied ? 'Copied ticket ✓' : 'Copy ticket details'}
              </button>
              <button onClick={onClose} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:text-white">
                Keep it safe
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
