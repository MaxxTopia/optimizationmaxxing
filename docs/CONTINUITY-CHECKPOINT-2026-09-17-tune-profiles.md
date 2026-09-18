# Optimizationmaxxing continuity checkpoint — 2026-09-17

## Scope

This checkpoint records the repository-wide audit and hardening pass for Tune Now, hardware-aware RAM guidance, reversible verification, NVIDIA profile downloads, and the Windows/Fortnite/CPU/OS/equipment research surface.

Repository: `C:\Users\Diggy\projects\optimizationmaxxing`

Branch/state at checkpoint: `main`, HEAD `289969e` (`docs: record v0.4.4 live state`). The source changes below are unstaged and uncommitted. No commit, push, publish, Worker deploy, or public release was performed.

## Worktree boundary

These pre-existing Worker and continuity/demo changes were preserved and not intentionally edited as part of this pass:

- `vip-worker/README.md`
- `vip-worker/worker.js`
- `_CONTENT-FRESHNESS-AUDIT-2026-06-27.md`
- `_IF-YOU-LOSE-CLAUDE.txt`
- `_PAWNIO-UPGRADE-SCOPE-2026-07-04.md`
- `_demo_work/`

The application, native engine, catalog, research, and UI changes remain in the working tree for review. Existing unrelated dirty files must stay untouched until separately reviewed.

## Implemented behavior

- Added profile-aware Tune Now policies: Light, Competitive, Aggressive, and Extreme. The initial hardware scan recommends a profile, while the user can change it before planning.
- Made the plan game-aware. Fortnite is the default target; game-specific actions are not applied to unrelated games or a Windows-baseline run.
- Aggressive and Extreme require VIP and explicit confirmation. Extreme is the most aggressive eligible OS/driver/peripheral cleanup lane, but it does not bypass security, anti-cheat, tournament, debug, cosmetic, static game-config, BIOS, voltage, thermal-limit, or unsafe-readback policies.
- Kept manual RAM timing/voltage recipes in a clearly labeled, BIOS-only worksheet/VIP lane. They are not native actions and are never part of Tune Now.
- Native apply receipts now carry `verified`, `mismatch`, or `unknown` status and a detail string. Registry, BCD, exact file, and display-refresh actions have native read-back. Generic PowerShell actions remain `unknown` unless they have an allow-listed read-only verifier.
- A verification mismatch remains an active receipt with its captured pre-state. This preserves rollback and lets drift/reapply repair the state; the mismatch status still prevents Tune Now from treating it as ready.
- Tune Now re-scans existing receipts before planning. Drifted actions are eligible for repair; matching actions are skipped. Repaired actions preserve the oldest active rollback snapshot rather than replacing the original baseline with a drifted state.
- Added a deny-by-default PowerShell verifier allow-list for supported network/NIC, power, DPC/interrupt, PCIe/USB, core-parking, MM-agent, MSI, and RGB-autostart actions. Unsupported or inconclusive verification is surfaced instead of being claimed as proven.
- Fixed the tournament power-plan action so it activates the newly created plan after cloning it; revert still removes only the named clone.
- Added per-DIMM RAM inventory from WMI plus readiness logic that distinguishes CPU tuning from memory tuning, checks kit identity, board/BIOS, DIMM layout, rated profile state, and SPD die consistency. Numeric worksheet hints stay hidden when the hardware evidence is insufficient.
- Refreshed catalog to `v1.9.2`: 100 tweaks and 126 actions. Audit reports zero errors and zero warnings.
- Added two bounded NVIDIA Profile Inspector downloads: a four-setting Fortnite latency baseline and a separate seven-setting clean-render lab profile. Neither edits Fortnite files, removes foliage/clouds/terrain, changes visibility, or bypasses anti-cheat.
- Documented `RMInstLoc` as an NVIDIA resource-manager memory-placement bitfield, not a universal latency switch. It remains an evidence-gated lab experiment and is not in Tune Now defaults.
- Refreshed OS, Windows branch, Intel/AMD CPU, BIOS, RAM, NVIDIA, network, monitor, SSD, and equipment guidance with source/evidence boundaries and controlled-test language.
- Corrected the Upgrade Advisor's stale 9800X3D-as-the-outright-winner claim. The current top-end AMD reference is Ryzen 9 9950X3D2 Dual Edition, but the app now calls it a platform option rather than a Fortnite guarantee and keeps CPU-bound measurement ahead of a 14900KF platform swap.
- Reworked stale competitor comparison copy in Pricing, Toolkit, monitor/network cards, and Next Steps so unverified bundle-size, FPS, latency, and competitor claims are presented as measured-or-current-audit requirements rather than facts.
- Replaced the Sonic hero launcher/cannon with the floating mascot treatment using the original Spritecannon `fastboi__super.png` raster. A CSS-rendered Sharingan eye overlay was removed after visual review because the untouched source sprite gives the mascot a cleaner, intact face at the dashboard scale.

