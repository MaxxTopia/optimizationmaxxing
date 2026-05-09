import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ResearchCard } from '../components/ResearchCard'
import { RESEARCH } from '../lib/research'
import { GAMES, type GameId } from '../lib/games'

/**
 * Curated guides landing page. Replaces the buried-at-bottom-of-Toolkit
 * section. Per-game chip filter on top, search, advanced toggle. Every
 * article gets the per-game callout pill row from <ResearchCard>.
 */
export function Guides() {
  const [searchParams] = useSearchParams()
  const [activeGame, setActiveGame] = useState<GameId | 'any'>(() => {
    const g = searchParams.get('game') as GameId | null
    if (g && GAMES.some((x) => x.id === g)) return g
    return 'any'
  })
  const [search, setSearch] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(true)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return RESEARCH.filter((article) => {
      if (!showAdvanced && article.advanced) return false
      if (activeGame !== 'any') {
        const tagged =
          (article.applicableGames && article.applicableGames.length > 0) ||
          (article.perGameCallouts && Object.keys(article.perGameCallouts).length > 0)
        if (tagged) {
          const inApplicable = article.applicableGames?.includes(activeGame) ?? false
          const inCallouts = !!article.perGameCallouts?.[activeGame]
          if (!inApplicable && !inCallouts) return false
        }
        // Untagged articles are universal — they pass.
      }
      if (q) {
        const hay = `${article.title} ${article.blurb} ${article.badge} ${article.body}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [activeGame, search, showAdvanced])

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">research</p>
          <h1 className="text-2xl font-bold">Guides</h1>
          <p className="text-text-muted text-sm max-w-2xl">
            Vetted guides on the things our catalog can't auto-tune — peripherals,
            BIOS, browsers, OS distros, tournament eligibility. Every claim cited.
            Pick your game to filter callouts and hide guides that don't apply.
          </p>
        </div>
      </header>

      <div className="space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guides by title, body, or topic…"
          className="w-full px-4 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
        />

        <nav className="flex flex-wrap gap-2 items-center">
          <span className="text-text-subtle uppercase tracking-wider text-[10px] mr-1">Game:</span>
          <Chip active={activeGame === 'any'} onClick={() => setActiveGame('any')}>
            any
          </Chip>
          {GAMES.map((g) => (
            <Chip
              key={g.id}
              active={activeGame === g.id}
              onClick={() => setActiveGame(g.id)}
            >
              <span aria-hidden="true">{g.glyph}</span> {g.label}
            </Chip>
          ))}
          <label className="ml-2 flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAdvanced}
              onChange={(e) => setShowAdvanced(e.target.checked)}
              className="accent-accent"
            />
            include advanced (SCEWIN / overclocks)
          </label>
          {(search || activeGame !== 'any' || !showAdvanced) && (
            <button
              onClick={() => {
                setSearch('')
                setActiveGame('any')
                setShowAdvanced(true)
              }}
              className="ml-2 px-2 py-1 text-text-subtle hover:text-text underline text-[11px]"
            >
              clear all
            </button>
          )}
        </nav>

        <div className="text-xs text-text-subtle">
          {filtered.length} of {RESEARCH.length} guides matching
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((article) => (
          <ResearchCard key={article.id} article={article} highlightGame={activeGame} />
        ))}
      </div>
    </div>
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
