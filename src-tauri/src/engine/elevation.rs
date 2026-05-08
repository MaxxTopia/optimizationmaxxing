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

/// Common runner: spawn ONE elevated cmd.exe with `&&`-joined script.
fn run_elevated_lines(lines: &[String]) -> anyhow::Result<()> {
    if lines.is_empty() {
        return Ok(());
    }
    let script = lines.join(" && ");
    let outer = format!(
        "Start-Process -FilePath cmd.exe -ArgumentList @('/c',{}) -Verb RunAs -Wait -WindowStyle Hidden",
        ps_quote(&script),
    );
    let status = Command::new("powershell.exe")
        .arg(PS_HEADER)
        .arg("-Command")
        .arg(&outer)
        .status()
        .context("spawning elevated powershell.exe")?;
    if !status.success() {
        return Err(anyhow!(
            "elevated apply exited with status {} (UAC denied?)",
            status.code().unwrap_or(-1)
        ));
    }
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
