//! Windows CPU Sets topology and opt-in process scheduling experiments.
//!
//! CPU Set IDs are not assumed to equal logical-processor indexes. Windows
//! documents CPU Sets as soft affinity; they do not reserve cores or promise
//! lower latency. The native scheduler is the default and the comparison
//! baseline.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::mem::size_of;
use std::ptr::read_unaligned;
use windows::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, HWND};
use windows::Win32::System::ProcessStatus::GetModuleBaseNameW;
use windows::Win32::System::SystemInformation::{
    CpuSetInformation, GetSystemCpuSetInformation, SYSTEM_CPU_SET_INFORMATION,
};
use windows::Win32::System::Threading::{
    GetProcessDefaultCpuSets, OpenProcess, SetProcessDefaultCpuSets,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION, PROCESS_VM_READ,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CpuSetDescriptor {
    /// The actual ID accepted by SetProcessDefaultCpuSets.
    pub id: u32,
    /// Windows processor group; topology indexes are relative to this group.
    pub group: u16,
    pub logical_processor_index: u8,
    pub core_index: u8,
    pub last_level_cache_index: u8,
    /// Higher values identify faster, less energy-efficient processors on
    /// heterogeneous systems, per Microsoft's SYSTEM_CPU_SET_INFORMATION docs.
    pub efficiency_class: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuSetInfo {
    /// Number of CPU Set records enumerated from Windows.
    pub logical_processor_count: u32,
    /// Real Windows CPU Set IDs; these may not be sequential.
    pub cpu_set_ids: Vec<u32>,
    /// Highest-efficiency-class CPU Set IDs (Intel P-core sets on hybrid Intel).
    pub high_performance_ids: Vec<u32>,
    /// Lower-efficiency-class CPU Set IDs (Intel E-core sets on hybrid Intel).
    pub lower_performance_ids: Vec<u32>,
    /// Full group-relative topology returned by Windows.
    pub cpu_sets: Vec<CpuSetDescriptor>,
    /// True when Windows reports more than one efficiency class.
    pub is_hybrid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinReport {
    pub pid: u32,
    pub process_name: String,
    pub cores: Vec<u32>,
    /// True only when the write succeeded and the requested CPU Set IDs were
    /// read back from the live process handle. A successful syscall alone is
    /// not treated as proof that the setting stuck.
    pub ok: bool,
    /// Explicit read-back result for callers that need to distinguish a
    /// verified write from a syscall-only result.
    pub verified: bool,
    /// CPU Set IDs Windows reported after the write. Empty means either the
    /// native scheduler was requested or read-back did not complete.
    pub applied_cores: Vec<u32>,
    pub error: Option<String>,
}

/// Enumerate Windows' actual CPU Set IDs and topology. Doesn't need admin.
pub fn cpu_set_info() -> Result<CpuSetInfo> {
    let mut cpu_sets = enumerate_cpu_sets()?;
    cpu_sets.sort_by_key(|set| (set.group, set.logical_processor_index, set.id));
    if cpu_sets.is_empty() {
        return Err(anyhow!("Windows returned no CPU Set records"));
    }

    let mut seen_ids = HashSet::with_capacity(cpu_sets.len());
    if cpu_sets.iter().any(|set| !seen_ids.insert(set.id)) {
        return Err(anyhow!("Windows returned duplicate CPU Set IDs"));
    }

    let (high_performance_ids, lower_performance_ids, is_hybrid) =
        split_efficiency_classes(&cpu_sets);
    let cpu_set_ids = cpu_sets.iter().map(|set| set.id).collect::<Vec<_>>();
    let logical_processor_count = u32::try_from(cpu_sets.len())
        .context("CPU Set count does not fit in u32")?;
    Ok(CpuSetInfo {
        logical_processor_count,
        cpu_set_ids,
        high_performance_ids,
        lower_performance_ids,
        cpu_sets,
        is_hybrid,
    })
}

/// Query the size, fetch the variable-sized records, and walk each record by
/// its declared Size as required by the Windows API contract.
fn enumerate_cpu_sets() -> Result<Vec<CpuSetDescriptor>> {
    let mut required_bytes = 0u32;
    // SAFETY: the null/zero probe is the documented way to obtain buffer size.
    let _ = unsafe {
        GetSystemCpuSetInformation(None, 0, &mut required_bytes, None, None)
    };
    if required_bytes == 0 {
        return Err(anyhow!("GetSystemCpuSetInformation returned an empty buffer size"));
    }

    let word_bytes = size_of::<u64>();
    let word_count = (required_bytes as usize + word_bytes - 1) / word_bytes;
    let buffer_bytes = word_count
        .checked_mul(word_bytes)
        .context("CPU Set buffer size overflow")?;
    let buffer_len = u32::try_from(buffer_bytes).context("CPU Set buffer is too large")?;
    let mut aligned_buffer = vec![0u64; word_count];
    let mut returned_bytes = 0u32;
    // SAFETY: aligned_buffer is 8-byte aligned, has buffer_len bytes, and the
    // API writes at most that many bytes. The pointer remains live for the call.
    let ok = unsafe {
        GetSystemCpuSetInformation(
            Some(aligned_buffer.as_mut_ptr().cast::<SYSTEM_CPU_SET_INFORMATION>()),
            buffer_len,
            &mut returned_bytes,
            None,
            None,
        )
    };
    if !ok.as_bool() {
        return Err(anyhow!(
            "GetSystemCpuSetInformation failed (last_error={:?})",
            unsafe { GetLastError() }
        ));
    }
    let returned_len = usize::try_from(returned_bytes).context("invalid CPU Set buffer length")?;
    if returned_len > buffer_bytes {
        return Err(anyhow!("Windows returned more CPU Set data than the supplied buffer"));
    }
    let bytes = unsafe {
        std::slice::from_raw_parts(aligned_buffer.as_ptr().cast::<u8>(), returned_len)
    };
    parse_cpu_set_records(bytes)
}

/// Parse SYSTEM_CPU_SET_INFORMATION records without assuming their IDs are
/// sequential. Unknown record types are skipped using their declared size.
fn parse_cpu_set_records(bytes: &[u8]) -> Result<Vec<CpuSetDescriptor>> {
    let header_len = size_of::<u32>() + size_of::<i32>();
    let mut offset = 0usize;
    let mut cpu_sets = Vec::new();

    while offset < bytes.len() {
        let remaining = bytes.len() - offset;
        if remaining < header_len {
            return Err(anyhow!("truncated CPU Set record header at byte {offset}"));
        }
        let header = &bytes[offset..offset + header_len];
        let record_size = u32::from_ne_bytes(header[0..4].try_into()?) as usize;
        let record_type = i32::from_ne_bytes(header[4..8].try_into()?);
        if record_size < header_len || record_size > remaining {
            return Err(anyhow!("invalid CPU Set record size {record_size} at byte {offset}"));
        }

        if record_type == CpuSetInformation.0 {
            if record_size < size_of::<SYSTEM_CPU_SET_INFORMATION>() {
                return Err(anyhow!("CPU Set record is shorter than SYSTEM_CPU_SET_INFORMATION"));
            }
            // SAFETY: the size check above guarantees a complete record, and
            // read_unaligned handles the byte stream's record alignment.
            let record = unsafe {
                read_unaligned(
                    bytes.as_ptr().add(offset).cast::<SYSTEM_CPU_SET_INFORMATION>(),
                )
            };
            // SAFETY: the Type check above guarantees the CpuSet union arm.
            let set = unsafe { record.Anonymous.CpuSet };
            cpu_sets.push(CpuSetDescriptor {
                id: set.Id,
                group: set.Group,
                logical_processor_index: set.LogicalProcessorIndex,
                core_index: set.CoreIndex,
                last_level_cache_index: set.LastLevelCacheIndex,
                efficiency_class: set.EfficiencyClass,
            });
        }
        offset += record_size;
    }
    Ok(cpu_sets)
}

/// Windows documents larger EfficiencyClass values as faster, less
/// energy-efficient processors. A uniform CPU has no special subset to offer.
fn split_efficiency_classes(sets: &[CpuSetDescriptor]) -> (Vec<u32>, Vec<u32>, bool) {
    let Some(highest_class) = sets.iter().map(|set| set.efficiency_class).max() else {
        return (Vec::new(), Vec::new(), false);
    };
    let lowest_class = sets.iter().map(|set| set.efficiency_class).min().unwrap_or(highest_class);
    if highest_class == lowest_class {
        return (Vec::new(), Vec::new(), false);
    }
    let high = sets
        .iter()
        .filter(|set| set.efficiency_class == highest_class)
        .map(|set| set.id)
        .collect();
    let lower = sets
        .iter()
        .filter(|set| set.efficiency_class < highest_class)
        .map(|set| set.id)
        .collect();
    (high, lower, true)
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
                cores: normalize_cpu_set_ids(cores),
                ok: false,
                verified: false,
                applied_cores: Vec::new(),
                error: Some(format!("OpenProcess failed (PID may have exited or insufficient privilege): {e}")),
            })
        }
    };
    let process_name = read_process_name(handle).unwrap_or_default();

    let desired_cores = match validate_cpu_set_ids(cores) {
        Ok(ids) => ids,
        Err(error) => {
            let _ = unsafe { CloseHandle(handle) };
            return Ok(PinReport {
                pid,
                process_name,
                cores: normalize_cpu_set_ids(cores),
                ok: false,
                verified: false,
                applied_cores: Vec::new(),
                error: Some(format!("CPU Set selection was rejected before writing: {error:#}")),
            });
        }
    };

    let cores_slice: &[u32] = &desired_cores;
    let count = cores_slice.len() as u32;
    let result = unsafe {
        SetProcessDefaultCpuSets(
            handle,
            if count == 0 { None } else { Some(cores_slice) },
        )
    };
    let syscall_ok = result.as_bool();
    let (ok, verified, applied_cores, error) = if !syscall_ok {
        (
            false,
            false,
            Vec::new(),
            Some(format!(
                "SetProcessDefaultCpuSets returned FALSE (last_error={:?})",
                unsafe { windows::Win32::Foundation::GetLastError() }
            )),
        )
    } else {
        match read_process_default_cpu_sets(handle) {
            Ok(applied) if applied == desired_cores => (true, true, applied, None),
            Ok(applied) => (
                false,
                false,
                applied.clone(),
                Some(format!(
                    "Windows accepted the CPU Set write but read back [{}], expected [{}]",
                    format_cpu_set_ids(&applied),
                    format_cpu_set_ids(&desired_cores)
                )),
            ),
            Err(error) => (
                false,
                false,
                Vec::new(),
                Some(format!(
                    "CPU Set write returned success but live read-back failed: {error:#}"
                )),
            ),
        }
    };
    let _ = unsafe { CloseHandle(handle) };

    Ok(PinReport {
        pid,
        process_name,
        cores: desired_cores,
        ok,
        verified,
        applied_cores,
        error,
    })
}

