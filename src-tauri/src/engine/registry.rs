//! Registry action implementations (RegistrySet / RegistryDelete).
//!
//! Phase 4a: HKCU only — these never require elevation. HKLM/HKCR
//! intentionally error so we never silently no-op when elevation is needed.
//! Phase 4c will route HKLM through the elevated agent sidecar.
//!
//! Pre-state capture: query the value (or "no key / no value") BEFORE the
//! mutation, return as JSON for the snapshot store. Revert reads this back.

use anyhow::{anyhow, Context};
use winreg::enums::*;
use winreg::types::ToRegValue;
use winreg::{RegKey, RegValue};

use super::actions::{Hive, RegValueType, TweakAction};

fn predefined_key(h: Hive) -> RegKey {
    RegKey::predef(match h {
        Hive::Hkcu => HKEY_CURRENT_USER,
        Hive::Hklm => HKEY_LOCAL_MACHINE,
        Hive::Hkcr => HKEY_CLASSES_ROOT,
        Hive::Hku => HKEY_USERS,
    })
}

/// Apply: write the new value, returning the captured pre-state JSON.
/// HKCU runs in-process. HKLM/HKCR routes through the elevation module
/// (PowerShell Start-Process -Verb RunAs → one UAC prompt).
///
/// Errors on non-Registry* actions; the engine::apply() dispatcher routes
/// other kinds (BcdeditSet, etc.) before reaching here.
pub fn apply(action: &TweakAction) -> anyhow::Result<serde_json::Value> {
    if action.requires_admin() {
        let pre_state = super::elevation_compat_capture(action)?;
        super::elevation::run_elevated_action(action)?;
        return Ok(pre_state);
    }
    match action {
        TweakAction::RegistrySet {
            hive,
            path,
            name,
            value_type,
            value,
        } => apply_registry_set(*hive, path, name, *value_type, value),
        TweakAction::RegistryDelete { hive, path, name } => {
            apply_registry_delete(*hive, path, name.as_deref())
        }
        _ => Err(anyhow!(
            "registry::apply called on non-registry action — route via engine::apply",
        )),
    }
}

/// Revert: replay the captured pre-state. Pre-state shape mirrors what
/// `apply` returned. HKLM reverts also route through elevation.
pub fn revert(action: &TweakAction, pre_state: &serde_json::Value) -> anyhow::Result<()> {
    if action.requires_admin() {
        return super::elevation::run_elevated_revert_action(action, pre_state);
    }
    match action {
        TweakAction::RegistrySet { hive, path, name, .. } => {
            revert_registry_set(*hive, path, name, pre_state)
        }
        TweakAction::RegistryDelete { hive, path, name } => {
            revert_registry_delete(*hive, path, name.as_deref(), pre_state)
        }
        _ => Err(anyhow!(
            "registry::revert called on non-registry action — route via engine::revert",
        )),
    }
}

/// Preview-only — the live pre-state without mutating anything.
pub fn capture_pre_state(action: &TweakAction) -> anyhow::Result<serde_json::Value> {
    match action {
        TweakAction::RegistrySet { hive, path, name, .. } => {
            capture_value_pre_state(*hive, path, name)
        }
        TweakAction::RegistryDelete { hive, path, name } => match name {
            Some(value_name) => capture_value_pre_state(*hive, path, value_name),
            None => capture_subkey_pre_state(*hive, path),
        },
        _ => Err(anyhow!(
            "registry::capture_pre_state called on non-registry action",
        )),
    }
}

// --- RegistrySet ---

fn apply_registry_set(
    hive: Hive,
    path: &str,
    name: &str,
    value_type: RegValueType,
    value: &serde_json::Value,
) -> anyhow::Result<serde_json::Value> {
    let pre_state = capture_value_pre_state(hive, path, name)?;
    let root = predefined_key(hive);
    let (key, _disp) = root
        .create_subkey(path)
        .with_context(|| format!("create_subkey {path}"))?;
    let reg_value = encode_reg_value(value_type, value)
        .with_context(|| format!("encoding value for {name}"))?;
    key.set_raw_value(name, &reg_value)
        .with_context(|| format!("set_raw_value {name}"))?;
    Ok(pre_state)
}

