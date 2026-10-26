//! Bounded NVIDIA Profile Inspector integration.
//!
//! NVPI owns the NVIDIA driver profile database, so this module deliberately
//! keeps the boundary small: locate an already-installed executable in common
//! user-selected locations, export the current customized profiles, import
//! one app-owned Fortnite profile, export again, and compare the exported
//! Fortnite block with the requested values. It never downloads NVPI, scans
//! the whole disk, edits the driver database directly, or claims that an
//! exported value proves an in-game FPS or latency improvement.

use anyhow::{anyhow, Context, Result};
use base64::Engine;
use chrono::Utc;
use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::engine::elevation;

const FORTNITE_EXTREME_PROFILE: &str =
    include_str!("../../public/nvpi-profiles/fortnite-extreme.nip");
const PROFILE_ID: &str = "fortnite-extreme";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NvpiStatus {
    pub available: bool,
    pub executable_path: Option<String>,
    pub backup_available: bool,
    pub backup_path: String,
    pub managed_profile_path: String,
    pub profile_id: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NvpiOperationResult {
    pub status: String,
    pub executable_path: Option<String>,
    pub backup_path: Option<String>,
    pub profile_path: Option<String>,
    pub verified: bool,
    pub detail: String,
}

fn data_root() -> PathBuf {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join("optmaxxing")
        .join("nvpi")
}

fn managed_profile_path() -> PathBuf {
    data_root().join("managed").join("fortnite-extreme.nip")
}

fn backup_path() -> PathBuf {
    data_root().join("backups").join("fortnite-previous.nip")
}

fn backup_archive_path(stamp: &str) -> PathBuf {
    data_root()
        .join("backups")
        .join(format!("fortnite-before-{stamp}.nip"))
}

fn after_path() -> PathBuf {
    data_root().join("state").join("fortnite-after.nip")
}

fn restored_path() -> PathBuf {
    data_root().join("state").join("fortnite-after-restore.nip")
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn push_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !path.is_file() {
        return;
    }
    let key = path.to_string_lossy().to_ascii_lowercase();
    if candidates
        .iter()
        .all(|candidate| candidate.to_string_lossy().to_ascii_lowercase() != key)
    {
        candidates.push(path);
    }
}

/// Locate only an executable the user has already installed. This intentionally
/// does not recursively search a drive or download an untrusted binary.
fn locate_nvpi() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    let exe_name = "nvidiaProfileInspector.exe";

    let env_dirs = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"];
    for variable in env_dirs {
        if let Some(base) = env::var_os(variable).map(PathBuf::from) {
            push_candidate(&mut candidates, base.join(exe_name));
            push_candidate(
                &mut candidates,
                base.join("nvidiaProfileInspector").join(exe_name),
            );
            push_candidate(
                &mut candidates,
                base.join("NVIDIA Profile Inspector").join(exe_name),
            );
        }
    }

    if let Some(user_profile) = env::var_os("USERPROFILE").map(PathBuf::from) {
        let downloads = user_profile.join("Downloads");
        let documents = user_profile.join("Documents");
        for folder in [&downloads, &documents] {
            push_candidate(&mut candidates, folder.join(exe_name));
            push_candidate(
                &mut candidates,
                folder.join("nvidiaProfileInspector").join(exe_name),
            );
            push_candidate(
                &mut candidates,
                folder.join("NVIDIA Profile Inspector").join(exe_name),
            );
            // One directory level covers the normal extracted GitHub archive
            // without turning this into a whole-disk scan.
            if let Ok(entries) = fs::read_dir(folder) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        push_candidate(&mut candidates, path.join(exe_name));
                    }
                }
            }
        }
    }

    if let Ok(output) = Command::new("where.exe").arg(exe_name).output() {
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let path = PathBuf::from(line.trim());
                push_candidate(&mut candidates, path);
            }
        }
    }

    candidates.into_iter().next()
}

fn decode_profile(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    String::from_utf8_lossy(bytes).into_owned()
}

