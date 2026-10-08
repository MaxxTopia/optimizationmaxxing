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
use serde::{Deserialize, Serialize};

use crate::process_helpers::hidden_powershell;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAdapterSettings {
    /// Adapter selected by the default IPv4 route. This is the adapter that
    /// carries normal game traffic; virtual and disconnected adapters are not
    /// included in this read-back.
    pub adapter_name: String,
    /// Stable-ish identity used to make sure an apply/revert targets the
    /// adapter that carried the default route when the snapshot was taken.
    pub interface_index: Option<u32>,
    pub interface_guid: Option<String>,
    pub pnp_device_id: Option<String>,
    pub hardware_interface: Option<bool>,
    pub driver_provider: Option<String>,
    pub driver_version: Option<String>,
    pub driver_date: Option<String>,
    pub rss_enabled: Option<bool>,
    pub rsc_ipv4_enabled: Option<bool>,
    pub rsc_ipv6_enabled: Option<bool>,
    pub lso_ipv4_enabled: Option<bool>,
    pub lso_ipv6_enabled: Option<bool>,
    pub interrupt_moderation: Option<String>,
    pub flow_control: Option<String>,
    pub energy_efficient_ethernet: Option<String>,
    pub allow_computer_to_turn_off_device: Option<String>,
    pub speed_duplex: Option<String>,
    pub jumbo_packet: Option<String>,
    pub receive_buffers: Option<String>,
    pub transmit_buffers: Option<String>,
}

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
    /// Read-only live values for the default-route physical adapter. This is
    /// deliberately a snapshot, not an apply path: users can verify what the
    /// catalog changed without us guessing at vendor-specific defaults.
    pub adapter_settings: Vec<NetworkAdapterSettings>,
}

/// Read-only traffic evidence for the adapter carrying the active IPv4
/// default route. It intentionally records counters and Fortnite endpoint
/// counts, never packet payloads or remote endpoint addresses.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTrafficSnapshot {
    pub captured_at: String,
    pub adapter_name: Option<String>,
    pub interface_index: Option<u32>,
    pub interface_guid: Option<String>,
    pub pnp_device_id: Option<String>,
    pub hardware_interface: Option<bool>,
    pub adapter_status: Option<String>,
    pub driver_provider: Option<String>,
    pub driver_version: Option<String>,
    pub driver_date: Option<String>,
    pub received_bytes: Option<u64>,
    pub sent_bytes: Option<u64>,
    pub received_packets: Option<u64>,
    pub sent_packets: Option<u64>,
    pub received_errors: Option<u64>,
    pub sent_errors: Option<u64>,
    pub received_discards: Option<u64>,
    pub sent_discards: Option<u64>,
    pub fortnite_running: bool,
    pub fortnite_udp_endpoints: u32,
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
    adapterSettings  = @()
}

function Get-AdvancedDisplayValue([string]$adapterName, [string[]]$displayNames) {
    foreach ($displayName in $displayNames) {
        try {
            $property = Get-NetAdapterAdvancedProperty -Name $adapterName -DisplayName $displayName -ErrorAction Stop | Select-Object -First 1
            if ($null -ne $property) { return [string]$property.DisplayValue }
        } catch { }
    }
    return $null
}

