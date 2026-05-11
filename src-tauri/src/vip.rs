//! HWID-bound VIP code verification.
//!
//! Goal: gift VIP to friends without backend infra and without making the
//! codes resharable on Discord.
//!
//! Design: a code is the Crockford-base32 of the first 10 bytes of
//! `HMAC-SHA256(VIP_SECRET, hwid)`. The HWID is derived from the BIOS
//! motherboard UUID + BIOS serial + CPU brand string — stable across
//! Windows reinstalls but unique per rig. So a code minted for HWID
//! "abc..." won't validate on HWID "def...".
//!
//! Trade-off honesty: VIP_SECRET is in the binary's strings table, so a
//! determined reverser can extract it and mint codes for arbitrary HWIDs.
//! This is honor-system anti-piracy, not real DRM. It blocks 99% of
//! casual code-resharing — that's the design point. If leakage becomes
//! a real problem, rotate the secret on every release (existing codes
//! become invalid; gift-receivers re-request).
//!
//! The Python mint script (`scripts/mint-vip-code.py`) uses the same
//! constants + algorithm. Keep them in sync.

use anyhow::Context;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

use crate::process_helpers::hidden_powershell;

/// Shared secret for HMAC. Must match `SECRET` in scripts/mint-vip-code.py.
/// Rotate on each release to invalidate leaked codes. Only used for the
/// offline HWID-bound path (older flow); the online claim path against
/// the Cloudflare Worker is keyless on the client.
const VIP_SECRET: &[u8] = b"optmaxxing-vip-2026-akatsuki-go!";

/// Default Cloudflare Worker URL. Override at runtime via the
/// `OPTMAXXING_VIP_WORKER_URL` env var (set during `wrangler deploy` per
/// `vip-worker/README.md`). The fallback below is the workers.dev
/// subdomain shape — replace the `<your-account>` portion or set the env
/// var before shipping a build.
const DEFAULT_WORKER_URL: &str = "https://optmaxxing-vip.maxxtopia.workers.dev/claim";

fn worker_url() -> String {
    std::env::var("OPTMAXXING_VIP_WORKER_URL")
        .unwrap_or_else(|_| DEFAULT_WORKER_URL.to_string())
}

type HmacSha256 = Hmac<Sha256>;

/// 32-character Crockford-style base32 alphabet — drops the ambiguous
/// I, L, O, U so users can't fat-finger 0/O or 1/I/L when typing.
const CROCKFORD: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Compute the rig fingerprint. SHA-256 over BIOS UUID + BIOS serial +
/// CPU brand, hex-encoded, first 32 chars. Stable across OS reinstalls
/// (BIOS data survives), unique per board.
pub fn compute_hwid() -> anyhow::Result<String> {
    let com = wmi::COMLibrary::new().context("wmi com init")?;
    let con = WMIConnection::new(com).context("wmi con")?;

    let prod_uuid: String = scalar(
        &con,
        "SELECT UUID FROM Win32_ComputerSystemProduct",
        "UUID",
    )
    .unwrap_or_default();
    let bios_serial: String = scalar(&con, "SELECT SerialNumber FROM Win32_BIOS", "SerialNumber")
        .unwrap_or_default();
    let cpu_brand: String = scalar(&con, "SELECT Name FROM Win32_Processor", "Name")
        .unwrap_or_default();

    let basis = format!("{}|{}|{}", prod_uuid.trim(), bios_serial.trim(), cpu_brand.trim());
    let mut hasher = Sha256::new();
    hasher.update(basis.as_bytes());
    let digest = hasher.finalize();
    // Take first 16 bytes → 32 hex chars. Plenty for fingerprint display.
    let hex: String = digest.iter().take(16).map(|b| format!("{:02x}", b)).collect();
    Ok(hex)
}

fn scalar(con: &WMIConnection, query: &str, field: &str) -> Option<String> {
    let rows: Vec<HashMap<String, Variant>> = con.raw_query(query).unwrap_or_default();
    for r in rows {
        if let Some(v) = r.get(field) {
            if let Variant::String(s) = v {
                if !s.is_empty() {
                    return Some(s.clone());
                }
            }
        }
    }
    None
}

/// Mint a code for a given HWID. Used by tests + the Python script's
/// expected output. App side never mints — only verifies.
pub fn mint_code_for_hwid(hwid: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(VIP_SECRET).expect("hmac key");
    mac.update(hwid.as_bytes());
    let digest = mac.finalize().into_bytes();
    let bytes = &digest[..10]; // 80 bits → 16 base32 chars
    encode_crockford(bytes)
}

