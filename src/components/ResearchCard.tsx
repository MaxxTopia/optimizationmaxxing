import { useState } from 'react'
import { renderMarkdown } from '../lib/md'
import type { ResearchArticle } from '../lib/research'
import { GAMES, type GameId } from '../lib/games'
import { NvpiDownloadsPanel } from './NvpiDownloadsPanel'

/**
 * Collapsible research-article card. Renders the .md body via our
 * inline minimal markdown → HTML pass. Body content is trusted (we
 * author it) — don't feed user content here.
 *
 * Per-game callouts (when present) render as a pill row + an inline
 * "For <Game>:" line above the article body. If `highlightGame` is
 * passed (set by the /guides page game filter), only that game's
 * callout is highlighted.
 */
export function ResearchCard({
  article,
  highlightGame,
}: {
  article: ResearchArticle
  highlightGame?: GameId | 'any'
}) {
  const [open, setOpen] = useState(false)
  const callouts = article.perGameCallouts ?? {}
  const calloutEntries = (Object.entries(callouts) as [GameId, string][])
    .filter(([, body]) => Boolean(body))

  return (
    <article
      id={article.id}
      className={`surface-card overflow-hidden transition-all ${
        open ? 'border-border-glow' : ''
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full p-5 text-left flex items-start justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle mb-1 flex items-center gap-2 flex-wrap">
            <span>{article.badge}</span>
            {article.advanced && (
              <span className="px-1.5 py-0.5 rounded border border-amber-500/50 text-amber-300 bg-amber-500/10">
                advanced
              </span>
            )}
            {calloutEntries.length > 0 && (
              <span className="text-text-subtle">·</span>
            )}
            {calloutEntries.map(([gameId]) => {
              const g = GAMES.find((x) => x.id === gameId)
              if (!g) return null
              const isHighlighted = highlightGame === gameId
              return (
                <span
                  key={gameId}
                  title={callouts[gameId]}
                  className={`px-1.5 py-0.5 rounded border ${
                    isHighlighted
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-border text-text-muted'
                  }`}
                >
                  {g.glyph}
                </span>
              )
            })}
          </p>
          <h3 className="text-lg font-semibold text-text">{article.title}</h3>
          <p className="text-sm text-text-muted mt-1">{article.blurb}</p>
          {highlightGame && highlightGame !== 'any' && callouts[highlightGame as GameId] && (
            <p className="text-xs text-accent mt-2 leading-snug">
              <span className="uppercase tracking-widest text-[10px] mr-1">
                For {GAMES.find((g) => g.id === highlightGame)?.label}:
              </span>
              {callouts[highlightGame as GameId]}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 text-2xl text-text-subtle transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        >
          ›
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5">
          {calloutEntries.length > 0 && (
            <div className="mb-3 space-y-1 text-xs">
              {calloutEntries.map(([gameId, body]) => {
                const g = GAMES.find((x) => x.id === gameId)
                if (!g) return null
                return (
                  <div
                    key={gameId}
                    className="flex items-baseline gap-2 leading-snug"
                  >
                    <span
                      className="shrink-0 uppercase tracking-widest text-[10px] text-text-subtle"
                      style={{ minWidth: '5rem' }}
                    >
                      {g.glyph} {g.label}
                    </span>
                    <span className="text-text-muted">{body}</span>
                  </div>
                )
              })}
            </div>
          )}
          {article.id === 'nvidia-profile-inspector' && (
            <div className="mb-4">
              <NvpiDownloadsPanel />
            </div>
          )}
          <div
            className="research-body text-sm text-text-muted leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
          />
        </div>
      )}
    </article>
  )
}
