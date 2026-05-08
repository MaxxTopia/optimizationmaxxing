# Optimizationmaxxing

> **STATE 2026-05-06: v0.1.9 SHIPPED. Phase 4d-v1 + Phase 4d-v2 + Phase 5b/5d (2 LLM passes).** Engine handles registry HKCU/HKLM + bcdedit boot-store + PowerShell scripts via a unified single-UAC cmd.exe batch. PowerShell scripts ride `-EncodedCommand <base64-utf16-le>` to dodge cmd.exe quoting. **Catalog: 43 tweaks** across 5 presets. New Phase 4d-v2 entries: Disable-MMAgent memory compression, Ultimate Performance powercfg duplicate, Hibernation off.

PC optimization tool for competitive gamers. 6th maxxer slot. Direct competitors: paragontweaks.net/utilities + hone.gg.

## Stack
- **Frontend:** Vite + React 18 + TS + Tailwind 3.4
- **Desktop:** Tauri 2 (Rust, ~5MB bundle vs Paragon's 81MB / Hone's heavier electron)
- **State:** Zustand (UI/theme), Rust + SQLite (engine state in `%LOCALAPPDATA%\optmaxxing\state.db`)
- **Live metrics:** sysinfo crate (CPU% / RAM)
- **Distribution (Phase 9):** GitHub Releases + Tauri updater + EV cert

## Project layout
```
src/                            Vite frontend
  App.tsx, main.tsx, index.css
  components/
    Layout.tsx, MaxxerSidebar.tsx, ThemePicker.tsx
    RingGauge.tsx, GameBenchmark.tsx, HowItWorks.tsx, WhyUs.tsx
    TweakRow.tsx
  pages/
    Dashboard.tsx                  hero + ring gauges + benchmarks + how-it-works + why-us
    Tweaks.tsx                     catalog browser w/ category filter + apply/preview/revert
    Presets.tsx                    3 bundles (Esports/BR/Streamer) batch apply
    Profile.tsx                    full spec breakdown
    Pricing.tsx                    Free/VIP w/ sale crossover + competitor comparison
    Settings.tsx                   theme grid
  store/
    useProfileStore.ts             persisted Zustand
    useMetrics.ts                  polls system_metrics every 2s
  theme/
    profiles.ts                    Val | Sonic | DMC | BO3
    ProfileProvider.tsx            CSS-var swap + body class
  lib/
    tauri.ts                       typed Tauri command wrappers
    catalog.ts                     v1.json loader + types
    presets.ts                     PresetBundle defs
src-tauri/                      Tauri 2 backend
  Cargo.toml                       tauri 2, plugin-shell/dialog, wmi, raw-cpuid,
                                   winreg, windows, rusqlite, parking_lot, chrono, sysinfo
  tauri.conf.json, build.rs
  src/
    main.rs, lib.rs                Tauri commands: bootstrap, detect_specs,
                                   preview_tweak, apply_tweak, revert_tweak,
                                   list_applied, system_metrics
    metrics.rs                     sysinfo wrapper
    specs/                         Phase 3 — WMI + CPUID + nvidia-smi probes
    engine/
      actions.rs                   TweakAction tagged-union
      registry.rs                  HKCU in-process; HKLM routes through elevation
      elevation.rs                 PowerShell Start-Process -Verb RunAs (Phase 4c-v0)
      snapshots.rs                 SQLite snapshot store
  agent/                           Phase 4c-v1: elevated sidecar (NOT BUILT YET)
  icons/                           OM-monogram placeholder
resources/
  catalog/v1.json                  10 hand-curated tweaks (pilot)
  catalog/draft/                   Phase 5 working artifacts
    discord-corpus.json            38 entries from 11 Discord exports
scripts/
  extract_discord_tweaks.py        Phase 5a corpus extractor
```

## Phase status

