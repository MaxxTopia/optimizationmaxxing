import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalog, type TweakRecord } from '../lib/catalog'
import { listApplied, type AppliedTweak } from '../lib/tauri'

/**
 * Top 5 most-recently-applied tweaks. Useful when bringing up a fresh
 * Windows install and you want to redo the same set of tweaks fast —
 * each entry is a permalink straight to the tweak in the catalog.
 */
export function RecentlyApplied() {
  const [rows, setRows] = useState<AppliedTweak[]>([])

  useEffect(() => {
    listApplied()
      .then(setRows)
      .catch(() => setRows([]))
  }, [])

  const tweaksById = useMemo(() => {
    const m = new Map<string, TweakRecord>()
    catalog.tweaks.forEach((t) => m.set(t.id, t))
    return m
  }, [])

  const recent = useMemo(() => {
    return rows
      .filter((r) => r.status === 'applied')
      .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
      .slice(0, 5)
      .map((r) => ({ row: r, tweak: tweaksById.get(r.tweakId) }))
      .filter((x): x is { row: AppliedTweak; tweak: TweakRecord } => !!x.tweak)
  }, [rows, tweaksById])

  if (recent.length === 0) return null

  return (
    <section className="surface-card p-5 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">history</p>
          <h2 className="text-lg font-semibold">Recently applied</h2>
        </div>
        <Link
          to="/tweaks?filter=applied"
          className="text-text-muted hover:text-text text-xs underline"
        >
          See all applied →
        </Link>
      </header>
      <ol className="space-y-1.5">
        {recent.map(({ row, tweak }) => (
          <li key={row.receiptId} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex-1 min-w-0 truncate">
              <span className="text-text">{tweak.title}</span>
              <span className="text-text-subtle text-xs ml-2">{tweak.category}</span>
            </span>
            <span className="text-text-subtle text-xs shrink-0">{relativeTime(row.appliedAt)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso.slice(0, 10)
  const diffMs = Date.now() - t
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return iso.slice(0, 10)
}
