//! Read-only stability gates for automatic tuning.
//!
//! Windows Update and driver installers can legitimately rewrite or defer
//! settings while they are running. Applying a large batch in that window
//! creates the exact "it applied, then most tweaks did not stick" experience
//! this app needs to prevent. This module only observes Windows state; it
//! never starts, stops, or changes an update service.
//!
//! The Windows Update service itself is not an activity signal: `wuauserv` can
//! remain running while the machine is idle. The preflight therefore uses the
//! Windows Update Agent's installer `IsBusy` property for the active-operation
//! check and keeps the service state as diagnostic context only.

use serde::Serialize;
use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;

use crate::process_helpers;
use crate::SnapshotStore;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunePreflight {
    pub pending_reboot: bool,
    pub cbs_reboot_pending: bool,
    pub update_reboot_required: bool,
    pub pending_file_rename: bool,
    pub windows_update_state: Option<String>,
    pub bits_state: Option<String>,
    pub os_build: Option<u32>,
    pub last_applied_build: Option<u32>,
    pub build_changed_since_last_apply: bool,
    pub windows_update_active: bool,
    pub blocks_auto_apply: bool,
    pub detail: String,
}

/// A pure policy helper kept separate from registry/process reads so the gate
/// remains easy to test and its blocking contract stays obvious.
pub fn should_hold_auto_apply(
    pending_reboot: bool,
    windows_update_active: bool,
) -> bool {
    pending_reboot || windows_update_active
}

pub fn read(state: &SnapshotStore) -> TunePreflight {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let cbs_reboot_pending = hklm
        .open_subkey(
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending",
        )
        .is_ok();
    let update_reboot_required = hklm
        .open_subkey(
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired",
        )
        .is_ok();
    let pending_file_rename = hklm
        .open_subkey(r"SYSTEM\CurrentControlSet\Control\Session Manager")
        .ok()
        .and_then(|key| key.get_raw_value("PendingFileRenameOperations").ok())
        .map(|value| !value.bytes.is_empty())
        .unwrap_or(false);

    let pending_reboot = cbs_reboot_pending || update_reboot_required || pending_file_rename;
    let windows_update_state = service_state("wuauserv");
    let bits_state = service_state("BITS");
    // Do not use the service state as the gate: wuauserv commonly remains
    // running after Windows Update is idle. BITS also serves unrelated
    // background transfers, so it is reported but does not block a tune.
    let windows_update_active = update_installation_active();

    let os_build = current_os_build();
    let last_applied_build = state
        .kv_get("last_applied_build")
        .ok()
        .flatten()
        .and_then(|value| value.trim().parse::<u32>().ok());
    let build_changed_since_last_apply =
        matches!((os_build, last_applied_build), (Some(now), Some(last)) if now != last);
    let blocks_auto_apply = should_hold_auto_apply(pending_reboot, windows_update_active);

    let mut reasons = Vec::new();
    if pending_reboot {
        reasons.push("Windows has a pending restart from an update or installer");
    }
    if windows_update_active {
        reasons.push("Windows Update is actively installing or uninstalling an update");
    }
    let detail = if reasons.is_empty() {
        if build_changed_since_last_apply {
            "The OS build differs from the last recorded tune, but no update installation or pending restart is detected. The cause is unknown; re-applying can proceed after checking live state, then verify persistence after reboot.".into()
        } else {
            "No pending Windows restart or active Windows Update installation was detected. Updates that are merely available or queued do not block Asta.".into()
        }
    } else {
        format!(
            "Automatic tuning is paused because {}. Finish Windows Update, restart if requested, then re-scan before applying tweaks.",
            reasons.join("; ")
        )
    };

    TunePreflight {
        pending_reboot,
        cbs_reboot_pending,
        update_reboot_required,
        pending_file_rename,
        windows_update_state,
        bits_state,
        os_build,
        last_applied_build,
        build_changed_since_last_apply,
        windows_update_active,
        blocks_auto_apply,
        detail,
    }
}

fn current_os_build() -> Option<u32> {
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .ok()?;
    let value: String = key.get_value("CurrentBuildNumber").ok()?;
    value.trim().parse::<u32>().ok()
}

fn service_state(name: &str) -> Option<String> {
    let script = match name {
        "wuauserv" | "BITS" => format!(
            "$s=Get-Service -Name '{name}' -ErrorAction SilentlyContinue; if($null -eq $s){{'missing'}}else{{$s.Status.ToString().ToLowerInvariant()}}"
        ),
        _ => return None,
    };
    let output = process_helpers::hidden_powershell()
        .args(["-NoProfile", "-NonInteractive", "-Command", script.as_str()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let state = String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_ascii_lowercase();
    (!state.is_empty()).then_some(state)
}

/// Ask the supported Windows Update Agent whether an install/uninstall is in
/// progress. Unlike the service status, this reflects the operation that can
/// actually race with a tune. A failed probe is treated as not busy; the
/// registry pending-restart checks above remain the conservative fallback.
fn update_installation_active() -> bool {
    let script = "$ErrorActionPreference='Stop'; $installer=New-Object -ComObject Microsoft.Update.Installer; if ([bool]$installer.IsBusy) {'busy'} else {'idle'}";
    let output = match process_helpers::hidden_powershell()
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return false,
    };

    String::from_utf8_lossy(&output.stdout)
        .trim()
        .eq_ignore_ascii_case("busy")
}

#[cfg(test)]
mod tests {
    use super::should_hold_auto_apply;

    #[test]
    fn queued_updates_without_installation_do_not_block() {
        assert!(!should_hold_auto_apply(false, false));
    }

    #[test]
    fn pending_update_blocks() {
        assert!(should_hold_auto_apply(true, false));
    }

    #[test]
    fn active_update_blocks() {
        assert!(should_hold_auto_apply(false, true));
    }

    #[test]
    fn changed_build_is_advisory_after_update_finishes() {
        assert!(!should_hold_auto_apply(false, false));
    }
}
