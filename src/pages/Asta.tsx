import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useIsVip } from '../store/useVipStore'
import { applyBatch, listApplied, type BatchItem } from '../lib/tauri'
import { catalog } from '../lib/catalog'
import { presetById } from '../lib/presets'
import { TournamentAudit } from '../components/TournamentAudit'

/**
 * /asta — the manifesto + apply page for Asta Mode. Browsable for
 * non-VIP users (so they see what they could unlock — that's the upsell),
 * but Apply is hard-gated behind the existing VIP store.
 */

const QUOTES = [
  '"I will surpass my limits."',
  '"It\'s not the gear. It\'s who refuses to lose."',
  '"We don\'t move because we think we can win. We move because the version of me that gives up is someone we refuse to meet."',
  '"Every drop of sweat and every scar can\'t become a lie."',
] as const

const ASTA_PHILOSOPHY = `Born without magic into a world full of it. Black robe, white hair, no cheat
codes. Just a kid swinging a sword that shouldn't even cut.

He won by refusing to lose more times than the world refused to let him in.
That's the model.

This mode is for the kids on a 1660 Ti and a 144 Hz IPS who still plan to
make Champion League. Asta Mode pushes every software lever this app can
reach — the polite Tournament FPS preset, but louder. ~12-22 ms off your
click-to-pixel, ~25-35 average FPS in Fortnite endgames, ~12-20 1% lows
on a tuned stock-to-mid budget rig. Reaches 70% of the gap to a $5K rig.
The other 30% is silicon lottery + monitor refresh + ISP geography.

What's left after Asta Mode is BIOS (RAM tightening, CO undervolt) and the
grind layer (sleep, warmups, sessions). Those have their own pages.`

