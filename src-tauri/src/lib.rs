use serde::{Deserialize, Serialize};
use tauri::Manager;

mod auto_pin;
mod bios_audit;
mod cpusets;
mod crash;
mod drivers;
mod engine;
mod match_scan;
mod metrics;
mod network_audit;
mod nvpi;
mod process_helpers;
mod specs;
mod scewin;
mod standby;
mod telemetry;
mod toolkit;
mod tune_preflight;
mod vip;

pub use engine::{
    ApplyReceipt, AppliedTweak, SnapshotStore, TweakAction, TweakPreview, VerificationResult,
    VerificationStatus,
};
pub use metrics::PerfSnapshot;
pub use specs::SpecProfile;

const REBOOT_VALIDATION_KEY: &str = "reboot_validation";
const ASTA_INFLIGHT_KEY: &str = "asta_inflight";

/// True when the per-user startup launcher opened the app only to host the
/// runtime CPU-set watcher. The main window stays hidden in this mode.
#[derive(Debug, Clone, Copy)]
struct BackgroundMode(bool);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub catalog_version: String,
    pub applied_tweak_ids: Vec<String>,
    pub spec: Option<SpecProfile>,
}

/// Durable proof record for a user-requested reboot persistence check.
///
/// This is deliberately a verification record, not an auto-reapply policy:
/// reapplying a drifted setting can change user state without consent. The
/// exact receipt IDs are captured when the check is armed so later applies do
/// not silently get folded into an older proof result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebootValidation {
    /// idle | armed | awaiting_reboot | verified | mismatch | unknown
    pub status: String,
    pub armed_at: Option<String>,
    pub verified_at: Option<String>,
    pub before_uptime_secs: Option<u64>,
    pub after_uptime_secs: Option<u64>,
    pub before_os_build: Option<u32>,
    pub after_os_build: Option<u32>,
    pub receipt_ids: Vec<String>,
    pub checked: usize,
    pub verified: usize,
    pub mismatched: usize,
    pub unknown: usize,
    pub detail: String,
    pub items: Vec<RebootValidationItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebootValidationItem {
    pub receipt_id: String,
    pub tweak_id: String,
    pub status: VerificationStatus,
    pub detail: String,
    /// Set only when this individual action matched after the observed reboot.
    /// `None` is intentional for mismatch/unknown rows and for older saved
    /// reports that predate per-action timestamps.
    #[serde(default)]
    pub verified_at: Option<String>,
}

fn idle_reboot_validation() -> RebootValidation {
    RebootValidation {
        status: "idle".into(),
        armed_at: None,
        verified_at: None,
        before_uptime_secs: None,
        after_uptime_secs: None,
        before_os_build: None,
        after_os_build: None,
        receipt_ids: Vec::new(),
        checked: 0,
        verified: 0,
        mismatched: 0,
        unknown: 0,
        detail: "No reboot persistence check is armed.".into(),
        items: Vec::new(),
    }
}

fn load_reboot_validation(state: &SnapshotStore) -> Result<RebootValidation, String> {
    let Some(raw) = state
        .kv_get(REBOOT_VALIDATION_KEY)
        .map_err(|e| format!("{:#}", e))?
    else {
        return Ok(idle_reboot_validation());
    };
    serde_json::from_str(&raw)
        .map_err(|e| format!("saved reboot validation is unreadable: {e}"))
}

fn save_reboot_validation(
    state: &SnapshotStore,
    report: &RebootValidation,
) -> Result<(), String> {
    let raw = serde_json::to_string(report)
        .map_err(|e| format!("serializing reboot validation: {e}"))?;
    state
        .kv_set(REBOOT_VALIDATION_KEY, &raw)
        .map_err(|e| format!("{:#}", e))
}

fn current_uptime_secs() -> u64 {
    sysinfo::System::uptime()
}

fn reboot_was_observed(before_uptime_secs: u64, after_uptime_secs: u64) -> bool {
    // GetTickCount64/sysinfo uptime resets on a Windows restart. A lower
    // value is the conservative signal; an equal-or-higher value means the
    // requested reboot has not been proven yet.
    after_uptime_secs < before_uptime_secs
}

fn validate_reboot_report(state: &SnapshotStore) -> Result<RebootValidation, String> {
    let mut report = load_reboot_validation(state)?;
    if report.status == "idle" {
        return Ok(report);
    }

    // A completed report is immutable evidence for that armed receipt set.
    // The user can deliberately create a new proof run with Arm again.
    if report.verified_at.is_some()
        && matches!(report.status.as_str(), "verified" | "mismatch" | "unknown")
    {
        return Ok(report);
    }

    let Some(before_uptime_secs) = report.before_uptime_secs else {
        report.status = "unknown".into();
        report.detail =
            "The saved pre-reboot uptime marker is missing; arm a new check before restarting."
                .into();
        report.verified_at = Some(chrono::Utc::now().to_rfc3339());
        save_reboot_validation(state, &report)?;
        return Ok(report);
    };

    let after_uptime_secs = current_uptime_secs();
    if !reboot_was_observed(before_uptime_secs, after_uptime_secs) {
        report.status = "awaiting_reboot".into();
        report.after_uptime_secs = Some(after_uptime_secs);
        report.detail = format!(
            "No reboot proven yet. Before: {before_uptime_secs}s uptime; current: {after_uptime_secs}s. Restart Windows, then open optimizationmaxxing again."
        );
        save_reboot_validation(state, &report)?;
        return Ok(report);
    }

    let active = state
        .list_applied()
        .map_err(|e| format!("{:#}", e))?
        .into_iter()
        .filter(|row| row.status == "applied")
        .collect::<Vec<_>>();

    report.after_uptime_secs = Some(after_uptime_secs);
    report.after_os_build = current_os_build();
    let checked_at = chrono::Utc::now().to_rfc3339();
    report.verified_at = Some(checked_at.clone());
    report.items.clear();
    report.checked = report.receipt_ids.len();
    report.verified = 0;
    report.mismatched = 0;
    report.unknown = 0;

    let mut loaded = Vec::new();
    for receipt_id in report.receipt_ids.clone() {
        let Some(row) = active.iter().find(|row| row.receipt_id == receipt_id) else {
            report.mismatched += 1;
            report.items.push(RebootValidationItem {
                receipt_id: receipt_id.clone(),
                tweak_id: "(missing receipt)".into(),
                status: VerificationStatus::Mismatch,
                detail: "The armed receipt is no longer active, so this tweak cannot be proven persistent.".into(),
                verified_at: None,
            });
            continue;
        };

        let Some((action, _pre_state)) = state
            .get_receipt(&receipt_id)
            .map_err(|e| format!("{:#}", e))?
        else {
            report.mismatched += 1;
            report.items.push(RebootValidationItem {
                receipt_id: receipt_id.clone(),
                tweak_id: row.tweak_id.clone(),
                status: VerificationStatus::Mismatch,
                detail: "The armed receipt data is unavailable after reboot.".into(),
                verified_at: None,
            });
            continue;
        };

        loaded.push((receipt_id, row.tweak_id.clone(), action));
    }

    // The persistence check is an explicit user action after a real reboot,
    // so protected reads may use elevation here. Batch them into one helper
    // invocation instead of prompting once per receipt.
    let action_refs = loaded.iter().map(|(_, _, action)| action).collect::<Vec<_>>();
    let verifications = engine::verify_batch(&action_refs);
    for ((receipt_id, tweak_id, _action), verification) in loaded.into_iter().zip(verifications) {
        state
            .update_verification(&receipt_id, &verification)
            .map_err(|e| format!("{:#}", e))?;
        match verification.status {
            VerificationStatus::Verified => report.verified += 1,
            VerificationStatus::Mismatch => report.mismatched += 1,
            VerificationStatus::Unknown => report.unknown += 1,
        }
        report.items.push(RebootValidationItem {
            receipt_id,
            tweak_id,
            verified_at: (verification.status == VerificationStatus::Verified)
                .then(|| checked_at.clone()),
            status: verification.status,
            detail: verification.detail,
        });
    }

    report.status = if report.mismatched > 0 {
        "mismatch"
    } else if report.unknown > 0 {
        "unknown"
    } else {
        "verified"
    }
    .into();
    report.detail = match report.status.as_str() {
        "verified" => format!(
            "Windows rebooted and all {} armed tweak(s) matched their live read-back checks.",
            report.checked
        ),
        "mismatch" => format!(
            "Windows rebooted, but {} armed tweak(s) no longer match live state.",
            report.mismatched
        ),
        _ => format!(
            "Windows rebooted, but {} armed tweak(s) could not be proven with a read-back contract.",
            report.unknown
        ),
    };
    save_reboot_validation(state, &report)?;
    Ok(report)
}

#[cfg(test)]
mod reboot_validation_tests {
    use super::{reboot_was_observed, RebootValidationItem};
    use crate::engine::VerificationStatus;

    #[test]
    fn old_reboot_item_without_timestamp_still_loads() {
        let raw = r#"{
            "receiptId": "receipt-1",
            "tweakId": "power.test",
            "status": "verified",
            "detail": "matched"
        }"#;
        let item: RebootValidationItem = serde_json::from_str(raw).expect("legacy item parses");
        assert_eq!(item.status, VerificationStatus::Verified);
        assert!(item.verified_at.is_none());
    }

    #[test]
    fn only_a_lower_uptime_proves_a_reboot() {
        assert!(reboot_was_observed(86_400, 42));
        assert!(!reboot_was_observed(42, 86_400));
        assert!(!reboot_was_observed(42, 42));
    }
}

#[tauri::command]
fn get_reboot_validation(
    state: tauri::State<'_, SnapshotStore>,
) -> Result<RebootValidation, String> {
    load_reboot_validation(&state)
}

/// Capture a receipt set and current Windows uptime before a user restarts.
/// Asta passes the receipts created by its current run; the optional empty
/// selection keeps the standalone Reboot Persistence card's "arm active"
/// behavior for users who deliberately want to check every active receipt.
#[tauri::command]
fn arm_reboot_validation(
    state: tauri::State<'_, SnapshotStore>,
    receipt_ids: Option<Vec<String>>,
) -> Result<RebootValidation, String> {
    let active_rows = state
        .list_applied()
        .map_err(|e| format!("{:#}", e))?
        .into_iter()
        .filter(|row| row.status == "applied")
        .collect::<Vec<_>>();
    let active = match receipt_ids {
        Some(ids) => {
            let wanted = ids.into_iter().collect::<std::collections::HashSet<_>>();
            active_rows
                .into_iter()
                .filter(|row| wanted.contains(&row.receipt_id))
                .collect::<Vec<_>>()
        }
        None => active_rows,
    };
    if active.is_empty() {
        return Err("Apply at least one tweak before arming a reboot persistence check.".into());
    }
    let active_count = active.len();
    let receipt_ids = active
        .into_iter()
        .map(|row| row.receipt_id)
        .collect::<Vec<_>>();

    let report = RebootValidation {
        status: "armed".into(),
        armed_at: Some(chrono::Utc::now().to_rfc3339()),
        verified_at: None,
        before_uptime_secs: Some(current_uptime_secs()),
        after_uptime_secs: None,
        before_os_build: current_os_build(),
        after_os_build: None,
        receipt_ids,
        checked: 0,
        verified: 0,
        mismatched: 0,
        unknown: 0,
        detail: format!(
            "Armed {} receipt(s). Restart Windows, then open optimizationmaxxing to perform the post-boot read-back.",
            active_count
        ),
        items: Vec::new(),
    };
    save_reboot_validation(&state, &report)?;
    Ok(report)
}

