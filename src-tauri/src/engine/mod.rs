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

pub use actions::{ApplyReceipt, AppliedTweak, TweakAction, TweakPreview};
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

/// Top-level apply dispatcher. Routes by action kind. Returns the captured
/// pre-state JSON to be written into the snapshot store.
pub fn apply(action: &TweakAction) -> anyhow::Result<serde_json::Value> {
    match action {
        TweakAction::RegistrySet { .. } | TweakAction::RegistryDelete { .. } => {
            registry::apply(action)
        }
        TweakAction::BcdeditSet { .. } => {
            // Pre-state captured via best-effort bcdedit /enum (unelevated).
            // Mutation always elevated.
            let pre = bcdedit::capture_pre_state(action)?;
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
