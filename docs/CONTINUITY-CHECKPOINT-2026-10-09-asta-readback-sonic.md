# Continuity checkpoint: Asta read-back and Sonic asset repair

Date: 2026-10-09
Repository: `C:\Users\Diggy\projects\optimizationmaxxing-hardening`
Branch: `fix/asta-qos-performance-setup`

## Scope

Repair the Asta transaction/read-back failures shown by the user, keep unsupported
adapter capabilities from rolling back unrelated actions, make the result counts
truthful, and repair the yellow Sonic theme mascot's viewer-left eye.

## Current state

- Public/live release is v0.4.21 at commit `1d3e4fa9b8f152fc4595b576ee0c5f0a9570abc1`.
- Tag `v0.4.21` points to that commit; the release is published, not draft or
  prerelease, with the signed Windows installer and updater manifest uploaded.
- The source branch is `fix/asta-qos-performance-setup`; the working tree was
  clean after the release push. This checkpoint update is documentation-only.

## Implemented changes

- Power-setting verification now queries the correct subgroup and isolates the
  requested setting block instead of passing a setting GUID as a subgroup.
- RSS, RSC, LSO, NIC advanced properties, and hidden power settings can report
  `NOT_APPLICABLE` when Windows does not expose the capability; Asta does not
  attempt a write or roll back independent actions for that condition.
- EEE/NIC power-save verification discovers the active adapter's supported
  properties and preserves ownership/read-back checks.
- Asta now reports committed, rolled-back, not-applicable, preflight-skipped,
  and unverified outcomes separately. Rollback details retain the real
  verification cause.
- The Sonic asset keeps its original 420x455 canvas. Only 1,419 pixels in the
  viewer-left eye region changed; comparison against the pre-edit asset found
  zero alpha or RGB changes outside `x=78..123, y=144..196`.

## Verification

- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `npm run audit:catalog`: passed; 108 tweaks, 0 errors, 0 warnings.
- `npm run audit:driver-profiles`: passed.
- Shipped PowerShell/batch/command-file ASCII check: passed.
- `git diff --check`: passed.
- The freshly generated Rust test harness ran all 99 tests successfully,
  including `transaction_tests::transaction_report_counts_verified_rollback`.
  The documented `cargo test`/Tauri build command itself could not reach rustc:
  the original C: target ran out of disk space and the USB-target retry stalled
  in Cargo/rustup before creating target files. Do not claim a full Cargo build,
  UAC behavior, reboot persistence, adapter read-back, or gameplay improvement
  until verified on a target Windows machine.
- `cargo fmt --check` reports existing repository-wide formatting drift; do not
  reformat unrelated files as part of this repair.
- GitHub Release workflow `37995049006` passed all steps, including the clean
  Tauri build/release, auto-publish verification, and release notification.
- Served `latest.json` reports version `0.4.21`, Windows installer URL, and a
  Windows signature.

## Remaining work and gate

1. On a target Windows machine, test Asta in admin mode with the active adapter,
   reboot, and re-check the same receipt. This is the evidence gate for the
   original first-run/read-back problem.

## Best next action

Install/test the published v0.4.21 release on the target Windows machine, then
run the same Asta receipt before and after reboot. Record any remaining
adapter-specific `NOT_APPLICABLE`, permission, or live-state mismatch details
before making another catalog change.
