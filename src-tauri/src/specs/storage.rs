//! Storage detection — Win32_DiskDrive enumeration. Surfaces model,
//! serial, size, interface type so users see exactly what's in the rig
//! and we can later gate per-drive tweaks (e.g. NVMe-only optimizations).

use anyhow::Context;
use serde::Serialize;
use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskDrive {
    pub model: String,
    pub serial: Option<String>,
    pub size_gb: u32,
    pub interface_type: Option<String>,
    pub media_type: Option<String>,
    /// Best-effort bus inference: "NVMe" / "SATA" / "USB" / "Unknown".
    pub bus_kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub drives: Vec<DiskDrive>,
}

pub fn detect(wmi: &WMIConnection) -> anyhow::Result<StorageInfo> {
    let rows: Vec<HashMap<String, Variant>> = wmi
        .raw_query(
            "SELECT Model, SerialNumber, Size, InterfaceType, MediaType, PNPDeviceID FROM Win32_DiskDrive",
        )
        .context("WMI Win32_DiskDrive query failed")?;

    let mut drives = Vec::new();
    for row in rows {
        let model = string_or_default(&row, "Model");
        let serial = string_opt(&row, "SerialNumber").map(|s| {
            // WMI sometimes hex-encodes the serial; strip whitespace for display.
            s.trim().to_string()
        });
        let size_bytes = u64_or_default(&row, "Size");
        let size_gb = (size_bytes / 1_073_741_824) as u32;
        let interface_type = string_opt(&row, "InterfaceType");
        let media_type = string_opt(&row, "MediaType");
        let pnp = string_or_default(&row, "PNPDeviceID");
        let bus_kind = infer_bus(&model, &pnp, interface_type.as_deref());

        drives.push(DiskDrive {
            model: model.trim().to_string(),
            serial,
            size_gb,
            interface_type,
            media_type,
            bus_kind,
        });
    }

    // Sort largest first — main drive usually leads.
    drives.sort_by(|a, b| b.size_gb.cmp(&a.size_gb));
    Ok(StorageInfo { drives })
}

fn infer_bus(model: &str, pnp: &str, interface: Option<&str>) -> String {
    let m = model.to_lowercase();
    let p = pnp.to_lowercase();
    if m.contains("nvme") || p.contains("nvme") {
        return "NVMe".to_string();
    }
    if let Some(i) = interface {
        let il = i.to_lowercase();
        if il.contains("usb") {
            return "USB".to_string();
        }
        if il.contains("scsi") {
            // Many SATA drives report SCSI via Win32_DiskDrive; refine via PNP id.
            if p.contains("sata") {
                return "SATA".to_string();
            }
            return "SCSI/SATA".to_string();
        }
        if il.contains("ide") {
            return "IDE/SATA".to_string();
        }
    }
    "Unknown".to_string()
}

fn string_or_default(row: &HashMap<String, Variant>, key: &str) -> String {
    match row.get(key) {
        Some(Variant::String(s)) => s.clone(),
        _ => String::new(),
    }
}

fn string_opt(row: &HashMap<String, Variant>, key: &str) -> Option<String> {
    match row.get(key) {
        Some(Variant::String(s)) if !s.trim().is_empty() => Some(s.clone()),
        _ => None,
    }
}

fn u64_or_default(row: &HashMap<String, Variant>, key: &str) -> u64 {
    match row.get(key) {
        Some(Variant::UI8(n)) => *n,
        Some(Variant::I8(n)) => *n as u64,
        Some(Variant::UI4(n)) => *n as u64,
        Some(Variant::I4(n)) => *n as u64,
        Some(Variant::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}
