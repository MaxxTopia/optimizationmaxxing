//! Elevation runner — single-UAC batched cmd.exe wrapper.
//!
//! Phase 4c-v1 unified all action kinds onto a single `cmd.exe /c "<line> &&
//! <line> && ..."` invocation wrapped in `Start-Process -Verb RunAs`. One UAC
//! prompt, regardless of how many actions are in the batch and whether they
//! are registry or bcdedit.
//!
//! Build phase splits cleanly per action kind (`build_apply_line`,
//! `build_revert_line`); only the batch runner spawns powershell.exe.

use anyhow::{anyhow, Context};
use std::process::Command;

use super::actions::{Hive, RegValueType, TweakAction};
use super::bcdedit;
use super::file_write;
use super::powershell;

const PS_HEADER: &str = "-NoProfile";

fn hive_short(h: Hive) -> &'static str {
    match h {
        Hive::Hkcu => "HKCU",
        Hive::Hklm => "HKLM",
        Hive::Hkcr => "HKCR",
        Hive::Hku => "HKU",
    }
}

fn reg_value_type_str(t: RegValueType) -> &'static str {
    match t {
        RegValueType::Dword => "REG_DWORD",
        RegValueType::Qword => "REG_QWORD",
        RegValueType::String => "REG_SZ",
        RegValueType::ExpandString => "REG_EXPAND_SZ",
        RegValueType::MultiString => "REG_MULTI_SZ",
        RegValueType::Binary => "REG_BINARY",
    }
}

/// Encode value to the `reg.exe /d <data>` text form.
fn encode_value_for_reg(t: RegValueType, value: &serde_json::Value) -> anyhow::Result<String> {
    Ok(match t {
        RegValueType::Dword | RegValueType::Qword => {
            let n = value
                .as_u64()
                .ok_or_else(|| anyhow!("Dword/Qword value must be a number"))?;
            n.to_string()
        }
        RegValueType::String | RegValueType::ExpandString => value
            .as_str()
            .ok_or_else(|| anyhow!("String value must be a string"))?
            .to_string(),
        RegValueType::MultiString => {
            let arr = value
                .as_array()
                .ok_or_else(|| anyhow!("MultiString value must be array of strings"))?;
            let parts: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
            parts.join("\\0")
        }
        RegValueType::Binary => {
            let arr = value
                .as_array()
                .ok_or_else(|| anyhow!("Binary value must be array of u8"))?;
            arr.iter()
                .map(|v| {
                    v.as_u64()
                        .map(|n| format!("{:02X}", n as u8))
                        .ok_or_else(|| anyhow!("binary entries must be u8"))
                })
                .collect::<anyhow::Result<Vec<_>>>()?
                .join("")
        }
    })
}

fn parse_value_type(s: &str) -> anyhow::Result<RegValueType> {
    Ok(match s {
        "dword" => RegValueType::Dword,
        "qword" => RegValueType::Qword,
        "string" => RegValueType::String,
        "expand_string" => RegValueType::ExpandString,
        "multi_string" => RegValueType::MultiString,
        "binary" => RegValueType::Binary,
        other => return Err(anyhow!("unknown value type {other}")),
    })
}

/// Build the cmd.exe-line for an apply on any action kind.
pub fn build_apply_line(action: &TweakAction) -> anyhow::Result<String> {
    match action {
        TweakAction::RegistrySet {
            hive,
            path,
            name,
            value_type,
            value,
        } => {
            let full_key = format!("{}\\{}", hive_short(*hive), path);
            let v = encode_value_for_reg(*value_type, value)?;
            Ok(format!(
                "reg add {} /v {} /t {} /d {} /f",
                cmd_quote(&full_key),
                cmd_quote(name),
                reg_value_type_str(*value_type),
                cmd_quote(&v),
            ))
        }
        TweakAction::RegistryDelete { hive, path, name } => {
            let full_key = format!("{}\\{}", hive_short(*hive), path);
            match name {
                Some(value_name) => Ok(format!(
                    "reg delete {} /v {} /f",
                    cmd_quote(&full_key),
                    cmd_quote(value_name),
                )),
                None => Ok(format!("reg delete {} /f", cmd_quote(&full_key))),
            }
        }
        TweakAction::BcdeditSet { name, value } => Ok(bcdedit::apply_cmd_line(name, value)),
        TweakAction::PowershellScript { .. } => powershell::apply_cmd_line(action),
        TweakAction::FileWrite { .. } => file_write::apply_cmd_line(action),
        // DisplayRefresh is unelevated — applied via in-process Win32
        // call before the elevated batch runs. Should never reach this
        // builder; rejected explicitly to catch routing bugs.
        TweakAction::DisplayRefresh { .. } => Err(anyhow!(
            "DisplayRefresh shouldn't reach build_apply_line — it's unelevated"
        )),
    }
}

