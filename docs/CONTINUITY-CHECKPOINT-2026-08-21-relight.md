# OptimizationMaxxing relight checkpoint — 2026-08-22 (started 2026-08-21)

## Scope

This checkpoint covers the relight / reliability pass requested for OptimizationMaxxing:

- audit and repair presets and catalog language;
- visibly separate measured, mechanism, situational, cosmetic, and experimental tweaks;
- add a plain-English CPU stability / degradation screening flow;
- add repeatable OS / Windows comparison snapshots to Asta Bench;
- improve first-run theme selection, Tune Now ticket UX, Asta rarity cards, Tournament Mode, SCEWIN guidance, Grind, Hardware, and Session language;
- inspect the MaxxTopia and Spritecannon surfaces before any site/media change;
- run typecheck, Rust tests, build, focused UI checks, and the documented release flow;
- update continuity and release notes before push / deployment.

## Recovered state

- Repository: `C:\Users\Diggy\projects\optimizationmaxxing`
- Branch: `main`
- HEAD: `7d8ec46` / v0.4.1, aligned with `origin/main` and tag `v0.4.1`
- Initial worktree: clean tracked state; preserved untracked WIP:
  - `_CONTENT-FRESHNESS-AUDIT-2026-06-27.md`
  - `_IF-YOU-LOSE-CLAUDE.txt`
  - `_PAWNIO-UPGRADE-SCOPE-2026-07-04.md`
  - `_demo_work/`
- Existing safety architecture: Tauri 2, SQLite apply snapshots, one-UAC batching, restore-point support, no BIOS/SPD/kernel-driver writes.
- Existing public release: v0.3.12 OAuth / registry / UAC fixes are live; VIP redemption still has a human retry gate from the prior continuity notes.
- The relight commit, v0.4.0 release, Sonic-theme correction, v0.4.1 release, MaxxTopia source edits, site deployments, and live-route checks are complete. No credentials were rotated and no material files were deleted. The working tree still contains the pre-existing WIP listed above.

## Evidence decisions locked for this pass

1. WHEA counts and a short Windows workload are screening signals only. The app must never call them proof that silicon is degraded. It should say when the result warrants BIOS-default validation, longer stress testing, Intel Processor Diagnostic Tool / OCCT, or an RMA conversation.
2. Intel’s current official guidance for affected 13th/14th-gen desktop CPUs is current vendor BIOS, Intel Default Settings, and microcode 0x12F or later. The old 0x12B floor stays historical context, not the “latest safe” headline.
3. Fortnite tournament readiness is separate from performance tuning. Current official requirements include Secure Boot, TPM, and IOMMU. Tournament Mode should explain that it protects eligibility by reverting explicitly flagged changes and verifying state; it is a no-op safety schedule when no flags exist, not a hidden FPS mode.
4. Microsoft documents `useplatformclock`, `tscsyncpolicy`, and related BCD options as debugging-only. They may remain available only as clearly experimental, reversible, user-acknowledged options; they must not be framed as universal wins.
5. Generic PowerShell actions still use a deterministic inverse path and cannot claim byte-perfect restore when a prior value was not captured. MSI mode and NIC interrupt moderation now capture exact per-device pre-state, refuse a guessed restore when no backup exists, and remain experimental / expert-only; they stay excluded from Tune Now and the Esports default lane.
6. Creator videos are useful for feature discovery and hypotheses, not efficacy proof. Every competitive recommendation must be cross-checked against authoritative Windows, vendor, Fortnite, or measured local evidence.
7. OS comparison is a local, repeatable snapshot lab. It compares runs on the same physical rig and does not pretend to validate a custom ISO, driver stack, game scene, or long-term stability by itself.
8. A Tune Now reward is a one-time, local ticket with a unique identifier and rig-bound proof string. It can be redeemed manually by Diggy; the app must not claim that a screenshot is cryptographically enforceable until a server claim endpoint exists.

## Research anchors

