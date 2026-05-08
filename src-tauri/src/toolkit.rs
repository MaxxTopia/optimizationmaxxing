//! Toolkit module — live system metrics + utility-action launchers
//! that don't fit the engine/snapshot model. Temps, disk cleanup,
//! disk free-space probe, etc. All read-only or fire-and-forget.

use anyhow::Context;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;
use wmi::{Variant, WMIConnection};

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
    let output = Command::new("ping")
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
    let output = Command::new("powershell.exe")
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
    let bcd_out = Command::new("bcdedit").arg("/enum").arg("{current}").output();
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
