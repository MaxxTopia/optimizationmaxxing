//! Toolkit module — live system metrics + utility-action launchers
//! that don't fit the engine/snapshot model. Temps, disk cleanup,
//! disk free-space probe, etc. All read-only or fire-and-forget.

use anyhow::Context;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;
use wmi::{Variant, WMIConnection};

use crate::process_helpers::{hidden_bcdedit, hidden_ping, hidden_powershell};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThermalReading {
    pub source: String,
    pub celsius: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThermalSnapshot {
    pub probes: Vec<ThermalReading>,
    /// "MSAcpi_ThermalZoneTemperature reports motherboard probes only.
    /// CPU/GPU sensors require LibreHardwareMonitor / HWInfo."
    pub disclaimer: String,
}

pub fn read_temps() -> anyhow::Result<ThermalSnapshot> {
    let com = wmi::COMLibrary::new()?;
    let wmi_con = WMIConnection::with_namespace_path("root\\wmi", com)
        .context("wmi root\\wmi namespace unavailable")?;
    let rows: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT InstanceName, CurrentTemperature FROM MSAcpi_ThermalZoneTemperature")
        .unwrap_or_default();

    let mut probes = Vec::new();
    for r in rows {
        let raw = match r.get("CurrentTemperature") {
            Some(Variant::UI4(n)) => *n as f32,
            Some(Variant::I4(n)) => *n as f32,
            _ => continue,
        };
        // CurrentTemperature is in tenths of Kelvin.
        let celsius = raw / 10.0 - 273.15;
        if celsius < 0.0 || celsius > 150.0 {
            continue; // garbage probe
        }
        let source = match r.get("InstanceName") {
            Some(Variant::String(s)) => shorten_thermal_instance(s),
            _ => "ACPI Probe".to_string(),
        };
        probes.push(ThermalReading { source, celsius });
    }

    Ok(ThermalSnapshot {
        probes,
        disclaimer: "ACPI thermal zones only — typically motherboard probes. \
            For CPU/GPU package temps install LibreHardwareMonitor or HWInfo and we'll wire it next."
            .to_string(),
    })
}

fn shorten_thermal_instance(s: &str) -> String {
    // e.g. "ACPI\\ThermalZone\\TZ00_0" → "TZ00"
    s.split('\\').last().unwrap_or(s).split('_').next().unwrap_or(s).to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskFreeRow {
    pub drive_letter: String,
    pub label: Option<String>,
    pub size_gb: u32,
    pub free_gb: u32,
    pub free_percent: f32,
}

pub fn read_disk_free() -> anyhow::Result<Vec<DiskFreeRow>> {
    let com = wmi::COMLibrary::new()?;
    let wmi_con = WMIConnection::new(com)?;
    let rows: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query(
            "SELECT DeviceID, VolumeName, Size, FreeSpace, DriveType FROM Win32_LogicalDisk WHERE DriveType = 3",
        )
        .unwrap_or_default();

    let mut out = Vec::new();
    for r in rows {
        let id = match r.get("DeviceID") {
            Some(Variant::String(s)) => s.clone(),
            _ => continue,
        };
        let size = u64_or_default(&r, "Size");
        let free = u64_or_default(&r, "FreeSpace");
        if size == 0 {
            continue;
        }
        let label = match r.get("VolumeName") {
            Some(Variant::String(s)) if !s.trim().is_empty() => Some(s.clone()),
            _ => None,
        };
        let size_gb = (size / 1_073_741_824) as u32;
        let free_gb = (free / 1_073_741_824) as u32;
        let free_percent = (free as f64 / size as f64 * 100.0) as f32;
        out.push(DiskFreeRow {
            drive_letter: id,
            label,
            size_gb,
            free_gb,
            free_percent,
        });
    }
    Ok(out)
}

fn u64_or_default(row: &HashMap<String, Variant>, key: &str) -> u64 {
    match row.get(key) {
        Some(Variant::UI8(n)) => *n,
        Some(Variant::I8(n)) => *n as u64,
        Some(Variant::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

/// Spawns Windows' built-in Disk Cleanup utility (cleanmgr.exe). Returns
/// immediately; cleanmgr handles its own elevation prompt if needed.
pub fn launch_disk_cleanup() -> anyhow::Result<()> {
    Command::new("cleanmgr.exe")
        .arg("/lowdisk")
        .spawn()
        .context("spawning cleanmgr.exe")?;
    Ok(())
}

/// Spawns the Windows Memory Diagnostic scheduler.
pub fn launch_memtest() -> anyhow::Result<()> {
    Command::new("mdsched.exe")
        .spawn()
        .context("spawning mdsched.exe")?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DpcSnapshot {
    /// Total %-DPC time across all logical processors. 0-100.
    pub total_dpc_percent: f32,
    /// Total %-interrupt time across all logical processors. 0-100.
    pub total_interrupt_percent: f32,
    /// Per-CPU breakdown. Values 0-100. Cooked from
    /// Win32_PerfFormattedData_PerfOS_Processor.
    pub per_cpu: Vec<DpcPerCpu>,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DpcPerCpu {
    /// "0", "1", ..., or "_Total" — the WMI Name field.
    pub name: String,
    pub dpc_percent: f32,
    pub interrupt_percent: f32,
}

/// Reads DPC + interrupt-time percentages from the formatted-perf WMI class.
/// Single-shot, ~50 ms latency. Returns aggregate + per-CPU rows.
///
/// "% DPC Time" is the share of CPU spent servicing deferred procedure calls
/// — driver work that interrupted handlers deferred. Industry rule of thumb:
/// a healthy gaming rig stays under 1-2 % at idle. Anything above 5 % at idle
/// is worth investigating.
///
/// Audited 2026-05-07: switched from `Win32_PerfFormattedData_PerfOS_Processor`
/// (legacy, flat 0..N indexes) to `Win32_PerfFormattedData_Counters_ProcessorInformation`
/// — same fields, but the Name field is `"<node>,<cpu>"` exposing per-NUMA-node
/// + per-CCD layout. On hybrid Intel 12th-gen+ and dual-CCD Ryzen rigs, that
/// breakdown is exactly what surfaces "the network DPC is hammering CCD 1
/// while CCD 0 is idle."
pub fn read_dpc_snapshot() -> anyhow::Result<DpcSnapshot> {
    let com = wmi::COMLibrary::new()?;
    let wmi_con = WMIConnection::new(com)?;
    let rows: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query(
            "SELECT Name, PercentDPCTime, PercentInterruptTime FROM Win32_PerfFormattedData_Counters_ProcessorInformation",
        )
        .unwrap_or_default();

    let mut per_cpu = Vec::new();
    let mut total_dpc = 0.0f32;
    let mut total_int = 0.0f32;
    for r in rows {
        let name = match r.get("Name") {
            Some(Variant::String(s)) => s.clone(),
            _ => continue,
        };
        let dpc_percent = u64_or_default(&r, "PercentDPCTime") as f32;
        let interrupt_percent = u64_or_default(&r, "PercentInterruptTime") as f32;
        // ProcessorInformation Name shapes:
        //   "_Total"        → system-wide aggregate (use as headline)
        //   "0,_Total"      → per-NUMA-node aggregate (skip — duplicate of _Total on single-socket)
        //   "0,1"           → node 0, cpu 1 (per-core row)
        // PerfOS_Processor (legacy fallback) shapes: "_Total" / "0" / "1" — also handled.
        if name == "_Total" {
            total_dpc = dpc_percent;
            total_int = interrupt_percent;
        } else if name.contains(",_Total") {
            // Per-node aggregate; skip (we already have system _Total + per-core).
            continue;
        } else {
            per_cpu.push(DpcPerCpu {
                name,
                dpc_percent,
                interrupt_percent,
            });
        }
    }
    // Sort per-CPU by (node, cpu) when shaped "node,cpu", else flat numeric.
    per_cpu.sort_by(|a, b| {
        let parse_pair = |s: &str| -> (u32, u32) {
            if let Some((node, cpu)) = s.split_once(',') {
                (
                    node.parse().unwrap_or(u32::MAX),
                    cpu.parse().unwrap_or(u32::MAX),
                )
            } else {
                (0, s.parse().unwrap_or(u32::MAX))
            }
        };
        parse_pair(&a.name).cmp(&parse_pair(&b.name))
    });

    Ok(DpcSnapshot {
        total_dpc_percent: total_dpc,
        total_interrupt_percent: total_int,
        per_cpu,
        captured_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    /// Display label for the target (e.g. "Cloudflare DNS").
    pub label: String,
    /// Hostname or IP that was pinged.
    pub target: String,
    /// Average round-trip ms across the 4 packets, or null if all failed.
    pub avg_ms: Option<u32>,
    /// Min round-trip ms.
    pub min_ms: Option<u32>,
    /// Max round-trip ms (jitter indicator).
    pub max_ms: Option<u32>,
    /// Packets received (out of 4).
    pub received: u32,
}

/// Run 4 ICMP echo requests to each target via the system `ping` command.
/// Parses Windows ping output for min/avg/max + received count. Sequential
/// (4-7s total for 6 targets) — could parallelize but ICMP storms can trip
/// firewalls. Targets must be supplied by caller (frontend curates the list).
pub fn run_ping_probes(targets: Vec<(String, String)>) -> Vec<PingResult> {
    targets
        .into_iter()
        .map(|(label, target)| ping_one(&label, &target))
        .collect()
}

fn ping_one(label: &str, target: &str) -> PingResult {
    // -n 4 = 4 echo requests; -w 2000 = 2s per-packet timeout.
    let output = hidden_ping()
        .args(["-n", "4", "-w", "2000", target])
        .output();
    match output {
        Ok(o) if o.status.success() => parse_ping_output(label, target, &o.stdout),
        Ok(_) | Err(_) => PingResult {
            label: label.to_string(),
            target: target.to_string(),
            avg_ms: None,
            min_ms: None,
            max_ms: None,
            received: 0,
        },
    }
}

fn parse_ping_output(label: &str, target: &str, stdout: &[u8]) -> PingResult {
    let s = String::from_utf8_lossy(stdout);
    // Received count: "Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)"
    let received = s
        .lines()
        .find(|l| l.contains("Received ="))
        .and_then(|l| {
            l.split("Received =")
                .nth(1)
                .and_then(|t| t.split(',').next())
                .and_then(|t| t.trim().parse::<u32>().ok())
        })
        .unwrap_or(0);

    // Min/Max/Average line: "Minimum = 12ms, Maximum = 18ms, Average = 14ms"
    let stats_line = s.lines().find(|l| l.contains("Minimum =") && l.contains("Average ="));
    let parse_field = |line: &str, prefix: &str| -> Option<u32> {
        line.split(prefix)
            .nth(1)?
            .split('m')
            .next()?
            .trim()
            .parse::<u32>()
            .ok()
    };
    let (min_ms, max_ms, avg_ms) = match stats_line {
        Some(l) => (
            parse_field(l, "Minimum ="),
            parse_field(l, "Maximum ="),
            parse_field(l, "Average ="),
        ),
        None => (None, None, None),
    };

    PingResult {
        label: label.to_string(),
        target: target.to_string(),
        avg_ms,
        min_ms,
        max_ms,
        received,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PcieLink {
    /// Friendly device name from Get-PnpDevice (e.g. "NVIDIA GeForce RTX 3070").
    pub device: String,
    /// Current link width as integer (e.g. 8 for "x8", 16 for "x16"). Null
    /// when probe failed or device doesn't expose the property.
    pub current_width: Option<u32>,
    /// Max link width capability.
    pub max_width: Option<u32>,
    /// Current link speed gen number (1 = Gen1, 5 = Gen5). Null if unknown.
    pub current_gen: Option<u32>,
    /// Max link speed gen number.
    pub max_gen: Option<u32>,
}

/// Reads PCIe link width + speed for every Display-class PnP device. Used
/// to surface "GPU running x8 instead of x16" — a common silent regression
/// from a wrong slot, a loose card, or PCIe bifurcation misconfig.
///
/// PowerShell does the heavy lifting via `Get-PnpDeviceProperty` with the
/// canonical `DEVPKEY_PciDevice_*` keys. Output is parsed line-by-line.
/// Note: at idle the GPU may report a lower link gen due to ASPM — the
/// frontend should correlate with the ASPM-off catalog tweak before
/// flagging "running below max".
pub fn read_pcie_links() -> anyhow::Result<Vec<PcieLink>> {
    // -OutputFormat Text + a custom shape we parse: lines start with "##"
    // for new devices and "  KEY=VALUE" for the four properties.
    let script = "$ErrorActionPreference='SilentlyContinue';\
        $devs=Get-PnpDevice -Class Display -PresentOnly|Where-Object{$_.Status -eq 'OK'};\
        foreach($d in $devs){\
            Write-Output \"##$($d.FriendlyName)\";\
            $cw=(Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_PciDevice_CurrentLinkWidth' -ErrorAction SilentlyContinue).Data;\
            $mw=(Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_PciDevice_MaxLinkWidth' -ErrorAction SilentlyContinue).Data;\
            $cs=(Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_PciDevice_CurrentLinkSpeed' -ErrorAction SilentlyContinue).Data;\
            $ms=(Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_PciDevice_MaxLinkSpeed' -ErrorAction SilentlyContinue).Data;\
            Write-Output \"  CW=$cw\";Write-Output \"  MW=$mw\";\
            Write-Output \"  CS=$cs\";Write-Output \"  MS=$ms\";\
        }";
    let output = hidden_powershell()
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .context("running Get-PnpDeviceProperty for PCIe link probe")?;
    let s = String::from_utf8_lossy(&output.stdout);
    let mut out: Vec<PcieLink> = Vec::new();
    let mut current: Option<PcieLink> = None;
    for line in s.lines() {
        if let Some(name) = line.strip_prefix("##") {
            if let Some(prev) = current.take() {
                out.push(prev);
            }
            current = Some(PcieLink {
                device: name.trim().to_string(),
                current_width: None,
                max_width: None,
                current_gen: None,
                max_gen: None,
            });
        } else if let Some(cur) = current.as_mut() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("CW=") {
                cur.current_width = parse_link_int(rest);
            } else if let Some(rest) = trimmed.strip_prefix("MW=") {
                cur.max_width = parse_link_int(rest);
            } else if let Some(rest) = trimmed.strip_prefix("CS=") {
                cur.current_gen = parse_link_speed(rest);
            } else if let Some(rest) = trimmed.strip_prefix("MS=") {
                cur.max_gen = parse_link_speed(rest);
            }
        }
    }
    if let Some(last) = current.take() {
        out.push(last);
    }
    Ok(out)
}

fn parse_link_int(s: &str) -> Option<u32> {
    s.trim().parse::<u32>().ok()
}

/// PnP `CurrentLinkSpeed` enum values map to PCIe gen by index (Microsoft docs):
/// 0=unknown, 1=2.5 GT/s (Gen1), 2=5 GT/s (Gen2), 3=8 GT/s (Gen3), 4=16 GT/s (Gen4),
/// 5=32 GT/s (Gen5), 6=64 GT/s (Gen6). We surface the gen number directly.
fn parse_link_speed(s: &str) -> Option<u32> {
    let raw: u32 = s.trim().parse().ok()?;
    if raw == 0 {
        None
    } else {
        Some(raw)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrocodeReport {
    pub cpu_brand: String,
    /// Hex string of the running microcode revision, e.g. "0x0000012B".
    /// Read from HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0\Update Revision.
    pub running_revision: Option<String>,
    /// Whether the CPU model is in the Intel 13/14gen "Vmin Shift Instability"
    /// affected family (i9/i7/i5 K/KF/KS variants + 65W non-K).
    pub is_affected_family: bool,
    /// Minimum safe microcode for affected CPUs (0x12B per Intel's Sep 2024
    /// "final mitigation" announcement). 0x12F is the latest 2024/2025
    /// supplemental fix.
    pub min_safe_revision: Option<String>,
    /// Headline status: "ok" | "outdated" | "unknown" | "not-affected".
    pub status: String,
    pub note: String,
}

/// Reads the running microcode revision + maps to known-affected CPU families.
/// Intel 13th/14th-gen 65W+ chips need microcode >= 0x12B to mitigate the
/// Vmin Shift Instability degradation issue (Intel ack'd Sep 2024).
pub fn read_microcode_report() -> anyhow::Result<MicrocodeReport> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm
        .open_subkey(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        .context("open CentralProcessor\\0 key")?;

    // Brand string for display + affected-family detection.
    let brand: String = key.get_value("ProcessorNameString").unwrap_or_default();
    let brand = brand.trim().to_string();

    // Update Revision is REG_BINARY, 8 bytes. Bytes [4..8] hold the revision
    // little-endian (per docs, reading high DWORD as the revision).
    let raw: Vec<u8> = key.get_raw_value("Update Revision")
        .ok()
        .map(|v| v.bytes)
        .unwrap_or_default();
    let running_revision = if raw.len() >= 8 {
        let rev = u32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]]);
        Some(format!("0x{:08X}", rev))
    } else {
        None
    };

    let is_affected_family = brand_is_intel_13_14_affected(&brand);
    let min_safe_revision = if is_affected_family {
        Some("0x0000012B".to_string())
    } else {
        None
    };

    let (status, note) = match (&running_revision, is_affected_family) {
        (_, false) => (
            "not-affected".to_string(),
            "CPU is not in the Intel 13/14gen Vmin Shift Instability family. No microcode action needed.".to_string(),
        ),
        (None, true) => (
            "unknown".to_string(),
            "Couldn't read microcode revision. Check BIOS for the latest update from your motherboard vendor.".to_string(),
        ),
        (Some(rev), true) => {
            let rev_num = u32::from_str_radix(rev.trim_start_matches("0x"), 16).unwrap_or(0);
            if rev_num >= 0x12B {
                (
                    "ok".to_string(),
                    format!(
                        "Running microcode {rev} — at or above the 0x12B Intel-mitigation floor. \
                         You're protected from further Vmin Shift degradation. Verify BIOS \
                         'Intel Default Settings' / 'Intel Baseline' profile is also active."
                    ),
                )
            } else {
                (
                    "outdated".to_string(),
                    format!(
                        "Running microcode {rev} — BELOW the 0x12B mitigation floor. \
                         Update BIOS from your motherboard vendor's site immediately and \
                         apply the 'Intel Default Settings' / 'Intel Baseline' profile. \
                         Already-degraded CPUs are not repairable; RMA is the only fix once \
                         instability is observed."
                    ),
                )
            }
        }
    };

    Ok(MicrocodeReport {
        cpu_brand: brand,
        running_revision,
        is_affected_family,
        min_safe_revision,
        status,
        note,
    })
}

fn brand_is_intel_13_14_affected(brand: &str) -> bool {
    let b = brand.to_lowercase();
    if !b.contains("intel") || !b.contains("core") {
        return false;
    }
    // Affected: i9/i7/i5 13xxx + 14xxx, K/KF/KS/non-K (65W+). T-series and
    // mobile HX excluded for now (not formally cleared by Intel either, but
    // not in the known-affected family).
    let prefixes = [
        "i9-13", "i9-14", "i7-13", "i7-14", "i5-13", "i5-14",
    ];
    prefixes.iter().any(|p| b.contains(p)) && !b.contains("-13t") && !b.contains("-14t")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VbsReport {
    /// VirtualizationBasedSecurityStatus from Win32_DeviceGuard:
    ///   0 = VBS not enabled
    ///   1 = VBS enabled but not running
    ///   2 = VBS enabled AND running (the perf-cost state)
    pub vbs_status: u32,
    /// HVCI (Memory Integrity) on per the registry policy key.
    pub hvci_enabled: bool,
    /// Hypervisor launchtype from BCD probe (best-effort).
    pub hypervisor_launchtype: Option<String>,
    /// "fully-disabled" | "partial" | "enabled" | "unknown".
    pub status: String,
    pub note: String,
}

pub fn read_vbs_report() -> anyhow::Result<VbsReport> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    // 1. VBS running status via WMI Win32_DeviceGuard.
    let vbs_status = wmi_vbs_status().unwrap_or(0);

    // 2. HVCI policy via registry — DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity\Enabled.
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hvci_enabled = hklm
        .open_subkey(r"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity")
        .ok()
        .and_then(|k| k.get_value::<u32, _>("Enabled").ok())
        .map(|v| v == 1)
        .unwrap_or(false);

    // 3. BCD hypervisor launchtype — best-effort via bcdedit shellout.
    let bcd_out = hidden_bcdedit().arg("/enum").arg("{current}").output();
    let hypervisor_launchtype = bcd_out.ok().and_then(|o| {
        let s = String::from_utf8_lossy(&o.stdout);
        s.lines()
            .find(|l| l.to_lowercase().contains("hypervisorlaunchtype"))
            .and_then(|l| l.split_whitespace().last().map(|x| x.to_string()))
    });

    let status = if vbs_status == 0 && !hvci_enabled {
        "fully-disabled".to_string()
    } else if vbs_status >= 2 || hvci_enabled {
        "enabled".to_string()
    } else {
        "partial".to_string()
    };

    let note = match status.as_str() {
        "fully-disabled" => {
            "VBS + HVCI + Memory Integrity all off — no virtualization-based security perf cost.".to_string()
        }
        "enabled" => {
            "VBS / HVCI active. Costs 5-15% in CPU-bound games. Disable via the catalog tweaks (bcd.hypervisorlaunchtype.off + vbs.hvci.disable + Settings → Device security → Core isolation off). NOTE: Some anti-cheats (Vanguard, FACEIT) require Secure Boot + TPM and may flag VBS-off — verify your titles before applying.".to_string()
        }
        "partial" => {
            "Mixed state — one of (BCD launchtype / HVCI registry / VBS runtime status) is still on. Apply all three catalog tweaks + reboot.".to_string()
        }
        _ => "Unknown VBS state.".to_string(),
    };

    Ok(VbsReport {
        vbs_status,
        hvci_enabled,
        hypervisor_launchtype,
        status,
        note,
    })
}

// ---------- Game Session: suspend/resume competing apps ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessEntry {
    pub pid: u32,
    pub name: String,
    pub ram_mb: u64,
    /// "launcher" | "voice" | "music" | "browser" | "overlay" | "other"
    pub category: String,
}

/// Curated list of process names that are typical "suspend candidates" when
/// you're focusing on one game. Names are matched case-insensitive against
/// `Process.name()` (which is the executable filename, not the full path).
fn known_candidates() -> &'static [(&'static str, &'static str)] {
    &[
        // Game launchers
        ("steam.exe", "launcher"),
        ("steamwebhelper.exe", "launcher"),
        ("epicgameslauncher.exe", "launcher"),
        ("epicwebhelper.exe", "launcher"),
        ("riotclientservices.exe", "launcher"),
        ("riotclientux.exe", "launcher"),
        ("riotclientuxrender.exe", "launcher"),
        ("leagueclient.exe", "launcher"),
        ("leagueclientux.exe", "launcher"),
        ("leagueclientuxrender.exe", "launcher"),
        ("valorant.exe", "launcher"),
        ("ea.exe", "launcher"),
        ("ealauncher.exe", "launcher"),
        ("eadesktop.exe", "launcher"),
        ("battle.net.exe", "launcher"),
        ("battle.net helper.exe", "launcher"),
        ("blizzard.exe", "launcher"),
        ("agent.exe", "launcher"), // Battle.net agent (also other apps; check)
        ("galaxyclient.exe", "launcher"),
        ("upc.exe", "launcher"), // Ubisoft Connect
        ("ubisoft connect.exe", "launcher"),
        ("uplaywebcore.exe", "launcher"),
        ("rockstargameslauncher.exe", "launcher"),
        ("xboxapp.exe", "launcher"),
        ("gamingservices.exe", "launcher"),
        ("osu!.exe", "launcher"),
        // Voice / music — leave running by default but expose for opt-in
        ("discord.exe", "voice"),
        ("spotify.exe", "music"),
        ("spotifywebhelper.exe", "music"),
        // Overlays + recorders
        ("nvcontainer.exe", "overlay"),
        ("nvbroadcast.exe", "overlay"),
        ("obs64.exe", "overlay"),
        ("obs32.exe", "overlay"),
        ("xboxgamebar.exe", "overlay"),
        ("rtss.exe", "overlay"),
    ]
}

pub fn list_session_candidates() -> Vec<ProcessEntry> {
    use sysinfo::System;
    let sys = System::new_all();

    let mut out: Vec<ProcessEntry> = Vec::new();
    let known = known_candidates();
    for (pid, p) in sys.processes() {
        // sysinfo 0.32: name() returns &OsStr; lowercase for matching.
        let name_os = p.name();
        let name_string = name_os.to_string_lossy();
        let name_lc = name_string.to_lowercase();
        let cat = known.iter().find(|(n, _)| *n == name_lc).map(|(_, c)| *c);
        if let Some(category) = cat {
            out.push(ProcessEntry {
                pid: pid.as_u32(),
                name: name_string.into_owned(),
                ram_mb: p.memory() / (1024 * 1024),
                category: category.to_string(),
            });
        }
    }
    out.sort_by(|a, b| a.category.cmp(&b.category).then(a.name.cmp(&b.name)));
    out
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuspendResult {
    pub pid: u32,
    pub ok: bool,
    pub error: Option<String>,
}

/// Suspend a list of PIDs by shelling to PowerShell `Suspend-Process`. Each
/// PID processed independently; failures (anti-cheat-protected processes,
/// already-exited PIDs) recorded per-PID. Returns one result per input pid.
pub fn session_suspend(pids: Vec<u32>) -> Vec<SuspendResult> {
    pids.into_iter()
        .map(|pid| match hidden_powershell()
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!("Suspend-Process -Id {pid} -ErrorAction Stop"),
            ])
            .output()
        {
            Ok(o) if o.status.success() => SuspendResult { pid, ok: true, error: None },
            Ok(o) => SuspendResult {
                pid,
                ok: false,
                error: Some(String::from_utf8_lossy(&o.stderr).trim().to_string()),
            },
            Err(e) => SuspendResult { pid, ok: false, error: Some(e.to_string()) },
        })
        .collect()
}

pub fn session_resume(pids: Vec<u32>) -> Vec<SuspendResult> {
    pids.into_iter()
        .map(|pid| match hidden_powershell()
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!("Resume-Process -Id {pid} -ErrorAction Stop"),
            ])
            .output()
        {
            Ok(o) if o.status.success() => SuspendResult { pid, ok: true, error: None },
            Ok(o) => SuspendResult {
                pid,
                ok: false,
                error: Some(String::from_utf8_lossy(&o.stderr).trim().to_string()),
            },
            Err(e) => SuspendResult { pid, ok: false, error: Some(e.to_string()) },
        })
        .collect()
}

// ── Bufferbloat probe ────────────────────────────────────────────────────
// Drives a 30 MB download against Cloudflare's /__down endpoint while
// concurrently pinging 1.1.1.1 — the delta between idle p50 and loaded p50
// is the bufferbloat indicator. Single hidden PowerShell call (no flashing
// console). Tier verdict mirrors Waveform's grading roughly:
//   ΔRTT < 30 ms  → A
//   30–60 ms      → B
//   60–120 ms     → C
//   120–250 ms    → D
//   > 250 ms      → F
//
// Total runtime ~14 s on a 100 Mbit link (5 s idle + ~9 s loaded). Returns
// arrays of per-ping ms so the UI can render a sparkline on top of the
// bare verdict.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferbloatReport {
    pub idle_pings_ms: Vec<u32>,
    pub loaded_pings_ms: Vec<u32>,
    pub idle_p50_ms: Option<u32>,
    pub loaded_p50_ms: Option<u32>,
    pub delta_ms: Option<i32>,
    pub grade: String,
    pub bytes_downloaded: u64,
    pub error: Option<String>,
}

const BUFFERBLOAT_PS_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$pingTarget = '1.1.1.1'

function Get-Ping([string]$host_) {
    try {
        $r = (New-Object System.Net.NetworkInformation.Ping).Send($host_, 1500)
        if ($r.Status -eq 'Success') { return [int]$r.RoundtripTime } else { return -1 }
    } catch { return -1 }
}

# Idle phase: 6 pings over ~6 seconds
$idle = @()
for ($i = 0; $i -lt 6; $i++) { $idle += (Get-Ping $pingTarget); Start-Sleep -Milliseconds 900 }

# Loaded phase: kick off a 30 MB download, ping 10x while it streams
$bytes = 0
$loaded = @()
$dlJob = Start-Job -ScriptBlock {
    try {
        $req = [System.Net.HttpWebRequest]::Create('https://speed.cloudflare.com/__down?bytes=30000000')
        $req.Timeout = 12000
        $resp = $req.GetResponse()
        $stream = $resp.GetResponseStream()
        $buf = New-Object byte[] 65536
        $total = 0
        while ($true) {
            $n = $stream.Read($buf, 0, $buf.Length)
            if ($n -le 0) { break }
            $total += $n
        }
        $stream.Close(); $resp.Close()
        return $total
    } catch { return 0 }
}

Start-Sleep -Milliseconds 500
for ($i = 0; $i -lt 10; $i++) { $loaded += (Get-Ping $pingTarget); Start-Sleep -Milliseconds 700 }

$bytes = (Wait-Job $dlJob -Timeout 20 | Receive-Job) | Select-Object -Last 1
if ($null -eq $bytes) { $bytes = 0 }
Remove-Job $dlJob -Force | Out-Null

[pscustomobject]@{ idle = $idle; loaded = $loaded; bytes = $bytes } | ConvertTo-Json -Compress
"#;

#[derive(serde::Deserialize)]
struct BufferbloatRaw {
    idle: Vec<i32>,
    loaded: Vec<i32>,
    bytes: u64,
}

pub fn run_bufferbloat_probe() -> BufferbloatReport {
    let output = match hidden_powershell()
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            BUFFERBLOAT_PS_SCRIPT,
        ])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return BufferbloatReport {
                idle_pings_ms: vec![],
                loaded_pings_ms: vec![],
                idle_p50_ms: None,
                loaded_p50_ms: None,
                delta_ms: None,
                grade: "—".into(),
                bytes_downloaded: 0,
                error: Some(format!("powershell spawn failed: {e}")),
            };
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let raw: BufferbloatRaw = match serde_json::from_str(&stdout) {
        Ok(r) => r,
        Err(e) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return BufferbloatReport {
                idle_pings_ms: vec![],
                loaded_pings_ms: vec![],
                idle_p50_ms: None,
                loaded_p50_ms: None,
                delta_ms: None,
                grade: "—".into(),
                bytes_downloaded: 0,
                error: Some(format!(
                    "parse error: {e} · stderr={} · stdout-len={}",
                    if stderr.is_empty() { "(empty)" } else { &stderr },
                    stdout.len(),
                )),
            };
        }
    };

    fn p50(samples: &[i32]) -> Option<u32> {
        let mut good: Vec<u32> = samples.iter().filter(|s| **s >= 0).map(|s| *s as u32).collect();
        if good.is_empty() {
            return None;
        }
        good.sort_unstable();
        Some(good[good.len() / 2])
    }

    fn grade_for(delta_ms: i32) -> &'static str {
        match delta_ms {
            i32::MIN..=29 => "A",
            30..=59 => "B",
            60..=119 => "C",
            120..=249 => "D",
            _ => "F",
        }
    }

    let idle_p50 = p50(&raw.idle);
    let loaded_p50 = p50(&raw.loaded);
    let delta_ms = match (idle_p50, loaded_p50) {
        (Some(a), Some(b)) => Some(b as i32 - a as i32),
        _ => None,
    };
    let grade = match delta_ms {
        Some(d) => grade_for(d).to_string(),
        None => "—".to_string(),
    };

    BufferbloatReport {
        idle_pings_ms: raw.idle.iter().filter(|s| **s >= 0).map(|s| *s as u32).collect(),
        loaded_pings_ms: raw.loaded.iter().filter(|s| **s >= 0).map(|s| *s as u32).collect(),
        idle_p50_ms: idle_p50,
        loaded_p50_ms: loaded_p50,
        delta_ms,
        grade,
        bytes_downloaded: raw.bytes,
        error: None,
    }
}