fn read_profile(path: &Path) -> Result<String> {
    let bytes =
        fs::read(path).with_context(|| format!("reading NVPI export {}", path_text(path)))?;
    Ok(decode_profile(&bytes))
}

fn profile_block<'a>(text: &'a str) -> Option<&'a str> {
    let lower = text.to_ascii_lowercase();
    let mut cursor = 0;
    while let Some(relative_start) = lower[cursor..].find("<profile>") {
        let start = cursor + relative_start;
        let relative_end = lower[start..].find("</profile>")?;
        let end = start + relative_end + "</profile>".len();
        let block = &text[start..end];
        if tag_value(block, "profilename")
            .map(|name| name.trim().eq_ignore_ascii_case("fortnite"))
            .unwrap_or(false)
        {
            return Some(block);
        }
        cursor = end;
    }
    None
}

fn tag_value(text: &str, tag: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = lower.find(&open)? + open.len();
    let end = lower[start..].find(&close)? + start;
    Some(text[start..end].trim().to_string())
}

fn setting_pairs(text: &str) -> Vec<(String, String)> {
    let lower = text.to_ascii_lowercase();
    let mut pairs = Vec::new();
    let mut cursor = 0;
    while let Some(relative_start) = lower[cursor..].find("<profilesetting>") {
        let start = cursor + relative_start;
        let Some(relative_end) = lower[start..].find("</profilesetting>") else {
            break;
        };
        let end = start + relative_end + "</profilesetting>".len();
        let block = &text[start..end];
        if let (Some(id), Some(value)) = (
            tag_value(block, "settingid"),
            tag_value(block, "settingvalue"),
        ) {
            pairs.push((id.to_ascii_lowercase(), value.to_ascii_lowercase()));
        }
        cursor = end;
    }
    pairs
}

fn expected_pairs() -> Vec<(String, String)> {
    profile_block(FORTNITE_EXTREME_PROFILE)
        .map(setting_pairs)
        .unwrap_or_default()
}

fn matching_pair_count(export: &str, expected: &[(String, String)]) -> Option<usize> {
    let block = profile_block(export)?;
    let actual = setting_pairs(block);
    Some(expected.iter().filter(|pair| actual.contains(pair)).count())
}

fn verify_extreme_export(export: &str) -> (bool, usize, usize) {
    let expected = expected_pairs();
    let matched = matching_pair_count(export, &expected).unwrap_or(0);
    (
        expected.len() > 0 && matched == expected.len(),
        matched,
        expected.len(),
    )
}

fn verify_backup_export(export: &str) -> (bool, usize, usize) {
    let Some(block) = profile_block(export) else {
        return (false, 0, 0);
    };
    let expected = setting_pairs(block);
    let matched = matching_pair_count(export, &expected).unwrap_or(0);
    (
        expected.len() > 0 && matched == expected.len(),
        matched,
        expected.len(),
    )
}

fn powershell_literal(path: &Path) -> String {
    format!("'{}'", path_text(path).replace('\'', "''"))
}

fn encoded_powershell_line(script: &str) -> String {
    let utf16: Vec<u8> = script
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    let encoded = base64::engine::general_purpose::STANDARD.encode(utf16);
    format!(
        "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encoded}"
    )
}

fn apply_script(
    executable: &Path,
    profile: &Path,
    backup: &Path,
    archive: &Path,
    after: &Path,
) -> String {
    format!(
        "$ErrorActionPreference='Stop'; $nvpi={}; $profile={}; $backup={}; $archive={}; $after={}; $exportDirectory=Split-Path -Parent $nvpi; function Invoke-Nvpi([string[]]$Arguments){{ $p=Start-Process -FilePath $nvpi -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden; if($p.ExitCode -ne 0){{ throw ('NVIDIA Profile Inspector exited with code '+$p.ExitCode) }} }}; function Copy-Latest([string]$Destination){{ $candidate=Get-ChildItem -LiteralPath $exportDirectory -Filter '*.nip' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if($null -eq $candidate){{ throw 'NVIDIA Profile Inspector did not export a .nip file.' }}; Copy-Item -LiteralPath $candidate.FullName -Destination $Destination -Force }}; Invoke-Nvpi @('-exportCustomized'); Copy-Latest $backup; Copy-Latest $archive; Invoke-Nvpi @('-silentImport',$profile); Invoke-Nvpi @('-exportCustomized'); Copy-Latest $after",
        powershell_literal(executable),
        powershell_literal(profile),
        powershell_literal(backup),
        powershell_literal(archive),
        powershell_literal(after),
    )
}

