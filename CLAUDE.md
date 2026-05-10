# Optimizationmaxxing

PC optimization tool for competitive gamers. 6th maxxer slot. Direct competitors: paragontweaks.net/utilities + hone.gg.

> **CURRENT STATE — see live sources of truth instead of this file:**
> - **Version:** `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` (all kept in sync, manually bumped per release)
> - **Catalog count + tweak detail:** `resources/catalog/v1.json` (~96 tweaks at v0.1.55)
> - **Per-release shipped features:** `src/lib/changelog.ts` (live, surfaced via the in-app What's-New modal)
> - **Phase log archaeology:** `git log` (every release commit ends in `release: vX.X.X — <one-line summary>`)
>
> This CLAUDE.md is the **never-rots** doc — stack, layout, dev/release commands, durable conventions. Per-release "what shipped" lives in changelog.ts; per-release intent lives in commit messages.

## Stack
- **Frontend:** Vite + React 18 + TS + Tailwind 3.4
- **Desktop:** Tauri 2 (Rust, ~5 MB bundle vs Paragon's 81 MB / Hone's heavier Electron)
- **State:** Zustand (UI/theme), Rust + SQLite (engine state in `%LOCALAPPDATA%\optmaxxing\state.db`)
- **Live metrics:** sysinfo crate (CPU% / RAM), WMI for thermals + RAM SPD + microcode + DPC counters
- **Distribution:** Tauri-action GH Actions → signed NSIS installer + minisign-signed `latest.json` → cross-repo dispatch to `MaxxTopia/maxxtopia` → Cloudflare Pages auto-deploy. End-to-end pipeline at `.github/workflows/release.yml`.
- **Auto-update:** Tauri updater plugin polls `releases/latest/download/latest.json`, verifies sig against bundled minisign pubkey, downloads + relaunches.

## Project layout
```
src/                                 Vite frontend
  App.tsx, main.tsx, index.css       app root + CrashBoundary + theme + global CSS
  components/                        ~30 components — tweaks, presets, gauges, asta, hardware, crash, etc.
  pages/                             Dashboard / Tweaks / Presets / Diff / Guides / Grind / Hardware /
                                     Asta / Toolkit / Diagnostics / Session / Profile / Pricing /
                                     Settings / Changelog / Benchmark
  store/                             Zustand stores (profile theme, VIP tier, custom presets)
  theme/                             5 profile themes (val/sonic/dmc/bo3/akatsuki) — CSS-var swap
  lib/                               catalog · presets · grind · hardware · research · audit ·
                                     astaBench · benchImpact · changelog · games · tauri (typed
                                     command wrappers)
src-tauri/                           Tauri 2 backend (Rust)
  Cargo.toml                         deps: tauri 2, wmi, raw-cpuid, winreg, windows, rusqlite,
                                     parking_lot, chrono, sysinfo, sha2, hmac, anyhow
  src/
    main.rs, lib.rs                  ~30 Tauri commands
    metrics.rs                       sysinfo wrapper
    crash.rs                         panic hook + crash log writer
    telemetry.rs                     anonymous opt-in (different HWID salt from VIP)
    process_helpers.rs               hidden_powershell / hidden_cmd / hidden_ping
    specs/                           WMI + CPUID + nvidia-smi probes
    engine/
      actions.rs                     TweakAction tagged-union
      registry.rs                    HKCU in-process; HKLM through elevation
      elevation.rs                   single-UAC batched cmd.exe runner
      file_write.rs                  user-profile FileWrite (Engine.ini, GameUserSettings.ini, etc)
      snapshots.rs                   SQLite snapshot store
    toolkit.rs                       DPC + ping + bufferbloat + 8311 ONU + LHM thermals
    vip.rs                           HWID compute + VIP code verify + worker round-trip
resources/
  catalog/v1.json                    The catalog (~96 tweaks)
  research/                          ~15 .md guide articles (raw-imported via Vite ?raw)
  community-presets/                 5 curated bundles
vip-worker/                          Cloudflare Worker (LIVE) — first-claim-wins VIP code ledger
telemetry-worker/                    Cloudflare Worker scaffold (deploy via wrangler) — anonymous
                                     opt-in event log
scripts/
  mint-vip-code.py                   HWID-bound mint
  mint-unbound-codes.py              Random 16-char codes for the worker ledger
  extract_with_llm.py                Catalog research extraction
  fetch_youtube_transcripts.py       YT corpus miner via yt-dlp
```

## Engine concepts (durable)

- **TweakAction tagged union** in `src-tauri/src/engine/actions.rs`. Variants: `RegistrySet`, `RegistryDelete`, `BcdeditSet`, `PowershellScript`, `FileWrite`. Top-level dispatcher at `engine::apply()` / `engine::revert()` / `engine::capture_pre_state()` routes by kind.
- **Snapshot store** (SQLite at `%LOCALAPPDATA%\optmaxxing\state.db`) holds: `tweaks_applied`, `pre_state`, `checkpoints`, `kv`. Every revert replays captured pre-state.
- **Single-UAC batched elevation:** `engine::elevation::build_apply_line(action)` produces per-action cmd.exe lines, `run_elevated_lines(&[String])` joins with `&&` and spawns ONE `Start-Process -FilePath cmd.exe -ArgumentList @('/c', ...) -Verb RunAs`.
- **PowerShell scripts** ride `-EncodedCommand <base64-utf16-le>` to dodge cmd.exe quoting hell.
- **Pre-state captured UNELEVATED** — registry read access is granted by default; bcdedit `/enum` is best-effort with `{ "found": "unknown" }` fallback.
- **No in-app BIOS / SPD / kernel-driver writes — ever.** "Refuse to be the tool that bricks someone's rig." Anything irreversible is articleware (RAM Advisor → Thaiphoon Burner / DRAM Calculator; SCEWIN guide; NVPI guide).

## Release flow (durable)

1. Bump version in 3 places: `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`
2. Add a `CHANGELOG[]` entry at the top of `src/lib/changelog.ts`
3. `cargo test --manifest-path src-tauri/Cargo.toml` (must be 100%)
4. `npx tsc --noEmit` (must be clean)
5. `git commit + git tag vX.X.X + git push origin main + git push origin vX.X.X`
6. CI (`release.yml`) builds + signs + creates **DRAFT** GH release + dispatches to maxxtopia
7. **Manual:** `gh release edit vX.X.X --repo MaxxTopia/optimizationmaxxing --draft=false`
8. Maxxtopia sync workflow updates `src/data/optimizationmaxxing-release.json`, fires deploy.yml, Cloudflare Pages auto-deploys
9. Existing v0.1.49+ installs see the in-app update banner on next launch

## Local dev
```
cd C:\Users\Diggy\projects\optimizationmaxxing
npm install
npm run tauri:dev               # full Tauri dev with Rust backend
```

Prereqs: Node 18+, Rust + cargo, Microsoft Visual Studio C++ Build Tools.

First `tauri:dev` compiles ~434 crates (~5-10 min). Incremental rebuilds <60s. Port 1420 zombie processes are the most common dev-loop blocker — kill via `Get-NetTCPConnection -LocalPort 1420 | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }` before restarting.

## Theme system

Five named profile themes, complete colorway + typography swap, applied via CSS custom properties on `:root` plus `profile-<id>` body class for per-theme overrides.

| Profile | Vibe | Primary | Secondary |
|---|---|---|---|
| `val` | Valorant tactical (default) | red `#e23947` | dark slate `#0f1923` |
| `sonic` | Speed, kinetic | gold `#ffd700` | cobalt `#007aff` |
| `dmc` | Devil May Cry gothic, serif headings | blood red `#b3000c` | wine `#6b2737` |
| `bo3` | Black Ops 3 cyber-tactical | neon orange `#ff6b1a` | olive `#5a6840` |
| `akatsuki` | Naruto-inspired void + gold | gold drop-shadow accents | void background |

Toggleable via header dropdown (`ThemePicker`) or `/settings` page. Persisted to localStorage as `optmaxxing-profile`.

## Sources of canonical tweaks
- Discord exports → `discord-archive/exports/servers/ss04-personal/diggy-tweaks-*.json` — highest trust
- YouTube creators → `references/optimizationmaxxing-youtube-creators.md` (fr33thy, lecctron, xilly, lestripez, reknotic)
- Competitors → `references/optimizationmaxxing-competitors-raw/{paragontweaks.md, hone-gg.md}` for parity sweep
- Pro configs → ProSettings.net, specs.gg (cross-referenced in `src/lib/grind.ts` + `src/lib/hardware.ts`)
