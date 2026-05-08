import { CHANGELOG } from '../lib/changelog'

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string) || '0.1.25'

export function Changelog() {
  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">history</p>
        <h1 className="text-2xl font-bold">Changelog</h1>
        <p className="text-sm text-text-muted">
          Currently running v{APP_VERSION}. Newest changes first.
        </p>
      </header>
      <div className="space-y-5">
        {CHANGELOG.map((e) => (
          <section key={e.version} className="surface-card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-bold text-accent">v{e.version}</h2>
              <span className="text-xs text-text-subtle">{e.date}</span>
            </div>
            <ul className="list-disc list-inside text-sm text-text-muted space-y-1.5">
              {e.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