## Verification completed locally

- `npx tsc --noEmit` — passed.
- `npm run build` — passed; 203 modules. Existing warning: the main Vite chunk is about 1.26 MB after minification.
- `cargo test --manifest-path src-tauri/Cargo.toml` — 85 passed, 0 failed, 0 ignored, including a regression test that keeps mismatch receipts revertible and preserves the original baseline through repair; only the existing unused `run_elevated_batch` and `ps_quote` warnings remain.
- `npm run audit:catalog` — catalog `v1.9.2`, 100 tweaks, risk `1:52, 2:38, 3:9, 4:1`, 0 errors, 0 warnings.
- `git diff --check` — passed; Git only reported normal LF-to-CRLF working-copy notices.
- `npm run tauri:build` — native release compilation and NSIS bundle creation succeeded after the final mascot change, producing unsigned local artifacts:
  - `src-tauri\target\release\optimizationmaxxing.exe`, 21,764,096 bytes, SHA-256 `BCEA1C70D9E4DA3FBE58B4EDCFC710A94268EB1F14507915C95111337F99D202`
  - `src-tauri\target\release\bundle\nsis\optimizationmaxxing_0.4.5_x64-setup.exe`, 11,477,385 bytes, SHA-256 `5BB67A8EF6202EC58EBB221607399736D68754946563596ED57F497ED272C70E`
- The build command exits 1 only at the existing updater-signing step because a public key is configured but `TAURI_SIGNING_PRIVATE_KEY` is not present. No signing key was created, changed, or published. CI remains the signing/publish path.
- Browser smoke-tested `/`, `/pricing`, `/toolkit`, `/tune`, `/diagnostics`, `/hardware`, and `/tweaks`; the browser console had no error or warning entries. Desktop-only actions correctly remained disabled outside the Tauri shell.

## Confidence audit result

The app is stronger than a blind tweak pack in catalog eligibility, reversible snapshots, verification receipts, and drift-aware repair. It is not yet a complete replacement for these focused tools and capabilities:

- Process Lasso / Game Optimizer: persistent game-launch automation, process priority, and affinity rules.
- CapFrameX / PresentMon: long-run frame-time capture, comparison, aggregation, and export workflow.
- LatencyMon: deep DPC/ISR driver ranking and sustained latency diagnosis.
- WinUtil: broad Windows app/install/update/fix management.
- Atlas-style OS modification: an intentionally excluded custom-OS/build pipeline; the app keeps security, updates, Secure Boot, TPM, and anti-cheat eligibility in scope.

These are roadmap gaps, not reasons to add unverified registry folklore. The next high-value engineering work is a measured runtime/session layer that can launch or observe Fortnite, capture PresentMon-style frame-time data, correlate DPC/ISR observations, and apply persistent per-game rules only after a baseline and explicit opt-in.

## Guidance encoded in the app

- Recommended starting point: stock, fully patched Windows 11 on a supported branch. Windows 11 25H2 is the conservative baseline for a controlled Fortnite comparison; test 26H1 on the same hardware rather than assuming it is faster. Windows 10 standard support ended 2025-10-14; Windows 11 24H2 remains supported until 2026-10-13 but is not the preferred fresh-install baseline.
- Windows X-Lite UltraLite and similar stripped builds are not recommended as the primary competitive/tournament install because their own documentation lists removed or unsupported updates, Defender, BitLocker, backup/restore, and optional features. Atlas, ReviOS, Tiny11, and Ghost Spectre remain lab-only comparison subjects.
- Do not build a custom OS yet. First establish a repeatable same-rig baseline while preserving security, updates, recovery, Secure Boot, TPM, and IOMMU eligibility.
- For an i9-14900KF, use the latest motherboard BIOS, Intel Default Settings, and current Intel microcode/firmware guidance. Intel APO is optional; Fortnite is not currently on Intel's official advanced-game list.
- AMD guidance identifies the Ryzen 9 9950X3D2 as available and the Ryzen 7 7700X3D as announced. No official consumer Zen 6 release date was found, so the app does not turn rumor dates into buying advice.

## Still unverified / Diggy-owned gates

These are not proven by TypeScript, Rust tests, fixtures, or a successful command return:

