//! Engine spine — what applies and reverts tweaks.
//!
//! Phase 4a (this commit): in-process dispatcher, SQLite snapshot store,
//! RegistrySet/RegistryDelete actions limited to HKCU (no elevation).
//! Phase 4c (later): elevated agent sidecar over named-pipe JSON-RPC for
//! HKLM + bcdedit + powershell-exec actions.
//!
//! Pre-state capture pattern: every apply writes the prior value (or
//! "key did not exist" sentinel) into the snapshot store BEFORE the
//! mutation runs, so revert can replay it deterministically.

pub mod actions;
pub mod bcdedit;
pub mod display;
pub mod elevation;
pub mod file_write;
pub mod powershell;
pub mod registry;
pub mod snapshots;

pub use actions::{
    ApplyReceipt, AppliedTweak, TweakAction, TweakPreview, VerificationResult,
    VerificationStatus,
};
pub use snapshots::SnapshotStore;

/// Capture pre-state without applying. Routes by action kind.
pub(crate) fn elevation_compat_capture(action: &TweakAction) -> anyhow::Result<serde_json::Value> {
    capture_pre_state(action)
}

/// Unified pre-state capture across all action kinds. Reads are unelevated
/// where possible (registry HKLM is readable by default; bcdedit /enum is
/// best-effort).
pub fn capture_pre_state(action: &TweakAction) -> anyhow::Result<serde_json::Value> {
    match action {
        TweakAction::RegistrySet { .. } | TweakAction::RegistryDelete { .. } => {
            registry::capture_pre_state(action)
        }
        TweakAction::BcdeditSet { .. } => bcdedit::capture_pre_state(action),
        TweakAction::PowershellScript { .. } => Ok(serde_json::json!({})),
        TweakAction::FileWrite { .. } => file_write::capture_pre_state(action),
        TweakAction::DisplayRefresh { .. } => display::capture_pre_state(action),
    }
}

/// Capture pre-state, retrying the protected BCD read through the generated
/// elevated read-back runner when the unelevated probe cannot establish a
/// state. The fallback keeps `unknown` distinct from `false`; a denied UAC
/// prompt never becomes a guessed value.
pub fn capture_pre_state_with_elevation_fallback(
    action: &TweakAction,
) -> anyhow::Result<serde_json::Value> {
    let pre_state = capture_pre_state(action)?;
    let needs_bcd_retry = matches!(action, TweakAction::BcdeditSet { .. })
        && pre_state
            .get("found")
            .and_then(|value| value.as_str())
            == Some("unknown");
    if !needs_bcd_retry {
        return Ok(pre_state);
    }

    let output = match elevation::run_elevated_capture_lines(&[
        bcdedit::enum_cmd_line().to_string(),
    ]) {
        Ok(mut outputs) => outputs.pop(),
        Err(error) => {
            return Ok(serde_json::json!({
                "found": "unknown",
                "detail": format!("Elevated BCD preflight could not run: {error:#}"),
            }));
        }
    };
    let Some(output) = output else {
        return Ok(serde_json::json!({
            "found": "unknown",
            "detail": "Elevated BCD preflight returned no output.",
        }));
    };
    if output.exit_code != 0 {
        return Ok(serde_json::json!({
            "found": "unknown",
            "detail": format!(
                "Elevated bcdedit /enum exited with code {}: {}",
                output.exit_code,
                output.output.trim()
            ),
        }));
    }
    bcdedit::pre_state_from_enum_output(action, &output.output)
}

/// An unknown BCD pre-state cannot safely participate in a reversible write:
/// the fallback revert would have to guess what the machine contained before
/// the change. Callers must stop before mutation when this returns true.
pub fn pre_state_is_ambiguous(action: &TweakAction, pre_state: &serde_json::Value) -> bool {
    matches!(action, TweakAction::BcdeditSet { .. })
        && pre_state
            .get("found")
            .and_then(|value| value.as_str())
            == Some("unknown")
}

/// Top-level apply dispatcher. Routes by action kind. Returns the captured
/// pre-state JSON to be written into the snapshot store.
pub fn apply(action: &TweakAction) -> anyhow::Result<serde_json::Value> {
    match action {
        TweakAction::RegistrySet { .. } | TweakAction::RegistryDelete { .. } => {
            registry::apply(action)
        }
        TweakAction::BcdeditSet { .. } => {
            // Mutation and any protected pre-state retry use the elevation
            // boundary. A failed read remains explicitly unknown.
            let pre = capture_pre_state_with_elevation_fallback(action)?;
            if pre_state_is_ambiguous(action, &pre) {
                let detail = pre
                    .get("detail")
                    .and_then(|value| value.as_str())
                    .unwrap_or("the protected BCD read-back remained ambiguous");
                return Err(anyhow::anyhow!(
                    "BCD pre-state remained ambiguous after the elevated read-back; no write was attempted. {detail}"
                ));
            }
            elevation::run_elevated_action(action)?;
            Ok(pre)
        }
        TweakAction::PowershellScript { .. } => {
            elevation::run_elevated_action(action)?;
            Ok(serde_json::json!({}))
        }
        TweakAction::FileWrite { .. } => {
            if action.requires_admin() {
                let pre = file_write::capture_pre_state(action)?;
                elevation::run_elevated_action(action)?;
                Ok(pre)
            } else {
                file_write::apply(action)
            }
        }
        TweakAction::DisplayRefresh { .. } => display::apply(action),
    }
}

