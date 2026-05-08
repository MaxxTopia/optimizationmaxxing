//! FileWrite action — Phase 4d-v2.
//!
//! Vetted catalog-supplied bytes only — never user-arbitrary input. The
//! engine snapshots the file's prior contents (base64) before mutation so
//! revert restores byte-perfectly. Files larger than `MAX_SNAPSHOT_BYTES`
//! refuse to apply (we don't want a 100 MB log file in the SQLite snapshot
//! store).
//!
//! Routing: paths under user-profile env directories run unelevated
//! in-process. Everything else routes through the existing elevated batch
//! runner via `Set-Content` PowerShell line. One UAC for the whole batch.

use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::Path;

use super::actions::TweakAction;

/// Snapshot cap. Files larger than this refuse to apply — we treat them as
/// log/database paths the catalog shouldn't be trying to write anyway.
pub const MAX_SNAPSHOT_BYTES: u64 = 1_048_576; // 1 MB

/// Expand %VAR% references in a path. Returns the literal path if no
/// expansions are present.
pub fn expand_env(input: &str) -> Result<String> {
    let mut out = input.to_string();
    let known = [
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "WINDIR",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "PROGRAMDATA",
        "SYSTEMROOT",
        "SYSTEMDRIVE",
    ];
    for var in known {
        let needle = format!("%{}%", var);
        if out.to_uppercase().contains(&needle.to_uppercase()) {
            let val = std::env::var(var)
                .with_context(|| format!("env var {var} not set; cannot expand path {input}"))?;
            // Case-insensitive replace — Windows env vars aren't case-sensitive.
            out = case_insensitive_replace(&out, &needle, &val);
        }
    }
    Ok(out)
}

fn case_insensitive_replace(haystack: &str, needle: &str, replacement: &str) -> String {
    let lower_hay = haystack.to_lowercase();
    let lower_needle = needle.to_lowercase();
    let mut result = String::with_capacity(haystack.len());
    let mut i = 0;
    while i < haystack.len() {
        if lower_hay[i..].starts_with(&lower_needle) {
            result.push_str(replacement);
            i += needle.len();
        } else {
            // Push one char (boundary-safe).
            let ch = haystack[i..].chars().next().unwrap();
            result.push(ch);
            i += ch.len_utf8();
        }
    }
    result
}

/// Heuristic: is this path under a user-profile directory? Used to decide
/// whether the FileWrite needs UAC elevation.
///
/// Audited 2026-05-07: dropped TEMP/TMP from the candidate list. A user can
/// redirect %TEMP% to a path outside the profile (e.g. `C:\Temp`); if we
/// trusted TEMP for elevation routing, we'd skip UAC and the write would
/// then fail with permission denied. Only USERPROFILE-rooted directories
/// are reliably writable without elevation.
pub fn is_user_profile_path(expanded: &str) -> bool {
    let lc = expanded.to_lowercase().replace('/', "\\");
    let candidates = [
        std::env::var("USERPROFILE").ok(),
        std::env::var("APPDATA").ok(),
        std::env::var("LOCALAPPDATA").ok(),
    ];
    // Defense in depth: only count an env var if it expands to something
    // under USERPROFILE. A redirected APPDATA (rare but legal) still counts;
    // a wholly outside-profile path (e.g. `D:\app-data`) doesn't.
    let userprofile_lc = std::env::var("USERPROFILE")
        .ok()
        .map(|s| s.to_lowercase().replace('/', "\\"));
    for c in candidates.iter().flatten() {
        let prefix = c.to_lowercase().replace('/', "\\");
        if prefix.is_empty() {
            continue;
        }
        if let Some(up) = &userprofile_lc {
            if !prefix.starts_with(up) {
                continue;
            }
        }
        if lc.starts_with(&prefix) {
            return true;
        }
    }
    false
}