- A real UAC elevation and native registry/BCD/file/display apply-and-revert cycle on the target Windows installation.
- Reboot persistence and drift detection after Windows Update, driver update, display-mode changes, or an application repair.
- Actual Fortnite replay/Creative measurement: input-to-photon, frame-time/1% lows, DPC/ISR latency, network bufferbloat, capture-card path, and dual-PC routing.
- Anti-cheat and tournament eligibility on the actual account/device after any experimental profile; Secure Boot, TPM, IOMMU, and hardware-ID integrity must remain intact.
- A same-rig OS comparison between stock Windows 11 and X-Lite/custom builds. No universal input-delay or FPS claim is justified without this controlled test.
- VIP redemption/provider behavior and any public release/update path.
- A complete competitor-parity runtime capture/auto-apply layer; the current audit deliberately does not claim parity with Process Lasso, CapFrameX, or LatencyMon.

## Exact next action

Run the current development or unsigned local build on the real rig. Capture a baseline, scan the PC, select Fortnite and the desired profile, apply the plan, inspect every verification receipt, reboot, run the drift scan, and repeat a controlled Fortnite test using the same scene/settings/cap. Only after that evidence should a commit, CI-signed release, or public deployment be considered.

Keep an off-machine copy of this checkpoint and the repository for real disaster recovery; the local continuity file is not a backup.

## 2026-09-17 follow-up - restore source mascot raster

- Verified the app asset and Spritecannon source asset are byte-for-byte identical: SHA-256 `8DFE40F9431DD7D1A529B578523C050C40CE2D64F885B2D8D470D2D6DC5B4F5E`.
- Removed the extra CSS eye reconstruction from `src/components/SonicFastboi.tsx` and `src/index.css`; the live Sonic dashboard now renders the original Fastboi face with no broken overlay, yellow speed streak, or launcher/cannon.
- Live localhost `/` screenshot verification passed and the browser returned an empty error/warning log (`[]`). `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed after the fix.
- Rebuilt the exact native source with `npm run tauri:build`: optimized executable and NSIS installer were produced, and the exact executable launched with `Responding=True` before being stopped. Final local artifact hashes are executable `D1C9295836376381C2F07B3C8C68D3F01ECE6B927CB6A2569A20CA885CFC1ADF` and installer `02CDA662A3E5023D715F62A74339325EB764BED57C33756905E0CF7CE1D47B9D`.
- The build exits only at the existing updater-signing step because `TAURI_SIGNING_PRIVATE_KEY` is absent. This follow-up remains local-only: no commit, push, public deploy, or release was performed, and no signing key was created or inspected.

## 2026-09-17 follow-up - reboot persistence proof and release candidate

- Added a persisted two-phase reboot validation flow. The app arms the exact active receipt IDs with uptime/build metadata before restart, auto-checks the marker on native startup, and only calls persistence verified when Windows uptime demonstrably decreases and every armed receipt reads back as `verified`.
- A pending check remains `awaiting_reboot` until a real reboot is observed; a completed report is immutable until the user arms a new check. Drift is reported and is never silently reapplied by the proof flow.
- Added the native commands and Diagnostics card: `get_reboot_validation`, `arm_reboot_validation`, and `validate_reboot_persistence`. Added the narrow regression test `reboot_validation_tests::only_a_lower_uptime_proves_a_reboot`.
- Current verification: `npx tsc --noEmit` passed; `npm run build` passed (207 modules); `npm run audit:catalog` passed with 100 tweaks, 0 errors, and 0 warnings; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 86 tests and 0 failures; `git diff --check` passed.
- The current native build created an unsigned executable and NSIS installer and the executable launched with `Responding=True`:
  - `src-tauri\\target\\release\\optimizationmaxxing.exe`, 21,869,056 bytes, SHA-256 `E9AF66E377FF4056166B3020D380D22567B09C3FCBFEF6743D0C1DC4FC2D0B22`
  - `src-tauri\\target\\release\\bundle\\nsis\\optimizationmaxxing_0.4.5_x64-setup.exe`, 11,495,359 bytes, SHA-256 `7AF3ED1B6CDA7427FADA59F6A3B148EAE4E74DB9F165D57A077E50128F8368C0`
- The local `tauri:build` command still exits only at the configured updater-signing step because the private signing key is intentionally absent. No signing key was created, inspected, or added. CI is the only intended signer.
- Diggy explicitly authorized publishing the focused v0.4.5 release after these checks. The target release scope is the application/catalog/research/native/UI work in this tree; the dirty `vip-worker` files, continuity/demo attachments, and unrelated untracked continuity files remain excluded.
- This PC has not had any optimization applied and has not been rebooted. A published release is not device proof; the next device gate is to use the native app to capture a baseline, apply a deliberately selected profile, arm the reboot proof, restart Windows, and inspect every receipt after startup.