/// Read the live state back after an apply. This is the direct, current-token
/// verifier; protected PowerShell/BCD reads get an elevated retry through
/// `verify_with_elevation_fallback` below when Windows reports that the UI
/// token cannot read them.
fn verify_direct(action: &TweakAction) -> VerificationResult {
    if matches!(action, TweakAction::PowershellScript { .. }) {
        return match powershell::verify(action) {
            Ok(result) => result,
            Err(e) => VerificationResult {
                status: VerificationStatus::Unknown,
                detail: format!("Live state could not be verified: {e:#}"),
            },
        };
    }

    let result = match action {
        TweakAction::RegistrySet { .. } | TweakAction::RegistryDelete { .. } => {
            registry::verify(action)
        }
        TweakAction::BcdeditSet { .. } => bcdedit::verify(action),
        TweakAction::PowershellScript { .. } => unreachable!("handled above"),
        TweakAction::FileWrite { .. } => file_write::verify(action),
        TweakAction::DisplayRefresh { .. } => display::verify(action),
    };
    match result {
        Ok(true) => VerificationResult {
            status: VerificationStatus::Verified,
            detail: "Live state matches the catalog action.".into(),
        },
        Ok(false) => VerificationResult {
            status: VerificationStatus::Mismatch,
            detail: "Live state does not match the catalog action; Windows or another tool may have changed it.".into(),
        },
        Err(e) => VerificationResult {
            status: VerificationStatus::Unknown,
            detail: format!("Live state could not be verified: {e:#}"),
        },
    }
}

/// Read one action with an elevated retry when the normal read is ambiguous
/// because the unelevated UI token cannot access the protected Windows API.
pub fn verify_with_elevation_fallback(action: &TweakAction) -> VerificationResult {
    verify_batch(&[action])
        .into_iter()
        .next()
        .unwrap_or(VerificationResult {
            status: VerificationStatus::Unknown,
            detail: "No live verification result was returned.".into(),
        })
}

/// Read a set of actions and retry eligible protected reads in one elevated
/// batch. The normal read always runs first so ordinary audits do not trigger
/// UAC; only a permission/ambiguous result crosses the elevation boundary.
pub fn verify_batch(actions: &[&TweakAction]) -> Vec<VerificationResult> {
    let mut results = actions.iter().map(|action| verify_direct(action)).collect::<Vec<_>>();
    let retry_indices = actions
        .iter()
        .enumerate()
        .filter_map(|(index, action)| {
            should_retry_elevated(action, &results[index]).then_some(index)
        })
        .collect::<Vec<_>>();
    if retry_indices.is_empty() {
        return results;
    }

    let mut lines = Vec::new();
    let mut line_indices = Vec::new();
    for index in &retry_indices {
        let action = actions[*index];
        let line = match action {
            TweakAction::BcdeditSet { .. } => Some(bcdedit::enum_cmd_line().to_string()),
            TweakAction::PowershellScript { verify: Some(_), .. } => {
                match powershell::verify_cmd_line(action) {
                    Ok(line) => Some(line),
                    Err(error) => {
                        results[*index] = VerificationResult {
                            status: VerificationStatus::Unknown,
                            detail: format!("Elevated verifier could not be built: {error:#}"),
                        };
                        None
                    }
                }
            }
            _ => None,
        };
        if let Some(line) = line {
            lines.push(line);
            line_indices.push(*index);
        }
    }
    if lines.is_empty() {
        return results;
    }

    let outputs = match elevation::run_elevated_capture_lines(&lines) {
        Ok(outputs) => outputs,
        Err(error) => {
            for index in line_indices {
                results[index] = VerificationResult {
                    status: VerificationStatus::Unknown,
                    detail: format!(
                        "Live state could not be verified after the protected read was retried: {error:#}"
                    ),
                };
            }
            return results;
        }
    };

    if outputs.len() != line_indices.len() {
        let detail = format!(
            "Elevated read-back returned {} result(s) for {} requested action(s); no result was trusted.",
            outputs.len(),
            line_indices.len(),
        );
        for index in line_indices {
            results[index] = VerificationResult {
                status: VerificationStatus::Unknown,
                detail: detail.clone(),
            };
        }
        return results;
    }

    for (index, output) in line_indices.into_iter().zip(outputs) {
        let action = actions[index];
        results[index] = match action {
            TweakAction::BcdeditSet { .. } => {
                if output.exit_code != 0 {
                    VerificationResult {
                        status: VerificationStatus::Unknown,
                        detail: format!(
                            "Elevated bcdedit read-back exited with code {}: {}",
                            output.exit_code,
                            output.output.trim()
                        ),
                    }
                } else {
                    match bcdedit::verification_from_enum_output(action, &output.output) {
                        Ok(true) => VerificationResult {
                            status: VerificationStatus::Verified,
                            detail: "Live BCD state matches the catalog action after elevated read-back.".into(),
                        },
                        Ok(false) => VerificationResult {
                            status: VerificationStatus::Mismatch,
                            detail: "Live BCD state does not match the catalog action; Windows or another tool may have changed it.".into(),
                        },
                        Err(error) => VerificationResult {
                            status: VerificationStatus::Unknown,
                            detail: format!("Elevated BCD read-back could not be interpreted: {error:#}"),
                        },
                    }
                }
            }
            TweakAction::PowershellScript { .. } => {
                powershell::verification_from_output(output.exit_code, &output.output)
            }
            _ => results[index].clone(),
        };
    }
    results
}