/// Apply: snapshot existing bytes, then write new contents. HKCU-equivalent
/// (user-profile) only — admin paths route through elevation::run_elevated_*.
pub fn apply(action: &TweakAction) -> Result<serde_json::Value> {
    let TweakAction::FileWrite { path, contents_b64 } = action else {
        return Err(anyhow!("file_write::apply called on non-FileWrite action"));
    };
    let resolved = expand_env(path)?;
    let mut pre = capture_pre_state(action)?;
    // Pin the apply-time resolved path inside the snapshot so revert binds to
    // *exactly* this file even if env vars change between apply and revert.
    if let Some(obj) = pre.as_object_mut() {
        obj.insert(
            "resolved_path".to_string(),
            serde_json::Value::String(resolved.clone()),
        );
    }

    // Decode + write.
    let bytes = base64_decode(contents_b64).context("decoding contents_b64")?;
    if let Some(parent) = Path::new(&resolved).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).with_context(|| format!("creating parent of {resolved}"))?;
        }
    }
    fs::write(&resolved, &bytes).with_context(|| format!("writing {resolved}"))?;
    Ok(pre)
}

/// Revert: restore captured bytes, or delete if the file didn't exist before.
pub fn revert(action: &TweakAction, pre_state: &serde_json::Value) -> Result<()> {
    let TweakAction::FileWrite { path, .. } = action else {
        return Err(anyhow!("file_write::revert called on non-FileWrite action"));
    };
    // Prefer the apply-time resolved path; fall back to fresh expansion if
    // legacy snapshots predate the resolved_path field.
    let resolved = pre_state
        .get("resolved_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| expand_env(path).unwrap_or_else(|_| path.clone()));
    let existed = pre_state
        .get("existed")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !existed {
        match fs::remove_file(&resolved) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e).with_context(|| format!("removing {resolved} during revert")),
        }
    } else {
        let b64 = pre_state
            .get("contents_b64")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("pre_state.contents_b64 missing"))?;
        let bytes = base64_decode(b64).context("decoding pre_state.contents_b64")?;
        fs::write(&resolved, &bytes).with_context(|| format!("restoring {resolved}"))?;
        Ok(())
    }
}

