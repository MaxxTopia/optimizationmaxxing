import { useEffect, useState } from 'react'
import {
  inTauri,
  networkAuditProbe,
  openExternal,
  type NetworkAudit,
} from '../lib/tauri'

/**
 * NetworkAuditCard — competitive-Fortnite network setup punch-list.
 *
 * Reads Get-NetRoute / Get-NetAdapter / Get-NetNeighbor + a Cloudflare
 * cdn-cgi trace via the Rust `network_audit_probe` command. Renders each
 * pro-setup item as ✓ pass / ✗ fail / ◇ unknown with one-line guidance
 * for the failures.
 *
 * The WAS-110 / XGS-PON stick reachability check is here too because the
 * "your PC is on subnet X, stick mgmt is on Y" guidance is exactly the
 * blocker that bites users who try the 192.168.11.1 web UI in their
 * browser and see a timeout.
 */

interface VendorTips {
  vendor: string
  tips: string[]
  qosUrl?: string
  /** Cited sources users can read deeper. Each is { label, url }. */
  sources?: Array<{ label: string; url: string }>
}

const VENDOR_TIPS: VendorTips[] = [
  {
    vendor: 'Ubiquiti',
    tips: [
      'UniFi → Settings → Internet → Smart Queues — enable, set upload to 95% of measured. Cake AQM cuts bufferbloat from C+ to A+ in one toggle.',
      'Settings → System → Advanced → IPS / IDS — leave OFF for a gaming WAN. Deep packet inspection adds 1–3ms per packet on UDM Pro.',
      'For Fortnite specifically: don\'t enable WAN VLAN tagging unless your ISP requires it (AT&T fiber via the WAS-110 bypass does — VLAN 0, PCP 3).',
    ],
    qosUrl: 'https://help.ui.com/hc/en-us/articles/360002883574-UniFi-Network-Smart-Queues-CAKE',
    sources: [
      { label: 'UniFi Smart Queues + CAKE (Ubiquiti official)', url: 'https://help.ui.com/hc/en-us/articles/360002883574-UniFi-Network-Smart-Queues-CAKE' },
      { label: 'r/Ubiquiti — UDM bufferbloat consensus thread', url: 'https://www.reddit.com/r/Ubiquiti/comments/1c6a5xj/smart_queues_settings_for_gaming/' },
      { label: 'pon.wiki — AT&T XGS-PON + UDM setup', url: 'https://pon.wiki/' },
    ],
  },
  {
    vendor: 'ASUS',
    tips: [
      'Adaptive QoS → Bandwidth Limiter mode → reserve 95% of upload for unspecified. Don\'t pick "Gaming" — the built-in classifier mis-tags Fortnite and starves it.',
      'WAN → Internet Connection → disable NAT acceleration ONLY if you need DPI features. Leave it on for raw throughput.',
      'WAN → Port Forwarding — open a single UDP port 30000-32000 if you\'re on a strict NAT and Fortnite voice cuts out.',
    ],
    sources: [
      { label: 'ASUS Merlin firmware wiki — QoS basics', url: 'https://www.snbforums.com/threads/qos-bandwidth-limiter-explained.55428/' },
      { label: 'r/HomeNetworking — ASUS QoS settings for gaming', url: 'https://www.reddit.com/r/HomeNetworking/comments/yvqzr8/asus_router_settings_for_gaming/' },
    ],
  },
  {
    vendor: 'Netgear',
    tips: [
      'Dynamic QoS off — Netgear\'s classifier adds 5–15ms latency and frequently mis-routes Fortnite.',
      'If your router supports DumaOS (XR series), enable Geo-Filter to pin your matchmaking to your closest data center.',
      'Settings → Wireless → AP isolation off if you stream gameplay to another device on the same LAN.',
    ],
    sources: [
      { label: 'NetDuma / DumaOS Geo-Filter docs', url: 'https://forum.netduma.com/topic/35103-geo-filter-explained/' },
      { label: 'r/Nighthawk — Dynamic QoS gaming consensus', url: 'https://www.reddit.com/r/Nighthawk/comments/14m8bxq/dynamic_qos_on_or_off_for_gaming/' },
    ],
  },
  {
    vendor: 'TP-Link',
    tips: [
      'QoS off entirely on most TP-Link models. The built-in classifier is worse than a flat link.',
      'WAN → IGMP Proxy off unless you\'re on IPTV.',
      'For Deco mesh: disable wireless backhaul, run ethernet between nodes. Wireless backhaul on Deco adds 8–20ms per hop.',
    ],
    sources: [
      { label: 'TP-Link community — Archer QoS for gaming', url: 'https://community.tp-link.com/en/home/forum/topic/518145' },
      { label: 'r/HomeNetworking — Deco wired backhaul thread', url: 'https://www.reddit.com/r/HomeNetworking/comments/176hfk4/deco_mesh_wired_backhaul_setup/' },
    ],
  },
  {
    vendor: 'MikroTik',
    tips: [
      'CAKE shaper at 95% upstream / 99% downstream. /queue interface set ether1 queue=fq-codel for the WAN if you don\'t want full CAKE.',
      '/ip firewall mangle — mark Fortnite UDP (30000-32000) with DSCP 46 (EF) for prioritization on the egress queue.',
      'Disable the default FastTrack rule if you enable mangle marking — FastTrack short-circuits the firewall and your DSCP rules.',
    ],
    sources: [
      { label: 'MikroTik Wiki — Queue Types (CAKE / FQ-CoDel)', url: 'https://help.mikrotik.com/docs/spaces/ROS/pages/8323130/Queues' },
      { label: 'MikroTik Forum — DSCP marking for gaming', url: 'https://forum.mikrotik.com/viewtopic.php?t=176831' },
    ],
  },
  {
    vendor: 'Netgate (pfSense)',
    tips: [
      'Firewall → Traffic Shaper → enable FQ-CoDel on the WAN at 95% of measured upload. Cuts bufferbloat to <30ms loaded.',
      'System → Tunables → set net.inet.tcp.tso=0 if you see micro-stutters on stream upload while gaming.',
      'Don\'t enable Suricata / Snort IDS on the gaming WAN — even in inline mode it adds 2–5ms per packet.',
    ],
    sources: [
      { label: 'pfSense Traffic Shaper docs', url: 'https://docs.netgate.com/pfsense/en/latest/trafficshaper/index.html' },
      { label: 'r/PFSENSE — FQ-CoDel gaming consensus', url: 'https://www.reddit.com/r/PFSENSE/comments/15z7tip/fq_codel_settings_for_gaming/' },
    ],
  },
  {
    vendor: 'Eero',
    tips: [
      'Eero hides QoS behind eero Plus subscription. Without it, you have no shaper — bufferbloat will be whatever your ISP gives you. Consider replacing with a UDM / OPNsense if competitive matters.',
      'eero Plus QoS \"prioritize device\" works but adds ~3ms vs no-QoS link. Test with our /toolkit bufferbloat probe.',
    ],
    sources: [
      { label: 'r/eero — bufferbloat + Plus QoS thread', url: 'https://www.reddit.com/r/eero/comments/195xpkk/bufferbloat_on_eero/' },
    ],
  },
  {
    vendor: 'Google Nest WiFi',
    tips: [
      'Nest WiFi has no manual QoS. The Google-side classifier auto-prioritizes "gaming traffic" but mis-tags Fortnite frequently. If you\'re competitive, replace it.',
      'At minimum: plug your gaming PC into the Nest router\'s LAN port — never to a Wi-Fi-only point.',
    ],
    sources: [
      { label: 'r/GoogleWifi — gaming router replacement consensus', url: 'https://www.reddit.com/r/GoogleWifi/comments/19ehz3q/replacing_nest_wifi_for_gaming/' },
    ],
  },
  {
    vendor: 'AT&T BGW320',
    tips: [
      '**You are still routing through the AT&T gateway.** Bypass it via the WAS-110 SFP+ stick to drop 5-15ms of variable NAT latency. See /hardware → Networking for the canonical setup.',
      'If you must stay on the BGW320: enable IP Passthrough to a real router behind it. Disable the BGW320\'s Wi-Fi radios + firewall.',
      'BGW320 has no usable QoS — the device-priority dropdown does almost nothing measurable.',
    ],
    sources: [
      { label: 'Mark\'s Page — AT&T BGW320 bypass with XGS-PON SFP', url: 'https://marks.page/posts/att-bypass/' },
      { label: 'pon.wiki — WAS-110 install guide', url: 'https://pon.wiki/xgs-pon/ont/bfw-solutions/was-110/' },
      { label: 'r/ATTFiber — bypass + bridge consensus', url: 'https://www.reddit.com/r/ATTFiber/comments/199swap/bgw320_bypass_with_was110_a_complete_guide/' },
    ],
  },
  {
    vendor: 'Verizon FiOS Router',
    tips: [
      'Verizon\'s G3100 router can\'t be fully bypassed (coax-MoCA needed for set-top boxes) but can be bridged. Settings → Network → ONT in Bridge mode if you only have ethernet TV.',
      'Run a real router behind it in IP-passthrough; the G3100 itself becomes a coax → ethernet adapter.',
    ],
    sources: [
      { label: 'r/Verizon — G3100 bridge mode setup', url: 'https://www.reddit.com/r/verizonfios/comments/1850v6m/g3100_bridge_mode_guide/' },
    ],
  },
  {
    vendor: 'Xfinity (Comcast)',
    tips: [
      'XB7/XB8 gateways have horrendous default QoS. Bridge mode (Settings → Gateway → At a Glance → Bridge Mode) disables all the smart-routing nonsense.',
      'Run a real router behind the gateway in bridge mode.',
      'Comcast often won\'t put coax-only customers in bridge mode without a phone call.',
    ],
    sources: [
      { label: 'r/Comcast_Xfinity — XB7/XB8 bridge mode FAQ', url: 'https://www.reddit.com/r/Comcast_Xfinity/comments/1abm4ds/xb7_or_xb8_bridge_mode_what_you_need_to_know/' },
    ],
  },
]

