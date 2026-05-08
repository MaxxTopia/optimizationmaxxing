//! Motherboard + BIOS detection — Win32_BaseBoard + Win32_BIOS.
//! Needed to gate SCEWIN tweaks (per-OEM) and refuse on laptops.

use serde::Serialize;
use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoboInfo {
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub bios_vendor: Option<String>,
    pub bios_version: Option<String>,
    pub bios_release_date: Option<String>,
    pub bios_serial: Option<String>,
    pub uuid: Option<String>,
    pub is_laptop: bool,
}

pub fn detect(wmi: &WMIConnection) -> anyhow::Result<MoboInfo> {
    let board: Option<HashMap<String, Variant>> = wmi
        .raw_query::<HashMap<String, Variant>>(
            "SELECT Manufacturer, Product, SerialNumber FROM Win32_BaseBoard",
        )
        .ok()
        .and_then(|v| v.into_iter().next());

    let bios: Option<HashMap<String, Variant>> = wmi
        .raw_query::<HashMap<String, Variant>>(
            "SELECT Manufacturer, SMBIOSBIOSVersion, ReleaseDate, SerialNumber FROM Win32_BIOS",
        )
        .ok()
        .and_then(|v| v.into_iter().next());

    let product: Option<HashMap<String, Variant>> = wmi
        .raw_query::<HashMap<String, Variant>>(
            "SELECT UUID FROM Win32_ComputerSystemProduct",
        )
        .ok()
        .and_then(|v| v.into_iter().next());

    let chassis: Vec<HashMap<String, Variant>> = wmi
        .raw_query("SELECT ChassisTypes FROM Win32_SystemEnclosure")
        .unwrap_or_default();

    let is_laptop = detect_laptop(&chassis);

    Ok(MoboInfo {
        manufacturer: board.as_ref().and_then(|r| string_opt(r, "Manufacturer")),
        product: board.as_ref().and_then(|r| string_opt(r, "Product")),
        serial_number: board.as_ref().and_then(|r| string_opt(r, "SerialNumber")),
        bios_vendor: bios.as_ref().and_then(|r| string_opt(r, "Manufacturer")),
        bios_version: bios.as_ref().and_then(|r| string_opt(r, "SMBIOSBIOSVersion")),
        bios_release_date: bios.as_ref().and_then(|r| string_opt(r, "ReleaseDate")),
        bios_serial: bios.as_ref().and_then(|r| string_opt(r, "SerialNumber")),
        uuid: product.as_ref().and_then(|r| string_opt(r, "UUID")),
        is_laptop,
    })
}

fn detect_laptop(chassis_rows: &[HashMap<String, Variant>]) -> bool {
    // ChassisTypes per DMTF: 8=portable, 9=laptop, 10=notebook, 11=hand held,
    // 14=sub-notebook, 30=tablet, 31=convertible, 32=detachable.
    const LAPTOP_TYPES: &[u8] = &[8, 9, 10, 11, 14, 30, 31, 32];
    for row in chassis_rows {
        if let Some(Variant::Array(arr)) = row.get("ChassisTypes") {
            for v in arr {
                let n: u8 = match v {
                    Variant::UI1(n) => *n,
                    Variant::UI2(n) => *n as u8,
                    Variant::I2(n) => *n as u8,
                    Variant::UI4(n) => *n as u8,
                    Variant::I4(n) => *n as u8,
                    _ => continue,
                };
                if LAPTOP_TYPES.contains(&n) {
                    return true;
                }
            }
        }
    }
    false
}

fn string_opt(row: &HashMap<String, Variant>, key: &str) -> Option<String> {
    match row.get(key) {
        Some(Variant::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}