export function Asta() {
  const isVip = useIsVip()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<{ count: number; ts: string } | null>(null)
  const [quoteIdx, setQuoteIdx] = useState(0)

  // Rotate quotes on click of the manifesto block — small easter egg.
  function bumpQuote() {
    setQuoteIdx((i) => (i + 1) % QUOTES.length)
  }

  async function handleApply() {
    if (!isVip) return
    setBusy(true)
    setError(null)
    try {
      const preset = presetById('asta-mode')
      if (!preset) {
        setError('Asta Mode preset not found in catalog. Update v1.json.')
        return
      }
      const tweaks = preset.tweakIds
        .map((id) => catalog.tweaks.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
      const items: BatchItem[] = []
      for (const t of tweaks) {
        for (const action of t.actions) {
          items.push({ tweakId: t.id, action })
        }
      }
      await applyBatch(items)
      const list = await listApplied().catch(() => [])
      setApplied({
        count: list.filter((a) => a.status === 'applied').length,
        ts: new Date().toLocaleTimeString(),
      })
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as Error).message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <Hero />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 surface-card p-6 space-y-4">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">manifesto</p>
          <h2
            className="text-2xl font-bold leading-tight"
            style={{ fontFamily: "'Pirata One', 'Cinzel', serif" }}
          >
            We don't quit. So we built the mode.
          </h2>
          <p
            onClick={bumpQuote}
            title="(click for another quote)"
            className="text-base leading-relaxed text-text italic cursor-pointer select-none"
            style={{ fontFamily: "'Cinzel', 'Cormorant Garamond', serif" }}
          >
            {QUOTES[quoteIdx]}
          </p>
          <pre className="text-sm leading-relaxed text-text-muted whitespace-pre-wrap font-sans">
            {ASTA_PHILOSOPHY}
          </pre>
        </div>

        <div className="surface-card p-6 space-y-3 relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(201, 31, 55, 0.4) 0%, transparent 60%)',
            }}
          />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-widest text-text-subtle">apply</p>
            <h3 className="text-xl font-bold mt-1">Activate Asta Mode</h3>
            <p className="text-sm text-text-muted leading-snug mt-1">
              One UAC prompt. ~30 tweaks applied: Engine.ini + GameUserSettings.ini hand-tunes,
              HAGS, Reflex registry force, kernel Game DVR off, expanded service kills, expanded
              hosts blocks. Snapshot-backed — every tweak reverts via Settings → Restore Point.
            </p>

            {!isVip && (
              <div className="mt-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug">
                <strong>VIP required.</strong> Open <Link to="/pricing" className="underline">
                Pricing</Link>, tap the $8 price 5 times within 3 seconds, paste a code from
                Diggy.
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            {applied && (
              <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                Applied at {applied.ts}. {applied.count} tweaks active. Run Asta Bench to see
                the delta.
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleApply}
                disabled={busy || !isVip}
                className="btn-chrome w-full px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={
                  isVip
                    ? {
                        background:
                          'linear-gradient(135deg, #c91f37 0%, #7a0a1a 60%, #04020a 100%)',
                        color: '#f0e4d8',
                        border: '1px solid rgba(201, 31, 55, 0.65)',
                        boxShadow: '0 0 18px rgba(201, 31, 55, 0.3)',
                      }
                    : {
                        background:
                          'linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #cc9900 100%)',
                        color: '#3a2a00',
                        border: '1px solid rgba(255, 215, 0, 0.65)',
                      }
                }
              >
                {busy ? 'Applying…' : isVip ? '🗡 Activate Asta Mode' : '👑 VIP only'}
              </button>
              <Link
                to="/benchmark"
                className="text-center text-xs text-text-muted hover:text-text border border-border rounded-md px-3 py-1.5 hover:border-border-glow transition"
              >
                Run Asta Bench (before / after)
              </Link>
            </div>
          </div>
        </div>
      </section>

      <TournamentAudit />

      <section className="surface-card p-6 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">whats next</p>
        <h3 className="text-lg font-semibold">After Asta Mode</h3>
        <p className="text-sm text-text-muted leading-snug max-w-3xl">
          Software ceiling reached. The remaining 30% is hardware-or-grind. Both have a page.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <NextCard
            title="RAM tightening recipe"
            body="Read your SPD, identify your IC type, generate a 'type these into BIOS' recipe. Read-only — we never auto-flash."
            cta="Open /diagnostics"
            href="/diagnostics"
          />
          <NextCard
            title="The grind layer"
            body="Sleep, warmup routines, session cadence — what Aussie Antics, Bugha, Clix, Mongraal actually do daily."
            cta="Open /grind"
            href="/grind"
          />
          <NextCard
            title="Latency budget"
            body="The cited per-layer breakdown. What we can move + what's hard cap."
            cta="Open /guides"
            href="/guides"
          />
        </div>
      </section>
    </div>
  )
}

function Hero() {
  return (
    <section
      className="relative overflow-hidden rounded-2xl p-8 md:p-12"
      style={{
        background:
          'radial-gradient(circle at 18% 25%, rgba(201, 31, 55, 0.22) 0%, transparent 45%), radial-gradient(circle at 82% 75%, rgba(89, 13, 26, 0.5) 0%, transparent 55%), #040003',
        border: '1px solid rgba(201, 31, 55, 0.35)',
        boxShadow: '0 0 28px rgba(201, 31, 55, 0.18)',
      }}
    >
      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.3em] text-asta-bone-soft mb-2">
          Asta Mode
        </p>
        <h1
          className="text-4xl md:text-6xl font-bold leading-none"
          style={{
            fontFamily: "'Pirata One', 'Cinzel', serif",
            color: '#f0e4d8',
            textShadow:
              '0 0 16px rgba(201, 31, 55, 0.45), 0 0 36px rgba(89, 13, 26, 0.7)',
          }}
        >
          Push the rig to its limit.
        </h1>
        <p
          className="mt-4 max-w-2xl text-base md:text-lg leading-snug"
          style={{
            fontFamily: "'Cinzel', 'Cormorant Garamond', serif",
            color: '#b9a487',
            letterSpacing: '0.01em',
          }}
        >
          For the kids on stock rigs born to chase pros they shouldn't be able to catch.
          70% of the gap is software. We close it.
        </p>
      </div>

      <style>{`
        .text-asta-bone-soft { color: #b9a487; }
      `}</style>
    </section>
  )
}

function NextCard({
  title,
  body,
  cta,
  href,
}: {
  title: string
  body: string
  cta: string
  href: string
}) {
  return (
    <Link
      to={href}
      className="surface-card p-4 block hover:border-border-glow transition"
    >
      <h4 className="text-base font-semibold">{title}</h4>
      <p className="text-xs text-text-muted leading-snug mt-1">{body}</p>
      <p className="text-[11px] text-accent mt-2 underline-offset-2 group-hover:underline">
        {cta} →
      </p>
    </Link>
  )
}
