//! BIOS audit — read everything Windows can see indirectly about BIOS state,
//! so we can tell the user "this is on, this is off, here's what to flip"
//! without running SCEWIN.
//!
//! What's readable from Windows:
//!   * BIOS firmware mode (UEFI vs Legacy) → CSM off iff UEFI
//!   * Secure Boot
//!   * TPM 2.0 present + enabled
//!   * VBS / HVCI (reuses toolkit::read_vbs_report)
//!   * Hybrid CPU + SMT/HT (reuses cpusets::cpu_set_info)
//!   * Installed RAM type + JEDEC vs configured speed → EXPO/XMP applied?
//!   * CPU brand string
//!   * Active power plan (proxies C-state behavior — Ultimate Performance
//!     disables idle C-states; Balanced + Power Saver leave them on)
//!
//! NOT readable from Windows (need SCEWIN dump or visit BIOS):
//!   * PBO / Curve Optimizer per-core offsets
//!   * EXPO timing values (we see the FREQ but not the timings)
//!   * SVID Behavior / LLC / Voltage curves
//!   * Resizable BAR (Win11 exposes the OS-side flag but not whether BIOS
//!     enables it — surfacing this needs nvidia-smi which is a separate
//!     dependency; queued)
//!   * PCIe Gen running (need NVAPI or vendor tools; queued)
//!
//! The frontend renders pass/warn/fail/unknown per check + a "what BIOS
//! settings we can't see — run SCEWIN dump to verify" panel.

use anyhow::{Context, Result};
use serde::Serialize;

use crate::process_helpers::hidden_powershell;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiosAudit {
    /// "UEFI" / "Legacy" / "Unknown".
    pub bios_mode: Option<String>,
    /// True iff `Confirm-SecureBootUEFI` returns true.
    pub secure_boot: Option<bool>,
    /// TPM present + enabled per `Get-Tpm`.
    pub tpm_enabled: Option<bool>,
    /// CPU brand string (e.g. "13th Gen Intel(R) Core(TM) i9-13900K").
    pub cpu_brand: Option<String>,
    /// SMT (AMD) / HT (Intel) — true iff logical_cores > physical_cores.
    pub smt_enabled: Option<bool>,
    /// Reported clock the BIOS booted memory at, in MHz. The "Speed"
    /// field on Win32_PhysicalMemory.
    pub ram_speed_mhz: Option<u32>,
    /// The actual running clock per WMI's ConfiguredClockSpeed. Sometimes
    /// differs from `ram_speed_mhz` when the BIOS booted at JEDEC and a
    /// later memory-training pass succeeded.
    pub ram_configured_mhz: Option<u32>,
    /// "DDR4" / "DDR5" / "Unknown" — decoded from SMBIOSMemoryType.
    pub ram_type: Option<String>,
    /// True iff `ram_speed_mhz` exceeds the JEDEC default for `ram_type`.
    /// Proxies "did EXPO/XMP actually train?"
    pub expo_xmp_active: Option<bool>,
    /// Active Windows power plan GUID.
    pub power_plan_guid: Option<String>,
    /// Friendly name of the power plan ("High performance" / "Ultimate
    /// Performance" / "Balanced" / "Power saver" / custom).
    pub power_plan_name: Option<String>,
    /// Motherboard manufacturer from Win32_BaseBoard ("ASUSTeK COMPUTER INC.").
    pub mobo_manufacturer: Option<String>,
    /// Motherboard product / model ("ROG STRIX X870E-E GAMING WIFI").
    pub mobo_product: Option<String>,
    /// BIOS firmware vendor (often "American Megatrends Inc." regardless of
    /// board vendor — AMI is the OEM most boards use).
    pub bios_vendor: Option<String>,
    /// BIOS firmware version string ("1843" on ASUS, "7E18v2C" on MSI, etc.).
    pub bios_version: Option<String>,
    /// BIOS release date (raw WMI string — yyyymmdd format).
    pub bios_release_date: Option<String>,
}

const JEDEC_DDR4_MHZ: u32 = 2666;
const JEDEC_DDR5_MHZ: u32 = 4800;

