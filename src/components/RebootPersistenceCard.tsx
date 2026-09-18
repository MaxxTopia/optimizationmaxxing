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
export function RebootPersistenceCard() {
  const native = inTauri()
  const [report, setReport] = useState<RebootValidation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!native) return
    try {
      setError(null)
      setReport(await getRebootValidation())
    } catch (e) {
      setError(formatError(e))
    }
  }

  useEffect(() => {
    void refresh()
    // The native shell is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function arm() {
    setBusy(true)
    setError(null)
    try {
      setReport(await armRebootValidation())
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
      setReport(await validateRebootPersistence())
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

  return (
    <section className="surface-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">release gate</p>
          <h2 className="text-lg font-semibold">Reboot persistence proof</h2>
          <p className="text-sm text-text-muted max-w-3xl">
            Arms the exact tweaks currently applied, detects a real Windows reboot, and reads each
            setting back. It never silently reapplies drifted state.
          </p>
        </div>
        <span className={`text-xs font-semibold uppercase tracking-widest ${statusClass(status)}`}>
          {statusLabel(status)}
        </span>
      </div>

      <p className="text-sm text-text">{report?.detail ?? 'No reboot check is armed.'}</p>

      {report && report.checked > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Count label="checked" value={report.checked} />
          <Count label="verified" value={report.verified} />
          <Count label="mismatch" value={report.mismatched} />
          <Count label="unknown" value={report.unknown} />
        </div>
      ) : null}

      {nonVerified.length > 0 ? (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-xs uppercase tracking-widest text-text-subtle">
            Items that need attention
          </p>
          {nonVerified.slice(0, 6).map((item) => (
            <div key={item.receiptId} className="text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-text truncate">{item.tweakId}</span>
                <span className={statusClass(item.status)}>{item.status}</span>
              </div>
              <p className="text-text-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => void arm()}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
        >
          {busy ? 'Working…' : status === 'verified' || status === 'mismatch' || status === 'unknown' ? 'Arm new check' : 'Arm before reboot'}
        </button>
        <button
          onClick={() => void check()}
          disabled={busy || status === 'idle'}
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
        >
          Check after reboot
        </button>
        <span className="text-[11px] text-text-subtle">
          After arming: restart Windows, then launch the app again.
        </span>
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
  return status.replace('_', ' ')
}

function statusClass(status: string): string {
  if (status === 'verified') return 'text-emerald-400'
  if (status === 'mismatch' || status === 'unknown') return 'text-accent'
  return 'text-text-muted'
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