// ── Live thermal snapshot — no-bundle best-effort ────────────────────
// Emits ACPI thermal zones (motherboard probes) + NVIDIA GPU temp/clock/
// throttle (via nvidia-smi if installed) + CPU current MHz vs base ratio
// (via perf counter — surfaces thermal/power throttle without needing a
// kernel temp probe).
//
// LibreHardwareMonitor would replace this with real per-core CPU package
// temps + voltage rails + storage SMART; that's a separate phase pending
// user approval to bundle the third-party DLL.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuSnapshot {
    pub vendor: String,
    pub name: String,
    pub temperature_c: Option<f32>,
    pub utilization_pct: Option<u32>,
    pub power_w: Option<f32>,
    pub clock_mhz: Option<u32>,
    pub memory_clock_mhz: Option<u32>,
    pub fan_pct: Option<u32>,
    pub throttle_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuClockSnapshot {
    /// Base frequency in MHz from CPUID. None if we couldn't parse.
    pub base_mhz: Option<u32>,
    /// Live aggregated MHz across all logical cores (from perf counter
    /// "% of Maximum Frequency" × MaxClockSpeed).
    pub current_mhz: Option<u32>,
    /// Live aggregated as a 0-100 ratio of MaxClockSpeed.
    pub current_pct_of_max: Option<f32>,
    /// True iff `current_pct_of_max < 90` for >= 1 sample. Heuristic — a
    /// healthy idle CPU runs at < base via SpeedStep, which IS throttle in
    /// the perf-counter sense but NOT thermal. Pair with GPU throttle
    /// reasons / temperature when surfacing.
    pub below_max: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveThermals {
    pub captured_at_ms: u64,
    pub thermal_zones: Vec<ThermalReading>,
    pub gpus: Vec<GpuSnapshot>,
    pub cpu_clock: CpuClockSnapshot,
    /// Best-guess "is the CPU likely thermal-throttling RIGHT NOW" rollup.
    /// True iff any thermal zone reads >= 80°C AND current_pct_of_max < 90.
    pub cpu_thermal_throttle_suspected: bool,
    /// True iff any GPU returns a non-empty throttle_reasons list.
    pub gpu_throttle_active: bool,
}

pub fn read_live_thermals() -> LiveThermals {
    let captured_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let thermal_zones = read_temps()
        .map(|s| s.probes)
        .unwrap_or_default();
    let gpus = probe_gpus();
    let cpu_clock = probe_cpu_clock();
    let max_zone = thermal_zones
        .iter()
        .map(|z| z.celsius)
        .fold(f32::NEG_INFINITY, f32::max);
    let cpu_thermal_throttle_suspected = max_zone >= 80.0
        && cpu_clock.current_pct_of_max.map_or(false, |p| p < 90.0);
    let gpu_throttle_active = gpus.iter().any(|g| !g.throttle_reasons.is_empty());
    LiveThermals {
        captured_at_ms,
        thermal_zones,
        gpus,
        cpu_clock,
        cpu_thermal_throttle_suspected,
        gpu_throttle_active,
    }
}

fn probe_gpus() -> Vec<GpuSnapshot> {
    let mut out = Vec::new();
    if let Some(nv) = probe_nvidia_smi() {
        out.extend(nv);
    }
    out
}

fn probe_nvidia_smi() -> Option<Vec<GpuSnapshot>> {
    // --query-gpu=name,temperature.gpu,utilization.gpu,power.draw,clocks.gr,
    //              clocks.mem,fan.speed,clocks_throttle_reasons.active
    // --format=csv,noheader,nounits
    let output = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,temperature.gpu,utilization.gpu,power.draw,clocks.gr,clocks.mem,fan.speed,clocks_throttle_reasons.active",
            "--format=csv,noheader,nounits",
        ])
        .creation_flags_if_windows()
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut gpus = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if parts.len() < 8 {
            continue;
        }
        let parse_u32 = |s: &str| s.parse::<u32>().ok();
        let parse_f32 = |s: &str| s.parse::<f32>().ok();
        // throttle_reasons.active comes back as a hex bitmask like "0x4"
        // (SW_POWER_CAP) or "0x0". We split into human-readable labels.
        let throttle_reasons = parse_throttle_mask(parts[7]);
        gpus.push(GpuSnapshot {
            vendor: "nvidia".into(),
            name: parts[0].to_string(),
            temperature_c: parse_f32(parts[1]),
            utilization_pct: parse_u32(parts[2]),
            power_w: parse_f32(parts[3]),
            clock_mhz: parse_u32(parts[4]),
            memory_clock_mhz: parse_u32(parts[5]),
            fan_pct: parse_u32(parts[6]),
            throttle_reasons,
        });
    }
    if gpus.is_empty() { None } else { Some(gpus) }
}

