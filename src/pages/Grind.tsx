import { useMemo, useState } from 'react'
import { GRIND_ENTRIES, type GrindEntry, type GrindKind } from '../lib/grind'

/**
 * /grind — curated knowledge channel from the pros + creators who actually
 * know what it costs. Receipts of how the people you're chasing actually
 * train. Per-entry: credential + voice + cited insights + rig snapshot
 * when public.
 *
 * Tier visual weight: 'goat' gets the centerpiece treatment (Peterbot today).
 * 'top' gets normal cards. 'standard' is reserved for future scaling-down
 * entries we add but don't want hogging top-of-page.
 */
const KINDS: Array<{ id: GrindKind | 'all'; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'pro', label: 'pros' },
  { id: 'creator', label: 'creators' },
  { id: 'podcast', label: 'podcasts' },
]

export function Grind() {
  const [kind, setKind] = useState<GrindKind | 'all'>('all')

  const filtered = useMemo(() => {
    if (kind === 'all') return GRIND_ENTRIES
    return GRIND_ENTRIES.filter((e) => e.kind === kind)
  }, [kind])

  const goat = filtered.find((e) => e.tier === 'goat')
  const rest = filtered.filter((e) => e.tier !== 'goat')

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">channel</p>
        <h1 className="text-3xl font-bold">Grind</h1>
        <p className="text-text-muted text-sm max-w-2xl mt-1">
          Receipts. Not vibes. Curated insights from the pros + creators actually winning right
          now — Peterbot, Veno, Aussie, Mongraal, Clix, Reet, Bugha. Every claim cites a real
          source. Built to grow as more interviews + podcasts drop.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 items-center">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-widest transition border ${
              kind === k.id
                ? 'bg-accent text-bg-base border-accent'
                : 'bg-bg-card text-text-muted border-border hover:border-border-glow hover:text-text'
            }`}
          >
            {k.label}
          </button>
        ))}
      </nav>

      {goat && kind === 'all' && <GoatCard entry={goat} />}

      <div className="space-y-4">
        {rest.map((e) => (
          <GrindCard key={e.id} entry={e} />
        ))}
        {kind !== 'all' && goat && <GrindCard entry={goat} />}
      </div>

      <p className="text-[11px] text-text-subtle pt-3 border-t border-border leading-snug">
        Want a creator added? Drop the name + a link to one cited interview where they say
        something concrete. We don\'t add anyone whose insights we can\'t source.
      </p>
    </div>
  )
}

function GoatCard({ entry }: { entry: GrindEntry }) {
  return (
    <section
      className="surface-card p-6 md:p-8 relative overflow-hidden"
      style={{
        borderColor: 'rgba(255, 215, 0, 0.45)',
        boxShadow: '0 0 28px rgba(255, 215, 0, 0.18)',
      }}
    >
      <div className="hero-gradient pointer-events-none opacity-40" />
      <div className="relative">
        <p
          className="text-[10px] uppercase tracking-widest mb-1 font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
          style={{
            background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #cc9900 100%)',
            color: '#3a2a00',
            border: '1px solid rgba(255, 215, 0, 0.65)',
          }}
        >
          <span aria-hidden="true">👑</span> THE GOAT
        </p>
        <h2 className="text-3xl md:text-4xl font-bold mt-2">{entry.name}</h2>
        <p className="text-sm text-text-muted mt-1">{entry.credential}</p>
        <p className="text-base text-text mt-4 leading-relaxed max-w-3xl italic">
          "{entry.voice}"
        </p>
        <RigSnapshot entry={entry} />
        <Insights entry={entry} />
        {entry.link && (
          <a
            href={entry.link}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-4 text-xs underline hover:text-text text-accent"
          >
            {entry.link} ↗
          </a>
        )}
      </div>
    </section>
  )
}

function GrindCard({ entry }: { entry: GrindEntry }) {
  return (
    <article className="surface-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">
            {entry.kind} · {entry.games.join(' · ')}
          </p>
          <h3 className="text-xl font-bold">{entry.name}</h3>
          <p className="text-xs text-text-muted">{entry.credential}</p>
        </div>
        {entry.link && (
          <a
            href={entry.link}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] underline hover:text-text text-accent"
          >
            visit ↗
          </a>
        )}
      </div>
      <p className="text-sm text-text leading-relaxed italic">"{entry.voice}"</p>
      <RigSnapshot entry={entry} />
      <Insights entry={entry} />
    </article>
  )
}

function RigSnapshot({ entry }: { entry: GrindEntry }) {
  if (!entry.rig) return null
  const items = [
    entry.rig.dpi && { label: 'DPI', value: entry.rig.dpi },
    entry.rig.sensitivity && { label: 'Sens', value: entry.rig.sensitivity },
    entry.rig.pollingHz && { label: 'Poll', value: `${entry.rig.pollingHz} Hz` },
    entry.rig.monitor && { label: 'Monitor', value: entry.rig.monitor },
    entry.rig.mouse && { label: 'Mouse', value: entry.rig.mouse },
    entry.rig.keyboard && { label: 'Keyboard', value: entry.rig.keyboard },
  ].filter(Boolean) as Array<{ label: string; value: string }>
  if (items.length === 0) return null
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-border">
      {items.map((it) => (
        <div key={it.label}>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">{it.label}</p>
          <p className="text-xs font-semibold tabular-nums">{it.value}</p>
        </div>
      ))}
    </div>
  )
}

function Insights({ entry }: { entry: GrindEntry }) {
  if (!entry.insights || entry.insights.length === 0) return null
  return (
    <ul className="space-y-2 mt-3">
      {entry.insights.map((ins, i) => (
        <li key={i} className="flex gap-2 text-sm text-text-muted leading-snug">
          <span className="text-accent shrink-0">▸</span>
          <span>
            {ins.text}
            {ins.citation && (
              <span className="block text-[11px] text-text-subtle mt-0.5">
                — {ins.citation.url ? (
                  <a
                    href={ins.citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-text"
                  >
                    {ins.citation.label} ↗
                  </a>
                ) : (
                  ins.citation.label
                )}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
