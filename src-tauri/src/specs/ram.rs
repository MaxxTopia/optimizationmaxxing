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
    /// Per-DIMM facts used to detect mixed kits and four-DIMM layouts. These
    /// are inventory signals only; WMI cannot prove DRAM die, rank, or stable
    /// overclocking headroom.
    pub modules: Vec<RamModuleInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RamModuleInfo {
    pub slot: String,
    pub manufacturer: Option<String>,
    pub part_number: Option<String>,
    pub capacity_gb: u32,
    pub speed_mts: Option<u32>,
    pub configured_speed_mts: Option<u32>,
    pub form_factor: Option<String>,
    pub memory_type: Option<String>,
}

pub fn detect(wmi: &WMIConnection) -> anyhow::Result<RamInfo> {
    let rows: Vec<HashMap<String, Variant>> = wmi
        .raw_query(
            "SELECT Capacity, Speed, ConfiguredClockSpeed, Manufacturer, PartNumber, DeviceLocator, BankLabel, FormFactor, MemoryType, SMBIOSMemoryType FROM Win32_PhysicalMemory",
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
    let modules = rows.iter().map(module_from_row).collect();

    Ok(RamInfo {
        total_gb,
        stick_count,
        speed_mts,
        configured_speed_mts,
        manufacturer,
        part_number,
        modules,
    })
}

fn module_from_row(row: &HashMap<String, Variant>) -> RamModuleInfo {
    let bank = string_opt(row, "BankLabel").unwrap_or_default();
    let device = string_opt(row, "DeviceLocator").unwrap_or_default();
    let slot = match (bank.is_empty(), device.is_empty()) {
        (false, false) => format!("{bank}/{device}"),
        (false, true) => bank,
        (true, false) => device,
        (true, true) => "unknown slot".to_string(),
    };

    let memory_type = row
        .get("SMBIOSMemoryType")
        .and_then(u32_from_variant)
        .or_else(|| row.get("MemoryType").and_then(u32_from_variant))
        .and_then(memory_type_name);

    RamModuleInfo {
        slot,
        manufacturer: string_opt(row, "Manufacturer"),
        part_number: string_opt(row, "PartNumber"),
        capacity_gb: (u64_or_default(row, "Capacity") / 1_073_741_824) as u32,
        speed_mts: u32_opt(row, "Speed"),
        configured_speed_mts: u32_opt(row, "ConfiguredClockSpeed"),
        form_factor: row
            .get("FormFactor")
            .and_then(u32_from_variant)
            .and_then(form_factor_name),
        memory_type,
    }
}

fn string_opt(row: &HashMap<String, Variant>, key: &str) -> Option<String> {
    match row.get(key) {
        Some(Variant::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}

fn u32_opt(row: &HashMap<String, Variant>, key: &str) -> Option<u32> {
    row.get(key).and_then(u32_from_variant)
}

fn u32_from_variant(value: &Variant) -> Option<u32> {
    match value {
        Variant::UI4(n) => Some(*n),
        Variant::I4(n) => (*n >= 0).then_some(*n as u32),
        Variant::UI2(n) => Some(*n as u32),
        Variant::I2(n) => (*n >= 0).then_some(*n as u32),
        Variant::UI1(n) => Some(*n as u32),
        Variant::I1(n) => (*n >= 0).then_some(*n as u32),
        Variant::UI8(n) => (*n <= u32::MAX as u64).then_some(*n as u32),
        Variant::I8(n) => (*n >= 0 && *n <= u32::MAX as i64).then_some(*n as u32),
        Variant::String(s) => s.parse().ok(),
        _ => None,
    }
}

fn form_factor_name(value: u32) -> Option<String> {
    let name = match value {
        8 => "DIMM",
        12 => "SO-DIMM",
        13 => "SRIMM",
        0 => return None,
        _ => return Some(format!("FormFactor {value}")),
    };
    Some(name.to_string())
}

fn memory_type_name(value: u32) -> Option<String> {
    let name = match value {
        24 => "DDR3",
        26 => "DDR4",
        34 => "DDR5",
        0 => return None,
        _ => return Some(format!("MemoryType {value}")),
    };
    Some(name.to_string())
}

fn u64_or_default(row: &HashMap<String, Variant>, key: &str) -> u64 {
    match row.get(key) {
        Some(Variant::UI8(n)) => *n,
        Some(Variant::I8(n)) => *n as u64,
        Some(Variant::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}
