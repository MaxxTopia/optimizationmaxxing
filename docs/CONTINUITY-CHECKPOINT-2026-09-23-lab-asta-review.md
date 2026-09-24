# Continuity checkpoint: Asta review and Optimization Lab clarity (2026-09-24)

## Scope and state

Follow-up to the already-published v0.4.10 persistence work. This release is
prepared as v0.4.11 because the existing v0.4.10 tag must not be overwritten.
At the start of this work, the release changes were local on branch
`codex/pinnacle-persistence-v0.4.10`; the release is now public. Commit
`b6e9515bb45fc99b12337dc7024ad756e8669a18` is both `origin/main` and tag
`v0.4.11`. GitHub Actions run `35977029917` completed successfully, publishing
the Windows installer, its updater signature, and `latest.json`. The public
updater manifest reports `0.4.11` for both Windows x86_64 platform entries with
signatures present. The MaxxTopia release sync and Cloudflare Pages run
`35977740724` completed successfully; the public product page responds HTTP 200
and links to the v0.4.11 installer. The latest-installer URL responds HTTP 200.

Local `npm run tauri:build` compiled the app and created the installer, but
ended at updater signing because this PC has no local
`TAURI_SIGNING_PRIVATE_KEY`. CI signing succeeded and is the published artifact
proof. The product files, version/changelog/release workflow, and continuity
notes were the scoped release changes.

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
the public CI-signed v0.4.11 build, preview the
Asta plan, verify that a deliberately changed setting causes activation to
pause for renewed review, apply a small reversible selection, and then use the
existing reboot-persistence card plus Match Scan on the same Fortnite scene.
This workflow surfaces drift and avoids unsafe silent retries; it cannot stop
Windows, drivers, policies, or another utility from later changing a setting.

## Best next move

Install the public v0.4.11 build on the gaming PC and run the field test above.
Validate Asta preview and stale-readback stop before relying on the full catalog.
Keep an off-machine copy of the continuity snapshot for actual disaster recovery.
