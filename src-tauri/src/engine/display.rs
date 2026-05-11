//! DisplayRefresh TweakAction — native Win32 path.
//!
//! Bumps the refresh rate of attached displays matching a name pattern
//! to the highest supported Hz in (target + fallback) at the display's
//! current width/height. Calls ChangeDisplaySettingsExW directly via
//! the `windows` crate — no PowerShell, no UAC. Per-user setting.
//!
//! Pre-state per matched display is captured before the change so revert
//! restores the exact prior mode.
//!
//! The reference PowerShell implementation lives in the aimmaxxer repo
//! at `scripts/bump_gaming_pc_hdmi_refresh.ps1` and was the first
//! ship-tested version of this logic. This Rust port is the in-app
//! equivalent — same API calls, no UAC, idempotent.

use anyhow::{anyhow, Context};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ffi::c_void;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::Graphics::Gdi::{
    ChangeDisplaySettingsExW, EnumDisplayDevicesW, EnumDisplaySettingsW, CDS_TEST,
    CDS_TYPE, CDS_UPDATEREGISTRY, DEVMODEW, DISPLAY_DEVICEW, DISPLAY_DEVICE_STATE_FLAGS,
    DISP_CHANGE_SUCCESSFUL, DM_DISPLAYFREQUENCY, DM_PELSHEIGHT, DM_PELSWIDTH,
    ENUM_CURRENT_SETTINGS,
};

use super::actions::TweakAction;

const DISPLAY_DEVICE_ATTACHED_TO_DESKTOP: DISPLAY_DEVICE_STATE_FLAGS =
    DISPLAY_DEVICE_STATE_FLAGS(0x1);

/// Captured pre-state, JSON-serialized into the snapshot store.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PreState {
    /// Per-matched-display: original mode so revert restores exactly.
    devices: Vec<DevicePreState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DevicePreState {
    device_name: String,
    description: String,
    width: u32,
    height: u32,
    hz: u32,
}

/// One attached display + its current mode + its supported Hz list at
/// the current resolution. Used by both pre-state capture and apply.
#[derive(Debug, Clone)]
struct EnumeratedDisplay {
    device_name: String,
    description: String,
    cur_width: u32,
    cur_height: u32,
    cur_hz: u32,
    /// Available refresh rates at (cur_width, cur_height), sorted descending.
    available_hz: Vec<u32>,
}

fn wide_zstr_to_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

