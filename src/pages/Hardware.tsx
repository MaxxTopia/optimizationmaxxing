import { useState } from 'react'
import {
  HARDWARE,
  HARDWARE_LAST_VERIFIED,
  type HardwareCategory,
  type HardwareItem,
  type HardwareSection,
} from '../lib/hardware'

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
          — picks bump per release as new flagships drop.
        </p>
      </header>

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
        <h2 className="text-2xl md:text-3xl font-bold mt-1">Pro-tier PC stack — May 2026</h2>
        <p className="text-sm text-text-muted mt-1 max-w-3xl leading-snug">
          The current canonical pro-Fortnite rig — one GOAT pick per category. Every entry is
          something at least one active FNCS pro currently runs, sourced from /grind + ProSettings.
          Prices are approximate USD MSRP; check vendors at purchase time. Scroll to the category
          sections below for budget + alt picks at every tier.
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
        keyboard, monitor, pad, headset, ergonomics) scroll into the category cards below. Picks
        bump when a new flagship lands; current revision <span className="font-mono text-accent">{HARDWARE_LAST_VERIFIED}</span>.
      </p>
    </section>
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
