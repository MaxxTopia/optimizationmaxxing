# Continuity checkpoint - optimization platform improvements - 2026-09-21

## Scope

Added the next optimizationmaxxing improvement pass after the v0.4.6 release.
This pass is published as optimizationmaxxing v0.4.7. It improves evidence,
rollback, hardware matching, profile provenance, and recovery without adding voltage overrides,
thermal-limit writes, anti-cheat bypasses, visibility cheats, or firmware
writes.

## Implemented

- Added a native transactional apply command. It captures every pre-state,
  rejects PowerShell actions without both revert and verify contracts, applies
  eligible actions, reads them back, records a per-action report, and attempts
  reverse-order rollback on an apply or verification failure.
- Added transaction status reporting for committed, rolled_back, failed, and
  partial outcomes, including rollback errors and durable `last_transaction`
  storage.
- Added exact-board hardware profile resolution derived from the existing OEM
  BIOS evidence catalog. It surfaces board/CPU status, visible BIOS paths,
  SPD identity, rated-profile-only memory guidance, and a manual SCEWIN
  fallback when an option is not exposed. It never borrows a nearby-board
  recipe.
- Added named per-game capture contracts for Fortnite, Valorant, CS2, Apex,
  Warzone, osu!, Overwatch 2, and Marvel Rivals. Asta remains a proxy; the
  UI links the user to the existing PresentMon Match Scan for actual game
  frametime evidence.
- Added closed-loop evidence verdicts that require repeated baseline/after
  runs and never label the Asta proxy as Fortnite proof.
- Added version/review/hash/rollback metadata for six NVIDIA profiles and an
  adapter-specific NIC advisory. Added a read-only exported-profile diff view
  so users can compare their NVPI export with the shipped baseline.
- Added a driver-oracle schema check and local last-known-good cache. Cached
  data is display-only and cannot authorize an update or mutation.
- Added local feature gates for the new automation lanes and expanded
  `RESILIENCE.md` with a risk register, recovery classes, safeguard backlog,
  and signed-policy/kill-switch requirements.
- Added `npm run audit:driver-profiles` to verify every catalog hash matches
  the public `.nip` artifact set.

## Verification

- `npm run build` passed.
- `npx tsc --noEmit` passed.
- `npm run audit:catalog` passed: 100 tweaks, 0 errors, 0 warnings.
- `npm run audit:driver-profiles` passed: 6 catalog hashes verified.
- `npm run test:bios-evidence` passed: 9 checks.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed: 91 tests, 0
  failures.
- `npm run tauri:build` produced the Windows installer locally, then stopped at
  updater signing because this checkout does not contain the private Tauri
  signing key. CI run `35664462105` completed the signed build and published
  the release.
- `git diff --check` passed. Git reported only normal LF/CRLF conversion
  warnings for the dirty working copy.
- Full-crate `cargo fmt --check` remains noisy because unrelated pre-existing
  Rust files have formatting drift; the crate was not reformatted wholesale.

## Live release proof

- Commit `d66500b` and tag `v0.4.7` are pushed to `origin/main` and the
  matching release tag.
- GitHub release `v0.4.7` is public with `latest.json`, the signed installer,
  and the installer signature. The manifest reports version `0.4.7`.
- The MaxxTopia sync and Cloudflare deployment completed. The public product
  page and Updates page both serve the v0.4.7 release metadata.

## Not proven yet

- No real elevated UAC apply/revert, reboot persistence, or Windows Update
  drift test has been run in this pass.
- No real Fortnite same-scene PresentMon capture or click-to-photon/input
  latency measurement has been completed.
- The exact hardware catalog still contains only the OEM board records already
  reviewed; it is not an exhaustive motherboard or memory-kit database.
- A signed remote optimization-policy manifest is documented but not wired;
  the current local feature policy is not a remote kill switch.
- The local checkout still has unrelated dirty VIP Worker, demo, and continuity
  files; none were included in the v0.4.7 release commit.

## Working-tree boundary

Preserve unrelated dirty VIP Worker, demo, and existing continuity files. Do
not reset, clean, or stage the repository broadly.

## Best next action

Run the native v0.4.7 app on the actual gaming PC, perform one controlled baseline,
use the transactional lane on one reversible low-risk action, verify the
read-back, arm the reboot check, and run a three-run Fortnite PresentMon
baseline/after capture. Only after those human field gates should a release
task consider packaging and publishing this pass.
