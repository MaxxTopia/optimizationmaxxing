# Optimizationmaxxing continuity checkpoint — Asta single-boundary repair

Date: 2026-10-10
Branch: `fix/asta-qos-performance-setup`

## Scope

Repair the repeated Asta command/UAC interaction reported after a real receipt
still rolled back most selected actions. Keep read-back honest: no setting is
called committed unless its live verifier confirms it, and an unsupported or
ambiguous setting is not written.

## Recovered state

- Published baseline before this checkpoint: v0.4.22 at commit `a587fd8`.
- The working tree started clean except for the intended, uncommitted Asta
  repair from the previous checkpoint. No unrelated edits were reset or
  overwritten.
- The field receipt showed 6/63 committed, 57 rolled back, and 6 unverified,
  with unsupported RSS/RSC/USB-link capabilities correctly reported as no-write
  cases. Five independent rows still reported live-state mismatch.

## Implemented in this working tree

1. BCD pre-state capture now batches all ambiguous rows through one elevated
   read-back instead of starting one protected read per action.
2. The elevation helper uses a hidden PowerShell/cmd host and checks whether
   the current process is already elevated before using `-Verb RunAs`, so an
   elevated app does not request nested consent.
3. Asta merges accepted review actions into the same verified and explicit
   execution lanes instead of opening separate backend apply calls for each
   category.
4. Asta copy and the resilience contract explain the actual boundary: helper
   consoles are hidden and the app batches work, but Windows UAC consent cannot
   be silently clicked through; launching the app elevated is the one-consent
   path.
5. Release metadata is aligned to v0.4.23 and the in-app changelog names the
   batching, nested-UAC, and selective-rollback behavior.

## Verification performed

- `cargo test --manifest-path src-tauri/Cargo.toml`: passed, 101 tests.
- `npm run build`: passed TypeScript and Vite production build.
- `npm run audit:catalog`: passed, 108 tweaks, 0 errors, 0 warnings.
- `npm run audit:driver-profiles`: passed.
- `npm run test:bios-evidence`: passed, 9 checks.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed; only normal Git line-ending warnings were shown.
- `npm run tauri:build`: produced the unsigned Windows NSIS installer at
  `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.4.23_x64-setup.exe`.
  The local command stopped only at the expected updater-signing boundary
  because this machine has the public key but not `TAURI_SIGNING_PRIVATE_KEY`.

## Still required

- Signed CI artifact verification.
- Install v0.4.23 on the target Windows PC and run Asta once from an
  unelevated launch and once with the app explicitly launched as administrator.
  Confirm helper consoles no longer flash repeatedly and the receipt lists
  exact committed/rolled-back/unverified rows.
- Reboot persistence and real Fortnite gameplay remain separate human gates.
- The five registry/HAGS/priority mismatches must be re-read from the target
  machine after v0.4.23; source tests cannot prove Windows or driver ownership.

## Release and handoff

Diggy previously authorized pushing the Asta repair live. After the native
build gate, stage only the v0.4.23 source, release metadata, resilience update,
and this checkpoint; commit, tag, push `main` and `v0.4.23`, then verify the
GitHub Actions signed release and public updater manifest. Do not claim the
target-PC UAC or reboot result from CI evidence.

## Best next action

Perform the scoped v0.4.23 release and wait for the signed public artifact. The
user's next test is the installed Asta run, with the app launched as
administrator if they want one Windows consent at startup and no nested helper
prompts.
