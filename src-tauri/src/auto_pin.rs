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

use anyhow::{anyhow, Context, Result};
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
    /// When true, the app launches hidden at the current user's Windows sign-in
    /// so the runtime watcher is alive before a configured game starts.
    /// This is deliberately opt-in: ordinary registry/BCD/power-plan tweaks do
    /// not need the app process to remain open.
    #[serde(default)]
    pub start_with_windows: bool,
}

impl Default for AutoPinConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            poll_seconds: 5,
            rules: Vec::new(),
            start_with_windows: false,
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
    /// Most recent polling/pinning failure, if any.
    pub last_error: Option<String>,
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
            let mut loaded = loaded;
            // A startup entry without an enabled daemon would only launch a
            // hidden, idle app. Normalize old/manual JSON to the same rule the
            // UI uses and repair the entry below when it is enabled.
            if !loaded.enabled {
                loaded.start_with_windows = false;
            }
            *cfg_lock().lock() = loaded.clone();
            // Reconcile both sides of the opt-in state. This also removes a
            // stale Run entry left by an older config that was later disabled.
            // The installed executable path can change after an update, so an
            // enabled entry is rewritten to the current executable. Startup
            // repair is best effort because init cannot surface a Tauri
            // command error yet.
            let _ = set_startup_entry(loaded.start_with_windows);
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

            let last_error = if enabled && !rules.is_empty() {
                match tokio::task::spawn_blocking(move || poll_once(&rules)).await {
                    Ok(Ok(())) => None,
                    Ok(Err(error)) => Some(format!("{error:#}")),
                    Err(error) => Some(format!("auto-pin poll task failed: {error}")),
                }
            } else {
                None
            };

            // Always tick STATUS.last_poll so the UI sees the daemon alive.
            {
                let mut st = status_lock().lock();
                st.running = enabled;
                st.last_poll = Some(now_iso());
                st.config = cfg_lock().lock().clone();
                st.last_error = last_error;
            }

            tokio::time::sleep(Duration::from_secs(interval as u64)).await;
        }
    });
}

/// One poll cycle: reconcile matching processes, clear removed/empty rules,
/// pin active rules, and drop dead PIDs.
fn poll_once(rules: &[AutoPinRule]) -> Result<()> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut still_alive: HashMap<u32, ()> = HashMap::new();
    let mut first_error: Option<String> = None;

    for (pid, proc_) in sys.processes() {
        let name_lc = proc_.name().to_string_lossy().to_lowercase();
        let pid_u32 = pid.as_u32();

        // Keep a copy of the daemon's previous observation so removing a rule
        // cannot leave a live process pinned forever. An empty rule is also a
        // deliberate "restore native scheduler" request, including after an
        // app restart where STATUS no longer remembers the PID.
        let was_tracked = {
            let st = status_lock().lock();
            st.pinned.iter().any(|p| p.pid == pid_u32)
        };
        let matching_rules = rules
            .iter()
            .filter(|rule| {
                !rule.process_name.trim().is_empty()
                    && name_lc == rule.process_name.trim().to_lowercase()
            })
            .collect::<Vec<_>>();
        let active_rules = matching_rules
            .iter()
            .filter(|rule| !rule.cores.is_empty())
            .copied()
            .collect::<Vec<_>>();

        // No active rule means native scheduling is the requested state. If
        // the rule was explicitly emptied, call Windows even when the daemon
        // has just restarted and has no in-memory receipt for this PID.
        if active_rules.is_empty() {
            if !matching_rules.is_empty() || was_tracked {
                match cpusets::clear_pin(pid_u32) {
                    Ok(report) if report.ok => {
                        let mut st = status_lock().lock();
                        st.pinned.retain(|p| p.pid != pid_u32);
                    }
                    Ok(report) => {
                        if was_tracked {
                            still_alive.insert(pid_u32, ());
                        }
                        if first_error.is_none() {
                            first_error = report.error.or_else(|| {
                                Some(format!("Windows did not clear CPU Sets for PID {pid_u32}"))
                            });
                        }
                    }
                    Err(error) => {
                        if was_tracked {
                            still_alive.insert(pid_u32, ());
                        }
                        if first_error.is_none() {
                            first_error = Some(format!(
                                "could not restore native CPU scheduling for PID {pid_u32}: {error:#}"
                            ));
                        }
                    }
                }
            }
            continue;
        }

        still_alive.insert(pid_u32, ());

        for rule in active_rules {
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

            // Keep polling other matching processes, but preserve the first
            // failure so the UI does not report a healthy pin that never landed.
            match cpusets::pin_pid_to_cores(pid_u32, &rule.cores) {
                Ok(report) if report.ok => {
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
                Ok(report) => {
                    if first_error.is_none() {
                        first_error = report.error.or_else(|| {
                            Some(format!(
                                "Windows did not apply CPU Sets to {} (PID {pid_u32})",
                                rule.process_name
                            ))
                        });
                    }
                }
                Err(error) => {
                    if first_error.is_none() {
                        first_error = Some(format!(
                            "could not apply CPU Sets to {} (PID {pid_u32}): {error:#}",
                            rule.process_name
                        ));
                    }
                }
            }
        }
    }

    // Drop dead PIDs from STATUS.pinned.
    {
        let mut st = status_lock().lock();
        st.pinned.retain(|p| still_alive.contains_key(&p.pid));
    }

    match first_error {
        Some(error) => Err(anyhow!(error)),
        None => Ok(()),
    }
}

