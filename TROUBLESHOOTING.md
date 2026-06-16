# Optimizationmaxxing — Troubleshooting Runbook

Self-contained playbook for the Windows optimization app (Tauri = Rust backend +
web frontend, NSIS installer, auto-update). Written so anyone — you, a new
contributor, or any AI — can fix it without prior context.

Golden rule: reproduce with `npm run tauri:dev`, read the actual error (Rust
console *and* the frontend DevTools), then match below. A tweak that "doesn't
apply" is almost always a permission/path issue, not the UI.

## How to read what's happening

1. **Dev run:** `npm run tauri:dev` — Rust logs print in the terminal; the
   frontend has DevTools (right-click → Inspect, or F12 in dev).
2. **A tweak didn't apply / didn't revert:** the apply engine writes registry /
   files / runs scripts. Check the terminal for the `TweakAction` error. Most
   failures = needs admin, a wrong path, or a value-type mismatch (see the
   v0.1.89 NVPI decimal-vs-hex bug in memory — serialize uint as decimal for
   .NET XmlSerializer).
3. **Verify a tweak truly changed something:** the app's own pattern — re-read
   the setting and diff against the pre-change snapshot. Never trust "Applied".

## Failure modes → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Build fails | Rust/cargo error or frontend build error | `cargo build` in `src-tauri/` for the Rust half; `npm run build` for the frontend |
| Tweak applies but nothing changes | Wrong registry path, needs admin, or value serialized wrong (e.g. hex where .NET wants decimal) | Re-read + diff after apply; check elevation; fix the value type |
| Tweak won't revert | Snapshot/backup not captured before write (FileWrite engine caps backups ≤1 MB) | Check the revert snapshot exists; restore manually from backup |
| Installer won't build | NSIS hook (`installer-hooks.nsh`) or signing issue | `npm run tauri:build`; read the bundler log; check the NSIS hook |
| Auto-update not prompting | Update manifest/endpoint stale, or installed via `tauri:build --dir` (no updater wiring) | Verify the update worker manifest + version; install the real NSIS build |
| `.nip`/config import fails in a 3rd-party tool | Serialization mismatch (encoding/decimal) — see NVPI bugs in CLAUDE.md/memory | Match the target tool's exact format (decimal uint, no encoding attr) |

## Where things live

| What | Where |
|---|---|
| Rust backend (tweak engine, probes) | `src-tauri/src/` |
| Frontend (UI, guides, cards) | `index.html` + `src/` |
| Tauri config / capabilities | `src-tauri/tauri.conf.json`, `src-tauri/capabilities/` |
| Installer hook | `src-tauri/installer-hooks.nsh` |
| Bundled profiles / resources | `src-tauri/resources/`, `public/` |
| A CF Worker (driver lookups) | `driver-oracle-worker/` (`wrangler deploy`) |
| Docs | `docs/`, `CLAUDE.md` |

## Distribution note

Builds ship from R2 via `dl.maxxtopia.com` + an updates worker manifest (same
pattern as aimmaxxer — see memory `reference_aimmaxxer_distribution`). Large
(>300 MB) uploads to R2 may need the temp Worker proxy; keep only one big bundle
in R2 at a time (free-tier rule).

## Deploy / release

`npm run tauri:build` → NSIS installer → upload to R2 + bump the update worker
manifest. **Test a real Apply + Revert of at least one tweak before releasing**
(change → re-read → diff).