- Intel current Vmin Shift support: <https://www.intel.com/content/www/us/en/support/articles/000102331/processors.html>
- Intel Processor Diagnostic Tool guide: <https://www.intel.com/content/dam/support/us/en/documents/processors/sb/theintelprocessordiagnostictoolinwindowsuserguider.pdf>
- Epic tournament anti-cheat requirements: <https://www.fortnite.com/competitive/rules-guidelines/rules-library/new-fortnite-anti-cheat-pc-requirements-and-latest-legal-action?region=NAC>
- Microsoft BCD reference: <https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/bcdedit--set>
- Microsoft windowed-game optimization: <https://support.microsoft.com/en-au/windows/optimizations-for-windowed-games-in-windows-11-3f006843-2c7e-4ed0-9a5e-f9389e535952>
- MemTest86 limitation note: <https://www.memtest86.com/help.html>
- Hone restore-point / optimizer UX reference: <https://support.hone.gg/hc/en-gb/articles/4902940834079-Setting-Up-a-Restore-Point>
- Creator hypothesis reference reviewed: Lecctron’s Fortnite optimization guide (December 2024): <https://www.youtube.com/watch?v=IFypHfmUVUE>

## Implementation order completed

1. Add catalog metadata / validation and repair preset descriptions, duplicate IDs, experimental visibility, and Tune Now eligibility.
2. Add the CPU health screening command and UI; soften the existing Intel microcode copy.
3. Add OS Lab snapshots / comparison to Benchmark.
4. Add ticket modal, Asta score-based rarity, first-run theme selection, and plain-English Tournament / Session / SCEWIN flows.
5. Refresh Grind / Hardware with dated evidence and a rig-fit summary.
6. Inspect MaxxTopia / Spritecannon, restore the homepage after the correction, and make only focused, authorized cross-project edits.
7. Add `RESILIENCE.md`, update changelog / continuity, verify, publish, sync MaxxTopia, and verify the live package.

## Still unresolved / human gates

- Real-game Fortnite input / frametime validation remains a physical-game gate.
- CPU screening cannot replace long-duration stability testing or vendor diagnosis.
- OS comparisons need the user to run the same workload after each OS install with the same BIOS, driver, game mode, and scene.
- SCEWIN remains read-only guidance; AMI tool provenance and BIOS changes remain user-owned.
- The real Tauri CPU Health screen, thermal behavior, and native OS Lab run still need desktop validation.
- No ticket-winner identity is collected by the local app; ticket redemption remains manual until a secure server-side claim flow is approved.

## Implementation, release, and verification checkpoint — 2026-08-22