fn parse_throttle_mask(raw: &str) -> Vec<String> {
    // NVIDIA returns clocks_throttle_reasons.active as a hex bitmask.
    // Bit definitions per nvidia-smi man page (selected, common ones):
    //   0x1   GPU_IDLE
    //   0x2   APPLICATIONS_CLOCKS_SETTING
    //   0x4   SW_POWER_CAP
    //   0x8   HW_SLOWDOWN
    //   0x40  HW_THERMAL_SLOWDOWN
    //   0x80  HW_POWER_BRAKE_SLOWDOWN
    //   0x100 SYNC_BOOST
    //   0x200 SW_THERMAL_SLOWDOWN
    let cleaned = raw.trim().trim_start_matches("0x");
    let bits = u64::from_str_radix(cleaned, 16).unwrap_or(0);
    let mut out = Vec::new();
    if bits == 0 {
        return out;
    }
    if bits & 0x1 != 0 { /* idle isn't a throttle worth surfacing */ }
    if bits & 0x4 != 0 { out.push("sw power cap".into()); }
    if bits & 0x8 != 0 { out.push("hw slowdown".into()); }
    if bits & 0x40 != 0 { out.push("hw thermal slowdown".into()); }
    if bits & 0x80 != 0 { out.push("hw power brake".into()); }
    if bits & 0x200 != 0 { out.push("sw thermal slowdown".into()); }
    out
}