/// Complete the second half of the persistence proof. The uptime marker
/// prevents an ordinary app reopen from being reported as a reboot.
#[tauri::command]
async fn validate_reboot_persistence(
    state: tauri::State<'_, SnapshotStore>,
) -> Result<RebootValidation, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || validate_reboot_report(&store))
        .await
        .map_err(|e| format!("reboot validation task failed: {e}"))?
}

#[tauri::command]
fn bootstrap(state: tauri::State<'_, SnapshotStore>) -> Result<BootstrapPayload, String> {
    let applied = state.list_applied().map_err(|e| format!("{:#}", e))?;
    Ok(BootstrapPayload {
        catalog_version: "v1.9.4".into(),
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
        // Preview is a read-only page operation. Do not launch an elevated
        // helper for every protected catalog row; ambiguous BCD state stays
        // explicit and the apply transaction owns the one real UAC boundary.
        let pre_state = engine::capture_pre_state(&action)
            .map_err(|e| format!("{:#}", e))?;
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

/// Run a catalog-declared read-only verifier before applying. This lets the
/// frontend recognize externally-managed settings that already match and
/// avoid rewriting them just to create an app receipt.
#[tauri::command]
async fn verify_action(action: TweakAction) -> Result<VerificationResult, String> {
    // Catalog audits and plan previews must never create a UAC loop. Apply
    // and the explicit reboot check use the batched elevated verifier instead.
    tokio::task::spawn_blocking(move || engine::verify_without_elevation(&action))
        .await
        .map_err(|e| format!("verify task failed: {e}"))
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
        let verification = engine::verify_with_elevation_fallback(&action);
        store
            .record_apply(&tweak_id, &action, &pre_state, &verification)
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionItemReport {
    pub tweak_id: String,
    pub action_kind: String,
    pub receipt_id: Option<String>,
    pub verification_status: Option<VerificationStatus>,
    pub detail: String,
    pub attempted: bool,
    pub applied: bool,
    pub rolled_back: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionReport {
    pub transaction_id: String,
    /// committed | failed | rolled_back | partial
    pub status: String,
    pub item_count: usize,
    pub attempted_count: usize,
    pub applied_count: usize,
    pub committed_count: usize,
    pub verified_count: usize,
    pub rolled_back_count: usize,
    pub errors: Vec<String>,
    pub rollback_errors: Vec<String>,
    pub items: Vec<TransactionItemReport>,
}

/// A transaction is deliberately narrower than the legacy batch path. An
/// action must have a deterministic inverse, and PowerShell must expose a
/// read-only verifier. This keeps an "automatic rollback" promise honest:
/// unknown scripts are still available through the explicit review flows, but
/// they cannot be hidden inside a supposedly atomic operation.
fn transaction_action_supported(action: &TweakAction) -> bool {
    match action {
        TweakAction::PowershellScript { revert, verify, .. } => {
            revert.is_some() && verify.is_some()
        }
        _ => true,
    }
}

struct TransactionState {
    item: BatchItem,
    pre_state: serde_json::Value,
    attempted: bool,
    applied: bool,
    rolled_back: bool,
    verification: Option<engine::VerificationResult>,
    receipt: Option<ApplyReceipt>,
    detail: String,
}

/// Internal state for the Asta-only combined lane. The verified lane uses the
/// same per-tweak rollback rules as `apply_repair_batch`; the explicit lane is
/// deliberately recorded and verified but is never rolled back automatically
/// by this command because its action contract may be incomplete.
struct AstaState {
    item: BatchItem,
    pre_state: serde_json::Value,
    prepared: bool,
    attempted: bool,
    applied: bool,
    rolled_back: bool,
    verification: Option<engine::VerificationResult>,
    receipt: Option<ApplyReceipt>,
    detail: String,
}

impl AstaState {
    fn prepared(item: BatchItem, pre_state: serde_json::Value) -> Self {
        Self {
            item,
            pre_state,
            prepared: true,
            attempted: false,
            applied: false,
            rolled_back: false,
            verification: None,
            receipt: None,
            detail: String::new(),
        }
    }

    fn skipped(item: BatchItem, detail: String) -> Self {
        Self {
            item,
            pre_state: serde_json::Value::Null,
            prepared: false,
            attempted: false,
            applied: false,
            rolled_back: false,
            verification: None,
            receipt: None,
            detail,
        }
    }

    fn into_transaction_state(self) -> TransactionState {
        TransactionState {
            item: self.item,
            pre_state: self.pre_state,
            attempted: self.attempted,
            applied: self.applied,
            rolled_back: self.rolled_back,
            verification: self.verification,
            receipt: self.receipt,
            detail: self.detail,
        }
    }
}

struct AstaGroup {
    states: Vec<AstaState>,
    failed: bool,
    errors: Vec<String>,
}

impl AstaGroup {
    fn new() -> Self {
        Self {
            states: Vec::new(),
            failed: false,
            errors: Vec::new(),
        }
    }

    fn fail(&mut self, message: String) {
        self.failed = true;
        self.errors.push(message);
    }
}

enum AstaVerifySlot {
    Transaction { group_index: usize, state_index: usize },
    Explicit { state_index: usize },
}

#[derive(Clone, Copy)]
enum AstaApplySlot {
    Transaction { group_index: usize, state_index: usize },
    Explicit { state_index: usize },
}

/// Apply a bounded set of reversible, verifiable actions as one transaction.
///
/// This is separate from `apply_batch` on purpose. Existing callers depend on
/// batch semantics that keep going after an individual failure. New closed-
/// loop flows can opt into this stronger contract without changing the old
/// UI's error/retry behavior under an already-shipped build.
#[tauri::command]
async fn apply_transaction(
    state: tauri::State<'_, SnapshotStore>,
    items: Vec<BatchItem>,
) -> Result<TransactionReport, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || -> Result<TransactionReport, String> {
        let transaction_id = format!(
            "txn-{}-{}",
            chrono::Utc::now().timestamp_millis(),
            std::process::id()
        );
        let item_count = items.len();
        let mut errors = Vec::new();
        let mut rollback_errors = Vec::new();
        let mut states = Vec::with_capacity(item_count);

        // Capture every pre-state before the first mutation. A failed capture
        // means no transaction is started, so the caller never gets a partial
        // "best effort" apply without a rollback reference. Protected BCD
        // reads are batched so several ambiguous rows share one consent.
        let action_refs = items.iter().map(|item| &item.action).collect::<Vec<_>>();
        let pre_states = engine::capture_pre_states_with_elevation_fallback(&action_refs);
        for (item, pre_result) in items.into_iter().zip(pre_states) {
            if !transaction_action_supported(&item.action) {
                errors.push(format!(
                    "{} ({}) has no verified transaction contract; use the explicit review flow.",
                    item.tweak_id,
                    item.action.kind()
                ));
                continue;
            }
            match pre_result {
                Ok(pre_state) => states.push(TransactionState {
                    item,
                    pre_state,
                    attempted: false,
                    applied: false,
                    rolled_back: false,
                    verification: None,
                    receipt: None,
                    detail: String::new(),
                }),
                Err(e) => errors.push(format!(
                    "{} pre-state capture failed: {:#}",
                    item.tweak_id, e
                )),
            }
        }

        // If any input is unsupported or cannot be snapshotted, do not mutate
        // the subset that happened to pass. This is the all-or-nothing input
        // gate before the mutation phase.
        if !errors.is_empty() {
            let report = transaction_report(
                transaction_id,
                "failed",
                states,
                errors,
                rollback_errors,
            );
            let _ = store.kv_set(
                "last_transaction",
                &serde_json::to_string(&report).unwrap_or_default(),
            );
            return Ok(report);
        }

        // Apply non-admin actions one at a time so a failing action never
        // prevents us from knowing exactly which earlier actions need undoing.
        for state in &mut states {
            if state.item.action.requires_admin() {
                continue;
            }
            state.attempted = true;
            match engine::apply_unelevated(&state.item.action) {
                Ok(_) => {
                    state.applied = true;
                    state.detail = "Applied in-process; awaiting live verification.".into();
                }
                Err(e) => {
                    state.detail = format!("Apply failed: {:#}", e);
                    errors.push(format!("{}: {}", state.item.tweak_id, state.detail));
                    break;
                }
            }
        }

        // The elevated runner is per-line, so a non-zero result can mean a
        // partial mutation. Mark every line as attempted and recover all of
        // them from their captured pre-state if the runner reports an error.
        let elevated_indices = states
            .iter()
            .enumerate()
            .filter_map(|(index, state)| state.item.action.requires_admin().then_some(index))
            .collect::<Vec<_>>();
        if errors.is_empty() && !elevated_indices.is_empty() {
            for index in &elevated_indices {
                states[*index].attempted = true;
            }
            let actions = elevated_indices
                .iter()
                .map(|index| &states[*index].item.action)
                .collect::<Vec<_>>();
            let create_rp = store
                .kv_get("restore_point_before_apply")
                .ok()
                .flatten()
                .map(|v| v != "false")
                .unwrap_or(true);
            match engine::elevation::run_elevated_batch_with_restore_point(&actions, create_rp) {
                Ok(_) => {
                    for index in elevated_indices {
                        states[index].applied = true;
                        states[index].detail =
                            "Applied under one UAC prompt; awaiting live verification.".into();
                    }
                }
                Err(e) => errors.push(format!("elevated transaction batch: {:#}", e)),
            }
        }

        // Read back every mutation, including an elevated batch that returned
        // an error. The latter is important: it tells recovery whether the
        // line appears to have landed despite the aggregate command failure.
        let verification_indices = states
            .iter()
            .enumerate()
            .filter_map(|(index, state)| state.attempted.then_some(index))
            .collect::<Vec<_>>();
        let verification_actions = verification_indices
            .iter()
            .map(|index| &states[*index].item.action)
            .collect::<Vec<_>>();
        let verifications = engine::verify_batch(&verification_actions);
        for (index, verification) in verification_indices.into_iter().zip(verifications) {
            let state = &mut states[index];
            if errors.is_empty() && verification.status != VerificationStatus::Verified {
                errors.push(format!(
                    "{} verification {:?}: {}",
                    state.item.tweak_id,
                    verification.status,
                    verification.detail
                ));
            }
            state.verification = Some(verification);
        }

        // Record a durable receipt for known-successful actions. If an
        // elevated batch failed, retain receipts for its attempted lines so
        // the rollback/read-back state is visible in Diff instead of vanishing
        // behind a transient UAC error.
        for state in &mut states {
            let should_record = state.applied
                || (state.attempted && state.item.action.requires_admin() && !errors.is_empty());
            if !should_record {
                continue;
            }
            let verification = state.verification.clone().unwrap_or(engine::VerificationResult {
                status: VerificationStatus::Unknown,
                detail: "The action was attempted but no live verification was available.".into(),
            });
            match store.record_apply(
                &state.item.tweak_id,
                &state.item.action,
                &state.pre_state,
                &verification,
            ) {
                Ok(receipt) => state.receipt = Some(receipt),
                Err(e) => errors.push(format!(
                    "{} receipt could not be saved: {:#}",
                    state.item.tweak_id, e
                )),
            }
        }

        if !errors.is_empty() {
            // Restore unelevated actions individually in reverse order.
            for index in (0..states.len()).rev() {
                let state = &mut states[index];
                if !state.attempted || state.item.action.requires_admin() {
                    continue;
                }
                match engine::revert_unelevated(&state.item.action, &state.pre_state) {
                    Ok(_) => {
                        state.rolled_back = true;
                        if let Some(receipt) = &state.receipt {
                            let _ = store.mark_reverted(&receipt.receipt_id);
                        }
                    }
                    Err(e) => rollback_errors.push(format!(
                        "{} rollback failed: {:#}",
                        state.item.tweak_id, e
                    )),
                }
            }

            // Restore any elevated line that may have landed in one UAC call.
            let elevated_pairs = states
                .iter()
                .rev()
                .filter(|state| state.attempted && state.item.action.requires_admin())
                .map(|state| (&state.item.action, &state.pre_state))
                .collect::<Vec<_>>();
            if !elevated_pairs.is_empty() {
                match engine::elevation::run_elevated_revert_batch(&elevated_pairs) {
                    Ok(_) => {
                        for state in &mut states {
                            if state.attempted && state.item.action.requires_admin() {
                                state.rolled_back = true;
                                if let Some(receipt) = &state.receipt {
                                    let _ = store.mark_reverted(&receipt.receipt_id);
                                }
                            }
                        }
                    }
                    Err(e) => rollback_errors.push(format!("elevated rollback failed: {:#}", e)),
                }
            }
        }

        let status = if errors.is_empty() {
            if let Some(build) = current_os_build() {
                let _ = store.kv_set("last_applied_build", &build.to_string());
            }
            "committed"
        } else if rollback_errors.is_empty() {
            "rolled_back"
        } else {
            "partial"
        };
        let report = transaction_report(
            transaction_id,
            status,
            states,
            errors,
            rollback_errors,
        );
        let _ = store.kv_set(
            "last_transaction",
            &serde_json::to_string(&report).unwrap_or_default(),
        );
        Ok(report)
    })
    .await
    .map_err(|e| format!("transaction task failed: {e}"))?
}

fn transaction_report(
    transaction_id: String,
    status: &str,
    states: Vec<TransactionState>,
    errors: Vec<String>,
    rollback_errors: Vec<String>,
) -> TransactionReport {
    let items = states
        .into_iter()
        .map(|state| {
            let verification_status = state
                .verification
                .as_ref()
                .map(|verification| verification.status.clone());
            let detail = if state.rolled_back {
                let reason = state.detail.trim();
                if reason.is_empty()
                    || reason.starts_with("Applied in-process")
                    || reason.starts_with("Applied under one UAC prompt")
                {
                    "The action was reverted to its captured pre-state.".to_string()
                } else {
                    format!(
                        "{} The action was reverted to its captured pre-state.",
                        reason
                    )
                }
            } else if !state.detail.is_empty() {
                state.detail
            } else if !state.attempted {
                "Not attempted.".to_string()
            } else {
                "No final transaction detail was recorded.".to_string()
            };
            TransactionItemReport {
                tweak_id: state.item.tweak_id,
                action_kind: state.item.action.kind().to_string(),
                receipt_id: state.receipt.map(|receipt| receipt.receipt_id),
                verification_status,
                detail,
                attempted: state.attempted,
                applied: state.applied,
                rolled_back: state.rolled_back,
            }
        })
        .collect::<Vec<_>>();
    let attempted_count = items.iter().filter(|item| item.attempted).count();
    let applied_count = items.iter().filter(|item| item.applied).count();
    let committed_count = items
        .iter()
        .filter(|item| item.applied && !item.rolled_back)
        .count();
    let verified_count = items
        .iter()
        .filter(|item| item.verification_status == Some(VerificationStatus::Verified))
        .count();
    let rolled_back_count = items.iter().filter(|item| item.rolled_back).count();
    TransactionReport {
        transaction_id,
        status: status.to_string(),
        item_count: items.len(),
        attempted_count,
        applied_count,
        committed_count,
        verified_count,
        rolled_back_count,
        errors,
        rollback_errors,
        items,
    }
}

struct RepairGroup {
    states: Vec<TransactionState>,
    failed: bool,
    errors: Vec<String>,
}

impl RepairGroup {
    fn new() -> Self {
        Self {
            states: Vec::new(),
            failed: false,
            errors: Vec::new(),
        }
    }

    fn fail(&mut self, message: String) {
        self.failed = true;
        self.errors.push(message);
    }
}

/// Re-apply drifted tweaks without letting one stale or externally-owned
/// setting undo unrelated repairs. Actions are grouped by tweak id so a
/// multi-action tweak remains atomic, while independent tweaks can survive a
/// verification mismatch in another group.
#[tauri::command]
async fn apply_repair_batch(
    state: tauri::State<'_, SnapshotStore>,
    items: Vec<BatchItem>,
) -> Result<TransactionReport, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || -> Result<TransactionReport, String> {
        let transaction_id = format!(
            "repair-{}-{}",
            chrono::Utc::now().timestamp_millis(),
            std::process::id()
        );
        let mut groups: Vec<RepairGroup> = Vec::new();

        // Capture each action before mutating anything. A failed capture marks
        // only that tweak group as unavailable; unrelated groups can still be
        // repaired with their own pre-state. Protected BCD reads are batched
        // across the whole repair plan so preflight does not prompt once per
        // ambiguous action.
        let action_refs = items.iter().map(|item| &item.action).collect::<Vec<_>>();
        let pre_states = engine::capture_pre_states_with_elevation_fallback(&action_refs);
        for (item, pre_result) in items.into_iter().zip(pre_states) {
            let group_index = groups
                .iter()
                .position(|group| {
                    group
                        .states
                        .first()
                        .map(|state| state.item.tweak_id == item.tweak_id)
                        .unwrap_or(false)
                })
                .unwrap_or_else(|| {
                    groups.push(RepairGroup::new());
                    groups.len() - 1
                });
            let group = &mut groups[group_index];

            if group.failed {
                group.states.push(TransactionState {
                    item,
                    pre_state: serde_json::Value::Null,
                    attempted: false,
                    applied: false,
                    rolled_back: false,
                    verification: None,
                    receipt: None,
                    detail: "Skipped because another action in this tweak group could not be prepared."
                        .into(),
                });
                continue;
            }

            if !transaction_action_supported(&item.action) {
                let message = format!(
                    "{} ({}) has no verified repair contract; use the explicit review flow.",
                    item.tweak_id,
                    item.action.kind()
                );
                group.states.push(TransactionState {
                    item,
                    pre_state: serde_json::Value::Null,
                    attempted: false,
                    applied: false,
                    rolled_back: false,
                    verification: None,
                    receipt: None,
                    detail: message.clone(),
                });
                group.fail(message);
                continue;
            }

            let tweak_id = item.tweak_id.clone();
            match pre_result {
                Ok(pre_state) if engine::pre_state_is_ambiguous(&item.action, &pre_state) => {
                    let detail = pre_state
                        .get("detail")
                        .and_then(|value| value.as_str())
                        .unwrap_or("the protected BCD read-back remained ambiguous");
                    let message = format!(
                        "{} pre-state remained ambiguous after the elevated read-back; no write was attempted. {}",
                        tweak_id, detail
                    );
                    group.states.push(TransactionState {
                        item,
                        pre_state,
                        attempted: false,
                        applied: false,
                        rolled_back: false,
                        verification: None,
                        receipt: None,
                        detail: message.clone(),
                    });
                    group.fail(message);
                }
                Ok(pre_state) => group.states.push(TransactionState {
                    item,
                    pre_state,
                    attempted: false,
                    applied: false,
                    rolled_back: false,
                    verification: None,
                    receipt: None,
                    detail: String::new(),
                }),
                Err(error) => {
                    let message = format!("{} pre-state capture failed: {:#}", tweak_id, error);
                    group.states.push(TransactionState {
                        item,
                        pre_state: serde_json::Value::Null,
                        attempted: false,
                        applied: false,
                        rolled_back: false,
                        verification: None,
                        receipt: None,
                        detail: message.clone(),
                    });
                    group.fail(message);
                }
            }
        }

        // Apply unelevated actions group by group. A failure poisons only its
        // own tweak group; later groups still get their chance to repair.
        for group in &mut groups {
            if group.failed {
                continue;
            }
            let mut failures = Vec::new();
            for state in &mut group.states {
                if state.item.action.requires_admin() {
                    continue;
                }
                state.attempted = true;
                match engine::apply_unelevated(&state.item.action) {
                    Ok(_) => {
                        state.applied = true;
                        state.detail = "Applied in-process; awaiting live verification.".into();
                    }
                    Err(error) => {
                        state.detail = format!("Apply failed: {:#}", error);
                        failures.push(format!("{}: {}", state.item.tweak_id, state.detail));
                        break;
                    }
                }
            }
            for failure in failures {
                group.fail(failure);
            }
        }

        // Keep one UAC prompt for all elevated actions that made it through
        // their group's local apply phase. The runner may report an aggregate
        // error, so live verification below remains the source of truth for
        // each individual action.
        let elevated_indices = groups
            .iter()
            .enumerate()
            .flat_map(|(group_index, group)| {
                group
                    .states
                    .iter()
                    .enumerate()
                    .filter_map(move |(state_index, state)| {
                        (!group.failed && state.item.action.requires_admin())
                            .then_some((group_index, state_index))
                    })
            })
            .collect::<Vec<_>>();
        for (group_index, state_index) in &elevated_indices {
            groups[*group_index].states[*state_index].attempted = true;
        }
        let elevated_error = if elevated_indices.is_empty() {
            None
        } else {
            let actions = elevated_indices
                .iter()
                .map(|(group_index, state_index)| {
                    &groups[*group_index].states[*state_index].item.action
                })
                .collect::<Vec<_>>();
            let create_rp = store
                .kv_get("restore_point_before_apply")
                .ok()
                .flatten()
                .map(|value| value != "false")
                .unwrap_or(true);
            match engine::elevation::run_elevated_batch_with_restore_point(&actions, create_rp) {
                Ok(_) => {
                    for (group_index, state_index) in &elevated_indices {
                        let state = &mut groups[*group_index].states[*state_index];
                        state.applied = true;
                        state.detail =
                            "Applied under one UAC prompt; awaiting live verification.".into();
                    }
                    None
                }
                Err(error) => Some(format!("elevated repair batch: {:#}", error)),
            }
        };

        // Verify every action that was attempted in one read-back batch. A
        // mismatch or unknown result fails only its containing tweak group;
        // protected reads share one elevated retry instead of opening one UAC
        // prompt per action.
        let verification_indices = groups
            .iter()
            .enumerate()
            .flat_map(|(group_index, group)| {
                group
                    .states
                    .iter()
                    .enumerate()
                    .filter_map(move |(state_index, state)| {
                        state
                            .attempted
                            .then_some((group_index, state_index))
                    })
            })
            .collect::<Vec<_>>();
        let verification_actions = verification_indices
            .iter()
            .map(|(group_index, state_index)| {
                &groups[*group_index].states[*state_index].item.action
            })
            .collect::<Vec<_>>();
        let verifications = engine::verify_batch(&verification_actions);
        for ((group_index, state_index), verification) in
            verification_indices.into_iter().zip(verifications)
        {
            let state = &mut groups[group_index].states[state_index];
            if verification.status == VerificationStatus::Verified {
                state.applied = true;
                state.detail = "Applied and verified in the live system.".into();
            } else {
                state.detail = format!("Live verification failed: {}", verification.detail);
            }
            state.verification = Some(verification);
        }
        for group in &mut groups {
            let failures = group
                .states
                .iter()
                .filter(|state| {
                    state.attempted
                        && state
                            .verification
                            .as_ref()
                            .map(|verification| verification.status != VerificationStatus::Verified)
                            .unwrap_or(true)
                })
                .map(|state| {
                    let verification = state.verification.as_ref().expect("checked above");
                    format!(
                        "{} verification {:?}: {}",
                        state.item.tweak_id, verification.status, verification.detail
                    )
                })
                .collect::<Vec<_>>();
            for failure in failures {
                group.fail(failure);
            }
        }

        // The native elevated runner reports one aggregate error for a shell
        // that may contain several lines. If every line independently verified
        // successfully, retain the live result instead of rolling back good
        // tweaks because an unrelated line was rejected. If a group failed,
        // preserve the aggregate diagnostic alongside its specific mismatch.
        if let Some(error) = elevated_error {
            if groups.iter().any(|group| group.failed) {
                if let Some(group) = groups.iter_mut().find(|group| group.failed) {
                    group.fail(error);
                }
            }
        }

        // Record attempted actions, including failed groups, so Diff has a
        // durable audit trail and selective rollback can mark those receipts.
        for group in &mut groups {
            let mut failures = Vec::new();
            for state in &mut group.states {
                if !state.attempted {
                    continue;
                }
                let verification = state.verification.clone().unwrap_or(engine::VerificationResult {
                    status: VerificationStatus::Unknown,
                    detail: "The action was attempted but no live verification was available."
                        .into(),
                });
                match store.record_apply(
                    &state.item.tweak_id,
                    &state.item.action,
                    &state.pre_state,
                    &verification,
                ) {
                    Ok(receipt) => state.receipt = Some(receipt),
                    Err(error) => failures.push(format!(
                        "{} receipt could not be saved: {:#}",
                        state.item.tweak_id, error
                    )),
                }
            }
            for failure in failures {
                group.fail(failure);
            }
        }

        let mut rollback_errors = Vec::new();
        // Restore only failed unelevated groups. Verified independent groups
        // stay in place and do not get caught in a broad rollback.
        for group in groups.iter_mut().rev() {
            if !group.failed {
                continue;
            }
            for state in group.states.iter_mut().rev() {
                if !state.attempted || state.item.action.requires_admin() {
                    continue;
                }
                match engine::revert_unelevated(&state.item.action, &state.pre_state) {
                    Ok(_) => {
                        state.rolled_back = true;
                        if let Some(receipt) = &state.receipt {
                            let _ = store.mark_reverted(&receipt.receipt_id);
                        }
                    }
                    Err(error) => rollback_errors.push(format!(
                        "{} rollback failed: {:#}",
                        state.item.tweak_id, error
                    )),
                }
            }
        }

        let elevated_revert_pairs = groups
            .iter()
            .rev()
            .filter(|group| group.failed)
            .flat_map(|group| {
                group
                    .states
                    .iter()
                    .rev()
                    .filter(|state| state.attempted && state.item.action.requires_admin())
                    .map(|state| (&state.item.action, &state.pre_state))
            })
            .collect::<Vec<_>>();
        if !elevated_revert_pairs.is_empty() {
            match engine::elevation::run_elevated_revert_batch(&elevated_revert_pairs) {
                Ok(_) => {
                    for group in &mut groups {
                        if !group.failed {
                            continue;
                        }
                        for state in &mut group.states {
                            if state.attempted && state.item.action.requires_admin() {
                                state.rolled_back = true;
                                if let Some(receipt) = &state.receipt {
                                    let _ = store.mark_reverted(&receipt.receipt_id);
                                }
                            }
                        }
                    }
                }
                Err(error) => rollback_errors.push(format!("elevated repair rollback failed: {:#}", error)),
            }
        }

        let mut errors = groups
            .iter()
            .flat_map(|group| group.errors.iter().cloned())
            .collect::<Vec<_>>();
        let successful_groups = groups.iter().filter(|group| !group.failed).count();
        let failed_groups = groups.iter().filter(|group| group.failed).count();
        let status = if failed_groups == 0 {
            if let Some(build) = current_os_build() {
                let _ = store.kv_set("last_applied_build", &build.to_string());
            }
            "committed"
        } else if successful_groups > 0 && rollback_errors.is_empty() {
            "partial"
        } else if rollback_errors.is_empty() {
            "rolled_back"
        } else {
            "partial"
        };
        if successful_groups > 0 && failed_groups > 0 {
            errors.insert(
                0,
                format!(
                    "{} independent tweak group(s) verified; {} group(s) stayed rolled back.",
                    successful_groups, failed_groups
                ),
            );
        }
        let states = groups
            .into_iter()
            .flat_map(|group| group.states)
            .collect::<Vec<_>>();
        let report = transaction_report(
            transaction_id,
            status,
            states,
            errors,
            rollback_errors,
        );
        let _ = store.kv_set(
            "last_transaction",
            &serde_json::to_string(&report).unwrap_or_default(),
        );
        Ok(report)
    })
    .await
    .map_err(|e| format!("repair transaction task failed: {e}"))?
}

/// Apply Asta's verified and explicit lanes through one shared elevation
/// boundary. The verified lane keeps per-tweak selective rollback; explicit
/// actions are still read back and recorded but are never silently rolled back
/// by this command when their contract is incomplete.
#[tauri::command]
async fn apply_asta_batch(
    state: tauri::State<'_, SnapshotStore>,
    transactional: Vec<BatchItem>,
    explicit: Vec<BatchItem>,
) -> Result<TransactionReport, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || -> Result<TransactionReport, String> {
        let transaction_id = format!(
            "asta-{}-{}",
            chrono::Utc::now().timestamp_millis(),
            std::process::id()
        );
        let mut all_items: Vec<(bool, BatchItem)> = transactional
            .into_iter()
            .map(|item| (true, item))
            .collect();
        all_items.extend(explicit.into_iter().map(|item| (false, item)));

        // Leave a durable breadcrumb before the first protected read or
        // mutation. If the process is killed or Windows interrupts the batch,
        // the next Asta open can ask the user to reconcile live state instead
        // of assuming that an absent final receipt means nothing happened.
        let inflight_marker = serde_json::json!({
            "status": "in_flight",
            "transactionId": transaction_id.clone(),
            "startedAt": chrono::Utc::now().to_rfc3339(),
            "actionCount": all_items.len(),
        });
        let inflight_write_error = store
            .kv_set(ASTA_INFLIGHT_KEY, &inflight_marker.to_string())
            .err()
            .map(|error| format!("could not persist the Asta interruption marker: {error:#}"));

        let action_refs = all_items
            .iter()
            .map(|(_, item)| &item.action)
            .collect::<Vec<_>>();
        let pre_states = engine::capture_pre_states_with_elevation_fallback(&action_refs);

        let mut groups: Vec<AstaGroup> = Vec::new();
        let mut explicit_states: Vec<AstaState> = Vec::new();
        let mut errors = Vec::new();
        if let Some(error) = inflight_write_error {
            errors.push(error);
        }

        // Capture every pre-state before the first mutation. Asta can then
        // safely share one elevated apply call without losing a restore point
        // for either lane.
        for ((is_transactional, item), pre_result) in all_items.into_iter().zip(pre_states) {
            if is_transactional {
                let tweak_id = item.tweak_id.clone();
                let group_index = groups
                    .iter()
                    .position(|group| {
                        group
                            .states
                            .first()
                            .map(|state| state.item.tweak_id == tweak_id)
                            .unwrap_or(false)
                    })
                    .unwrap_or_else(|| {
                        groups.push(AstaGroup::new());
                        groups.len() - 1
                    });
                let group = &mut groups[group_index];

                if group.failed {
                    group.states.push(AstaState::skipped(
                        item,
                        "Skipped because another action in this tweak group could not be prepared."
                            .into(),
                    ));
                    continue;
                }
                if !transaction_action_supported(&item.action) {
                    let message = format!(
                        "{} ({}) has no verified Asta transaction contract; use the explicit review flow.",
                        item.tweak_id,
                        item.action.kind()
                    );
                    group.states.push(AstaState::skipped(item, message.clone()));
                    group.fail(message);
                    continue;
                }

                match pre_result {
                    Ok(pre_state) if engine::pre_state_is_ambiguous(&item.action, &pre_state) => {
                        let detail = pre_state
                            .get("detail")
                            .and_then(|value| value.as_str())
                            .unwrap_or("the protected read-back remained ambiguous");
                        let message = format!(
                            "{} pre-state remained ambiguous after the elevated read-back; no write was attempted. {}",
                            tweak_id, detail
                        );
                        group.states.push(AstaState::skipped(item, message.clone()));
                        group.fail(message);
                    }
                    Ok(pre_state) => group.states.push(AstaState::prepared(item, pre_state)),
                    Err(error) => {
                        let message = format!(
                            "{} pre-state capture failed: {:#}",
                            tweak_id, error
                        );
                        group.states.push(AstaState::skipped(item, message.clone()));
                        group.fail(message);
                    }
                }
            } else {
                match pre_result {
                    Ok(pre_state) if engine::pre_state_is_ambiguous(&item.action, &pre_state) => {
                        let detail = pre_state
                            .get("detail")
                            .and_then(|value| value.as_str())
                            .unwrap_or("the protected read-back remained ambiguous");
                        let message = format!(
                            "{} pre-state remained ambiguous after the elevated read-back; no write was attempted. {}",
                            item.tweak_id, detail
                        );
                        errors.push(message.clone());
                        explicit_states.push(AstaState::skipped(item, message));
                    }
                    Ok(pre_state) => explicit_states.push(AstaState::prepared(item, pre_state)),
                    Err(error) => {
                        let message = format!(
                            "{} pre-state capture failed: {:#}",
                            item.tweak_id, error
                        );
                        errors.push(message.clone());
                        explicit_states.push(AstaState::skipped(item, message));
                    }
                }
            }
        }

        // Verified groups preserve the repair lane's isolation: one local
        // failure poisons only that tweak group. Explicit actions keep going
        // independently and retain their own receipts for manual review.
        for group in &mut groups {
            if group.failed {
                continue;
            }
            let mut apply_failure = None;
            for state in &mut group.states {
                if !state.prepared || state.item.action.requires_admin() {
                    continue;
                }
                state.attempted = true;
                match engine::apply_unelevated(&state.item.action) {
                    Ok(_) => {
                        state.applied = true;
                        state.detail = "Applied in-process; awaiting live verification.".into();
                    }
                    Err(error) => {
                        state.detail = format!("Apply failed: {:#}", error);
                        apply_failure = Some(format!("{}: {}", state.item.tweak_id, state.detail));
                        break;
                    }
                }
            }
            if let Some(failure) = apply_failure {
                group.fail(failure);
            }
        }
        for state in &mut explicit_states {
            if !state.prepared || state.item.action.requires_admin() {
                continue;
            }
            state.attempted = true;
            match engine::apply_unelevated(&state.item.action) {
                Ok(_) => {
                    state.applied = true;
                    state.detail = "Applied in-process; awaiting live verification.".into();
                }
                Err(error) => {
                    state.detail = format!("Apply failed: {:#}", error);
                    errors.push(format!("{}: {}", state.item.tweak_id, state.detail));
                }
            }
        }

        // All elevated actions from both lanes now share one UAC prompt. Mark
        // the selected states before borrowing their actions for the batch;
        // the action-to-command mapping below then remains immutable until
        // the elevated helper has returned.
        for group in &mut groups {
            if group.failed {
                continue;
            }
            for state in &mut group.states {
                if state.prepared && state.item.action.requires_admin() {
                    state.attempted = true;
                }
            }
        }
        for state in &mut explicit_states {
            if state.prepared && state.item.action.requires_admin() {
                state.attempted = true;
            }
        }

        // Keep the action-to-command mapping so one rejected NIC/PowerShell
        // line cannot be reported as though every line failed.
        let mut elevated_actions: Vec<&TweakAction> = Vec::new();
        let mut elevated_slots: Vec<AstaApplySlot> = Vec::new();
        for (group_index, group) in groups.iter().enumerate() {
            if group.failed {
                continue;
            }
            for (state_index, state) in group.states.iter().enumerate() {
                if state.prepared && state.item.action.requires_admin() {
                    elevated_actions.push(&state.item.action);
                    elevated_slots.push(AstaApplySlot::Transaction {
                        group_index,
                        state_index,
                    });
                }
            }
        }
        for (state_index, state) in explicit_states.iter().enumerate() {
            if state.prepared && state.item.action.requires_admin() {
                elevated_actions.push(&state.item.action);
                elevated_slots.push(AstaApplySlot::Explicit { state_index });
            }
        }
        let elevated_error = if elevated_actions.is_empty() {
            None
        } else {
            let create_rp = store
                .kv_get("restore_point_before_apply")
                .ok()
                .flatten()
                .map(|value| value != "false")
                .unwrap_or(true);
            let result = engine::elevation::run_elevated_batch_with_restore_point_results(
                &elevated_actions,
                create_rp,
            );
            drop(elevated_actions);
            match result {
                Ok(results) if results.len() == elevated_slots.len() => {
                    for (slot, result) in elevated_slots.into_iter().zip(results) {
                        if result.exit_code == 0 {
                            match slot {
                                AstaApplySlot::Transaction {
                                    group_index,
                                    state_index,
                                } => {
                                    let state = &mut groups[group_index].states[state_index];
                                    state.applied = true;
                                    state.detail =
                                        "Applied under one UAC prompt; awaiting live verification."
                                            .into();
                                }
                                AstaApplySlot::Explicit { state_index } => {
                                    let state = &mut explicit_states[state_index];
                                    state.applied = true;
                                    state.detail =
                                        "Applied under one UAC prompt; awaiting live verification."
                                            .into();
                                }
                            }
                        } else {
                            let diagnostic = result.output.trim();
                            let detail = if diagnostic.is_empty() {
                                format!(
                                    "Elevated apply failed (exit code {}).",
                                    result.exit_code
                                )
                            } else {
                                format!(
                                    "Elevated apply failed (exit code {}): {}",
                                    result.exit_code, diagnostic
                                )
                            };
                            match slot {
                                AstaApplySlot::Transaction {
                                    group_index,
                                    state_index,
                                } => {
                                    let tweak_id =
                                        groups[group_index].states[state_index].item.tweak_id.clone();
                                    groups[group_index].states[state_index].detail = detail.clone();
                                    groups[group_index].fail(format!("{}: {}", tweak_id, detail));
                                }
                                AstaApplySlot::Explicit { state_index } => {
                                    let tweak_id = explicit_states[state_index].item.tweak_id.clone();
                                    explicit_states[state_index].detail = detail.clone();
                                    errors.push(format!("{}: {}", tweak_id, detail));
                                }
                            }
                        }
                    }
                    None
                }
                Ok(results) => Some(format!(
                    "elevated Asta batch returned {} results for {} commands",
                    results.len(),
                    elevated_slots.len()
                )),
                Err(error) => Some(format!("elevated Asta batch: {:#}", error)),
            }
        };

        // Verify both lanes in one read-back pass. A mismatch poisons only its
        // verified tweak group; explicit rows remain visible and are not
        // silently reverted.
        let mut verification_slots = Vec::new();
        let mut verification_actions: Vec<&TweakAction> = Vec::new();
        for (group_index, group) in groups.iter().enumerate() {
            for (state_index, state) in group.states.iter().enumerate() {
                if state.attempted {
                    verification_slots.push(AstaVerifySlot::Transaction {
                        group_index,
                        state_index,
                    });
                    verification_actions.push(&state.item.action);
                }
            }
        }
        for (state_index, state) in explicit_states.iter().enumerate() {
            if state.attempted {
                verification_slots.push(AstaVerifySlot::Explicit { state_index });
                verification_actions.push(&state.item.action);
            }
        }
        let verifications = engine::verify_batch(&verification_actions);
        drop(verification_actions);
        for (slot, verification) in verification_slots.into_iter().zip(verifications) {
            match slot {
                AstaVerifySlot::Transaction {
                    group_index,
                    state_index,
                } => {
                    let state = &mut groups[group_index].states[state_index];
                    if verification.status == VerificationStatus::Verified {
                        state.applied = true;
                        if !state.detail.starts_with("Elevated apply failed") {
                            state.detail = "Applied and verified in the live system.".into();
                        }
                    } else {
                        state.detail =
                            format!("Live verification failed: {}", verification.detail);
                    }
                    state.verification = Some(verification);
                }
                AstaVerifySlot::Explicit { state_index } => {
                    let state = &mut explicit_states[state_index];
                    if verification.status == VerificationStatus::Verified {
                        state.applied = true;
                        if !state.detail.starts_with("Elevated apply failed") {
                            state.detail = "Applied and verified in the live system.".into();
                        }
                    } else {
                        state.detail =
                            format!("Live verification failed: {}", verification.detail);
                    }
                    state.verification = Some(verification);
                }
            }
        }

        for group in &mut groups {
            let failures = group
                .states
                .iter()
                .filter(|state| {
                    state.attempted
                        && state
                            .verification
                            .as_ref()
                            .map(|verification| verification.status != VerificationStatus::Verified)
                            .unwrap_or(true)
                })
                .map(|state| {
                    let detail = state
                        .verification
                        .as_ref()
                        .map(|verification| {
                            format!("verification {:?}: {}", verification.status, verification.detail)
                        })
                        .unwrap_or_else(|| "verification was unavailable".into());
                    format!("{} {}", state.item.tweak_id, detail)
                })
                .collect::<Vec<_>>();
            for failure in failures {
                group.fail(failure);
            }
        }
        for state in &explicit_states {
            if state.attempted
                && state
                    .verification
                    .as_ref()
                    .map(|verification| verification.status != VerificationStatus::Verified)
                    .unwrap_or(true)
            {
                let detail = state
                    .verification
                    .as_ref()
                    .map(|verification| {
                        format!("verification {:?}: {}", verification.status, verification.detail)
                    })
                    .unwrap_or_else(|| "verification was unavailable".into());
                errors.push(format!("{} {}", state.item.tweak_id, detail));
            }
        }
        // The elevated runner returns one aggregate shell error for a batch.
        // Individual read-back is authoritative: if a transactional group
        // failed, keep the aggregate diagnostic with that group so its
        // selective rollback remains visible. If every attempted action
        // verifies (including the explicit lane), ignore aggregate runner
        // noise instead of turning a live-successful batch into a false
        // partial result.
        if let Some(error) = elevated_error {
            if groups.iter().any(|group| group.failed) {
                if let Some(group) = groups.iter_mut().find(|group| group.failed) {
                    group.fail(error);
                }
            }
        }

        // Record every attempted action before any selective rollback so Diff
        // can explain partial native batches and the frontend can recover IDs
        // even when the shell reported an aggregate failure.
        for group in &mut groups {
            let mut receipt_failures = Vec::new();
            for state in &mut group.states {
                if !state.attempted {
                    continue;
                }
                let verification = state.verification.clone().unwrap_or(engine::VerificationResult {
                    status: VerificationStatus::Unknown,
                    detail: "The action was attempted but no live verification was available."
                        .into(),
                });
                match store.record_apply(
                    &state.item.tweak_id,
                    &state.item.action,
                    &state.pre_state,
                    &verification,
                ) {
                    Ok(receipt) => state.receipt = Some(receipt),
                    Err(error) => {
                        let message = format!(
                            "{} receipt could not be saved: {:#}",
                            state.item.tweak_id, error
                        );
                        receipt_failures.push(message);
                    }
                }
            }
            for failure in receipt_failures {
                group.fail(failure);
            }
        }
        for state in &mut explicit_states {
            if !state.attempted {
                continue;
            }
            let verification = state.verification.clone().unwrap_or(engine::VerificationResult {
                status: VerificationStatus::Unknown,
                detail: "The action was attempted but no live verification was available.".into(),
            });
            match store.record_apply(
                &state.item.tweak_id,
                &state.item.action,
                &state.pre_state,
                &verification,
            ) {
                Ok(receipt) => state.receipt = Some(receipt),
                Err(error) => errors.push(format!(
                    "{} receipt could not be saved: {:#}",
                    state.item.tweak_id, error
                )),
            }
        }

        let mut rollback_errors = Vec::new();
        for group in groups.iter_mut().rev() {
            if !group.failed {
                continue;
            }
            for state in group.states.iter_mut().rev() {
                if !state.attempted || state.item.action.requires_admin() {
                    continue;
                }
                match engine::revert_unelevated(&state.item.action, &state.pre_state) {
                    Ok(_) => {
                        state.rolled_back = true;
                        if let Some(receipt) = &state.receipt {
                            let _ = store.mark_reverted(&receipt.receipt_id);
                        }
                    }
                    Err(error) => rollback_errors.push(format!(
                        "{} rollback failed: {:#}",
                        state.item.tweak_id, error
                    )),
                }
            }
        }
        // Keep the same action-to-command mapping for rollback. The old
        // aggregate path marked every failed-group action as reverted when
        // the batch returned success, even if one line failed. That made a
        // missing ownership record (for example an LSO stash) look like a
        // rollback failure for unrelated tweaks and left their receipt state
        // ambiguous.
        let elevated_revert_slots = groups
            .iter()
            .enumerate()
            .rev()
            .filter(|(_, group)| group.failed)
            .flat_map(|(group_index, group)| {
                group
                    .states
                    .iter()
                    .enumerate()
                    .rev()
                    .filter(|(_, state)| state.attempted && state.item.action.requires_admin())
                    .map(move |(state_index, _)| (group_index, state_index))
            })
            .collect::<Vec<_>>();
        let elevated_revert_pairs = elevated_revert_slots
            .iter()
            .map(|(group_index, state_index)| {
                (
                    &groups[*group_index].states[*state_index].item.action,
                    &groups[*group_index].states[*state_index].pre_state,
                )
            })
            .collect::<Vec<_>>();
        if !elevated_revert_pairs.is_empty() {
            let revert_result =
                engine::elevation::run_elevated_revert_batch_results(&elevated_revert_pairs);
            drop(elevated_revert_pairs);
            match revert_result {
                Ok(results) if results.len() == elevated_revert_slots.len() => {
                    for ((group_index, state_index), result) in
                        elevated_revert_slots.into_iter().zip(results)
                    {
                        if result.exit_code == 0 {
                            let state = &mut groups[group_index].states[state_index];
                            state.rolled_back = true;
                            if let Some(receipt) = &state.receipt {
                                let _ = store.mark_reverted(&receipt.receipt_id);
                            }
                        } else {
                            let state = &groups[group_index].states[state_index];
                            let diagnostic = result.output.trim();
                            let detail = if diagnostic.is_empty() {
                                format!("exit code {}", result.exit_code)
                            } else {
                                format!("exit code {}: {}", result.exit_code, diagnostic)
                            };
                            rollback_errors.push(format!(
                                "{} elevated rollback failed: {}",
                                state.item.tweak_id, detail
                            ));
                        }
                    }
                }
                Ok(results) => rollback_errors.push(format!(
                    "elevated Asta rollback returned {} results for {} commands",
                    results.len(),
                    elevated_revert_slots.len()
                )),
                Err(error) => rollback_errors.push(format!(
                    "elevated Asta rollback failed: {:#}",
                    error
                )),
            }
        }

        errors.extend(
            groups
                .iter()
                .flat_map(|group| group.errors.iter().cloned()),
        );
        // A normal return means the batch reached its final receipt state,
        // including selective rollback where required. Mark the breadcrumb
        // complete before calculating the report status so a failed marker
        // clear cannot masquerade as a clean commit.
        let completed_marker = serde_json::json!({
            "status": "completed",
            "transactionId": transaction_id.clone(),
            "completedAt": chrono::Utc::now().to_rfc3339(),
            "actionCount": groups.iter().map(|group| group.states.len()).sum::<usize>()
                + explicit_states.len(),
        });
        if let Err(error) = store.kv_set(ASTA_INFLIGHT_KEY, &completed_marker.to_string()) {
            errors.push(format!("could not clear the Asta interruption marker: {error:#}"));
        }
        let failed_groups = groups.iter().filter(|group| group.failed).count();
        let any_committed = groups.iter().any(|group| {
            group
                .states
                .iter()
                .any(|state| state.applied && !state.rolled_back)
        }) || explicit_states
            .iter()
            .any(|state| state.applied && !state.rolled_back);
        let status = if failed_groups == 0 && errors.is_empty() && rollback_errors.is_empty() {
            if let Some(build) = current_os_build() {
                let _ = store.kv_set("last_applied_build", &build.to_string());
            }
            "committed"
        } else if any_committed || rollback_errors.len() > 0 {
            "partial"
        } else {
            "rolled_back"
        };
        if failed_groups > 0 {
            errors.insert(
                0,
                format!(
                    "{} verified tweak group(s) stayed rolled back; explicit review actions were left visible for manual review.",
                    failed_groups
                ),
            );
        }

        let mut states = groups
            .into_iter()
            .flat_map(|group| group.states)
            .map(AstaState::into_transaction_state)
            .collect::<Vec<_>>();
        states.extend(
            explicit_states
                .into_iter()
                .map(AstaState::into_transaction_state),
        );
        let report = transaction_report(
            transaction_id,
            status,
            states,
            errors,
            rollback_errors,
        );
        let _ = store.kv_set(
            "last_transaction",
            &serde_json::to_string(&report).unwrap_or_default(),
        );
        Ok(report)
    })
    .await
    .map_err(|e| format!("Asta batch task failed: {e}"))?
}