fn restore_script(executable: &Path, backup: &Path, after: &Path) -> String {
    format!(
        "$ErrorActionPreference='Stop'; $nvpi={}; $backup={}; $after={}; $exportDirectory=Split-Path -Parent $nvpi; function Invoke-Nvpi([string[]]$Arguments){{ $p=Start-Process -FilePath $nvpi -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden; if($p.ExitCode -ne 0){{ throw ('NVIDIA Profile Inspector exited with code '+$p.ExitCode) }} }}; function Copy-Latest([string]$Destination){{ $candidate=Get-ChildItem -LiteralPath $exportDirectory -Filter '*.nip' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if($null -eq $candidate){{ throw 'NVIDIA Profile Inspector did not export a .nip file.' }}; Copy-Item -LiteralPath $candidate.FullName -Destination $Destination -Force }}; Invoke-Nvpi @('-silentImport',$backup); Invoke-Nvpi @('-exportCustomized'); Copy-Latest $after",
        powershell_literal(executable),
        powershell_literal(backup),
        powershell_literal(after),
    )
}

fn run_elevated_script(script: String) -> Result<()> {
    let line = encoded_powershell_line(&script);
    let output = elevation::run_elevated_capture_lines(&[line])?
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("elevated NVPI operation returned no result"))?;
    if output.exit_code != 0 {
        let detail = output.output.trim();
        if detail.is_empty() {
            return Err(anyhow!(
                "elevated NVPI operation failed with exit code {}",
                output.exit_code
            ));
        }
        return Err(anyhow!(
            "elevated NVPI operation failed with exit code {}: {}",
            output.exit_code,
            detail
        ));
    }
    Ok(())
}

pub fn status() -> Result<NvpiStatus> {
    let backup = backup_path();
    let executable = locate_nvpi();
    let detail = match &executable {
        Some(path) => format!("NVIDIA Profile Inspector found at {}.", path_text(path)),
        None => "NVIDIA Profile Inspector was not found in the common install, Downloads, Documents, or PATH locations.".into(),
    };
    Ok(NvpiStatus {
        available: executable.is_some(),
        executable_path: executable.as_deref().map(path_text),
        backup_available: backup.is_file(),
        backup_path: path_text(&backup),
        managed_profile_path: path_text(&managed_profile_path()),
        profile_id: PROFILE_ID.into(),
        detail,
    })
}

pub fn apply_fortnite_extreme() -> Result<NvpiOperationResult> {
    let Some(executable) = locate_nvpi() else {
        return Ok(NvpiOperationResult {
            status: "notFound".into(),
            executable_path: None,
            backup_path: None,
            profile_path: Some(path_text(&managed_profile_path())),
            verified: false,
            detail: "NVIDIA Profile Inspector was not found. Download and extract it, then use Refresh detection and try again.".into(),
        });
    };

    let root = data_root();
    let profile = managed_profile_path();
    let backup = backup_path();
    let after = after_path();
    let stamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let archive = backup_archive_path(&stamp);
    fs::create_dir_all(profile.parent().unwrap_or(&root))
        .context("creating managed NVPI directory")?;
    fs::create_dir_all(backup.parent().unwrap_or(&root))
        .context("creating NVPI backup directory")?;
    fs::create_dir_all(after.parent().unwrap_or(&root)).context("creating NVPI state directory")?;
    fs::write(&profile, FORTNITE_EXTREME_PROFILE)
        .context("writing managed Fortnite NVPI profile")?;

    run_elevated_script(apply_script(
        &executable,
        &profile,
        &backup,
        &archive,
        &after,
    ))
    .with_context(|| {
        format!(
            "applying Fortnite profile through {}",
            path_text(&executable)
        )
    })?;

    let exported = read_profile(&after)?;
    let (verified, matched, expected) = verify_extreme_export(&exported);
    let detail = if verified {
        format!(
            "Fortnite Extreme profile imported. The exported NVPI profile matched {matched}/{expected} requested settings. Backup saved at {}. This verifies the driver-profile export, not Fortnite FPS, item draw distance, or input latency.",
            path_text(&backup)
        )
    } else {
        format!(
            "NVPI completed, but the exported Fortnite profile matched only {matched}/{expected} requested settings. The driver may have ignored or rewritten one or more values; restore the previous profile or review the export before playing."
        )
    };
    Ok(NvpiOperationResult {
        status: if verified { "applied" } else { "failed" }.into(),
        executable_path: Some(path_text(&executable)),
        backup_path: Some(path_text(&backup)),
        profile_path: Some(path_text(&profile)),
        verified,
        detail,
    })
}

