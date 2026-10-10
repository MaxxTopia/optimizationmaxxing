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

use super::actions::{TweakAction, VerificationResult, VerificationStatus};
use crate::process_helpers::hidden_powershell;

/// `%SystemRoot%` is expanded by the elevated cmd.exe script. Keeping this
/// path explicit makes apply/revert use the same Windows PowerShell 5.1 host
/// as the native verifier instead of whichever `powershell.exe` happens to be
/// first on PATH.
pub const CMD_POWERSHELL: &str =
    r#""%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe""#;

/// Base64-encode UTF-16-LE bytes for `powershell -EncodedCommand`.
pub fn encode_for_ps(script: &str) -> String {
    let mut bytes: Vec<u8> = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    base64_encode(&bytes)
}

/// Standard base64 encoder — kept inline to avoid a dependency for ~25 lines.
fn base64_encode(input: &[u8]) -> String {
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
        "{} -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {}",
        CMD_POWERSHELL,
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
        "{} -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {}",
        CMD_POWERSHELL,
        encode_for_ps(r)
    ))
}

fn wrapped_verifier(script: &str) -> String {
    format!(
        "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; & {{ {} }}",
        script
    )
}

/// Build the cmd.exe line for a catalog-owned, read-only verifier. The line
/// is used only by the generated elevated read-back runner; it never accepts
/// frontend-supplied PowerShell.
pub fn verify_cmd_line(action: &TweakAction) -> Result<String> {
    let TweakAction::PowershellScript { verify, .. } = action else {
        return Err(anyhow!("verify_cmd_line called on non-powershell action"));
    };
    let Some(script) = verify else {
        return Err(anyhow!(
            "PowerShell action has no declared read-back contract"
        ));
    };
    Ok(format!(
        "{} -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {}",
        CMD_POWERSHELL,
        encode_for_ps(&wrapped_verifier(script))
    ))
}

/// Classify output from a generated verifier run by the elevated read-back
/// runner. A non-zero exit is only a mismatch when the catalog verifier
/// explicitly emits `MISMATCH:`; permission/tool/read failures remain
/// `unknown`.
pub fn verification_from_output(exit_code: i32, output: &str) -> VerificationResult {
    let success = exit_code == 0;
    let trimmed = output.trim();
    let detail = if trimmed.is_empty() {
        if success {
            "PowerShell read-back passed.".to_string()
        } else {
            match exit_code {
                1 => "PowerShell read-back returned exit code 1 without a diagnostic. The verifier did not identify whether the target drifted; no write was attempted. Rebuild with an explicit MISMATCH or UNKNOWN reason.".to_string(),
                2 => "PowerShell read-back could not establish a safe live-state basis (exit code 2) without a diagnostic. No write was attempted. Rebuild with an explicit UNKNOWN or NOT_CONFIGURED reason.".to_string(),
                code => format!(
                    "PowerShell read-back exited with code {code} without a diagnostic. No write was attempted; the verifier must report an explicit MISMATCH or UNKNOWN reason.",
                ),
            }
        }
    } else {
        concise_diagnostic(success, output)
    };

    VerificationResult {
        status: classify_verification_status(success, output, ""),
        detail,
    }
}

/// PowerShell 5.1 can serialize native errors as CLIXML. The raw payload is
/// useful to a debugger but not to a user trying to repair a tune, so reduce
/// the common protected-read failure to an actionable, stable explanation.
fn concise_diagnostic(success: bool, output: &str) -> String {
    let normalized = output
        .replace("_x000D__x000A_", "\n")
        .replace("_x000A_", "\n")
        .replace("_x000D_", "\n")
        .replace("<S S=\"Error\">", "")
        .replace("</S>", "")
        .replace("</Objs>", "")
        .replace(
            "<Objs Version=\"1.1.0.1\" xmlns=\"http://schemas.microsoft.com/powershell/2004/04\">",
            "",
        );
    let lower = normalized.to_ascii_lowercase();
    if !success
        && (lower.contains("access is denied")
            || lower.contains("permissiondenied")
            || lower.contains("permission denied")
            || lower.contains("error 5"))
    {
        return "Protected PowerShell read was denied (Windows error 5 / Access is denied). This is a permission read failure, not proof that the target drifted; no write is considered verified. Retry through the app's UAC boundary or use an elevated repair path.".into();
    }
    let compact = normalized
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");
    compact.chars().take(2000).collect()
}

