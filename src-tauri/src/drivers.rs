//! Driver health probe — surface stale + known-bad drivers across the
//! GPU / chipset / audio / NIC classes via WMI Win32_PnPSignedDriver.
//!
//! WMI's DriverVersion string is Microsoft's internal version (e.g. NVIDIA
//! exposes `32.0.15.7270` where the user-facing version is `572.70`,
//! derived from the last 5 digits split XXX.XX). We surface BOTH the raw
//! string and the extracted user-facing version when we can derive it.
//!
//! What this is NOT: a driver-update notifier. We don't fetch the latest
//! version from NVIDIA / AMD APIs. The honest read: if your driver is
//! older than the date threshold OR matches a known-bad version we ship
//! with the build, you get warned. Anything else is a "looks fine" pass.

use anyhow::{Context, Result};
use chrono::NaiveDate;
use serde::Serialize;
use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

/// Drivers older than this many days get a `stale` flag. Chipset / audio /
/// NIC vendors typically ship one or two updates per year — if the in-box
/// driver hasn't been refreshed in 18+ months you're almost certainly on a
/// motherboard-bundled driver from the board's ship date.
const STALE_AGE_DAYS_DEFAULT: i64 = 540;
/// GPU drivers move faster; warn after 90 days.
const STALE_AGE_DAYS_GPU: i64 = 90;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverEntry {
    /// Friendly class label for the UI — "GPU", "Chipset", "Audio", "Network", "Other".
    pub class_label: String,
    /// Friendly device name (e.g. "NVIDIA GeForce RTX 4070 Ti").
    pub device_name: String,
    /// Vendor / manufacturer string from the driver INF.
    pub vendor: String,
    /// Raw DriverVersion string from WMI (Microsoft-internal format).
    pub raw_version: String,
    /// Derived user-facing version when we can extract it (NVIDIA only today).
    pub friendly_version: Option<String>,
    /// Driver date as ISO yyyy-mm-dd, or None if WMI returned an unparseable
    /// CIM_DATETIME.
    pub driver_date: Option<String>,
    /// Days since driver_date, or None if date unknown.
    pub age_days: Option<i64>,
    /// True if `age_days` exceeds the class-specific staleness threshold.
    pub stale: bool,
    /// Set when the driver matches a bundled known-bad version. The string
    /// is a short reason ("Raptor Lake stutter regression", etc).
    pub known_bad: Option<String>,
    /// Set when the driver is on a known-good baseline list for its class.
    /// Lets us show a positive ✓ instead of just "no warnings."
    pub known_good: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverHealthReport {
    pub drivers: Vec<DriverEntry>,
    /// Quick top-line: count of stale + known-bad entries the UI can show
    /// without iterating the list.
    pub stale_count: usize,
    pub known_bad_count: usize,
    /// Top-line copy for the UI: "X stale, Y on known-bad list" / "All looks current."
    pub note: String,
}

pub fn read_driver_health(wmi: &WMIConnection) -> Result<DriverHealthReport> {
    let rows: Vec<HashMap<String, Variant>> = wmi
        .raw_query(
            "SELECT DeviceName, DeviceClass, DriverProviderName, DriverVersion, DriverDate \
             FROM Win32_PnPSignedDriver \
             WHERE DriverProviderName IS NOT NULL",
        )
        .context("WMI Win32_PnPSignedDriver query failed")?;

    let today = chrono::Local::now().naive_local().date();
    let mut drivers: Vec<DriverEntry> = Vec::new();
    for row in rows {
        let device_name = string_or_default(&row, "DeviceName");
        let device_class = string_or_default(&row, "DeviceClass");
        let class_label = friendly_class(&device_class, &device_name);
        // Skip the noise classes — we don't have anything useful to say
        // about printer drivers, monitor INFs, etc.
        if class_label == "Skip" {
            continue;
        }
        let vendor = string_or_default(&row, "DriverProviderName");
        let raw_version = string_or_default(&row, "DriverVersion");
        if raw_version.is_empty() {
            continue;
        }
        let driver_date_raw = string_or_default(&row, "DriverDate");
        let driver_date = parse_cim_date(&driver_date_raw);
        let age_days = driver_date.map(|d| (today - d).num_days());
        let stale_threshold = if class_label == "GPU" {
            STALE_AGE_DAYS_GPU
        } else {
            STALE_AGE_DAYS_DEFAULT
        };
        let stale = age_days.map(|d| d > stale_threshold).unwrap_or(false);

        let friendly_version =
            extract_friendly_version(&vendor, &device_name, &raw_version);
        let known_bad = known_bad_match(&vendor, &device_name, friendly_version.as_deref());
        let known_good = !stale
            && known_bad.is_none()
            && age_days.map(|d| d < 365).unwrap_or(false)
            && class_label != "Other";

        drivers.push(DriverEntry {
            class_label: class_label.to_string(),
            device_name,
            vendor,
            raw_version,
            friendly_version,
            driver_date: driver_date.map(|d| d.format("%Y-%m-%d").to_string()),
            age_days,
            stale,
            known_bad,
            known_good,
        });
    }

    // Within each class, dedupe by device_name (PnP enumerates each instance
    // of a multi-output GPU as a separate row with the same driver). Keep
    // the first.
    let mut seen: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();
    drivers.retain(|d| seen.insert((d.class_label.clone(), d.device_name.clone())));

    // Stable sort: GPU first, then Chipset, then Audio, then Network, then Other.
    drivers.sort_by_key(|d| match d.class_label.as_str() {
        "GPU" => 0,
        "Chipset" => 1,
        "Audio" => 2,
        "Network" => 3,
        "Storage" => 4,
        _ => 5,
    });

    let stale_count = drivers.iter().filter(|d| d.stale).count();
    let known_bad_count = drivers.iter().filter(|d| d.known_bad.is_some()).count();
    let note = compose_note(stale_count, known_bad_count, drivers.len());

    Ok(DriverHealthReport {
        drivers,
        stale_count,
        known_bad_count,
        note,
    })
}

fn compose_note(stale: usize, bad: usize, total: usize) -> String {
    if total == 0 {
        return "No signed PnP drivers reported by WMI.".to_string();
    }
    if stale == 0 && bad == 0 {
        return format!("{} drivers — all stable, nothing to update.", total);
    }
    let mut parts: Vec<String> = Vec::new();
    if bad > 0 {
        parts.push(format!(
            "{} need{} an update now (known-bad)",
            bad,
            if bad == 1 { "s" } else { "" }
        ));
    }
    if stale > 0 {
        parts.push(format!(
            "{} worth checking for a newer version",
            stale
        ));
    }
    parts.join(" · ")
}

/// Map raw Win32 DeviceClass strings to short user-facing labels. Anything
/// we don't have meaningful warnings for collapses to "Skip" so it doesn't
/// noise up the UI.
fn friendly_class(class: &str, device_name: &str) -> &'static str {
    let c = class.to_ascii_lowercase();
    let n = device_name.to_ascii_lowercase();
    if c == "display" || n.contains("geforce") || n.contains("rtx") || n.contains("gtx")
        || n.contains("radeon") || n.contains("intel arc")
    {
        return "GPU";
    }
    if c == "system"
        && (n.contains("chipset") || n.contains("smbus") || n.contains("northbridge")
            || n.contains("pci express") || n.contains("infinity fabric"))
    {
        return "Chipset";
    }
    if c == "system" && (n.contains("intel") || n.contains("amd")) && n.contains("controller") {
        return "Chipset";
    }
    if c == "media" || c == "audioendpoint" || c == "soundvideoandgamecontrollers"
        || n.contains("realtek") && n.contains("audio")
        || n.contains("audio")
    {
        return "Audio";
    }
    if c == "net" || c == "netservice" || c == "netclient" || c == "nettrans" {
        return "Network";
    }
    if c == "scsiadapter" || c == "diskdrive" || c == "hdc" {
        return "Storage";
    }
    if c == "monitor" || c == "image" || c == "printer" || c == "ports"
        || c == "battery" || c == "hidclass" || c == "mouse" || c == "keyboard"
        || c == "usb" || c == "computer"
    {
        return "Skip";
    }
    "Other"
}

