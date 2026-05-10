import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { auditMany, type TweakAudit } from '../lib/audit'
import { catalog, type TweakRecord } from '../lib/catalog'
import { inTauri, listApplied, type AppliedTweak } from '../lib/tauri'

/**
 * /diff — every active mod from a vanilla Windows in one table.
 *
 * Reads listApplied() from the snapshot store + audits each applied
 * tweak's actions against current registry/BCD state. Each row shows:
 *   - the tweak title + category + risk
 *   - applied-at timestamp
 *   - per-action state badge (✓ already matches target / ✗ would revert /
 *     ◐ partial / ? unknown for PS scripts)
 *   - one-click "copy as text" so users can share their tune in DMs.
 *
 * Distinct from the audit on /tweaks: that one scans the whole catalog
 * for "what could I apply?". This one scans only the active set for
 * "what's currently modified vs vanilla?".
 */

interface DiffRow {
  tweak: TweakRecord
  applied: AppliedTweak
  audit: TweakAudit | null
}

export function Diff() {
  const isNative = inTauri()
  const [rows, setRows] = useState<DiffRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  async function refresh() {
    if (!isNative) {
      setErr('Diff requires the optimizationmaxxing.exe shell.')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const list = await listApplied()
      const activeIds = new Set(list.filter((a) => a.status === 'applied').map((a) => a.tweakId))
      const tweaks = catalog.tweaks.filter((t) => activeIds.has(t.id))
      const auditByTweakId = await auditMany(tweaks)
      const composed: DiffRow[] = tweaks.map((t) => ({
        tweak: t,
        applied: list.find((a) => a.tweakId === t.id && a.status === 'applied')!,
        audit: auditByTweakId[t.id] ?? null,
      }))
      setRows(composed)
    } catch (e) {
      setErr(typeof e === 'string' ? e : (e as Error).message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const t = r.tweak
      return (
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  function copyAsText() {
    if (!rows || rows.length === 0) return
    const lines: string[] = []
    lines.push(`# my optimizationmaxxing tune  ·  ${new Date().toISOString().split('T')[0]}`)
    lines.push(`# ${rows.length} tweaks applied`)
    lines.push('')
    for (const r of rows) {
      const stateLabel = r.audit
        ? r.audit.status === 'matches'
          ? 'on-target'
          : r.audit.status === 'differs'
          ? 'drift'
          : r.audit.status === 'partial'
          ? `partial (${r.audit.matchCount}/${r.audit.total})`
          : 'unknown'
        : '—'
      lines.push(`- [${r.tweak.category}] ${r.tweak.title}  (risk ${r.tweak.riskLevel}, ${stateLabel})`)
    }
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">your tune</p>
          <h1 className="text-3xl font-bold">What you've changed</h1>
          <p className="text-sm text-text-muted max-w-2xl mt-1">
            Every tweak you've applied, in one list. Each row tells you whether the change is{' '}
            <strong className="text-emerald-300">still in place</strong> or whether something
            <strong className="text-amber-300"> reverted it</strong> (Windows Update, another
            tuner, or you yourself flipped it back). Click any row to see exactly which registry
            keys or files were modified. Hit "Copy as text" to share your full setup in a Discord
            DM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-md border border-border text-xs hover:border-border-glow disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Re-check'}
          </button>
          <button
            onClick={copyAsText}
            disabled={!rows || rows.length === 0}
            className="px-3 py-1.5 rounded-md border border-border text-xs hover:border-border-glow disabled:opacity-50"
          >
            Copy as text
          </button>
        </div>
      </header>

      {err && <div className="surface-card p-3 text-sm text-accent">{err}</div>}

      {!loading && rows && rows.length === 0 && (
        <div className="surface-card p-8 text-center">
          <p className="text-text font-semibold">No tweaks applied yet.</p>
          <p className="text-text-muted text-sm mt-1">
            Apply a preset from <Link to="/presets" className="text-accent hover:underline">/presets</Link>{' '}
            or pick individual tweaks from{' '}
            <Link to="/tweaks" className="text-accent hover:underline">/tweaks</Link> first.
          </p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by title / category / id…"
              className="flex-1 min-w-64 px-3 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm"
            />
            <span className="text-xs text-text-subtle">
              {filtered.length} of {rows.length} active
            </span>
          </div>
          <SummaryStrip rows={rows} />
          <div className="space-y-2">
            {filtered.map((r) => (
              <DiffRowCard key={r.tweak.id} row={r} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SummaryStrip({ rows }: { rows: DiffRow[] }) {
  let onTarget = 0
  let drift = 0
  let partial = 0
  let unknown = 0
  for (const r of rows) {
    if (!r.audit) {
      unknown++
      continue
    }
    if (r.audit.status === 'matches') onTarget++
    else if (r.audit.status === 'differs') drift++
    else if (r.audit.status === 'partial') partial++
    else unknown++
  }
  return (
    <div className="surface-card p-3 flex flex-wrap gap-x-5 gap-y-1 text-xs items-center">
      <span className="text-text-subtle uppercase tracking-widest">summary</span>
      <span className="text-emerald-300">✓ {onTarget} still in place</span>
      {drift > 0 && <span className="text-red-400">✗ {drift} got reverted</span>}
      {partial > 0 && <span className="text-amber-300">◐ {partial} partly in place</span>}
      {unknown > 0 && <span className="text-text-subtle">? {unknown} can't tell</span>}
    </div>
  )
}

function DiffRowCard({ row }: { row: DiffRow }) {
  const [expanded, setExpanded] = useState(false)
  const a = row.audit
  const verdictColor = !a
    ? 'text-text-subtle'
    : a.status === 'matches'
    ? 'text-emerald-300'
    : a.status === 'differs'
    ? 'text-red-400'
    : a.status === 'partial'
    ? 'text-amber-300'
    : 'text-text-subtle'
  const verdictLabel = !a
    ? "? can't tell"
    : a.status === 'matches'
    ? '✓ still in place'
    : a.status === 'differs'
    ? '✗ got reverted'
    : a.status === 'partial'
    ? `◐ ${a.matchCount}/${a.total} in place`
    : "? can't tell"

  return (
    <article className="surface-card p-4">
      <button onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-text-subtle">
              {row.tweak.category}  ·  risk {row.tweak.riskLevel}
            </p>
            <h3 className="text-sm font-semibold text-text">{row.tweak.title}</h3>
            <p className="text-[11px] text-text-subtle mt-0.5">
              applied {new Date(row.applied.appliedAt).toLocaleString()}
            </p>
          </div>
          <span className={`text-xs font-semibold tabular-nums ${verdictColor}`}>
            {verdictLabel}
          </span>
        </div>
      </button>
      {expanded && a && a.actions.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-border space-y-1 text-xs">
          {a.actions.map((act) => (
            <li key={act.index} className="flex items-start gap-2">
              <span
                className={`mt-0.5 ${
                  act.status === 'matches'
                    ? 'text-emerald-300'
                    : act.status === 'differs'
                    ? 'text-red-400'
                    : 'text-text-subtle'
                }`}
              >
                {act.status === 'matches' ? '✓' : act.status === 'differs' ? '✗' : '?'}
              </span>
              <span className="text-text-muted leading-snug">
                <span className="text-text-subtle">action {act.index + 1}:</span> {act.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