fn probe_cpu_clock() -> CpuClockSnapshot {
    // Walk WMI Win32_Processor for MaxClockSpeed (== marketed base in MHz)
    // and Win32_PerfFormattedData_Counters_ProcessorInformation for the
    // live "% of Maximum Frequency" ratio. The product gives us a live
    // MHz proxy without needing kernel temp access.
    let mut base_mhz: Option<u32> = None;
    let mut current_pct: Option<f32> = None;

    if let Ok(com) = wmi::COMLibrary::new() {
        if let Ok(con) = WMIConnection::new(com) {
            let rows: Vec<HashMap<String, Variant>> = con
                .raw_query("SELECT MaxClockSpeed FROM Win32_Processor")
                .unwrap_or_default();
            for r in rows {
                if let Some(v) = r.get("MaxClockSpeed") {
                    base_mhz = match v {
                        Variant::UI4(n) => Some(*n),
                        Variant::I4(n) => Some(*n as u32),
                        _ => None,
                    };
                    if base_mhz.is_some() { break; }
                }
            }
            // Aggregate across the _Total instance for a single live ratio.
            let perf: Vec<HashMap<String, Variant>> = con
                .raw_query(
                    "SELECT PercentofMaximumFrequency FROM Win32_PerfFormattedData_Counters_ProcessorInformation WHERE Name='_Total'",
                )
                .unwrap_or_default();
            for r in perf {
                if let Some(v) = r.get("PercentofMaximumFrequency") {
                    current_pct = match v {
                        Variant::UI4(n) => Some(*n as f32),
                        Variant::I4(n) => Some(*n as f32),
                        Variant::UI8(n) => Some(*n as f32),
                        Variant::I8(n) => Some(*n as f32),
                        _ => None,
                    };
                    if current_pct.is_some() { break; }
                }
            }
        }
    }

    let current_mhz = match (base_mhz, current_pct) {
        (Some(base), Some(pct)) => Some(((base as f32) * pct / 100.0) as u32),
        _ => None,
    };
    let below_max = current_pct.map_or(false, |p| p < 90.0);
    CpuClockSnapshot {
        base_mhz,
        current_mhz,
        current_pct_of_max: current_pct,
        below_max,
    }
}