/// Verify a typed code against the live HWID. Tolerant of whitespace,
/// dashes, lowercase, leading "MAXX-" prefix.
pub fn verify_code(code: &str, hwid: &str) -> bool {
    let normalized = normalize_code(code);
    let expected = mint_code_for_hwid(hwid);
    constant_time_eq(&normalized, &expected)
}

fn normalize_code(code: &str) -> String {
    let upper = code.to_ascii_uppercase();
    let stripped = upper
        .trim()
        .trim_start_matches("MAXX-")
        .trim_start_matches("MAXX");
    stripped.chars().filter(|c| !c.is_whitespace() && *c != '-').collect()
}

fn encode_crockford(bytes: &[u8]) -> String {
    let mut out = String::new();
    let mut buffer: u32 = 0;
    let mut bits_in_buffer: u8 = 0;
    for &b in bytes {
        buffer = (buffer << 8) | (b as u32);
        bits_in_buffer += 8;
        while bits_in_buffer >= 5 {
            bits_in_buffer -= 5;
            let idx = ((buffer >> bits_in_buffer) & 0b11111) as usize;
            out.push(CROCKFORD[idx] as char);
        }
    }
    if bits_in_buffer > 0 {
        let idx = ((buffer << (5 - bits_in_buffer)) & 0b11111) as usize;
        out.push(CROCKFORD[idx] as char);
    }
    out
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.bytes().zip(b.bytes()) {
        diff |= x ^ y;
    }
    diff == 0
}