try {
    # Filter out virtual/loopback default routes (Hyper-V, WSL, OpenVPN tap)
    # whose NextHop is 0.0.0.0/:: — those interfaces have no IPv4 + no
    # link speed, which is what caused "could not determine local subnet"
    # in v0.1.97. Real WAN routes always have a concrete NextHop.
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' -and $_.NextHop -ne '::' -and $_.InterfaceIndex } |
        Sort-Object @{Expression='RouteMetric';Ascending=$true}, @{Expression='InterfaceMetric';Ascending=$true} |
        Select-Object -First 1
    if ($null -ne $route) {
        $out.gatewayIpv4 = [string]$route.NextHop
        $idx = [int]$route.InterfaceIndex
        $adapter = Get-NetAdapter -InterfaceIndex $idx -ErrorAction Stop
        if ($null -ne $adapter) {
            $out.adapterName = [string]$adapter.InterfaceDescription
            $out.mediaType   = [string]$adapter.MediaType
            $out.localMac    = [string]$adapter.MacAddress

            # Read back only the adapter selected by the default route. These
            # values are vendor-dependent, so missing properties stay null
            # instead of being presented as a failed or guessed setting.
            $pnpDeviceId = $null
            try { $pnpDeviceId = [string]$adapter.PnpDeviceID } catch { }
            if ([string]::IsNullOrWhiteSpace($pnpDeviceId)) {
                try {
                    $pnp = Get-PnpDevice -Class Net -PresentOnly -ErrorAction Stop |
                        Where-Object { $_.FriendlyName -eq $adapter.InterfaceDescription } |
                        Select-Object -First 1
                    if ($null -ne $pnp) { $pnpDeviceId = [string]$pnp.InstanceId }
                } catch { }
            }
            $hardwareInterface = $null
            try {
                $physical = Get-NetAdapter -Physical -InterfaceIndex $idx -ErrorAction Stop
                $hardwareInterface = $null -ne $physical
            } catch { }
            $driverProvider = $null
            $driverVersion = $null
            $driverDate = $null
            if (-not [string]::IsNullOrWhiteSpace($pnpDeviceId)) {
                try {
                    $driver = Get-CimInstance Win32_PnPSignedDriver -ErrorAction Stop |
                        Where-Object { $_.DeviceID -eq $pnpDeviceId } |
                        Select-Object -First 1
                    if ($null -ne $driver) {
                        $driverProvider = [string]$driver.DriverProviderName
                        $driverVersion = [string]$driver.DriverVersion
                        if ($null -ne $driver.DriverDate) {
                            $driverDate = ([datetime]$driver.DriverDate).ToUniversalTime().ToString('yyyy-MM-dd')
                        }
                    }
                } catch { }
            }
            $nic = [ordered]@{
                adapterName = [string]$adapter.InterfaceDescription
                interfaceIndex = [int]$idx
                interfaceGuid = if ($adapter.PSObject.Properties.Name -contains 'InterfaceGuid') { [string]$adapter.InterfaceGuid } else { $null }
                pnpDeviceId = if ([string]::IsNullOrWhiteSpace($pnpDeviceId)) { $null } else { $pnpDeviceId }
                hardwareInterface = $hardwareInterface
                driverProvider = if ([string]::IsNullOrWhiteSpace($driverProvider)) { $null } else { $driverProvider }
                driverVersion = if ([string]::IsNullOrWhiteSpace($driverVersion)) { $null } else { $driverVersion }
                driverDate = if ([string]::IsNullOrWhiteSpace($driverDate)) { $null } else { $driverDate }
                rssEnabled = $null
                rscIpv4Enabled = $null
                rscIpv6Enabled = $null
                lsoIpv4Enabled = $null
                lsoIpv6Enabled = $null
                interruptModeration = $null
                flowControl = $null
                energyEfficientEthernet = $null
                allowComputerToTurnOffDevice = $null
                speedDuplex = $null
                jumboPacket = $null
                receiveBuffers = $null
                transmitBuffers = $null
            }
            try {
                $rss = Get-NetAdapterRss -Name $adapter.Name -ErrorAction Stop | Select-Object -First 1
                if ($null -ne $rss) { $nic.rssEnabled = [bool]$rss.Enabled }
            } catch { }
            try {
                $rsc = Get-NetAdapterRsc -Name $adapter.Name -ErrorAction Stop | Select-Object -First 1
                if ($null -ne $rsc) {
                    $nic.rscIpv4Enabled = [bool]$rsc.IPv4Enabled
                    $nic.rscIpv6Enabled = [bool]$rsc.IPv6Enabled
                }
            } catch { }
            try {
                $lso = Get-NetAdapterLso -Name $adapter.Name -ErrorAction Stop | Select-Object -First 1
                if ($null -ne $lso) {
                    $nic.lsoIpv4Enabled = [bool]$lso.IPv4Enabled
                    $nic.lsoIpv6Enabled = [bool]$lso.IPv6Enabled
                }
            } catch { }
            $nic.interruptModeration = Get-AdvancedDisplayValue $adapter.Name @('Interrupt Moderation')
            $nic.flowControl = Get-AdvancedDisplayValue $adapter.Name @('Flow Control')
            $nic.energyEfficientEthernet = Get-AdvancedDisplayValue $adapter.Name @('Energy Efficient Ethernet', 'Energy-Efficient Ethernet', 'Green Ethernet', 'EEE', 'Advanced EEE', 'Power Saving Mode', 'Gigabit Lite', 'Ultra Low Power Mode')
            $nic.speedDuplex = Get-AdvancedDisplayValue $adapter.Name @('Speed & Duplex', 'Speed Duplex')
            $nic.jumboPacket = Get-AdvancedDisplayValue $adapter.Name @('Jumbo Packet', 'Jumbo Frames')
            $nic.receiveBuffers = Get-AdvancedDisplayValue $adapter.Name @('Receive Buffers', 'Receive Buffer')
            $nic.transmitBuffers = Get-AdvancedDisplayValue $adapter.Name @('Transmit Buffers', 'Transmit Buffer')
            try {
                $pm = Get-NetAdapterPowerManagement -Name $adapter.Name -ErrorAction Stop | Select-Object -First 1
                if ($null -ne $pm -and $null -ne $pm.AllowComputerToTurnOffDevice) {
                    $nic.allowComputerToTurnOffDevice = [string]$pm.AllowComputerToTurnOffDevice
                }
            } catch { }
            $out.adapterSettings = @($nic)
        }
        # CIM Win32_NetworkAdapter.Speed is always Uint64 bps. Get-NetAdapter's
        # LinkSpeed is variably a string ("1 Gbps") or uint64 across PS 5.1/7
        # — div-by-1000000 against the string version threw silently and
        # killed the rest of the try block. CIM avoids that entirely.
        try {
            $cim = Get-CimInstance Win32_NetworkAdapter -Filter "InterfaceIndex=$idx" -ErrorAction Stop |
                Select-Object -First 1
            if ($null -ne $cim -and $null -ne $cim.Speed -and [uint64]$cim.Speed -gt 0) {
                $out.linkSpeedMbps = [int64]([uint64]$cim.Speed / 1000000)
            }
        } catch { }
        # APIPA (169.254/16) + loopback should never qualify as the local
        # IP for the default-route adapter; reject explicitly.
        $ipcfg = Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
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
        # ICMP first; many home routers respond. If blocked we fall back to
        # a TCP probe against port 53 (DNS) which residential gateways
        # almost universally serve. Sub-millisecond LAN-RTT either way.
        try {
            $pingResults = Test-Connection -ComputerName $out.gatewayIpv4 -Count 3 -ErrorAction Stop
            if ($null -ne $pingResults) {
                $avg = ($pingResults | Measure-Object -Property ResponseTime -Average).Average
                if ($null -ne $avg) { $out.gatewayRttMs = [double]$avg }
            }
        } catch { }
        if ($null -eq $out.gatewayRttMs) {
            try {
                $tcp = Measure-Command {
                    $client = New-Object System.Net.Sockets.TcpClient
                    $iar = $client.BeginConnect($out.gatewayIpv4, 53, $null, $null)
                    $ok = $iar.AsyncWaitHandle.WaitOne(800, $false)
                    if ($ok) { $client.EndConnect($iar) }
                    $client.Close()
                }
                if ($tcp.TotalMilliseconds -gt 0 -and $tcp.TotalMilliseconds -lt 800) {
                    $out.gatewayRttMs = [double]$tcp.TotalMilliseconds
                }
            } catch { }
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
            adapter_settings: Vec::new(),
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
        #[serde(rename = "adapterSettings", default)]
        adapter_settings: Vec<NetworkAdapterSettings>,
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
        adapter_settings: raw.adapter_settings,
    })
}

