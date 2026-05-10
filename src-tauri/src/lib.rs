use serde::Serialize;
use tauri::Manager;

mod auto_pin;
mod cpusets;
mod crash;
mod engine;
mod metrics;
mod process_helpers;
mod specs;
mod standby;
mod telemetry;
mod toolkit;
mod vip;

pub use engine::{ApplyReceipt, AppliedTweak, SnapshotStore, TweakAction, TweakPreview};
pub use metrics::PerfSnapshot;
pub use specs::SpecProfile;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub catalog_version: String,
    pub applied_tweak_ids: Vec<String>,
    pub spec: Option<SpecProfile>,
}

#[tauri::command]
fn bootstrap(state: tauri::State<'_, SnapshotStore>) -> Result<BootstrapPayload, String> {
    let applied = state.list_applied().map_err(|e| format!("{:#}", e))?;
    Ok(BootstrapPayload {
        catalog_version: "v0".into(),
        applied_tweak_ids: applied
            .into_iter()
            .filter(|a| a.status == "applied")
            .map(|a| a.tweak_id)
            .collect(),
        spec: None,
    })
}

#[tauri::command]
async fn detect_specs(_refresh: bool) -> Result<SpecProfile, String> {
    tokio::task::spawn_blocking(|| specs::detect().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("spec-detection task failed: {e}"))?
}

#[tauri::command]
async fn preview_tweak(action: TweakAction) -> Result<TweakPreview, String> {
    tokio::task::spawn_blocking(move || -> Result<TweakPreview, String> {
        let kind = action.kind().to_string();
        let requires_admin = action.requires_admin();
        let pre_state =
            engine::capture_pre_state(&action).map_err(|e| format!("{:#}", e))?;
        let summary = build_summary(&action, &pre_state);
        Ok(TweakPreview {
            kind,
            requires_admin,
            summary,
            pre_state,
        })
    })
    .await
    .map_err(|e| format!("preview task failed: {e}"))?
}

#[tauri::command]
async fn apply_tweak(
    state: tauri::State<'_, SnapshotStore>,
    tweak_id: String,
    action: TweakAction,
) -> Result<ApplyReceipt, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || -> Result<ApplyReceipt, String> {
        let pre_state = engine::apply(&action).map_err(|e| format!("{:#}", e))?;
        store
            .record_apply(&tweak_id, &action, &pre_state)
            .map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("apply task failed: {e}"))?
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchItem {
    tweak_id: String,
    action: TweakAction,
}

/// Phase 4c-v1: apply many actions with ONE UAC prompt (for HKLM-touching ones).
/// HKCU actions in the same batch run in-process before the elevated call.
/// Returns the list of receipts in submission order.
#[tauri::command]
async fn apply_batch(
    state: tauri::State<'_, SnapshotStore>,
    items: Vec<BatchItem>,
) -> Result<Vec<ApplyReceipt>, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<ApplyReceipt>, String> {
        // 1. Capture pre-states for ALL items first (read is unelevated where
        //    possible; bcdedit /enum is best-effort).
        let mut prepared: Vec<(BatchItem, serde_json::Value)> = Vec::with_capacity(items.len());
        for item in items.into_iter() {
            let pre = engine::capture_pre_state(&item.action)
                .map_err(|e| format!("{:#}", e))?;
            prepared.push((item, pre));
        }

        // 2. Apply unelevated items (HKCU registry, user-profile FileWrite) in-process now.
        // 3. Collect elevated items (HKLM, BcdeditSet, PS, admin-path FileWrite) into
        //    one batch for one UAC.
        let mut elevated_actions: Vec<&TweakAction> = Vec::new();
        for (item, _pre) in &prepared {
            if !item.action.requires_admin() {
                engine::apply_unelevated(&item.action).map_err(|e| format!("{:#}", e))?;
            } else {
                elevated_actions.push(&item.action);
            }
        }
        if !elevated_actions.is_empty() {
            engine::elevation::run_elevated_batch(&elevated_actions)
                .map_err(|e| format!("{:#}", e))?;
        }

        // 4. Record receipts in original order.
        let mut receipts = Vec::with_capacity(prepared.len());
        for (item, pre) in prepared {
            let r = store
                .record_apply(&item.tweak_id, &item.action, &pre)
                .map_err(|e| format!("{:#}", e))?;
            receipts.push(r);
        }
        Ok(receipts)
    })
    .await
    .map_err(|e| format!("apply_batch task failed: {e}"))?
}

