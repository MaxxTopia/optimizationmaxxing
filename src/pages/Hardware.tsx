import { useState } from 'react'
import { HARDWARE, type HardwareCategory, type HardwareItem } from '../lib/hardware'

/**
 * /hardware — peripheral advisory. Per-category tier ladder
 * (GOAT / pro / budget) with cited rationale. Bridges the gap between
 * "look at the rig snapshot in /grind" and "actually tell me what to buy".
 *
 * Built to grow: edit `src/lib/hardware.ts`, ship.
 */
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
      </header>

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