fn revert_registry_set(
    hive: Hive,
    path: &str,
    name: &str,
    pre_state: &serde_json::Value,
) -> anyhow::Result<()> {
    let root = predefined_key(hive);
    let key = match root.open_subkey_with_flags(path, KEY_ALL_ACCESS) {
        Ok(k) => k,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Path is gone — nothing to revert.
            return Ok(());
        }
        Err(e) => return Err(e).context("open_subkey for revert"),
    };

    if pre_state.is_null() {
        // Value didn't exist before; delete it.
        match key.delete_value(name) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e).context("delete_value during revert"),
        }
    } else {
        // Reapply prior value.
        let kind_str = pre_state
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("pre_state missing 'type'"))?;
        let prior_value = pre_state
            .get("value")
            .ok_or_else(|| anyhow!("pre_state missing 'value'"))?;
        let value_type = parse_value_type(kind_str)?;
        let reg_value = encode_reg_value(value_type, prior_value)?;
        key.set_raw_value(name, &reg_value)
            .context("set_raw_value during revert")
    }
}

// --- RegistryDelete ---

fn apply_registry_delete(
    hive: Hive,
    path: &str,
    name: Option<&str>,
) -> anyhow::Result<serde_json::Value> {
    let root = predefined_key(hive);
    match name {
        Some(value_name) => {
            let pre = capture_value_pre_state(hive, path, value_name)?;
            let key = root
                .open_subkey_with_flags(path, KEY_ALL_ACCESS)
                .context("open_subkey for delete-value")?;
            // Swallow only NotFound (already-missing is a no-op); propagate
            // permission/access errors so the caller knows nothing happened.
            match key.delete_value(value_name) {
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e).context("delete_value"),
            }
            Ok(pre)
        }
        None => {
            let pre = capture_subkey_pre_state(hive, path)?;
            // delete_subkey_all is recursive.
            match root.delete_subkey_all(path) {
                Ok(_) => Ok(pre),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(pre),
                Err(e) => Err(e).context("delete_subkey_all"),
            }
        }
    }
}

fn revert_registry_delete(
    hive: Hive,
    path: &str,
    name: Option<&str>,
    pre_state: &serde_json::Value,
) -> anyhow::Result<()> {
    if pre_state.is_null() {
        // Nothing existed before delete — nothing to restore.
        return Ok(());
    }
    let root = predefined_key(hive);
    match name {
        Some(value_name) => {
            // Recreate the path + write the prior value back.
            let (key, _) = root.create_subkey(path).context("create_subkey for revert")?;
            let kind_str = pre_state
                .get("type")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("pre_state missing 'type'"))?;
            let prior_value = pre_state
                .get("value")
                .ok_or_else(|| anyhow!("pre_state missing 'value'"))?;
            let value_type = parse_value_type(kind_str)?;
            let reg_value = encode_reg_value(value_type, prior_value)?;
            key.set_raw_value(value_name, &reg_value)
                .context("set_raw_value during revert")?;
            Ok(())
        }
        None => {
            // Recreating a deleted subkey from a JSON snapshot is non-trivial
            // (recursive value dump). Phase 4a only emits subkey-delete pre-state
            // as a "subkey existed" sentinel — actual contents aren't yet captured.
            // Refuse the revert until snapshots gain RegSaveKey support.
            Err(anyhow!(
                "subkey-delete revert not supported in Phase 4a — capture full hive blob first"
            ))
        }
    }
}

// --- Pre-state helpers ---

fn capture_value_pre_state(
    hive: Hive,
    path: &str,
    name: &str,
) -> anyhow::Result<serde_json::Value> {
    let root = predefined_key(hive);
    let key = match root.open_subkey(path) {
        Ok(k) => k,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(serde_json::Value::Null),
        Err(e) => return Err(e).context("open_subkey for pre-state"),
    };
    let val: RegValue = match key.get_raw_value(name) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(serde_json::Value::Null),
        Err(e) => return Err(e).context("get_raw_value for pre-state"),
    };
    let value = decode_reg_value(&val)?;
    Ok(serde_json::json!({
        "type": reg_kind_to_str(&val.vtype),
        "value": value,
    }))
}

fn capture_subkey_pre_state(hive: Hive, path: &str) -> anyhow::Result<serde_json::Value> {
    let root = predefined_key(hive);
    match root.open_subkey(path) {
        Ok(_) => Ok(serde_json::json!({ "subkey_existed": true, "path": path })),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(serde_json::Value::Null),
        Err(e) => Err(e).context("open_subkey for subkey pre-state"),
    }
}

// --- Encoding / decoding ---