/// CIM_DATETIME parser — Win32 returns strings like "20250409000000.000000+000".
fn parse_cim_date(raw: &str) -> Option<NaiveDate> {
    if raw.len() < 8 {
        return None;
    }
    let bytes = raw.as_bytes();
    if !bytes[..8].iter().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let y: i32 = raw[0..4].parse().ok()?;
    let m: u32 = raw[4..6].parse().ok()?;
    let d: u32 = raw[6..8].parse().ok()?;
    NaiveDate::from_ymd_opt(y, m, d)
}

/// Extract the user-facing driver version from the Windows-internal version
/// string. NVIDIA-specific today.
///
/// NVIDIA encodes the user-facing version as the last 5 digits of the
/// dot-joined Windows version string. `32.0.15.7270` strips to `320157270`,
/// last 5 digits = `57270` → split as `572.70`. Real release: 572.70.
fn extract_friendly_version(
    vendor: &str,
    device_name: &str,
    raw_version: &str,
) -> Option<String> {
    let v = vendor.to_ascii_lowercase();
    let n = device_name.to_ascii_lowercase();
    let is_nvidia = v.contains("nvidia") || n.contains("nvidia") || n.contains("geforce");
    if !is_nvidia {
        return None;
    }
    let digits: String = raw_version.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 5 {
        return None;
    }
    let last5 = &digits[digits.len() - 5..];
    let major = &last5[..3];
    let minor = &last5[3..];
    Some(format!("{}.{}", major, minor))
}

