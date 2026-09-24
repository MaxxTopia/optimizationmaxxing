//! Background standby memory list cleaner.
//!
//! Wraps Windows Task Scheduler (schtasks.exe) to register a recurring task
//! that runs our PowerShell purger every N minutes. The PowerShell side calls
//! NtSetSystemInformation(SystemMemoryListInformation, MemoryPurgeStandbyList=4)
//! via inline P/Invoke + EnablePrivilege(SeProfileSingleProcessPrivilege).
//!
//! Uses the same documented purge operation exposed by RAMMap. It is not a
//! proven gaming optimization; the UI defaults to off and the script skips
//! known game processes as a best-effort safeguard (not an anti-cheat guarantee).
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

/// Run the cleaner once without installing a recurring task. This is the
/// low-commitment path offered for a game-closed comparison. It still uses
/// the script's best-effort active-game guard and asks for UAC elevation.
pub fn run_once(script_path: &str) -> Result<()> {
    let script = std::path::Path::new(script_path);
    if !script.is_file() {
        return Err(anyhow!("standby cleaner script not found: {}", script.display()));
    }

    // Start-Process -ArgumentList receives one command-line string. Quote the
    // script path for the child PowerShell, then single-quote that whole string
    // as a PowerShell literal in the unelevated parent process.
    let child_args = format!(
        "-NoProfile -ExecutionPolicy Bypass -File \"{}\"",
        script.display()
    );
    let outer = format!(
        "$p = Start-Process -FilePath powershell.exe -ArgumentList {} -Verb RunAs -Wait -WindowStyle Hidden -PassThru; exit $p.ExitCode",
        ps_quote(&child_args),
    );
    let status = hidden_powershell()
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &outer])
        .status()
        .context("spawning elevated standby cleaner")?;
    if !status.success() {
        return Err(anyhow!(
            "elevated standby cleaner exited with status {} (UAC may have been declined)",
            status.code().unwrap_or(-1),
        ));
    }
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

/// Legacy tasks may run PowerShell directly, briefly flashing a console, or
/// point at a script without the active-game guard. Current tasks use the
/// windowless wscript shim and a guarded script.
///
/// This function queries the existing task's verbose details and returns:
///   - None if no task exists (nothing to migrate)
///   - Some(MigrationInfo { outdated: false, .. }) if task uses the current
///     launcher and a script containing the active-game guard
///   - Some(MigrationInfo { outdated: true, current_interval_minutes: N })
///     if either safety condition is missing or cannot be verified
///
/// Frontend uses this to surface a one-click "update task" banner so the
/// user doesn't have to do the manual Uninstall→Install dance. We don't
/// silently auto-migrate because re-registering needs UAC.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationInfo {
    pub outdated: bool,
    pub current_interval_minutes: u32,
    /// What the existing task's /TR field looks like (for diagnostic).
    pub task_to_run: String,
}

pub fn check_migration_needed() -> Option<MigrationInfo> {
    if !schtasks_query_exists() {
        return None;
    }
    let mut cmd = hidden_cmd_no_window();
    cmd.args(["/c", "schtasks", "/Query", "/TN", TASK_NAME, "/V", "/FO", "LIST"]);
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    // Output is a multi-line "Field: Value" listing. Parse the two we need:
    // "Task To Run:" + "Repeat: Every:" (or "/SC MINUTE /MO N" — varies by
    // locale; the verbose format is consistent on en-US but we double-check
    // by also scanning the string for the wscript marker).
    let text = String::from_utf8_lossy(&out.stdout);
    let mut task_to_run = String::new();
    let mut interval_minutes: u32 = 5; // sensible default

    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Task To Run:") {
            task_to_run = rest.trim().to_string();
        }
        // schtasks /V /FO LIST emits "Repeat: Every: 0 Hour(s), 5 Minute(s)"
        // We just need the number before "Minute(s)".
        if trimmed.contains("Minute(s)") {
            // Find the LAST integer before "Minute(s)".
            if let Some(pos) = trimmed.find("Minute(s)") {
                let before = &trimmed[..pos];
                let last_num: String = before.chars()
                    .rev()
                    .skip_while(|c| !c.is_ascii_digit())
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>().chars().rev().collect();
                if let Ok(n) = last_num.parse::<u32>() {
                    if n >= 1 && n <= 60 {
                        interval_minutes = n;
                    }
                }
            }
        }
    }

    // The new format contains the wscript launcher and the target script has
    // an explicit guard marker. Treat an unknown/missing script path as stale
    // so the user can re-register against the current bundled resource.
    let lower = task_to_run.to_lowercase();
    let old_launcher = !lower.contains("wscript.exe");
    let missing_game_guard = script_path_from_task_to_run(&task_to_run)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|script| !script.contains("ACTIVE-GAME-GUARD: v1"))
        .unwrap_or(true);
    let outdated = old_launcher || missing_game_guard;

    Some(MigrationInfo {
        outdated,
        current_interval_minutes: interval_minutes,
        task_to_run,
    })
}

fn script_path_from_task_to_run(command: &str) -> Option<&str> {
    let lower = command.to_ascii_lowercase();
    let marker = "clear_standby.ps1";
    let marker_start = lower.rfind(marker)?;
    let prefix = &command[..marker_start];
    let path_start = prefix
        .rfind('"')
        .map(|quote| quote + 1)
        .or_else(|| prefix.rfind(' ').map(|space| space + 1))?;
    Some(&command[path_start..marker_start + marker.len()])
}

#[cfg(test)]
mod tests {
    use super::script_path_from_task_to_run;

    #[test]
    fn finds_guarded_script_path_in_quoted_task_action() {
        let command = r#"wscript.exe "C:\Program Files\Optimizationmaxxing\hide_launcher.vbs" "C:\Program Files\Optimizationmaxxing\clear_standby.ps1""#;
        assert_eq!(
            script_path_from_task_to_run(command),
            Some(r#"C:\Program Files\Optimizationmaxxing\clear_standby.ps1"#)
        );
    }

    #[test]
    fn finds_script_path_in_unquoted_task_action() {
        let command = r"powershell.exe -File C:\Optimizationmaxxing\clear_standby.ps1";
        assert_eq!(
            script_path_from_task_to_run(command),
            Some(r"C:\Optimizationmaxxing\clear_standby.ps1")
        );
    }

    #[test]
    fn missing_script_path_is_not_treated_as_current() {
        assert_eq!(script_path_from_task_to_run("wscript.exe hide_launcher.vbs"), None);
    }
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

/// PowerShell with no console window. Start-Process -Verb RunAs still presents
/// the normal Windows UAC consent prompt to the user.
fn hidden_powershell() -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut c = Command::new("powershell.exe");
    c.creation_flags(CREATE_NO_WINDOW);
    c
}