/// Read the current per-process CPU Set preference without changing it.
/// Used by the watcher to detect an external scheduler tool or game launcher
/// that replaced the assignment after the last successful poll.
pub fn read_pid_cpu_sets(pid: u32) -> Result<Vec<u32>> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
        .with_context(|| format!("OpenProcess for CPU Set read-back failed for PID {pid}"))?;
    let result = read_process_default_cpu_sets(handle);
    let _ = unsafe { CloseHandle(handle) };
    result
}

fn read_process_default_cpu_sets(handle: HANDLE) -> Result<Vec<u32>> {
    let mut required = 0u32;
    // The first call is the documented size probe. Windows commonly returns
    // FALSE with ERROR_INSUFFICIENT_BUFFER here; a nonzero required count is
    // still usable and is handled below.
    let first_ok = unsafe { GetProcessDefaultCpuSets(handle, None, &mut required) }.as_bool();
    if required == 0 {
        if first_ok {
            return Ok(Vec::new());
        }
        return Err(anyhow!(
            "GetProcessDefaultCpuSets size probe failed (last_error={:?})",
            unsafe { GetLastError() }
        ));
    }

    let mut ids = vec![0u32; required as usize];
    let mut returned = required;
    let ok = unsafe { GetProcessDefaultCpuSets(handle, Some(&mut ids), &mut returned) }.as_bool();
    if !ok {
        return Err(anyhow!(
            "GetProcessDefaultCpuSets read-back failed (last_error={:?})",
            unsafe { GetLastError() }
        ));
    }
    let returned = usize::try_from(returned).context("CPU Set read-back count overflow")?;
    if returned > ids.len() {
        return Err(anyhow!(
            "GetProcessDefaultCpuSets returned {returned} IDs for a {}-ID buffer",
            ids.len()
        ));
    }
    ids.truncate(returned);
    Ok(normalize_cpu_set_ids(&ids))
}

fn validate_cpu_set_ids(cores: &[u32]) -> Result<Vec<u32>> {
    let desired = normalize_cpu_set_ids(cores);
    if desired.is_empty() {
        return Ok(desired);
    }
    let info = cpu_set_info().context("read current Windows CPU Set topology")?;
    let valid = info.cpu_set_ids.into_iter().collect::<HashSet<_>>();
    let unknown = desired
        .iter()
        .copied()
        .filter(|id| !valid.contains(id))
        .collect::<Vec<_>>();
    if !unknown.is_empty() {
        return Err(anyhow!(
            "CPU Set ID(s) [{}] are not present in the current Windows topology; refresh the scan after a hardware or firmware change",
            format_cpu_set_ids(&unknown)
        ));
    }
    Ok(desired)
}

fn normalize_cpu_set_ids(cores: &[u32]) -> Vec<u32> {
    let mut normalized = cores.to_vec();
    normalized.sort_unstable();
    normalized.dedup();
    normalized
}

fn format_cpu_set_ids(ids: &[u32]) -> String {
    ids.iter().map(u32::to_string).collect::<Vec<_>>().join(", ")
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
