import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HARDWARE,
  HARDWARE_LAST_VERIFIED,
  type HardwareCategory,
  type HardwareItem,
  type HardwareSection,
} from '../lib/hardware'
import { detectSpecs, inTauri, type SpecProfile } from '../lib/tauri'

/**
 * /hardware — peripheral + PC-build advisory. Per-category tier ladder
 * (GOAT / pro / budget) with cited rationale. Bridges the gap between
 * "look at the rig snapshot in /grind" and "actually tell me what to buy".
 *
 * Built to grow: edit `src/lib/hardware.ts`, bump HARDWARE_LAST_VERIFIED,
 * ship. The "Build like a pro" hero stack at the top reads the GOAT pick
 * from every PC-build category and renders it as a single shoppable list.
 */
const PC_BUILD_CATEGORIES: HardwareCategory[] = [
  'cpu',
  'gpu',
  'ram',
  'motherboard',
  'storage',
  'cooling',
  'psu',
  'case',
  'networking',
]

export function Hardware() {
  const [active, setActive] = useState<HardwareCategory | 'all'>('all')

  const visible = active === 'all' ? HARDWARE : HARDWARE.filter((s) => s.id === active)

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">advisory</p>
        <h1 className="text-3xl font-bold">Hardware</h1>
        <p className="text-sm text-text-muted max-w-2xl mt-1">
          What the cited pros actually run. Per-category tier ladder so you can answer
          "what should I buy" at $80, $300, or $1500. Sources: ProSettings.net configs +
          rig snapshots from /grind. Aussie Antics' PT background drives the ergonomics
          section.
        </p>
        <p className="text-[11px] text-text-subtle mt-2">
          Last verified <span className="text-accent font-mono">{HARDWARE_LAST_VERIFIED}</span>{' '}
          — evidence review stamp, not a live price feed. Vendor stock and street prices move.
        </p>
      </header>

      <HardwareFitCard />
      <section className="rounded-md border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs text-sky-100 leading-snug">
        <strong className="text-text">How to read the ladder:</strong> vendor pages establish hard
        specifications; linked pro/config pages establish who used a part; independent benchmarks
        establish performance. A pro part is not automatically the best upgrade for your rig, and
        the price bands are not live checkout quotes.
      </section>
      <ProBuildStack />

      <nav className="flex flex-wrap gap-2 items-center">
        <Chip active={active === 'all'} onClick={() => setActive('all')}>
          all
        </Chip>
        {HARDWARE.map((s) => (
          <Chip key={s.id} active={active === s.id} onClick={() => setActive(s.id)}>
            {s.label}
          </Chip>
        ))}
      </nav>

      <div className="space-y-6">
        {visible.map((section) => (
          <section key={section.id} className="space-y-3">
            <div>
              <h2 className="text-xl font-bold">{section.label}</h2>
              <p className="text-sm text-text-muted max-w-2xl">{section.blurb}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.items.map((item) => (
                <ItemCard key={item.name} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-[11px] text-text-subtle pt-3 border-t border-border leading-snug">
        Want a piece of gear added or a tier moved? Drop the name + a cited config or
        review you trust. We don't list anything we can't source.
      </p>
    </div>
  )
}

/**
 * "Build like a pro" hero stack. Walks PC_BUILD_CATEGORIES, lifts the
 * GOAT pick from each, renders them as a single shoppable list with a
 * running total. The point isn't to be a price-tracker (we don't update
 * USD daily) — it's to answer "what's the canonical pro rig right now?"
 * in one card so visitors don't have to scroll the whole category ladder.
 */
function ProBuildStack() {
  const picks = PC_BUILD_CATEGORIES.map((cat) => {
    const section = HARDWARE.find((s) => s.id === cat)
    if (!section) return null
    const goat = section.items.find((it) => it.tier === 'goat')
    if (!goat) return null
    return { section, item: goat }
  }).filter((x): x is { section: HardwareSection; item: HardwareItem } => x !== null)

  return (
    <section
      className="surface-card p-5 md:p-6 space-y-4"
      style={{
        borderColor: 'rgba(255, 215, 0, 0.45)',
        boxShadow: '0 0 24px rgba(255, 215, 0, 0.12)',
      }}
    >
      <header>
        <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
          👑 Build like Peterbot
        </p>
        <h2 className="text-2xl md:text-3xl font-bold mt-1">Pro-tier PC stack — Aug 2026 review</h2>
        <p className="text-sm text-text-muted mt-1 max-w-3xl leading-snug">
          A reference stack for chasing the competitive ceiling — one GOAT pick per category, not
          a claim that one build wins for everyone. Each entry is tied to a cited pro config,
          manufacturer page, or review; pro gear and prices can age. Check fit, thermals, stock,
          and warranty before buying. Scroll below for budget + alternate picks.
        </p>
      </header>

      <div className="space-y-2">
        {picks.map(({ section, item }) => (
          <div
            key={section.id}
            className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                {section.label}
              </p>
              <p className="text-sm font-semibold text-text truncate">{item.name}</p>
              <p className="text-[11px] text-text-muted truncate max-w-2xl">{item.why}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono text-accent">{item.price}</p>
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] underline hover:text-text text-text-muted"
                >
                  vendor ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-text-subtle pt-2 border-t border-border leading-snug">
        Total is approximate — we don't track street prices day-to-day. For the gear half (mouse,
        keyboard, monitor, pad, headset, ergonomics) scroll into the category cards below. Evidence
        review stamp: <span className="font-mono text-accent">{HARDWARE_LAST_VERIFIED}</span>.
      </p>
    </section>
  )
}

function HardwareFitCard() {
  const native = inTauri()
  const [spec, setSpec] = useState<SpecProfile | null>(null)
  const [loading, setLoading] = useState(native)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!native) {
      setLoading(false)
      return
    }
    detectSpecs(false)
      .then(setSpec)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [native])

  return (
    <section className="surface-card p-5 space-y-3 border-l-4 border-l-secondary">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-secondary font-semibold">your fit first</p>
          <h2 className="text-xl font-bold">Does your rig need a new part?</h2>
          <p className="text-sm text-text-muted max-w-3xl mt-1 leading-snug">
            The GOAT stack is a ceiling reference. Your best upgrade depends on the bottleneck,
            laptop limits, memory capacity, and the frame-time evidence from your own machine.
          </p>
        </div>
        <Link to="/asta" className="text-xs underline text-accent hover:text-text shrink-0">
          measure your ceiling ↗
        </Link>
      </div>

      {!native ? (
        <p className="text-xs text-text-subtle border border-border rounded-md px-3 py-2">
          Open the desktop app to read your CPU, GPU, memory, and laptop/desktop profile here.
        </p>
      ) : loading ? (
        <p className="text-xs text-text-muted">Reading your rig…</p>
      ) : error || !spec ? (
        <p className="text-xs text-amber-200 border border-amber-500/40 bg-amber-500/5 rounded-md px-3 py-2">
          We could not read the rig snapshot. You can still browse the sourced ladder; run Match
          Scan or Asta Bench when you want a measured fit call.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <FitMetric label="CPU" value={spec.cpu.marketing || spec.cpu.model || 'Unknown'} />
            <FitMetric label="GPU" value={spec.gpu.model || spec.gpu.vendor || 'Unknown'} />
            <FitMetric label="Memory" value={`${spec.ram.totalGb.toFixed(0)} GB${spec.ram.speedMts ? ` · ${spec.ram.speedMts} MT/s` : ''}`} />
            <FitMetric label="Form factor" value={spec.mobo.isLaptop ? 'Laptop' : 'Desktop'} />
          </div>
          <div className="rounded-md border border-border bg-bg-raised px-3 py-2 text-xs text-text-muted leading-snug">
            {spec.mobo.isLaptop
              ? 'Laptop: prioritize cooling, power mode, memory, and an honest frame-time diagnosis. Desktop GOAT parts may not be upgradeable.'
              : spec.ram.totalGb < 16
              ? 'First move: reach 16 GB in a matched configuration before chasing experimental latency tweaks.'
              : 'Core lane looks viable. Measure CPU/GPU bound time and 1% lows before buying a flagship part.'}
          </div>
        </>
      )}
    </section>
  )
}

function FitMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2 min-w-0">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="text-xs font-semibold text-text truncate" title={value}>{value}</p>
    </div>
  )
}

function ItemCard({ item }: { item: HardwareItem }) {
  return (
    <article className="surface-card p-4 space-y-2 flex flex-col">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-text leading-snug">{item.name}</h3>
        <TierBadge tier={item.tier} />
      </header>
      <p className="text-xs text-text-subtle font-mono">{item.price}</p>
      <p className="text-xs text-text-muted leading-snug flex-1">{item.why}</p>
      {item.citedPro && (
        <p className="text-[11px] text-text-subtle">
          <span className="text-accent">·</span> Run by {item.citedPro}
        </p>
      )}
      {item.caveat && (
        <p className="text-[11px] text-text-muted bg-bg-raised rounded px-2 py-1.5 border border-border">
          <span className="text-accent font-semibold">caveat ·</span> {item.caveat}
        </p>
      )}
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] underline hover:text-text text-accent self-start"
        >
          source ↗
        </a>
      )}
    </article>
  )
}

function TierBadge({ tier }: { tier: HardwareItem['tier'] }) {
  const map = {
    goat: { label: 'GOAT', cls: 'bg-accent text-bg-base' },
    pro: { label: 'pro', cls: 'border border-border text-text-muted' },
    budget: { label: 'budget', cls: 'border border-border text-text-subtle' },
    principle: { label: 'principle', cls: 'border border-border text-text-subtle italic' },
  } as const
  const m = map[tier]
  return (
    <span
      className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded font-semibold ${m.cls}`}
    >
      {m.label}
    </span>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-widest transition border ${
        active
          ? 'bg-accent text-bg-base border-accent'
          : 'bg-bg-card text-text-muted border-border hover:border-border-glow hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