#[tauri::command]
async fn revert_tweak(
    state: tauri::State<'_, SnapshotStore>,
    receipt_id: String,
) -> Result<(), String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let (action, pre_state) = store
            .get_receipt(&receipt_id)
            .map_err(|e| format!("{:#}", e))?
            .ok_or_else(|| format!("receipt {receipt_id} not found or already reverted"))?;
        engine::revert(&action, &pre_state).map_err(|e| format!("{:#}", e))?;
        store.mark_reverted(&receipt_id).map_err(|e| format!("{:#}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("revert task failed: {e}"))?
}

#[tauri::command]
fn list_applied(state: tauri::State<'_, SnapshotStore>) -> Result<Vec<AppliedTweak>, String> {
    state.list_applied().map_err(|e| format!("{:#}", e))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertAllReport {
    pub reverted: usize,
    pub failed_receipt_ids: Vec<String>,
    pub elevated_used: bool,
    pub total_active: usize,
}

/// Revert every applied tweak in newest-first order. HKCU registry reverts
/// run unelevated; everything privileged (HKLM, bcdedit, PowerShell) batches
/// into a single UAC prompt. Each successful revert is marked in the store.
#[tauri::command]
async fn revert_all_applied(
    state: tauri::State<'_, SnapshotStore>,
) -> Result<RevertAllReport, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || -> Result<RevertAllReport, String> {
        let applied = store.list_applied().map_err(|e| format!("{:#}", e))?;
        let active: Vec<&AppliedTweak> = applied.iter().filter(|a| a.status == "applied").collect();
        let total_active = active.len();
        if total_active == 0 {
            return Ok(RevertAllReport {
                reverted: 0,
                failed_receipt_ids: vec![],
                elevated_used: false,
                total_active: 0,
            });
        }

        // Load each (receipt_id, action, pre_state) triple.
        let mut loaded: Vec<(String, TweakAction, serde_json::Value)> = Vec::new();
        let mut failed: Vec<String> = Vec::new();
        for a in &active {
            match store.get_receipt(&a.receipt_id) {
                Ok(Some((action, pre))) => loaded.push((a.receipt_id.clone(), action, pre)),
                Ok(None) => failed.push(a.receipt_id.clone()),
                Err(_) => failed.push(a.receipt_id.clone()),
            }
        }

        // Split: unelevated (HKCU registry) vs elevated.
        let mut unelevated: Vec<(String, TweakAction, serde_json::Value)> = Vec::new();
        let mut elevated: Vec<(String, TweakAction, serde_json::Value)> = Vec::new();
        for triple in loaded {
            if triple.1.requires_admin() {
                elevated.push(triple);
            } else {
                unelevated.push(triple);
            }
        }

        let mut reverted = 0usize;

        // 1. Unelevated reverts run in-process, per-receipt for granular failure.
        for (rid, action, pre) in &unelevated {
            match engine::revert_unelevated(action, pre) {
                Ok(_) => {
                    let _ = store.mark_reverted(rid);
                    reverted += 1;
                }
                Err(_) => failed.push(rid.clone()),
            }
        }

        // 2. Elevated reverts batch into one UAC prompt.
        let elevated_used = !elevated.is_empty();
        if elevated_used {
            let pairs: Vec<(&TweakAction, &serde_json::Value)> =
                elevated.iter().map(|(_, a, p)| (a, p)).collect();
            match engine::elevation::run_elevated_revert_batch(&pairs) {
                Ok(_) => {
                    // Whole batch succeeded — mark each.
                    for (rid, _, _) in &elevated {
                        let _ = store.mark_reverted(rid);
                        reverted += 1;
                    }
                }
                Err(_) => {
                    // Batch failed — mark all elevated as failed.
                    for (rid, _, _) in &elevated {
                        failed.push(rid.clone());
                    }
                }
            }
        }

        Ok(RevertAllReport {
            reverted,
            failed_receipt_ids: failed,
            elevated_used,
            total_active,
        })
    })
    .await
    .map_err(|e| format!("revert_all task failed: {e}"))?
}