pub fn read_bios_audit() -> Result<BiosAudit> {
    // One PowerShell pass that emits a JSON blob covering every Windows-side
    // BIOS-adjacent value. Built-in cmdlets only; works on Win10 + Win11.
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$out = [ordered]@{
    biosMode             = $null
    secureBoot           = $null
    tpmEnabled           = $null
    cpuBrand             = $null
    smtEnabled           = $null
    ramSpeedMhz          = $null
    ramConfiguredMhz     = $null
    ramType              = $null
    powerPlanGuid        = $null
    powerPlanName        = $null
    moboManufacturer     = $null
    moboProduct          = $null
    biosVendor           = $null
    biosVersion          = $null
    biosReleaseDate      = $null
}

try {
    $cs = Get-ComputerInfo -Property BiosFirmwareType -ErrorAction Stop
    if ($cs.BiosFirmwareType) { $out.biosMode = [string]$cs.BiosFirmwareType }
} catch {}

try {
    $board = Get-CimInstance Win32_BaseBoard -ErrorAction Stop | Select-Object -First 1
    if ($null -ne $board) {
        if ($board.Manufacturer) { $out.moboManufacturer = [string]$board.Manufacturer }
        if ($board.Product)      { $out.moboProduct      = [string]$board.Product }
    }
} catch {}

try {
    $bios = Get-CimInstance Win32_BIOS -ErrorAction Stop | Select-Object -First 1
    if ($null -ne $bios) {
        if ($bios.Manufacturer)      { $out.biosVendor      = [string]$bios.Manufacturer }
        if ($bios.SMBIOSBIOSVersion)  { $out.biosVersion     = [string]$bios.SMBIOSBIOSVersion }
        if ($bios.ReleaseDate) {
            # ReleaseDate is yyyymmdd000000.000000+000 (CIM_DATETIME). Take the date prefix.
            $rd = [string]$bios.ReleaseDate
            if ($rd.Length -ge 8) { $out.biosReleaseDate = $rd.Substring(0, 8) }
        }
    }
} catch {}

try {
    $sb = Confirm-SecureBootUEFI -ErrorAction Stop
    if ($null -ne $sb) { $out.secureBoot = [bool]$sb }
} catch {}

try {
    $tpm = Get-Tpm -ErrorAction Stop
    if ($null -ne $tpm) {
        $out.tpmEnabled = ([bool]$tpm.TpmReady -and [bool]$tpm.TpmEnabled)
    }
} catch {}

try {
    $cpu = Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1
    if ($null -ne $cpu) {
        $out.cpuBrand = [string]$cpu.Name
        $logical  = [int]$cpu.NumberOfLogicalProcessors
        $physical = [int]$cpu.NumberOfCores
        if ($physical -gt 0) {
            $out.smtEnabled = ($logical -gt $physical)
        }
    }
} catch {}

try {
    $mems = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction Stop)
    if ($mems.Count -gt 0) {
        $first = $mems[0]
        $out.ramSpeedMhz       = [int]$first.Speed
        $out.ramConfiguredMhz  = [int]$first.ConfiguredClockSpeed
        switch ([int]$first.SMBIOSMemoryType) {
            26 { $out.ramType = 'DDR4' }
            34 { $out.ramType = 'DDR5' }
            35 { $out.ramType = 'DDR5' }
            default { $out.ramType = 'Unknown' }
        }
    }
} catch {}

