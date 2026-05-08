import { useEffect, useState } from 'react'
import { inTauri, vbsReport, type VbsReport } from '../lib/tauri'

/**
 * VBS / HVCI / Memory Integrity tri-probe. The catalog has three tweaks
 * that all need to land for VBS to cost 0%:
 *   1. bcd.hypervisorlaunchtype.off  (BCD)
 *   2. vbs.hvci.disable               (registry)
 *   3. Settings → Device security → Core isolation → Memory Integrity off
 *      (manual UI; nothing we can flip programmatically without trust risk)
 *
 * Surfaces the current state of all three so the user knows whether they're
 * fully-disabled / partial / still-enabled. Anti-cheat caveat: Vanguard +
 * FACEIT may refuse to launch with VBS off + Secure Boot off. Verify per-
 * title before applying.
 */
export function VbsStatusCard() {
  const [report, setReport] = useState<VbsReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isNative = inTauri()

  async function refresh() {
    if (!isNative) {
      setErr('VBS probe requires the optimizationmaxxing.exe shell.')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      setReport(await vbsReport())
    } catch (e) {
      setErr(formatErr(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accent = report?.status === 'enabled'
  const ok = report?.status === 'fully-disabled'
  const partial = report?.status === 'partial'

  return (
    <section
      className={`surface-card p-5 space-y-2 ${
        accent || partial ? 'border-accent/40 bg-accent/5' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">vbs / hvci</p>
          <h2 className="text-lg font-semibold">
            {ok
              ? '✓ Virtualization-based security fully off'
              : accent
              ? '⚠ VBS / HVCI active — costs 5-15% in CPU-bound games'
              : partial
              ? '◐ VBS partially disabled — finish the trio'
              : 'VBS status'}
          </h2>
        </div>
        <button
          onClick={refresh}
          disabled={loading || !isNative}
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
        >
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      </div>

      {err && <p className="text-xs text-text-muted italic">{err}</p>}

      {report && (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Cell label="VBS runtime" value={`${report.vbsStatus} / 2`} good={report.vbsStatus === 0} />
            <Cell label="HVCI registry" value={report.hvciEnabled ? 'ON' : 'off'} good={!report.hvciEnabled} />
            <Cell
              label="BCD hypervisor"
              value={report.hypervisorLaunchtype ?? '—'}
              good={report.hypervisorLaunchtype === 'Off' || report.hypervisorLaunchtype === 'off'}
            />
          </div>
          <p className="text-xs text-text-muted leading-snug">{report.note}</p>
        </>
      )}
    </section>
  )
}

function Cell({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="border border-border rounded p-2">
      <div className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</div>
      <div
        className={`text-base font-bold tabular-nums ${
          good ? 'text-emerald-400' : 'text-accent'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