/// Read the file (or null) and return JSON pre-state. Refuses to snapshot
/// files larger than MAX_SNAPSHOT_BYTES.
pub fn capture_pre_state(action: &TweakAction) -> Result<serde_json::Value> {
    let TweakAction::FileWrite { path, .. } = action else {
        return Err(anyhow!(
            "file_write::capture_pre_state called on non-FileWrite action"
        ));
    };
    let resolved = expand_env(path)?;
    match fs::metadata(&resolved) {
        Ok(meta) => {
            if meta.len() > MAX_SNAPSHOT_BYTES {
                return Err(anyhow!(
                    "{resolved} is {} bytes — exceeds {}-byte snapshot cap; \
                     catalog should not target this kind of path",
                    meta.len(),
                    MAX_SNAPSHOT_BYTES
                ));
            }
            let bytes = fs::read(&resolved).with_context(|| format!("reading {resolved}"))?;
            let sha = sha256_hex(&bytes);
            Ok(serde_json::json!({
                "existed": true,
                "contents_b64": base64_encode(&bytes),
                "sha256": sha,
                "size_bytes": meta.len(),
            }))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(serde_json::json!({
            "existed": false,
            "contents_b64": null,
        })),
        Err(e) => Err(e).with_context(|| format!("stat {resolved}")),
    }
}

/// Build the cmd.exe-line for an elevated apply. Embeds the new contents as
/// base64 inside a PowerShell `[IO.File]::WriteAllBytes` call.
pub fn apply_cmd_line(action: &TweakAction) -> Result<String> {
    let TweakAction::FileWrite { path, contents_b64 } = action else {
        return Err(anyhow!("apply_cmd_line called on non-FileWrite action"));
    };
    let resolved = expand_env(path)?;
    let script = format!(
        "$p = [Environment]::ExpandEnvironmentVariables({}); \
         $dir = Split-Path -Parent $p; if ($dir -and -not (Test-Path $dir)) {{ New-Item -ItemType Directory -Path $dir -Force | Out-Null }}; \
         $bytes = [Convert]::FromBase64String({}); \
         [IO.File]::WriteAllBytes($p, $bytes)",
        ps_quote(&resolved),
        ps_quote(contents_b64),
    );
    Ok(format!(
        "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand {}",
        encode_for_ps(&script)
    ))
}

/// Build the cmd.exe-line for an elevated revert.
pub fn revert_cmd_line(action: &TweakAction, pre_state: &serde_json::Value) -> Result<String> {
    let TweakAction::FileWrite { path, .. } = action else {
        return Err(anyhow!("revert_cmd_line called on non-FileWrite action"));
    };
    let resolved = pre_state
        .get("resolved_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| expand_env(path).unwrap_or_else(|_| path.clone()));
    let existed = pre_state
        .get("existed")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let script = if !existed {
        format!(
            "$p = {}; if (Test-Path -LiteralPath $p) {{ Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }}",
            ps_quote(&resolved),
        )
    } else {
        let b64 = pre_state
            .get("contents_b64")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("pre_state.contents_b64 missing"))?;
        format!(
            "$p = {}; \
             $bytes = [Convert]::FromBase64String({}); \
             [IO.File]::WriteAllBytes($p, $bytes)",
            ps_quote(&resolved),
            ps_quote(b64),
        )
    };
    Ok(format!(
        "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand {}",
        encode_for_ps(&script)
    ))
}

// --- Encoding helpers ---

fn encode_for_ps(script: &str) -> String {
    let mut bytes: Vec<u8> = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    base64_encode(&bytes)
}

fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn base64_encode(input: &[u8]) -> String {
    const ALPHA: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out: Vec<u8> = Vec::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        out.push(ALPHA[(b0 >> 2) as usize]);
        out.push(ALPHA[(((b0 & 0b11) << 4) | (b1 >> 4)) as usize]);
        out.push(if chunk.len() >= 2 {
            ALPHA[(((b1 & 0b1111) << 2) | (b2 >> 6)) as usize]
        } else {
            b'='
        });
        out.push(if chunk.len() == 3 {
            ALPHA[(b2 & 0b111111) as usize]
        } else {
            b'='
        });
    }
    String::from_utf8(out).expect("base64 alphabet is ASCII")
}

fn base64_decode(input: &str) -> Result<Vec<u8>> {
    let trimmed: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let mut decoded: Vec<u8> = Vec::with_capacity(trimmed.len() * 3 / 4);
    let mut buf = 0u32;
    let mut buf_bits = 0u32;
    for c in trimmed.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            _ => return Err(anyhow!("invalid base64 char {c:#x}")),
        };
        buf = (buf << 6) | (v as u32);
        buf_bits += 6;
        if buf_bits >= 8 {
            buf_bits -= 8;
            decoded.push(((buf >> buf_bits) & 0xff) as u8);
        }
    }
    Ok(decoded)
}

