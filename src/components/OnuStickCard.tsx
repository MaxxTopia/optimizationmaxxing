import { useEffect, useRef, useState } from 'react'
import { inTauri, onuStickMetrics, type OnuStickReport } from '../lib/tauri'

/**
 * 8311 X-ONU-SFPP stick monitor. The 8311 community firmware (default
 * firmware on EXEN's stick + most current Potron-based ONUs) ships a JSON
 * metrics endpoint at:
 *
 *   https://192.168.11.1/cgi-bin/luci/8311/metrics
 *
 * Reachability depends on the user's network setup — typically the stick's
 * management VLAN/IP must be reachable from the Windows PC. If the stick
 * lives in a Mikrotik / UDM / OPNsense, the user must configure a route or
 * tagged VLAN to 192.168.11.0/24 first.
 *
 * pon.wiki documents that these ONUs run hot — sustained operation above
 * ~60 °C reduces lifespan, so we surface amber at 55 °C and red at 60 °C.
 */

const URL_KEY = 'optmaxxing-onu-stick-url'
const DEFAULT_URL = 'https://192.168.11.1/cgi-bin/luci/8311/metrics'

export function OnuStickCard() {
  const [url, setUrl] = useState<string>(() => localStorage.getItem(URL_KEY) || DEFAULT_URL)
  const [report, setReport] = useState<OnuStickReport | null>(null)
  const [running, setRunning] = useState(false)
  const [auto, setAuto] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const isNative = inTauri()
  const timer = useRef<number | null>(null)

  useEffect(() => {
    localStorage.setItem(URL_KEY, url)
  }, [url])

  async function probe() {
    if (!isNative) return
    setRunning(true)
    try {
      const r = await onuStickMetrics(url)
      setReport(r)
    } catch (e) {
      setReport({
        temperatureC: null,
        voltageV: null,
        biasCurrentMa: null,
        txPowerDbm: null,
        rxPowerDbm: null,
        state: null,
        firmware: null,
        serial: null,
        rawJson: null,
        error: typeof e === 'string' ? e : (e as Error).message ?? String(e),
        fetchMs: 0,
      })
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (!auto) {
      if (timer.current) {
        window.clearInterval(timer.current)
        timer.current = null
      }
      return
    }
    probe()
    timer.current = window.setInterval(probe, 5000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, url])

  const tempColor = colorForTemp(report?.temperatureC ?? null)
  const overheating = report?.temperatureC != null && report.temperatureC >= 60

  return (
    <div className="surface-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">network · 8311 · niche</p>
          <h3 className="text-lg font-semibold">XGS-PON ONU stick monitor</h3>
          <p className="text-sm text-text-muted max-w-2xl">
            <strong className="text-text">Skip this card if you don't run an XGS-PON SFP+ stick.</strong>{' '}
            For users with an 8311-firmware ONU (EXEN, Potron-based) plugged into a router/switch SFP+
            cage: reads the community firmware's metrics endpoint inline so you spot a stick running
            too hot (≥ 60 °C cooks the laser) before it dies. Most home users on regular ISP-issued
            routers don't have one — the "couldn't reach the stick" error is normal and expected here.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          placeholder={DEFAULT_URL}
          className="flex-1 min-w-[18rem] px-3 py-1.5 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-xs font-mono"
        />
        <button
          onClick={probe}
          disabled={running || !isNative}
          className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40"
        >
          {running ? 'Polling…' : report ? 'Re-poll' : 'Poll once'}
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="accent-accent"
            disabled={!isNative}
          />
          auto-refresh (5 s)
        </label>
      </div>

      {!isNative && (
        <p className="text-xs text-text-subtle italic">
          ONU stick polling needs the optimizationmaxxing.exe shell — open the desktop app.
        </p>
      )}

      {overheating && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300 leading-snug">
          <strong>≥ 60 °C — get airflow on this stick.</strong> Sustained operation above 60 °C
          shortens the laser's life. Active cooling (a small fan blowing across the SFP cage)
          is the standard fix.
        </div>
      )}

      {report?.error && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug">
          <strong>Couldn't reach the stick:</strong> {report.error}
          <p className="mt-1 text-amber-200/80">
            <strong>Don't have an XGS-PON stick?</strong> Ignore this card — you're not the audience.
            <br />
            <strong>You do have one?</strong> Check the URL above; if your stick lives in your router,
            you may need to configure a route or VLAN so this PC can reach <code>192.168.11.1</code>.
            Self-signed certs are tolerated automatically. The 8311 community wiki documents the
            full setup: <a href="https://pon.wiki/" target="_blank" rel="noreferrer" className="underline">pon.wiki</a>.
          </p>
        </div>
      )}

      {report && !report.error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat
              label="Temperature"
              value={fmt(report.temperatureC, '°C', 1)}
              colorClass={tempColor}
              hint={tempHint(report.temperatureC)}
            />
            <Stat label="Voltage" value={fmt(report.voltageV, 'V', 2)} />
            <Stat label="TX power" value={fmt(report.txPowerDbm, 'dBm', 1)} />
            <Stat label="RX power" value={fmt(report.rxPowerDbm, 'dBm', 1)} />
            <Stat label="Bias" value={fmt(report.biasCurrentMa, 'mA', 1)} />
          </div>
          <div className="text-[11px] text-text-subtle flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {report.state && <span>state: <span className="text-text-muted">{report.state}</span></span>}
            {report.firmware && <span>fw: <span className="text-text-muted">{report.firmware}</span></span>}
            {report.serial && <span>sn: <span className="text-text-muted font-mono">{report.serial}</span></span>}
            <span className="ml-auto">round-trip: {report.fetchMs} ms</span>
          </div>
          {report.rawJson && (
            <details
              className="text-[11px] text-text-subtle"
              open={showRaw}
              onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer">show raw JSON</summary>
              <pre className="mt-2 p-2 bg-bg-base/60 border border-border rounded text-[10px] leading-snug overflow-auto max-h-48 font-mono">
                {report.rawJson}
              </pre>
            </details>
          )}
        </>
      )}

      <p className="text-[11px] text-text-subtle pt-2 border-t border-border">
        Bought from <a className="underline hover:text-text" href="https://exen.sh/" target="_blank" rel="noreferrer">exen.sh</a>?
        Stick docs at <a className="underline hover:text-text" href="https://pon.wiki/xgs-pon/ont/potron-technology/x-onu-sfpp/" target="_blank" rel="noreferrer">pon.wiki</a>.
        Community + firmware at <a className="underline hover:text-text" href="https://github.com/up-n-atom/8311" target="_blank" rel="noreferrer">github.com/up-n-atom/8311</a>.
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  colorClass,
  hint,
}: {
  label: string
  value: string
  colorClass?: string
  hint?: string
}) {
  return (
    <div className="surface-card p-3">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colorClass ?? 'text-text'}`}>{value}</p>
      {hint && <p className="text-[10px] text-text-subtle mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

function fmt(v: number | null, unit: string, decimals: number): string {
  if (v == null) return '—'
  return `${v.toFixed(decimals)} ${unit}`
}

function colorForTemp(c: number | null): string {
  if (c == null) return 'text-text-muted'
  if (c >= 60) return 'text-red-400'
  if (c >= 55) return 'text-amber-300'
  if (c >= 45) return 'text-emerald-300'
  return 'text-emerald-400'
}

function tempHint(c: number | null): string | undefined {
  if (c == null) return undefined
  if (c >= 60) return 'add airflow'
  if (c >= 55) return 'warm — consider a fan'
  if (c >= 45) return 'normal load temp'
  return 'cool — fine'
}