try {
    $plan = powercfg /getactivescheme
    if ($plan -match 'GUID:\s+([0-9a-f-]+)\s+\(([^)]+)\)') {
        $out.powerPlanGuid = $matches[1]
        $out.powerPlanName = $matches[2]
    }
} catch {}

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
        .context("spawn PowerShell for BIOS audit")?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(BiosAudit {
            bios_mode: None,
            secure_boot: None,
            tpm_enabled: None,
            cpu_brand: None,
            smt_enabled: None,
            ram_speed_mhz: None,
            ram_configured_mhz: None,
            ram_type: None,
            expo_xmp_active: None,
            power_plan_guid: None,
            power_plan_name: None,
            mobo_manufacturer: None,
            mobo_product: None,
            bios_vendor: None,
            bios_version: None,
            bios_release_date: None,
        });
    }

    #[derive(serde::Deserialize)]
    struct Raw {
        #[serde(rename = "biosMode")]
        bios_mode: Option<String>,
        #[serde(rename = "secureBoot")]
        secure_boot: Option<bool>,
        #[serde(rename = "tpmEnabled")]
        tpm_enabled: Option<bool>,
        #[serde(rename = "cpuBrand")]
        cpu_brand: Option<String>,
        #[serde(rename = "smtEnabled")]
        smt_enabled: Option<bool>,
        #[serde(rename = "ramSpeedMhz")]
        ram_speed_mhz: Option<u32>,
        #[serde(rename = "ramConfiguredMhz")]
        ram_configured_mhz: Option<u32>,
        #[serde(rename = "ramType")]
        ram_type: Option<String>,
        #[serde(rename = "powerPlanGuid")]
        power_plan_guid: Option<String>,
        #[serde(rename = "powerPlanName")]
        power_plan_name: Option<String>,
        #[serde(rename = "moboManufacturer")]
        mobo_manufacturer: Option<String>,
        #[serde(rename = "moboProduct")]
        mobo_product: Option<String>,
        #[serde(rename = "biosVendor")]
        bios_vendor: Option<String>,
        #[serde(rename = "biosVersion")]
        bios_version: Option<String>,
        #[serde(rename = "biosReleaseDate")]
        bios_release_date: Option<String>,
    }

    let raw: Raw = serde_json::from_str(&stdout)
        .with_context(|| format!("parse BIOS audit JSON: {stdout}"))?;

    let expo_xmp_active = expo_xmp_from_speed(raw.ram_speed_mhz, raw.ram_type.as_deref());

    Ok(BiosAudit {
        bios_mode: raw.bios_mode.filter(|s| !s.is_empty()),
        secure_boot: raw.secure_boot,
        tpm_enabled: raw.tpm_enabled,
        cpu_brand: raw.cpu_brand.filter(|s| !s.is_empty()),
        smt_enabled: raw.smt_enabled,
        ram_speed_mhz: raw.ram_speed_mhz.filter(|n| *n > 0),
        ram_configured_mhz: raw.ram_configured_mhz.filter(|n| *n > 0),
        ram_type: raw.ram_type.filter(|s| !s.is_empty()),
        expo_xmp_active,
        power_plan_guid: raw.power_plan_guid.filter(|s| !s.is_empty()),
        power_plan_name: raw.power_plan_name.filter(|s| !s.is_empty()),
        mobo_manufacturer: raw.mobo_manufacturer.filter(|s| !s.is_empty()),
        mobo_product: raw.mobo_product.filter(|s| !s.is_empty()),
        bios_vendor: raw.bios_vendor.filter(|s| !s.is_empty()),
        bios_version: raw.bios_version.filter(|s| !s.is_empty()),
        bios_release_date: raw.bios_release_date.filter(|s| !s.is_empty()),
    })
}

/// Returns Some(true) if BIOS booted memory above the JEDEC default for its
/// type — that's a near-perfect proxy for "EXPO / XMP profile trained
/// successfully." Some(false) iff at-or-below JEDEC. None when we can't
/// classify (unknown RAM type or no speed).
fn expo_xmp_from_speed(speed_mhz: Option<u32>, ram_type: Option<&str>) -> Option<bool> {
    let speed = speed_mhz?;
    if speed == 0 {
        return None;
    }
    match ram_type {
        Some("DDR4") => Some(speed > JEDEC_DDR4_MHZ),
        Some("DDR5") => Some(speed > JEDEC_DDR5_MHZ),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ddr5_at_6000_is_expo_active() {
        assert_eq!(expo_xmp_from_speed(Some(6000), Some("DDR5")), Some(true));
    }

    #[test]
    fn ddr5_at_jedec_4800_is_not_expo() {
        assert_eq!(expo_xmp_from_speed(Some(4800), Some("DDR5")), Some(false));
    }

    #[test]
    fn ddr4_at_3600_is_expo_active() {
        assert_eq!(expo_xmp_from_speed(Some(3600), Some("DDR4")), Some(true));
    }

    #[test]
    fn ddr4_at_2666_jedec_is_not_xmp() {
        assert_eq!(expo_xmp_from_speed(Some(2666), Some("DDR4")), Some(false));
    }

    #[test]
    fn unknown_ram_type_returns_none() {
        assert_eq!(expo_xmp_from_speed(Some(6000), None), None);
        assert_eq!(expo_xmp_from_speed(Some(6000), Some("Unknown")), None);
    }

    #[test]
    fn zero_speed_returns_none() {
        assert_eq!(expo_xmp_from_speed(Some(0), Some("DDR5")), None);
        assert_eq!(expo_xmp_from_speed(None, Some("DDR5")), None);
    }
}
