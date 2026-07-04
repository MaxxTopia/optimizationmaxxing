import { CHANGELOG } from '../lib/changelog'

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string) || '0.1.25'

export function Changelog() {
  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-accent font-bold">what changed</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-accent via-secondary to-accent bg-clip-text text-transparent">
          Updates
        </h1>
        <p className="text-base text-text mt-2 font-medium">
          You're on <span className="text-accent font-bold">v{APP_VERSION}</span>. Latest first — every
          release explained.
        </p>
      </header>
      <div className="space-y-5">
        {CHANGELOG.map((e, idx) => (
          <section key={e.version} className="surface-card p-5 border-l-4 border-l-accent">
            <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
              <h2 className="text-2xl font-extrabold text-accent tracking-tight flex items-center gap-2">
                v{e.version}
                {idx === 0 && (
                  <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-accent text-bg-base">
                    latest
                  </span>
                )}
              </h2>
              <span className="text-xs text-text-muted font-semibold tabular-nums">{e.date}</span>
            </div>
            <ul className="space-y-2.5">
              {e.highlights.map((h, i) => (
                <li key={i} className="flex gap-3 text-[15px] md:text-base text-text leading-relaxed font-medium">
                  <span className="text-accent text-lg leading-none shrink-0" aria-hidden="true">▸</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
