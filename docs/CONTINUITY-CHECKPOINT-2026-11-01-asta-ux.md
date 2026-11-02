# OptimizationMaxxing continuity checkpoint — 2026-11-01 Asta workflow UX

## Scope

Simplify the Asta apply and reboot-persistence workflow and correct the
automatic persistence-proof scope without changing the Windows action catalog,
transaction lane, read-back contracts, or safety gates.

## Changes made

- Reworked `src/components/RebootPersistenceCard.tsx` around the user's next
  action: apply, restart, then check. The card now has plain-language passed,
  restart-required, and needs-attention states.
- Reworked `src/pages/Asta.tsx` so the primary path is one guided action:
  `Apply supported Pinnacle settings`.
- Collapsed advanced review, coverage details, decision rules, and the optional
  NVIDIA profile into secondary sections.
- Removed the emotional manifesto copy and duplicated explanatory cards.
- Kept unsupported, policy-owned, ambiguous, review-only, firmware, router, and
  other external boundaries visible without putting them in the automatic lane.
- Updated `scripts/audit-pinnacle-coverage.mjs` for the intentional copy change.
- Corrected `src/pages/Asta.tsx` so a successful Asta run arms every currently
  active receipt with a verified native read-back, including settings verified
  by earlier runs. Current-run receipts remain the trigger for arming, and
  unknown, explicit-only, and manual rows remain excluded from proof.
- Updated the reboot card and native command comment to describe the broader
  active-verified scope accurately.

## Extreme security tradeoff lane

The user requested an explicit path for people who knowingly want to weaken
Windows protections on a dedicated extreme-tuning rig. This was added as a
separate, never-automatic section rather than expanding the normal Pinnacle
button:

- `src/lib/tuneProfiles.ts` now exports
  `EXTREME_SECURITY_TRADEOFF_IDS` for the cataloged CPU-mitigation,
  SmartScreen, HVCI/Core Isolation, and Hyper-V launch controls. The set is
  included in the existing hard-block list, so the normal Asta lane cannot
  select it accidentally.
- `src/pages/Asta.tsx` now shows matching security rows under
  `Extreme security tradeoffs (optional)`. The user must acknowledge the
  warning, can select individual rows or an explicit Select all control, and
  receives a second exact tradeoff confirmation before applying. Refreshes and
  completed runs clear the acknowledgement so it cannot leak into a new plan.
- The section explains that these are security/compatibility changes, not
  guaranteed FPS improvements, and that native restore receipts and Revert/Diff
  are the recovery path. Global Defender-off is intentionally not offered as a
  generic checkbox: tamper protection can reject it and the product has no
  measured Fortnite-latency justification for removing the whole antivirus
  layer. Match Scan remains the path for identifying a real Defender scan.
- `scripts/audit-asta-policy.mjs` now checks that the extreme set exists, maps
  only to catalog rows, never overlaps the automatic Pinnacle sets, and remains
  hard-blocked and acknowledgement-gated in source.

## Verification

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npm run audit:asta-policy` passed: catalog v1.9.4, 108 rows, 0 errors.
- `npm run audit:pinnacle-coverage` passed: required capabilities 11/11, 0
  errors.
- `npm run test:powershell-contracts` passed: 24 catalog actions classified,
  22 verified and 2 manual.
- `npm run test:bench-stability` passed: 4 checks.
- `npm run test:bios-evidence` passed: 9 checks.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed: 107 library tests
  and 0 binary/doc tests failed.
- Final `npm run build` rerun after the last reboot-card and Asta copy changes:
  passed, 223 modules transformed.
- Final `npm run audit:asta-policy` passed: catalog v1.9.4, 108 rows, 0 errors;
  `npm run audit:pinnacle-coverage` passed: 11/11 required capabilities;
  `npm run test:powershell-contracts` passed: 24 actions classified.
- After the extreme-security lane change: `npm run build` passed (223 modules
  transformed); `npm run audit:asta-policy` passed with the new security-lane
  assertions; `npm run audit:pinnacle-coverage` passed (11/11); `npm run
  test:powershell-contracts` passed (24 actions, 22 verified and 2 manual);
  `git diff --check` passed.
- No Windows apply, reboot, installer, or live visual acceptance test was run
  for this source-only UX change.

## Release state

The public/live build remains v0.4.37 while the release-readiness pass runs.
The intended Asta UX and security-lane changes are being packaged as v0.4.38;
the unrelated pre-existing changes in `_IF-YOU-LOSE-CLAUDE.txt` and generated
Tauri schema files remain untouched and must not be bundled accidentally.
## User/device evidence and next gate

The user's reboot card showed one armed action,
`fortnite.gus-ini.competitive`, verified after a real Windows restart. That was
valid evidence for that action only, but the Asta auto-arm path was too narrow
for the user's expectation of checking the active setup. Before release, review
the local diff, run the documented Tauri build, then install and visually verify
the new flow. After release, the user should test Apply → restart → Check after
restart and confirm the armed count reflects the active verified receipt set,
followed by a same-scene Fortnite Match Scan for FPS and frame-time evidence.
