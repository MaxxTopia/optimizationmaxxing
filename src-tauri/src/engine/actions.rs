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
            TweakAction::RegistrySet { hive, path, .. }
            | TweakAction::RegistryDelete { hive, path, .. } => {
                hive.requires_admin() || hkcu_path_requires_admin(*hive, path)
            }
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

/// Some HKCU subtrees have restrictive ACLs that deny write to standard
/// users — Windows hardens them so non-admin processes can't self-grant
/// Group-Policy-equivalent overrides. The classic offender is
/// `HKCU\Software\Policies\*` (REG_OPTION_BACKUP_RESTORE-ish ACL: admins
/// full, user read-only). Without this routing, an in-process winreg
/// `create_subkey` would surface as "create_subkey ...: Access is denied"
/// for any standard-user install. UAC elevation keeps the SAME user SID
/// (HKCU is unchanged) but adds the privilege bits needed to write.
///
/// If we discover more locked HKCU subtrees, extend the prefix list here.
fn hkcu_path_requires_admin(hive: Hive, path: &str) -> bool {
    if hive != Hive::Hkcu {
        return false;
    }
    let normalized = path.replace('/', "\\").to_ascii_lowercase();
    const ADMIN_ONLY_HKCU_PREFIXES: &[&str] = &["software\\policies\\"];
    ADMIN_ONLY_HKCU_PREFIXES
        .iter()
        .any(|p| normalized.starts_with(p))
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn reg_set(hive: Hive, path: &str) -> TweakAction {
        TweakAction::RegistrySet {
            hive,
            path: path.to_string(),
            name: "X".to_string(),
            value_type: RegValueType::Dword,
            value: json!(1),
        }
    }

    fn reg_delete(hive: Hive, path: &str) -> TweakAction {
        TweakAction::RegistryDelete {
            hive,
            path: path.to_string(),
            name: Some("X".to_string()),
        }
    }

    #[test]
    fn hkcu_policies_path_requires_admin() {
        // Windows hardens HKCU\Software\Policies\* with an admin-only ACL.
        // Standard-user write hits PermissionDenied → caught friend on
        // v0.1.77 with three Edge / search / cloud-content tweaks.
        for path in [
            "Software\\Policies\\Microsoft\\Edge",
            "Software\\Policies\\Microsoft\\Windows\\Explorer",
            "Software\\Policies\\Microsoft\\Windows\\CloudContent",
            // Mixed case + forward slash — normalize handles both.
            "SOFTWARE\\policies\\foo",
            "Software/Policies/bar",
        ] {
            assert!(
                reg_set(Hive::Hkcu, path).requires_admin(),
                "RegistrySet HKCU {path} should require admin",
            );
            assert!(
                reg_delete(Hive::Hkcu, path).requires_admin(),
                "RegistryDelete HKCU {path} should require admin",
            );
        }
    }

    #[test]
    fn ordinary_hkcu_paths_do_not_require_admin() {
        for path in [
            "Software\\Microsoft\\GameBar",
            "Control Panel\\Mouse",
            "System\\GameConfigStore",
            "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
            // "policies" appearing later in the path is not the protected
            // root — only the top-level Software\Policies tree is hardened.
            "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer",
        ] {
            assert!(
                !reg_set(Hive::Hkcu, path).requires_admin(),
                "HKCU {path} should not require admin",
            );
        }
    }

    #[test]
    fn hklm_always_requires_admin_regardless_of_path() {
        assert!(reg_set(Hive::Hklm, "Software\\Foo").requires_admin());
        assert!(reg_set(Hive::Hkcr, "CLSID\\{0000-0000}").requires_admin());
    }
}
