//! Per-game-name auto-pin daemon — the v0.1.65 click-to-pin gets a daemon
//! that does it for you on every game launch.
//!
//! Architecture:
//! - One long-running tokio task spawned at app startup
//! - Polls every N seconds via sysinfo for processes matching configured
//!   names (case-insensitive, exact `name.exe` match)
//! - For each matching process not already pinned this cycle, calls
//!   SetProcessDefaultCpuSets via the cpusets module
//! - Tracks {pid → ts} so we don't re-pin the same PID repeatedly
//! - Drops PIDs from tracking when they no longer appear in the process list
//!
//! Config + state live in process memory + a JSON file under
//! `%LOCALAPPDATA%\optmaxxing\auto-pin.json`. Frontend reads/writes config
//! via Tauri commands; the daemon polls the file mtime to pick up changes.

use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use sysinfo::System;

use crate::cpusets;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoPinRule {
    /// Process name (with .exe). Matched case-insensitively against
    /// sysinfo's reported process name.
    pub process_name: String,
    /// CPU Set IDs to pin to. See cpusets.rs for ID semantics.
    pub cores: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoPinConfig {
    pub enabled: bool,
    pub poll_seconds: u32,
    pub rules: Vec<AutoPinRule>,
}

impl Default for AutoPinConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            poll_seconds: 5,
            rules: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoPinPinnedProc {
    pub pid: u32,
    pub process_name: String,
    pub cores: Vec<u32>,
    /// ISO timestamp of when we pinned it.
    pub pinned_at: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoPinStatus {
    /// True if the daemon thread is alive AND config.enabled.
    pub running: bool,
    /// ISO timestamp of last poll cycle.
    pub last_poll: Option<String>,
    /// Currently pinned processes the daemon knows about.
    pub pinned: Vec<AutoPinPinnedProc>,
    /// Echo of current config (for UI to render).
    pub config: AutoPinConfig,
}

// Process-wide config + status. Daemon reads CONFIG, writes STATUS.
static CONFIG: OnceLock<Mutex<AutoPinConfig>> = OnceLock::new();
static STATUS: OnceLock<Mutex<AutoPinStatus>> = OnceLock::new();
static CONFIG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn cfg_lock() -> &'static Mutex<AutoPinConfig> {
    CONFIG.get_or_init(|| Mutex::new(AutoPinConfig::default()))
}

fn status_lock() -> &'static Mutex<AutoPinStatus> {
    STATUS.get_or_init(|| Mutex::new(AutoPinStatus::default()))
}

/// Initialize: set the JSON config path + load existing config from disk.
/// Called once at app startup before the daemon spawns.
pub fn init(config_path: PathBuf) {
    let _ = CONFIG_PATH.set(config_path.clone());
    if let Ok(bytes) = std::fs::read(&config_path) {
        if let Ok(loaded) = serde_json::from_slice::<AutoPinConfig>(&bytes) {
            *cfg_lock().lock() = loaded;
        }
    }
}

/// Start the daemon as a tokio background task. Polls every N seconds (per
/// config.poll_seconds). When config.enabled is false, polls but doesn't
/// pin anything (still maintains the running indicator).
///
/// MUST schedule via `tauri::async_runtime::spawn`, not `tokio::task::spawn`.
/// We're called from Tauri's synchronous `setup` closure — the tokio runtime
/// hasn't started yet, so `tokio::task::spawn` panics with "no reactor
/// running". `tauri::async_runtime` wraps tokio rt-multi-thread and is safe
/// to call from any context. (v0.1.67 shipped the broken version → boot loop.)
pub fn spawn_daemon() {
    tauri::async_runtime::spawn(async {
        loop {
            let (enabled, interval, rules) = {
                let cfg = cfg_lock().lock();
                (cfg.enabled, cfg.poll_seconds.max(1), cfg.rules.clone())
            };

            if enabled && !rules.is_empty() {
                tokio::task::spawn_blocking(move || {
                    let _ = poll_once(&rules);
                })
                .await
                .ok();
            }

            // Always tick STATUS.last_poll so the UI sees the daemon alive.
            {
                let mut st = status_lock().lock();
                st.running = enabled;
                st.last_poll = Some(now_iso());
                st.config = cfg_lock().lock().clone();
            }

            tokio::time::sleep(Duration::from_secs(interval as u64)).await;
        }
    });
}

/// One poll cycle: enumerate processes, pin matching ones, drop dead PIDs.
fn poll_once(rules: &[AutoPinRule]) -> Result<()> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut still_alive: HashMap<u32, ()> = HashMap::new();

    for (pid, proc_) in sys.processes() {
        let name_lc = proc_.name().to_string_lossy().to_lowercase();
        let pid_u32 = pid.as_u32();
        for rule in rules {
            if rule.process_name.trim().is_empty() || rule.cores.is_empty() {
                continue;
            }
            if name_lc != rule.process_name.trim().to_lowercase() {
                continue;
            }
            still_alive.insert(pid_u32, ());

            // Skip if we already pinned this PID with the same cores.
            let already = {
                let st = status_lock().lock();
                st.pinned
                    .iter()
                    .any(|p| p.pid == pid_u32 && p.cores == rule.cores)
            };
            if already {
                continue;
            }

            // Pin via the cpusets module. Errors are non-fatal (silently
            // dropped) — the foreground might've blocked OpenProcess for a
            // protected game, or the PID might've exited mid-poll.
            if let Ok(report) = cpusets::pin_pid_to_cores(pid_u32, &rule.cores) {
                if report.ok {
                    let mut st = status_lock().lock();
                    // Replace any prior entry for this PID.
                    st.pinned.retain(|p| p.pid != pid_u32);
                    st.pinned.push(AutoPinPinnedProc {
                        pid: pid_u32,
                        process_name: report.process_name,
                        cores: rule.cores.clone(),
                        pinned_at: now_iso(),
                    });
                }
            }
        }
    }

    // Drop dead PIDs from STATUS.pinned.
    {
        let mut st = status_lock().lock();
        st.pinned.retain(|p| still_alive.contains_key(&p.pid));
    }

    Ok(())
}

pub fn get_status() -> AutoPinStatus {
    let st = status_lock().lock().clone();
    st
}

pub fn get_config() -> AutoPinConfig {
    cfg_lock().lock().clone()
}

pub fn set_config(new_cfg: AutoPinConfig) -> Result<AutoPinConfig> {
    {
        let mut cfg = cfg_lock().lock();
        *cfg = new_cfg.clone();
    }
    // Persist to disk for next launch.
    if let Some(path) = CONFIG_PATH.get() {
        let json = serde_json::to_vec_pretty(&new_cfg)?;
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(path, json)?;
    }
    Ok(new_cfg)
}

fn now_iso() -> String {
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dt = chrono::DateTime::<chrono::Utc>::from_timestamp(now as i64, 0)
        .unwrap_or_default();
    dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}
