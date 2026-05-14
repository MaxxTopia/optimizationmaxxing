//! Network audit — probes the local network for the items that decide
//! whether a rig is set up for low-input-lag competitive play.
//!
//! Checks:
//!   * active network adapter (name, MAC, link speed)
//!   * wired vs wifi (wifi is a competitive-Fortnite handicap)
//!   * default gateway IP + MAC
//!   * gateway vendor (OUI → router brand lookup)
//!   * local subnet (used to decide whether the WAS-110 stick at
//!     192.168.11.x is reachable)
//!   * first-hop RTT (gateway ping)
//!   * public IP + CGNAT detection (100.64.0.0/10 — your ISP is NATing you)
//!
//! Everything is best-effort; a missing piece doesn't fail the whole call.
//! The frontend renders pass/fail/unknown per check.

use anyhow::{Context, Result};
use serde::Serialize;

use crate::process_helpers::hidden_powershell;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAudit {
    /// Friendly adapter name ("Realtek Gaming 2.5GbE Family Controller").
    pub adapter_name: Option<String>,
    /// "Ethernet" / "Wifi" / "Other" — the link-type bucket. Wifi at gaming
    /// time is a competitive handicap regardless of how good the AP is.
    pub media_type: Option<String>,
    /// Link speed in Mbps. 1000 = Gigabit, 2500 = 2.5GbE, 10000 = 10GbE.
    pub link_speed_mbps: Option<u64>,
    /// MAC of the local adapter.
    pub local_mac: Option<String>,
    /// Local IPv4 + prefix length (e.g. "192.168.1.42/24").
    pub local_ipv4: Option<String>,
    /// Default gateway IPv4.
    pub gateway_ipv4: Option<String>,
    /// Default gateway MAC (resolved via ARP / NDP cache).
    pub gateway_mac: Option<String>,
    /// Best-effort router brand guess from the gateway MAC OUI.
    pub gateway_vendor: Option<String>,
    /// First-hop RTT to the gateway in milliseconds. None = ping failed.
    pub gateway_rtt_ms: Option<f32>,
    /// Public IPv4 as seen by the rest of the internet — via
    /// `https://cloudflare.com/cdn-cgi/trace`. None = offline / blocked.
    pub public_ipv4: Option<String>,
    /// True if `public_ipv4` is inside the CGNAT range 100.64.0.0/10. Your
    /// ISP is NATing you — port-forwarding won't work; double-NAT path.
    pub cgnat: Option<bool>,
    /// True if `local_ipv4` is on the same subnet as `192.168.11.1` (the
    /// WAS-110 management IP). If false the user needs a static route to
    /// reach the stick's web UI.
    pub stick_subnet_reachable: Option<bool>,
}

