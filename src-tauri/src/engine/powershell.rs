//! PowerShell script actions.
//!
//! Phase 4d-v2: catalog-supplied scripts only — NEVER user-arbitrary input.
//! Each script is sent via `powershell.exe -NoProfile -ExecutionPolicy Bypass
//! -EncodedCommand <base64-utf16-le>` so cmd.exe / PowerShell quoting cannot
//! corrupt the body. Always elevated (no PS-only tweak benefits from
//! unprivileged execution today).
//!
//! Pre-state is intentionally empty `{}` — the catalog supplies a
//! deterministic `revert` script as the inverse. If `revert` is None, the
//! action is marked non-revertible at the catalog layer.

use anyhow::{anyhow, Result};

use super::actions::TweakAction;

/// Base64-encode UTF-16-LE bytes for `powershell -EncodedCommand`.
fn encode_for_ps(script: &str) -> String {
    let mut bytes: Vec<u8> = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    base64_encode(&bytes)
}

/// Standard base64 encoder — kept inline to avoid a dependency for ~25 lines.
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

/// Build the cmd.exe-line for an apply.
pub fn apply_cmd_line(action: &TweakAction) -> Result<String> {
    let TweakAction::PowershellScript { apply, .. } = action else {
        return Err(anyhow!("apply_cmd_line called on non-powershell action"));
    };
    Ok(format!(
        "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand {}",
        encode_for_ps(apply)
    ))
}

/// Build the cmd.exe-line for a revert. Errors if the action has no revert
/// script — the catalog layer is responsible for not offering revert.
pub fn revert_cmd_line(action: &TweakAction) -> Result<String> {
    let TweakAction::PowershellScript { revert, .. } = action else {
        return Err(anyhow!("revert_cmd_line called on non-powershell action"));
    };
    let Some(r) = revert else {
        return Err(anyhow!(
            "PowershellScript action has no revert script (catalog layer should block this)"
        ));
    };
    Ok(format!(
        "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand {}",
        encode_for_ps(r)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_basic() {
        // RFC 4648 vectors
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn ps_encoded_form() {
        // Minimal — `Write-Output OK` round-trips through PS as expected.
        let enc = encode_for_ps("Write-Output OK");
        // UTF-16-LE 'W' = 0x57 0x00, ... base64 decodes to that exact stream.
        // We only verify it's pure base64 charset + non-empty + multiple of 4.
        assert!(!enc.is_empty());
        assert_eq!(enc.len() % 4, 0);
        assert!(enc
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'='));
    }

    #[test]
    fn apply_line_builds() {
        let a = TweakAction::PowershellScript {
            apply: "Write-Output OK".into(),
            revert: None,
        };
        let line = apply_cmd_line(&a).unwrap();
        assert!(line.starts_with("powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand "));
    }

    #[test]
    fn revert_errors_when_missing() {
        let a = TweakAction::PowershellScript {
            apply: "x".into(),
            revert: None,
        };
        assert!(revert_cmd_line(&a).is_err());
    }
}
