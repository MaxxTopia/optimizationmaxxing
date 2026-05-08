//! OS detection — RtlGetVersion (truthful under compat shims) + registry
//! DisplayVersion lookup ("23H2", "24H2") + UBR (update build revision).

use anyhow::{anyhow, Context};
use serde::Serialize;
use std::collections::HashMap;
use windows::Wdk::System::SystemServices::RtlGetVersion;
use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;
use wmi::{Variant, WMIConnection};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub edition: String,
    /// Friendly name e.g. "Windows 11 Pro".
    pub caption: String,
    /// e.g. "23H2", "24H2".
    pub display_version: String,
    pub major: u32,
    pub minor: u32,
    pub build: u32,
    /// Update Build Revision (e.g. 4317 in 22631.4317).
    pub ubr: Option<u32>,
}

pub fn detect(wmi: &WMIConnection) -> anyhow::Result<OsInfo> {
    // RtlGetVersion — bypasses GetVersionEx compat shims.
    let mut osvi = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    let status = unsafe { RtlGetVersion(&mut osvi) };
    if status.0 != 0 {
        return Err(anyhow!("RtlGetVersion failed with NTSTATUS={}", status.0));
    }

    // Registry — DisplayVersion (e.g. "23H2"), EditionID, UBR.
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .context("opening CurrentVersion registry key")?;
    let display_version: String = key.get_value("DisplayVersion").unwrap_or_default();
    let edition: String = key.get_value("EditionID").unwrap_or_default();
    let ubr: Option<u32> = key.get_value::<u32, _>("UBR").ok();

    // Caption from WMI for friendly display.
    let caption = match wmi.raw_query::<HashMap<String, Variant>>(
        "SELECT Caption FROM Win32_OperatingSystem",
    ) {
        Ok(rows) => rows
            .into_iter()
            .next()
            .and_then(|r| match r.get("Caption") {
                Some(Variant::String(s)) => Some(s.trim().to_string()),
                _ => None,
            })
            .unwrap_or_default(),
        Err(_) => String::new(),
    };

    Ok(OsInfo {
        edition,
        caption,
        display_version,
        major: osvi.dwMajorVersion,
        minor: osvi.dwMinorVersion,
        build: osvi.dwBuildNumber,
        ubr,
    })
}