#[tauri::command]
fn system_metrics() -> PerfSnapshot {
    metrics::snapshot()
}

#[tauri::command]
async fn read_temps() -> Result<toolkit::ThermalSnapshot, String> {
    tokio::task::spawn_blocking(|| toolkit::read_temps().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("temps task failed: {e}"))?
}

#[tauri::command]
async fn disk_free() -> Result<Vec<toolkit::DiskFreeRow>, String> {
    tokio::task::spawn_blocking(|| toolkit::read_disk_free().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("disk_free task failed: {e}"))?
}

#[tauri::command]
fn launch_disk_cleanup() -> Result<(), String> {
    toolkit::launch_disk_cleanup().map_err(|e| format!("{:#}", e))
}

#[tauri::command]
fn launch_memtest() -> Result<(), String> {
    toolkit::launch_memtest().map_err(|e| format!("{:#}", e))
}

#[tauri::command]
async fn dpc_snapshot() -> Result<toolkit::DpcSnapshot, String> {
    tokio::task::spawn_blocking(|| toolkit::read_dpc_snapshot().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("dpc snapshot task failed: {e}"))?
}

#[tauri::command]
async fn ping_probe(targets: Vec<(String, String)>) -> Result<Vec<toolkit::PingResult>, String> {
    tokio::task::spawn_blocking(move || Ok(toolkit::run_ping_probes(targets)))
        .await
        .map_err(|e| format!("ping task failed: {e}"))?
}

#[tauri::command]
async fn bufferbloat_probe() -> Result<toolkit::BufferbloatReport, String> {
    tokio::task::spawn_blocking(toolkit::run_bufferbloat_probe)
        .await
        .map_err(|e| format!("bufferbloat task failed: {e}"))
}

#[tauri::command]
async fn onu_stick_metrics(url: String) -> Result<toolkit::OnuStickReport, String> {
    tokio::task::spawn_blocking(move || toolkit::fetch_onu_stick(&url))
        .await
        .map_err(|e| format!("onu task failed: {e}"))
}

#[tauri::command]
async fn live_thermals() -> Result<toolkit::LiveThermals, String> {
    tokio::task::spawn_blocking(toolkit::read_live_thermals)
        .await
        .map_err(|e| format!("thermals task failed: {e}"))
}

/// Resolves the bundled LHM script + DLL paths and runs the unelevated
/// sensor probe. Returns whatever the script produces — sensor coverage
/// without admin is partial (ACPI + GPU + SMART; no CPU package).
#[tauri::command]
async fn lhm_sensors(app: tauri::AppHandle) -> Result<toolkit::LhmReport, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let script = resource_dir.join("resources/lhm/read_sensors.ps1");
    let dll = resource_dir.join("resources/lhm/LibreHardwareMonitorLib.dll");
    let script_str = script.to_string_lossy().to_string();
    let dll_str = dll.to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || toolkit::probe_lhm_sensors(&script_str, &dll_str))
        .await
        .map_err(|e| format!("lhm task failed: {e}"))
}

// ── Auto-pin daemon commands ─────────────────────────────────────────

#[tauri::command]
async fn auto_pin_status() -> Result<auto_pin::AutoPinStatus, String> {
    Ok(auto_pin::get_status())
}

#[tauri::command]
async fn auto_pin_get_config() -> Result<auto_pin::AutoPinConfig, String> {
    Ok(auto_pin::get_config())
}

#[tauri::command]
async fn auto_pin_set_config(
    config: auto_pin::AutoPinConfig,
) -> Result<auto_pin::AutoPinConfig, String> {
    auto_pin::set_config(config).map_err(|e| format!("{:#}", e))
}

// ── CPU sets game-pinning commands ────────────────────────────────────

#[tauri::command]
async fn cpu_set_info() -> Result<cpusets::CpuSetInfo, String> {
    tokio::task::spawn_blocking(|| cpusets::cpu_set_info().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("cpu_set_info task failed: {e}"))?
}

#[tauri::command]
async fn cpu_pin_foreground(cores: Vec<u32>) -> Result<cpusets::PinReport, String> {
    tokio::task::spawn_blocking(move || cpusets::pin_foreground_to_cores(&cores).map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("cpu_pin_foreground task failed: {e}"))?
}