- ✅ **Phase 1 / 1b:** scaffold + UI lift
- ✅ **Phase 2:** 4-theme profile system (Val/Sonic/DMC/BO3) + ThemePicker + Settings UI
- ✅ **Phase 3:** spec detection (CPU/GPU/RAM/OS/Mobo + laptop flag)
- ✅ **Phase 4a:** SQLite snapshot store + RegistrySet/Delete (HKCU)
- ✅ **Phase 4c-v0:** PowerShell `Start-Process -Verb RunAs` per-action elevation (HKLM works, one UAC per action)
- ✅ **Phase 4c-v1:** single-UAC batched cmd.exe runner (one prompt for whole preset)
- ✅ **Phase 4d-v1 (2026-05-06):** BcdeditSet action variant + 5 bcdedit catalog tweaks + Frame Pacing preset
- ⏳ **Phase 4d-v2:** PowershellScript, FileWrite, ExternalToolInvoke, TimerResolution
- ✅ **Phase 5a:** Discord-tweaks corpus extractor (38 entries)
- ✅ **Phase 5b (2026-05-06):** LLM extraction wired (Gemini 2.5 Flash default, Anthropic optional). Run #1: 154 signal-tagged entries → 25 candidate tweaks → 8 promoted to v1.json after hand-review.
- ⏳ **Phase 5c:** Puppeteer scrape paragontweaks/hone.gg — pivoted: their tweak list is inside the .exe, not on the website. Recon dossiers only.
- ✅ **Phase 5d (2026-05-06):** YouTube transcript miner via yt-dlp (no API key). 5 creators × 8 keywords × 3 results = 63 unique videos. 207 transcript chunks, 138 signal-tagged.
- ✅ **Phase 6:** Catalog UI + 36-tweak v1.json + 5 presets (Esports/BR/Streamer/Frame Pacing/Network Low-Latency)
- ✅ **Visual upgrade:** live ring gauges, game benchmark cards, How it works, Why we beat the rest, Pricing
- ✅ **Release v0.1.8:** 40 tweaks total
- ✅ **Phase 4d-v2 (2026-05-06):** PowershellScript action variant (`apply` + optional `revert`). Encoded via base64-utf16-le. 4 unit tests pass. + 3 catalog tweaks: Disable-MMAgent, Ultimate Performance scheme, Hibernation off.
- ✅ **Release v0.1.9:** 43 tweaks total
- ✅ **Hosts-block tweaks (2026-05-06):** 2 PS-script catalog entries — Block MS Telemetry (15 endpoints), Block Windows Ads (10 endpoints). Marker-based append/strip in hosts file for reversibility.
- ✅ **Release v0.1.10:** 45 tweaks total
- ✅ **Restore Point + Tweaks UX (2026-05-06):** `revert_all_applied` Tauri command (one-UAC bulk revert), Settings page Restore Point card with confirm modal. Tweaks page gains free-text search + risk filter + admin filter + applied-state filter + clear-all.
- ✅ **Release v0.1.11:** Restore Point + Tweaks search/filter
- ✅ **v0.1.12 (2026-05-06):** +4 hand-curated tweaks (`ps.mmagent.disable-pagecombining`, `process.sysmain.disable`, `process.windows-search.disable`, `bcd.quietboot`) + Dashboard "Recommended for Your Rig" card (heuristic preset suggestion based on CPU vendor + RAM topology).
- ✅ **Release v0.1.12:** 49 tweaks total
- ✅ **Phase 5b pass-3 (2026-05-07):** flash 503'd / 429'd at startup; pivoted to `gemini-flash-latest` model alias (separate quota pool). 16 candidates → 5 hand-promoted: Disable Driver Auto-Updates, SmartScreen disable, Zone-Warning disable, MPO disable, Win11 Windowed-Game-Opt disable.
- ✅ **Per-tweak rig targeting:** new `targets: { cpuVendor[], gpuVendor[], osMinBuild, osMaxBuild, ramMinGb }` schema. 8 catalog entries tagged. Dashboard `RecommendedTweaks` component scores + sorts unapplied tweaks matching the user's spec.
- ✅ **Release v0.1.13:** 54 tweaks total
- ✅ **Release v0.1.14:** 57 tweaks, 12 rig-tagged
- ✅ **Release v0.1.15:** 60 tweaks, 15 rig-tagged
- ✅ **Custom Preset Builder (v0.1.16):** Zustand-persisted user-built presets at `src/store/useCustomPresets.ts`, `<CustomPresetBuilder>` modal at `src/components/CustomPresetBuilder.tsx`. Presets page now lists Your Custom Presets above Curated Bundles. Export/Import as JSON for sharing.
- ✅ **Landing site refresh:** `web-landing/index.html` updated to v0.1.16 stats — 60 tweaks, 5 presets, 3.5 MB installer, comparison row for custom-preset-builder + restore-point + spec-aware features.
- ✅ **Release v0.1.16:** Custom Preset Builder
- ✅ **Community Presets pack (v0.1.17):** 4 hand-curated bundled presets — Laptop Tuning, iGPU Rig Tuning, Streamer Plus, Competitive FPS Pure. JSON files at `resources/community-presets/`. New `<CommunityPresetsModal>` (Browse community button on Presets page) → one-click import per preset OR Import All.
- ✅ **Release v0.1.17:** Community Presets pack
- ✅ **Tune Score + Apply All Recommended (v0.1.18):** Dashboard now leads with `<SystemHealth>` — 0-100 weighted score (free 1.5pt, vip 2.5pt, risk-3+ +1pt) with grade tiers Stock/Lukewarm/Tuned/Tournament. RecommendedTweaks header gained an "Apply all N (1 UAC)" CTA that batches all visible recommendations.
- ✅ **Release v0.1.18:** Tune Score + Apply All Recommended
- ✅ **What's-New modal (v0.1.19):** First-launch-after-upgrade banner. Persists `lastSeenVersion` in `optmaxxing-changelog` localStorage. Shows entries between lastSeen and current, "Got it" marks current as seen. Hardcoded `CHANGELOG[]` covers the major v0.1.6+ ships. Vite `define` inlines `package.json.version` so the modal headline stays in sync without a runtime fetch.
- ✅ **Release v0.1.19:** What's-New modal
- ✅ **Suggest-a-Tweak + structured Preview (v0.1.20):** Tweaks page header gains a Suggest-a-Tweak button → modal with template textarea, Copy-to-clipboard, Discord placeholder, Email-diggy fallback. Tweaks Preview drawer is now a structured component (`<TweakPreviewDrawer>`) showing per-action cards with kind chip + hive\path\name + Before → After value boxes. Replaces the old raw-JSON dump entirely.
- ✅ **Release v0.1.20:** Suggest-a-Tweak + structured Preview drawer
- ✅ **Polish batch (v0.1.21):** Expandable TweakRow (rationale + risk-why + source citation columns); Preset glyphs (⚡ 🎯 🎬 ⏱ 🌐); RecentlyApplied component on Dashboard; Compare Presets matrix modal; web-landing/versions.json stub for Phase 9 self-update prep.
- ✅ **Release v0.1.21:** Polish batch
- ✅ **+5 curated tweaks (v0.1.22):** `ui.sticky-keys.disable` (3-action — StickyKeys + FilterKeys + ToggleKeys), `process.connected-standby.disable` (force S3 sleep), `privacy.win11.recall.disable` (osMin 26100, Win11 24H2+), `privacy.windows-spotlight.disable`, `ui.taskbar-search.minimize`. **65 tweaks total.**
- ✅ **Release v0.1.22:** +5 curated tweaks
- ✅ **Calm Mode + OG scaffold (v0.1.23):** 5th community preset (Calm Mode — bundles all the lock-screen/Spotlight/Recall/sticky-keys/transparency/autostart kills). Tagged `privacy.activity-history.disable` with `osMinBuild 17134`. Added `web-landing/og.html` template + og:image meta tags + Twitter card; PNG screenshot generation deferred (instructions in og.html comment).
- ✅ **Release v0.1.23:** Calm Mode preset + OG scaffold
- ✅ **Targets metadata visible (v0.1.24):** Expanded TweakRow gains a 4th "For this rig" column showing `Requires: CPU vendor: amd · Win build ≥ 22000 · RAM ≥ 16 GB.` plus live "matches ✓ / does not match ✗" against the user's spec. Shared module-level spec cache so every TweakRow doesn't refetch.
- ✅ **Release v0.1.24:** Targets metadata visible in expanded TweakRow
- ✅ **OG image shipped (2026-05-07):** `web-landing/og.png` (126 KB, 1200×630) generated via Puppeteer MCP screenshot of `og.html`.
- ✅ **Mega-batch v0.1.25:** **70 tweaks total** (+5 curated: Wake Timers, News-and-Interests Win10, Storage Sense, Snap-Layouts hover, Cloud Clipboard). New `/changelog` page route showing full CHANGELOG[]. `web-landing/sitemap.xml` + `robots.txt`. Dashboard SystemHealth gains "Lift the score: N/M `<category>` applied. Try `<preset>` →" hint. Compare matrix gains free-text search filter. KindChip icons (🔑 reg-set / 🗝 reg-delete / ⚙ bcdedit / ⌨ powershell). Community presets get glyphs (🔋 🎨 🎥 🏆 🌙).
- ✅ **Release v0.1.25:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.25_x64-setup.exe` (3.5 MB)
- ✅ **v0.1.26 (2026-05-07):** `/changelog` wired into the in-app nav (Layout.tsx) + suite rail recognises `/changelog` and `/toolkit` as internal routes. Rig targeting expanded 19 → 26/70 tweaks — added OS-build floors on FSE-global, Power Throttling, Ultimate Performance, Bing-in-Start, Modern Standby, Storage Sense, Cloud Clipboard. CHANGELOG backfilled v0.1.19 / 20 / 21 / 23 / 25 / 26. versions.json bumped.
- ✅ **Release v0.1.26:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.26_x64-setup.exe` (3.55 MB)
- ✅ **v0.1.27 (2026-05-07):** New `/diagnostics` page (Diagnostics.tsx) — one-shot rollup of spec + live metrics + temps + disk-free, with Copy-snapshot for Discord support pasting. Wired into nav. Landing site refreshed v0.1.16 → v0.1.27 (70 tweaks / 10 presets, expanded comparison + features cards). og.html stats updated (og.png regen still owed).
- ✅ **Release v0.1.27:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.27_x64-setup.exe` (3.55 MB)
- ✅ **v0.1.28 (2026-05-07):** Catalog state audit. `lib/audit.ts` compares each tweak's current registry/BCD value to its target via existing `previewTweak`. New "Scan rig state" button on Tweaks page, summary banner, per-row state badges (✓ already / ◐ partial / ✗ would change / ? unknown for PS), per-action breakdown in expanded view, "On-rig" filter chips. Answers "did this tweak actually change anything or was it already set?" without applying.
- ✅ **Release v0.1.28:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.28_x64-setup.exe` (3.55 MB)
- ✅ **v0.1.29 (Plan Parts 1-2 — gap closure):** Catalog 70 → 78. 2 LLM-promoted (TCP window cap, USB-3 reveal merged into disable) + 6 high-impact gap closures from Discord corpus: NIC interrupt moderation off / flow control off / RSS forced on (PS via Get-NetAdapter loop), CPU core parking disabled (powercfg, native), PCIe ASPM off, USB-3 link power off (reveal+disable chain), HPET device-side disabled (Service Start=4). New Tournament FPS community preset (⚔) bundles all 8. Plan: `~/.claude/plans/fuzzy-baking-swing.md`.
- ✅ **Release v0.1.29:** 3.55 MB
- ✅ **v0.1.30 (Plan Part 3 — the differentiator):** New DPC + Interrupt Time card on Diagnostics page. Backend: WMI Win32_PerfFormattedData_PerfOS_Processor → `read_dpc_snapshot()` in toolkit.rs → new `dpc_snapshot` Tauri command. UI: 2 big stats + per-CPU expandable + Save baseline (localStorage) + diff column. Color thresholds (green ≤2% / neutral 2-5% / red >5%). Apply-preset measurable before/after. Every other tuner applies and asks for trust; we measure.
- ✅ **Release v0.1.30:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.30_x64-setup.exe` (3.57 MB)
- ✅ **v0.1.31 (Plan Part 4 — FileWrite engine action):** New `TweakAction::FileWrite { path, contents_b64 }` variant. Engine module at `src-tauri/src/engine/file_write.rs`. Snapshot-backed byte-perfect revert (≤1 MB cap), env-var path expansion (%USERPROFILE% etc., case-insensitive), user-profile vs admin-path routing. New `engine::apply_unelevated` / `revert_unelevated` helpers. Catalog can now ship `.ini` / `.nip` / `.cfg` tweaks. Frontend wiring: tauri.ts type, audit.ts file_write case (byte-equal compare), TweakPreviewDrawer KindChip 📝, tweakRequiresAdmin path heuristic. **16/16 cargo unit tests pass** (6 new file_write tests). ExternalToolInvoke deferred until bundled signed binaries available.
- ✅ **Release v0.1.31:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.31_x64-setup.exe` (3.58 MB)
- ✅ **v0.1.32 (audit-driven correctness pass):** 3 research agents validated every catalog entry vs Microsoft Learn + community. **Catalog 78 → 68 honest tweaks**: removed 10 placebos (bcd.useplatformtick + bcd.clockres + 5 deprecated TCP entries + duplicate HPET + GlobalMaxTcpWindowSize + MaxFreeTcbs). Fixed 2 wrong values (zone-warning 1→2, mouse-shadow path). Fixed 2 revert bugs (PCIe ASPM AC default, Flow Control vendor-tolerant fallback). Updated 4 misleading rationales (priority-separation, cpu-mitigations coverage, spotlight key target, telemetry SKU floor). Rebuilt Network Low-Latency around tweaks that actually work on Win10/11. 16/16 unit tests still pass. Principle: every tweak must trade off verifiably; no-op = anti-trust.
- ✅ **Release v0.1.32:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.32_x64-setup.exe` (3.58 MB)
- ✅ **v0.1.33 (audit deferral pass — all 8 UX/correctness flags):** DPC migrated to `Win32_PerfFormattedData_Counters_ProcessorInformation` (per-NUMA/per-CCD). DPC warming-up badge + auto-retry. NIC tweaks probe-and-log to `%LOCALAPPDATA%\optmaxxing\nic-tweak.log` with vendor-tolerant fallbacks. `formFactor: ['desktop' \| 'laptop']` added to TweakTargets — 5 laptop-hostile tweaks tagged desktop-only. FileWrite pre-state pins apply-time resolved path. `registry::delete_value` propagates non-NotFound errors. `is_user_profile_path` drops TEMP/TMP + only trusts env vars resolving under USERPROFILE. Preview drawer surfaces one-way actions (subkey-delete + PS without revert) prominently. **17/17 unit tests** pass.
- ✅ **Release v0.1.33:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.33_x64-setup.exe` (3.57 MB) — peak-strength state per the plan.
- ✅ **v0.1.34 (knowledge-audit gap closure):** User ran a 25-item depth audit pre-deployment. Shipped 4 confident additions: (1) Latency Probe on Toolkit (6 gaming-relevant targets + custom slot), (2) PCIe Link card on Diagnostics (Get-PnpDeviceProperty width/gen surfacing), (3) AMD UCLK heuristic warning (Ryzen 7000 > 6400 MT/s flag), (4) Discord low-FPS research article (manual-toggle guide; can't auto-edit Discord's leveldb prefs). Open roadmap: Intel microcode advisor, CRU integration, MSI mode, SCEWIN, per-vendor BIOS cards. Placebo flagged + rejected: msconfig "number of processors".
- ✅ **Release v0.1.34:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.34_x64-setup.exe` (3.60 MB)
- ✅ **v0.1.35 (research-driven mega-batch):** 4 parallel general-purpose research agents covered MSI/IRQ/HID, scheduling/clean-boot, GPU/driver/microcode/CRU, and live-latency/polling-rate. Verbatim Microsoft Learn + vendor + community citations. Shipped: IntelMicrocodeCard (0x12B floor detect) + VbsStatusCard (BCD/HVCI/runtime tri-probe) + live DPC sparkline (1-Hz toggle). Catalog 68 → 87: HID priority quartet, vbs.hvci.disable, IFEO priority-high for Fortnite/Valorant/CS2, 9 service kills, tasks.telemetry-batch.disable (14 scheduled tasks), process.msi-mode.gpu-nic-audio (PS enumerator with hard exclude list). New "Clean State Gaming" community preset. Honest non-shippers: IFEO Affinity is folklore, Realtime priority causes input starvation, CRU too risky, NVPI/DDU need Phase 4d-v2.
- ✅ **Release v0.1.35:** `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.35_x64-setup.exe` (3.61 MB)
- ⏳ **Awaiting Discord setup:** placeholder URL in `SuggestTweakModal.tsx` — replace `SUGGEST_DISCORD_URL` once the server invite exists.
- 🚫 **Pass-5 extraction blocked:** Gemini free-tier daily quota exhausted across flash + flash-latest + flash-2.0. Pacing was 0.7s (way over 10 RPM). Increased to 10s in script. Lite still has quota but produces hallucination. Try again tomorrow.
- ⏳ **EV cert + GitHub Releases auto-update wiring**

## Theme system (Phase 2 ✓)

Four named profile themes — complete colorway + typography swap, applied via CSS custom properties on `:root` plus `profile-<id>` body class for per-theme overrides.

| Profile | Vibe | Primary | Secondary |
|---|---|---|---|
| `val` | Valorant tactical (default) | red `#ff4655` | dark slate `#0f1923` |
| `sonic` | Speed, kinetic | gold `#ffd700` | cobalt `#007aff` |
| `dmc` | Devil May Cry gothic, serif headings | blood red `#b3000c` | wine `#6b2737` |
| `bo3` | Black Ops 3 cyber-tactical | neon orange `#ff6b1a` | olive `#5a6840` |