// Tiny extension trait so we can apply CREATE_NO_WINDOW to ad-hoc Command
// chains (nvidia-smi, etc.) without rewriting them as builder calls.
trait CommandHidden {
    fn creation_flags_if_windows(&mut self) -> &mut Self;
}
impl CommandHidden for std::process::Command {
    fn creation_flags_if_windows(&mut self) -> &mut Self {
        crate::process_helpers::make_hidden(self);
        self
    }
}

// ── Pre-tournament audit ─────────────────────────────────────────────
// One-button "are you ready?" check for users about to enter ranked /
// FNCS / VCT scrims. Composes recording-app detection + service-state
// probes into a single result the /asta page surfaces. Bench + ping +
// DPC checks are driven by the frontend (uses existing commands).

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingApp {
    pub name: String,
    pub pid: u32,
    pub ram_mb: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditState {
    pub recording_apps: Vec<RecordingApp>,
    /// Game DVR / Xbox Game Bar background recording: ON / OFF / UNKNOWN.
    pub game_dvr_state: String,
    /// Windows Update service current state — "running" is bad pre-match.
    pub windows_update_state: String,
    /// Search Indexer service — pre-match noise.
    pub search_indexer_state: String,
}

const RECORDING_HINTS: &[&str] = &[
    "obs",
    "obs64",
    "obs32",
    "obs-studio",
    "streamlabs",
    "geforce experience",
    "nvcontainer",
    "shadowplay",
    "shadow_play",
    "rtss",
    "msi afterburner",
    "afterburner",
    "outplayed",
    "medal",
    "discord screenshare",
    "xboxapp",
    "broadcast",
];

pub fn read_audit_state() -> AuditState {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let mut hits: Vec<RecordingApp> = Vec::new();
    for (pid, p) in sys.processes() {
        let name = p.name().to_string_lossy().to_lowercase();
        if RECORDING_HINTS.iter().any(|h| name.contains(h)) {
            hits.push(RecordingApp {
                name: p.name().to_string_lossy().to_string(),
                pid: pid.as_u32(),
                ram_mb: (p.memory() / (1024 * 1024)) as u32,
            });
        }
    }

    let game_dvr_state = read_game_dvr_state();
    let windows_update_state = read_service_state("wuauserv");
    let search_indexer_state = read_service_state("WSearch");

    AuditState {
        recording_apps: hits,
        game_dvr_state,
        windows_update_state,
        search_indexer_state,
    }
}

fn read_game_dvr_state() -> String {
    // HKCU\System\GameConfigStore!GameDVR_Enabled
    use winreg::enums::*;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey("System\\GameConfigStore") {
        Ok(k) => match k.get_value::<u32, _>("GameDVR_Enabled") {
            Ok(0) => "off".to_string(),
            Ok(_) => "on".to_string(),
            Err(_) => "unknown".to_string(),
        },
        Err(_) => "unknown".to_string(),
    }
}

fn read_service_state(name: &str) -> String {
    use crate::process_helpers::hidden_powershell;
    let cmd = format!(
        "(Get-Service -Name '{}' -ErrorAction SilentlyContinue).Status",
        name.replace('\'', "''")
    );
    match hidden_powershell()
        .args(["-NoProfile", "-NonInteractive", "-Command", &cmd])
        .output()
    {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_lowercase();
            if s.is_empty() { "unknown".to_string() } else { s }
        }
        Err(_) => "unknown".to_string(),
    }
}