fn sha256_hex(_bytes: &[u8]) -> String {
    // Lightweight non-crypto digest — we only use it for change-detection
    // visibility in the snapshot, never for security. Avoids pulling sha2.
    // 64-bit FNV-1a doubled = 128 bits of fingerprint, hex-printed.
    fn fnv1a(seed: u64, data: &[u8]) -> u64 {
        let mut h = seed;
        for &b in data {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        h
    }
    let h1 = fnv1a(0xcbf29ce484222325, _bytes);
    let h2 = fnv1a(h1.wrapping_add(0x9e3779b97f4a7c15), _bytes);
    format!("{:016x}{:016x}", h1, h2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_env_no_vars() {
        assert_eq!(expand_env(r"C:\foo\bar.txt").unwrap(), r"C:\foo\bar.txt");
    }

    #[test]
    fn expand_env_userprofile() {
        std::env::set_var("USERPROFILE", r"C:\Users\test");
        assert_eq!(
            expand_env(r"%USERPROFILE%\AppData\Local\foo").unwrap(),
            r"C:\Users\test\AppData\Local\foo"
        );
    }

    #[test]
    fn expand_env_case_insensitive() {
        std::env::set_var("APPDATA", r"C:\Users\test\AppData\Roaming");
        assert_eq!(
            expand_env(r"%appdata%\NVIDIA\foo.nip").unwrap(),
            r"C:\Users\test\AppData\Roaming\NVIDIA\foo.nip"
        );
    }

    #[test]
    fn user_profile_detection() {
        std::env::set_var("USERPROFILE", r"C:\Users\test");
        std::env::set_var("APPDATA", r"C:\Users\test\AppData\Roaming");
        std::env::set_var("LOCALAPPDATA", r"C:\Users\test\AppData\Local");
        assert!(is_user_profile_path(r"C:\Users\test\Documents\foo"));
        assert!(is_user_profile_path(r"C:\Users\test\AppData\Roaming\NVIDIA\foo.nip"));
        assert!(!is_user_profile_path(r"C:\Windows\System32\drivers\etc\hosts"));
        assert!(!is_user_profile_path(r"C:\Program Files\NVIDIA Corporation\foo"));
    }

    #[test]
    fn temp_redirected_outside_profile_is_not_user_path() {
        // If a sysadmin sets TEMP=C:\Temp (outside profile), we MUST NOT
        // treat that as "no elevation needed" — write will fail without admin.
        // Audited 2026-05-07: TEMP/TMP dropped from candidate list.
        std::env::set_var("USERPROFILE", r"C:\Users\test");
        std::env::set_var("TEMP", r"C:\Temp");
        std::env::set_var("TMP", r"C:\Temp");
        assert!(!is_user_profile_path(r"C:\Temp\foo.txt"));
    }

    #[test]
    fn base64_roundtrip() {
        let cases = [b"".to_vec(), b"f".to_vec(), b"foobar".to_vec(), (0..255).collect::<Vec<u8>>()];
        for input in cases {
            let enc = base64_encode(&input);
            let dec = base64_decode(&enc).unwrap();
            assert_eq!(dec, input);
        }
    }

    #[test]
    fn pre_state_for_missing_file() {
        let action = TweakAction::FileWrite {
            path: r"C:\Users\nonexistent_do_not_create_this_path\xyz.txt".into(),
            contents_b64: "".into(),
        };
        let pre = capture_pre_state(&action).unwrap();
        assert_eq!(pre.get("existed"), Some(&serde_json::Value::Bool(false)));
    }

    #[test]
    fn apply_and_revert_roundtrip() {
        let dir = std::env::temp_dir().join(format!("optmaxxing_fw_test_{}", std::process::id()));
        let path = dir.join("test.txt");
        let _ = fs::create_dir_all(&dir);

        // First apply: file does not exist.
        let action = TweakAction::FileWrite {
            path: path.to_string_lossy().to_string(),
            contents_b64: base64_encode(b"hello world"),
        };
        let pre = apply(&action).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"hello world");
        assert_eq!(pre.get("existed"), Some(&serde_json::Value::Bool(false)));

        // Revert: file should be deleted.
        revert(&action, &pre).unwrap();
        assert!(!path.exists());

        // Apply over an existing file.
        fs::write(&path, b"prior contents").unwrap();
        let pre2 = apply(&action).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"hello world");
        assert_eq!(pre2.get("existed"), Some(&serde_json::Value::Bool(true)));

        // Revert restores prior contents.
        revert(&action, &pre2).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"prior contents");

        // Cleanup
        let _ = fs::remove_dir_all(&dir);
    }
}