pub fn get_status() -> AutoPinStatus {
    let st = status_lock().lock().clone();
    st
}

pub fn get_config() -> AutoPinConfig {
    cfg_lock().lock().clone()
}

pub fn set_config(mut new_cfg: AutoPinConfig) -> Result<AutoPinConfig> {
    if !new_cfg.enabled {
        new_cfg.start_with_windows = false;
    }

    let previous = cfg_lock().lock().clone();
    let startup_changed = previous.start_with_windows != new_cfg.start_with_windows;
    if startup_changed {
        set_startup_entry(new_cfg.start_with_windows)?;
    }

    // Persist to disk before publishing the new in-memory config. If either
    // write fails, leave the old runtime configuration intact and best-effort
    // restore the previous Run entry so a reboot cannot produce a half-save.
    if let Some(path) = CONFIG_PATH.get() {
        let persist_result = (|| -> Result<()> {
            let json = serde_json::to_vec_pretty(&new_cfg)?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).with_context(|| {
                    format!("create auto-pin config directory {}", parent.display())
                })?;
            }
            std::fs::write(path, json)
                .with_context(|| format!("write auto-pin config {}", path.display()))?;
            Ok(())
        })();
        if let Err(error) = persist_result {
            if startup_changed {
                let _ = set_startup_entry(previous.start_with_windows);
            }
            return Err(error);
        }
    }

    *cfg_lock().lock() = new_cfg.clone();
    Ok(new_cfg)
}

#[cfg(windows)]
const STARTUP_RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

#[cfg(windows)]
const STARTUP_RUN_VALUE: &str = "Optimizationmaxxing AutoPin Watcher";

/// Manage the opt-in per-user launcher for the runtime CPU-set watcher.
///
/// This uses HKCU rather than a scheduled task or a service: it needs no
/// administrator approval, follows the signed-in user's profile, and can be
/// removed exactly when the user turns the option off.
#[cfg(windows)]
fn set_startup_entry(enabled: bool) -> Result<()> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu
        .create_subkey(STARTUP_RUN_KEY)
        .context("open the current-user Windows startup key")?;

    if !enabled {
        match run_key.delete_value(STARTUP_RUN_VALUE) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error).context("remove the Optimizationmaxxing startup entry")
            }
        }
        return Ok(());
    }

    let exe = std::env::current_exe().context("resolve the Optimizationmaxxing executable path")?;
    let command = format!("\"{}\" --background", exe.display());
    run_key
        .set_value(STARTUP_RUN_VALUE, &command)
        .context("write the Optimizationmaxxing startup entry")?;
    Ok(())
}

#[cfg(not(windows))]
fn set_startup_entry(enabled: bool) -> Result<()> {
    if enabled {
        Err(anyhow!(
            "Windows sign-in startup is only available on Windows"
        ))
    } else {
        Ok(())
    }
}

fn now_iso() -> String {
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dt = chrono::DateTime::<chrono::Utc>::from_timestamp(now as i64, 0).unwrap_or_default();
    dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}