// ── Asta Bench ────────────────────────────────────────────────────────
// 3 native metrics that map to actual Fortnite click-to-pixel cost:
//   - CPU single-thread sha256 throughput (proxy for game-thread tail)
//   - DPC % sampled over N seconds (driver misbehavior surfaces here)
//   - Idle-ping jitter to 1.1.1.1 (network variance under no load)
//
// Frame-pacing test runs in the frontend via requestAnimationFrame
// (same compositor Fortnite renders through). UI composes these into a
// single Latency Health Score 0-100. Persisted in localStorage so
// before/after diffs survive Asta Mode application.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuLatencySample {
    /// Total ns the test took. Lower = faster CPU + less scheduler jitter.
    pub total_ns: u64,
    /// Iterations completed. Fixed = 1_000_000.
    pub iterations: u32,
    /// ns per iteration (mean).
    pub ns_per_iter: f64,
}

pub fn bench_cpu_latency() -> CpuLatencySample {
    use sha2::{Digest, Sha256};
    const ITERS: u32 = 1_000_000;
    let mut buf = [0u8; 64];
    let mut hasher = Sha256::new();
    let started = std::time::Instant::now();
    for i in 0..ITERS {
        // Vary input each iter so the optimizer can't elide work.
        buf[0] = (i & 0xff) as u8;
        buf[1] = ((i >> 8) & 0xff) as u8;
        buf[2] = ((i >> 16) & 0xff) as u8;
        buf[3] = ((i >> 24) & 0xff) as u8;
        hasher.update(&buf);
        if i % 1024 == 0 {
            let _ = hasher.finalize_reset();
        }
    }
    let _ = hasher.finalize();
    let total_ns = started.elapsed().as_nanos() as u64;
    CpuLatencySample {
        total_ns,
        iterations: ITERS,
        ns_per_iter: total_ns as f64 / ITERS as f64,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingJitterSample {
    pub samples: Vec<u32>,
    pub p50_ms: Option<u32>,
    pub stddev_ms: Option<f32>,
    pub host: String,
}

pub fn bench_ping_jitter(host: &str, count: u32) -> PingJitterSample {
    let mut samples: Vec<u32> = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let out = hidden_ping()
            .args(["-n", "1", "-w", "1500", host])
            .output();
        if let Ok(o) = out {
            let s = String::from_utf8_lossy(&o.stdout);
            // Look for "time=Nms" / "time<1ms"
            for line in s.lines() {
                if let Some(idx) = line.find("time=") {
                    let rest = &line[idx + 5..];
                    let n: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                    if let Ok(v) = n.parse::<u32>() {
                        samples.push(v);
                        break;
                    }
                }
                if line.contains("time<1ms") {
                    samples.push(1);
                    break;
                }
            }
        }
    }
    let mut sorted = samples.clone();
    sorted.sort_unstable();
    let p50 = if sorted.is_empty() { None } else { Some(sorted[sorted.len() / 2]) };
    let stddev = if samples.len() < 2 {
        None
    } else {
        let mean = samples.iter().map(|s| *s as f64).sum::<f64>() / samples.len() as f64;
        let var = samples
            .iter()
            .map(|s| {
                let d = *s as f64 - mean;
                d * d
            })
            .sum::<f64>()
            / samples.len() as f64;
        Some(var.sqrt() as f32)
    };
    PingJitterSample { samples, p50_ms: p50, stddev_ms: stddev, host: host.to_string() }
}

// ── LibreHardwareMonitor sensor probe ────────────────────────────────
// Loads the bundled LibreHardwareMonitorLib.dll via PowerShell and
// returns parsed JSON of every sensor on the rig. Two paths:
//   - probe_lhm_sensors_unelevated()  : runs as the current user. Gets
//                                       ACPI thermal zones, GPU sensors,
//                                       NVMe SMART. CPU package + per-core
//                                       MSR reads usually fail without admin.
//   - probe_lhm_sensors_elevated()    : routes the script through the
//                                       single-UAC elevation path so the
//                                       WinRing0 driver loads. Full sensor
//                                       coverage including CPU package +
//                                       voltage rails.
//
// We pass the resolved DLL path explicitly to make this work in both dev
// (script reads from src-tauri/resources/lhm) and packaged installs (Tauri
// resolves resources to its own per-install directory).

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LhmSensorReading {
    pub name: String,
    pub kind: String,
    pub value: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LhmComponent {
    pub name: String,
    pub kind: String,
    pub sensors: Vec<LhmSensorReading>,
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LhmReport {
    pub ok: bool,
    pub elevated: bool,
    #[serde(default)]
    pub lhm_version: Option<String>,
    #[serde(default)]
    pub components: Vec<LhmComponent>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Run the LHM reader script ELEVATED so WinRing0 loads. Triggers a UAC
/// prompt. We can't use the existing batched-cmd elevation runner here
/// because that path joins lines with `&&` for cmd.exe; the LHM script
/// emits multi-line JSON. Instead we elevate powershell directly with
/// Start-Process -Verb RunAs, redirecting the script's JSON to a temp
/// file, then read the file back.
pub fn probe_lhm_sensors_elevated(script_path: &str, dll_path: &str) -> LhmReport {
    // Allocate a deterministic-ish temp path. Tempfile crate is overkill
    // for this single-shot use; we just write to %LOCALAPPDATA%\optmaxxing.
    let tmp_dir = std::env::var("LOCALAPPDATA")
        .map(|p| std::path::PathBuf::from(p).join("optmaxxing"))
        .unwrap_or_else(|_| std::env::temp_dir().join("optmaxxing"));
    let _ = std::fs::create_dir_all(&tmp_dir);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let out_path = tmp_dir.join(format!("lhm-{}.json", stamp));
    // Best effort cleanup if the file exists from a prior run.
    let _ = std::fs::remove_file(&out_path);

    // The outer powershell.exe is unelevated and just calls Start-Process
    // -Verb RunAs to fire an elevated child. The child writes the JSON to
    // out_path and exits. We then read the file.
    let inner_cmd = format!(
        "& '{}' -DllPath '{}' | Out-File -FilePath '{}' -Encoding utf8",
        script_path.replace('\'', "''"),
        dll_path.replace('\'', "''"),
        out_path.to_string_lossy().replace('\'', "''")
    );
    // ArgumentList for Start-Process needs all flags as separate strings.
    let outer = format!(
        "$ErrorActionPreference='Stop'; \
         Start-Process powershell -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',\"{}\" -Verb RunAs -Wait -WindowStyle Hidden",
        inner_cmd.replace('\'', "''").replace('"', "`\"")
    );
    let status = match hidden_powershell()
        .args(["-NoProfile", "-NonInteractive", "-Command", &outer])
        .status()
    {
        Ok(s) => s,
        Err(e) => {
            return LhmReport {
                ok: false,
                elevated: false,
                lhm_version: None,
                components: vec![],
                error: Some(format!("elevated powershell spawn failed: {e}")),
            };
        }
    };
    if !status.success() {
        // Code 1223 = ERROR_CANCELLED (UAC denied) on Windows.
        let code = status.code().unwrap_or(-1);
        let mut msg = format!("elevated probe exited with code {code}");
        if code == 1223 {
            msg.push_str(" (UAC denied)");
        }
        return LhmReport {
            ok: false,
            elevated: false,
            lhm_version: None,
            components: vec![],
            error: Some(msg),
        };
    }
    // Read what the elevated script wrote.
    let body = match std::fs::read_to_string(&out_path) {
        Ok(s) => s,
        Err(e) => {
            return LhmReport {
                ok: false,
                elevated: false,
                lhm_version: None,
                components: vec![],
                error: Some(format!("could not read elevated probe output: {e}")),
            };
        }
    };
    // Best-effort cleanup; ignore failure.
    let _ = std::fs::remove_file(&out_path);
    // Out-File utf8 sometimes ships a BOM; trim everything before '{'.
    let trimmed = body.trim_start_matches('\u{FEFF}').trim();
    let json_start = trimmed.find('{').unwrap_or(0);
    let json = &trimmed[json_start..];
    match serde_json::from_str::<LhmReport>(json) {
        Ok(report) => report,
        Err(e) => LhmReport {
            ok: false,
            elevated: false,
            lhm_version: None,
            components: vec![],
            error: Some(format!(
                "couldn't parse elevated LHM output: {e} · first 200 chars: {}",
                json.chars().take(200).collect::<String>()
            )),
        },
    }
}

/// Run the LHM reader script via hidden_powershell. Returns the parsed
/// LhmReport on success, or an error wrapped as a "failed" report so the
/// frontend has a uniform shape.
pub fn probe_lhm_sensors(script_path: &str, dll_path: &str) -> LhmReport {
    // ArgumentList style — embedded quotes / spaces in Tauri's resource
    // path survive Windows argv parsing without needing to hand-escape.
    let mut cmd = hidden_powershell();
    cmd.arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(script_path)
        .arg("-DllPath")
        .arg(dll_path);

    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => {
            return LhmReport {
                ok: false,
                elevated: false,
                lhm_version: None,
                components: vec![],
                error: Some(format!("powershell spawn failed: {e}")),
            };
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stdout.is_empty() {
        return LhmReport {
            ok: false,
            elevated: false,
            lhm_version: None,
            components: vec![],
            error: Some(if stderr.is_empty() {
                "LHM script produced no output".to_string()
            } else {
                stderr
            }),
        };
    }
    match serde_json::from_str::<LhmReport>(&stdout) {
        Ok(report) => report,
        Err(e) => LhmReport {
            ok: false,
            elevated: false,
            lhm_version: None,
            components: vec![],
            error: Some(format!(
                "couldn't parse LHM output: {e} · stderr={} · first 200 chars: {}",
                if stderr.is_empty() { "(empty)" } else { &stderr },
                stdout.chars().take(200).collect::<String>(),
            )),
        },
    }
}

// ── 8311 X-ONU-SFPP stick metrics ────────────────────────────────────
// The 8311 community firmware (the EXEN X-ONU-SFPP and similar Potron
// XGS-PON ONU sticks ship with this fork by default) exposes a JSON
// metrics endpoint at:
//
//     https://192.168.11.1/cgi-bin/luci/8311/metrics
//
// The endpoint is HTTPS with a self-signed LuCI certificate. We drive it
// through hidden PowerShell + Invoke-WebRequest with cert validation off
// so we don't have to add a Rust HTTP client dependency. Reachability
// depends on the user's network setup — typically the management VLAN /
// bridge needs to be configured on whichever device the stick lives in
// (Mikrotik / UDM / OPNsense / direct in a Windows NIC).
//
// pon.wiki notes the stick should stay below 60 °C — above that, active
// cooling is recommended for longevity. UI surfaces an amber pill at
// 55 °C and red at 60 °C to nudge users before damage accumulates.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnuStickReport {
    pub temperature_c: Option<f32>,
    pub voltage_v: Option<f32>,
    pub bias_current_ma: Option<f32>,
    pub tx_power_dbm: Option<f32>,
    pub rx_power_dbm: Option<f32>,
    pub state: Option<String>,
    pub firmware: Option<String>,
    pub serial: Option<String>,
    /// Raw JSON returned by the stick. Useful for users to debug their
    /// firmware version + spot fields we haven't typed yet.
    pub raw_json: Option<String>,
    pub error: Option<String>,
    /// Round-trip ms for the fetch. Helps diagnose "is this slow because
    /// of network or because of the stick?".
    pub fetch_ms: u32,
}

pub fn fetch_onu_stick(url: &str) -> OnuStickReport {
    use std::time::Instant;
    let started = Instant::now();
    // PowerShell -SkipCertificateCheck on Windows PowerShell 5.1 isn't
    // available, but we can disable cert validation via a callback the
    // .NET ServicePointManager respects. PowerShell 7+ supports
    // -SkipCertificateCheck natively; we try that path first then fall
    // back. -UseBasicParsing avoids the IE engine on PS 5.
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::ServerCertificateValidationCallback = {{ $true }}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls
try {{
    $r = Invoke-WebRequest -Uri '{}' -UseBasicParsing -TimeoutSec 6
    Write-Output $r.Content
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"#,
        url.replace('\'', "''")
    );
    let output = match hidden_powershell()
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return OnuStickReport {
                temperature_c: None,
                voltage_v: None,
                bias_current_ma: None,
                tx_power_dbm: None,
                rx_power_dbm: None,
                state: None,
                firmware: None,
                serial: None,
                raw_json: None,
                error: Some(format!("powershell spawn failed: {e}")),
                fetch_ms: started.elapsed().as_millis() as u32,
            };
        }
    };
    let elapsed_ms = started.elapsed().as_millis() as u32;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return OnuStickReport {
            temperature_c: None,
            voltage_v: None,
            bias_current_ma: None,
            tx_power_dbm: None,
            rx_power_dbm: None,
            state: None,
            firmware: None,
            serial: None,
            raw_json: None,
            error: Some(if stderr.is_empty() {
                "fetch failed (no error message — is the URL reachable?)".to_string()
            } else {
                stderr
            }),
            fetch_ms: elapsed_ms,
        };
    }
    let body = String::from_utf8_lossy(&output.stdout).trim().to_string();
    parse_onu_metrics(&body, elapsed_ms)
}

fn parse_onu_metrics(body: &str, elapsed_ms: u32) -> OnuStickReport {
    // The 8311 metrics endpoint shape varies a little across firmware
    // versions; we walk the JSON for common keys instead of pinning a
    // strict schema. Keys we look for (case-insensitive):
    //   temperature / temp / temp_c / module_temperature
    //   voltage / vcc / voltage_v
    //   bias / bias_current / tx_bias_current
    //   tx_power / tx_optical_power / tx_dbm
    //   rx_power / rx_optical_power / rx_dbm
    //   state / pon_state / oper_state
    //   firmware / firmware_version
    //   serial / pon_serial / sn
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(body);
    let val = match parsed {
        Ok(v) => v,
        Err(e) => {
            return OnuStickReport {
                temperature_c: None,
                voltage_v: None,
                bias_current_ma: None,
                tx_power_dbm: None,
                rx_power_dbm: None,
                state: None,
                firmware: None,
                serial: None,
                raw_json: Some(body.to_string()),
                error: Some(format!(
                    "endpoint returned {} bytes that aren't JSON: {}",
                    body.len(),
                    e
                )),
                fetch_ms: elapsed_ms,
            };
        }
    };

    fn dig_f32(v: &serde_json::Value, keys: &[&str]) -> Option<f32> {
        for key in keys {
            // Walk the JSON tree looking for ANY occurrence of `key`
            // (case-insensitive) at any depth. Returns the first match.
            if let Some(found) = find_field(v, key) {
                if let Some(n) = found.as_f64() {
                    return Some(n as f32);
                }
                if let Some(s) = found.as_str() {
                    let cleaned = s.trim().trim_end_matches(|c: char| !c.is_ascii_digit() && c != '.' && c != '-');
                    if let Ok(n) = cleaned.parse::<f32>() {
                        return Some(n);
                    }
                }
            }
        }
        None
    }
    fn dig_str(v: &serde_json::Value, keys: &[&str]) -> Option<String> {
        for key in keys {
            if let Some(found) = find_field(v, key) {
                if let Some(s) = found.as_str() {
                    return Some(s.to_string());
                }
                if found.is_number() {
                    return Some(found.to_string());
                }
            }
        }
        None
    }
    fn find_field<'a>(v: &'a serde_json::Value, name: &str) -> Option<&'a serde_json::Value> {
        let lower = name.to_ascii_lowercase();
        match v {
            serde_json::Value::Object(map) => {
                for (k, sub) in map {
                    if k.to_ascii_lowercase() == lower {
                        return Some(sub);
                    }
                }
                for (_, sub) in map {
                    if let Some(found) = find_field(sub, name) {
                        return Some(found);
                    }
                }
                None
            }
            serde_json::Value::Array(arr) => {
                for sub in arr {
                    if let Some(found) = find_field(sub, name) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }

    OnuStickReport {
        temperature_c: dig_f32(&val, &["temperature_c", "temperature", "temp_c", "temp", "module_temperature"]),
        voltage_v: dig_f32(&val, &["voltage_v", "voltage", "vcc", "vcc_v"]),
        bias_current_ma: dig_f32(&val, &["bias_current_ma", "bias_current", "bias", "tx_bias_current"]),
        tx_power_dbm: dig_f32(&val, &["tx_power_dbm", "tx_power", "tx_optical_power", "tx_dbm"]),
        rx_power_dbm: dig_f32(&val, &["rx_power_dbm", "rx_power", "rx_optical_power", "rx_dbm"]),
        state: dig_str(&val, &["state", "pon_state", "oper_state", "operational_state"]),
        firmware: dig_str(&val, &["firmware", "firmware_version", "fw_version"]),
        serial: dig_str(&val, &["serial", "pon_serial", "sn", "serial_number"]),
        raw_json: Some(body.to_string()),
        error: None,
        fetch_ms: elapsed_ms,
    }
}

#[cfg(test)]
mod onu_tests {
    use super::*;

    #[test]
    fn parses_typical_metrics_shape() {
        let body = r#"{
            "temperature_c": 52.4,
            "voltage_v": 3.31,
            "tx_power_dbm": 2.1,
            "rx_power_dbm": -18.4,
            "state": "operational",
            "firmware": "8311-2.8.2",
            "serial": "PTRO12345678"
        }"#;
        let r = parse_onu_metrics(body, 42);
        assert_eq!(r.temperature_c, Some(52.4));
        assert_eq!(r.voltage_v, Some(3.31));
        assert_eq!(r.tx_power_dbm, Some(2.1));
        assert_eq!(r.rx_power_dbm, Some(-18.4));
        assert_eq!(r.state.as_deref(), Some("operational"));
        assert_eq!(r.firmware.as_deref(), Some("8311-2.8.2"));
        assert_eq!(r.fetch_ms, 42);
        assert!(r.error.is_none());
    }

    #[test]
    fn finds_nested_temperature_field() {
        let body = r#"{
            "module": { "ddmi": { "temperature": 48.0 } },
            "pon": { "state": "ranging" }
        }"#;
        let r = parse_onu_metrics(body, 0);
        assert_eq!(r.temperature_c, Some(48.0));
        assert_eq!(r.state.as_deref(), Some("ranging"));
    }

    #[test]
    fn parses_string_values_with_units() {
        let body = r#"{ "temp": "55.6 C", "tx_power": "3.0 dBm" }"#;
        let r = parse_onu_metrics(body, 0);
        assert_eq!(r.temperature_c, Some(55.6));
        assert_eq!(r.tx_power_dbm, Some(3.0));
    }

    #[test]
    fn surfaces_parse_error_with_raw() {
        let r = parse_onu_metrics("not json", 100);
        assert!(r.error.is_some());
        assert_eq!(r.raw_json.as_deref(), Some("not json"));
        assert_eq!(r.fetch_ms, 100);
    }
}

fn wmi_vbs_status() -> anyhow::Result<u32> {
    let com = wmi::COMLibrary::new()?;
    let wmi_con = WMIConnection::with_namespace_path("root\\Microsoft\\Windows\\DeviceGuard", com)?;
    let rows: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT VirtualizationBasedSecurityStatus FROM Win32_DeviceGuard")
        .unwrap_or_default();
    for r in rows {
        if let Some(v) = r.get("VirtualizationBasedSecurityStatus") {
            return Ok(match v {
                Variant::UI4(n) => *n,
                Variant::I4(n) => *n as u32,
                _ => 0,
            });
        }
    }
    Ok(0)
}
