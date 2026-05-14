import { useEffect, useRef, useState } from 'react'
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
 * pon.wiki documents that these ONUs run hot — sustained operation above
 * ~60 °C reduces lifespan, so we surface amber at 55 °C and red at 60 °C.
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

  useEffect(() => {
    localStorage.setItem(URL_KEY, url)
  }, [url])

  async function handleDiscover() {
    if (!isNative) return
    setDiscovering(true)
    try {
      const r = await onuDiscoverStick()
      setDiscovery(r)
      if (r.url) {
        // Auto-fill the URL input + run a probe immediately so the user
        // sees the metrics without an extra click.
        setUrl(r.url)
        setReport(null)
        // Defer one tick so the URL state propagates before we probe.
        setTimeout(() => probeWithUrl(r.url!), 50)
      }
    } catch (e) {
      console.warn('[onu] discovery failed:', e)
    } finally {
      setDiscovering(false)
    }
  }

  async function probeWithUrl(targetUrl: string) {
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
      setRunning(false)
    }
  }

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
          onClick={handleDiscover}
          disabled={discovering || !isNative}
          title="Try the well-known XGS-PON stick management URLs in parallel; auto-fill the URL if any responds."
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
        >
          {discovering ? 'Detecting…' : '🔍 Detect stick'}
        </button>
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

      {/* v0.1.77 — auto-discovery result. If we ran a Detect pass and
          nothing responded, surface the diagnostic so the user knows we
          actually tried (vs the card looking silent). */}
      {discovery && !discovery.url && (
        <div className="rounded-md border border-text-subtle/40 bg-bg-card/40 px-3 py-2 text-xs text-text-muted leading-snug">
          <strong className="text-text">No XGS-PON stick detected on your subnet.</strong>{' '}
          Tried {discovery.candidatesTried} known stick management URLs in parallel
          ({discovery.elapsedMs} ms total).
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
            <p>
              <strong className="text-text">Don't have a stick?</strong> Expected — most ISP-issued installs don't expose stick metrics to the LAN at all (Frontier / AT&amp;T / Verizon / Lumen lock it down). Skip this card.
            </p>
            <p>
              <strong className="text-text">Have an 8311 community stick (EXEN / Potron-based)?</strong> The default URL is{' '}
              <code className="font-mono text-text">https://192.168.11.1/cgi-bin/luci/8311/metrics</code> — paste your stick's actual management IP in the box above if it lives elsewhere. Self-signed certs are tolerated.
            </p>
            <p>
              <strong className="text-text">Just want to check ONU health on an ISP-issued install?</strong> The metrics live in your <em>router's</em> web UI, not the stick itself:
            </p>
            <ul className="ml-3 list-disc text-[11px] text-text-subtle space-y-0.5">
              <li><strong>Calix Gigaspire</strong> → 192.168.1.1 → Advanced → WAN Info → Fiber Info</li>
              <li><strong>Nokia Beacon / 7368</strong> → 192.168.1.254 → Status → ONT</li>
              <li><strong>AT&amp;T BGW320</strong> → 192.168.1.254 → Broadband → Status</li>
              <li><strong>Frontier eero</strong> → no LAN UI; check the <em>myFrontier</em> app</li>
              <li><strong>Verizon CR1000A</strong> → 192.168.1.1 → Status → Fios</li>
            </ul>
            <p className="mt-1">
              Full XGS-PON routing setup at <a href="https://pon.wiki/" target="_blank" rel="noreferrer" className="underline">pon.wiki</a>.
            </p>
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

      {overheating && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300 leading-snug">
          <strong>≥ 60 °C — get airflow on this stick.</strong> Sustained operation above 60 °C
          shortens the laser's life. Active cooling (a small fan blowing across the SFP cage)
          is the standard fix.
        </div>
      )}

      {report?.error && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug space-y-2">
          <p>
            <strong>Couldn't reach the stick:</strong> {report.error}
          </p>
          {/192\.168\.11\./.test(url) && /timeout|timed out|unreachable|host/i.test(report.error) && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 space-y-2">
              <p className="text-amber-100">
                <strong>This is almost certainly a routing problem, not a dead stick.</strong> The
                WAS-110's management IP <code>192.168.11.1</code> is on its own /24 subnet. If your
                PC's IP starts with anything else (e.g. <code>192.168.1.x</code>), Windows has no
                route to <code>192.168.11.0/24</code> and the connection times out — same as if you
                tried to reach <code>10.99.99.1</code>.
              </p>

              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2 space-y-1.5">
                <p className="text-emerald-200 font-semibold">
                  Easiest fix: add a secondary IP to your PC's network adapter
                </p>
                <p className="text-[11px] text-amber-100">
                  This adds <code>192.168.11.42</code> as a <em>second</em> IP on your existing
                  Ethernet adapter <strong>without touching your main IP, your router config, or
                  your default gateway</strong>. Works if your PC is plugged into the same switch
                  / router that the WAS-110 is plugged into.
                </p>

                <p className="text-[11px] text-text-muted font-semibold mt-1">
                  1. Open <strong>PowerShell as Administrator</strong> (right-click Start → Terminal (Admin))
                </p>

                <p className="text-[11px] text-text-muted font-semibold">
                  2. Find your adapter name:
                </p>
                <pre className="text-[11px] font-mono bg-bg-base/70 border border-border rounded px-2 py-1.5 overflow-x-auto">
                  <code>Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name, InterfaceDescription, LinkSpeed</code>
                </pre>
                <p className="text-[11px] text-text-subtle">
                  Note the <code>Name</code> column — usually <code>Ethernet</code> or <code>Ethernet 2</code>.
                </p>

                <p className="text-[11px] text-text-muted font-semibold">
                  3. Add the secondary IP (replace <code>Ethernet</code> with your adapter name from step 2):
                </p>
                <pre className="text-[11px] font-mono bg-bg-base/70 border border-border rounded px-2 py-1.5 overflow-x-auto">
                  <code>New-NetIPAddress -InterfaceAlias 'Ethernet' -IPAddress 192.168.11.42 -PrefixLength 24</code>
                </pre>
                <p className="text-[11px] text-text-subtle">
                  Note: no <code>-DefaultGateway</code> argument. Leaving it off keeps all your normal
                  internet traffic on its existing route — only <code>192.168.11.x</code> destinations
                  go through this new IP.
                </p>

                <p className="text-[11px] text-text-muted font-semibold">
                  4. Test it:
                </p>
                <pre className="text-[11px] font-mono bg-bg-base/70 border border-border rounded px-2 py-1.5 overflow-x-auto">
                  <code>ping 192.168.11.1</code>
                </pre>
                <p className="text-[11px] text-text-subtle">
                  Replies = success. Browse to <code>https://192.168.11.1</code> (accept the
                  self-signed cert) or hit <strong>Re-poll</strong> on this card.
                </p>

                <p className="text-[11px] text-amber-200 font-semibold mt-2 pt-1.5 border-t border-amber-500/20">
                  Revert (when you're done — restores your network to exactly what it was):
                </p>
                <pre className="text-[11px] font-mono bg-bg-base/70 border border-border rounded px-2 py-1.5 overflow-x-auto">
                  <code>Remove-NetIPAddress -IPAddress 192.168.11.42 -Confirm:$false</code>
                </pre>
                <p className="text-[11px] text-text-subtle">
                  This drops only the secondary <code>192.168.11.42</code> entry. Your main DHCP /
                  static IP, default gateway, and DNS are untouched the entire time. A reboot also
                  clears the secondary IP because <code>New-NetIPAddress</code> defaults to{' '}
                  <code>-PolicyStore ActiveStore</code> (volatile) — add <code>-PolicyStore PersistentStore</code>{' '}
                  in step 3 only if you want it to survive reboots.
                </p>
              </div>

              <p className="text-amber-100 font-semibold pt-1">Other paths if the secondary-IP route doesn't work:</p>
              <ol className="ml-4 list-decimal text-[11px] space-y-1">
                <li>
                  <strong>Direct-plug a laptop into the host port</strong> of the WAS-110 (with
                  the stick OUT of the router temporarily). The stick's mgmt interface is in DHCP
                  mode by default, your laptop pulls a <code>192.168.11.x</code> address, web UI
                  loads at <code>https://192.168.11.1</code>. Slot it back into the router after.
                </li>
                <li>
                  <strong>Read DDMI via your router's CLI</strong> — every modern router with an
                  SFP+ cage exposes the optical metrics there (UDM: <code>show sfp X</code>;
                  MikroTik: <code>/interface ethernet print stats</code>; OPNsense:{' '}
                  <code>ifconfig &lt;iface&gt;</code>).
                </li>
                <li>
                  <strong>Add a router-side static route</strong> — destination{' '}
                  <code>192.168.11.0/24</code>, gateway = the router's SFP+ LAN IP. Permanent fix
                  for the whole LAN. UDM: Settings → Routing → Static Routes.
                </li>
              </ol>
              <p className="text-[11px] text-amber-200/80">
                Open <code className="text-text">/diagnostics → Network audit</code> for the
                live subnet-reachability check — it shows your PC's actual local IP + whether the
                stick's subnet is reachable.
              </p>
            </div>
          )}
          <p className="text-amber-200/80 text-[11px]">
            <strong>Don't have an XGS-PON stick?</strong> Ignore this card. Stock Azores firmware
            on the WAS-110 doesn't expose the 8311 metrics endpoint — see{' '}
            <a href="https://pon.wiki/guides/install-the-8311-community-firmware-on-the-was-110/" target="_blank" rel="noreferrer" className="underline">
              pon.wiki's 8311 install guide
            </a>{' '}
            for the firmware flash that makes this card light up.
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
