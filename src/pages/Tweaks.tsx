import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TweakRow } from '../components/TweakRow'
import { SuggestTweakModal } from '../components/SuggestTweakModal'
import { TweakPreviewDrawer, type ResolvedPreview } from '../components/TweakPreviewDrawer'
import { RiskLegend } from '../components/RiskLegend'
import { auditMany, type TweakAudit } from '../lib/audit'
import { catalog, tweakRequiresAdmin, type TweakCategory, type TweakRecord } from '../lib/catalog'
import { GAMES, type GameId } from '../lib/games'
import { useIsVip } from '../store/useVipStore'
import { runBench, score } from '../lib/astaBench'
import { saveImpact } from '../lib/benchImpact'
import {
  applyBatch,
  inTauri,
  listApplied,
  previewTweak,
  revertTweak,
  type AppliedTweak,
  type BatchItem,
} from '../lib/tauri'

/**
 * Catalog browser. Reads the v1.json bundled catalog, filters by category +
 * VIP-gate + applied-state, and dispatches Apply/Preview/Revert through the
 * engine. Mirror of hone.gg's "Your Optimizations" toggle list but with
 * per-tweak risk + admin badges and full Diggy-curated descriptions.
 */
export function Tweaks() {
  const [appliedById, setAppliedById] = useState<Record<string, AppliedTweak>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [measuringId, setMeasuringId] = useState<string | null>(null)
  const [measureNotice, setMeasureNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ResolvedPreview | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<TweakCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [searchParams] = useSearchParams()
  const [activeGame, setActiveGame] = useState<GameId | 'any'>(() => {
    // Deep-link: /tweaks?game=fortnite (used by Dashboard QuickStart). Falls
    // back to 'any' if the param is absent or not a known game id.
    const g = searchParams.get('game') as GameId | null
    if (g && GAMES.some((x) => x.id === g)) return g
    return 'any'
  })
  const [hideTournamentBreaking, setHideTournamentBreaking] = useState(false)
  const [riskFilter, setRiskFilter] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [adminFilter, setAdminFilter] = useState<'all' | 'admin' | 'no-admin'>('all')
  const [appliedFilter, setAppliedFilter] = useState<'all' | 'applied' | 'not-applied'>('all')
  const [auditByTweakId, setAuditByTweakId] = useState<Record<string, TweakAudit>>({})
  const [auditFilter, setAuditFilter] = useState<'all' | 'matches' | 'differs' | 'partial'>('all')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null)

  const isVip = useIsVip()

  async function refreshApplied() {
    try {
      const list = await listApplied()
      const byId: Record<string, AppliedTweak> = {}
      for (const a of list) {
        if (a.status === 'applied' && !byId[a.tweakId]) {
          byId[a.tweakId] = a
        }
      }
      setAppliedById(byId)
    } catch (e) {
      // Vite-only mode: leave empty.
    }
  }

  useEffect(() => {
    refreshApplied()
  }, [])

  const categories = useMemo(() => {
    const set = new Set<TweakCategory>()
    catalog.tweaks.forEach((t) => set.add(t.category))
    return Array.from(set)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog.tweaks.filter((t) => {
      if (activeCategory !== 'all' && t.category !== activeCategory) return false
      // Per-game filter — universal tweaks (no applicableGames or empty array)
      // pass every game filter. Tagged tweaks pass only if the chosen game is
      // listed.
      if (activeGame !== 'any') {
        const tagged = t.applicableGames && t.applicableGames.length > 0
        if (tagged && !t.applicableGames!.includes(activeGame)) return false
      }
      if (hideTournamentBreaking && activeGame !== 'any') {
        const verdict = t.tournamentCompliance?.[activeGame]
        if (verdict === 'breaks') return false
      }
      if (riskFilter !== 0 && t.riskLevel !== riskFilter) return false
      if (adminFilter !== 'all') {
        const needsAdmin = tweakRequiresAdmin(t)
        if (adminFilter === 'admin' && !needsAdmin) return false
        if (adminFilter === 'no-admin' && needsAdmin) return false
      }
      if (appliedFilter !== 'all') {
        const isApplied = !!appliedById[t.id]
        if (appliedFilter === 'applied' && !isApplied) return false
        if (appliedFilter === 'not-applied' && isApplied) return false
      }
      if (auditFilter !== 'all') {
        const a = auditByTweakId[t.id]
        if (!a) return false
        if (auditFilter === 'matches' && a.status !== 'matches') return false
        if (auditFilter === 'differs' && a.status !== 'differs') return false
        if (auditFilter === 'partial' && a.status !== 'partial') return false
      }
      if (q) {
        const hay = `${t.title} ${t.description} ${t.rationale} ${t.category} ${t.id}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [activeCategory, activeGame, hideTournamentBreaking, search, riskFilter, adminFilter, appliedFilter, appliedById, auditFilter, auditByTweakId])

  async function handleScan() {
    if (!inTauri()) {
      setError('Scan requires the optimizationmaxxing.exe shell — open the desktop app.')
      return
    }
    setError(null)
    setScanning(true)
    setScanProgress({ done: 0, total: catalog.tweaks.length })
    try {
      const result = await auditMany(catalog.tweaks, (done, total) =>
        setScanProgress({ done, total }),
      )
      setAuditByTweakId(result)
    } catch (e) {
      setError(formatErr(e))
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }

  async function handleApply(t: TweakRecord) {
    setBusyId(t.id)
    setError(null)
    try {
      // Multi-action tweak → batched apply, one UAC for the whole tweak.
      const items: BatchItem[] = t.actions.map((action) => ({
        tweakId: t.id,
        action,
      }))
      await applyBatch(items)
      await refreshApplied()
    } catch (e) {
      setError(formatErr(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleRevert(t: TweakRecord) {
    setBusyId(t.id)
    setError(null)
    try {
      // Revert all receipts for this tweak.
      const list = await listApplied()
      const ours = list.filter((a) => a.tweakId === t.id && a.status === 'applied')
      for (const a of ours.reverse()) {
        await revertTweak(a.receiptId)
      }
      await refreshApplied()
    } catch (e) {
      setError(formatErr(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleMeasureImpact(t: TweakRecord) {
    if (!inTauri()) {
      setError('Measure-impact requires the optimizationmaxxing.exe shell.')
      return
    }
    setMeasuringId(t.id)
    setMeasureNotice(`📏 ${t.title} — running before-bench…`)
    setError(null)
    try {
      const before = score(await runBench())
      setMeasureNotice(`📏 ${t.title} — applying tweak…`)
      const items: BatchItem[] = t.actions.map((action) => ({ tweakId: t.id, action }))
      await applyBatch(items)
      await refreshApplied()
      // Brief settle for caches + scheduler.
      setMeasureNotice(`📏 ${t.title} — settling 4 s before re-bench…`)
      await new Promise((r) => setTimeout(r, 4000))
      setMeasureNotice(`📏 ${t.title} — running after-bench…`)
      const after = score(await runBench())
      saveImpact({
        tweakId: t.id,
        ts: new Date().toISOString(),
        beforeComposite: before.composite,
        afterComposite: after.composite,
        delta: after.composite - before.composite,
        cpuDeltaNs: after.cpu.nsPerIter - before.cpu.nsPerIter,
        dpcDelta: after.dpc.totalDpcPercent - before.dpc.totalDpcPercent,
        pingStddevDelta: (after.ping.stddevMs ?? 0) - (before.ping.stddevMs ?? 0),
        framePaceStddevDelta: after.framePaceStddevMs - before.framePaceStddevMs,
      })
      const delta = after.composite - before.composite
      const sign = delta >= 0 ? '+' : ''
      setMeasureNotice(
        `📏 ${t.title} measured: ${before.composite.toFixed(0)} → ${after.composite.toFixed(0)} (${sign}${delta.toFixed(1)})`,
      )
    } catch (e) {
      setError(formatErr(e))
      setMeasureNotice(null)
    } finally {
      setMeasuringId(null)
    }
  }

  async function handlePreview(t: TweakRecord) {
    setBusyId(t.id)
    setError(null)
    try {
      const previews = await Promise.all(t.actions.map((a) => previewTweak(a)))
      setPreview({
        tweak: t,
        actions: t.actions.map((action, i) => ({ action, preview: previews[i] })),
      })
    } catch (e) {
      setError(formatErr(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">catalog</p>
          <h1 className="text-2xl font-bold">Tweaks</h1>
          <p className="text-text-muted text-sm">
            {catalog.tweaks.length} curated · {catalog.version}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            title="Compare every catalog tweak against your current rig — surfaces which ones are already at target and which would change something."
            className="px-3 py-1.5 rounded-md border border-border text-sm hover:border-border-glow disabled:opacity-50"
          >
            {scanning && scanProgress
              ? `Scanning ${scanProgress.done}/${scanProgress.total}…`
              : Object.keys(auditByTweakId).length > 0
              ? 'Re-scan rig'
              : 'Scan rig state'}
          </button>
          <button
            onClick={() => setSuggestOpen(true)}
            className="px-3 py-1.5 rounded-md border border-border text-sm hover:border-border-glow"
          >
            Suggest a tweak
          </button>
        </div>
      </header>

      <div className="space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, description, ID, or category..."
          className="w-full px-4 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
        />

        <nav className="flex flex-wrap gap-2 items-center">
          <span className="text-text-subtle uppercase tracking-wider text-[10px] mr-1">Game:</span>
          <CategoryChip active={activeGame === 'any'} onClick={() => setActiveGame('any')}>
            any
          </CategoryChip>
          {GAMES.map((g) => {
            const count = catalog.tweaks.filter(
              (t) => !t.applicableGames || t.applicableGames.length === 0 || t.applicableGames.includes(g.id),
            ).length
            return (
              <CategoryChip
                key={g.id}
                active={activeGame === g.id}
                onClick={() => setActiveGame(g.id)}
              >
                <span aria-hidden="true">{g.glyph}</span> {g.label} ({count})
              </CategoryChip>
            )
          })}
          {activeGame !== 'any' && (
            <label className="ml-2 flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideTournamentBreaking}
                onChange={(e) => setHideTournamentBreaking(e.target.checked)}
                className="accent-accent"
              />
              hide tournament-breaking
            </label>
          )}
        </nav>

        <nav className="flex flex-wrap gap-2">
          <CategoryChip
            active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          >
            All ({catalog.tweaks.length})
          </CategoryChip>
          {categories.map((c) => {
            const count = catalog.tweaks.filter((t) => t.category === c).length
            return (
              <CategoryChip
                key={c}
                active={activeCategory === c}
                onClick={() => setActiveCategory(c)}
              >
                {c} ({count})
              </CategoryChip>
            )
          })}
        </nav>

        <div className="flex flex-wrap gap-2 text-xs items-center">
          <FilterGroup label="Risk">
            {([0, 1, 2, 3, 4] as const).map((r) => {
              const labels: Record<number, string> = { 0: 'any tier', 1: 'Safe', 2: 'Standard', 3: 'Expert', 4: 'Extreme' }
              return (
                <FilterChip
                  key={r}
                  active={riskFilter === r}
                  onClick={() => setRiskFilter(r)}
                  title={labels[r]}
                >
                  {r === 0 ? 'any' : `${r}`}
                </FilterChip>
              )
            })}
            <RiskLegend />
          </FilterGroup>
          <FilterGroup label="Admin">
            {(['all', 'admin', 'no-admin'] as const).map((a) => (
              <FilterChip
                key={a}
                active={adminFilter === a}
                onClick={() => setAdminFilter(a)}
              >
                {a}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label="State">
            {(['all', 'applied', 'not-applied'] as const).map((a) => (
              <FilterChip
                key={a}
                active={appliedFilter === a}
                onClick={() => setAppliedFilter(a)}
              >
                {a}
              </FilterChip>
            ))}
          </FilterGroup>
          {Object.keys(auditByTweakId).length > 0 && (
            <FilterGroup label="On-rig">
              {(['all', 'matches', 'partial', 'differs'] as const).map((a) => (
                <FilterChip
                  key={a}
                  active={auditFilter === a}
                  onClick={() => setAuditFilter(a)}
                >
                  {a === 'all' ? 'any' : a === 'matches' ? '✓ already' : a === 'partial' ? '◐ partial' : '✗ would change'}
                </FilterChip>
              ))}
            </FilterGroup>
          )}
          {(search || riskFilter !== 0 || adminFilter !== 'all' || appliedFilter !== 'all' || auditFilter !== 'all' || activeCategory !== 'all' || activeGame !== 'any' || hideTournamentBreaking) && (
            <button
              onClick={() => {
                setSearch('')
                setRiskFilter(0)
                setAdminFilter('all')
                setAppliedFilter('all')
                setAuditFilter('all')
                setActiveCategory('all')
                setActiveGame('any')
                setHideTournamentBreaking(false)
              }}
              className="px-2 py-1 text-text-subtle hover:text-text underline"
            >
              clear all
            </button>
          )}
        </div>

        <div className="text-xs text-text-subtle">
          {filtered.length} of {catalog.tweaks.length} matching
        </div>

        {Object.keys(auditByTweakId).length > 0 && (() => {
          const all = Object.values(auditByTweakId)
          const matches = all.filter((a) => a.status === 'matches').length
          const differs = all.filter((a) => a.status === 'differs').length
          const partial = all.filter((a) => a.status === 'partial').length
          const unknown = all.filter((a) => a.status === 'unknown').length
          return (
            <div className="surface-card px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-text-subtle uppercase tracking-widest">Last scan</span>
              <span className="text-emerald-400">✓ {matches} already set</span>
              <span className="text-accent">✗ {differs} would change</span>
              {partial > 0 && <span className="text-text-muted">◐ {partial} partial</span>}
              {unknown > 0 && <span className="text-text-subtle">? {unknown} unknown</span>}
            </div>
          )
        })()}
      </div>

      {error && (
        <div className="surface-card p-3 text-sm text-accent">{error}</div>
      )}

      {measureNotice && (
        <div className="surface-card p-3 text-sm text-text-muted border border-border-glow">
          {measureNotice}
          <button
            onClick={() => setMeasureNotice(null)}
            className="ml-3 text-text-subtle hover:text-text underline text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      {preview && <TweakPreviewDrawer preview={preview} onClose={() => setPreview(null)} />}

      <div className="space-y-2">
        {filtered.map((t) => (
          <TweakRow
            key={t.id}
            tweak={t}
            applied={!!appliedById[t.id]}
            busy={busyId === t.id || measuringId === t.id}
            isVip={isVip}
            audit={auditByTweakId[t.id]}
            onApply={() => handleApply(t)}
            onRevert={() => handleRevert(t)}
            onPreview={() => handlePreview(t)}
            onMeasureImpact={() => handleMeasureImpact(t)}
            measuring={measuringId === t.id}
          />
        ))}
      </div>

      <SuggestTweakModal open={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </div>
  )
}

function CategoryChip({
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

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-text-subtle uppercase tracking-wider mr-1">{label}:</span>
      <div className="flex gap-1">{children}</div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-0.5 rounded transition border ${
        active
          ? 'bg-accent text-bg-base border-accent'
          : 'bg-bg-card text-text-muted border-border hover:border-border-glow'
      }`}
    >
      {children}
    </button>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
