//! Background standby memory list cleaner.
//!
//! Wraps Windows Task Scheduler (schtasks.exe) to register a recurring task
//! that runs our PowerShell purger every N minutes. The PowerShell side calls
//! NtSetSystemInformation(SystemMemoryListInformation, MemoryPurgeStandbyList=4)
//! via inline P/Invoke + EnablePrivilege(SeProfileSingleProcessPrivilege).
//!
//! Same syscall RAMMap (Sysinternals) and Wagnard's ISLC use. Anti-cheat-safe —
//! no driver, no kernel hooks, no game-process injection.
//!
//! Install / uninstall both require admin (creating an elevated scheduled task
//! always does); we route through the existing single-UAC elevation runner so
//! the user gets one prompt to install + one to uninstall. The task itself runs
//! silently on the schedule with HighestAvailable run-level once registered.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::process::Command;

const TASK_NAME: &str = "optmaxxing_standby_cleaner";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandbyStatus {
    /// True if the scheduled task exists.
    pub installed: bool,
    /// Last time the task ran successfully (parsed from log file).
    pub last_run: Option<String>,
    /// Last log line (status from the most recent purge).
    pub last_status: Option<String>,
    /// Path to the log file we read from. Useful for the UI to surface.
    pub log_path: String,
}

/// Install the scheduled task. Triggers ONE UAC prompt. The task runs every
/// `interval_minutes` minute(s) at HighestAvailable run-level under the current
/// user account. Idempotent — re-installing replaces the prior task.
///
/// v0.1.74 — wraps the PowerShell call in a `wscript.exe` + `.vbs` launcher
/// (`hide_launcher.vbs` next to `clear_standby.ps1`) so the console window
/// doesn't flash every interval. PowerShell's `-WindowStyle Hidden` only
/// hides the window AFTER the console first paints; Task Scheduler triggers
/// the first paint, then PowerShell sees the flag — net effect was a
/// 100-300 ms flash every 5 min. wscript is windowless from the start,
/// SW_HIDE on the spawned PowerShell suppresses its window entirely.
pub fn install_task(script_path: &str, interval_minutes: u32) -> Result<()> {
    if interval_minutes < 1 || interval_minutes > 60 {
        return Err(anyhow!(
            "interval_minutes must be 1..60 (Task Scheduler MINUTE granularity)"
        ));
    }

    // Locate the launcher .vbs alongside the .ps1. The Tauri resource
    // bundling copies both into the same dir (resources/scripts/).
    let launcher_path = std::path::Path::new(script_path)
        .parent()
        .map(|p| p.join("hide_launcher.vbs"))
        .ok_or_else(|| anyhow!("script_path has no parent dir"))?;
    let launcher_str = launcher_path.to_string_lossy();

    // /TR runs `wscript.exe "<launcher.vbs>" "<clear_standby.ps1>"`.
    // wscript opens windowless, the .vbs spawns powershell with SW_HIDE.
    // Backslash-escaped quotes per /TR's parser; outer "..." wraps the
    // whole /TR value at the schtasks level.
    let tr = format!(
        "wscript.exe \\\"{}\\\" \\\"{}\\\"",
        launcher_str, script_path,
    );
    // schtasks /Create /TN <name> /TR <run> /SC MINUTE /MO <n> /RL HIGHEST /F
    // - /RL HIGHEST = HighestAvailable (admin token required at register time)
    // - /F = force overwrite if task already exists (idempotent install)
    // - /SC MINUTE /MO N = repeat every N minutes
    let line = format!(
        "schtasks /Create /TN {} /TR \"{}\" /SC MINUTE /MO {} /RL HIGHEST /F",
        TASK_NAME, tr, interval_minutes,
    );
    run_elevated_one_liner(&line).context("registering scheduled task")?;
    Ok(())
}

/// Remove the scheduled task. Triggers UAC. No-op if the task doesn't exist
/// (schtasks /Delete returns non-zero in that case but we ignore it).
pub fn uninstall_task() -> Result<()> {
    let line = format!("schtasks /Delete /TN {} /F", TASK_NAME);
    // We don't propagate failure — if the task doesn't exist, schtasks returns
    // exit-1 and that's fine for the user (they're trying to uninstall something
    // already not there). Surface only via best-effort logging.
    let _ = run_elevated_one_liner(&line);
    Ok(())
}

/// Trigger the task immediately (one-shot). Same UAC requirement as install.
/// Useful for the "Run now" button in the UI.
pub fn run_now() -> Result<()> {
    let line = format!("schtasks /Run /TN {}", TASK_NAME);
    run_elevated_one_liner(&line).context("triggering scheduled task")?;
    Ok(())
}

/// Status check — does the task exist + when did it last run + what's the
/// last log line. Doesn't need admin.
pub fn status() -> Result<StandbyStatus> {
    let log_path = log_file_path();
    let installed = schtasks_query_exists();
    let (last_run, last_status) = read_log_tail(&log_path);
    Ok(StandbyStatus {
        installed,
        last_run,
        last_status,
        log_path: log_path.to_string_lossy().to_string(),
    })
}

fn log_file_path() -> std::path::PathBuf {
    let local = std::env::var("LOCALAPPDATA")
        .unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());
    std::path::PathBuf::from(local)
        .join("optmaxxing")
        .join("standby-cleaner.log")
}

/// Run schtasks /Query /TN <name> and check exit code. 0 = exists, non-zero = not.
fn schtasks_query_exists() -> bool {
    let mut cmd = hidden_cmd_no_window();
    cmd.args(["/c", "schtasks", "/Query", "/TN", TASK_NAME]);
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

/// Read the last meaningful line of the log + extract the timestamp from it.
fn read_log_tail(path: &std::path::Path) -> (Option<String>, Option<String>) {
    let Ok(content) = std::fs::read_to_string(path) else {
        return (None, None);
    };
    let last_line = content.lines().rev().find(|l| !l.trim().is_empty());
    let Some(line) = last_line else {
        return (None, None);
    };
    // Lines are formatted "yyyy-MM-dd HH:mm:ss <message>" by clear_standby.ps1.
    // Split off the first 19 chars as the timestamp.
    if line.len() > 20 {
        let ts = &line[..19];
        let msg = line[20..].trim().to_string();
        (Some(ts.to_string()), Some(msg))
    } else {
        (None, Some(line.to_string()))
    }
}

/// Single-UAC powershell wrapper, modeled on engine::elevation::run_elevated_lines
/// but for a one-liner. Uses Start-Process -Verb RunAs -Wait so the user sees ONE
/// UAC and we know whether the inner command succeeded.
fn run_elevated_one_liner(line: &str) -> Result<()> {
    let outer = format!(
        "Start-Process -FilePath cmd.exe -ArgumentList @('/c',{}) -Verb RunAs -Wait -WindowStyle Hidden",
        ps_quote(line),
    );
    let status = Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &outer])
        .status()
        .context("spawning elevated powershell.exe")?;
    if !status.success() {
        return Err(anyhow!(
            "elevated schtasks invocation exited with status {} (UAC denied?)",
            status.code().unwrap_or(-1),
        ));
    }
    Ok(())
}

/// PowerShell single-quote — doubles embedded `'`. Same helper as in
/// engine::elevation but standby.rs is otherwise self-contained.
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// cmd.exe with no console window — sets CREATE_NO_WINDOW so background spawns
/// don't flash a black box.
fn hidden_cmd_no_window() -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut c = Command::new("cmd.exe");
    c.creation_flags(CREATE_NO_WINDOW);
    c
}