fn str_to_wide_zstr(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Walk attached displays. For each, query current mode + all supported
/// modes at that resolution.
fn enumerate_displays() -> Vec<EnumeratedDisplay> {
    let mut out = Vec::new();
    let mut dev_num: u32 = 0;
    loop {
        let mut dd = DISPLAY_DEVICEW {
            cb: std::mem::size_of::<DISPLAY_DEVICEW>() as u32,
            ..Default::default()
        };
        let ok = unsafe { EnumDisplayDevicesW(PCWSTR::null(), dev_num, &mut dd, 0).as_bool() };
        if !ok {
            break;
        }
        dev_num += 1;
        if (dd.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP).0 == 0 {
            continue;
        }
        let device_name = wide_zstr_to_string(&dd.DeviceName);
        let description = wide_zstr_to_string(&dd.DeviceString);

        // Current mode.
        let mut cur = DEVMODEW {
            dmSize: std::mem::size_of::<DEVMODEW>() as u16,
            ..Default::default()
        };
        let cur_ok = unsafe {
            let wide = str_to_wide_zstr(&device_name);
            EnumDisplaySettingsW(PCWSTR(wide.as_ptr()), ENUM_CURRENT_SETTINGS, &mut cur).as_bool()
        };
        if !cur_ok {
            continue;
        }
        let cur_width = cur.dmPelsWidth;
        let cur_height = cur.dmPelsHeight;
        let cur_hz = cur.dmDisplayFrequency;

        // All supported modes at this resolution.
        let mut available_hz: Vec<u32> = Vec::new();
        let mut mode_num: u32 = 0;
        loop {
            let mut dm = DEVMODEW {
                dmSize: std::mem::size_of::<DEVMODEW>() as u16,
                ..Default::default()
            };
            let mode_ok = unsafe {
                let wide = str_to_wide_zstr(&device_name);
                EnumDisplaySettingsW(
                    PCWSTR(wide.as_ptr()),
                    windows::Win32::Graphics::Gdi::ENUM_DISPLAY_SETTINGS_MODE(mode_num),
                    &mut dm,
                )
                .as_bool()
            };
            if !mode_ok {
                break;
            }
            if dm.dmPelsWidth == cur_width && dm.dmPelsHeight == cur_height {
                available_hz.push(dm.dmDisplayFrequency);
            }
            mode_num += 1;
        }
        available_hz.sort_unstable();
        available_hz.dedup();
        available_hz.reverse();

        out.push(EnumeratedDisplay {
            device_name,
            description,
            cur_width,
            cur_height,
            cur_hz,
            available_hz,
        });
    }
    out
}

/// Case-insensitive multi-substring match. The pattern is pipe-separated
/// (e.g. "aver|gc573|live gamer") — match succeeds if ANY substring
/// appears in either device_name or description.
///
/// Empty pattern or "*" / ".*" matches every display (intended for the
/// "bump ALL monitors" preset).
fn matches_pattern(display: &EnumeratedDisplay, pattern: &str) -> bool {
    let p = pattern.trim();
    if p.is_empty() || p == "*" || p == ".*" {
        return true;
    }
    let dn = display.device_name.to_ascii_lowercase();
    let ds = display.description.to_ascii_lowercase();
    for needle in p.split('|') {
        let n = needle.trim().to_ascii_lowercase();
        if n.is_empty() {
            continue;
        }
        if dn.contains(&n) || ds.contains(&n) {
            return true;
        }
    }
    false
}

/// Pick the highest Hz from `candidates` that's actually in
/// `available_hz`. None if no candidate is supported.
fn pick_best_hz(candidates: &[u32], available_hz: &[u32]) -> Option<u32> {
    for c in candidates {
        if available_hz.contains(c) {
            return Some(*c);
        }
    }
    None
}

/// TEST the mode is acceptable before APPLY. Two-phase guard against
/// requesting a mode the cable / EDID would reject, which would knock
/// the display off-signal.
fn change_mode(device_name: &str, width: u32, height: u32, hz: u32) -> anyhow::Result<()> {
    let mut dm = DEVMODEW {
        dmSize: std::mem::size_of::<DEVMODEW>() as u16,
        ..Default::default()
    };
    let wide = str_to_wide_zstr(device_name);
    let read_ok = unsafe {
        EnumDisplaySettingsW(PCWSTR(wide.as_ptr()), ENUM_CURRENT_SETTINGS, &mut dm).as_bool()
    };
    if !read_ok {
        return Err(anyhow!(
            "EnumDisplaySettingsW failed for {} (can't read current mode)",
            device_name
        ));
    }
    dm.dmPelsWidth = width;
    dm.dmPelsHeight = height;
    dm.dmDisplayFrequency = hz;
    dm.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY;

    // Test first.
    let test_result = unsafe {
        ChangeDisplaySettingsExW(
            PCWSTR(wide.as_ptr()),
            Some(&dm),
            Some(HWND::default()),
            CDS_TEST,
            None,
        )
    };
    if test_result != DISP_CHANGE_SUCCESSFUL {
        return Err(anyhow!(
            "ChangeDisplaySettingsExW (TEST) rejected {}x{}@{}Hz on {} (code {:?})",
            width,
            height,
            hz,
            device_name,
            test_result
        ));
    }

    // Apply + persist.
    let apply_result = unsafe {
        ChangeDisplaySettingsExW(
            PCWSTR(wide.as_ptr()),
            Some(&dm),
            Some(HWND::default()),
            CDS_UPDATEREGISTRY,
            None,
        )
    };
    if apply_result != DISP_CHANGE_SUCCESSFUL {
        return Err(anyhow!(
            "ChangeDisplaySettingsExW (APPLY) failed on {} (code {:?})",
            device_name,
            apply_result
        ));
    }
    Ok(())
}

/// Top-level: snapshot pre-state per matched display.
pub fn capture_pre_state(action: &TweakAction) -> anyhow::Result<Value> {
    let TweakAction::DisplayRefresh { device_match, .. } = action else {
        return Err(anyhow!(
            "display::capture_pre_state called on wrong action variant"
        ));
    };
    let displays = enumerate_displays();
    let matched: Vec<DevicePreState> = displays
        .iter()
        .filter(|d| matches_pattern(d, device_match))
        .map(|d| DevicePreState {
            device_name: d.device_name.clone(),
            description: d.description.clone(),
            width: d.cur_width,
            height: d.cur_height,
            hz: d.cur_hz,
        })
        .collect();

    let pre = PreState { devices: matched };
    serde_json::to_value(&pre).context("serializing DisplayRefresh pre-state")
}

/// Apply: for each matched display, pick best Hz from
/// (target + fallback) and set it via ChangeDisplaySettingsExW.
/// Returns the pre-state JSON so the engine can persist it.
pub fn apply(action: &TweakAction) -> anyhow::Result<Value> {
    let (device_match, target_hz, fallback_chain) = match action {
        TweakAction::DisplayRefresh {
            device_match,
            target_hz,
            fallback_chain,
        } => (device_match, *target_hz, fallback_chain.clone()),
        _ => return Err(anyhow!("display::apply called on wrong action variant")),
    };

    let pre = capture_pre_state(action)?;

    let displays = enumerate_displays();
    let mut applied_count = 0usize;
    let mut last_err: Option<anyhow::Error> = None;

    // Build candidate list: target first, then fallback (dedup'd, preserve order).
    let mut candidates: Vec<u32> = vec![target_hz];
    for f in &fallback_chain {
        if !candidates.contains(f) {
            candidates.push(*f);
        }
    }

    for d in displays.iter().filter(|d| matches_pattern(d, &device_match)) {
        let Some(best) = pick_best_hz(&candidates, &d.available_hz) else {
            last_err = Some(anyhow!(
                "no candidate Hz {:?} supported by {} at {}x{} (available: {:?})",
                candidates,
                d.device_name,
                d.cur_width,
                d.cur_height,
                d.available_hz
            ));
            continue;
        };
        // Skip if already at target — save a no-op call.
        if best == d.cur_hz {
            applied_count += 1;
            continue;
        }
        match change_mode(&d.device_name, d.cur_width, d.cur_height, best) {
            Ok(()) => applied_count += 1,
            Err(e) => last_err = Some(e),
        }
    }

    if applied_count == 0 {
        if let Some(e) = last_err {
            return Err(e);
        }
        return Err(anyhow!(
            "no attached displays matched pattern {:?}",
            device_match
        ));
    }
    Ok(pre)
}

/// Revert: replay captured pre-state per matched display.
pub fn revert(action: &TweakAction, pre_state: &Value) -> anyhow::Result<()> {
    if !matches!(action, TweakAction::DisplayRefresh { .. }) {
        return Err(anyhow!("display::revert called on wrong action variant"));
    }
    let pre: PreState = serde_json::from_value(pre_state.clone())
        .context("deserializing DisplayRefresh pre-state")?;
    let mut last_err: Option<anyhow::Error> = None;
    for d in pre.devices {
        if let Err(e) = change_mode(&d.device_name, d.width, d.height, d.hz) {
            last_err = Some(e);
        }
    }
    if let Some(e) = last_err {
        return Err(e);
    }
    Ok(())
}

// CDS_TEST + CDS_UPDATEREGISTRY: the windows crate types here are
// CDS_TYPE flag values. Need to cast u32 -> CDS_TYPE for the call.
// Safe constants from the Win32 SDK headers.
#[allow(dead_code)]
fn _const_check() {
    let _ = CDS_TEST;
    let _ = CDS_UPDATEREGISTRY;
    let _ = DISP_CHANGE_SUCCESSFUL;
    let _ = ENUM_CURRENT_SETTINGS;
    let _ = DM_DISPLAYFREQUENCY;
    let _ = DM_PELSWIDTH;
    let _ = DM_PELSHEIGHT;
    let _: CDS_TYPE = CDS_TEST;
    let _: LPARAM = LPARAM(0);
    let _: *mut c_void = std::ptr::null_mut();
}

// ----------------------------------------------------------------- tests
#[cfg(test)]
mod tests {
    use super::*;

    fn make_display(name: &str, desc: &str, hz_list: &[u32], cur_hz: u32) -> EnumeratedDisplay {
        EnumeratedDisplay {
            device_name: name.into(),
            description: desc.into(),
            cur_width: 1920,
            cur_height: 1080,
            cur_hz,
            available_hz: hz_list.to_vec(),
        }
    }

    #[test]
    fn pattern_matches_substring_case_insensitive() {
        let d = make_display("\\\\.\\DISPLAY1", "AVerMedia Live Gamer 4K", &[60, 120, 240], 60);
        assert!(matches_pattern(&d, "aver"));
        assert!(matches_pattern(&d, "AVER"));
        assert!(matches_pattern(&d, "Live Gamer"));
        assert!(matches_pattern(&d, "live gamer"));
    }

    #[test]
    fn pattern_pipe_separated_or() {
        let d = make_display("\\\\.\\DISPLAY1", "AVerMedia Live Gamer 4K", &[], 60);
        assert!(matches_pattern(&d, "aver|gc573|live gamer"));
        assert!(matches_pattern(&d, "gc573|aver"));
        assert!(!matches_pattern(&d, "elgato|magewell"));
    }

    #[test]
    fn pattern_wildcard_matches_everything() {
        let d = make_display("\\\\.\\DISPLAY1", "Some Monitor", &[], 60);
        assert!(matches_pattern(&d, "*"));
        assert!(matches_pattern(&d, ".*"));
        assert!(matches_pattern(&d, ""));
        assert!(matches_pattern(&d, "  "));
    }

    #[test]
    fn pick_best_picks_first_available_in_order() {
        let avail = vec![240, 165, 144, 120, 60];
        // Target first.
        assert_eq!(pick_best_hz(&[240, 165, 144, 120], &avail), Some(240));
        // Falls through when target unavailable.
        assert_eq!(pick_best_hz(&[300, 240, 165], &avail), Some(240));
        // All unavailable.
        assert_eq!(pick_best_hz(&[300, 280], &avail), None);
        // 144Hz monitor — 240 skipped, 165 skipped, lands on 144.
        let lower = vec![144, 120, 60];
        assert_eq!(pick_best_hz(&[240, 165, 144, 120], &lower), Some(144));
    }
}
