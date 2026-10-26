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

Release `v0.4.36` is live from commit `25f3849`:

- `main` and the annotated `v0.4.36` tag are pushed to GitHub.
- Release workflow `40336212418` passed in 10m21s, including the signed
  Windows build, updater-artifact check, auto-publish, and MaxxTopia release
  notification.
- GitHub release is public, non-draft, and non-prerelease with
  `optimizationmaxxing_0.4.36_x64-setup.exe`, its `.sig`, and `latest.json`.
- The public `latest.json` reports version `0.4.36` and a signed Windows
  installer entry.
- MaxxTopia release sync `40337766774` passed and the following Cloudflare
  Pages deployment `40337808612` passed.

Generated Tauri schema files may be left unstaged by the native build; they are
not part of this scoped release. The remaining proof gates are field gates:
install the public build on a clean machine, confirm one normal UAC boundary,
reboot and check persistence, and run the same-scene Fortnite/Valorant Match
Scan before/after. Those tests are required to prove a user's real gameplay
outcome; the release pipeline cannot prove them.

## 2026-10-26 real-machine acceptance pass

The installed app was checked before testing and was still 0.4.35, so it was
not valid evidence for the live 0.4.36 release. The stale process was closed
and the clean-worktree 0.4.36 release binary was launched on the machine.

Observed on the machine:

- 0.4.36 native process launched, remained responsive, and stayed alive after
  the smoke interval; no new crash file appeared.
- Windows 10 Home build 19045; Ryzen 7 2700 (16 logical processors); NVIDIA
  RTX 2070 driver 32.0.15.9636.
- Active plan was Optimizationmaxxing Ultimate Performance.
- The active physical adapter was Intel I211 at 1 Gbps.
- The public updater manifest resolved to 0.4.36 and contained a non-empty
  updater signature.
- No Windows tweak, Asta apply, UAC operation, reboot, NVPI import, or game
  process was changed or measured during this pass. The desktop capture path
  timed out, so the UI Apply flow remains a human field gate.

Product improvement made locally (not yet released): `UpdateBanner` now shows
a visible retry state when the updater check fails. Previously a failed check
was silent and looked identical to being current, which could strand a user on
an older build. TypeScript, Vite, catalog/Asta policy audits, and PowerShell
contract tests passed. The native bundle was rebuilt successfully; local
artifact signing still requires the CI-only private key.

Next gate: decide whether to release this updater-observability patch as the
next version, then install that signed public build and perform the human-only
UAC, Asta read-back, reboot-persistence, and same-scene Match Scan checks.
