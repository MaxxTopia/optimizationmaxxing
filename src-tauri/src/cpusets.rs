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
use windows::Win32::System::SystemInformation::{
    GetLogicalProcessorInformationEx, RelationProcessorCore,
    SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX,
};
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
    /// Logical-processor IDs flagged as performance cores (EfficiencyClass > 0
    /// in Windows' processor info). Empty on uniform CPUs. Intel hybrid:
    /// P-cores. AMD non-hybrid: empty.
    pub p_core_ids: Vec<u32>,
    /// Efficient cores (EfficiencyClass == 0 on hybrid). Empty on uniform CPUs.
    pub e_core_ids: Vec<u32>,
    /// True if Windows reports more than one EfficiencyClass — i.e. Intel
    /// hybrid (12th+) or Snapdragon-X-style heterogeneous parts. False on
    /// classic AMD desktop + Intel pre-12th.
    pub is_hybrid: bool,
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
    let (p_core_ids, e_core_ids, is_hybrid) = detect_hybrid_topology(count).unwrap_or_default();
    Ok(CpuSetInfo {
        logical_processor_count: count,
        cpu_set_ids: (0..count).collect(),
        p_core_ids,
        e_core_ids,
        is_hybrid,
    })
}

/// Walk GetLogicalProcessorInformationEx(RelationProcessorCore, ...) and
/// classify each logical processor by EfficiencyClass.
///
/// On hybrid Intel (12th+), EfficiencyClass is 1 for P-cores and 0 for
/// E-cores. On uniform parts every core has EfficiencyClass=0 — we report
/// `is_hybrid=false` and leave both lists empty (the UI falls back to
/// "all cores" recommendations).
fn detect_hybrid_topology(logical_count: u32) -> Result<(Vec<u32>, Vec<u32>, bool)> {
    let mut buf_len: u32 = 0;
    // First call: probe required buffer size. Expected to return FALSE with
    // ERROR_INSUFFICIENT_BUFFER and write the byte count to buf_len.
    unsafe {
        let _ = GetLogicalProcessorInformationEx(RelationProcessorCore, None, &mut buf_len);
    }
    if buf_len == 0 {
        return Err(anyhow!("GetLogicalProcessorInformationEx returned 0 buffer size"));
    }
    let mut buf = vec![0u8; buf_len as usize];
    unsafe {
        GetLogicalProcessorInformationEx(
            RelationProcessorCore,
            Some(buf.as_mut_ptr() as *mut SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX),
            &mut buf_len,
        )
        .map_err(|e| anyhow!("GetLogicalProcessorInformationEx failed: {e}"))?;
    }

    let mut p_cores: Vec<u32> = Vec::new();
    let mut e_cores: Vec<u32> = Vec::new();
    let mut efficiency_classes_seen: std::collections::HashSet<u8> =
        std::collections::HashSet::new();

    let mut offset: usize = 0;
    while offset + std::mem::size_of::<SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX>() <= buf.len() {
        // SAFETY: buf is laid out as a stream of SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX
        // records of varying Size per the Win32 contract.
        let info_ptr = unsafe {
            buf.as_ptr().add(offset) as *const SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX
        };
        let info = unsafe { &*info_ptr };
        let size = info.Size as usize;
        if size == 0 || offset + size > buf.len() {
            break;
        }
        // info.Relationship == RelationProcessorCore for every record in this
        // request, so go straight to the Processor union variant.
        // SAFETY: same — the union access is valid because Relationship is set.
        let proc_info = unsafe { &info.Anonymous.Processor };
        let efficiency = proc_info.EfficiencyClass;
        efficiency_classes_seen.insert(efficiency);
        for i in 0..proc_info.GroupCount as usize {
            let group_affinity = proc_info.GroupMask[i];
            let mut mask = group_affinity.Mask;
            let mut bit_index: u32 = 0;
            while mask != 0 {
                if (mask & 1) != 0 {
                    let logical_id = bit_index + (group_affinity.Group as u32) * 64;
                    if logical_id < logical_count {
                        if efficiency > 0 {
                            p_cores.push(logical_id);
                        } else {
                            e_cores.push(logical_id);
                        }
                    }
                }
                mask >>= 1;
                bit_index += 1;
            }
        }
        offset += size;
    }

    let is_hybrid = efficiency_classes_seen.len() > 1;
    if !is_hybrid {
        // Uniform CPU — clear the buckets so the frontend can fall back to
        // "all cores" recommendations cleanly.
        return Ok((Vec::new(), Vec::new(), false));
    }
    p_cores.sort_unstable();
    e_cores.sort_unstable();
    Ok((p_cores, e_cores, true))
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