- Catalog: 100 entries pass `scripts/audit-catalog.mjs` with 0 errors / 0 warnings; 14 entries are explicitly experimental or risk-4. Risk, evidence tier, expected impact, warning text, ID references, and ASCII-safe apply/revert scripts are structurally checked.
- App additions: CPU Health screening with bounded workload + WHEA context; OS Lab median-of-three snapshots; Asta Fit guardrail; score-based Asta rarity; one-time local Tune Ticket; first-run bottom-four theme default; clearer Tournament, Session, SCEWIN, Hardware, and Grind surfaces.
- Safety edits: Tune Now excludes experimental / tournament-flagged entries; Esports is free and excludes device / boot / security experiments; MSI and NIC interrupt scripts save exact restore values; experimental confirmation/warnings are visible in tweak rows and preset apply flows.
- Content edits: current Windows 11 / Intel 0x12F+ / Epic Secure Boot + TPM + IOMMU boundaries are reflected in visible app copy; fixed FPS, latency, “universal drop-in,” and old Windows-version claims were softened or removed.
- Version/release notes: package, lockfile, Cargo, Tauri config, and app changelog are aligned to v0.4.1; `.github/workflows/release.yml` now emits a short `## Highlights` block so MaxxTopia’s existing release-sync workflow stays concise.
- Sonic correction: `src/components/SonicFastboi.tsx` reuses the original Sprite Cannon `fastboi__super.png` asset inside the Sonic dashboard hero; it is theme-gated, pointer-free, responsive, and respects reduced motion. Browser checks confirmed Val renders zero launchers, Sonic renders one, and the asset loads locally.
- Cross-project: MaxxTopia commits `5fc5b5a` (earlier Sonic/Fastboi homepage attempt), `29dc11e` (source-wall fixed-gain cleanup), `64f6281` (homepage restore + short v0.4.0 teaser), `18033d2` (single suite-style v0.4.1 update), and `e7aa7d2` (tuning-focused update rewrite) are pushed; existing dirty/untracked MaxxTopia work was preserved. The v0.4.1 repository-dispatch sync and all Cloudflare deploys succeeded.
- Checks passed: `npm run audit:catalog` (100 tweaks, 0 errors / 0 warnings); `npx tsc --noEmit`; `cargo test --manifest-path src-tauri/Cargo.toml` (84 passed); `npm run build` after the final placement and update-copy fixes; `git diff --check`; local browser/HTTP inspection of app theme gating and live MaxxTopia routes.
- Release: GitHub Actions run `32561994013` succeeded. Public release `v0.4.1` is non-draft/non-prerelease with `optimizationmaxxing_0.4.1_x64-setup.exe`, its `.sig`, and `latest.json`; GitHub reports installer digest `sha256:a4bf69493d660d3e7ddad26d2d61490f34a56927f888fe8606b60249eb9c4520`. Public `latest.json` reports `0.4.1` for both Windows channels; the release notes now use the tuning-focused copy too.
- Live MaxxTopia: homepage cache-busted verification contains the original “We build serious tools. And one ridiculous game.” arcade copy, no Sonic/Fastboi banner, and only the existing Sprite Cannon references. `/updates` now has one v0.4.1 Optimizationmaxxing card focused on presets, catalog risk boundaries, eligible Tune Now changes, CPU Health, OS Comparison, and other tuning improvements. The reward is only described as a chance at something rare for first-time Tuners, with light theme improvements as a final aside.

## Exact next action

The completion DM was sent through `C:\Users\Diggy\projects\adblockmaxxer\tools\notify-diggy.ps1`. Diggy should perform the native CPU Health / OS Lab run, a real Fortnite same-scene before/after comparison, and the physical tournament/SCEWIN gates. Keep an off-machine copy of this checkpoint and the project continuity snapshot for disaster recovery.

## First-time offer checkpoint — 2026-08-22

- Scope: replace the local screenshot-oriented Tune Ticket with a server-backed,
  account-linked discount offer. It is not a contest, does not grant VIP
  automatically, and the user can ignore it.
- Offer lifecycle: the first Tune Now creates one server session, assigns the
  final Gold / Emerald / Diamond tier and price, starts a three-day countdown,
  and stores the session for seven days. Discord OAuth captures the user ID;
  the permanent account record prevents normal repeat offers. Maxx Bot sends
  the linked offer by DM. Admin can list, DM again, redeem after payment, or
  revoke it.
- UX: the app shows the countdown, offer number, account-link status, Maxx Bot
  delivery status, copy-details action, Connect Discord, Check status, and
  Decide later. Offline fallback is visibly local and not account-secured.
- Source: app version files and changelog are aligned to v0.4.2. Existing
  untracked WIP remains untouched. No homepage or MaxxTopia source was changed.
- Verification: catalog audit passed with 100 tweaks / 0 errors / 0 warnings;
  frontend build passed; 84 Rust tests passed; Worker syntax and diff checks
  passed; local mocked Discord callback confirmed account binding, one DM, and
  consistent terms across app/session/DM/admin records.
- Live: `optmaxxing-vip.maxxtopia.workers.dev` deployed Worker version
  `cb8d106f-7b31-4747-8071-9efa5f8402a4`. A real prepare/status round-trip
  passed with a 259200000 ms window, then the exact test KV record was removed
  and verified as 404.
- Release: local `tauri:build` produced the executable and NSIS installer but
  stopped at local updater signing because the private signing key is
  intentionally not stored on this machine. GitHub Actions run `32609056540`
  supplied the existing secrets, built and signed the artifacts, verified
  `latest.json`, auto-published v0.4.2, and dispatched MaxxTopia sync. Public
  release assets are the installer, `.sig`, and `latest.json`.
