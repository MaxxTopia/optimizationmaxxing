# Continuity checkpoint: Asta copy release

Date: 2026-10-17

## Scope

Remove the outdated motivational Asta manifesto and rotating quotes that remained visible in the updater-installed app after an earlier patch was made in an old local v0.4.8 checkout.

## Root cause

The installed app was v0.4.27 from `origin/main`. The earlier copy change existed only in a separate dirty v0.4.8 working tree, so updating the installed release did not include it.

## Change

- Replaced the Asta page manifesto with concise hardware-aware, reversible, read-back, reboot-persistence, and benchmark guidance.
- Replaced Asta page and AstaCard rotating quotes with factual performance guidance.
- Removed the outdated historical changelog wording.
- Bumped synchronized app versions to 0.4.28.

## Verification

- `npm ci` passed.
- `npm run build` passed for v0.4.28.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed before the version-only release build (103 tests, 0 failed).
- `npm run tauri:build -- --no-bundle` passed for v0.4.28.
- Unwanted phrase scan passed in `dist`, the native executable, and tracked source.
- Native executable version: 0.4.28.
- Native executable SHA-256: `72C432E3D418CA963E146CFCB3B3F4C6B8859F8CC579F48D8BA51483F84089A9`.

## Release state

The scoped source change is on branch `fix/asta-copy-v0.4.28` in this isolated worktree. The installed v0.4.27 app is unchanged. Publishing v0.4.28 requires committing the intended files, tagging `v0.4.28`, and pushing the branch and tag so the release workflow can build the updater artifact.

## Unfinished / next action

Review and stage only the seven source/release files plus this checkpoint; leave generated Tauri schema changes unstaged. Commit, push the branch and `v0.4.28` tag, then verify the release workflow or updater metadata before claiming the fix is live.

## User-owed validation

After the updater installs v0.4.28, reopen Asta and confirm the replacement copy is visible. If stale text remains, verify the running executable path and version before changing source again.