#[cfg(test)]
mod transaction_tests {
    use super::{
        transaction_action_supported, transaction_report, BatchItem, TransactionState,
    };
    use crate::engine::actions::{Hive, RegValueType, TweakAction};
    use crate::engine::{VerificationResult, VerificationStatus};

    #[test]
    fn transaction_rejects_unverifiable_power_shell() {
        let action = TweakAction::PowershellScript {
            apply: "Write-Output apply".into(),
            revert: None,
            verify: Some("Write-Output verify".into()),
        };
        assert!(!transaction_action_supported(&action));
    }

    #[test]
    fn transaction_accepts_power_shell_only_with_both_contracts() {
        let action = TweakAction::PowershellScript {
            apply: "Write-Output apply".into(),
            revert: Some("Write-Output revert".into()),
            verify: Some("Write-Output verify".into()),
        };
        assert!(transaction_action_supported(&action));
    }

    #[test]
    fn transaction_report_counts_verified_rollback() {
        let action = TweakAction::RegistrySet {
            hive: Hive::Hkcu,
            path: "Software\\OptimizationMaxxing\\Tests".into(),
            name: "Example".into(),
            value_type: RegValueType::Dword,
            value: serde_json::json!(1),
        };
        let state = TransactionState {
            item: BatchItem {
                tweak_id: "test.transaction".into(),
                action,
            },
            pre_state: serde_json::json!({}),
            attempted: true,
            applied: true,
            rolled_back: true,
            verification: Some(VerificationResult {
                status: VerificationStatus::Verified,
                detail: "verified".into(),
            }),
            receipt: None,
            detail: String::new(),
        };
        let report = transaction_report(
            "txn-test".into(),
            "rolled_back",
            vec![state],
            Vec::new(),
            Vec::new(),
        );
        assert_eq!(report.item_count, 1);
        assert_eq!(report.attempted_count, 1);
        assert_eq!(report.applied_count, 1);
        assert_eq!(report.committed_count, 0);
        assert_eq!(report.verified_count, 1);
        assert_eq!(report.rolled_back_count, 1);
        assert_eq!(report.status, "rolled_back");
    }
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
        //    possible; ambiguous BCD reads share one elevated read-back).
        let mut prepared: Vec<(BatchItem, serde_json::Value)> = Vec::with_capacity(items.len());
        let action_refs = items.iter().map(|item| &item.action).collect::<Vec<_>>();
        let pre_states = engine::capture_pre_states_with_elevation_fallback(&action_refs);
        for (item, pre_result) in items.into_iter().zip(pre_states) {
            let pre = pre_result.map_err(|e| format!("{:#}", e))?;
            if engine::pre_state_is_ambiguous(&item.action, &pre) {
                let detail = pre
                    .get("detail")
                    .and_then(|value| value.as_str())
                    .unwrap_or("the protected BCD read-back remained ambiguous");
                return Err(format!(
                    "{} pre-state remained ambiguous after the elevated read-back; no write was attempted. {}",
                    item.tweak_id, detail
                ));
            }
            prepared.push((item, pre));
        }