/// Bundled OUI → vendor mapping. Curated to the routers a competitive
/// home-rig user might actually have. The match is on the 24-bit (3-byte)
/// OUI prefix; we collapse byte separators to colons for the lookup.
const ROUTER_OUIS: &[(&str, &str)] = &[
    // Ubiquiti — UDM / EdgeRouter / UniFi switches
    ("00:15:6D", "Ubiquiti"),
    ("04:18:D6", "Ubiquiti"),
    ("18:E8:29", "Ubiquiti"),
    ("24:5A:4C", "Ubiquiti"),
    ("44:D9:E7", "Ubiquiti"),
    ("68:72:51", "Ubiquiti"),
    ("74:83:C2", "Ubiquiti"),
    ("80:2A:A8", "Ubiquiti"),
    ("D0:21:F9", "Ubiquiti"),
    ("DC:9F:DB", "Ubiquiti"),
    ("E0:63:DA", "Ubiquiti"),
    ("F0:9F:C2", "Ubiquiti"),
    ("FC:EC:DA", "Ubiquiti"),
    // ASUS — RT/ROG/ZenWiFi
    ("04:D9:F5", "ASUS"),
    ("1C:87:2C", "ASUS"),
    ("38:2C:4A", "ASUS"),
    ("50:46:5D", "ASUS"),
    ("AC:9E:17", "ASUS"),
    ("BC:EE:7B", "ASUS"),
    ("D8:50:E6", "ASUS"),
    ("E0:3F:49", "ASUS"),
    // Netgear — Nighthawk / Orbi
    ("28:C6:8E", "Netgear"),
    ("9C:3D:CF", "Netgear"),
    ("A0:40:A0", "Netgear"),
    ("B0:B9:8A", "Netgear"),
    ("C4:04:15", "Netgear"),
    // TP-Link — Archer / Deco
    ("14:CC:20", "TP-Link"),
    ("50:C7:BF", "TP-Link"),
    ("AC:84:C6", "TP-Link"),
    ("E8:DE:27", "TP-Link"),
    ("F4:F2:6D", "TP-Link"),
    // MikroTik — RouterBOARD / CHR
    ("4C:5E:0C", "MikroTik"),
    ("64:D1:54", "MikroTik"),
    ("6C:3B:6B", "MikroTik"),
    ("B8:69:F4", "MikroTik"),
    ("D4:CA:6D", "MikroTik"),
    ("E4:8D:8C", "MikroTik"),
    // pfSense / Netgate appliances (commonly Intel NUC NIC OUIs)
    ("00:08:A2", "Netgate (pfSense)"),
    // OPNsense self-builds usually expose an Intel / Realtek NIC OUI; we
    // can't reliably differentiate from a bare Linux box. Skipped.
    // Eero
    ("AC:38:70", "Eero"),
    ("F0:18:98", "Eero"),
    // Google Nest WiFi / OnHub
    ("6C:AD:F8", "Google Nest WiFi"),
    ("F4:F5:E8", "Google Nest WiFi"),
    // AT&T BGW320 (Nokia / Arris OUIs)
    ("CC:69:B0", "AT&T BGW320"),
    ("D8:00:E0", "AT&T BGW320"),
    ("F4:8E:38", "AT&T BGW320"),
    // Verizon FiOS Router (Greenwave / Actiontec)
    ("48:6F:73", "Verizon FiOS Router"),
    // Xfinity / Comcast gateways
    ("00:25:F1", "Xfinity (Comcast)"),
    ("44:8B:32", "Xfinity (Comcast)"),
    // Apple AirPort / Time Capsule
    ("00:1B:63", "Apple AirPort"),
    ("00:23:DF", "Apple AirPort"),
    // Synology routers
    ("00:11:32", "Synology"),
    // Cisco / Linksys consumer
    ("00:18:39", "Cisco / Linksys"),
    ("00:1B:11", "Cisco / Linksys"),
];

fn vendor_from_mac(mac: &str) -> Option<String> {
    let normalized = mac.replace('-', ":").to_ascii_uppercase();
    if normalized.len() < 8 {
        return None;
    }
    let prefix = &normalized[..8];
    ROUTER_OUIS
        .iter()
        .find(|(oui, _)| oui == &prefix)
        .map(|(_, vendor)| (*vendor).to_string())
}

/// `192.168.11.0/24` covers the WAS-110 default management subnet. If the
/// local IPv4 is on the same /24, the stick's web UI is reachable; otherwise
/// the user needs a static route added on their router.
fn same_subnet_as_stick(local_ip: &str) -> bool {
    local_ip.starts_with("192.168.11.")
}

/// `100.64.0.0/10` — RFC 6598 CGNAT range. Public IPs inside this range mean
/// the ISP is double-NATing you; port-forwarding from the public side won't
/// work and some games' P2P fallback (relay servers) gets used instead.
fn is_cgnat(public_ip: &str) -> bool {
    if let Some(rest) = public_ip.strip_prefix("100.") {
        if let Some(octet2_str) = rest.split('.').next() {
            if let Ok(octet2) = octet2_str.parse::<u8>() {
                return (64..=127).contains(&octet2);
            }
        }
    }
    false
}