#[tauri::command]
async fn cpu_pin_pid(pid: u32, cores: Vec<u32>) -> Result<cpusets::PinReport, String> {
    tokio::task::spawn_blocking(move || cpusets::pin_pid_to_cores(pid, &cores).map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("cpu_pin_pid task failed: {e}"))?
}

#[tauri::command]
async fn cpu_clear_pin(pid: u32) -> Result<cpusets::PinReport, String> {
    tokio::task::spawn_blocking(move || cpusets::clear_pin(pid).map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("cpu_clear_pin task failed: {e}"))?
}

// ── Background standby memory cleaner commands ───────────────────────

#[tauri::command]
async fn standby_install(
    app: tauri::AppHandle,
    interval_minutes: u32,
) -> Result<standby::StandbyStatus, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let script = resource_dir.join("resources/scripts/clear_standby.ps1");
    let script_str = script.to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || -> Result<standby::StandbyStatus, String> {
        standby::install_task(&script_str, interval_minutes).map_err(|e| format!("{:#}", e))?;
        standby::status().map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("standby install task failed: {e}"))?
}

#[tauri::command]
async fn standby_uninstall() -> Result<standby::StandbyStatus, String> {
    tokio::task::spawn_blocking(|| -> Result<standby::StandbyStatus, String> {
        standby::uninstall_task().map_err(|e| format!("{:#}", e))?;
        standby::status().map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("standby uninstall task failed: {e}"))?
}

#[tauri::command]
async fn standby_run_now() -> Result<standby::StandbyStatus, String> {
    tokio::task::spawn_blocking(|| -> Result<standby::StandbyStatus, String> {
        standby::run_now().map_err(|e| format!("{:#}", e))?;
        // Brief beat so the log file gets the new line before we read it back.
        std::thread::sleep(std::time::Duration::from_millis(800));
        standby::status().map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("standby run-now task failed: {e}"))?
}

#[tauri::command]
async fn standby_status() -> Result<standby::StandbyStatus, String> {
    tokio::task::spawn_blocking(|| standby::status().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("standby status task failed: {e}"))?
}

#[tauri::command]
async fn standby_check_migration() -> Result<Option<standby::MigrationInfo>, String> {
    tokio::task::spawn_blocking(|| Ok(standby::check_migration_needed()))
        .await
        .map_err(|e| format!("standby migration check task failed: {e}"))?
}

/// Same probe but routed through the single-UAC elevation path so the
/// WinRing0 driver loads. Returns full sensor coverage (CPU package +
/// per-core + voltage rails) on success. Surfaces "driver failed to load"
/// when AV blocks WinRing0.
/// Returns the rig's stable HWID — SHA256(BIOS UUID + BIOS serial + CPU
/// brand). Surface to the Pricing page so users can copy + paste it to a
/// friend who's gifting them VIP.
#[tauri::command]
async fn vip_hwid() -> Result<String, String> {
    tokio::task::spawn_blocking(|| vip::compute_hwid().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("hwid task failed: {e}"))?
}

/// Validate a VIP redemption code against this rig's HWID. Returns true
/// only if the code was minted for this exact machine. Whitespace +
/// "MAXX-" prefix + lowercase tolerated.
#[tauri::command]
async fn vip_verify(code: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let hwid = vip::compute_hwid().map_err(|e| format!("{:#}", e))?;
        Ok::<bool, String>(vip::verify_code(&code, &hwid))
    })
    .await
    .map_err(|e| format!("vip task failed: {e}"))?
}

/// Online-claim path: POSTs the code to the Cloudflare Worker first-claim
/// ledger. Worker writes `claim:<code>` = `<hwid>` on success, returns
/// 409 if a different hwid already claimed. Idempotent re-redeem from
/// the same hwid succeeds.
/// Pre-tournament audit — recording apps + Game DVR + Windows Update +
/// Search Indexer service states. Composed with bench + ping + DPC on the
/// /asta page client-side.
#[tauri::command]
async fn ram_modules() -> Result<Vec<toolkit::RamModule>, String> {
    tokio::task::spawn_blocking(|| Ok(toolkit::read_ram_modules()))
        .await
        .map_err(|e| format!("ram task failed: {e}"))?
}