        // 2. Apply unelevated items (HKCU registry, user-profile FileWrite) in-process now.
        // 3. Collect elevated items (HKLM, BcdeditSet, PS, admin-path FileWrite) into
        //    one batch for one UAC.
        let mut elevated_actions: Vec<&TweakAction> = Vec::new();
        let mut apply_errors: Vec<String> = Vec::new();
        for (item, _pre) in &prepared {
            if !item.action.requires_admin() {
                if let Err(e) = engine::apply_unelevated(&item.action) {
                    // Keep going so later independent actions still get a
                    // chance to apply and every prepared action is recorded
                    // with a post-apply read-back below.
                    apply_errors.push(format!("{}: {:#}", item.tweak_id, e));
                }
            } else {
                elevated_actions.push(&item.action);
            }
        }
        if !elevated_actions.is_empty() {
            // Best-effort Windows System Restore point before touching HKLM/BCD,
            // folded into the same elevated shell (no extra UAC). Controlled by
            // a setting (default ON). Non-fatal: a failed restore point never
            // blocks the apply.
            let create_rp = store
                .kv_get("restore_point_before_apply")
                .ok()
                .flatten()
                .map(|v| v != "false")
                .unwrap_or(true);
            if let Err(e) = engine::elevation::run_elevated_batch_with_restore_point(
                &elevated_actions,
                create_rp,
            ) {
                // The elevated runner executes each line independently, so a
                // non-zero result means the batch may be partially applied
                // (or UAC may have denied it). Do not discard the receipts:
                // record native verification for every prepared action and
                // return the diagnostic after the durable state is safe.
                apply_errors.push(format!("elevated batch: {:#}", e));
            }
        }

