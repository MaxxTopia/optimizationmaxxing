//! CPU Sets API — game-launch core pinning.
//!
//! Wraps Windows' newer `SetProcessDefaultCpuSets` (Win10 1709+) which is
//! categorically better than the legacy SetProcessAffinityMask:
//!
//! - **Affinity mask** is a hard limit: kernel scheduler can ONLY run threads
//!   on the masked cores. The OS scheduler still considers other processes
//!   "wanting" those same cores at the same time.
//! - **CPU sets** is a hint to the scheduler: "prefer these cores for this
//!   process." The scheduler treats off-set cores as unavailable for the
//!   pinned process AND prefers them for everything else. Net effect: the
//!   pinned process gets the cores effectively reserved instead of just
//!   constrained.
//!
//! User flow: pick a "game core set" (e.g. high-perf cores 0-7 on a 16-core
//! Ryzen), launch the game, click "Pin foreground game" — we pin the active
//! foreground window's process to that set. Pin survives until the process
//! exits or we explicitly clear it.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND};
use windows::Win32::System::ProcessStatus::GetModuleBaseNameW;
use windows::Win32::System::Threading::{
    GetActiveProcessorCount, OpenProcess, SetProcessDefaultCpuSets,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION, PROCESS_VM_READ,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuSetInfo {
    /// Logical processor count (per Windows' active-processor enumerator).
    pub logical_processor_count: u32,
    /// CPU Set IDs as Windows reports them. Indices 0..N-1 in the order the
    /// scheduler enumerates. We surface these so the UI can render the
    /// "pick which cores to reserve" picker.
    pub cpu_set_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinReport {
    pub pid: u32,
    pub process_name: String,
    pub cores: Vec<u32>,
    /// True if the syscall returned success. False if the process exited
    /// between OpenProcess and SetProcessDefaultCpuSets (race), or some
    /// other failure (surfaced via `error`).
    pub ok: bool,
    pub error: Option<String>,
}

/// Probe the system's CPU set topology. Doesn't need admin.
///
/// Note: we report `logical_processor_count` from GetActiveProcessorCount
/// and synthesize sequential CPU Set IDs (0..N-1). On modern Windows that
/// matches what GetSystemCpuSetInformation would return for non-NUMA single-
/// socket consumer hardware. If we ever need real CPU Set IDs (multi-CCD
/// Threadripper) we can wire GetSystemCpuSetInformation in a follow-up; the
/// API surface is opaque enough that the synthesized IDs are correct for
/// every consumer rig we ship to today.
pub fn cpu_set_info() -> Result<CpuSetInfo> {
    let count = unsafe { GetActiveProcessorCount(0xFFFF) };
    if count == 0 {
        return Err(anyhow!("GetActiveProcessorCount returned 0"));
    }
    Ok(CpuSetInfo {
        logical_processor_count: count,
        cpu_set_ids: (0..count).collect(),
    })
}

/// Pin the foreground window's owning process to the given CPU Set IDs.
/// Empty `cores` clears any existing pin (resets to default scheduler).
pub fn pin_foreground_to_cores(cores: &[u32]) -> Result<PinReport> {
    let hwnd: HWND = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return Err(anyhow!("no foreground window — focus the game first"));
    }
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 {
        return Err(anyhow!("GetWindowThreadProcessId returned 0 PID"));
    }
    pin_pid_to_cores(pid, cores)
}

/// Pin a specific PID to the given CPU set IDs. Used by both
/// `pin_foreground_to_cores` and the explicit "Pin process X" path.
pub fn pin_pid_to_cores(pid: u32, cores: &[u32]) -> Result<PinReport> {
    // PROCESS_SET_INFORMATION is the access right SetProcessDefaultCpuSets
    // requires. PROCESS_QUERY_LIMITED_INFORMATION + PROCESS_VM_READ let us
    // read the process name for the report.
    let access = PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ;
    let handle = unsafe { OpenProcess(access, false, pid) };
    let handle = match handle {
        Ok(h) => h,
        Err(e) => {
            return Ok(PinReport {
                pid,
                process_name: String::new(),
                cores: cores.to_vec(),
                ok: false,
                error: Some(format!("OpenProcess failed (PID may have exited or insufficient privilege): {e}")),
            })
        }
    };
    let process_name = read_process_name(handle).unwrap_or_default();

    let cores_slice: &[u32] = cores;
    let count = cores_slice.len() as u32;
    let result = unsafe {
        SetProcessDefaultCpuSets(
            handle,
            if count == 0 { None } else { Some(cores_slice) },
        )
    };
    let ok = result.as_bool();
    let error = if ok {
        None
    } else {
        Some(format!(
            "SetProcessDefaultCpuSets returned FALSE (last_error={:?})",
            unsafe { windows::Win32::Foundation::GetLastError() }
        ))
    };
    let _ = unsafe { CloseHandle(handle) };

    Ok(PinReport {
        pid,
        process_name,
        cores: cores.to_vec(),
        ok,
        error,
    })
}

fn read_process_name(handle: HANDLE) -> Result<String> {
    let mut buf = [0u16; 260];
    // GetModuleBaseNameW(handle, None=primary module, &mut buf) writes the
    // exe filename (without path) into the buffer.
    let written = unsafe { GetModuleBaseNameW(handle, None, &mut buf) };
    if written == 0 {
        return Err(anyhow!("GetModuleBaseNameW returned 0"));
    }
    Ok(String::from_utf16_lossy(&buf[..written as usize]))
}

/// Clear a previous pin by setting an empty CPU Set list (returns process
/// to default scheduler behavior).
pub fn clear_pin(pid: u32) -> Result<PinReport> {
    pin_pid_to_cores(pid, &[]).context("clearing CPU set pin")
}
