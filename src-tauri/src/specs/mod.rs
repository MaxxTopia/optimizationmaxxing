//! Spec detection — runs on a blocking thread (COM init is per-thread).
//!
//! Frontend → `detect_specs` Tauri command → `tokio::task::spawn_blocking`
//! → `specs::detect()` here → returns a `SpecProfile`.

use serde::Serialize;

pub mod cpu;
pub mod gpu;
pub mod mobo;
pub mod os;
pub mod ram;
pub mod storage;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecProfile {
    pub cpu: cpu::CpuInfo,
    pub gpu: gpu::GpuInfo,
    pub ram: ram::RamInfo,
    pub os: os::OsInfo,
    pub mobo: mobo::MoboInfo,
    pub storage: storage::StorageInfo,
    pub captured_at: String,
}

pub fn detect() -> anyhow::Result<SpecProfile> {
    let com = wmi::COMLibrary::new()?;
    let wmi_con = wmi::WMIConnection::new(com)?;

    Ok(SpecProfile {
        cpu: cpu::detect(&wmi_con)?,
        gpu: gpu::detect(&wmi_con)?,
        ram: ram::detect(&wmi_con)?,
        os: os::detect(&wmi_con)?,
        mobo: mobo::detect(&wmi_con)?,
        storage: storage::detect(&wmi_con)?,
        captured_at: chrono::Utc::now().to_rfc3339(),
    })
}
