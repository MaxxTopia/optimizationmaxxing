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

Release completed:

- Commit `49a93f9` is on `origin/main`; annotated tag `v0.4.23` points to the
  same release commit.
- GitHub Actions Release run `38023592465` passed all build, audit, signing,
  auto-publish, and notification steps.
- Published release: `https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.23`.
- Public `latest.json` returned HTTP 200 and version `0.4.23`, with the signed
  installer URL and signature present.
- The local branch remains `fix/asta-qos-performance-setup`; its working tree
  is clean after the release commit.

## Current uncommitted follow-up (2026-10-12)

The target-PC report after v0.4.23 exposed a second failure mode: ordinary app
startup could enter a protected read path and show repeated Windows command
processor/UAC prompts before the user requested any change. This follow-up is
implemented locally but is not committed, published, or verified on Diggy's
installed desktop build yet. It is now the v0.4.24 release candidate; the
signed CI artifact and target-PC verification remain pending.

### Changes in the working tree

- Startup and background audits now use current-token-only verification. A
  protected value is reported as `unknown` / needing an explicit admin check;
  opening the app no longer silently escalates one receipt at a time.
- The automatic reboot-persistence check was removed from app mount. It is now
  explicit through the persistence card, so opening the app cannot trigger a
  protected verification batch.
- Asta's apply flow captures a before and after median-of-three Asta Bench
  automatically, compares the bounded host proxy, and labels the result
  improved, regressed, unchanged, or inconclusive. The UI explicitly says this
  is not Fortnite FPS, server ping, or input-latency proof.
- Tune Now's before/after bench now uses the same median-of-three measurement
  and shows each run/stage, so its result is not based on one noisy sample.
- Asta automatically arms the exact receipt set for a later reboot check. It
  reports immediate live receipt status separately from persistence; a reboot
  must occur before the check can be verified.
- Tournament Mode's launch-time catch-up now reverts selected flagged receipts
  through one batch boundary and will not retry automatically after a failure.
  This prevents a stored schedule from producing one prompt per tweak.
- The native `verify_applied`, `verify_action`, and preview paths no longer use
  per-row elevation fallbacks. Explicit apply/revert/reboot actions retain the
  necessary elevated boundary and fail with a diagnostic when consent or read-
  back is unavailable.

### Verification performed for this follow-up

- `cargo test --manifest-path src-tauri/Cargo.toml`: passed, 101 tests.
- `npm run build`: passed; Vite transformed 220 modules and produced the
  production bundle.
- `npx tsc --noEmit`: passed after the Tune Now bench change.
- `npm run tauri:build`: compiled the changed native desktop executable and
  produced the unsigned NSIS installer; it stopped only at the expected
  signing boundary because `TAURI_SIGNING_PRIVATE_KEY` is not present here.
- `git diff --check`: passed; only normal Git line-ending conversion warnings.
- The repository-wide `cargo fmt --check` remains noisy because of existing
  formatting differences in unrelated native files; no broad formatter run was
  used because it would rewrite unrelated work.

### Remaining gates

- Install the signed v0.4.24 desktop artifact before calling this fix verified
  on the target PC.
- From a normal non-admin launch, verify zero spontaneous UAC prompts and no
  command window flash. If a stored Tournament Mode schedule is intentionally
  due, expect at most its one explicit batch prompt; a failed prompt must leave
  the schedule in a visible error state without retry spam.
- Apply Asta once, record the before/after proxy and transaction receipt, reboot,
  then use the explicit persistence check. Run a controlled Fortnite test
  separately; the host proxy cannot prove a better game result.

## Best next action

The local build/test gates above are green and Diggy has authorized publishing.
Push/tag v0.4.24, verify the signed CI artifact and public updater manifest,
then perform the first target-PC check as a normal non-admin launch with no
stored due schedule, followed by explicit Asta apply, reboot persistence, and a
controlled Fortnite comparison.
