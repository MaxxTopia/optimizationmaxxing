import { useCallback, useEffect, useRef, useState } from 'react'
import {
  inTauri,
  onuDiscoverStick,
  onuStickMetrics,
  type OnuDiscoveryResult,
  type OnuStickReport,
} from '../lib/tauri'

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
 * Temperature is shown as a reading only. Limits vary by module, sensor, and
 * operating conditions; compare against the exact device documentation.
 */

const URL_KEY = 'optmaxxing-onu-stick-url'
const DEFAULT_URL = 'https://192.168.11.1/cgi-bin/luci/8311/metrics'

export function OnuStickCard() {
  const [url, setUrl] = useState<string>(() => localStorage.getItem(URL_KEY) || DEFAULT_URL)
  const [report, setReport] = useState<OnuStickReport | null>(null)
  const [running, setRunning] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discovery, setDiscovery] = useState<OnuDiscoveryResult | null>(null)
  const [auto, setAuto] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const isNative = inTauri()
  const timer = useRef<number | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    localStorage.setItem(URL_KEY, url)
  }, [url])

  const probe = useCallback(async (targetUrl = url) => {
    if (!isNative || inFlight.current) return
    inFlight.current = true
    setRunning(true)
    try {
      const r = await onuStickMetrics(targetUrl)
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
      inFlight.current = false
      setRunning(false)
    }
  }, [isNative, url])

  async function handleDiscover() {
    if (!isNative) return
    setDiscovering(true)
    try {
      const r = await onuDiscoverStick()
      setDiscovery(r)
      if (r.url) {
        setUrl(r.url)
        setReport(null)
        void probe(r.url)
      }
    } catch (e) {
      console.warn('[onu] discovery failed:', e)
    } finally {
      setDiscovering(false)
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
    void probe()
    timer.current = window.setInterval(() => void probe(), 5000)
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current)
      timer.current = null
    }
  }, [auto, probe])

  return (
    <div className="surface-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">network · 8311 · niche</p>
          <h3 className="text-lg font-semibold">XGS-PON ONU stick monitor</h3>
          <p className="text-sm text-text-muted max-w-2xl">
            Only for compatible XGS-PON SFP+ modules exposing the 8311 metrics endpoint. A timeout
            means this PC could not read that URL; it does not prove the stick is missing. Temperature
            is informational—use the exact module's documented limits.
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
          onClick={handleDiscover}
          disabled={discovering || !isNative}
          title="Try the well-known XGS-PON stick management URLs in parallel; auto-fill the URL if any responds."
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
        >
          {discovering ? 'Detecting…' : '🔍 Detect stick'}
        </button>
        <button
          onClick={() => void probe()}
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

      {/* v0.1.77 — auto-discovery result. If we ran a Detect pass and
          nothing responded, surface the diagnostic so the user knows we
          actually tried (vs the card looking silent). */}
      {discovery && !discovery.url && (
        <div className="rounded-md border border-text-subtle/40 bg-bg-card/40 px-3 py-2 text-xs text-text-muted leading-snug">
          <strong className="text-text">No compatible stick replied at the tested management URLs.</strong>{' '}
          Tried {discovery.candidatesTried} known management URLs ({discovery.elapsedMs} ms).
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-text-subtle hover:text-text">
              show per-URL attempts
            </summary>
            <ul className="mt-1 ml-2 space-y-0.5 text-[10.5px] font-mono text-text-subtle">
              {discovery.attempts.map((a) => (
                <li key={a.url}>
                  <span className={a.ok ? 'text-emerald-300' : 'text-text-subtle'}>
                    {a.ok ? '✓' : '✗'}
                  </span>{' '}
                  {a.url} <span className="text-text-subtle/70">({a.elapsedMs} ms)</span>
                  {a.error && <span className="text-amber-300/80"> — {a.error.slice(0, 80)}</span>}
                </li>
              ))}
            </ul>
          </details>
          <div className="mt-2 space-y-1.5">
            <p><strong className="text-text">If you own a compatible stick:</strong> verify its firmware, management IP, exact metrics path, and that the PC can reach that network (VLAN/route/firewall).</p>
            <p>For ISP-provided ONUs, check the router or ISP app for optical readings; this monitor only queries the entered endpoint.</p>
          </div>
        </div>
      )}
      {discovery?.url && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 leading-snug">
          ✓ Stick detected at <code className="font-mono">{discovery.url}</code> — URL auto-filled, polling now.
        </div>
      )}

      {!isNative && (
        <p className="text-xs text-text-subtle italic">
          ONU stick polling needs the optimizationmaxxing.exe shell — open the desktop app.
        </p>
      )}

      {report?.error && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug space-y-2">
          <p>
            <strong>Endpoint didn't respond:</strong> {report.error}
          </p>
          <p className="text-amber-200/80 text-[11px]">
            Check the exact firmware/metrics path, management IP, and PC route or VLAN. A timeout
            cannot distinguish an absent device from an unreachable endpoint; no network settings
            are changed by this monitor.
          </p>
        </div>
      )}

      {report && !report.error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat
              label="Temperature"
              value={fmt(report.temperatureC, '°C', 1)}
              hint="Compare with this module's documented range."
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
