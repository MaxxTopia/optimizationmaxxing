# Best Windows version per game (as of 2026)

**TL;DR: Win11 24H2 or 25H2 for stability + game compatibility — both are the only supported consumer branches in 2026. Don't run 22H2 or 23H2: they're end-of-life (no security updates). 24H2 is now the mainstream gaming base; most launch-era bugs were patched through 2025-2026. Win11 IoT LTSC 2024 (24H2 base) is the lean alternative. Win10 hit EOL Oct 14, 2025 — security risk for new builds.**

## Win11 24H2 / 25H2 — the current base (as of patch Tuesday Feb 2026)
24H2 is now the mainstream supported gaming base. The big launch-era problems (the Vanguard incompatibility gap, EAC drift, BSODs) were resolved through 2025-2026 cumulative updates. Residual cautions worth knowing:
- Some DPC latency reports on Intel 13th/14th gen rigs (scheduler/E-core interaction) — mostly mitigated by recent updates + BIOS microcode
- Occasional HID polling hiccups on 8000 Hz mice
- Recall + Copilot+ daemons add background CPU even when "off" — strip via our preset
- Auto HDR regressions on a few monitors

**25H2** (rolled out from Sept 30, 2025) is the current latest release. It ships as a small enablement package on the shared 24H2 servicing branch — same build family (10.0.26200), same drivers/behavior — so the per-game notes for 24H2 apply equally to 25H2. There's no compatibility reason to stay below it.

If you're already on 24H2/25H2 and stable: leave it. Do **not** fall back to 22H2/23H2 — they're EOL and get no security patches; the only "older + supported" path is LTSC (below).

## Per-game recommendations

| Game | Recommended Windows | Why |
|---|---|---|
| **Valorant** | 11 24H2 / 25H2 | Vanguard fully compatible since the 2024 patch; early random kicks resolved |
| **Fortnite** | 11 24H2 / 25H2 | UE5.5 in Chapter 6+ runs clean on the current branch |
| **CS2** | 11 24H2 / 25H2 | Early-24H2 DPC latency reports largely mitigated by 2025-2026 updates |
| **Apex Legends** | 11 24H2 / 25H2 | EAC drift from early-2025 is fixed; stable on the current branch |
| **Overwatch 2** | 11 24H2 / 25H2 | No known issues |
| **COD: Warzone / MW3** | 11 24H2 / 25H2 | Ricochet AC works clean; early launcher hangs resolved |
| **Marvel Rivals** | 11 24H2 / 25H2 | Newest engine; Lumen pipelines optimized for current schedulers |
| **R6 Siege** | 11 24H2 / 25H2 | BattlEye fully compatible; LTSC 2024 if you want minimal surface |
| **Rocket League** | Any | Engine is ancient + super stable |
| **Minecraft (Java)** | Any | Java overhead dominates anything OS-level |

## LTSC option
- **Win11 IoT Enterprise LTSC 2024** (24H2 base) — minimal app surface, no Recall/Copilot daemons, and a **10-year lifecycle (supported through Oct 10, 2034)**. Note: this long support window is specific to the *IoT* Enterprise SKU; the non-IoT Enterprise LTSC 2024 is only 5 years (ends Oct 9, 2029).
- Closest thing to "Windows you'd actually want for gaming" if you're willing to do the LTSC dance (license source, in-place upgrade or fresh install).
- Tradeoff: HDR + auto-HDR + Auto SDR colorpipe support is reduced.

## Win10 22H2 (legacy choice)
- Still works fine for any title that supports DX11/DX12.
- **Reached end-of-life Oct 14, 2025.** Security patches now come only via Extended Security Updates (ESU). Consumer ESU has a **free path** — enroll through Windows Backup / Microsoft account sync, or redeem 1,000 Microsoft Rewards points (the one-time $30 is the paid fallback). Microsoft extended free consumer ESU into a second year, now ending **Oct 14, 2027**. (0patch is a third-party alternative.)
- Avoid for new builds; don't downgrade from Win11 if you're already there.

## What to do on a fresh build
1. Install Win11 24H2 or 25H2 (or Win11 IoT LTSC 2024 if you have the license). Do **not** install 22H2/23H2 — they're EOL and unpatched.
2. Run our Streamer / BR / Esports preset.
3. Disable Auto HDR / Auto SDR if your monitor doesn't support it cleanly.
4. **Don't** install Recall. **Don't** sign in with a Microsoft account; use a local account. Note: the old `oobe\BypassNRO` one-liner was removed in 24H2 (~March 2025), and the follow-up `start ms-cxh:localonly` trick was also blocked from late 2025. The reliable local-account paths now are an **unattended `autounattend.xml` answer file** (generate one via Rufus or schneegans.de) or a re-implementation like the Stensel8 BypassNRO script.
5. Disable telemetry via the catalog tweaks.

## Citations
- Microsoft Windows release notes (learn.microsoft.com)
- Microsoft Lifecycle — Win11 Home & Pro (24H2/25H2 supported; 23H2 ended Nov 11, 2025; 22H2 ended Oct 8, 2024): learn.microsoft.com/en-us/lifecycle/products/windows-11-home-and-pro
- Microsoft Lifecycle — Win11 Enterprise & Education (22H2 all editions EOL Oct 14, 2025): learn.microsoft.com/en-us/lifecycle/products/windows-11-enterprise-and-education
- Microsoft IT Pro Blog — Win11 25H2 (build 26200, enablement package on 24H2 branch): techcommunity.microsoft.com/blog/windows-itpro-blog/get-ready-for-windows-11-version-25h2/4426437
- Microsoft Lifecycle — Win11 IoT Enterprise LTSC 2024 (end of support Oct 10, 2034): learn.microsoft.com/en-us/lifecycle/products/windows-11-iot-enterprise-ltsc-2024
- Microsoft — Win10 Extended Security Updates (free consumer paths; extended to Oct 14, 2027): microsoft.com/en-us/windows/extended-security-updates
- Local-account OOBE: BypassNRO removed ~Mar 2025, ms-cxh:localonly blocked late 2025 — windowslatest.com + github.com/Stensel8/BypassNRO
- Riot Games Vanguard release log
- HardwareUnboxed Win10 vs Win11 vs LTSC 2024 benchmark series