        // 4. Read every resulting state back before recording receipts. A
        // successful process exit is not proof that Windows accepted the
        // requested state (policy ACLs, driver ownership, and later tools can
        // all disagree).
        let verification_actions = prepared
            .iter()
            .map(|(item, _)| &item.action)
            .collect::<Vec<_>>();
        let verifications = engine::verify_batch(&verification_actions);

        // 5. Record receipts in original order.
        let mut receipts = Vec::with_capacity(prepared.len());
        for ((item, pre), verification) in prepared.into_iter().zip(verifications) {
            let r = store
                .record_apply(&item.tweak_id, &item.action, &pre, &verification)
                .map_err(|e| format!("{:#}", e))?;
            receipts.push(r);
        }

        // Record the OS build we applied on, so the UI can warn when a later
        // Windows update may have reverted tweaks (post-update drift).
        if let Some(b) = current_os_build() {
            let _ = store.kv_set("last_applied_build", &b.to_string());
        }
        if apply_errors.is_empty() {
            Ok(receipts)
        } else {
            Err(format!(
                "Apply completed with {} error(s); receipts were recorded with live verification.\n{}",
                apply_errors.len(),
                apply_errors.join("\n"),
            ))
        }
    })
    .await
    .map_err(|e| format!("apply_batch task failed: {e}"))?
}

