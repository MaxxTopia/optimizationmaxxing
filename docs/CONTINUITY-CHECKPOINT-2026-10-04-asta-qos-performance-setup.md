# Continuity checkpoint - Asta QoS verification and performance setup

Date: 2026-10-05 (release checkpoint refresh)

## Scope and repository state

- Canonical worktree for this task: `C:\Users\Diggy\projects\optimizationmaxxing-hardening`
- Branch: `fix/asta-qos-performance-setup`
- Base commit: `96da444` (`fix: harden Tune Now network verification`)
- This is an isolated hardening worktree. The user's original dirty checkout was not edited.
- Changes are local only: not committed, pushed, deployed, or installed on the user's PC. A local unsigned installer was produced during the release gate; it is not a signed/public release.

## User issue and verified cause

Asta's verified lane was failing and rolling back because `network.qos.dscp-tag` did not pass read-back. A read-only PowerShell check on the current Windows host found Fortnite QoS entries in the local policy store (`optmaxxing-fortnite`, DSCP 46; Windows reports owner `Group Policy (Machine)`), while `Get-NetQosPolicy -PolicyStore ActiveStore` returned no effective policies. The exact app-style wrapped verifier exited 2 and printed that the stored local entry was absent from ActiveStore. This indicates a local stored rule that Windows does not currently report as effective; the source/owner should not be inferred from that label alone.

The read-only check changed nothing on Windows. DSCP 46 is only a packet label and does not prove that the NIC, router, ISP, or game path honors it or that latency improves.

## Changes in this worktree

- PowerShell verification distinguishes a declared `MISMATCH:` from an inability to verify. Other non-zero exits are `unknown`, not false proof of drift. Suppress module progress noise in verifier output.
- Added a native `verify_action` path used by audits for scripts with a catalog read-back contract.
- Fortnite QoS checks both local storage and `ActiveStore`; it will not replace conflicting or stored-but-ineffective matching policies. Asta pre-audits transactional groups and leaves an unknown/unreadable group untouched.
- Asta and the Optimization Lab apply per-tweak atomic groups. A failure in one group should no longer undo unrelated successfully verified groups; UI reports skipped, applied, rolled-back, and unverifiable items separately.
- Situational DSCP/other settings are not silently one-click applied. The Optimization Lab presents them as `Test first` with a controlled comparison workflow.
- Replaced the Optimization Lab lead with Fortnite Performance Setup, readable evidence-oriented render/CPU/network cards, Match Scan guidance, and collapsed advanced/review controls.
- Added the Asta/QoS failure mode and its skip/containment behavior to the root `RESILIENCE.md` risk register and prevention checklist.

## Verification

- `npm run audit:catalog`: passed; catalog v1.9.3, 108 tweaks, 0 errors and 0 warnings.
- `npm run test:bios-evidence`: passed; 9 checks.
- `npx tsc --noEmit`: passed; Vite production build also passed with the existing large-chunk advisory.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml` passed on the E: target with low-debug overrides: 99 passed, 0 failed. The default C: target was not used because it is space-constrained.
- Direct optimized Cargo build passed: `cargo build --offline --locked --manifest-path src-tauri/Cargo.toml --bins --features tauri/custom-protocol --release -vv`.
- `npm run tauri:build -- --ignore-version-mismatches -- --locked` produced `optimizationmaxxing_0.4.16_x64-setup.exe`, but exited 1 because this machine has the Tauri public key without `TAURI_SIGNING_PRIVATE_KEY`. The artifact is therefore unsigned/local-only.
- Exact wrapped PowerShell verifier on current host: exit 2, clean stdout explaining local-vs-effective QoS state, no stderr; read-only.
- `git diff --check`: passed before final checkpoint update; rerun after this edit.
- `cargo fmt --check` reports formatting differences across many baseline/unmodified Rust files. Do not run workspace-wide formatting because it would create unrelated churn; inspect only task changes if formatting is revisited.

## Not proven / user test owed

- No signed/public release exists yet, and no target-PC app build has been installed. The local unsigned installer is at `E:\CodexTemp\optmaxxing_siege_build_20261004\target_release\release\bundle\nsis\optimizationmaxxing_0.4.16_x64-setup.exe`.
- The user's Asta mode must be rerun on the target PC after a package is produced. Confirm the QoS tweak is clearly shown as skipped/unverified and other independent settings are not rolled back.
- Reboot and run the app's persistence audit. Then perform a controlled Fortnite A/B using the same route, build, graphics, cap, driver, and background apps, with repeated captures. Source/build/read-back results alone do not prove improved gameplay or latency.

## Locked safety and performance decisions

- Do not claim a universal strongest/fastest Windows preset or silently apply risky, undocumented, security-degrading, or situational changes. Keep reversibility, live verification, and an explicit test/review path.
- Do not overwrite third-party or externally owned network policy. Do not claim DSCP alone improves ping.
- Separate local source/build/PowerShell read-back proof from packaged release, target-PC reboot persistence, and actual Fortnite results.

## Exact next step

Run the final status/diff checks, stage only the intended 0.4.16 source and continuity files, commit/tag/push under the already-authorized release sequence, and let signed CI produce the public updater artifacts. The remaining user gate is target-PC Asta + reboot persistence verification; gameplay improvement is not claimed from source/build results.