/// Reads low-cost adapter counters and Fortnite process/UDP presence without
/// inspecting packet contents. This is deliberately separate from the full
/// audit because experiments may sample it several times in a short window.
pub fn read_network_traffic_snapshot() -> Result<NetworkTrafficSnapshot> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$out = [ordered]@{
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    adapterName = $null
    interfaceIndex = $null
    interfaceGuid = $null
    pnpDeviceId = $null
    hardwareInterface = $null
    adapterStatus = $null
    driverProvider = $null
    driverVersion = $null
    driverDate = $null
    receivedBytes = $null
    sentBytes = $null
    receivedPackets = $null
    sentPackets = $null
    receivedErrors = $null
    sentErrors = $null
    receivedDiscards = $null
    sentDiscards = $null
    fortniteRunning = $false
    fortniteUdpEndpoints = 0
}

function Get-StatValue([object]$stats, [string[]]$names) {
    foreach ($name in $names) {
        try {
            $property = $stats.PSObject.Properties[$name]
            if ($null -ne $property -and $null -ne $property.Value) {
                return [uint64]$property.Value
            }
        } catch { }
    }
    return $null
}

try {
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' -and $_.InterfaceIndex } |
        Sort-Object @{Expression='RouteMetric';Ascending=$true}, @{Expression='InterfaceMetric';Ascending=$true} |
        Select-Object -First 1
    if ($null -ne $route) {
        $idx = [int]$route.InterfaceIndex
        $adapter = Get-NetAdapter -InterfaceIndex $idx -ErrorAction Stop | Select-Object -First 1
        if ($null -ne $adapter) {
            $out.adapterName = [string]$adapter.InterfaceDescription
            $out.interfaceIndex = $idx
            $out.adapterStatus = [string]$adapter.Status
            if ($adapter.PSObject.Properties.Name -contains 'InterfaceGuid') { $out.interfaceGuid = [string]$adapter.InterfaceGuid }
            try { $out.pnpDeviceId = [string]$adapter.PnpDeviceID } catch { }
            try { $out.hardwareInterface = $null -ne (Get-NetAdapter -Physical -InterfaceIndex $idx -ErrorAction Stop) } catch { }

            if ([string]::IsNullOrWhiteSpace([string]$out.pnpDeviceId)) {
                try {
                    $pnp = Get-PnpDevice -Class Net -PresentOnly -ErrorAction Stop |
                        Where-Object { $_.FriendlyName -eq $adapter.InterfaceDescription } |
                        Select-Object -First 1
                    if ($null -ne $pnp) { $out.pnpDeviceId = [string]$pnp.InstanceId }
                } catch { }
            }
            if (-not [string]::IsNullOrWhiteSpace([string]$out.pnpDeviceId)) {
                try {
                    $driver = Get-CimInstance Win32_PnPSignedDriver -ErrorAction Stop |
                        Where-Object { $_.DeviceID -eq [string]$out.pnpDeviceId } |
                        Select-Object -First 1
                    if ($null -ne $driver) {
                        $out.driverProvider = [string]$driver.DriverProviderName
                        $out.driverVersion = [string]$driver.DriverVersion
                        if ($null -ne $driver.DriverDate) {
                            $out.driverDate = ([datetime]$driver.DriverDate).ToUniversalTime().ToString('yyyy-MM-dd')
                        }
                    }
                } catch { }
            }

            try {
                $stats = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction Stop | Select-Object -First 1
                if ($null -ne $stats) {
                    $out.receivedBytes = Get-StatValue $stats @('ReceivedBytes')
                    $out.sentBytes = Get-StatValue $stats @('SentBytes','OutboundBytes')
                    $out.receivedPackets = Get-StatValue $stats @('ReceivedUnicastPackets','ReceivedPackets')
                    $out.sentPackets = Get-StatValue $stats @('SentUnicastPackets','SentPackets','OutboundPackets')
                    $out.receivedErrors = Get-StatValue $stats @('ReceivedPacketErrors','ReceivedErrors')
                    $out.sentErrors = Get-StatValue $stats @('OutboundPacketErrors','SentPacketErrors','SentErrors')
                    $out.receivedDiscards = Get-StatValue $stats @('ReceivedDiscardedPackets','ReceivedDiscards')
                    $out.sentDiscards = Get-StatValue $stats @('OutboundDiscardedPackets','SentDiscards')
                }
            } catch { }
        }
    }
} catch { }