/// Build the cmd.exe-line for reverting an action given its captured pre-state.
pub fn build_revert_line(
    action: &TweakAction,
    pre_state: &serde_json::Value,
) -> anyhow::Result<String> {
    match action {
        TweakAction::RegistrySet { hive, path, name, .. } => {
            build_registry_revert_line(*hive, path, name, pre_state)
        }
        TweakAction::RegistryDelete {
            hive,
            path,
            name: Some(value_name),
        } => build_registry_revert_line(*hive, path, value_name, pre_state),
        TweakAction::RegistryDelete { name: None, .. } => Err(anyhow!(
            "subkey-delete revert on privileged hive not supported — capture full hive blob first"
        )),
        TweakAction::BcdeditSet { name, .. } => Ok(bcdedit::revert_cmd_line(name, pre_state)),
        TweakAction::PowershellScript { .. } => powershell::revert_cmd_line(action),
        TweakAction::FileWrite { .. } => file_write::revert_cmd_line(action, pre_state),
        TweakAction::DisplayRefresh { .. } => Err(anyhow!(
            "DisplayRefresh shouldn't reach build_revert_line — it's unelevated"
        )),
    }
}

fn build_registry_revert_line(
    hive: Hive,
    path: &str,
    name: &str,
    pre_state: &serde_json::Value,
) -> anyhow::Result<String> {
    let full_key = format!("{}\\{}", hive_short(hive), path);
    if pre_state.is_null() {
        return Ok(format!(
            "reg delete {} /v {} /f",
            cmd_quote(&full_key),
            cmd_quote(name),
        ));
    }
    let kind_str = pre_state
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("pre_state missing 'type'"))?;
    let prior = pre_state
        .get("value")
        .ok_or_else(|| anyhow!("pre_state missing 'value'"))?;
    let value_type = parse_value_type(kind_str)?;
    let v = encode_value_for_reg(value_type, prior)?;
    Ok(format!(
        "reg add {} /v {} /t {} /d {} /f",
        cmd_quote(&full_key),
        cmd_quote(name),
        reg_value_type_str(value_type),
        cmd_quote(&v),
    ))
}

/// Run a single elevated action via the batched runner. Triggers ONE UAC
/// prompt regardless of action kind.
pub fn run_elevated_action(action: &TweakAction) -> anyhow::Result<()> {
    let line = build_apply_line(action).context("building apply line")?;
    run_elevated_lines(&[line])
}

/// Apply many actions under a single UAC prompt. HKCU items should be
/// filtered out by the caller and applied unelevated.
pub fn run_elevated_batch(actions: &[&TweakAction]) -> anyhow::Result<()> {
    if actions.is_empty() {
        return Ok(());
    }
    let mut lines: Vec<String> = Vec::with_capacity(actions.len());
    for a in actions {
        lines.push(build_apply_line(a).context("building batched apply line")?);
    }
    run_elevated_lines(&lines)
}

/// Revert one elevated action.
pub fn run_elevated_revert_action(
    action: &TweakAction,
    pre_state: &serde_json::Value,
) -> anyhow::Result<()> {
    let line = build_revert_line(action, pre_state).context("building revert line")?;
    run_elevated_lines(&[line])
}

/// Revert MANY elevated actions under a single UAC prompt. Pairs with
/// the bulk-revert flow on the Settings page.
pub fn run_elevated_revert_batch(
    items: &[(&TweakAction, &serde_json::Value)],
) -> anyhow::Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    let mut lines: Vec<String> = Vec::with_capacity(items.len());
    for (action, pre) in items {
        lines.push(build_revert_line(action, pre).context("building batched revert line")?);
    }
    run_elevated_lines(&lines)
}