#[tauri::command]
async fn audit_state() -> Result<toolkit::AuditState, String> {
    tokio::task::spawn_blocking(toolkit::read_audit_state)
        .await
        .map_err(|e| format!("audit task failed: {e}"))
}

/// Asta Bench — CPU sha256 throughput, run on a worker thread so we don't
/// block the Tauri event loop. ~3-5 s on a modern CPU.
#[tauri::command]
async fn bench_cpu() -> Result<toolkit::CpuLatencySample, String> {
    tokio::task::spawn_blocking(toolkit::bench_cpu_latency)
        .await
        .map_err(|e| format!("cpu bench failed: {e}"))
}

/// Asta Bench — fires N pings to the given host, returns p50 + stddev.
/// ~10-15 s for default 50 samples.
#[tauri::command]
async fn bench_ping(host: String, count: u32) -> Result<toolkit::PingJitterSample, String> {
    tokio::task::spawn_blocking(move || toolkit::bench_ping_jitter(&host, count))
        .await
        .map_err(|e| format!("ping bench failed: {e}"))
}

#[tauri::command]
async fn vip_claim_online(code: String) -> Result<vip::ClaimResult, String> {
    tokio::task::spawn_blocking(move || {
        let hwid = vip::compute_hwid().map_err(|e| format!("{:#}", e))?;
        Ok::<vip::ClaimResult, String>(vip::claim_online(&code, &hwid))
    })
    .await
    .map_err(|e| format!("vip claim task failed: {e}"))?
}

#[tauri::command]
async fn lhm_sensors_elevated(app: tauri::AppHandle) -> Result<toolkit::LhmReport, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let script = resource_dir.join("resources/lhm/read_sensors.ps1");
    let dll = resource_dir.join("resources/lhm/LibreHardwareMonitorLib.dll");
    let script_str = script.to_string_lossy().to_string();
    let dll_str = dll.to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || {
        toolkit::probe_lhm_sensors_elevated(&script_str, &dll_str)
    })
    .await
    .map_err(|e| format!("lhm task failed: {e}"))
}

#[tauri::command]
async fn pcie_links() -> Result<Vec<toolkit::PcieLink>, String> {
    tokio::task::spawn_blocking(|| toolkit::read_pcie_links().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("pcie task failed: {e}"))?
}

#[tauri::command]
async fn microcode_report() -> Result<toolkit::MicrocodeReport, String> {
    tokio::task::spawn_blocking(|| toolkit::read_microcode_report().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("microcode task failed: {e}"))?
}

#[tauri::command]
async fn vbs_report() -> Result<toolkit::VbsReport, String> {
    tokio::task::spawn_blocking(|| toolkit::read_vbs_report().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("vbs task failed: {e}"))?
}

/// Closes the splash window and shows the main window. Called by the React
/// app from its first-mount useEffect. The 1200ms delay on the React side
/// guarantees the neon-ripple animation gets at least one full sweep before
/// the splash blinks out, even on fast hardware.
#[tauri::command]
async fn list_session_candidates() -> Result<Vec<toolkit::ProcessEntry>, String> {
    tokio::task::spawn_blocking(|| Ok(toolkit::list_session_candidates()))
        .await
        .map_err(|e| format!("session list task failed: {e}"))?
}

#[tauri::command]
async fn session_suspend(pids: Vec<u32>) -> Result<Vec<toolkit::SuspendResult>, String> {
    tokio::task::spawn_blocking(move || Ok(toolkit::session_suspend(pids)))
        .await
        .map_err(|e| format!("suspend task failed: {e}"))?
}

#[tauri::command]
async fn session_resume(pids: Vec<u32>) -> Result<Vec<toolkit::SuspendResult>, String> {
    tokio::task::spawn_blocking(move || Ok(toolkit::session_resume(pids)))
        .await
        .map_err(|e| format!("resume task failed: {e}"))?
}

#[tauri::command]
async fn close_splashscreen(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    Ok(())
}


