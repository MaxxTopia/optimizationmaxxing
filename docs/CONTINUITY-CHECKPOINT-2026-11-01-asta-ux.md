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
- `npx tsc --noEmit` passed; `cargo test --manifest-path
  src-tauri/Cargo.toml` passed with 107 library tests and 0 failures.
- `npm run tauri:build` produced the local 0.4.38 installer bundle. Local
  updater signing was intentionally not attempted because this workstation
  has only the public key; CI owns the private signing secret.
- GitHub Actions release run
  `https://github.com/MaxxTopia/optimizationmaxxing/actions/runs/41366690486`
  passed all audits, built the Windows installer, signed the updater files,
  and published the release.
- No Windows apply, reboot, or live gameplay acceptance test was run by the
  source/CI checks. Those remain explicit device gates.

## Release state

The public/live build is v0.4.38:
`https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.38`.
The release is non-draft and includes the signed installer,
`optimizationmaxxing_0.4.38_x64-setup.exe.sig`, and `latest.json`. The
unrelated pre-existing changes in `_IF-YOU-LOSE-CLAUDE.txt` and generated
Tauri schema files remain untouched and are still not bundled.
## User/device evidence and next gate

The user's reboot card showed one armed action,
`fortnite.gus-ini.competitive`, verified after a real Windows restart. That was
valid evidence for that action only, but the Asta auto-arm path was too narrow
for the user's expectation of checking the active setup. The next user/device
gate is to install v0.4.38 and test Apply → restart → Check after restart.
Confirm the armed count reflects the active verified receipt set, then run a
same-scene Fortnite Match Scan for FPS, 1% lows, frame-time, and ping evidence.
Source tests and CI cannot prove UAC/elevation, registry or BCD writes, adapter
changes, reboot persistence, or improved gameplay.

## 2026-11-03 beginner-first Asta completion UX

### Intent and decisions

- Make the first-run experience readable for a user who only wants one clear
  action and an honest result.
- Keep the satisfying finish moment restrained: a visible completion check,
  verified/already-good/needs-attention counts, a clear next-step card, and a
  short completion reveal. Do not use random outcomes, fake FPS gains, or
  casino-style claims about performance.
- Keep expert controls and evidence available below the beginner path without
  requiring preview or checkbox selection for the automatic lane.

### Source changes

- `src/pages/Asta.tsx`: added the beginner-first result card, state-aware
  primary action, live verification counts, next-step CTA, readable technical
  details, and a visible first-viewport Optimize button. The automatic path
  proceeds to the real Windows consent; review-only actions retain explicit
  confirmation.
- `src/components/RebootPersistenceCard.tsx`: renamed and clarified the
  after-restart step and its idle, armed, and verified states.
- `src/index.css`: added a reduced-motion-safe completion reveal animation.
- `scripts/audit-pinnacle-coverage.mjs`: updated source-copy expectations for
  the new UI.

### Verification and release state

- `git diff --check` passed.
- `npx tsc --noEmit` passed.
- `npm run audit:pinnacle-coverage` passed: 11/11 required capabilities,
  0 errors.
- `npm run audit:asta-policy` passed: catalog v1.9.4, 108 rows, 0 errors.
- `npm run audit:catalog` passed: 108 rows, 0 errors, 0 warnings.
- `npm run test:powershell-contracts` passed: 24 actions classified, 22
  verified and 2 manual.
- `npm run build` passed: 223 modules transformed.
- A local Vite visual check confirmed the primary action is visible in the
  first viewport. The browser preview correctly shows the desktop-shell gate;
  no native apply was run from the browser.
- These changes are local on `codex/pinnacle-v0.4.36` and are not pushed or
  live yet. The existing v0.4.38 public release remains the last verified live
  build.

### Next gate

Review the local diff, then make a focused commit and run the documented release
sequence only when Diggy explicitly asks to publish. After release, verify the
served installer/build and run one real Windows Apply -> restart -> Check flow;
source checks cannot prove UAC, persistence, or Fortnite gameplay outcomes.

## 2026-11-05 automatic reboot-proof handoff

### User/device evidence recovered

- The user's pasted result is a real reboot-proof report: 147 app-owned action
  receipts with read-back contracts were checked after Windows restarted; 147
  matched, 0 mismatched, and 0 were unknown. This proves that armed set only,
  not every catalog row and not gameplay improvement.

### Local source changes

- `src-tauri/src/lib.rs` now registers an app-owned HKCU Run entry when the
  user arms a reboot check, removes it after a terminal result, and includes a
  read-back/error note in the arm receipt. It never reapplies settings.
- `src/App.tsx` performs the pending proof on the first normal interactive
  launch and routes to the Asta result card. Hidden `--background` CPU-set
  watcher launches opt out, so they cannot navigate or trigger the proof.
- `src/components/RebootPersistenceCard.tsx` explains the automatic handoff,
  keeps manual Check as a fallback, and scrolls to the result when opened from
  the startup handoff. `src/pages/Asta.tsx` keeps the proof summary synchronized.

