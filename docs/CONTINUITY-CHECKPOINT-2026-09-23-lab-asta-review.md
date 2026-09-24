# Continuity checkpoint: Asta review and Optimization Lab clarity (2026-09-24)

## Scope and state

Follow-up to the already-published v0.4.10 persistence work. This release is
prepared as v0.4.11 because the existing v0.4.10 tag must not be overwritten.
At the time this checkpoint was updated, the release changes were local and
uncommitted on branch `codex/pinnacle-persistence-v0.4.10`; commit, push, CI
signing, and deployment were still pending. The checkout was clean before the
feature work; the product files, version/changelog/release workflow, and these
checkpoints are the scoped changes.

## Changes

- `src/pages/Asta.tsx`: add an explicit read-only full-plan preview, per-tweak
  include checkboxes, action read-back/risk/evidence/reboot labels, and clear
  exclusion explanations. Preserve the existing standard/review confirmation
  lanes and manual-only firmware boundary. Re-scan the rig and receipts before
  apply; after confirmation, read selected live settings once more and stop for
  renewed review if the values changed. Report only receipts created by this
  apply attempt, so old drift or a declined review lane cannot inflate success.
- `src/pages/Diff.tsx` and `src/pages/TuneNow.tsx`: describe drift as a mismatch
  against the recorded target without asserting which actor caused it.
- `src-tauri/src/tune_preflight.rs`: make the OS-build-change advisory cause-
  neutral.
- `src/pages/OptimizationLab.tsx`: distinguish Lab planning/measurement, Tune
  Now guided application, and Asta's selected full-catalog flow; make the real
  Fortnite PresentMon check plainly separate from the synthetic Asta proxy and
  state its reproducibility/persistence limits.

## Verification

- `npm run build` — passed (TypeScript and Vite). Vite retains its existing
  advisory for a minified JavaScript chunk over 500 kB.
- `npm run audit:catalog` — passed, 100 catalog entries, 0 errors/warnings.
- `npm run audit:driver-profiles` — passed, all 6 catalog hashes/artifacts match.
- `npm run test:bios-evidence` — passed, 9 checks.
- `cargo test` in `src-tauri` — passed, 95 tests; two existing dead-code warnings.
- `git diff --check` — passed. Git reports its configured LF-to-CRLF
  autocrlf notice for modified files.
- `npm run tauri:build` built the production frontend, executable, and NSIS
  installer, but exited at updater signing because this PC has no local
  `TAURI_SIGNING_PRIVATE_KEY`. The required GitHub signing secret is configured;
  CI remains the authoritative signed-artifact gate.

## Not proven / next step

No installed-client or physical Windows test has been run. Diggy should install
the resulting CI-signed build when it is intentionally released, preview the
Asta plan, verify that a deliberately changed setting causes activation to
pause for renewed review, apply a small reversible selection, and then use the
existing reboot-persistence card plus Match Scan on the same Fortnite scene.
This workflow surfaces drift and avoids unsafe silent retries; it cannot stop
Windows, drivers, policies, or another utility from later changing a setting.

## Best next move

Complete the authorized v0.4.11 commit/tag push and verify CI publishes all
signed updater assets and updates the download page. For a real PC, validate the
new preview and stale-readback stop before relying on the full Asta catalog.
Keep an off-machine copy of the continuity snapshot for actual disaster
recovery.
