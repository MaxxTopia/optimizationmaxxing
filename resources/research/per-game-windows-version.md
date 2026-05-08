# Best Windows version per game (as of 2026)

**TL;DR: Win11 22H2 or 23H2 for stability + game compatibility. 24H2 has DPC/HID issues for some titles. Win10 22H2 still works but is past EOL — security risk.**

## Win11 24H2 issues (as of patch Tuesday Feb 2026)
- Random DPC latency spikes on some Intel 13th/14th gen rigs (root cause: new scheduler interaction with E-cores)
- HID polling hiccups affecting 8000 Hz mice
- Vanguard had a 4-week gap of incompatibility right after release; Riot patched but trust is shaken
- New Recall + Copilot+ daemons add background CPU even when "off"
- Auto HDR has a regression on some monitors

If you're already on 24H2 and stable: leave it. If you're upgrading from 22H2: wait one more cumulative update or skip to LTSC.

## Per-game recommendations

| Game | Recommended Windows | Why |
|---|---|---|
| **Valorant** | 11 22H2 / 23H2 | Vanguard tested longest on these; 24H2 still has random kicks |
| **Fortnite** | 11 23H2 or 24H2 | UE5.5 in Chapter 6+ runs equally well; pick stability |
| **CS2** | 11 22H2 | DPC latency on 24H2 is the most-reported issue |
| **Apex Legends** | 11 22H2 | EAC drift on 24H2 early-2025; mostly fixed but not bulletproof |
| **Overwatch 2** | 11 23H2 / 24H2 | No known issues on 24H2 |
| **COD: Warzone / MW3** | 11 23H2 | Ricochet AC works clean; 24H2 had launcher hangs |
| **Marvel Rivals** | 11 24H2 | Newest engine; Lumen pipelines optimized for newer schedulers |
| **R6 Siege** | 11 22H2 | BattlEye + older engine; older Windows = fewer surprises |
| **Rocket League** | Any | Engine is ancient + super stable |
| **Minecraft (Java)** | Any | Java overhead dominates anything OS-level |

## LTSC option
- **Win11 IoT LTSC 2024** (24H2 base) — minimal app surface, no Recall/Copilot daemons, 5-year support.
- Closest thing to "Windows you'd actually want for gaming" if you're willing to do the LTSC dance (license source, in-place upgrade or fresh install).
- Tradeoff: HDR + auto-HDR + Auto SDR colorpipe support is reduced.

## Win10 22H2 (legacy choice)
- Still works fine for any title that supports DX11/DX12.
- **Out of mainstream support since Oct 2025.** Patches are paid-extended via Microsoft 0patch or ESU.
- Avoid for new builds; don't downgrade from Win11 if you're already there.

## What to do on a fresh build
1. Install Win11 23H2 (or LTSC 24H2 if you have the license).
2. Run our Streamer / BR / Esports preset.
3. Disable Auto HDR / Auto SDR if your monitor doesn't support it cleanly.
4. **Don't** install Recall. **Don't** sign in with a Microsoft account; use a local account (use `oobe\BypassNRO` during OOBE).
5. Disable telemetry via the catalog tweaks.

## Citations
- Microsoft Windows release notes (learn.microsoft.com)
- Riot Games Vanguard release log
- HardwareUnboxed Win10 vs Win11 vs LTSC 2024 benchmark series
