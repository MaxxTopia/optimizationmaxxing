//! Anonymous opt-in usage stats. POST to optmaxxing-telemetry worker.
//!
//! Trust contract:
//! - Off by default. The frontend toggle must be explicitly flipped on
//!   from Settings before any event leaves this rig.
//! - The `device_id` we send is a *separate* hash from the VIP HWID —
//!   different salt — so events can't be cross-correlated with VIP claim
//!   records on the operator side. See [`anonymous_device_id`].
//! - Fire-and-forget. No event delivery is ever blocking; failures are
//!   swallowed silently. The user never sees a "telemetry failed" toast.
//! - All requests go through hidden PowerShell + Invoke-WebRequest
//!   (same pattern as vip.rs / bufferbloat.rs / onu.rs) so we don't take
//!   a reqwest dep just for fire-and-forget POSTs.

use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::process_helpers::hidden_powershell;

/// Worker endpoint. Override at build via `OPTMAXXING_TELEMETRY_URL` env var.
pub const DEFAULT_WORKER_URL: &str = "https://optmaxxing-telemetry.maxxtopia.workers.dev/event";

/// Salt the device-id hash so it can't be reverse-correlated with the VIP
/// HWID (which is a SHA-256 of BIOS UUID + serial + CPU brand with NO
/// salt). Same physical rig → different hash → operator can't link a
/// telemetry event to a VIP claim, even if both DBs leaked.
const TELEMETRY_HWID_SALT: &[u8] = b"optmaxxing-telemetry-v1";

static SETTINGS_PATH: OnceLock<PathBuf> = OnceLock::new();

fn worker_url() -> String {
    std::env::var("OPTMAXXING_TELEMETRY_URL").unwrap_or_else(|_| DEFAULT_WORKER_URL.to_string())
}

/// Set the on-disk path the opt-in flag is persisted at. Called once
/// from the Tauri setup hook with `app_local_data_dir()/telemetry.json`.
pub fn set_settings_path(path: PathBuf) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = SETTINGS_PATH.set(path);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetrySettings {
    pub enabled: bool,
    /// Persisted anonymous device id. Generated on first opt-in so a
    /// single rig posts under a stable id (helps "did this user see
    /// improvement over time" without ever knowing who they are).
    pub device_id: Option<String>,
}

impl Default for TelemetrySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            device_id: None,
        }
    }
}

fn read_settings() -> TelemetrySettings {
    let Some(path) = SETTINGS_PATH.get() else {
        return TelemetrySettings::default();
    };
    match fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => TelemetrySettings::default(),
    }
}

fn write_settings(s: &TelemetrySettings) -> Result<(), String> {
    let Some(path) = SETTINGS_PATH.get() else {
        return Err("settings path not initialized".to_string());
    };
    let body = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(path, body).map_err(|e| e.to_string())
}

/// Derive the anonymous device id from the same WMI sources as the VIP
/// HWID, but salted so the two hashes can't be cross-correlated.
///
/// On WMI failure (rare — only happens on broken Windows installs) we
/// fall back to a random id. A fresh random id per call defeats stable
/// per-device aggregation, but that's preferable to leaking the real
/// HWID by accident.
pub fn anonymous_device_id() -> String {
    match crate::vip::compute_hwid() {
        Ok(hwid) => {
            let mut hasher = Sha256::new();
            hasher.update(TELEMETRY_HWID_SALT);
            hasher.update(b"|");
            hasher.update(hwid.as_bytes());
            let digest = hasher.finalize();
            digest.iter().take(16).map(|b| format!("{:02x}", b)).collect()
        }
        Err(_) => {
            // WMI failed (broken Windows install). Fall back to a hash
            // over (pid, nanoseconds, salt). Bounces per call which
            // burns per-device aggregation, but better than leaking the
            // real HWID via a deterministic fallback.
            let pid = std::process::id();
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let mut hasher = Sha256::new();
            hasher.update(TELEMETRY_HWID_SALT);
            hasher.update(b"|fallback|");
            hasher.update(pid.to_le_bytes());
            hasher.update(nanos.to_le_bytes());
            let digest = hasher.finalize();
            digest.iter().take(16).map(|b| format!("{:02x}", b)).collect()
        }
    }
}

/// Ensure a device_id is present, return it. Generates + persists on
/// first call.
fn ensure_device_id(s: &mut TelemetrySettings) -> String {
    if let Some(id) = &s.device_id {
        return id.clone();
    }
    let id = anonymous_device_id();
    s.device_id = Some(id.clone());
    let _ = write_settings(s);
    id
}

#[tauri::command]
pub fn telemetry_get() -> TelemetrySettings {
    read_settings()
}

#[tauri::command]
pub fn telemetry_set(enabled: bool) -> Result<TelemetrySettings, String> {
    let mut s = read_settings();
    s.enabled = enabled;
    if enabled && s.device_id.is_none() {
        ensure_device_id(&mut s);
    }
    write_settings(&s)?;
    Ok(s)
}

/// Fire-and-forget POST. Always returns Ok(()) on opt-out — silent no-op.
#[tauri::command]
pub fn telemetry_send_event(kind: String, payload: serde_json::Value) -> Result<(), String> {
    let mut s = read_settings();
    if !s.enabled {
        return Ok(());
    }
    let device_id = ensure_device_id(&mut s);
    let version = env!("CARGO_PKG_VERSION").to_string();
    let body = serde_json::json!({
        "kind": kind,
        "version": version,
        "deviceId": device_id,
        "payload": payload,
    })
    .to_string();
    let url = worker_url();

    // Spawn detached so a slow worker can't block the caller. We don't
    // care about the response — just want it sent.
    std::thread::spawn(move || {
        let body_escaped = body.replace('\'', "''");
        let url_escaped = url.replace('\'', "''");
        let script = format!(
            r#"$ErrorActionPreference = 'SilentlyContinue'
$body = @'
{body}
'@
try {{
    Invoke-WebRequest -Uri '{url}' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 4 | Out-Null
}} catch {{ }}
"#,
            body = body_escaped,
            url = url_escaped,
        );
        let _ = hidden_powershell()
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .output();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_off() {
        let s = TelemetrySettings::default();
        assert!(!s.enabled);
        assert!(s.device_id.is_none());
    }

    #[test]
    fn anonymous_device_id_is_well_formed() {
        // We don't go through ensure_device_id because that requires the
        // SETTINGS_PATH OnceLock. Just verify the formatter shape.
        let id = anonymous_device_id();
        assert_eq!(id.len(), 32);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit() && (c.is_ascii_digit() || c.is_ascii_lowercase())));
    }
}