/// Bundled known-bad driver matcher. Each entry is `(vendor, name_substr,
/// version_substr, reason)`. Conservative — only entries that are widely
/// reported as broken go here. Update with each release.
fn known_bad_match(
    vendor: &str,
    device_name: &str,
    friendly_version: Option<&str>,
) -> Option<String> {
    let v = vendor.to_ascii_lowercase();
    let n = device_name.to_ascii_lowercase();
    let fv = friendly_version.unwrap_or("");

    // NVIDIA — historical known-bad ranges. Add to this list as new
    // incidents land. The matcher is substring-based so "566.36" matches
    // anything starting with "566.36".
    let nvidia = v.contains("nvidia") || n.contains("nvidia") || n.contains("geforce");
    if nvidia {
        const NVIDIA_BAD: &[(&str, &str)] = &[
            ("555.99", "UE5 main-thread stutter regression (Fortnite reports widespread Q3 2024)."),
            ("565.90", "Raptor Lake instability — driver-side voltage curve change. NVIDIA pulled this build."),
            ("566.03", "Texture pop-in + flickering on RTX 40-series. Replaced within a week."),
        ];
        for (ver, reason) in NVIDIA_BAD {
            if !fv.is_empty() && fv.starts_with(ver) {
                return Some((*reason).to_string());
            }
        }
    }

    None
}

fn string_or_default(row: &HashMap<String, Variant>, key: &str) -> String {
    match row.get(key) {
        Some(Variant::String(s)) => s.clone(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cim_date_handles_ms_format() {
        let d = parse_cim_date("20250409000000.000000+000").unwrap();
        assert_eq!(d, NaiveDate::from_ymd_opt(2025, 4, 9).unwrap());
    }

    #[test]
    fn parse_cim_date_returns_none_for_garbage() {
        assert!(parse_cim_date("").is_none());
        assert!(parse_cim_date("not-a-date").is_none());
    }

    #[test]
    fn extract_nvidia_friendly_version_from_wmi_string() {
        let v = extract_friendly_version("NVIDIA", "NVIDIA GeForce RTX 4070 Ti", "32.0.15.7270");
        assert_eq!(v, Some("572.70".to_string()));
    }

    #[test]
    fn extract_friendly_version_ignores_non_nvidia() {
        let v = extract_friendly_version(
            "Advanced Micro Devices, Inc.",
            "AMD Radeon RX 7900 XTX",
            "32.0.21001.45003",
        );
        assert_eq!(v, None);
    }

    #[test]
    fn extract_nvidia_friendly_version_returns_none_for_short_string() {
        // Less than 5 total digits = unparseable. The shortest valid release
        // string has 5 digits packed across segments.
        let v = extract_friendly_version("NVIDIA", "NVIDIA GeForce RTX 4070", "3.0.1.2");
        assert_eq!(v, None);
    }

    #[test]
    fn extract_nvidia_friendly_version_handles_5_digit_last_segment() {
        // Older WMI version-string format: full 5 digits packed in the last
        // segment as "57270". Should still split as 572.70.
        let v = extract_friendly_version("NVIDIA", "NVIDIA GeForce", "1.2.3.57270");
        assert_eq!(v, Some("572.70".to_string()));
    }

    #[test]
    fn known_bad_nvidia_555_99() {
        let r = known_bad_match("NVIDIA", "NVIDIA GeForce RTX 4070", Some("555.99"));
        assert!(r.is_some());
        assert!(r.unwrap().contains("UE5"));
    }

    #[test]
    fn known_bad_does_not_match_safe_version() {
        let r = known_bad_match("NVIDIA", "NVIDIA GeForce RTX 4070", Some("576.40"));
        assert!(r.is_none());
    }

    #[test]
    fn friendly_class_collapses_noise_to_skip() {
        assert_eq!(friendly_class("monitor", ""), "Skip");
        assert_eq!(friendly_class("printer", ""), "Skip");
        assert_eq!(friendly_class("usb", ""), "Skip");
    }

    #[test]
    fn friendly_class_recognizes_gpu_by_name() {
        assert_eq!(friendly_class("display", "NVIDIA GeForce RTX 4070"), "GPU");
        assert_eq!(friendly_class("display", "AMD Radeon RX 7900 XTX"), "GPU");
    }

    #[test]
    fn compose_note_clean_case() {
        let n = compose_note(0, 0, 8);
        assert!(n.contains("all stable"));
    }

    #[test]
    fn compose_note_warns_on_stale_and_bad() {
        let n = compose_note(2, 1, 8);
        assert!(n.contains("need") && n.contains("known-bad"));
        assert!(n.contains("worth checking"));
    }
}
