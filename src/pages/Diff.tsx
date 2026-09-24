import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { auditMany, type TweakAudit } from '../lib/audit'
import { catalog, type TweakRecord } from '../lib/catalog'
import {
  applyBatch,
  applyTransaction,
  inTauri,
  verifyApplied,
  type AppliedTweak,
  type BatchItem,
} from '../lib/tauri'
import { confirmAction } from '../lib/confirm'
import { isTransactionActionEligible } from '../lib/optimizationSession'

/**
 * /diff — every active mod from a vanilla Windows in one table.
 *
 * Re-reads active receipts through the native verifier + audits each applied
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

function aggregateApplied(rows: AppliedTweak[]): AppliedTweak {
  if (rows.length === 0) {
    throw new Error('Cannot aggregate an empty applied-tweak group')
  }
  const latest = [...rows].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))[0]
  const mismatch = rows.filter((row) => row.verificationStatus === 'mismatch').length
  const unknown = rows.filter((row) => row.verificationStatus === 'unknown').length
  const status = mismatch > 0 ? 'mismatch' : unknown > 0 ? 'unknown' : 'verified'
  const detail =
    status === 'mismatch'
      ? `${mismatch} of ${rows.length} action${rows.length === 1 ? '' : 's'} do not match the target.`
      : status === 'unknown'
      ? `${rows.length - unknown} of ${rows.length} actions verified; ${unknown} have no declared read-back contract.`
      : `${rows.length} of ${rows.length} actions verified against live state.`
  return { ...latest, verificationStatus: status, verificationDetail: detail }
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
      // The persisted receipt is history; verifyApplied() is the live truth.
      // Group action receipts so a multi-action tweak is not represented by
      // whichever action happened to be returned first.
      const list = await verifyApplied()
      const active = list.filter((a) => a.status === 'applied')
      const byTweakId = new Map<string, AppliedTweak[]>()
      for (const row of active) {
        const group = byTweakId.get(row.tweakId) ?? []
        group.push(row)
        byTweakId.set(row.tweakId, group)
      }
      const activeIds = new Set(byTweakId.keys())
      const tweaks = catalog.tweaks.filter((t) => activeIds.has(t.id))
      const auditByTweakId = await auditMany(tweaks)
      const composed: DiffRow[] = tweaks.map((t) => ({
        tweak: t,
        applied: aggregateApplied(byTweakId.get(t.id) ?? []),
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
      await applyReapplyItems(items)
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
    const drifted = rows.filter((r) => r.applied.verificationStatus === 'mismatch')
    if (drifted.length === 0) return
    try {
      if (!(await confirmAction(
        `Re-apply the recorded targets for ${drifted.length} drifted tweak${drifted.length === 1 ? '' : 's'}? This restores only the values optimizationmaxxing originally wrote; it does not identify which tool caused the drift.`,
      ))) return
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      return
    }
    setReapplyAllBusy(true)
    setErr(null)
    try {
      const items: BatchItem[] = []
      for (const r of drifted) {
        for (const action of r.tweak.actions) {
          items.push({ tweakId: r.tweak.id, action })
        }
      }
      await applyReapplyItems(items)
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
      const stateLabel =
        r.applied.verificationStatus === 'verified'
          ? 'on-target'
          : r.applied.verificationStatus === 'mismatch'
          ? 'drift'
          : 'unknown'
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
            tuner, or you yourself flipped it back). Native read-back is persisted for registry,
            BCD, file, and display actions; PowerShell actions remain{' '}
            <span className="text-text-muted">◇ unknown</span> unless the catalog declares a
            safe read-back contract. Click any row for the per-action detail. "Copy as text" pastes
            the full setup into a Discord DM. This page is an audit: opening it never changes
            Windows. Re-apply is always an explicit action here.
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
  let trustOnly = 0
  for (const r of rows) {
    if (r.applied.verificationStatus === 'verified') onTarget++
    else if (r.applied.verificationStatus === 'mismatch') drift++
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
            title="The live value differs from the target recorded by this app. Windows Update, a vendor tool, a Settings toggle, or an apply that did not hold can cause drift; the verifier cannot identify the actor. Click Re-apply to try the target again."
          >
            ✗ {drift} drift detected
          </span>
        )}
        {trustOnly > 0 && (
          <span
            className="text-text-muted"
            title="The catalog has no safe native read-back contract for at least one action in these tweaks."
          >
            ◇ {trustOnly} applied (no re-read)
          </span>
        )}
      </div>
      {drift > 0 && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <p className="text-[11px] text-text-muted leading-snug max-w-2xl">
            {drift} tweak{drift > 1 ? 's no longer match' : ' no longer matches'} the target the app
            recorded. The verifier cannot identify the cause: Windows Update, a vendor app, a
            Settings toggle, or an apply that did not hold can all produce drift. Re-apply tries to
            restore the target value(s) without changing anything else. Opening this audit never
            changes Windows; Tune Now makes one automatic repair attempt only after you explicitly
            apply a tune.
          </p>
          <button
            onClick={onReapplyAll}
            disabled={reapplyAllBusy}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold btn-chrome bg-accent text-bg-base disabled:opacity-50"
          >
            {reapplyAllBusy ? 'Re-applying…' : `Re-apply ${drift}`}
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
  const a = row.audit
  // Drifted rows auto-expand so the per-action "Currently X / target Y"
  // breakdown is visible without an extra click — that's the actionable
  // detail the user actually wants when something's reverted.
  const isDrifted = row.applied.verificationStatus === 'mismatch'
  const [expanded, setExpanded] = useState(isDrifted)
  const verdictColor =
    row.applied.verificationStatus === 'verified'
      ? 'text-emerald-300'
      : row.applied.verificationStatus === 'mismatch'
      ? 'text-red-400'
      : 'text-text-muted'
  const verdictLabel =
    row.applied.verificationStatus === 'verified'
      ? '✓ verified in place'
      : row.applied.verificationStatus === 'mismatch'
      ? '✗ drift detected'
      : '◇ unknown (no read-back)'
  const canReapply = row.applied.verificationStatus === 'mismatch'

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
      {expanded && (
        <p className="mt-3 pt-3 border-t border-border text-xs text-text-muted leading-snug">
          {row.applied.verificationDetail}
        </p>
      )}
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

/** Re-apply the reversible/read-back lane transactionally. Legacy or
 * unverifiable PowerShell remains an explicit batch because the native engine
 * cannot honestly promise rollback for it. */
async function applyReapplyItems(items: BatchItem[]): Promise<void> {
  const transactional = items.filter((item) => isTransactionActionEligible(item.action))
  const explicit = items.filter((item) => !isTransactionActionEligible(item.action))

  if (transactional.length > 0) {
    const report = await applyTransaction(transactional)
    if (report.status !== 'committed') {
      const detail = [...report.errors, ...report.rollbackErrors].join(' ')
      throw new Error(`Verified re-apply ${report.status}.${detail ? ` ${detail}` : ''}`)
    }
  }
  if (explicit.length > 0) await applyBatch(explicit)
}
