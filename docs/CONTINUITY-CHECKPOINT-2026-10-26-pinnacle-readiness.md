# OptimizationMaxxing Pinnacle Readiness Checkpoint

Date: 2026-10-26
Branch: `codex/pinnacle-v0.4.36`

## Scope

Strengthen the existing Asta one-click Fortnite path and make the automatic,
experimental, manual, and unsupported boundaries understandable and auditable.

## Changes in this checkpoint

- Added `PinnacleCoverageCard` to Asta. It reports live-plan counts and explains
  what the automatic lane can prove, what stays optional, and what is outside
  app control (BIOS, router/ISP, firmware, and physical hardware).
- Clarified CPU Sets: all detected sets remain the default starting point;
  Windows IDs such as 56 are scheduler labels; efficiency classes are topology
  metadata; P-core selection is an explicit A/B test.
- Added `scripts/audit-pinnacle-coverage.mjs` and the npm script
  `audit:pinnacle-coverage`. It protects the core Fortnite capability rows and
  the Asta automatic-lane source boundary; the release workflow now runs this
  audit before packaging.
- Bumped the release metadata to 0.4.36 and added the changelog entry.
- Corrected the coverage copy so excluded hardware/game rows are not described
  as unavailable capabilities, and renamed the audit output so source-policy
  references are not mistaken for the total automatic count.

## Verification performed

- `git diff --check` — passed.
- `npm run audit:driver-profiles` — passed.
- `npm run audit:pinnacle-coverage` — passed: 11/11 required capabilities.
- `npm run audit:catalog` — passed: 108 rows, 0 errors/warnings.
- `npm run audit:asta-policy` — passed: 14 named Pinnacle defaults, 0 errors.
- `npm run test:powershell-contracts` — passed: 24 actions classified.
- `npm run test:bios-evidence` — passed: 9 checks.
- `npx tsc --noEmit` and `npm run build` — passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` — passed: 107 tests.
- `npm run tauri:build` — compiled the frontend, native executable, and NSIS
  installer at `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.4.36_x64-setup.exe`.
  The local command stopped only at the existing updater-signing boundary
  because this worktree has no `TAURI_SIGNING_PRIVATE_KEY`; CI is the intended
  signer.
- Clean-machine UAC, reboot persistence, NVPI/manual flow, and same-scene
  Fortnite/Valorant Match Scan remain field gates; a local build cannot prove
  those outcomes.

## Release state

The source is ready for the authorized commit/tag/push after the final diff
review. Generated Tauri schema files may be left unstaged by the native build;
they are not part of this scoped release. CI must still publish the signed
updater artifacts and the public updater manifest before the release is called
live.