fn should_retry_elevated(action: &TweakAction, result: &VerificationResult) -> bool {
    if result.status != VerificationStatus::Unknown {
        return false;
    }
    match action {
        // bcdedit /enum commonly requires an elevated token even though the
        // mutation path already has its own UAC boundary.
        TweakAction::BcdeditSet { .. } => true,
        TweakAction::PowershellScript { verify: Some(_), .. } => {
            let detail = result.detail.to_ascii_lowercase();
            detail.contains("access is denied")
                || detail.contains("permissiondenied")
                || detail.contains("error 5")
                || detail.contains("could not be verified")
        }
        _ => false,
    }
}

/// Public default verifier retained for callers that do not need to know
/// about the elevation fallback.
pub fn verify(action: &TweakAction) -> VerificationResult {
    verify_with_elevation_fallback(action)
}

/// Top-level revert dispatcher. Mirror of `apply`.
/// Unelevated apply for actions in a batch that have already been confirmed
/// not to require admin. Caller is responsible for filtering by
/// `action.requires_admin()`. Used by `apply_batch` to run HKCU/user-profile
/// items in-process before triggering the single elevated batch.
pub fn apply_unelevated(action: &TweakAction) -> anyhow::Result<serde_json::Value> {
    debug_assert!(!action.requires_admin());
    match action {
        TweakAction::RegistrySet { .. } | TweakAction::RegistryDelete { .. } => {
            registry::apply(action)
        }
        TweakAction::FileWrite { .. } => file_write::apply(action),
        TweakAction::DisplayRefresh { .. } => display::apply(action),
        // Bcd + PS always require admin and shouldn't reach this branch.
        TweakAction::BcdeditSet { .. } | TweakAction::PowershellScript { .. } => Err(
            anyhow::anyhow!("apply_unelevated called on action that requires admin"),
        ),
    }
}

/// Unelevated revert mirror — used by revert-all when an action's
/// `requires_admin()` is false. Caller pre-filters.
pub fn revert_unelevated(action: &TweakAction, pre_state: &serde_json::Value) -> anyhow::Result<()> {
    debug_assert!(!action.requires_admin());
    match action {
        TweakAction::RegistrySet { .. } | TweakAction::RegistryDelete { .. } => {
            registry::revert(action, pre_state)
        }
        TweakAction::FileWrite { .. } => file_write::revert(action, pre_state),
        TweakAction::DisplayRefresh { .. } => display::revert(action, pre_state),
        TweakAction::BcdeditSet { .. } | TweakAction::PowershellScript { .. } => Err(
            anyhow::anyhow!("revert_unelevated called on action that requires admin"),
        ),
    }
}

pub fn revert(action: &TweakAction, pre_state: &serde_json::Value) -> anyhow::Result<()> {
    match action {
        TweakAction::RegistrySet { .. } | TweakAction::RegistryDelete { .. } => {
            registry::revert(action, pre_state)
        }
        TweakAction::BcdeditSet { .. } => {
            elevation::run_elevated_revert_action(action, pre_state)
        }
        TweakAction::PowershellScript { .. } => {
            elevation::run_elevated_revert_action(action, pre_state)
        }
        TweakAction::FileWrite { .. } => {
            if action.requires_admin() {
                elevation::run_elevated_revert_action(action, pre_state)
            } else {
                file_write::revert(action, pre_state)
            }
        }
        TweakAction::DisplayRefresh { .. } => display::revert(action, pre_state),
    }
}
