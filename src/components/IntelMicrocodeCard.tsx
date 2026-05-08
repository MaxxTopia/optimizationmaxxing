import { useEffect, useState } from 'react'
import { inTauri, microcodeReport, type MicrocodeReport } from '../lib/tauri'

/**
 * Intel 13/14gen Vmin Shift Instability advisor. Reads the running CPU
 * microcode revision and compares against the 0x12B mitigation floor that
 * Intel announced as the "final mitigation" in Sep 2024. Affected models:
 * i9/i7/i5 13xxx + 14xxx K/KF/KS plus 65W non-K. T-series excluded.
 *
 * Already-degraded chips are not repairable by microcode — RMA is the only
 * fix once instability is observed. Microcode + Intel Default Settings BIOS
 * profile is the prevention path for un-degraded chips.
 */
export function IntelMicrocodeCard() {
  const [report, setReport] = useState<MicrocodeReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isNative = inTauri()

  async function refresh() {
    if (!isNative) {
      setErr('Microcode probe requires the optimizationmaxxing.exe shell.')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      setReport(await microcodeReport())
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

  // Hide entirely on non-affected CPUs to reduce noise.
  if (report && report.status === 'not-affected') return null

  const accent = report?.status === 'outdated'
  const ok = report?.status === 'ok'

  return (
    <section
      className={`surface-card p-5 space-y-2 ${
        accent ? 'border-accent/60 bg-accent/5' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">cpu microcode</p>
          <h2 className="text-lg font-semibold">
            {accent ? '⚠ Intel 13/14gen — microcode below mitigation floor' : ok ? '✓ Microcode at mitigation floor' : 'Microcode status'}
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
          <div className="text-sm text-text">
            <span className="text-text-subtle">CPU:</span> {report.cpuBrand || '—'}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="border border-border rounded p-2">
              <div className="text-[10px] uppercase tracking-widest text-text-subtle">
                Running revision
              </div>
              <div
                className={`text-lg font-bold tabular-nums ${
                  accent ? 'text-accent' : ok ? 'text-emerald-400' : 'text-text'
                }`}
              >
                {report.runningRevision ?? '—'}
              </div>
            </div>
            <div className="border border-border rounded p-2">
              <div className="text-[10px] uppercase tracking-widest text-text-subtle">
                Min safe revision
              </div>
              <div className="text-lg font-bold tabular-nums text-text">
                {report.minSafeRevision ?? '—'}
              </div>
            </div>
          </div>
          <p className="text-xs text-text-muted leading-snug">{report.note}</p>
          {accent && (
            <p className="text-[11px] text-accent">
              Action: visit your motherboard vendor's support page (ASUS / Gigabyte / MSI / ASRock),
              download the latest BIOS, flash, then enter BIOS and select 'Intel Default Settings'
              / 'Intel Baseline Profile'. We don't auto-flash — that's a one-way trip.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
