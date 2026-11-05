import { useEffect, useState } from 'react'
import {
  armRebootValidation,
  getRebootValidation,
  inTauri,
  validateRebootPersistence,
  type RebootValidation,
  type RebootValidationStatus,
} from '../lib/tauri'

/**
 * Two-phase reboot proof: arm the exact active receipt set, restart Windows,
 * then read every action back. A reboot is never inferred from an app reopen.
 */
export function RebootPersistenceCard({ onReport }: { onReport?: (report: RebootValidation) => void }) {
  const native = inTauri()
  const [report, setReport] = useState<RebootValidation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!native) return
    try {
      setError(null)
      const next = await getRebootValidation()
      setReport(next)
      onReport?.(next)
    } catch (e) {
      setError(formatError(e))
    }
  }

  useEffect(() => {
    void refresh()
    if (window.location.hash === '#asta-reboot-persistence') {
      const timer = window.setTimeout(() => {
        document.getElementById('asta-reboot-persistence')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }, 100)
      return () => window.clearTimeout(timer)
    }
    // The native shell is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function arm() {
    setBusy(true)
    setError(null)
    try {
      const next = await armRebootValidation()
      setReport(next)
      onReport?.(next)
    } catch (e) {
      setError(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  async function check() {
    setBusy(true)
    setError(null)
    try {
      const next = await validateRebootPersistence()
      setReport(next)
      onReport?.(next)
    } catch (e) {
      setError(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!native) {
    return (
      <div className="surface-card p-5 text-sm text-text-muted">
        Reboot persistence proof requires the optimizationmaxxing desktop shell.
      </div>
    )
  }

  const status = report?.status ?? 'idle'
  const nonVerified = report?.items.filter((item) => item.status !== 'verified') ?? []
  const passed = status === 'verified'

  return (
    <section id="asta-reboot-persistence" className="surface-card p-5 space-y-4" aria-live="polite">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">step 3 · after restart</p>
          <h2 className="text-xl font-semibold">Check that your settings survived</h2>
          <p className="text-base text-text-muted max-w-3xl leading-relaxed">
            After you arm this check, Optimizationmaxxing asks Windows to open the app once after the next restart.
            It then reads the settings back and opens this result automatically. It never silently reapplies drifted state.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-widest ${statusBadgeClass(status)}`}>
          {statusLabel(status)}
        </span>
      </div>

      <div className={`rounded-md border px-3 py-3 ${passed ? 'border-emerald-400/35 bg-emerald-400/10' : 'border-border bg-bg-base/30'}`}>
        <p className={`text-sm font-semibold ${passed ? 'text-emerald-200' : 'text-text'}`}>
          {passed ? 'Reboot check passed' : status === 'awaiting_reboot' || status === 'armed' ? 'Restart Windows to finish the check' : status === 'mismatch' || status === 'unknown' ? 'The check needs attention' : 'Apply settings first'}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {passed
            ? 'The armed settings survived a real Windows restart. No action is needed for this check.'
            : report?.detail ?? 'Arm the settings after a successful apply, then restart Windows.'}
        </p>
      </div>

      {report && report.receiptIds.length > 0 ? (
        <p className="text-xs text-text-muted">
          Scope: {report.receiptIds.length} app-owned action receipt{report.receiptIds.length === 1 ? '' : 's'} with a read-back contract. This proves that armed set only; it is not a claim that every catalog row was written.
        </p>
      ) : null}

      {report && report.checked > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Count label="checked" value={report.checked} />
          <Count label="verified" value={report.verified} />
          <Count label="mismatch" value={report.mismatched} />
          <Count label="unknown" value={report.unknown} />
        </div>
      ) : null}

      {report && report.items.length > 0 ? (
        <details className="border border-border rounded-md p-3" open={nonVerified.length > 0}>
          <summary className="cursor-pointer text-xs font-semibold text-text-subtle">
            Show setting read-backs ({report.items.length})
          </summary>
          <div className="mt-3 space-y-3">
            {report.items.map((item) => (
              <div key={item.receiptId} className="text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-text truncate">{item.tweakId}</span>
                  <span className={statusClass(item.status)}>{item.status === 'verified' ? 'passed' : item.status}</span>
                </div>
                <p className="text-text-muted">
                  {item.verifiedAt
                    ? `Last verified after reboot: ${formatTimestamp(item.verifiedAt)}`
                    : `Checked after reboot: ${formatTimestamp(report.verifiedAt)}`}
                </p>
                <p className="text-text-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => void arm()}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
        >
          {busy ? 'Working…' : status === 'verified' || status === 'mismatch' || status === 'unknown' ? 'Arm a new check' : 'Arm current settings'}
        </button>
        <button
          onClick={() => void check()}
          disabled={busy || status === 'idle' || status === 'verified'}
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
        >
          Check after restart
        </button>
        <span className="text-[11px] text-text-subtle">{nextStep(status)}</span>
      </div>

      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </section>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded-md p-2">
      <p className="text-xl font-bold tabular-nums text-text">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
    </div>
  )
}

function statusLabel(status: RebootValidationStatus): string {
  const labels: Record<RebootValidationStatus, string> = {
    idle: 'not armed',
    armed: 'restart required',
    awaiting_reboot: 'restart required',
    verified: 'passed',
    mismatch: 'needs attention',
    unknown: 'needs attention',
  }
  return labels[status]
}

function statusClass(status: string): string {
  if (status === 'verified') return 'text-emerald-400'
  if (status === 'mismatch' || status === 'unknown') return 'text-accent'
  return 'text-text-muted'
}

function statusBadgeClass(status: RebootValidationStatus): string {
  if (status === 'verified') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'mismatch' || status === 'unknown') return 'border-accent/50 bg-accent/10 text-accent'
  if (status === 'armed' || status === 'awaiting_reboot') return 'border-amber-300/40 bg-amber-300/10 text-amber-100'
  return 'border-border bg-bg-base/30 text-text-muted'
}

function nextStep(status: RebootValidationStatus): string {
  if (status === 'verified') return 'Persistence confirmed.'
  if (status === 'armed' || status === 'awaiting_reboot') return 'Restart Windows; the app will reopen and check automatically.'
  if (status === 'mismatch' || status === 'unknown') return 'Review the read-back details, then arm a new check after fixing the issue.'
  return 'Arm this after applying settings, then restart Windows.'
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'time unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