function findTips(vendor: string | null): VendorTips | null {
  if (!vendor) return null
  return VENDOR_TIPS.find((v) => v.vendor.toLowerCase() === vendor.toLowerCase()) ?? null
}

type Verdict = 'pass' | 'warn' | 'fail' | 'unknown'

interface Check {
  label: string
  verdict: Verdict
  detail: string
  /** Optional "do this" guidance shown under a fail/warn. */
  fix?: string
  fixUrl?: string
}

function buildChecks(a: NetworkAudit): Check[] {
  const checks: Check[] = []

  // Wired vs wifi
  if (a.mediaType == null) {
    checks.push({
      label: 'Wired connection',
      verdict: 'unknown',
      detail: 'Could not read adapter media type.',
    })
  } else {
    const isWired = /802\.3|ethernet/i.test(a.mediaType)
    const isWifi = /802\.11|wireless|native/i.test(a.mediaType) && !isWired
    checks.push({
      label: 'Wired connection',
      verdict: isWired ? 'pass' : isWifi ? 'fail' : 'unknown',
      detail: a.mediaType,
      fix: isWifi
        ? 'Plug a Cat6+ cable from your router to this PC. Wi-Fi at gaming time adds 2-15ms of jitter regardless of how good the AP is.'
        : undefined,
    })
  }

  // Link speed
  if (a.linkSpeedMbps == null) {
    checks.push({
      label: 'Link speed',
      verdict: 'unknown',
      detail: 'Adapter did not report link speed.',
    })
  } else {
    const s = a.linkSpeedMbps
    checks.push({
      label: 'Link speed',
      verdict: s >= 1000 ? 'pass' : 'warn',
      detail: `${s >= 1000 ? `${(s / 1000).toFixed(s % 1000 === 0 ? 0 : 1)} Gbps` : `${s} Mbps`} negotiated.`,
      fix:
        s < 1000
          ? 'Check that your cable is Cat5e or better and not damaged. Some old switches drop to 100 Mbps on cable defects.'
          : undefined,
    })
  }

  // CGNAT
  if (a.cgnat == null) {
    checks.push({
      label: 'Direct public IP (no CGNAT)',
      verdict: 'unknown',
      detail: 'Public IP probe did not return (offline or worker blocked).',
    })
  } else {
    checks.push({
      label: 'Direct public IP (no CGNAT)',
      verdict: a.cgnat ? 'fail' : 'pass',
      detail: a.cgnat
        ? `Your public IP ${a.publicIpv4 ?? ''} is in the CGNAT range (100.64.0.0/10) — your ISP is double-NATing you.`
        : `Public IP ${a.publicIpv4 ?? ''} routes directly.`,
      fix: a.cgnat
        ? 'Call your ISP and ask for a non-CGNAT IP (usually free on residential plans, sometimes a "static IP" upcharge on cellular / 5G home internet). Port-forwarding and some P2P paths require this.'
        : undefined,
    })
  }

  // First-hop RTT
  if (a.gatewayRttMs == null) {
    checks.push({
      label: 'First-hop latency',
      verdict: 'unknown',
      detail:
        'Could not measure RTT to the gateway (ICMP blocked AND port-53 TCP probe didn\'t respond — neither is unusual on a hardened router). Non-fatal.',
    })
  } else {
    const rtt = a.gatewayRttMs
    checks.push({
      label: 'First-hop latency',
      verdict: rtt < 2 ? 'pass' : rtt < 5 ? 'warn' : 'fail',
      detail: `${rtt.toFixed(1)} ms to gateway ${a.gatewayIpv4 ?? ''}.`,
      fix:
        rtt >= 5
          ? 'Gateway RTT >5ms on a wired LAN is unusual. Likely causes: Wi-Fi (re-check above), 100Mbps cable, or a misbehaving switch in between.'
          : undefined,
    })
  }

  // WAS-110 / XGS-PON stick reachability
  if (a.stickSubnetReachable == null) {
    checks.push({
      label: 'WAS-110 stick mgmt reachable',
      verdict: 'unknown',
      detail: 'Could not determine local subnet.',
    })
  } else if (a.stickSubnetReachable) {
    checks.push({
      label: 'WAS-110 stick mgmt reachable',
      verdict: 'pass',
      detail: 'Your local subnet matches 192.168.11.0/24 — the stick web UI at https://192.168.11.1 should load.',
    })
  } else {
    checks.push({
      label: 'WAS-110 stick mgmt reachable',
      verdict: 'warn',
      detail: `Your local subnet (${a.localIpv4 ?? '?'}) doesn't include 192.168.11.0/24, so 192.168.11.1 times out from this PC.`,
      fix:
        'Add a static route on your router: destination 192.168.11.0/24, gateway = your router\'s SFP+ LAN IP. OR plug a separate PC directly into the stick\'s host port (it ships in DHCP mode and will hand your PC a 192.168.11.x address). OR read DDMI via your router\'s CLI — see /hardware → Networking.',
    })
  }

  return checks
}

