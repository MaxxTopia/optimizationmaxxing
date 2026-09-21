import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HARDWARE,
  HARDWARE_COPY_REVIEWED,
  type HardwareCategory,
  type HardwareItem,
} from '../lib/hardware'
import { useRigStore } from '../store/useRigStore'

/**
 * /hardware — sourced component candidates, not a tested one-size-fits-all build.
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
          Component candidates with linked sources. Pro settings show personal preference, not
          proven performance; match parts to your measured bottleneck, budget, and platform.
        </p>
        <p className="text-[11px] text-text-subtle mt-2">
          Copy reviewed <span className="text-accent font-mono">{HARDWARE_COPY_REVIEWED}</span>{' '}
          — not a live price, stock, or benchmark feed.
        </p>
      </header>

      <HardwareFitCard />
      <section className="rounded-md border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs text-sky-100 leading-snug">
        <strong className="text-text">How to read the ladder:</strong> vendor pages establish hard
        specifications; linked pro/config pages establish who used a part; independent benchmarks
        establish performance. A pro part is not automatically the best upgrade for your rig, and
        the price bands are not live checkout quotes.
      </section>
      <section className="rounded-md border border-border bg-bg-card/50 px-3 py-2 text-xs text-text-muted leading-snug">
        There is no verified universal “best Fortnite build” here. Compare a candidate part using
        current independent game benchmarks and your own CPU/GPU-bound frame-time evidence; check
        motherboard support, cooling, PSU, warranty, and live pricing before buying.
      </section>

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

function HardwareFitCard() {
  const spec = useRigStore((s) => s.spec)
  const status = useRigStore((s) => s.status)
  const error = useRigStore((s) => s.error)
  const ensureLoaded = useRigStore((s) => s.ensureLoaded)
  const refresh = useRigStore((s) => s.refresh)
  const loading = status === 'idle' || status === 'loading'

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

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
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="text-xs underline text-accent hover:text-text disabled:opacity-40"
          >
            {loading ? 'reading…' : 're-scan rig'}
          </button>
          <Link to="/asta" className="text-xs underline text-accent hover:text-text">
            measure your ceiling ↗
          </Link>
        </div>
      </div>

      {status === 'unavailable' ? (
        <p className="text-xs text-text-subtle border border-border rounded-md px-3 py-2">
          Open the desktop app to read your CPU, GPU, memory, and laptop/desktop profile here.
        </p>
      ) : loading ? (
        <p className="text-xs text-text-muted">Reading your rig…</p>
      ) : error || !spec ? (
        <p className="text-xs text-amber-200 border border-amber-500/40 bg-amber-500/5 rounded-md px-3 py-2">
          We could not read the rig snapshot{error ? `: ${error}` : ''}. You can still browse the
          sourced ladder; run Match Scan or Asta Bench when you want a measured fit call.
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
      {item.priceUrl ? (
        <a
          href={item.priceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-text-subtle font-mono hover:text-accent hover:underline self-start"
          aria-label={`Check current manufacturer price for ${item.name}`}
        >
          {item.price}
        </a>
      ) : (
        <p className="text-xs text-text-subtle font-mono">{item.price}</p>
      )}
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