/// Best-effort read of the current Windows build number for update-drift
/// detection. Returns None if the registry read fails.
fn current_os_build() -> Option<u32> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .ok()?;
    let s: String = key.get_value("CurrentBuildNumber").ok()?;
    s.trim().parse::<u32>().ok()
}

/// Read-only gate for the automatic tuning flow. Windows Update and pending
/// installer restarts can overwrite settings while a batch is applying, so
/// the frontend pauses the automatic lane until the user re-scans.
#[tauri::command]
async fn get_tune_preflight(
    state: tauri::State<'_, SnapshotStore>,
) -> Result<tune_preflight::TunePreflight, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || Ok(tune_preflight::read(&store)))
        .await
        .map_err(|e| format!("tune preflight task failed: {e}"))?
}

/// Generic persisted setting read (SQLite kv table). Used by the frontend for
/// small toggles (restore-point) and drift detection (last-applied build).
#[tauri::command]
fn kv_get(state: tauri::State<'_, SnapshotStore>, key: String) -> Result<Option<String>, String> {
    state.kv_get(&key).map_err(|e| format!("{:#}", e))
}

/// Generic persisted setting write (SQLite kv table).
#[tauri::command]
fn kv_set(state: tauri::State<'_, SnapshotStore>, key: String, value: String) -> Result<(), String> {
    state.kv_set(&key, &value).map_err(|e| format!("{:#}", e))
}

