import { Link } from 'react-router-dom'
import { summarizeRig } from '../lib/rigContext'
import { useRigStore } from '../store/useRigStore'

export function DetectedRigCard({ compact = false }: { compact?: boolean }) {
  const spec = useRigStore((state) => state.spec)
  const status = useRigStore((state) => state.status)
  const error = useRigStore((state) => state.error)
  const refresh = useRigStore((state) => state.refresh)
  const scanning = status === 'loading'

  if (status === 'unavailable') {
    return (
      <section className="surface-card p-4 border-l-4 border-l-border" data-testid="detected-rig-card">
        <p className="text-xs uppercase tracking-widest text-text-subtle">detected rig context</p>
        <p className="text-sm text-text-muted mt-1">
          Open the optimizationmaxxing desktop app to read the real CPU, GPU, RAM, motherboard, and
          Windows build. Browser preview never invents hardware data.
        </p>
      </section>
    )
  }

  if (!spec || scanning || status === 'idle') {
    return (
      <section className="surface-card p-4 border-l-4 border-l-secondary" data-testid="detected-rig-card">
        <p className="text-xs uppercase tracking-widest text-text-subtle">detected rig context</p>
        <p className="text-sm text-text-muted mt-1">Reading this machine before ranking recommendations…</p>
      </section>
    )
  }

  const summary = summarizeRig(spec)
  return (
    <section className={`surface-card ${compact ? 'p-4' : 'p-5'} space-y-3 border-l-4 border-l-accent`} data-testid="detected-rig-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">detected rig context</p>
          <h2 className="text-lg font-semibold mt-1">Recommendations are using this machine</h2>
          <p className="text-[11px] text-text-subtle mt-1">Snapshot captured {summary.captured}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
           disabled={scanning}
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text text-xs disabled:opacity-40"
        >
           {scanning ? 'Scanning…' : 'Re-scan rig'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <RigMetric label="CPU" value={summary.cpu} />
        <RigMetric label="GPU" value={summary.gpu} />
        <RigMetric label="Memory" value={summary.memory} />
        <RigMetric label="OS" value={summary.os} />
        <RigMetric label="Board" value={summary.board} />
      </div>

      <div className="space-y-2">
        {summary.notices.map((notice) => (
          <p
            key={notice.text}
            className={`rounded border px-3 py-2 text-xs leading-snug ${
              notice.tone === 'warn'
                ? 'border-amber-500/40 bg-amber-500/5 text-amber-100'
                : 'border-border bg-bg-raised/40 text-text-muted'
            }`}
          >
            {notice.text}
          </p>
        ))}
      </div>

      {error && <p className="text-[11px] text-amber-200">Last scan note: {error}</p>}
      {!compact && (
        <p className="text-[11px] text-text-subtle">
          Need the complete inventory? <Link to="/profile" className="underline hover:text-text">Open Profile</Link>.
        </p>
      )}
    </section>
  )
}

function RigMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2 min-w-0">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="text-xs font-semibold text-text truncate" title={value}>{value}</p>
    </div>
  )
}