Toggleable via header dropdown (`ThemePicker`) or `/settings` page. Persisted to localStorage as `optmaxxing-profile`.

## Engine (Phase 4)

- **Snapshot store:** SQLite at `%LOCALAPPDATA%\optmaxxing\state.db` — `tweaks_applied`, `pre_state`, `checkpoints`, `kv` tables
- **TweakAction:** `RegistrySet { hive, path, name, value_type, value }`, `RegistryDelete { hive, path, name? }`, `BcdeditSet { name, value }`. Top-level dispatcher at `engine::apply()` / `engine::revert()` / `engine::capture_pre_state()` routes by kind.
- **Elevation (Phase 4c-v1 + 4d-v1):** Single-UAC batched runner. `engine::elevation::build_apply_line(action)` and `build_revert_line(action, pre_state)` produce per-action cmd.exe lines (reg add / reg delete / bcdedit /set / bcdedit /deletevalue). `run_elevated_lines(&[String])` joins with `&&` and spawns ONE `Start-Process -FilePath cmd.exe -ArgumentList @('/c', script) -Verb RunAs`. Pre-state captured unelevated (registry read default-granted; bcdedit /enum best-effort with `{ "found": "unknown" }` fallback).
- **Catalog v1.1.0-bcdedit:** `resources/catalog/v1.json` ships 28 curated tweaks. Loader at `src/lib/catalog.ts`. Per-tweak fields: `riskLevel`, `vipGate`, `anticheatRisk`, `rebootRequired`, `actions[]`.
- **Presets:** 4 bundles in `src/lib/presets.ts`. Esports + BR + Frame Pacing are VIP-gated, Streamer is free.

## Local dev
```
cd C:\Users\Diggy\projects\optimizationmaxxing
npm install
npm run tauri:dev               # full Tauri dev with Rust backend
```

Prereqs: Node 18+, Rust + cargo, Microsoft Visual Studio C++ Build Tools.

First `tauri:dev` compiles ~434 crates (~5-10min). Incremental rebuilds <60s.

## Release build
```
npm run tauri:build             # produces NSIS installer
```

Outputs:
- `src-tauri/target/release/optimizationmaxxing.exe` — raw binary
- `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.1.0_x64-setup.exe` — installer

## Competitor recon
- `references/optimizationmaxxing-competitors-raw/paragontweaks.md` — Paragon (50K subs, 81MB, $8-20)
- `references/optimizationmaxxing-competitors-raw/hone-gg.md` — Hone.gg (2.4M users, Epic Games)

## Sources of canonical tweaks
- Discord exports → `discord-archive/exports/servers/ss04-personal/diggy-tweaks-*.json` (11 channels, 38 messages, 16 with regex signals) — highest trust
- YouTube creators → `references/optimizationmaxxing-youtube-creators.md` (fr33thy, lecctron, xilly, lestripez, reknotic)
- Competitors → paragontweaks/hone.gg recon for parity sweep