/// Enable Windows System Protection on the system drive (so restore points
/// can actually be created), clear the 24h creation-frequency limit, and make
/// one restore point immediately. One UAC prompt. Best-effort per line.
#[tauri::command]
async fn enable_system_protection() -> Result<(), String> {
    tokio::task::spawn_blocking(|| -> Result<(), String> {
        let sys = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
        let lines = vec![
            format!(
                "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Enable-ComputerRestore -Drive '{}\\'\"",
                sys
            ),
            r#"reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" /v SystemRestorePointCreationFrequency /t REG_DWORD /d 0 /f"#.to_string(),
            r#"powershell -NoProfile -ExecutionPolicy Bypass -Command "Checkpoint-Computer -Description 'optimizationmaxxing - protection enabled' -RestorePointType 'MODIFY_SETTINGS'""#.to_string(),
        ];
        engine::elevation::run_elevated_raw_lines(&lines).map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("enable_system_protection task failed: {e}"))?
}

/// Read whether an already-installed NVIDIA Profile Inspector is available
/// and whether OptimizationMaxxing has a saved customized-profile backup.
/// This is intentionally read-only and never requests elevation.
#[tauri::command]
async fn nvpi_status() -> Result<nvpi::NvpiStatus, String> {
    tokio::task::spawn_blocking(nvpi::status)
        .await
        .map_err(|e| format!("nvpi status task failed: {e}"))?
        .map_err(|e| format!("{:#}", e))
}

/// Apply the app-owned aggressive Fortnite profile through one elevated NVPI
/// invocation. The backend exports the current customized profiles first and
/// verifies the exported profile after import.
#[tauri::command]
async fn nvpi_apply_fortnite_extreme() -> Result<nvpi::NvpiOperationResult, String> {
    tokio::task::spawn_blocking(nvpi::apply_fortnite_extreme)
        .await
        .map_err(|e| format!("nvpi apply task failed: {e}"))?
        .map_err(|e| format!("{:#}", e))
}

/// Restore the app-owned export captured immediately before the last NVPI
/// apply, then verify the exported Fortnite block against that backup.
#[tauri::command]
async fn nvpi_restore_fortnite() -> Result<nvpi::NvpiOperationResult, String> {
    tokio::task::spawn_blocking(nvpi::restore_fortnite)
        .await
        .map_err(|e| format!("nvpi restore task failed: {e}"))?
        .map_err(|e| format!("{:#}", e))
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

/// Re-read every active receipt against live Windows state and persist the
/// result. This is intentionally separate from list_applied so the UI can
/// show whether a setting is still in place after Windows Update, a driver
/// installer, or another tuning utility changed it.
#[tauri::command]
async fn verify_applied(
    state: tauri::State<'_, SnapshotStore>,
) -> Result<Vec<AppliedTweak>, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<AppliedTweak>, String> {
        let active = store
            .list_applied()
            .map_err(|e| format!("{:#}", e))?
            .into_iter()
            .filter(|row| row.status == "applied")
            .collect::<Vec<_>>();

        let mut loaded = Vec::new();
        for row in active {
            let Some((action, _pre_state)) = store
                .get_receipt(&row.receipt_id)
                .map_err(|e| format!("{:#}", e))?
            else {
                continue;
            };
            loaded.push((row.receipt_id, action));
        }

        let action_refs = loaded
            .iter()
            .map(|(_, action)| action)
            .collect::<Vec<_>>();
        let verifications = engine::verify_batch_without_elevation(&action_refs);
        for ((receipt_id, _action), verification) in loaded.into_iter().zip(verifications) {
            store
                .update_verification(&receipt_id, &verification)
                .map_err(|e| format!("{:#}", e))?;
        }

        store.list_applied().map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("verify_applied task failed: {e}"))?
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertAllReport {
    pub reverted: usize,
    pub failed_receipt_ids: Vec<String>,
    pub elevated_used: bool,
    pub total_active: usize,
}

/// Revert the requested active receipts. HKCU registry reverts run unelevated;
/// everything privileged (HKLM, bcdedit, PowerShell) batches into one UAC
/// prompt. `None` means every active receipt, while `Some` is used by
/// Tournament Mode to revert only its flagged set without prompting once per
/// receipt.
fn revert_receipts(
    store: &SnapshotStore,
    requested_ids: Option<&[String]>,
) -> Result<RevertAllReport, String> {
    let applied = store.list_applied().map_err(|e| format!("{:#}", e))?;
    let active: Vec<&AppliedTweak> = applied
        .iter()
        .filter(|a| a.status == "applied")
        .filter(|a| requested_ids.map(|ids| ids.iter().any(|id| id == &a.receipt_id)).unwrap_or(true))
        .collect();
    let total_active = active.len();
    let mut failed: Vec<String> = Vec::new();

    // A requested receipt may have been reverted between list_applied and this
    // call. Report that explicitly instead of silently claiming it was done.
    if let Some(ids) = requested_ids {
        for id in ids {
            if !active.iter().any(|a| a.receipt_id == *id) {
                failed.push(id.clone());
            }
        }
    }

    if total_active == 0 {
        return Ok(RevertAllReport {
            reverted: 0,
            failed_receipt_ids: failed,
            elevated_used: false,
            total_active: 0,
        });
    }

    // Load each (receipt_id, action, pre_state) triple.
    let mut loaded: Vec<(String, TweakAction, serde_json::Value)> = Vec::new();
    for a in &active {
        match store.get_receipt(&a.receipt_id) {
            Ok(Some((action, pre))) => loaded.push((a.receipt_id.clone(), action, pre)),
            Ok(None) | Err(_) => failed.push(a.receipt_id.clone()),
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
        let result = engine::elevation::run_elevated_revert_batch_results(&pairs);
        drop(pairs);
        match result {
            Ok(results) if results.len() == elevated.len() => {
                // One UAC boundary, but one receipt outcome per command. A
                // single stale/missing ownership record must not make every
                // other revert look failed.
                for ((rid, _, _), command) in elevated.iter().zip(results) {
                    if command.exit_code == 0 {
                        let _ = store.mark_reverted(rid);
                        reverted += 1;
                    } else {
                        failed.push(rid.clone());
                    }
                }
            }
            Ok(_) | Err(_) => {
                // The helper itself failed or returned an incomplete result;
                // no receipt is safe to mark as reverted.
                failed.extend(elevated.iter().map(|(rid, _, _)| rid.clone()));
            }
        }
    }

    Ok(RevertAllReport {
        reverted,
        failed_receipt_ids: failed,
        elevated_used,
        total_active,
    })
}

/// Revert every applied tweak in newest-first order. The privileged part is a
/// single UAC batch, preserving the existing Settings-page behavior.
#[tauri::command]
async fn revert_all_applied(
    state: tauri::State<'_, SnapshotStore>,
) -> Result<RevertAllReport, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || revert_receipts(&store, None))
        .await
        .map_err(|e| format!("revert_all task failed: {e}"))?
}

/// Revert a caller-selected set of active receipts under one elevation
/// boundary. Used by scheduled Tournament Mode catch-up so opening the app
/// cannot produce one UAC prompt for every flagged tweak.
#[tauri::command]
async fn revert_batch(
    state: tauri::State<'_, SnapshotStore>,
    receipt_ids: Vec<String>,
) -> Result<RevertAllReport, String> {
    let store = (*state).clone();
    tokio::task::spawn_blocking(move || revert_receipts(&store, Some(&receipt_ids)))
        .await
        .map_err(|e| format!("revert_batch task failed: {e}"))?
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
async fn match_scan_preflight() -> Result<match_scan::MatchScanReport, String> {
    tokio::task::spawn_blocking(match_scan::run_preflight)
        .await
        .map_err(|e| format!("match scan task failed: {e}"))
}

#[tauri::command]
async fn match_scan_live() -> Result<match_scan::MatchScanReport, String> {
    tokio::task::spawn_blocking(match_scan::run_live_spotcheck)
        .await
        .map_err(|e| format!("match scan live task failed: {e}"))
}

#[tauri::command]
async fn match_scan_deep_gpu(app: tauri::AppHandle) -> Result<match_scan::MatchScanReport, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let script = resource_dir.join("resources/lhm/read_sensors.ps1");
    let dll = resource_dir.join("resources/lhm/LibreHardwareMonitorLib.dll");
    let script_str = strip_verbatim_prefix(&script.to_string_lossy());
    let dll_str = strip_verbatim_prefix(&dll.to_string_lossy());
    let report = tokio::task::spawn_blocking(move || {
        toolkit::probe_lhm_sensors(&script_str, &dll_str)
    })
    .await
    .map_err(|e| format!("lhm task failed: {e}"))?;
    Ok(match_scan::interpret_lhm_gpu(&report))
}

#[tauri::command]
async fn match_scan_deep_cpu(app: tauri::AppHandle) -> Result<match_scan::MatchScanReport, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let script = resource_dir.join("resources/lhm/read_sensors.ps1");
    let dll = resource_dir.join("resources/lhm/LibreHardwareMonitorLib.dll");
    let script_str = strip_verbatim_prefix(&script.to_string_lossy());
    let dll_str = strip_verbatim_prefix(&dll.to_string_lossy());
    let report = tokio::task::spawn_blocking(move || {
        toolkit::probe_lhm_sensors_elevated(&script_str, &dll_str)
    })
    .await
    .map_err(|e| format!("lhm task failed: {e}"))?;
    Ok(match_scan::interpret_lhm_cpu(&report))
}