- Known boundary: KV account uniqueness is strong for normal low-volume use but
  not a strict transaction during simultaneous callbacks. If concurrent abuse
  becomes material, move the account lock to a Durable Object.
- Next action: Diggy should run one real Tune Now flow with a Discord account,
  confirm the Maxx Bot DM, and manually verify the support-side discount/redeem
  path. Keep an off-machine copy of this checkpoint and the project continuity
  snapshot for disaster recovery.

## Lifetime offer ladder and current-season checkpoint — 2026-08-24

- Scope: keep the regular lifetime price at $115; change new first-time Tune
  Now offers to Gold $69 (40% off / save $46), Emerald $55 (52% off / save
  $60), and Diamond $33 (71% off / save $82). The 70% / 24% / 6% pull weights
  remain unchanged.
- Compatibility: older v0.4.2 sessions remain parseable and keep their issued
  price. New Worker sessions include normalPrice, savings, and
  discountPercent; app storage derives those fields when reading older records.
- UX: TuneTicketModal now has tier-specific foil, cut-emerald, and prism-blue
  treatments; each surface shows the exact percentage and dollar savings. The
  Pricing page states the regular $115 baseline, the 70-free / 30-VIP split,
  and the three first-time ticket prices without implying automatic VIP access.
- NVIDIA / Fortnite freshness: the shipped Fortnite .nip now matches the
  conservative four-setting catalog baseline (power management, texture
  filtering quality, VSync force-off, and pre-rendered frames deferred to the
  3D app). The guide now records the driver's current oracle value 610.88 as
  checked 2026-08-24 and Fortnite Chapter 7 Season 4: Override, launched
  2026-08-20. Real in-game same-scene validation remains a human gate.
- Free/VIP boundary: catalog audit still reports 100 tweaks, with 70 free and
  30 VIP. Free includes the lower-risk measured lane, Tune Now free subset,
  Asta Bench, per-tweak measurement, restore, and diagnostics; VIP adds the
  deeper catalog, Match Scan, Asta Mode, full presets, day-one configs, and
  priority support.
- Verification: `node --check vip-worker/worker.js`, JSON parsing,
  `npm run audit:catalog` (100 tweaks / 0 errors / 0 warnings), `npx tsc
  --noEmit`, `npm run build`, and `cargo test --manifest-path
  src-tauri/Cargo.toml` (84 passed) passed. `npm run tauri:build` produced the
  v0.4.3 executable and NSIS installer but stopped at the expected local
  updater-signing gate because the private signing key is not stored here.
- Visual QA: local browser preview saved to the task outputs as
  `optimizationmaxxing-ticket-tiers.png`, with individual Gold, Emerald, and
  Diamond previews. The app Pricing page was also checked after dismissing the
  What's New overlay.
- Release state: source commit `c442f1b` (`feat: refresh lifetime offer tiers`)
  is pushed to `main` with tag `v0.4.3`; the pre-existing untracked WIP remains
  untouched. The offer Worker is deployed at
  `https://optmaxxing-vip.maxxtopia.workers.dev` as version
  `5643c23f-f843-4981-a78a-0f6ded3ac188`.
- Live Worker check: a fresh prepare response returned Gold at $69 with
  `normalPrice: 115`, `savings: 46`, and `discountPercent: 40`. The exact test
  session was deleted and its status endpoint returned 404 afterward. CI run
  `32819106121` is still building/signing the desktop release; do not call the
  public installer live until its release and updater checks finish.
- Exact next action: wait for CI run `32819106121`, verify the v0.4.3 GitHub
  release assets and `latest.json`, then check the MaxxTopia sync and one
  cache-busted public release surface. Diggy still owes the real Discord
  Tune Now/DM/redeem test and a same-scene Fortnite before/after test. Keep an
  off-machine copy of this checkpoint and the project continuity snapshot for
  disaster recovery.
