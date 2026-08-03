# Codex project instructions

Optimizationmaxxing is a Tauri 2 desktop PC-optimization tool. Keep this file
vendor-neutral and compatible with `CLAUDE.md`; the two files should describe
the same project decisions and safeguards.

## Before editing

- Read `CLAUDE.md`, `_IF-YOU-LOSE-CLAUDE.txt`, `README.md`, and
  `TROUBLESHOOTING.md` when the task touches existing project behavior.
- Inspect `git status` and the relevant diff first. Preserve unrelated
  uncommitted work; never reset, clean, or discard it.
- Keep credentials, signing keys, tokens, and private user data out of source,
  logs, commits, and responses.

## Build and verify

From the project root:

```text
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

The automated checks must pass before a release is considered ready. Real UAC
elevation, registry/BCD application and revert behavior, auto-update behavior,
and VIP redemption remain human-only checks; do not claim those are verified
without Diggy's test.

## Release gate

For a release, keep `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json` in sync and add the top changelog entry in
`src/lib/changelog.ts`. The documented publish sequence is `git commit`, tag,
push `main`, and push the tag; CI then builds/signs/publishes the updater
artifacts and dispatches the MaxxTopia sync. Treat pushing, publishing, and
changing live services as an explicit approval gate.

Do not add AI/Claude/Codex authorship trailers. Shipped PowerShell, batch, and
command scripts must remain ASCII-only.
