# OptimizationMaxxing continuity checkpoint - 2026-11-07 closed-loop match proof

## Scope

Add the best remaining product improvement before the next real-device test:
one guided Baseline -> Asta + restart -> After -> Result flow for Fortnite
Match Scan. The flow is read-only and does not change the existing Asta apply,
transaction, restore, or reboot-proof behavior.

## Changes made

- Added `src/components/ClosedLoopTestWizard.tsx`.
  - Shows one beginner-readable four-step card.
  - Requires three valid real-game captures before Asta and three after the
    reboot check.
  - Saves progress locally so closing the app does not lose the comparison.
  - Rejects captures without at least 30 seconds and 120 PresentMon frames.
  - Links directly to Asta for the apply/restart handoff and never silently
    reapplies anything.
  - Presents average FPS, 1% low, 0.1% low, worst frame, spikes, DPC, and
    memory results with improved/regressed/mixed/no-clear-change language.
  - States the limits clearly: this is not direct proof of server ping,
    click-to-pixel latency, or player skill.
- Added `src/lib/closedLoopTest.ts` for local state, validation, averaging,
  thresholds, and honest verdicts.
- Added structured `SessionCaptureMetrics` to `src/lib/tauri.ts` and
  `src-tauri/src/match_scan.rs`, including frame data, PresentMon mode,
  CPU/GPU bound context, DPC, memory, GPU temperature/throttle samples, WHEA,
  and local UDP/NIC error deltas.
- Replaced the old one-off Fight Capture card in `src/pages/MatchScan.tsx` so
  users have one capture path instead of two competing workflows.

## Verification

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib match_scan` passed:
  13 tests, 0 failures.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` passed:
  107 tests, 0 failures.
- `npm run audit:catalog` passed: 108 rows, 0 errors and 0 warnings.
- `npm run audit:asta-policy` passed: 0 errors.
- `npm run audit:pinnacle-coverage` passed: 11/11 required capabilities,
  0 errors.
- `npm run audit:driver-profiles` passed.
- `npm run test:bench-stability` passed: 4 checks.
- `npm run test:powershell-contracts` passed: 24 actions classified.
- `npm run test:bios-evidence` passed: 9 checks.
- `git diff --check` passed; only line-ending warnings were reported for
  pre-existing generated schema files.
- A full rustfmt check was not used as a gate because the installed rustfmt
  proposes unrelated formatting changes across the existing repository.

## Release state

- The public/live release remains v0.4.39 at the existing GitHub release.
- The closed-loop wizard changes are local, uncommitted, unpushed, and not
  deployed. No installer containing this change has been published.
- Pre-existing unrelated dirty files remain untouched:
  `_IF-YOU-LOSE-CLAUDE.txt`, `src-tauri/gen/schemas/acl-manifests.json`,
  `src-tauri/gen/schemas/desktop-schema.json`, and
  `src-tauri/gen/schemas/windows-schema.json`.

## User/device gate

The next test is a real Windows install of the build containing this change.
Keep the same Fortnite map/route, render mode, FPS cap, driver, network route,
and background load for all six captures. The source checks cannot prove UAC,
reboot persistence, real Fortnite FPS, server ping, or input feel.

## Best next action

Review this focused diff, then publish only when Diggy explicitly asks to push
live. After installation: open Match Scan, run three baseline captures, use the
guided Asta handoff, restart and pass the reboot check, then run three after
captures. Keep or revert based on the measured result rather than the host
proxy alone.
