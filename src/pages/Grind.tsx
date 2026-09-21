import { useMemo, useState } from 'react'
import { GRIND_ENTRIES, GRIND_LAST_REVIEWED, type GrindEntry, type GrindKind } from '../lib/grind'

const KINDS: Array<{ id: GrindKind | 'all'; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'pro', label: 'players' },
  { id: 'creator', label: 'creators' },
]

export function Grind() {
  const [kind, setKind] = useState<GrindKind | 'all'>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return GRIND_ENTRIES.filter((entry) => {
      if (kind !== 'all' && entry.kind !== kind) return false
      if (!normalized) return true
      const snapshotText = entry.snapshot
        ? Object.entries(entry.snapshot).map(([key, value]) => `${key} ${value}`).join(' ')
        : ''
      const haystack = [
        entry.name,
        entry.summary,
        entry.result?.event,
        entry.result?.placement,
        entry.snapshot?.mouse,
        entry.snapshot?.keyboard,
        entry.snapshot?.monitor,
        snapshotText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [kind, query])

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-bold">competitive reference</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-accent via-secondary to-accent bg-clip-text text-transparent">
          Grind
        </h1>
        <p className="text-sm md:text-base text-text-muted max-w-3xl mt-2 leading-relaxed">
          Dated player results and public gear snapshots. Event finishes are not season rankings;
          gear settings are references, not proof of lower latency or better performance.
        </p>
        <p className="text-[11px] text-text-subtle mt-2">
          Source review: <time dateTime={GRIND_LAST_REVIEWED}>{GRIND_LAST_REVIEWED}</time>
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 items-center" aria-label="Filter Grind entries">
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={kind === item.id}
            onClick={() => setKind(item.id)}
            className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-widest transition border ${
              kind === item.id
                ? 'bg-accent text-bg-base border-accent'
                : 'bg-bg-card text-text-muted border-border hover:border-border-glow hover:text-text'
            }`}
          >
            {item.label}
          </button>
        ))}
        <label className="flex-1 min-w-[220px] md:max-w-sm md:ml-auto">
          <span className="sr-only">Search players, events, and equipment</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players, events, or gear"
            className="w-full px-3 py-1.5 rounded-md bg-bg-card border border-border text-xs text-text outline-none focus:border-border-glow"
          />
        </label>
      </nav>

      <div className="space-y-3">
        {filtered.map((entry) => <PlayerCard key={entry.id} entry={entry} />)}
        {filtered.length === 0 && (
          <div className="surface-card p-5 text-sm text-text-muted">
            No entries match that search.
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerCard({ entry }: { entry: GrindEntry }) {
  return (
    <article className="surface-card p-5 space-y-4 border-l-4 border-l-accent">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-bold">
            {entry.kind === 'pro' ? 'player' : 'creator'}
          </p>
          <h2 className="text-2xl font-extrabold tracking-tight">{entry.name}</h2>
          <p className="text-sm text-text-muted">{entry.summary}</p>
        </div>
        {entry.profileUrl && (
          <SourceLink href={entry.profileUrl} label={entry.profileLabel ?? 'Profile'} />
        )}
      </div>

      {entry.result && (
        <section className="pt-3 border-t border-border" aria-label={`${entry.name} event result`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[10px] uppercase tracking-widest text-accent font-bold">
              Event result
            </h3>
            <time className="text-[11px] text-text-subtle" dateTime={entry.result.date}>
              {entry.result.date}
            </time>
          </div>
          <p className="text-sm font-semibold text-text mt-1">{entry.result.event}</p>
          <p className="text-sm text-text">{entry.result.placement}</p>
          <p className="text-[11px] text-text-subtle mt-1">{entry.result.context}</p>
          <SourceLink href={entry.result.sourceUrl} label={entry.result.sourceLabel} />
        </section>
      )}

      {entry.snapshot && <GearSnapshot entry={entry} />}
    </article>
  )
}

function GearSnapshot({ entry }: { entry: GrindEntry }) {
  const snapshot = entry.snapshot
  if (!snapshot) return null

  const items: Array<{ label: string; value?: string | number }> = [
    { label: 'DPI', value: snapshot.dpi },
    { label: 'Polling', value: snapshot.pollingHz ? `${snapshot.pollingHz} Hz` : undefined },
    { label: 'Sensitivity', value: snapshot.sensitivity },
    { label: 'Monitor', value: snapshot.monitor },
    { label: 'Mouse', value: snapshot.mouse },
    { label: 'Keyboard', value: snapshot.keyboard },
    { label: 'Controller', value: snapshot.controller },
  ].filter((item) => item.value !== undefined)

  return (
    <section className="pt-3 border-t border-border" aria-label={`${entry.name} dated gear snapshot`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-widest text-accent font-bold">
          Public gear snapshot
        </h3>
        <time className="text-[11px] text-text-subtle" dateTime={snapshot.updatedAt}>
          Profile date: {snapshot.updatedAt}
        </time>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[10px] uppercase tracking-widest text-text-subtle">{item.label}</dt>
            <dd className="text-xs text-text font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-text-subtle mt-2">
        A dated profile entry; equipment and settings can change and are not a performance test.
      </p>
      <SourceLink href={snapshot.sourceUrl} label={snapshot.sourceLabel} />
    </section>
  )
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-block mt-2 text-[11px] underline text-accent hover:text-text"
    >
      {label} ↗
    </a>
  )
}