/// Run a catalog-owned, read-only verifier. The verifier is deliberately
/// separate from apply/revert: it must inspect state and exit 0 when the
/// requested state is present, without mutating Windows. Encoding keeps the
/// script out of cmd.exe quoting and the catalog remains the only source of
/// executable PowerShell.
pub fn verify(action: &TweakAction) -> Result<VerificationResult> {
    let TweakAction::PowershellScript { verify, .. } = action else {
        return Err(anyhow!("verify called on non-powershell action"));
    };
    let Some(script) = verify else {
        return Err(anyhow!(
            "PowerShell action has no declared read-back contract"
        ));
    };

    let encoded = encode_for_ps(&wrapped_verifier(script));
    let output = hidden_powershell()
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            encoded.as_str(),
        ])
        .output()
        .map_err(|e| anyhow!("could not start PowerShell verifier: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = [stdout.trim(), stderr.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");
    Ok(if combined.is_empty() && output.status.code().is_none() {
        VerificationResult {
            status: VerificationStatus::Unknown,
            detail: "PowerShell read-back ended without a diagnostic or exit code. No write was attempted; the verifier must report an explicit UNKNOWN reason.".into(),
        }
    } else {
        verification_from_output(output.status.code().unwrap_or(-1), &combined)
    })
}

/// A verifier must explicitly label a failed read-back as `MISMATCH:`.
/// Other non-zero exits (for example, a missing cmdlet or access denied) are
/// inability-to-read, not proof that the Windows value differs.
pub(crate) fn classify_verification_status(
    success: bool,
    stdout: &str,
    stderr: &str,
) -> VerificationStatus {
    if success {
        return VerificationStatus::Verified;
    }
    if stdout
        .lines()
        .chain(stderr.lines())
        .any(|line| line.trim_start().starts_with("MISMATCH:"))
    {
        VerificationStatus::Mismatch
    } else {
        VerificationStatus::Unknown
    }
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
            verify: None,
        };
        let line = apply_cmd_line(&a).unwrap();
        assert!(line.starts_with(CMD_POWERSHELL));
        assert!(line.contains("-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand "));
    }

    #[test]
    fn revert_errors_when_missing() {
        let a = TweakAction::PowershellScript {
            apply: "x".into(),
            revert: None,
            verify: None,
        };
        assert!(revert_cmd_line(&a).is_err());
    }

    #[test]
    fn verifier_distinguishes_drift_from_read_errors() {
        assert_eq!(
            classify_verification_status(true, "Verified target", ""),
            VerificationStatus::Verified
        );
        assert_eq!(
            classify_verification_status(false, "MISMATCH: policy missing", ""),
            VerificationStatus::Mismatch
        );
        assert_eq!(
            classify_verification_status(false, "", "Get-NetQosPolicy: Access denied"),
            VerificationStatus::Unknown
        );
    }

    #[test]
    fn verifier_summarizes_clixml_access_denied() {
        let result = verification_from_output(
            1,
            "#< CLIXML <S S=\"Error\">Get-MMAgent : Access is denied. _x000D__x000A_</S></Objs>",
        );
        assert_eq!(result.status, VerificationStatus::Unknown);
        assert!(result.detail.contains("Windows error 5"));
        assert!(!result.detail.contains("CLIXML"));
    }

    #[test]
    fn verifier_keeps_explicit_mismatch_as_mismatch() {
        let result = verification_from_output(1, "MISMATCH: PCIe Link State is still enabled");
        assert_eq!(result.status, VerificationStatus::Mismatch);
        assert!(result.detail.starts_with("MISMATCH:"));
    }
}