fn encode_reg_value(
    value_type: RegValueType,
    value: &serde_json::Value,
) -> anyhow::Result<RegValue> {
    Ok(match value_type {
        RegValueType::Dword => {
            let n = value
                .as_u64()
                .ok_or_else(|| anyhow!("Dword value must be a number"))?;
            (n as u32).to_reg_value()
        }
        RegValueType::Qword => {
            let n = value
                .as_u64()
                .ok_or_else(|| anyhow!("Qword value must be a number"))?;
            n.to_reg_value()
        }
        RegValueType::String => {
            let s = value
                .as_str()
                .ok_or_else(|| anyhow!("String value must be a string"))?;
            s.to_reg_value()
        }
        RegValueType::ExpandString => {
            let s = value
                .as_str()
                .ok_or_else(|| anyhow!("ExpandString value must be a string"))?;
            // winreg's ToRegValue picks REG_SZ; we need REG_EXPAND_SZ. Build manually.
            let utf16: Vec<u16> = s.encode_utf16().chain(std::iter::once(0)).collect();
            let bytes: Vec<u8> = utf16
                .iter()
                .flat_map(|c| c.to_le_bytes().into_iter())
                .collect();
            RegValue { bytes, vtype: REG_EXPAND_SZ }
        }
        RegValueType::MultiString => {
            let arr = value
                .as_array()
                .ok_or_else(|| anyhow!("MultiString value must be an array of strings"))?;
            let mut bytes: Vec<u8> = Vec::new();
            for s in arr {
                let s = s.as_str().ok_or_else(|| anyhow!("MultiString entries must be strings"))?;
                for u in s.encode_utf16() {
                    bytes.extend_from_slice(&u.to_le_bytes());
                }
                bytes.extend_from_slice(&0u16.to_le_bytes());
            }
            bytes.extend_from_slice(&0u16.to_le_bytes()); // double-null terminator
            RegValue { bytes, vtype: REG_MULTI_SZ }
        }
        RegValueType::Binary => {
            let arr = value
                .as_array()
                .ok_or_else(|| anyhow!("Binary value must be an array of u8"))?;
            let bytes: anyhow::Result<Vec<u8>> = arr
                .iter()
                .map(|v| {
                    v.as_u64()
                        .filter(|n| *n <= 255)
                        .map(|n| n as u8)
                        .ok_or_else(|| anyhow!("Binary entries must be 0..=255"))
                })
                .collect();
            RegValue { bytes: bytes?, vtype: REG_BINARY }
        }
    })
}

fn decode_reg_value(val: &RegValue) -> anyhow::Result<serde_json::Value> {
    Ok(match &val.vtype {
        REG_DWORD => {
            if val.bytes.len() < 4 {
                return Err(anyhow!("REG_DWORD too short"));
            }
            let n = u32::from_le_bytes([val.bytes[0], val.bytes[1], val.bytes[2], val.bytes[3]]);
            serde_json::json!(n)
        }
        REG_QWORD => {
            if val.bytes.len() < 8 {
                return Err(anyhow!("REG_QWORD too short"));
            }
            let mut buf = [0u8; 8];
            buf.copy_from_slice(&val.bytes[..8]);
            serde_json::json!(u64::from_le_bytes(buf))
        }
        REG_SZ | REG_EXPAND_SZ => {
            let s = utf16_from_le_bytes(&val.bytes);
            serde_json::json!(s.trim_end_matches('\0'))
        }
        REG_MULTI_SZ => {
            let s = utf16_from_le_bytes(&val.bytes);
            let parts: Vec<&str> = s
                .split('\0')
                .filter(|p| !p.is_empty())
                .collect();
            serde_json::json!(parts)
        }
        REG_BINARY | _ => serde_json::Value::Array(
            val.bytes.iter().map(|b| serde_json::Value::from(*b)).collect(),
        ),
    })
}

fn utf16_from_le_bytes(bytes: &[u8]) -> String {
    let mut buf: Vec<u16> = Vec::with_capacity(bytes.len() / 2);
    let mut i = 0;
    while i + 1 < bytes.len() {
        buf.push(u16::from_le_bytes([bytes[i], bytes[i + 1]]));
        i += 2;
    }
    String::from_utf16_lossy(&buf)
}

fn reg_kind_to_str(vtype: &winreg::enums::RegType) -> &'static str {
    match vtype {
        winreg::enums::RegType::REG_DWORD => "dword",
        winreg::enums::RegType::REG_QWORD => "qword",
        winreg::enums::RegType::REG_SZ => "string",
        winreg::enums::RegType::REG_EXPAND_SZ => "expand_string",
        winreg::enums::RegType::REG_MULTI_SZ => "multi_string",
        winreg::enums::RegType::REG_BINARY => "binary",
        _ => "binary",
    }
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