try {
    $gameProcesses = @(Get-Process -Name 'FortniteClient-Win64-Shipping','FortniteClient-Win64-Shipping_EAC','FortniteClient-Win64-Shipping_BE' -ErrorAction SilentlyContinue)
    $out.fortniteRunning = $gameProcesses.Count -gt 0
    $udpCount = 0
    foreach ($gameProcess in $gameProcesses) {
        try { $udpCount += @(Get-NetUDPEndpoint -OwningProcess ([int]$gameProcess.Id) -ErrorAction SilentlyContinue).Count } catch { }
    }
    $out.fortniteUdpEndpoints = [int]$udpCount
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
        .context("spawn PowerShell for network traffic snapshot")?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(NetworkTrafficSnapshot {
            captured_at: String::new(),
            adapter_name: None,
            interface_index: None,
            interface_guid: None,
            pnp_device_id: None,
            hardware_interface: None,
            adapter_status: None,
            driver_provider: None,
            driver_version: None,
            driver_date: None,
            received_bytes: None,
            sent_bytes: None,
            received_packets: None,
            sent_packets: None,
            received_errors: None,
            sent_errors: None,
            received_discards: None,
            sent_discards: None,
            fortnite_running: false,
            fortnite_udp_endpoints: 0,
        });
    }

    serde_json::from_str(&stdout).with_context(|| format!("parse network traffic JSON: {stdout}"))
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
