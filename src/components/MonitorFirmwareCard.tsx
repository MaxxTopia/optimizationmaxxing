import { useEffect, useState } from 'react'
import { inTauri, monitorInventory, openExternal, type MonitorReport } from '../lib/tauri'

/**
 * Monitor firmware reminder card. Reads EDID via WmiMonitorID, identifies
 * each connected display's vendor + model + manufacture date, and surfaces
 * the vendor's required firmware/control tool with a deep-link to their
 * support page. Windows doesn't expose monitor firmware *versions* through
 * a standard API — this is "did you check?" articleware, not an automated
 * version comparison.
 *
 * Card hides entirely when no EDID-reporting monitors are detected (KVM
 * passthroughs, virtual displays, headless rigs).
 */
export function MonitorFirmwareCard() {
  const isNative = inTauri()
  const [report, setReport] = useState<MonitorReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    if (!isNative) return
    setLoading(true)
    setErr(null)
    try {
      setReport(await monitorInventory())
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

  if (!isNative) return null
  if (report && report.monitors.length === 0) return null

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">display · firmware reminder</p>
          <h2 className="text-lg font-semibold">Monitor firmware check</h2>
          <p className="text-sm text-text-muted max-w-2xl leading-snug">
            Windows doesn't expose monitor firmware versions through any standard API.
            We can detect your panels via EDID + tell you which vendor tool runs the update —
            you run the actual check there. Worth doing every ~12 months on a gaming monitor
            (firmware patches HDR/G-Sync/refresh-rate bugs more often than people realize).
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
        >
          {loading ? 'Probing…' : 'Refresh'}
        </button>
      </div>

      {err && <p className="text-xs text-red-300 italic">{err}</p>}

      {report && report.monitors.map((m, i) => {
        const stale = (m.ageYears ?? 0) >= 2
        return (
          <div
            key={`${m.vendorCode}-${m.productCode}-${i}`}
            className={`rounded-md border p-4 space-y-2 ${
              stale ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-bg-raised/40'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                  {m.vendorName} · {m.vendorCode || 'no-PNP'}
                </p>
                <h3 className="text-base font-semibold truncate">
                  {m.model || '(no model in EDID)'}{' '}
                  {m.productCode && (
                    <span className="font-mono text-xs text-text-muted">[{m.productCode}]</span>
                  )}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-text-subtle">manufactured</p>
                <p className={`text-sm tabular-nums ${stale ? 'text-amber-300' : 'text-text-muted'}`}>
                  {m.manufactureYear ? `${m.manufactureYear} · wk ${m.manufactureWeek ?? '?'}` : '—'}
                  {m.ageYears != null && (
                    <span className="text-text-subtle"> · {m.ageYears}y old</span>
                  )}
                </p>
              </div>
            </div>

            {m.firmwareUrl && m.firmwareTool ? (
              <div className="pt-2 border-t border-border space-y-1.5">
                <p className="text-[11px] text-text-muted leading-snug">
                  <strong className="text-text">Update tool:</strong> {m.firmwareTool}
                </p>
                <button
                  onClick={() => openExternal(m.firmwareUrl!)}
                  className="text-[11px] underline text-accent hover:text-accent-soft"
                >
                  Open vendor support page →
                </button>
              </div>
            ) : (
              <p className="pt-2 border-t border-border text-[11px] text-text-subtle leading-snug">
                Vendor PNP code <code className="text-text-muted">{m.vendorCode || '(blank)'}</code>{' '}
                not in our mapping table. Search "{m.model || m.productCode || 'monitor'} firmware update"
                on the manufacturer's site directly.
              </p>
            )}

            {stale && (
              <p className="text-[11px] text-amber-200/90 leading-snug">
                ⚠ This panel is {m.ageYears}+ years old without us knowing if you've ever checked
                firmware. Open the vendor tool above and look for an update — gaming-monitor
                firmware ships fixes for variable-refresh, HDR, and overdrive every few months.
              </p>
            )}
          </div>
        )
      })}

      <p className="text-[11px] text-text-subtle leading-snug pt-2 border-t border-border">
        EDID is the only standardized way Windows exposes display info — firmware version itself
        isn't in EDID. So this is a "did you check?" card, not an automated comparison. The
        vendor's tool (or product-page firmware download) is the source of truth.
      </p>
    </section>
  )
}