pub fn read_network_audit() -> Result<NetworkAudit> {
    // One PowerShell roundtrip that emits a JSON blob; saves repeated process
    // spawn overhead. Uses Get-NetRoute / Get-NetAdapter / Get-NetNeighbor —
    // all built into Windows 8+ so no extra deps.
    //
    // The Public-IP probe hits cloudflare.com/cdn-cgi/trace, a 1KB plain-text
    // response that includes `ip=<your.public.ip>`. Fails to null on offline
    // / blocked.
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$out = [ordered]@{
    adapterName     = $null
    mediaType       = $null
    linkSpeedMbps   = $null
    localMac        = $null
    localIpv4       = $null
    gatewayIpv4     = $null
    gatewayMac      = $null
    gatewayRttMs    = $null
    publicIpv4      = $null
}

try {
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
        Sort-Object -Property RouteMetric |
        Select-Object -First 1
    if ($null -ne $route) {
        $out.gatewayIpv4 = [string]$route.NextHop
        $idx = $route.InterfaceIndex
        $adapter = Get-NetAdapter -InterfaceIndex $idx -ErrorAction Stop
        if ($null -ne $adapter) {
            $out.adapterName   = [string]$adapter.InterfaceDescription
            $out.mediaType     = [string]$adapter.MediaType
            $out.linkSpeedMbps = [int64]($adapter.LinkSpeed / 1000000)
            $out.localMac      = [string]$adapter.MacAddress
        }
        $ipcfg = Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.PrefixOrigin -ne 'WellKnown' } |
            Select-Object -First 1
        if ($null -ne $ipcfg) {
            $out.localIpv4 = "$($ipcfg.IPAddress)/$($ipcfg.PrefixLength)"
        }
        $neigh = Get-NetNeighbor -IPAddress $out.gatewayIpv4 -ErrorAction Stop |
            Where-Object { $_.LinkLayerAddress -and $_.LinkLayerAddress -ne '00-00-00-00-00-00' } |
            Select-Object -First 1
        if ($null -ne $neigh) {
            $out.gatewayMac = [string]$neigh.LinkLayerAddress
        }
        # First-hop ping. -Count 3 over 1 second is enough to estimate; we
        # don't need stddev for the audit summary (the DPC card has fuller
        # latency stats).
        $ping = Test-Connection -ComputerName $out.gatewayIpv4 -Count 3 -ErrorAction Stop |
            Measure-Object -Property ResponseTime -Average
        if ($null -ne $ping -and $null -ne $ping.Average) {
            $out.gatewayRttMs = [double]$ping.Average
        }
    }
} catch { }

# Public-IP probe — Cloudflare cdn-cgi/trace returns plain text key=value
# pairs. 1KB total. -UseBasicParsing keeps it dependency-free.
try {
    $resp = Invoke-WebRequest -Uri 'https://cloudflare.com/cdn-cgi/trace' -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
    if ($null -ne $resp -and $resp.Content) {
        $line = $resp.Content -split "`n" | Where-Object { $_ -like 'ip=*' } | Select-Object -First 1
        if ($line) {
            $out.publicIpv4 = $line.Substring(3).Trim()
        }
    }
} catch { }