const VERDICT_COLOR: Record<Verdict, string> = {
  pass: 'text-emerald-300',
  warn: 'text-amber-300',
  fail: 'text-red-400',
  unknown: 'text-text-subtle',
}
const VERDICT_GLYPH: Record<Verdict, string> = {
  pass: '✓',
  warn: '◐',
  fail: '✗',
  unknown: '◇',
}

export function NetworkAuditCard() {
  const isNative = inTauri()
  const [audit, setAudit] = useState<NetworkAudit | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    if (!isNative) return
    setLoading(true)
    setErr(null)
    try {
      setAudit(await networkAuditProbe())
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

  const checks = audit ? buildChecks(audit) : []
  const tips = audit ? findTips(audit.gatewayVendor) : null
  const passCount = checks.filter((c) => c.verdict === 'pass').length
  const failCount = checks.filter((c) => c.verdict === 'fail').length
  const warnCount = checks.filter((c) => c.verdict === 'warn').length

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">network audit</p>
          <h3 className="text-base font-semibold">Pro-Fortnite network setup checklist</h3>
          {audit && (
            <p className="text-xs text-text-muted leading-snug mt-0.5 max-w-2xl">
              {passCount} pass · {warnCount} warn · {failCount} fail · adapter{' '}
              <span className="text-text font-mono">{audit.adapterName ?? 'unknown'}</span>
              {audit.gatewayVendor && (
                <>
                  {' '}
                  · gateway <span className="text-accent">{audit.gatewayVendor}</span>
                </>
              )}
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-2.5 py-1 rounded-md border border-border text-[11px] hover:border-border-glow disabled:opacity-50"
        >
          {loading ? 'Probing…' : 'Re-probe'}
        </button>
      </div>

      {err && <p className="text-xs text-red-300">Probe failed: {err}</p>}

      {audit && checks.length > 0 && (
        <ul className="space-y-2">
          {checks.map((c) => (
            <li
              key={c.label}
              className="rounded-md border border-border p-3 space-y-1"
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-sm font-bold tabular-nums ${VERDICT_COLOR[c.verdict]}`}
                >
                  {VERDICT_GLYPH[c.verdict]}
                </span>
                <span className="text-sm text-text font-semibold flex-1">{c.label}</span>
                <span className={`text-[10px] uppercase tracking-widest ${VERDICT_COLOR[c.verdict]}`}>
                  {c.verdict}
                </span>
              </div>
              <p className="text-[11px] text-text-muted leading-snug pl-6">{c.detail}</p>
              {c.fix && (
                <p className="text-[11px] text-amber-200 leading-snug pl-6">
                  <span className="text-accent font-semibold">→ </span>
                  {c.fix}
                  {c.fixUrl && (
                    <button
                      onClick={() => openExternal(c.fixUrl!)}
                      className="ml-1 underline hover:text-text"
                    >
                      docs ↗
                    </button>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {audit?.gatewayIpv4 && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-emerald-300 font-semibold">
            🔗 Router admin page
          </p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <button
              onClick={() => openExternal(`http://${audit.gatewayIpv4}`)}
              className="text-sm font-mono text-emerald-200 underline hover:text-text"
            >
              http://{audit.gatewayIpv4}
            </button>
            <button
              onClick={() => openExternal(`https://${audit.gatewayIpv4}`)}
              className="text-[11px] font-mono text-text-muted underline hover:text-text"
            >
              (try https://)
            </button>
          </div>
          <p className="text-[11px] text-text-muted leading-snug">
            Open in browser to log into your router. Default creds: admin/admin or the sticker
            on the bottom of the router. If you get a cert warning on HTTPS, "Advanced → Proceed"
            is safe — your router uses a self-signed cert on the LAN.
          </p>
        </div>
      )}

      {tips && (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
            👑 Tips for your {tips.vendor}
          </p>
          <ul className="space-y-1 text-[11px] text-text-muted leading-snug">
            {tips.tips.map((t, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-accent shrink-0">▸</span>
                <span dangerouslySetInnerHTML={{ __html: t.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-text">$1</strong>') }} />
              </li>
            ))}
          </ul>
          {(tips.sources && tips.sources.length > 0) && (
            <div className="pt-1.5 border-t border-accent/20 space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                Cited sources
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {tips.sources.map((s) => (
                  <button
                    key={s.url}
                    onClick={() => openExternal(s.url)}
                    className="text-[11px] underline text-text-muted hover:text-text"
                  >
                    {s.label} ↗
                  </button>
                ))}
              </div>
            </div>
          )}
          {tips.qosUrl && !tips.sources?.some((s) => s.url === tips.qosUrl) && (
            <button
              onClick={() => openExternal(tips.qosUrl!)}
              className="text-[11px] underline text-accent hover:text-text"
            >
              {tips.vendor} QoS docs ↗
            </button>
          )}
        </div>
      )}

      {audit && !tips && audit.gatewayVendor === null && audit.gatewayMac && (
        <p className="text-[11px] text-text-subtle leading-snug">
          We didn't recognize the gateway MAC OUI ({audit.gatewayMac.slice(0, 8).toUpperCase()}).
          Drop the OUI + your router model in a DM and we'll add it to the lookup table.
        </p>
      )}

      <p className="text-[10px] text-text-subtle leading-snug pt-2 border-t border-border">
        This is the network-side audit — for bufferbloat run the dedicated{' '}
        <span className="text-text">/toolkit → Bufferbloat probe</span> (loaded RTT measurement,
        ~30s). For driver-side optimization see <span className="text-text">/diagnostics → Driver
        health</span>.
      </p>
    </section>
  )
}
