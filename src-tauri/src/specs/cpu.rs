//! CPU detection — WMI for marketing name + raw-cpuid for vendor/family/model.
//!
//! Marketing-string regex is enrichment; CPUID is ground truth (Win32_Processor.Name
//! marketing strings drift, especially post Core Ultra rebrand).

use anyhow::Context;
use raw_cpuid::CpuId;
use serde::Serialize;
use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub vendor: String,
    pub model: String,
    /// Best-effort marketing brand string from WMI (e.g. "13th Gen Intel(R) Core(TM) i7-13700K").
    pub marketing: String,
    pub family: u32,
    pub model_id: u32,
    pub cores: u32,
    pub logical_cores: u32,
    /// Intel: marketing "12th Gen" → 12. AMD Zen 4 → 4. None on unknown.
    pub gen_or_zen: Option<u32>,
}

pub fn detect(wmi: &WMIConnection) -> anyhow::Result<CpuInfo> {
    let rows: Vec<HashMap<String, Variant>> = wmi
        .raw_query("SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors FROM Win32_Processor")
        .context("WMI Win32_Processor query failed")?;
    let row = rows.into_iter().next().context("no Win32_Processor row returned")?;

    let marketing = string_or_default(&row, "Name");
    let manufacturer_wmi = string_or_default(&row, "Manufacturer");
    let cores = u32_or_default(&row, "NumberOfCores");
    let logical_cores = u32_or_default(&row, "NumberOfLogicalProcessors");

    // CPUID — ground truth for vendor + family/model.
    let cpuid = CpuId::new();
    let vendor_str = cpuid
        .get_vendor_info()
        .map(|v| v.as_str().to_string())
        .unwrap_or_else(|| manufacturer_wmi.clone());
    let vendor = normalize_vendor(&vendor_str);

    let (family, model_id) = cpuid
        .get_feature_info()
        .map(|fi| {
            // Intel/AMD effective family = base_family + (extended_family if base==0x0F).
            let base_family = fi.family_id() as u32;
            let extended_family = fi.extended_family_id() as u32;
            let family = if base_family == 0x0F {
                base_family + extended_family
            } else {
                base_family
            };
            // Effective model = (extended_model << 4) | base_model when family is 0x06 or 0x0F.
            let base_model = fi.model_id() as u32;
            let extended_model = fi.extended_model_id() as u32;
            let model = if base_family == 0x06 || base_family == 0x0F {
                (extended_model << 4) | base_model
            } else {
                base_model
            };
            (family, model)
        })
        .unwrap_or((0, 0));

    let model = cpuid
        .get_processor_brand_string()
        .map(|b| b.as_str().trim().to_string())
        .unwrap_or_else(|| marketing.clone());

    let gen_or_zen = match vendor.as_str() {
        "Intel" => infer_intel_gen(&marketing, &model),
        "AMD" => infer_zen_gen(family, model_id, &marketing),
        _ => None,
    };

    Ok(CpuInfo {
        vendor,
        model,
        marketing,
        family,
        model_id,
        cores,
        logical_cores,
        gen_or_zen,
    })
}

fn normalize_vendor(raw: &str) -> String {
    if raw.contains("Intel") || raw.contains("GenuineIntel") {
        "Intel".to_string()
    } else if raw.contains("AMD") || raw.contains("AuthenticAMD") {
        "AMD".to_string()
    } else {
        raw.to_string()
    }
}

/// Marketing-string heuristic: "12th Gen Intel(R) Core(TM) i7-12700K" → 12.
/// Falls back to model-name digits ("i7-13700" → 13).
fn infer_intel_gen(marketing: &str, model: &str) -> Option<u32> {
    if let Some(idx) = marketing.find("th Gen") {
        let prefix = &marketing[..idx];
        if let Some(num_start) = prefix.rfind(|c: char| !c.is_ascii_digit()) {
            let s = prefix[num_start + 1..].trim();
            if let Ok(n) = s.parse::<u32>() {
                return Some(n);
            }
        }
    }
    // Model-name fallback: "i7-13700K" → 13, "i9-14900KF" → 14.
    let combined = format!("{} {}", marketing, model);
    let lower = combined.to_lowercase();
    for needle in ["i9-", "i7-", "i5-", "i3-"] {
        if let Some(pos) = lower.find(needle) {
            let after = &combined[pos + needle.len()..];
            // Take first 4 ascii digits, gen = first 1 or 2.
            let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
            if digits.len() >= 4 {
                let gen_chars = digits.len() - 3;
                if let Ok(n) = digits[..gen_chars].parse::<u32>() {
                    return Some(n);
                }
            }
        }
    }
    None
}

/// AMD Zen mapping — family 0x17/0x19/0x1A and model ranges.
/// References: AMD Family 17h = Zen/Zen+/Zen2, 19h = Zen3/Zen4, 1Ah = Zen5.
fn infer_zen_gen(family: u32, model_id: u32, marketing: &str) -> Option<u32> {
    // Marketing-string first ("Ryzen 7 7700X" → 4, "Ryzen 9 9950X" → 5).
    let combined = marketing.to_lowercase();
    if let Some(pos) = combined.find("ryzen ") {
        let after = &combined[pos + 6..];
        // Skip "7 ", "9 ", "5 ", etc.
        let after = after.trim_start_matches(|c: char| c.is_ascii_digit() || c == ' ');
        let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if !digits.is_empty() {
            let first_digit = digits.chars().next().unwrap();
            let zen = match first_digit {
                '1' => 1,
                '2' => 2,
                '3' => 2, // 3000-series desktop = Zen2
                '4' => 3, // 4000G APU = Zen2 actually but 4000-series desktop is Zen2/3 mix
                '5' => 3, // 5000-series = Zen3
                '7' => 4, // 7000-series = Zen4
                '9' => 5, // 9000-series = Zen5
                _ => 0,
            };
            if zen > 0 {
                return Some(zen);
            }
        }
    }
    // Family-id fallback (rougher).
    match (family, model_id) {
        (0x17, 0x00..=0x0F) => Some(1),
        (0x17, 0x40..=0x4F) | (0x17, 0x60..=0x6F) => Some(2),
        (0x19, 0x00..=0x4F) => Some(3),
        (0x19, 0x60..=0x7F) | (0x19, 0xA0..=0xAF) => Some(4),
        (0x1A, _) => Some(5),
        _ => None,
    }
}

fn string_or_default(row: &HashMap<String, Variant>, key: &str) -> String {
    match row.get(key) {
        Some(Variant::String(s)) => s.clone(),
        _ => String::new(),
    }
}

fn u32_or_default(row: &HashMap<String, Variant>, key: &str) -> u32 {
    match row.get(key) {
        Some(Variant::UI4(n)) => *n,
        Some(Variant::I4(n)) => *n as u32,
        Some(Variant::UI2(n)) => *n as u32,
        Some(Variant::I2(n)) => *n as u32,
        _ => 0,
    }
}