fn build_summary(action: &TweakAction, pre_state: &serde_json::Value) -> String {
    match action {
        TweakAction::RegistrySet {
            hive,
            path,
            name,
            value,
            ..
        } => {
            let prior = if pre_state.is_null() {
                "(did not exist)".to_string()
            } else {
                pre_state
                    .get("value")
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "(unknown)".to_string())
            };
            format!(
                "Set {hive:?}\\{path}\\{name} = {value} (prior: {prior})",
                hive = hive,
            )
        }
        TweakAction::RegistryDelete { hive, path, name } => match name {
            Some(n) => format!("Delete {hive:?}\\{path}\\{n}", hive = hive),
            None => format!("Delete subkey {hive:?}\\{path}", hive = hive),
        },
        TweakAction::BcdeditSet { name, value } => {
            let prior = match pre_state.get("found") {
                Some(serde_json::Value::Bool(true)) => pre_state
                    .get("value")
                    .and_then(|v| v.as_str())
                    .unwrap_or("(unknown)")
                    .to_string(),
                Some(serde_json::Value::Bool(false)) => "(default)".to_string(),
                _ => "(unknown — needs admin to read)".to_string(),
            };
            format!("bcdedit /set {{current}} {name} {value} (prior: {prior})")
        }
        TweakAction::PowershellScript { apply, revert } => {
            let revertable = if revert.is_some() { "revertable" } else { "NOT revertable" };
            // First non-empty line as a teaser. Vetted catalog scripts only.
            let first_line = apply
                .lines()
                .map(str::trim)
                .find(|l| !l.is_empty() && !l.starts_with('#'))
                .unwrap_or("<empty>");
            format!("Run PowerShell ({revertable}): {}", &first_line[..first_line.len().min(120)])
        }
        TweakAction::FileWrite { path, contents_b64 } => {
            let existed = pre_state
                .get("existed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let prior = if existed {
                let prior_size = pre_state.get("size_bytes").and_then(|v| v.as_u64()).unwrap_or(0);
                format!("(prior: {prior_size} bytes — snapshot retained)")
            } else {
                "(prior: did not exist)".to_string()
            };
            // Approximate decoded byte length: every 4 base64 chars → 3 bytes (minus padding).
            let pad = contents_b64.bytes().rev().take_while(|&c| c == b'=').count();
            let new_size = (contents_b64.len() / 4) * 3 - pad;
            format!("Write {path} ({new_size} bytes) {prior}")
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_local_data_dir()
                .expect("app local data dir resolvable");
            // Wire the crash log dir + install the panic hook before any
            // command handler can run. Failures inside command handlers
            // unwind into the panic hook + land on disk.
            crash::set_crash_dir(dir.join("crashes"));
            crash::install_panic_hook();
            telemetry::set_settings_path(dir.join("telemetry.json"));
            // Auto-pin daemon: load persisted config + spawn the polling task.
            // Daemon ticks every config.poll_seconds; pins are no-op when
            // config.enabled is false.
            auto_pin::init(dir.join("auto-pin.json"));
            auto_pin::spawn_daemon();
            let store = SnapshotStore::open(&dir).expect("opening snapshot store");
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            detect_specs,
            preview_tweak,
            apply_tweak,
            apply_batch,
            revert_tweak,
            revert_all_applied,
            list_applied,
            system_metrics,
            read_temps,
            disk_free,
            launch_disk_cleanup,
            launch_memtest,
            dpc_snapshot,
            ping_probe,
            bufferbloat_probe,
            onu_stick_metrics,
            live_thermals,
            lhm_sensors,
            lhm_sensors_elevated,
            vip_hwid,
            vip_verify,
            vip_claim_online,
            bench_cpu,
            bench_ping,
            audit_state,
            ram_modules,
            pcie_links,
            microcode_report,
            vbs_report,
            list_session_candidates,
            session_suspend,
            session_resume,
            close_splashscreen,
            crash::crash_list,
            crash::crash_read,
            crash::crash_log_frontend,
            telemetry::telemetry_get,
            telemetry::telemetry_set,
            telemetry::telemetry_send_event,
            standby_install,
            standby_uninstall,
            standby_run_now,
            standby_status,
            standby_check_migration,
            cpu_set_info,
            cpu_pin_foreground,
            cpu_pin_pid,
            cpu_clear_pin,
            auto_pin_status,
            auto_pin_get_config,
            auto_pin_set_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
