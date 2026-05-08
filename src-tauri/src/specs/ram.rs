//! RAM detection — Win32_PhysicalMemory across all DIMMs.

use anyhow::Context;
use serde::Serialize;
use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RamInfo {
    pub total_gb: u32,
    pub stick_count: u32,
    pub speed_mts: Option<u32>,
    pub configured_speed_mts: Option<u32>,
    pub manufacturer: Option<String>,
    pub part_number: Option<String>,
}

pub fn detect(wmi: &WMIConnection) -> anyhow::Result<RamInfo> {
    let rows: Vec<HashMap<String, Variant>> = wmi
        .raw_query(
            "SELECT Capacity, Speed, ConfiguredClockSpeed, Manufacturer, PartNumber FROM Win32_PhysicalMemory",
        )
        .context("WMI Win32_PhysicalMemory query failed")?;

    let stick_count = rows.len() as u32;
    let total_bytes: u64 = rows.iter().map(|r| u64_or_default(r, "Capacity")).sum();
    let total_gb = (total_bytes / 1_073_741_824) as u32;

    // Speed columns can vary; take from first stick (usually all match).
    let speed_mts = rows.first().and_then(|r| u32_opt(r, "Speed"));
    let configured_speed_mts = rows.first().and_then(|r| u32_opt(r, "ConfiguredClockSpeed"));
    let manufacturer = rows.first().and_then(|r| string_opt(r, "Manufacturer"));
    let part_number = rows.first().and_then(|r| string_opt(r, "PartNumber"));

    Ok(RamInfo {
        total_gb,
        stick_count,
        speed_mts,
        configured_speed_mts,
        manufacturer,
        part_number,
    })
}

fn string_opt(row: &HashMap<String, Variant>, key: &str) -> Option<String> {
    match row.get(key) {
        Some(Variant::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}

fn u32_opt(row: &HashMap<String, Variant>, key: &str) -> Option<u32> {
    match row.get(key) {
        Some(Variant::UI4(n)) => Some(*n),
        Some(Variant::I4(n)) => Some(*n as u32),
        Some(Variant::UI2(n)) => Some(*n as u32),
        Some(Variant::I2(n)) => Some(*n as u32),
        _ => None,
    }
}

fn u64_or_default(row: &HashMap<String, Variant>, key: &str) -> u64 {
    match row.get(key) {
        Some(Variant::UI8(n)) => *n,
        Some(Variant::I8(n)) => *n as u64,
        Some(Variant::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}
