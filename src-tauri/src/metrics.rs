//! Live system metrics for the dashboard ring gauges (CPU% / RAM%).
//! Uses sysinfo crate; refreshed on each call. Keep refresh-cycle short
//! (<500ms apart confuses CPU sampling — sysinfo wants ~1s minimum).

use parking_lot::Mutex;
use serde::Serialize;
use std::sync::OnceLock;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfSnapshot {
    pub cpu_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
    pub ram_percent: f32,
    pub uptime_secs: u64,
}

static SYS: OnceLock<Mutex<System>> = OnceLock::new();

fn sys() -> &'static Mutex<System> {
    SYS.get_or_init(|| {
        // new_all pre-registers all probes; new() leaves memory uninitialized,
        // which made `total_memory()` return 0 → RAM gauge stuck at 0%.
        let s = System::new_all();
        Mutex::new(s)
    })
}

pub fn snapshot() -> PerfSnapshot {
    let mut s = sys().lock();
    s.refresh_cpu_usage();
    s.refresh_memory();

    let cpu_percent = s.global_cpu_usage();
    let ram_total = s.total_memory() as f64;
    let ram_used = s.used_memory() as f64;

    PerfSnapshot {
        cpu_percent,
        ram_used_gb: (ram_used / 1_073_741_824.0) as f32,
        ram_total_gb: (ram_total / 1_073_741_824.0) as f32,
        ram_percent: if ram_total > 0.0 {
            (ram_used / ram_total * 100.0) as f32
        } else {
            0.0
        },
        uptime_secs: System::uptime(),
    }
}
