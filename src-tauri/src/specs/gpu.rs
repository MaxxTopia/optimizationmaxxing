//! GPU detection — Win32_VideoController + name → arch lookup.
//! NVIDIA-only nvidia-smi probe planned for a follow-up; for v0 we stay
//! purely WMI-based which works without driver tooling.

use anyhow::Context;
use serde::Serialize;
use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub vendor: String,
    pub model: String,
    pub vram_mb: Option<u32>,
    pub driver_version: Option<String>,
    pub arch: Option<String>,
}

pub fn detect(wmi: &WMIConnection) -> anyhow::Result<GpuInfo> {
    let rows: Vec<HashMap<String, Variant>> = wmi
        .raw_query("SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController")
        .context("WMI Win32_VideoController query failed")?;

    if rows.is_empty() {
        return Err(anyhow::anyhow!(
            "Win32_VideoController returned 0 rows — WMI service likely sick. \
             Try `net stop winmgmt /y && net start winmgmt` in admin PowerShell, \
             then Re-scan."
        ));
    }

    // Prefer a discrete GPU over the integrated (heuristic: largest AdapterRAM,
    // skipping Microsoft Basic Display + virtual adapters + capture cards).
    //
    // Capture cards register as Win32_VideoController display-class devices
    // even though they're video INPUT (HDMI / SDI sinks), not GPUs. Without
    // filtering, the Diagnostics page can land on an AVerMedia GC573 as the
    // "primary GPU" instead of the real RTX next to it.
    let primary = rows
        .iter()
        .filter(|r| {
            let name = string_or_default(r, "Name").to_lowercase();
            !name.is_empty()
                && !name.contains("microsoft basic")
                && !name.contains("remote display")
                && !name.contains("virtual")
                && !is_capture_card(&name)
        })
        .max_by_key(|r| u64_or_default(r, "AdapterRAM"))
        .cloned()
        // Fallback path — during a driver reload the only entry can be
        // "Microsoft Basic Display Adapter" or a lone capture card. Rather
        // than die, relax the capture-card filter so the user sees what
        // we found (but the real GPU should resurface on the next refresh).
        .or_else(|| {
            rows.iter()
                .filter(|r| !string_or_default(r, "Name").is_empty())
                .max_by_key(|r| u64_or_default(r, "AdapterRAM"))
                .cloned()
        })
        .context("Win32_VideoController returned rows but all had empty Name fields")?;

    let model = string_or_default(&primary, "Name");
    let vendor = infer_vendor(&model);
    let vram_bytes = u64_or_default(&primary, "AdapterRAM");
    let vram_mb = if vram_bytes > 0 {
        // Win32_VideoController.AdapterRAM saturates at 4GB on 32-bit DWORD —
        // a known WMI limitation; we still report it but note caveat in UI.
        Some((vram_bytes / 1_048_576) as u32)
    } else {
        None
    };
    let driver_version = match primary.get("DriverVersion") {
        Some(Variant::String(s)) if !s.is_empty() => Some(s.clone()),
        _ => None,
    };
    let arch = infer_arch(&vendor, &model);

    Ok(GpuInfo {
        vendor,
        model,
        vram_mb,
        driver_version,
        arch,
    })
}

/// Capture cards register as display-class devices via WMI even though they
/// don't render frames. Substring match against the vendor + product strings
/// that show up in the wild. Lowercased input.
fn is_capture_card(lower_name: &str) -> bool {
    const CAPTURE_NEEDLES: &[&str] = &[
        "avermedia",
        "avt gc",        // AVerMedia Live Gamer series (GC573, GC550 Plus, etc.)
        "live gamer",
        "elgato",
        "game capture",
        "cam link",
        "magewell",
        "blackmagic",
        "decklink",      // Blackmagic capture-card product line
        "datapath",
        "epiphan",
        "yuan high-tech",
        "logitech screen share",
    ];
    CAPTURE_NEEDLES.iter().any(|n| lower_name.contains(n))
}

fn infer_vendor(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("nvidia") || n.contains("geforce") || n.contains("rtx") || n.contains("gtx") {
        "NVIDIA".to_string()
    } else if n.contains("amd")
        || n.contains("radeon")
        || n.contains("rx ")
        || n.contains("rx-")
    {
        "AMD".to_string()
    } else if n.contains("intel") || n.contains("arc") || n.contains("uhd") || n.contains("iris") {
        "Intel".to_string()
    } else {
        "Unknown".to_string()
    }
}

/// NVIDIA: GTX 10xx → Pascal, 16xx/20xx → Turing, 30xx → Ampere, 40xx → Ada,
/// 50xx → Blackwell. AMD: RX 5xxx → RDNA, 6xxx → RDNA2, 7xxx → RDNA3,
/// 9xxx → RDNA4. Intel: Arc Axxx → Alchemist, Bxxx → Battlemage.
fn infer_arch(vendor: &str, model: &str) -> Option<String> {
    let m = model.to_lowercase();
    match vendor {
        "NVIDIA" => {
            if let Some(num) = extract_first_4digit_run(&m) {
                let series = num / 100; // RTX 4070 → 40
                return Some(match series {
                    9..=10 => "Pascal",
                    16 => "Turing",
                    20 => "Turing",
                    30 => "Ampere",
                    40 => "Ada",
                    50 => "Blackwell",
                    _ => return None,
                }.to_string());
            }
            None
        }
        "AMD" => {
            if let Some(num) = extract_first_4digit_run(&m) {
                let series = num / 1000; // RX 7900 → 7
                return Some(match series {
                    5 => "RDNA",
                    6 => "RDNA2",
                    7 => "RDNA3",
                    9 => "RDNA4",
                    _ => return None,
                }.to_string());
            }
            None
        }
        "Intel" => {
            if m.contains("arc a") {
                Some("Alchemist".to_string())
            } else if m.contains("arc b") {
                Some("Battlemage".to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_capture_card_matches_avermedia_gc573() {
        assert!(is_capture_card("avermedia avt gc573 live gamer 4k 2.1"));
        assert!(is_capture_card("avt gc573 live gamer"));
    }

    #[test]
    fn is_capture_card_matches_elgato_and_others() {
        assert!(is_capture_card("elgato hd60 x"));
        assert!(is_capture_card("elgato game capture 4k60 pro"));
        assert!(is_capture_card("blackmagic decklink mini"));
        assert!(is_capture_card("magewell pro capture hdmi"));
    }

    #[test]
    fn is_capture_card_passes_real_gpus() {
        assert!(!is_capture_card("nvidia geforce rtx 4070 ti"));
        assert!(!is_capture_card("amd radeon rx 7900 xtx"));
        assert!(!is_capture_card("intel arc a770"));
        assert!(!is_capture_card("intel(r) uhd graphics 770"));
    }
}

fn extract_first_4digit_run(s: &str) -> Option<u32> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i - start >= 4 {
                let slice = &s[start..start + 4];
                if let Ok(n) = slice.parse::<u32>() {
                    return Some(n);
                }
            }
        } else {
            i += 1;
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

fn u64_or_default(row: &HashMap<String, Variant>, key: &str) -> u64 {
    match row.get(key) {
        Some(Variant::UI8(n)) => *n,
        Some(Variant::I8(n)) => *n as u64,
        Some(Variant::UI4(n)) => *n as u64,
        Some(Variant::I4(n)) => *n as u64,
        _ => 0,
    }
}
