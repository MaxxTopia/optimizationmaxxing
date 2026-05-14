import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { auditMany, type TweakAudit } from '../lib/audit'
import { catalog, type TweakRecord } from '../lib/catalog'
import {
  applyBatch,
  inTauri,
  listApplied,
  type AppliedTweak,
  type BatchItem,
} from '../lib/tauri'

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
  const [reapplying, setReapplying] = useState<Set<string>>(new Set())
  const [reapplyAllBusy, setReapplyAllBusy] = useState(false)

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

  async function reapplyTweak(tweak: TweakRecord) {
    if (reapplying.has(tweak.id)) return
    setReapplying((s) => new Set(s).add(tweak.id))
    setErr(null)
    try {
      const items: BatchItem[] = tweak.actions.map((action) => ({ tweakId: tweak.id, action }))
      await applyBatch(items)
      await refresh()
    } catch (e) {
      setErr(`Re-apply failed for ${tweak.title}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setReapplying((s) => {
        const n = new Set(s)
        n.delete(tweak.id)
        return n
      })
    }
  }

  async function reapplyAllDrifted() {
    if (!rows || reapplyAllBusy) return
    const drifted = rows.filter((r) => r.audit && (r.audit.status === 'differs' || r.audit.status === 'partial'))
    if (drifted.length === 0) return
    setReapplyAllBusy(true)
    setErr(null)
    try {
      const items: BatchItem[] = []
      for (const r of drifted) {
        for (const action of r.tweak.actions) {
          items.push({ tweakId: r.tweak.id, action })
        }
      }
      await applyBatch(items)
      await refresh()
    } catch (e) {
      setErr(`Re-apply all failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setReapplyAllBusy(false)
    }
  }

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
            tuner, or you yourself flipped it back). Registry + file writes can be re-read directly;
            script + BCD edits show <span className="text-text-muted">◇ applied (no re-read)</span>{' '}
            because they ran imperatively or need admin to query. Click any row for the per-action
            detail. "Copy as text" pastes the full setup into a Discord DM.
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
          <SummaryStrip
            rows={rows}
            onReapplyAll={reapplyAllDrifted}
            reapplyAllBusy={reapplyAllBusy}
          />
          <div className="space-y-2">
            {filtered.map((r) => (
              <DiffRowCard
                key={r.tweak.id}
                row={r}
                onReapply={() => reapplyTweak(r.tweak)}
                reapplying={reapplying.has(r.tweak.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SummaryStrip({
  rows,
  onReapplyAll,
  reapplyAllBusy,
}: {
  rows: DiffRow[]
  onReapplyAll: () => void
  reapplyAllBusy: boolean
}) {
  let onTarget = 0
  let drift = 0
  let partial = 0
  let trustOnly = 0
  let errored = 0
  for (const r of rows) {
    if (!r.audit || r.audit.status === 'error') {
      errored++
      continue
    }
    if (r.audit.status === 'matches') {
      // Did the match come from a verifiable source (registry/file) or a
      // trust-only source (PS script / BCD-without-admin)? Count those
      // separately so the user knows what fraction of "still in place"
      // they can actually see proof of.
      const hasTrustOnly = r.audit.actions.some(
        (a) => a.status === 'matches' && /^(Script ran on apply|BCD .* applied via admin)/.test(a.detail),
      )
      if (hasTrustOnly && r.audit.actions.every((a) => /^(Script ran on apply|BCD .* applied via admin)/.test(a.detail))) {
        trustOnly++
      } else {
        onTarget++
      }
    } else if (r.audit.status === 'differs') drift++
    else if (r.audit.status === 'partial') partial++
    else trustOnly++
  }
  return (
    <div className="surface-card p-3 space-y-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs items-center">
        <span className="text-text-subtle uppercase tracking-widest">summary</span>
        <span className="text-emerald-300">✓ {onTarget} verified in place</span>
        {drift > 0 && (
          <span
            className="text-red-400"
            title="Something outside this app changed these registry values back — usually Windows Update, a vendor tool (NVIDIA / Razer / etc.), or a Settings-app toggle. Click Re-apply to restore the value we wrote."
          >
            ✗ {drift} got reverted externally
          </span>
        )}
        {partial > 0 && <span className="text-amber-300">◐ {partial} partly in place</span>}
        {trustOnly > 0 && (
          <span
            className="text-text-muted"
            title="Script / BCD actions — the apply succeeded but the change can't be re-read without admin or doesn't leave a persistent value to check."
          >
            ◇ {trustOnly} applied (no re-read)
          </span>
        )}
        {errored > 0 && <span className="text-text-subtle">! {errored} check failed</span>}
      </div>
      {drift + partial > 0 && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <p className="text-[11px] text-text-muted leading-snug max-w-2xl">
            {drift + partial} tweak{drift + partial > 1 ? 's are' : ' is'} no longer in the state
            we wrote. The app didn't undo {drift + partial > 1 ? 'them' : 'it'} — something else
            did (Windows Update / vendor app / Settings toggle). Re-apply restores the value(s)
            without changing anything else.
          </p>
          <button
            onClick={onReapplyAll}
            disabled={reapplyAllBusy}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold btn-chrome bg-accent text-bg-base disabled:opacity-50"
          >
            {reapplyAllBusy ? 'Re-applying…' : `Re-apply ${drift + partial}`}
          </button>
        </div>
      )}
    </div>
  )
}

function DiffRowCard({
  row,
  onReapply,
  reapplying,
}: {
  row: DiffRow
  onReapply: () => void
  reapplying: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const a = row.audit
  const trustOnlyActions = a?.actions.filter((x) =>
    /^(Script ran on apply|BCD .* applied via admin)/.test(x.detail),
  ).length ?? 0
  const allTrustOnly = !!(a && trustOnlyActions > 0 && trustOnlyActions === a.actions.length)
  const verdictColor = !a
    ? 'text-text-subtle'
    : a.status === 'matches'
    ? allTrustOnly
      ? 'text-text-muted'
      : 'text-emerald-300'
    : a.status === 'differs'
    ? 'text-red-400'
    : a.status === 'partial'
    ? 'text-amber-300'
    : 'text-text-subtle'
  const verdictLabel = !a
    ? '! check failed'
    : a.status === 'matches'
    ? allTrustOnly
      ? '◇ applied (no re-read)'
      : '✓ verified in place'
    : a.status === 'differs'
    ? '✗ got reverted externally'
    : a.status === 'partial'
    ? `◐ ${a.matchCount}/${a.total} in place`
    : a.status === 'error'
    ? '! check failed'
    : '◇ applied (no re-read)'
  const canReapply = a && (a.status === 'differs' || a.status === 'partial')

  return (
    <article className="surface-card p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">
            {row.tweak.category}  ·  risk {row.tweak.riskLevel}
          </p>
          <h3 className="text-sm font-semibold text-text">{row.tweak.title}</h3>
          <p className="text-[11px] text-text-subtle mt-0.5">
            applied {new Date(row.applied.appliedAt).toLocaleString()}
          </p>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold tabular-nums ${verdictColor}`}>
            {verdictLabel}
          </span>
          {canReapply && (
            <button
              onClick={onReapply}
              disabled={reapplying}
              title="Re-write the value(s) we originally wrote. Doesn't change anything else on your rig."
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {reapplying ? 'Re-applying…' : 'Re-apply'}
            </button>
          )}
        </div>
      </div>
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
                {act.status === 'matches' ? '✓' : act.status === 'differs' ? '✗' : '◇'}
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