#[tauri::command]
async fn match_scan_session_start(app: tauri::AppHandle) -> Result<(), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let exe = resource_dir.join("resources/presentmon/PresentMon-2.4.1-x64.exe");
    let exe_str = strip_verbatim_prefix(&exe.to_string_lossy());
    let exe_opt = if std::path::Path::new(&exe_str).exists() {
        Some(exe_str)
    } else {
        None
    };
    let csv = std::env::var("LOCALAPPDATA")
        .map(|l| format!("{l}\\optmaxxing\\match-scans\\session.csv"))
        .unwrap_or_else(|_| "session-frametimes.csv".into());
    if let Some(parent) = std::path::Path::new(&csv).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match_scan::session_start(exe_opt, csv)
}

#[tauri::command]
async fn match_scan_session_stop() -> Result<match_scan::MatchScanReport, String> {
    tokio::task::spawn_blocking(match_scan::session_stop)
        .await
        .map_err(|e| format!("session stop task failed: {e}"))
}

#[tauri::command]
async fn match_scan_session_status() -> Result<match_scan::SessionStatus, String> {
    Ok(match_scan::session_status())
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
async fn onu_discover_stick() -> Result<toolkit::OnuDiscoveryResult, String> {
    tokio::task::spawn_blocking(toolkit::discover_onu_stick)
        .await
        .map_err(|e| format!("onu discovery task failed: {e}"))
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
    let script_str = strip_verbatim_prefix(&script.to_string_lossy());
    let dll_str = strip_verbatim_prefix(&dll.to_string_lossy());
    tokio::task::spawn_blocking(move || toolkit::probe_lhm_sensors(&script_str, &dll_str))
        .await
        .map_err(|e| format!("lhm task failed: {e}"))
}

/// Windows `\\?\` extended-length-path prefix breaks PowerShell's
/// `Split-Path` and a few other path cmdlets. Tauri's `resource_dir()`
/// returns paths with this prefix in installed builds (release NSIS), so
/// every `*.ps1` resource we hand over has to be stripped first. Regular
/// dev paths under `target/debug` don't have the prefix so this is a no-op
/// there. Keep the original path if it doesn't start with the verbatim
/// prefix.
fn strip_verbatim_prefix(p: &str) -> String {
    p.strip_prefix(r"\\?\").unwrap_or(p).to_string()
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
    let script_str = strip_verbatim_prefix(&script.to_string_lossy());
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
async fn standby_run_now(app: tauri::AppHandle) -> Result<standby::StandbyStatus, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let script = resource_dir.join("resources/scripts/clear_standby.ps1");
    let script_str = strip_verbatim_prefix(&script.to_string_lossy());
    tokio::task::spawn_blocking(move || -> Result<standby::StandbyStatus, String> {
        standby::run_once(&script_str).map_err(|e| format!("{:#}", e))?;
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

/// Bounded CPU stability screen. It is intentionally separate from the short
/// Asta Bench CPU proxy so the UI can explain that this is a health signal,
/// not a performance score or a degradation diagnosis.
#[tauri::command]
async fn cpu_health_test(duration_seconds: u32) -> Result<toolkit::CpuHealthResult, String> {
    tokio::task::spawn_blocking(move || toolkit::run_cpu_health_test(duration_seconds))
        .await
        .map_err(|e| format!("cpu health task failed: {e}"))
}

#[tauri::command]
fn cpu_health_cancel() {
    toolkit::cancel_cpu_health_test();
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
async fn vip_validate_online(code: String) -> Result<vip::ClaimResult, String> {
    tokio::task::spawn_blocking(move || {
        let hwid = vip::compute_hwid().map_err(|e| format!("{:#}", e))?;
        Ok::<vip::ClaimResult, String>(vip::validate_online(&code, &hwid))
    })
    .await
    .map_err(|e| format!("vip validation task failed: {e}"))?
}

#[tauri::command]
async fn lhm_sensors_elevated(app: tauri::AppHandle) -> Result<toolkit::LhmReport, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let script = resource_dir.join("resources/lhm/read_sensors.ps1");
    let dll = resource_dir.join("resources/lhm/LibreHardwareMonitorLib.dll");
    let script_str = strip_verbatim_prefix(&script.to_string_lossy());
    let dll_str = strip_verbatim_prefix(&dll.to_string_lossy());
    tokio::task::spawn_blocking(move || {
        toolkit::probe_lhm_sensors_elevated(&script_str, &dll_str)
    })
    .await
    .map_err(|e| format!("lhm task failed: {e}"))
}

/// Whether the PawnIO sensor driver is currently installed. Drives the
/// Uninstall control in the Live Thermals card.
#[tauri::command]
async fn pawnio_status() -> Result<bool, String> {
    tokio::task::spawn_blocking(toolkit::pawnio_installed)
        .await
        .map_err(|e| format!("pawnio status task failed: {e}"))
}

/// Uninstall the PawnIO sensor driver (one UAC), from the same place it was
/// enabled.
#[tauri::command]
async fn pawnio_uninstall(app: tauri::AppHandle) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let setup = resource_dir.join("resources/lhm/PawnIO_setup.exe");
    let setup_str = strip_verbatim_prefix(&setup.to_string_lossy());
    tokio::task::spawn_blocking(move || toolkit::pawnio_uninstall(&setup_str))
        .await
        .map_err(|e| format!("pawnio uninstall task failed: {e}"))?
}

/// Read each DIMM's SPD to identify the real DRAM manufacturer + die inputs
/// (elevated — SMBus; installs PawnIO first if missing). Powers confident RAM
/// die detection instead of guessing from the module part number.
#[tauri::command]
async fn spd_dimms(app: tauri::AppHandle) -> Result<toolkit::SpdReport, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolve resource dir: {e}"))?;
    let script = resource_dir.join("resources/lhm/read_spd.ps1");
    let lhm_dir = resource_dir.join("resources/lhm");
    let script_str = strip_verbatim_prefix(&script.to_string_lossy());
    let dir_str = strip_verbatim_prefix(&lhm_dir.to_string_lossy());
    tokio::task::spawn_blocking(move || toolkit::probe_spd_elevated(&script_str, &dir_str))
        .await
        .map_err(|e| format!("spd task failed: {e}"))
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

#[tauri::command]
async fn monitor_inventory() -> Result<toolkit::MonitorReport, String> {
    tokio::task::spawn_blocking(|| toolkit::read_monitor_inventory().map_err(|e| format!("{:#}", e)))
        .await
        .map_err(|e| format!("monitor task failed: {e}"))?
}

#[tauri::command]
async fn bios_audit_probe() -> Result<bios_audit::BiosAudit, String> {
    tokio::task::spawn_blocking(|| {
        bios_audit::read_bios_audit().map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("bios_audit task failed: {e}"))?
}

#[tauri::command]
fn scewin_parse_dump(content: String) -> Result<scewin::ScewinDump, String> {
    scewin::parse_scewin_dump(&content)
}

#[tauri::command]
async fn network_audit_probe() -> Result<network_audit::NetworkAudit, String> {
    tokio::task::spawn_blocking(|| {
        network_audit::read_network_audit().map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("network_audit task failed: {e}"))?
}

#[tauri::command]
async fn network_traffic_snapshot() -> Result<network_audit::NetworkTrafficSnapshot, String> {
    tokio::task::spawn_blocking(|| {
        network_audit::read_network_traffic_snapshot().map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("network traffic snapshot task failed: {e}"))?
}

#[tauri::command]
async fn driver_health() -> Result<drivers::DriverHealthReport, String> {
    tokio::task::spawn_blocking(|| {
        let com_con = wmi::COMLibrary::new().map_err(|e| format!("COM init: {e:#}"))?;
        let wmi_con = wmi::WMIConnection::new(com_con).map_err(|e| format!("WMI: {e:#}"))?;
        drivers::read_driver_health(&wmi_con).map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("driver_health task failed: {e}"))?
}

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

/// Closes the splash window and shows the main window for a normal launch.
/// A hidden `--background` launch closes the splash but keeps the main window
/// hidden so the CPU-set watcher can run without opening the UI.
#[tauri::command]
async fn close_splashscreen(
    app: tauri::AppHandle,
    background: tauri::State<'_, BackgroundMode>,
) -> Result<(), String> {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if background.0 {
        return Ok(());
    }
    if let Some(main) = app.get_webview_window("main") {
        // Open maximized (fills the screen, keeps window controls). The window
        // is created hidden then shown here, so the config's `maximized` flag
        // isn't always honored on deferred show — maximize explicitly.
        let _ = main.maximize();
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
        TweakAction::PowershellScript { apply, revert, .. } => {
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
        TweakAction::DisplayRefresh {
            device_match,
            target_hz,
            fallback_chain,
        } => {
            // Surface matched displays + their current Hz from the captured
            // pre-state so the UI shows "what would change."
            let matched_count = pre_state
                .get("devices")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            let prior_summary: String = pre_state
                .get("devices")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|d| {
                            let desc = d.get("description").and_then(|x| x.as_str())?;
                            let hz = d.get("hz").and_then(|x| x.as_u64())?;
                            Some(format!("{desc} ({hz}Hz)"))
                        })
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_else(|| "(no current matches)".to_string());
            let target_label = if *target_hz == 0 {
                "highest-supported".to_string()
            } else {
                format!("{target_hz}Hz")
            };
            format!(
                "Bump refresh: match={:?} target={} (fallback {:?}) — {} matched: {}",
                device_match, target_label, fallback_chain, matched_count, prior_summary
            )
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
            let background_mode = std::env::args().any(|arg| arg == "--background");
            app.manage(BackgroundMode(background_mode));
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
            verify_action,
            apply_tweak,
            apply_batch,
            apply_transaction,
            apply_repair_batch,
            apply_asta_batch,
            kv_get,
            kv_set,
            get_reboot_validation,
            arm_reboot_validation,
            validate_reboot_persistence,
            get_tune_preflight,
            enable_system_protection,
            nvpi_status,
            nvpi_apply_fortnite_extreme,
            nvpi_restore_fortnite,
            revert_tweak,
            revert_batch,
            revert_all_applied,
            list_applied,
            verify_applied,
            system_metrics,
            read_temps,
            disk_free,
            launch_disk_cleanup,
            launch_memtest,
            dpc_snapshot,
            match_scan_preflight,
            match_scan_live,
            match_scan_deep_gpu,
            match_scan_deep_cpu,
            match_scan_session_start,
            match_scan_session_stop,
            match_scan_session_status,
            ping_probe,
            bufferbloat_probe,
            onu_stick_metrics,
            onu_discover_stick,
            live_thermals,
            lhm_sensors,
            lhm_sensors_elevated,
            pawnio_status,
            pawnio_uninstall,
            spd_dimms,
            vip_hwid,
            vip_verify,
            vip_claim_online,
            vip_validate_online,
            bench_cpu,
            cpu_health_test,
            cpu_health_cancel,
            bench_ping,
            audit_state,
            ram_modules,
            pcie_links,
            microcode_report,
            vbs_report,
            monitor_inventory,
            driver_health,
            network_audit_probe,
            network_traffic_snapshot,
            bios_audit_probe,
            scewin_parse_dump,
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
