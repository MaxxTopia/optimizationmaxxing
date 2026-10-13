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
//! via Tauri commands; writes are replaced atomically so a crash cannot leave
//! a partially written rule file.

use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use sysinfo::System;

use crate::cpusets;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoPinRule {
    /// Process name (with .exe). Matched case-insensitively against
    /// sysinfo's reported process name.
    pub process_name: String,
    /// CPU Set IDs to pin to. See cpusets.rs for ID semantics.
    pub cores: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    let mut startup_error: Option<String> = None;
    match std::fs::read(&config_path) {
        Ok(bytes) => match serde_json::from_slice::<AutoPinConfig>(&bytes) {
            Ok(loaded) => {
                let normalized = normalize_config(loaded.clone());
                *cfg_lock().lock() = normalized.clone();
                {
                    let mut status = status_lock().lock();
                    status.config = normalized.clone();
                }
                // Repair older hand-edited files once, but never leave a
                // normalized config only in memory: the next reboot must see
                // the same rules.
                if normalized != loaded {
                    if let Err(error) = persist_config(&config_path, &normalized) {
                        startup_error = Some(format!(
                            "Saved CPU-set rules were normalized in memory but could not be repaired on disk: {error:#}"
                        ));
                    }
                }
                if let Err(error) = set_startup_entry(normalized.start_with_windows) {
                    startup_error = Some(format!(
                        "Watcher rules loaded, but Windows sign-in startup could not be reconciled: {error:#}"
                    ));
                }
            }
            Err(error) => {
                // Fail closed on corrupt state: do not keep launching a hidden
                // watcher with unknown rules. The diagnostic remains visible
                // in the UI instead of silently falling back to defaults.
                let _ = set_startup_entry(false);
                startup_error = Some(format!(
                    "Saved CPU-set watcher config is invalid and was not used: {error}"
                ));
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            // A missing config is the first-run state. Remove any stale Run
            // value left by an older build so sign-in cannot launch an idle
            // hidden copy unexpectedly.
            if let Err(startup) = set_startup_entry(false) {
                startup_error = Some(format!(
                    "No watcher config exists, and a stale Windows sign-in entry could not be removed: {startup:#}"
                ));
            }
        }
        Err(error) => {
            let _ = set_startup_entry(false);
            startup_error = Some(format!(
                "Saved CPU-set watcher config could not be read and was not used: {error}"
            ));
        }
    }
    if let Some(error) = startup_error {
        status_lock().lock().last_error = Some(error);
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
            let has_rules = !rules.is_empty();

            let last_error = if enabled && has_rules {
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
                if let Some(error) = last_error {
                    st.last_error = Some(error);
                } else if enabled && has_rules {
                    // A successful poll clears a previous poll failure, but
                    // leave startup/configuration diagnostics visible while
                    // the watcher is idle so the user can fix them.
                    st.last_error = None;
                }
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
            // Do not trust the daemon's last in-memory receipt forever. A
            // launcher, another scheduler tool, or the game itself may have
            // changed the process assignment since the last poll. Verify the
            // live process before skipping a write.
            let already = {
                let st = status_lock().lock();
                st.pinned
                    .iter()
                    .any(|p| p.pid == pid_u32 && p.cores == rule.cores)
            };
            let already_verified = already
                && matches!(
                    cpusets::read_pid_cpu_sets(pid_u32),
                    Ok(applied) if applied == rule.cores
                );
            if already_verified {
                continue;
            }
            if already {
                status_lock().lock().pinned.retain(|p| p.pid != pid_u32);
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
    new_cfg = normalize_config(new_cfg);

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
            persist_config(path, &new_cfg)
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

fn normalize_config(mut config: AutoPinConfig) -> AutoPinConfig {
    config.poll_seconds = config.poll_seconds.clamp(1, 60);
    if !config.enabled {
        config.start_with_windows = false;
    }

    // Keep one deterministic rule per executable. Older builds and manual
    // JSON edits could create duplicates, which made the daemon apply several
    // competing CPU-set writes in one poll; the last entry silently won.
    let mut positions = HashMap::<String, usize>::new();
    let mut rules = Vec::with_capacity(config.rules.len());
    for rule in config.rules {
        let process_name = rule.process_name.trim().to_string();
        if process_name.is_empty() {
            continue;
        }
        let normalized = AutoPinRule {
            process_name: process_name.clone(),
            cores: normalize_cpu_set_ids(&rule.cores),
        };
        let key = process_name.to_ascii_lowercase();
        if let Some(index) = positions.get(&key).copied() {
            rules[index] = normalized;
        } else {
            positions.insert(key, rules.len());
            rules.push(normalized);
        }
    }
    config.rules = rules;
    config
}

fn normalize_cpu_set_ids(ids: &[u32]) -> Vec<u32> {
    let mut normalized = ids.to_vec();
    normalized.sort_unstable();
    normalized.dedup();
    normalized
}

fn persist_config(path: &Path, config: &AutoPinConfig) -> Result<()> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent)
        .with_context(|| format!("create auto-pin config directory {}", parent.display()))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("auto-pin.json");
    let nonce = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let temporary = parent.join(format!(
        ".{file_name}.tmp-{}-{nonce}",
        std::process::id()
    ));
    let json = serde_json::to_vec_pretty(config)?;
    let write_result = (|| -> Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temporary)
            .with_context(|| format!("open temporary auto-pin config {}", temporary.display()))?;
        file.write_all(&json)
            .with_context(|| format!("write temporary auto-pin config {}", temporary.display()))?;
        file.flush()
            .with_context(|| format!("flush temporary auto-pin config {}", temporary.display()))?;
        file.sync_all()
            .with_context(|| format!("sync temporary auto-pin config {}", temporary.display()))?;
        replace_file(&temporary, path)
            .with_context(|| format!("replace auto-pin config {}", path.display()))?;
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }

    // Read the committed bytes back. This catches an unexpected path or
    // serialization mismatch before the new config is published in memory.
    let saved = std::fs::read(path)
        .with_context(|| format!("read back auto-pin config {}", path.display()))?;
    let decoded = serde_json::from_slice::<AutoPinConfig>(&saved)
        .with_context(|| format!("parse auto-pin config read back from {}", path.display()))?;
    if decoded != *config {
        return Err(anyhow!(
            "auto-pin config read-back differs from the requested rules"
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn replace_file(temporary: &Path, destination: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source = temporary
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    unsafe {
        MoveFileExW(
            PCWSTR(source.as_ptr()),
            PCWSTR(target.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .context("MoveFileExW failed while replacing auto-pin config")
}

#[cfg(not(windows))]
fn replace_file(temporary: &Path, destination: &Path) -> Result<()> {
    std::fs::rename(temporary, destination).context("rename auto-pin config")
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
        match run_key.get_value::<String, _>(STARTUP_RUN_VALUE) {
            Ok(_) => {
                return Err(anyhow!(
                    "Windows startup entry is still present after removal"
                ))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error).context("verify removal of the Optimizationmaxxing startup entry")
            }
        }
        return Ok(());
    }

    let exe = std::env::current_exe().context("resolve the Optimizationmaxxing executable path")?;
    let command = format!("\"{}\" --background", exe.display());
    run_key
        .set_value(STARTUP_RUN_VALUE, &command)
        .context("write the Optimizationmaxxing startup entry")?;
    let saved: String = run_key
        .get_value(STARTUP_RUN_VALUE)
        .context("read back the Optimizationmaxxing startup entry")?;
    if saved != command {
        return Err(anyhow!(
            "Windows startup entry read back a different command"
        ));
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_config_makes_rules_deterministic() {
        let normalized = normalize_config(AutoPinConfig {
            enabled: true,
            poll_seconds: 0,
            start_with_windows: true,
            rules: vec![
                AutoPinRule {
                    process_name: " FortniteClient-Win64-Shipping.exe ".into(),
                    cores: vec![56, 2, 56, 8],
                },
                AutoPinRule {
                    process_name: "fortniteclient-win64-shipping.exe".into(),
                    cores: vec![9, 1],
                },
                AutoPinRule {
                    process_name: "  ".into(),
                    cores: vec![4],
                },
            ],
        });

        assert_eq!(normalized.poll_seconds, 1);
        assert!(normalized.start_with_windows);
        assert_eq!(normalized.rules.len(), 1);
        assert_eq!(normalized.rules[0].process_name, "fortniteclient-win64-shipping.exe");
        assert_eq!(normalized.rules[0].cores, vec![1, 9]);
    }

    #[test]
    fn disabled_watcher_cannot_persist_sign_in_startup() {
        let normalized = normalize_config(AutoPinConfig {
            enabled: false,
            poll_seconds: 999,
            start_with_windows: true,
            rules: Vec::new(),
        });

        assert_eq!(normalized.poll_seconds, 60);
        assert!(!normalized.start_with_windows);
    }
}