// ── Online claim against the Cloudflare Worker ───────────────────────
// Lets Diggy mint UNBOUND codes (just random 16-char strings via
// scripts/mint-unbound-codes.py) and drop them in DMs. The worker's KV
// ledger gives the code to the FIRST hwid that POSTs it — subsequent
// claims on different rigs return 409. App falls back to the local
// HWID-bound verify when the worker is unreachable.

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimResult {
    pub ok: bool,
    /// "claimed" on first-time, "idempotent" on re-redeem from same hwid,
    /// "already-claimed" when 409, "network-error" when worker unreachable,
    /// "malformed" on 4xx response. The client uses status to drive the
    /// UI message; raw `error` carries the worker's text when present.
    pub status: String,
    #[serde(default)]
    pub bound_hwid: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct WorkerJson {
    ok: bool,
    #[serde(default)]
    status: Option<String>,
    #[serde(rename = "boundHwid", default)]
    bound_hwid: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

/// Drive the worker round-trip via hidden PowerShell + Invoke-WebRequest.
/// Same pattern we use for the 8311 ONU stick + bufferbloat — keeps the
/// Rust dependency surface small.
pub fn claim_online(code: &str, hwid: &str) -> ClaimResult {
    let url = worker_url();
    let body = serde_json::json!({ "code": code, "hwid": hwid }).to_string();
    // Use a here-string for the body so embedded quotes survive — single-
    // quoted to disable PS variable expansion. Closing '@ MUST be at col 0.
    let body_escaped = body.replace('\'', "''");
    let url_escaped = url.replace('\'', "''");
    // Force TLS 1.2+. Windows PowerShell 5.1 on un-patched Win10 LTSC /
    // older builds defaults `ServicePointManager.SecurityProtocol` to
    // SSL3+TLS 1.0, which Cloudflare flat-out rejects. Without this the
    // claim call dies with "The request was aborted: Could not create SSL/
    // TLS secure channel" and we fall through to the offline HMAC verify —
    // which only works for the (older) HWID-bound code flavor and gives a
    // generic "wrong code or fingerprint" message that doesn't hint at the
    // real cause. -bor preserves whatever the system already enables (TLS
    // 1.3 on Win11) instead of clamping to 1.2.
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
try {{
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}} catch {{}}
$body = @'
{body}
'@
$resp = $null
$status = 0
$content = ''
try {{
    $resp = Invoke-WebRequest -Uri '{url}' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 8
    $status = [int]$resp.StatusCode
    $content = $resp.Content
}} catch [System.Net.WebException] {{
    if ($_.Exception.Response) {{
        $r = $_.Exception.Response
        $status = [int]$r.StatusCode
        $stream = $r.GetResponseStream()
        $reader = New-Object IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
    }} else {{
        $status = 0
        $content = $_.Exception.Message
    }}
}} catch {{
    $status = 0
    $content = $_.Exception.Message
}}
[pscustomobject]@{{ status = $status; body = $content }} | ConvertTo-Json -Compress
"#,
        body = body_escaped,
        url = url_escaped,
    );
    let output = match hidden_powershell()
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return ClaimResult {
                ok: false,
                status: "network-error".to_string(),
                bound_hwid: None,
                error: Some(format!("powershell spawn failed: {e}")),
            };
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return ClaimResult {
            ok: false,
            status: "network-error".to_string(),
            bound_hwid: None,
            error: Some(if stderr.is_empty() {
                "no response body".to_string()
            } else {
                stderr
            }),
        };
    }
    #[derive(Deserialize)]
    struct PsEnvelope {
        status: i64,
        body: String,
    }
    let env: PsEnvelope = match serde_json::from_str(&stdout) {
        Ok(v) => v,
        Err(e) => {
            return ClaimResult {
                ok: false,
                status: "network-error".to_string(),
                bound_hwid: None,
                error: Some(format!("ps envelope parse failed: {e}")),
            };
        }
    };
    if env.status == 0 {
        return ClaimResult {
            ok: false,
            status: "network-error".to_string(),
            bound_hwid: None,
            error: Some(env.body),
        };
    }
    let parsed: WorkerJson = match serde_json::from_str(&env.body) {
        Ok(v) => v,
        Err(e) => {
            return ClaimResult {
                ok: false,
                status: "network-error".to_string(),
                bound_hwid: None,
                error: Some(format!("worker payload parse failed: {e}; body={}", env.body)),
            };
        }
    };
    let status_label = parsed
        .status
        .clone()
        .unwrap_or_else(|| match env.status {
            200 => "claimed".to_string(),
            409 => "already-claimed".to_string(),
            400 => "malformed".to_string(),
            404 => "not-found".to_string(),
            other => format!("http-{}", other),
        });
    ClaimResult {
        ok: parsed.ok,
        status: status_label,
        bound_hwid: parsed.bound_hwid,
        error: parsed.error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mint_code_deterministic() {
        let a = mint_code_for_hwid("abc123");
        let b = mint_code_for_hwid("abc123");
        assert_eq!(a, b);
        assert_eq!(a.len(), 16); // 10 bytes = 80 bits = 16 base32 chars
    }

    #[test]
    fn mint_code_differs_per_hwid() {
        let a = mint_code_for_hwid("abc123");
        let b = mint_code_for_hwid("abc124");
        assert_ne!(a, b);
    }

    #[test]
    fn verify_accepts_correct_code() {
        let hwid = "deadbeefcafe";
        let code = mint_code_for_hwid(hwid);
        assert!(verify_code(&code, hwid));
    }

    #[test]
    fn verify_rejects_wrong_hwid() {
        let code = mint_code_for_hwid("abc123");
        assert!(!verify_code(&code, "xyz456"));
    }

    #[test]
    fn verify_tolerates_maxx_prefix_and_dashes() {
        let hwid = "deadbeefcafe";
        let code = mint_code_for_hwid(hwid);
        // User pastes "MAXX-XXXX-YYYY-ZZZZ-WWWW" with formatting.
        let chunks: Vec<&str> = (0..code.len()).step_by(4).map(|i| &code[i..(i + 4).min(code.len())]).collect();
        let formatted = format!("MAXX-{}", chunks.join("-"));
        assert!(verify_code(&formatted, hwid));
        // Lowercase + extra spaces.
        assert!(verify_code(&format!("  maxx-{} ", chunks.join("-").to_lowercase()), hwid));
    }

    #[test]
    fn crockford_excludes_ambiguous_chars() {
        for c in "ILOU".chars() {
            assert!(!CROCKFORD.contains(&(c as u8)));
        }
    }

    #[test]
    fn known_vector_for_python_parity() {
        // Lock-step test with scripts/mint-vip-code.py. If you rotate
        // VIP_SECRET, regenerate by running:
        //   python scripts/mint-vip-code.py 00000000000000000000000000000000
        // and update the expected value below.
        let hwid = "00000000000000000000000000000000";
        let code = mint_code_for_hwid(hwid);
        assert_eq!(code.len(), 16);
        assert!(code.chars().all(|c| CROCKFORD.contains(&(c as u8))));
        // Python output: MAXX-1G9T-V5MW-SWZ0-HJXW → bare = "1G9TV5MWSWZ0HJXW"
        assert_eq!(code, "1G9TV5MWSWZ0HJXW", "Rust + Python mint disagreed");
    }

    #[test]
    fn verify_known_python_code() {
        // Same parity vector — verify_code path with the formatted code
        // exactly as the Python script would output to the user.
        let hwid = "00000000000000000000000000000000";
        assert!(verify_code("MAXX-1G9T-V5MW-SWZ0-HJXW", hwid));
        assert!(verify_code("maxx-1g9t-v5mw-swz0-hjxw", hwid));
        assert!(verify_code("  MAXX 1G9T V5MW SWZ0 HJXW ", hwid));
    }
}
