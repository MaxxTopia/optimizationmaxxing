//! BCD store actions via `bcdedit.exe`.
//!
//! Phase 4d-v1: only `BcdeditSet { name, value }` against `{current}`.
//! Always requires admin. Pre-state capture is best-effort via
//! `bcdedit /enum {current} /v`; falls back to "unknown" if elevation
//! is required for read on this Windows build.
//!
//! Pre-state JSON shape:
//!   `{ "found": true,  "value": "yes"     }` — value existed, was "yes"
//!   `{ "found": false                    }` — value did not exist (default)
//!   `{ "found": "unknown"                }` — couldn't read (revert = deletevalue)

use anyhow::anyhow;
use std::process::Command;

use super::actions::TweakAction;

/// Run `bcdedit /enum {current} /v` and return stdout, or None on failure.
fn enum_bcd() -> Option<String> {
    let out = Command::new("bcdedit")
        .args(["/enum", "{current}", "/v"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Parse the bcdedit /enum output for a named value. Lines look like:
///   `useplatformclock        Yes`
///   `hypervisorlaunchtype    Off`
///
/// Returns Some(value_str) if the line is found, None if absent.
fn parse_value(enum_output: &str, name: &str) -> Option<String> {
    let needle = name.to_ascii_lowercase();
    for line in enum_output.lines() {
        let trimmed = line.trim_start();
        // bcdedit pads name+value into a single line; split on whitespace.
        let mut parts = trimmed.splitn(2, char::is_whitespace);
        let key = parts.next().unwrap_or("").to_ascii_lowercase();
        if key == needle {
            let val = parts.next().unwrap_or("").trim();
            if val.is_empty() {
                return None;
            }
            return Some(val.to_string());
        }
    }
    None
}

/// Capture pre-state for a BcdeditSet action.
pub fn capture_pre_state(action: &TweakAction) -> anyhow::Result<serde_json::Value> {
    let TweakAction::BcdeditSet { name, .. } = action else {
        return Err(anyhow!("capture_pre_state called on non-bcdedit action"));
    };
    let Some(out) = enum_bcd() else {
        return Ok(serde_json::json!({ "found": "unknown" }));
    };
    match parse_value(&out, name) {
        Some(v) => Ok(serde_json::json!({ "found": true, "value": v })),
        None => Ok(serde_json::json!({ "found": false })),
    }
}

/// Build the cmd.exe-line fragment for an apply (used inside the batched
/// elevation runner).
pub fn apply_cmd_line(name: &str, value: &str) -> String {
    // bcdedit treats {current} literally with no escape; both name + value
    // are constrained to ASCII identifiers / known keywords by the catalog.
    format!(
        "bcdedit /set {{current}} {} {}",
        cmd_word(name),
        cmd_word(value),
    )
}

/// Build the cmd.exe-line fragment for a revert. If pre-state was a real
/// value, restores it; if pre-state said "didn't exist" or "unknown", uses
/// /deletevalue to drop the override.
pub fn revert_cmd_line(name: &str, pre_state: &serde_json::Value) -> String {
    match pre_state.get("found") {
        Some(serde_json::Value::Bool(true)) => {
            let v = pre_state
                .get("value")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!(
                "bcdedit /set {{current}} {} {}",
                cmd_word(name),
                cmd_word(v),
            )
        }
        // false OR "unknown" OR missing → drop the override.
        _ => format!("bcdedit /deletevalue {{current}} {}", cmd_word(name)),
    }
}

/// cmd.exe-safe word. bcdedit names + values are alphanumeric + dash, so
/// quoting is mainly defensive against future catalog entries.
fn cmd_word(s: &str) -> String {
    if s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        s.to_string()
    } else {
        format!("\"{}\"", s.replace('"', "\"\""))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_value_line() {
        let out = "Windows Boot Loader\n-------------------\nidentifier              {current}\nuseplatformclock        Yes\nhypervisorlaunchtype    Off\n";
        assert_eq!(parse_value(out, "useplatformclock"), Some("Yes".into()));
        assert_eq!(parse_value(out, "hypervisorlaunchtype"), Some("Off".into()));
        assert_eq!(parse_value(out, "missingkey"), None);
    }

    #[test]
    fn parses_case_insensitive() {
        let out = "useplatformclock        No\n";
        assert_eq!(parse_value(out, "UsePlatformClock"), Some("No".into()));
    }

    #[test]
    fn apply_line_format() {
        assert_eq!(
            apply_cmd_line("useplatformclock", "no"),
            "bcdedit /set {current} useplatformclock no"
        );
    }

    #[test]
    fn revert_line_uses_deletevalue_when_unknown() {
        let pre = serde_json::json!({ "found": "unknown" });
        assert_eq!(
            revert_cmd_line("useplatformclock", &pre),
            "bcdedit /deletevalue {current} useplatformclock"
        );
    }

    #[test]
    fn revert_line_restores_prior_value() {
        let pre = serde_json::json!({ "found": true, "value": "Yes" });
        assert_eq!(
            revert_cmd_line("useplatformclock", &pre),
            "bcdedit /set {current} useplatformclock Yes"
        );
    }
}