$out | ConvertTo-Json -Compress
"#;

    let output = hidden_powershell()
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .context("spawn PowerShell for network audit")?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(NetworkAudit {
            adapter_name: None,
            media_type: None,
            link_speed_mbps: None,
            local_mac: None,
            local_ipv4: None,
            gateway_ipv4: None,
            gateway_mac: None,
            gateway_vendor: None,
            gateway_rtt_ms: None,
            public_ipv4: None,
            cgnat: None,
            stick_subnet_reachable: None,
        });
    }

    #[derive(serde::Deserialize)]
    struct Raw {
        #[serde(rename = "adapterName")]
        adapter_name: Option<String>,
        #[serde(rename = "mediaType")]
        media_type: Option<String>,
        #[serde(rename = "linkSpeedMbps")]
        link_speed_mbps: Option<u64>,
        #[serde(rename = "localMac")]
        local_mac: Option<String>,
        #[serde(rename = "localIpv4")]
        local_ipv4: Option<String>,
        #[serde(rename = "gatewayIpv4")]
        gateway_ipv4: Option<String>,
        #[serde(rename = "gatewayMac")]
        gateway_mac: Option<String>,
        #[serde(rename = "gatewayRttMs")]
        gateway_rtt_ms: Option<f32>,
        #[serde(rename = "publicIpv4")]
        public_ipv4: Option<String>,
    }

    let raw: Raw = serde_json::from_str(&stdout)
        .with_context(|| format!("parse network-audit JSON: {stdout}"))?;

    let gateway_vendor = raw.gateway_mac.as_deref().and_then(vendor_from_mac);
    let cgnat = raw.public_ipv4.as_deref().map(is_cgnat);
    let stick_subnet_reachable = raw
        .local_ipv4
        .as_deref()
        .map(|ip| same_subnet_as_stick(ip.split('/').next().unwrap_or(ip)));

    Ok(NetworkAudit {
        adapter_name: raw.adapter_name.filter(|s| !s.is_empty()),
        media_type: raw.media_type.filter(|s| !s.is_empty()),
        link_speed_mbps: raw.link_speed_mbps.filter(|n| *n > 0),
        local_mac: raw.local_mac.filter(|s| !s.is_empty()),
        local_ipv4: raw.local_ipv4.filter(|s| !s.is_empty()),
        gateway_ipv4: raw.gateway_ipv4.filter(|s| !s.is_empty()),
        gateway_mac: raw.gateway_mac.filter(|s| !s.is_empty()),
        gateway_vendor,
        gateway_rtt_ms: raw.gateway_rtt_ms,
        public_ipv4: raw.public_ipv4.filter(|s| !s.is_empty()),
        cgnat,
        stick_subnet_reachable,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendor_lookup_ubiquiti() {
        assert_eq!(vendor_from_mac("18:E8:29:AB:CD:EF"), Some("Ubiquiti".to_string()));
        assert_eq!(vendor_from_mac("18-E8-29-AB-CD-EF"), Some("Ubiquiti".to_string()));
        assert_eq!(vendor_from_mac("18:e8:29:ab:cd:ef"), Some("Ubiquiti".to_string()));
    }

    #[test]
    fn vendor_lookup_att_bgw320() {
        assert_eq!(
            vendor_from_mac("CC:69:B0:11:22:33"),
            Some("AT&T BGW320".to_string()),
        );
    }

    #[test]
    fn vendor_lookup_unknown() {
        assert!(vendor_from_mac("AA:BB:CC:11:22:33").is_none());
    }

    #[test]
    fn vendor_lookup_short_mac() {
        assert!(vendor_from_mac("18:E8").is_none());
        assert!(vendor_from_mac("").is_none());
    }

    #[test]
    fn cgnat_detects_rfc6598_range() {
        assert!(is_cgnat("100.64.0.1"));
        assert!(is_cgnat("100.127.255.254"));
    }

    #[test]
    fn cgnat_rejects_outside_range() {
        assert!(!is_cgnat("100.63.255.254")); // just below
        assert!(!is_cgnat("100.128.0.1")); // just above
        assert!(!is_cgnat("192.168.1.1"));
        assert!(!is_cgnat("8.8.8.8"));
        assert!(!is_cgnat(""));
    }

    #[test]
    fn stick_subnet_reachable_check() {
        assert!(same_subnet_as_stick("192.168.11.42"));
        assert!(same_subnet_as_stick("192.168.11.1"));
        assert!(!same_subnet_as_stick("192.168.1.42"));
        assert!(!same_subnet_as_stick("10.0.0.1"));
    }
}