### Verification and release state

- `npx tsc --noEmit` passed.
- `npm run build` passed: 223 modules transformed.
- `npm run audit:pinnacle-coverage` passed: 11/11 required capabilities, 0
  errors.
- `npm run audit:asta-policy`, `npm run audit:catalog`, and
  `npm run test:powershell-contracts` passed with 0 errors/warnings.
- The first native `cargo test` attempt failed only because C: ran out of disk
  space while writing its debug archive. A second test was moved to E: in
  `E:\optimizationmaxxing-cargo-target`, but its compiler workers stalled and
  were stopped; no native pass is claimed.
- These changes are local and uncommitted. The public v0.4.38 release remains
  live; no release or installer was published for this handoff.

### Next gate

Review the focused diff, then run the native test on a machine/drive with
available build space before packaging. Build/package only if
Diggy explicitly asks to push live. After installation, arm a fresh check on a
real Windows client, restart once, and confirm the app opens Asta and reports
the result automatically. Source tests cannot prove HKCU Run behavior, UAC,
reboot persistence, or Fortnite gameplay outcome.

## 2026-11-05 coverage and beginner-path improvement pass

### Scope and decisions

- Treat Rainbow Six Siege as a first-class supported game wherever the app
  already has a game registry, closed-loop capture profile, or CPU-set quick
  picker. Do not imply that the Siege preset can change router, firmware,
  anti-cheat, or other controls outside the app's verified boundary.
- Give Fortnite users a single recommended CPU-set setup path. The watcher
  now saves all detected CPU sets for Fortnite, enables the watcher, and starts
  it with Windows from one button; manual set-ID selection and Edit remain
  available for advanced users.
- Make Guides beginner-first: advanced firmware/BIOS material is opt-in and
  research article typography is easier to scan. The underlying guide content
  and safety boundaries remain intact.

### Source changes

- `src/lib/games.ts`: added `rainbow-six-siege` with Siege process names and
  BattlEye-aware filtering metadata. Filtering only preserves the game and
  launcher processes; it does not disable or alter anti-cheat.
- `src/lib/optimizationSession.ts`: added a Siege closed-loop capture profile
  using the existing PresentMon/sensor evidence path.
- `src/components/AutoPinSection.tsx`: added a one-click recommended Fortnite
  watcher setup using all detected CPU sets, with clear persistence and restore
  guidance.
- `src/pages/Guides.tsx`: advanced guides now start collapsed and the control
  text explains what is being revealed.
- `src/index.css`: improved research headings, links, lists, and code blocks
  for readability without changing guide content.
- `src/pages/Dashboard.tsx`: renamed the gauge to `Active catalog rows` and
  clarified that catalog rows and underlying action receipts are different
  counts, so a user no longer expects the number to equal all 108 rows.

### Verification and release state

- `npx tsc --noEmit` passed.
- `npm run build` passed: 223 modules transformed.
- `npm run audit:catalog` passed: catalog v1.9.4, 108 rows, 0 errors and 0
  warnings.
- `npm run audit:asta-policy` passed: 108 rows, 0 errors.
- `npm run audit:pinnacle-coverage` passed: 11/11 required capabilities, 0
  errors.
- `git diff --check` passed. The native `cargo test --locked` gate passed with
  107 Rust tests and no failures using the existing C: target cache.
- `npm run tauri:build` compiled the optimized v0.4.39 executable and NSIS
  installer. The local command then stopped at Tauri signing because the
  private signing key is intentionally held by CI; no private key was exposed
  or copied locally.
- Commit `680633c` is on `main` and tagged `v0.4.39`.
- GitHub Actions release run `42075658200` completed successfully. Its local
  audits, benchmark-stability test, signed build, updater-artifact check, and
  MaxxTopia notification all passed.
- The public release is non-draft and non-prerelease at:
  `https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.39`
- Public `latest.json` reports version `0.4.39` and the release contains the
  installer and matching `.sig` updater artifact. The local package build also
  compiled the optimized executable and NSIS installer; signing remained in CI
  as intended because the private signing key is not stored locally.

### Remaining gates and next action

- A real Windows install must verify the Siege registry/session path, the
  one-click CPU-set watcher setup, UAC batching, reboot persistence, and the
  existing Asta apply/restore flow. A same-scene game capture is still needed
  before making FPS, 1% low, ping, or input-feel claims.
- The source, native tests, package build, CI release, signature, and updater
  metadata are verified. A real Windows install is still required to prove
  UAC batching, HKCU startup behavior, reboot persistence, and Asta apply/restore
  behavior on a client. A same-scene Fortnite or Siege capture is still needed
  before making FPS, 1% low, ping, or input-feel claims.
- Diggy's next test is to install v0.4.39, open Asta, run the one-click supported
  apply path, restart once when prompted, and use the automatic reboot check.
  Then run one controlled same-scene Match Scan if gameplay proof is needed.