/// Common runner: spawn ONE elevated cmd.exe that runs each line
/// INDEPENDENTLY via a temp .cmd script.
///
/// History — v0.1.69 and earlier joined lines with `&&`, which is
/// SHORT-CIRCUIT in cmd.exe. The first command that exited non-zero
/// silently skipped every command after it. With 50+ HKLM tweaks queued
/// from "Apply All", one early failure (Group Policy lock, unwriteable
/// subkey, etc.) would silently skip ~30 tweaks; the audit correctly
/// reported them as "would change" because they were never applied —
/// but the user got no signal that anything went wrong.
///
/// v0.1.70: write a .cmd script with one line per command. cmd.exe's
/// implicit per-line semantics run each independently, so a single
/// failure doesn't block the rest. Each failing line appends to a log
/// (via `|| echo FAIL: ... >> log`); the script's exit code is the
/// number of failures, surfaced back through this fn so the caller can
/// tell the user "50 of 52 applied; 2 failed — see log".
///
/// Side benefit: eliminates cmd.exe's 8191-char arg limit, which was
/// being approached on the "Apply All" path.
fn run_elevated_lines(lines: &[String]) -> anyhow::Result<()> {
    if lines.is_empty() {
        return Ok(());
    }
    let temp_dir = std::env::temp_dir();
    let stamp = chrono::Utc::now().timestamp_millis();
    let pid = std::process::id();
    let script_path = temp_dir.join(format!("optmaxxing-elev-{pid}-{stamp}.cmd"));
    let log_path = temp_dir.join(format!("optmaxxing-elev-{pid}-{stamp}.log"));

    let log_path_str = log_path.to_string_lossy().to_string();
    let mut script = String::new();
    script.push_str("@echo off\r\n");
    script.push_str("setlocal enabledelayedexpansion\r\n");
    script.push_str("set FAILED=0\r\n");
    for line in lines {
        // Each line runs; on non-zero exit, log + bump counter. The
        // outer parens prevent a `(reg add ...) || ...` line from being
        // mis-parsed when the inner command itself uses parens.
        script.push_str(&format!(
            "({line}) || (echo FAIL: {line}>>\"{log_path_str}\" & set /a FAILED+=1)\r\n",
        ));
    }
    script.push_str("exit /b !FAILED!\r\n");

    std::fs::write(&script_path, script.as_bytes())
        .context("writing elevated batch script to temp")?;

    // Cleanup helper — always runs, even if PowerShell fails.
    let cleanup_script = || { let _ = std::fs::remove_file(&script_path); };

    let outer = format!(
        "Start-Process -FilePath cmd.exe -ArgumentList @('/c','\"{}\"') -Verb RunAs -Wait -WindowStyle Hidden -PassThru | ForEach-Object {{ exit $_.ExitCode }}",
        script_path.to_string_lossy().replace('\'', "''"),
    );
    let status = Command::new("powershell.exe")
        .arg(PS_HEADER)
        .arg("-Command")
        .arg(&outer)
        .status()
        .context("spawning elevated powershell.exe")?;

    cleanup_script();

    let exit = status.code().unwrap_or(-1);
    if exit < 0 {
        // Negative = process didn't even run (UAC denied / killed).
        return Err(anyhow!(
            "elevated apply did not run (status {}). Likely UAC denied.",
            exit,
        ));
    }
    if exit > 0 {
        // exit == failure-count. Read the log if it exists for diagnostic.
        let detail = std::fs::read_to_string(&log_path).unwrap_or_default();
        let _ = std::fs::remove_file(&log_path);
        let head: String = detail.lines().take(5).collect::<Vec<_>>().join("\n");
        return Err(anyhow!(
            "{} of {} elevated commands failed. First few:\n{}",
            exit,
            lines.len(),
            head,
        ));
    }
    let _ = std::fs::remove_file(&log_path);
    Ok(())
}

/// PowerShell single-quote — doubles embedded `'`.
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// CMD.EXE-safe double-quote. Escapes embedded `"` as `""`.
fn cmd_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}