pub fn restore_fortnite() -> Result<NvpiOperationResult> {
    let Some(executable) = locate_nvpi() else {
        return Ok(NvpiOperationResult {
            status: "notFound".into(),
            executable_path: None,
            backup_path: Some(path_text(&backup_path())),
            profile_path: None,
            verified: false,
            detail: "NVIDIA Profile Inspector was not found. Restore cannot run until the extracted NVPI executable is available.".into(),
        });
    };
    let backup = backup_path();
    if !backup.is_file() {
        return Ok(NvpiOperationResult {
            status: "noBackup".into(),
            executable_path: Some(path_text(&executable)),
            backup_path: Some(path_text(&backup)),
            profile_path: None,
            verified: false,
            detail: "There is no OptimizationMaxxing NVPI backup yet. Apply the Fortnite Extreme profile once to create one.".into(),
        });
    }

    let after = restored_path();
    fs::create_dir_all(after.parent().unwrap_or_else(|| Path::new(".")))
        .context("creating NVPI restore state directory")?;
    run_elevated_script(restore_script(&executable, &backup, &after)).with_context(|| {
        format!(
            "restoring the previous NVPI profile through {}",
            path_text(&executable)
        )
    })?;

    let exported = read_profile(&after)?;
    let backup_export = read_profile(&backup)?;
    let (verified, matched, expected) = verify_backup_export(&backup_export);
    let restored_matches = verified
        && matching_pair_count(
            &exported,
            &setting_pairs(profile_block(&backup_export).unwrap_or_default()),
        ) == Some(expected);
    Ok(NvpiOperationResult {
        status: if restored_matches {
            "restored"
        } else {
            "failed"
        }
        .into(),
        executable_path: Some(path_text(&executable)),
        backup_path: Some(path_text(&backup)),
        profile_path: None,
        verified: restored_matches,
        detail: if restored_matches {
            format!("Previous customized NVIDIA profiles were restored and the exported Fortnite block matched {matched}/{expected} backup settings.")
        } else {
            format!("NVPI ran, but the exported profile did not match all {expected} settings from the saved backup ({matched} backup settings were readable). Review the export before playing.")
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_extreme_profile_has_expected_fortnite_settings() {
        let expected = expected_pairs();
        assert_eq!(expected.len(), 9);
        let (verified, matched, count) = verify_extreme_export(FORTNITE_EXTREME_PROFILE);
        assert!(verified);
        assert_eq!(matched, count);
    }

    #[test]
    fn utf16_profile_exports_are_decoded() {
        let bytes: Vec<u8> = [0xFF, 0xFE, b'<', 0, b'F', 0, b'>', 0]
            .into_iter()
            .collect();
        assert_eq!(decode_profile(&bytes), "<F>");
    }

    #[test]
    fn powershell_paths_are_single_quoted_safely() {
        let path = Path::new(r"C:\Users\O'Reilly\Fortnite.nip");
        assert_eq!(
            powershell_literal(path),
            "'C:\\Users\\O''Reilly\\Fortnite.nip'"
        );
    }
}
