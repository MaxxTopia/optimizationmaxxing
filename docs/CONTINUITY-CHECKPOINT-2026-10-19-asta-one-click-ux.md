# OptimizationMaxxing continuity checkpoint — 2026-10-19 Asta one-click UX

## Scope

This pass improved Asta Mode's primary flow in the local worktree. It did not
write Windows settings, request UAC, or change the user's machine. Release
publication was completed separately after the source and CI checks passed.
Existing unrelated dirty schema and continuity files were preserved.

## Implemented

- The primary Asta action no longer requires the user to preview first or
  manually check every row. It performs the live plan read-back, selects the
  current supported Pinnacle defaults, and continues through the existing
  preflight, confirmation, transaction, verification, benchmark, and rollback
  safeguards.
- Review remains available as an optional "Review exact changes" action.
- The advanced candidate list is collapsed by default. It remains available
  for users who want to inspect or customize rows.
- A customized selection gets a separate "Apply selected advanced rows"
  action, so the main button cannot accidentally apply a manual selection.
- The primary copy explicitly says that policy-owned, unsupported, review-only,
  and ambiguous rows stay out of the automatic path. Windows UAC consent is
  still required when the app is not elevated; the UX does not bypass consent.

## Verification

Passed in this worktree:

- `npx tsc --noEmit`
- `npm run build` — Vite production build succeeded; the existing large-chunk
  warning remains
- `npm run audit:catalog` — 108 rows, 14 named Pinnacle defaults, zero errors
  or warnings
- `npm run audit:asta-policy`
- `npm run audit:driver-profiles`
- `npm run test:powershell-contracts`
- `npm run test:bios-evidence`
- `cargo test --manifest-path src-tauri/Cargo.toml` — 104 passed
- `git diff --check`

## Not proven yet

- The one-click flow has not been run in the installed desktop client with a
  real UAC prompt, protected Windows writes, reboot persistence, or Fortnite
  gameplay capture.
- The user's prior receipt with two explicit unverified actions and a -1.1
  local proxy delta remains a historical run that needs manual review/revert;
  this UI change does not claim to repair an unknown prior machine state.
- CI and the public release do not prove real Windows UAC behavior, reboot
  persistence, or Fortnite gameplay performance; those remain device-test
  gates for the user.

## v0.4.32 release evidence

- Release commit: `bc99f97f228fb2d1905d826249d49afa8d898dc4`
- Public tag/release: `v0.4.32` —
  https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.32
- Release workflow `39292881941` succeeded and published the signed Windows
  installer, updater signature, and `latest.json`.
- The updater manifest reports version `0.4.32` and the expected x64 NSIS
  installer URL.
- MaxxTopia release-sync `39294145966` and Pages deploy `39294177444`
  succeeded; the public page now links to v0.4.32.
- Unrelated local files remain intentionally dirty and unstaged:
  `_IF-YOU-LOSE-CLAUDE.txt` and the three generated Tauri schema files.

## Best next action

Install or update to v0.4.32 in the desktop client and click the new primary
Asta button without opening the advanced list. Confirm that one plan read, one
consent boundary, a receipt, and the before/after bench appear. Then restart
Windows and use the persistence check; compare Fortnite under the same scene,
route, graphics, cap, driver, and background load. A negative device result is
not overridden by the release claim; revert the affected run and capture the
receipt for diagnosis.
