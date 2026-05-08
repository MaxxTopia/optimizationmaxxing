//! Tagged-union TweakAction + dispatcher.
//!
//! Schema mirrors the catalog JSON spec from the project plan. Discriminator
//! `kind` (snake_case). Each variant's revert behavior is derived from the
//! captured pre-state in the snapshot store, not from the action payload.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Hive {
    Hkcu,
    Hklm,
    /// HKEY_CLASSES_ROOT — rarely used, included for completeness.
    Hkcr,
    /// HKEY_USERS — used for per-user tweaks under a known SID.
    Hku,
}

impl Hive {
    pub fn requires_admin(self) -> bool {
        matches!(self, Hive::Hklm | Hive::Hkcr)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RegValueType {
    Dword,
    Qword,
    String,
    ExpandString,
    MultiString,
    Binary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TweakAction {
    /// Set a registry value. Creates the key path if missing. Pre-state
    /// records the prior value or null (= "did not exist").
    RegistrySet {
        hive: Hive,
        path: String,
        name: String,
        value_type: RegValueType,
        /// Encoded as JSON: number for Dword/Qword, string for String/ExpandString,
        /// array of strings for MultiString, array of u8 for Binary.
        value: serde_json::Value,
    },
    /// Delete a registry value (when `name` is Some) or an entire subkey
    /// recursively (when `name` is None).
    RegistryDelete {
        hive: Hive,
        path: String,
        name: Option<String>,
    },
    /// Set a BCD store value via bcdedit. Always targets {current}. Always
    /// requires admin. Pre-state captures the current value via `bcdedit
    /// /enum {current} /v` if available, else marks `{ "found": "unknown" }`
    /// and revert defaults to `/deletevalue` (Windows reverts to default).
    BcdeditSet {
        /// e.g., "useplatformclock", "hypervisorlaunchtype",
        /// "disabledynamictick", "tscsyncpolicy"
        name: String,
        /// e.g., "no", "off", "yes", "enhanced"
        value: String,
    },
    /// Run a vetted PowerShell script as Administrator. Catalog-supplied
    /// only — never user-arbitrary. Encoded via UTF-16-LE base64 for
    /// `powershell -EncodedCommand` to dodge cmd.exe / PS quoting issues.
    /// Pre-state is intentionally empty `{}`; revert relies on the supplied
    /// `revert` script being the deterministic inverse.
    PowershellScript {
        /// Apply script body.
        apply: String,
        /// Revert script body. None => non-revertible (catalog warns user).
        revert: Option<String>,
    },
    /// Write a file at the given path. The path supports the env-var
    /// substitutions %USERPROFILE%, %APPDATA%, %LOCALAPPDATA%, %TEMP%,
    /// %WINDIR%, %PROGRAMFILES%, %PROGRAMDATA%. Pre-state captures the
    /// existing file (base64) so revert can restore byte-perfectly. If the
    /// expanded path resolves outside the user profile, the write is routed
    /// through the elevated batch (one UAC).
    FileWrite {
        /// Absolute path with %ENV% supported.
        path: String,
        /// Base64-encoded file contents to write.
        contents_b64: String,
    },
    // Phase 4d still TODO: ExternalToolInvoke, TimerResolution.
}

impl TweakAction {
    pub fn kind(&self) -> &'static str {
        match self {
            TweakAction::RegistrySet { .. } => "registry_set",
            TweakAction::RegistryDelete { .. } => "registry_delete",
            TweakAction::BcdeditSet { .. } => "bcdedit_set",
            TweakAction::PowershellScript { .. } => "powershell_script",
            TweakAction::FileWrite { .. } => "file_write",
        }
    }

    pub fn requires_admin(&self) -> bool {
        match self {
            TweakAction::RegistrySet { hive, .. }
            | TweakAction::RegistryDelete { hive, .. } => hive.requires_admin(),
            TweakAction::BcdeditSet { .. } => true,
            TweakAction::PowershellScript { .. } => true,
            TweakAction::FileWrite { path, .. } => {
                // Conservative: admin needed unless the expanded path lives
                // under a user-profile env directory.
                let expanded = super::file_write::expand_env(path).unwrap_or_else(|_| path.clone());
                !super::file_write::is_user_profile_path(&expanded)
            }
        }
    }
}

/// Returned by `preview_tweak` — what the engine would do if asked to apply.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TweakPreview {
    pub kind: String,
    pub requires_admin: bool,
    /// Human-readable summary the UI can show ("Will set HKCU\\Foo\\Bar=1, prior=0").
    pub summary: String,
    /// Captured live pre-state (JSON shape varies by action kind).
    pub pre_state: serde_json::Value,
}

/// Returned by `apply_tweak` — durable receipt referenced by revert.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyReceipt {
    pub receipt_id: String,
    pub tweak_id: String,
    pub applied_at: String,
    pub kind: String,
}

/// What `list_applied` returns per row.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedTweak {
    pub receipt_id: String,
    pub tweak_id: String,
    pub applied_at: String,
    pub status: String,
    pub kind: String,
}
