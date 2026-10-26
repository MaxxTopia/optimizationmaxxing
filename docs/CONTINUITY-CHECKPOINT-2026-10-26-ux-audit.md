# OptimizationMaxxing continuity checkpoint — 2026-10-26 UX and competitive-readiness audit

## Scope

Audit the first-run path, Tune Now/Asta apply flow, and NVIDIA Profile Inspector handoff before claiming the product is ready for competitive users.

## Implemented locally

- Added a native first-run redirect from Dashboard to `/tune` only when the receipt store is empty. Returning users keep Dashboard on launch; a native receipt-read failure safely falls back to Dashboard.
- Replaced the NVIDIA handoff with a guarded two-button native flow in `NvpiManualStepCard`: `Apply Fortnite Extreme NVIDIA Profile` and `Restore Previous NVIDIA Profile`.
- The apply path locates an installed NVIDIA Profile Inspector without scanning or downloading, captures the current customized profiles to a fixed restore file plus timestamped archive, imports the bundled aggressive nine-setting Fortnite `.nip`, exports again, and verifies the expected Fortnite profile block.
- The restore path re-imports the app-owned backup, exports again, and verifies that the saved profile block is present. Both paths use one elevated batch/UAC boundary and keep an explicit user-confirmation step; no silent background driver mutation was added.
- Added `fortnite-extreme.nip` and aligned the catalog row, profile metadata, and verifier guidance. The profile uses normal NVIDIA driver controls with explicit image-quality/shimmer tradeoffs; it does not claim to control Fortnite item/object culling.
- Added separate guidance for farther item visibility: use Fortnite's View Distance setting, because Unreal/Fortnite culling is game-side and cannot be reliably increased through NVPI.
- Kept Asta/Tune catalog writes read-back-safe and explicit. The automatic NVIDIA card is available only in the native/VIP path; the manual download panel remains a fallback.

## Verification

Passed in `C:\Users\Diggy\projects\optimizationmaxxing-v0.4.27-copyfix`:

- `npm run build`
- `npm run audit:catalog`
- `npm run audit:asta-policy`
- `npm run audit:driver-profiles`
- `npm run test:powershell-contracts`
- `npm run test:bios-evidence`
- `cargo test --manifest-path src-tauri/Cargo.toml` — 107 passed, 0 failed, including NVPI parser and verification tests
- `rustfmt --check --edition 2021 src-tauri/src/nvpi.rs`
- `git diff --check` — clean; only pre-existing generated-schema line-ending warnings were reported by Git
- Release metadata is synchronized at `0.4.35` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`; the top changelog entry is present.
- `npm run tauri:build` compiled the frontend, native executable, signed NSIS installer, and updater signature after the documented local signing key was restored for the release build.
- The built executable at `src-tauri/target/release/optimizationmaxxing.exe` launched and its accessibility surface reported `0.4.35`, the new changelog entry, the detected test PC, and the new NVPI feature surface. This is source/build/runtime smoke evidence only; no Windows or NVIDIA setting was applied.
- Release CI run `40327556562` completed successfully. GitHub release `v0.4.35` is published with `latest.json`, `optimizationmaxxing_0.4.35_x64-setup.exe`, and its `.sig`; the updater manifest reports version `0.4.35` and a signature.
- MaxxTopia sync run `40328794730` completed successfully, and both public optimizationmaxxing pages now reference the `0.4.35` installer.

## State and limits

- The release source is committed as `de1e93a7a971b0869e83ffc01ed9e1715b0216f4` on `main`, tagged `v0.4.35`, and pushed. The follow-up continuity-only change is intentionally separate and must not retag the release.
- Installed `C:\Program Files\optimizationmaxxing\optimizationmaxxing.exe` was left untouched during this task, so it may still be the existing 0.4.34 build until the signed 0.4.35 installer is installed.
- Desktop accessibility capture launched the built app and confirmed the new runtime version, but interactive capture timed out and did not permit a reliable Asta/Tune click/run. No live Windows write, NVIDIA import, reboot-persistence proof, Fortnite/Valorant FPS, 1% lows, input-to-pixel, or build-registration proof was claimed.
- The repository-wide `cargo fmt -- --check` still reports pre-existing formatting differences in unrelated Rust files; the new NVPI module has a targeted clean `rustfmt` check and unrelated files were not reformatted.
- The Asta composite remains a host proxy, not game proof. NVPI export verification proves the driver profile block was written/read back; it does not prove Fortnite FPS, input latency, or object draw distance.

## Next action

Install or update the signed `v0.4.35` package on the test PC, reopen the app, and verify first-run routing plus both automatic-NVIDIA buttons. Then run a no-write Asta Bench and, separately, a controlled Fortnite/Valorant capture using the same scene, cap, driver, route, and background load. Publishing is complete; UAC/registry/NVIDIA application, reboot persistence, and gameplay proof remain separate human/runtime gates.
