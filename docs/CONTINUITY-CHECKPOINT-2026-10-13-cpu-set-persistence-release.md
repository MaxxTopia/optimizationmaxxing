# Optimizationmaxxing continuity checkpoint - CPU-set persistence release (2026-10-13)

## Scope

This checkpoint covers the requested repair for the background game CPU-set watcher:

- verify CPU-set writes against the live process assignment instead of treating a successful API call as proof;
- detect external drift while the watcher is running and re-apply the selected verified set;
- persist watcher rules atomically and read them back before reporting success;
- reconcile the Windows sign-in entry and verify both creation and removal;
- make the UI say `VERIFIED LIVE` only when live read-back succeeded;
- publish the focused patch as v0.4.26 after the existing release checks.

## Repository boundary and state

- Canonical worktree: `C:\Users\Diggy\projects\optimizationmaxxing-hardening`
- Branch at preparation: `fix/asta-qos-performance-setup`
- Older checkout `C:\Users\Diggy\projects\optimizationmaxxing` is intentionally untouched because it contains unrelated dirty WIP.
- No credentials, user data, or unrelated files were changed.

## Implementation

- `src-tauri/src/cpusets.rs` now validates requested IDs against the current topology, reads the process assignment back with `GetProcessDefaultCpuSets`, and returns `verified` plus the applied IDs.
- `src-tauri/src/auto_pin.rs` now saves configuration through a flushed temporary file and atomic replacement, compares the read-back config, verifies the HKCU Run entry, and repairs live CPU-set drift during polling.
- `src/lib/tauri.ts` and `src/components/AutoPinSection.tsx` expose the verification fields and explain that the watcher repairs drift while it is running.
- Version and changelog files are aligned to `0.4.26`.

## Verification

Passed before publish:

- `npx tsc --noEmit`
- `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` - 103 tests, 0 failures
- `npm run audit:catalog` - 108 tweaks, 0 errors, 0 warnings
- `npm run audit:driver-profiles`
- `npm run test:bios-evidence`
- `git diff --check`
- ASCII scan of shipped PowerShell, batch, and command scripts
- `npm run tauri:build` frontend and native release compilation; local NSIS bundle created

The local build exits only at the existing updater-signing step because the private signing key is intentionally available to CI rather than this workstation. CI is the signing and public-release proof path.

## Release and live proof

- Commit: `62f6037` (`fix: verify persistent CPU-set watcher state`)
- Published tag and main commit: `v0.4.26` / `62f6037950724c13f0ce8313db0dd98e35c90a7f`
- GitHub Actions release run `38473723288` passed in 9m46s.
- Public release: https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.26
- Release is non-draft and non-prerelease and contains the NSIS installer, `.exe.sig`, and `latest.json`.
- Public updater manifest reports version `0.4.26` and points both Windows channels at the signed installer.
- MaxxTopia sync run `38474834860` passed. The public `/optimizationmaxxing` download page now resolves to the v0.4.26 installer after cache/deployment propagation.

## Remaining user gate

The published build cannot prove a particular PC's UAC context, reboot persistence, CPU-set topology, or Fortnite frame-time/input result. Diggy's test gate is: install/update v0.4.26, configure a Fortnite rule, confirm the green `VERIFIED LIVE` state, reboot, confirm the watcher starts and repairs a deliberately changed assignment if practical, then compare the same controlled Fortnite scene/settings/cap.

## Best next action

Have Diggy install/update v0.4.26 and test the watcher on the target rig; retain the release and target-PC evidence as separate claims.
