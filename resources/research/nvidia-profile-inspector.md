# NVIDIA Profile Inspector — exact settings, no broken .nip files

NVIDIA Control Panel exposes maybe 15% of the actual driver knobs. The rest live behind undocumented profile flags only reachable via **NVIDIA Profile Inspector** (NVPI). The old "download Calypto's .nip" workflow is dead — that GitHub repo (`Calyptotech/CalyptoNVPIPresets`) returns 404 and Calypto's profile (`github.com/Calypto`) currently has no NVPI preset repo. So this guide skips the import dance entirely. Set the values yourself — same result, no broken links.

Requires a GeForce 900-series or newer (Reflex hardware floor). 1000/2000/3000/4000/5000 all work.

## TL;DR — 60-second setup

1. Download NVPI: **[github.com/Orbmu2k/nvidiaProfileInspector/releases](https://github.com/Orbmu2k/nvidiaProfileInspector/releases)** — grab the latest `nvidiaProfileInspector.zip`, extract, run the `.exe`. No install. Verified working May 2026.
2. **Pick your shortcut:**
   - **Want the import-and-go path?** Grab one of our pre-built `.nip` profiles below → NVPI → **File → Import Profile(s)** → select the file → **Apply changes** (top-right green checkmark). Done.
   - **Want full transparency?** Use the global-baseline + per-game tables further down. Type the values into NVPI yourself.
3. Restart the game. Settings stick across driver updates.

## One-click `.nip` profiles (new in v0.1.83)

We hand-crafted these against [Orbmu2k's `NvApiDriverSettings.h`](https://github.com/Orbmu2k/nvidiaProfileInspector/blob/master/nvidiaProfileInspector/Native/NVAPI/NvApiDriverSettings.h) so every setting ID + value is verified, not guessed. Each profile binds to the game's `.exe` so NVPI auto-applies on launch.

| Game | Download | What's included |
|---|---|---|
| **Fortnite — pinnacle** | [fortnite-pinnacle.nip](/nvpi-profiles/fortnite-pinnacle.nip) | 14 settings: Power Mgmt = Prefer Max, **Threaded Optimization = OFF** (the UE5 stutter fix pros gatekeep), VSync force off, Texture filtering High Performance, Negative LOD bias Clamp, Aniso sample + filter + Trilinear opts ON, FXAA + MFAA off, Pre-rendered frames = 1, Ansel disabled, Smooth AFR off |
| **Valorant** | [valorant.nip](/nvpi-profiles/valorant.nip) | 6 settings: Power Mgmt Prefer Max, VSync off, Texture filtering High Perf, Negative LOD Clamp, FXAA off, Pre-rendered frames = 1. Threaded Optimization left at AUTO (Vanguard-cautious). Binds to `VALORANT-Win64-Shipping.exe` + `vgc.exe`. |
| **Counter-Strike 2** | [cs2.nip](/nvpi-profiles/cs2.nip) | Same 6-setting baseline as Valorant. Binds to `cs2.exe`. |
| **Apex Legends** | [apex-legends.nip](/nvpi-profiles/apex-legends.nip) | Same 6-setting baseline. Binds to `r5apex.exe` + `r5apex_dx12.exe`. |

The Fortnite pinnacle is the only profile that flips **Threaded Optimization = OFF** — that's the one setting that genuinely gatekeeps Fortnite perf at the top bracket (UE5 main-thread stutter). The other 3 games leave it at AUTO since they handle threading correctly and aggressive driver-side toggles risk anti-cheat false positives.

**To import:** NVPI → File → Import Profile(s) → select the `.nip` → Apply changes. Verify by opening the game's profile in NVPI again — the values should reflect what's in the table.

### How to verify the .nip actually changed your driver settings

NVPI's "import successful" message only confirms the XML parsed. The green Apply button is what writes to the driver profile DB. To confirm the changes stuck:

1. **In NVPI, immediately after Apply** — keep the same game profile selected in the top dropdown. Scroll the settings list. Each setting from the import should now show its new value (e.g. **Power management mode** should read `Prefer maximum performance`, **Threaded optimization** = `Off` on Fortnite, **Vertical Sync** = `Force off`, etc).
2. **Close NVPI, re-open it, switch back to the game profile.** Values should still be there. If they revert, the Apply step didn't commit — try again as admin.
3. **Reboot, re-open NVPI** — values must persist. The driver profile DB is on disk, so a reboot is the strongest "did it actually save" test.
4. **In-game test (Fortnite specifically):** launch a Lobby Bot match or Creative practice map → enter a 4v4 build-fight → if **Threaded Optimization = Off** took effect, the render-thread stutters during the build-spam moments should noticeably reduce. CPU-bound 1% lows tighten 2-5 FPS.
5. **Driver version sanity** — if you update GeForce drivers after this, re-verify in NVPI. Some setting IDs get re-mapped across driver versions and the imported value may not survive.

## Global lowest-latency baseline (set on every game profile)

| NVPI section | Setting | Set to | Why |
|---|---|---|---|
| **Common** | Power management mode | **Prefer maximum performance** | GPU never downclocks mid-frame. Stacks with Reflex Boost. |
| **Sync and Refresh** | Vertical Sync | **Off** | VSync adds 1-3 frames of queue latency. Use G-Sync + in-game cap instead. |
| **Sync and Refresh** | Vertical Sync Tear Control | **Standard** | Only matters if you re-enable VSync; harmless otherwise. |
| **Sync and Refresh** | Frame Rate Limiter V3 | **Off** (use in-game cap) | NVPI's limiter beats RTSS for latency but in-game limiter + Reflex beats both. Leave Off unless the game has no cap option. |
| **Common** | Low Latency Mode | **On** (no Reflex) / **Off** (Reflex game) | Reflex replaces this — see per-game table. Never **Ultra** on a Reflex game (fights Reflex). |
| **Texture Filtering** | Texture filtering - Quality | **High performance** | Disables LOD shimmer reduction, +2-4% FPS, no visible quality loss at competitive settings. |
| **Texture Filtering** | Texture filtering - Negative LOD bias | **Clamp** | Stops shimmer artifacts; required when AF is forced. |
| **Texture Filtering** | Texture filtering - LOD bias (DX) | **0.0000** | Default. Negative values are for ssaa edge sharpening — not competitive. |
| **Texture Filtering** | Anisotropic filtering setting | **Application-controlled** | Override only if game doesn't expose AF. |
| **Texture Filtering** | Anisotropic sample optimization | **On** | Cheaper AF samples. Visually identical at 1080p/1440p. |
| **Texture Filtering** | Trilinear optimization | **On** | Same as above. |
| **Antialiasing** | Antialiasing - FXAA | **Off** | Use the game's AA — driver-level FXAA blurs UI. |
| **Antialiasing** | Antialiasing - Transparency Multisampling | **Off** | Costs FPS; competitive titles don't need it. |
| **Antialiasing** | Antialiasing - Transparency Supersampling | **Off** | Same. |
| **Common** | Shader Cache Size | **Unlimited** (or 100 GB) | Bigger cache = fewer first-encounter stutters. ~3 GB typical usage. |
| **Common** | Threaded optimization | **Auto** (Valorant/CS2/Apex), **Off** (Fortnite) | UE5 Fortnite specifically deadlocks the main thread with this On. Other games are fine on Auto. |
| **Other** | Background Application Max Frame Rate | **0** (disabled) | Lets your game keep rendering full-speed when alt-tabbed. |

The top-right **Apply changes** button is the green checkmark — `Ctrl+S` works too. PCGamingWiki confirms the import path is **File → Import Profile(s)** if you do later pick up a community `.nip`.

## Per-game overrides

### Fortnite (UE5, CPU-bound)
| Setting | Value | Why |
|---|---|---|
| **Threaded optimization** | **Off** | UE5 main-thread stutter — single biggest NVPI win for Fortnite. |
| **Low Latency Mode** | **Off** | In-game Reflex is canonical. Ultra fights Reflex. Off in NVPI = leave it to in-game. |
| **In-game** Reflex Low Latency | **On + Boost** | Peterbot/Bugha/Clix all run this. |
| **In-game** Frame Rate Limit | **Match monitor refresh - 3** (e.g. 237 on 240Hz) | Keeps G-Sync active; below GPU max. |
| **Process priority** | **High** (not Realtime) | Calypto's `FortniteProcessPriority` repo permanently sets this — [github.com/Calypto/FortniteProcessPriority](https://github.com/Calypto/FortniteProcessPriority) |

### Valorant
| Setting | Value | Why |
|---|---|---|
| **Power management mode** | **Prefer maximum performance** | Set on `VALORANT.exe` AND `vgc.exe` profiles. Vanguard service throttles GPU otherwise. |
| **Threaded optimization** | **Auto** | Engine handles it correctly. |
| **Low Latency Mode** | **Off** | Reflex shipped 2024 — leave to in-game. |
| **In-game** NVIDIA Reflex | **On + Boost** | Bigger GPU-bound delta (20-30ms) than Fortnite. |
| **In-game** Limit FPS Always | **Refresh - 3** | Keeps G-Sync active. |
| **Anti-cheat** | **NVPI is driver-side** | Vanguard doesn't flag profile writes. Verify per patch (r/VALORANT pinned). |

### Counter-Strike 2 (Source 2)
| Setting | Value | Why |
|---|---|---|
| **Frame Rate Limiter V3** | **Off** | Use in-game `fps_max` — Source 2 reads it natively. NVPI cap conflicts with engine cap. |
| **Low Latency Mode** | **Off** | Reflex integrated 2023. |
| **In-game** NVIDIA Reflex | **Enabled + Boost** | |
| **Launch options** | `-high -freq <hz> +fps_max 0` | `-high` boots CS2 at High priority. Per Noobs2Pro CS2 guide. |
| **Note** | `-noreflex` is for streamers only | Adds latency. Don't use unless your capture card breaks Reflex. |

### Apex Legends (Source engine, Reflex-integrated)
| Setting | Value | Why |
|---|---|---|
| **Low Latency Mode** | **Ultra** *(per-game profile only)* | Apex is the exception — Source's Reflex integration is partial. ImperialHal-tier configs run Ultra here. |
| **In-game** NVIDIA Reflex | **Enabled + Boost** | |
| **In-game** FPS Cap | `+fps_max_unlocked 189` or `+fps_max_unlocked 237` (240Hz) | Apex caps at 144 by default — unlock it. |

### Marvel Rivals / R6 Siege / Overwatch 2 / COD MW3
| Setting | Value |
|---|---|
| **Low Latency Mode** | Off |
| **Threaded optimization** | Auto |
| **In-game** Reflex | Enabled + Boost |

## Windows registry — Win32PrioritySeparation (do this once, applies system-wide)

This is the single most-cited registry tweak for lowering input lag on Windows. Default value: `2` (Windows desktop). Gaming-optimal values per BlurBusters / Make Tech Easier / XbitLabs / Synergy Library:

| Decimal | Hex | Foreground behavior | Trade-off | Best for |
|---|---|---|---|---|
| `2` | `0x02` | Default | Balanced multitasker | Stock Windows |
| `22` | `0x16` | Long, variable, max boost | Smoothest gameplay | Frame-pacing priority |
| **`26`** | `0x1A` | Short, variable, max boost | **Lowest latency that still preserves frame pacing** | **Recommended starting point** |
| `38` | `0x26` | Short, fixed, high foreground boost | Aggressive responsiveness | Competitive — tournament FPS |
| `40` | `0x28` | Short, fixed, no boost | Most aggressive foreground bias; can stutter on weak CPUs | Theoretical floor — measure before keeping |

**How to apply (1-line PowerShell, admin):**

```powershell
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl' -Name 'Win32PrioritySeparation' -Type DWord -Value 26
```

Then **reboot** — Windows reads this once at boot.

**Revert:**
```powershell
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl' -Name 'Win32PrioritySeparation' -Type DWord -Value 2
```

Try `26` first. If you have a 12+ core CPU with HT and the FPS feels great but inputs feel laggy under load, bump to `38`. `40` is for benchmarking — most users see microstutter and revert.

## Device-specific tips

| Hardware | Tip |
|---|---|
| **RTX 40-series / 50-series** | Enable **DLSS Frame Generation off** in competitive games — adds 8-15ms. Reflex still works. |
| **RTX 20/30-series** | NIS (NVIDIA Image Scaling) sharpens 1080p→1440p at 0 latency cost. Set in NVCP, not NVPI. |
| **GTX 16-series / 900-1000** | No Reflex hardware support on 700-series and older. Use NVPI **Low Latency Mode = Ultra** instead. |
| **G-Sync monitor + most games** | NVCP → G-Sync **On + V-Sync On in NVCP** + V-Sync **Off in-game** + cap FPS at refresh-3. Lowest-latency G-Sync stack (confirmed BlurBusters + NVIDIA). |
| **G-Sync monitor + competitive Fortnite at 240+ Hz** | **G-Sync OFF + V-Sync OFF everywhere + Reflex On+BOOST + uncapped or refresh-3 cap.** At stable FPS above refresh, pros prefer the marginal latency win over tear elimination — tearing is essentially invisible at 240/360 Hz. ([Blur Busters G-Sync 101](https://blurbusters.com/gsync/gsync101-input-lag-tests-and-settings/)) |
| **No G-Sync (regular 144/240Hz)** | V-Sync everywhere off. Cap FPS in-game to refresh-3 or use NVPI Frame Rate Limiter V3. |
| **1080p competitive** | Drop **Texture filtering quality** to High Performance for +2-4% on mid-tier GPUs. Imperceptible at 1080p. |
| **HDR monitor** | NVPI **Display - Color Settings** — leave on **Use the 3D application setting**. Forcing HDR via NVPI breaks calibration on some VA panels. |
| **Variable refresh laptop (G-Sync Compatible)** | Same G-Sync stack works. Plug into wall — battery throttling defeats Reflex Boost. |
| **Voicemeeter / virtual audio** | Disable **Background Application Max Frame Rate** *globally*, not just per game. Voicemeeter loop steals frames when minimized otherwise. |

## NVPI Revamped — newer fork (optional)

The original NVPI from Orbmu2k is on extended pause. The community-maintained fork has been the active version since 2024:

- **[github.com/xHybred/NvidiaProfileInspectorRevamped](https://github.com/xHybred/NvidiaProfileInspectorRevamped)** — v7.0.2.0 (April 2026). Adds DLSS 4.5 preset L/M, RTX 50 PhysX switch, better naming for undocumented flags, dark mode, search improvements.

Identical workflow — same `.exe`, same import path. Use Revamped if you want the latest DLSS preset toggles. Use Orbmu2k's if you want the most-cited canonical build.

## Verification

After applying, re-open NVPI on the same game profile and scroll through. Values should still be set. If anything reverted:
- Some flags need a **driver service restart** (Device Manager → disable/re-enable GPU) or **reboot**.
- Anti-cheat games (Vanguard/EAC) sometimes reset values on first launch — re-apply after the first match.

Want to measure the actual win? Use **LatencyMon** (free, [resplendence.com/latencymon](https://www.resplendence.com/latencymon)) before and after. End-to-end input-to-photon needs an LDAT or a camera at 1000fps — LatencyMon only catches kernel DPC latency.

## Anti-cheat note

NVPI writes to NVIDIA driver profile storage — **not** the game binary, **not** memory injection. Vanguard/EAC/BattlEye have never publicly flagged it. That said: absence of evidence isn't evidence of absence. Verify per patch on the game's pinned subreddit thread.

## Why we don't auto-apply this for you

Two reasons. One: NVPI's flags interact with driver versions — what works on 580 may regress on 600. We'd need to publish + test per-driver-version values. Two: bundling Orbmu2k's binary changes our license-compliance surface. Articleware is the honest path. When the v0.1.62+ updater pipeline matures we may bundle a curated per-driver settings JSON + an "Apply baseline" button. Until then, do it yourself — 10 minutes total.

## Citations

- **[github.com/Orbmu2k/nvidiaProfileInspector](https://github.com/Orbmu2k/nvidiaProfileInspector/releases)** — official NVPI. Only place to download. *(verified 200 OK May 2026)*
- **[github.com/xHybred/NvidiaProfileInspectorRevamped](https://github.com/xHybred/NvidiaProfileInspectorRevamped)** — active fork, v7.0.2.0 April 2026. *(verified 200 OK)*
- **[github.com/Calypto/FortniteProcessPriority](https://github.com/Calypto/FortniteProcessPriority)** — Calypto's only currently-published optimization repo (process priority utility, not NVPI presets). *(verified 200 OK)*
- **[github.com/BoringBoredom/PC-Optimization-Hub](https://github.com/BoringBoredom/PC-Optimization-Hub)** — aggregator of latency-optimization resources. *(verified)*
- **[pcgamingwiki.com/wiki/Nvidia_Profile_Inspector](https://www.pcgamingwiki.com/wiki/Nvidia_Profile_Inspector)** — canonical NVPI wiki page, import flow.
- **[forums.blurbusters.com — Win32PrioritySeparation thread](https://forums.blurbusters.com/viewtopic.php?t=8535)** — decimal value comparisons.
- **[forums.blurbusters.com — NVCP + NVPI input lag thread](https://forums.blurbusters.com/viewtopic.php?t=11791)** — Reflex vs Low Latency Mode interactions.
- **[nvidia.com — Reflex Apex/Valorant/Fortnite/CS2 article](https://www.nvidia.com/en-us/geforce/news/reflex-low-latency-apex-legends-valorant-fortnite-cs2/)** — NVIDIA's own per-game Reflex guidance.
- **[noobs2pro CS2 input-lag guide](https://noobs2pro.com/how-to-reduce-input-lag-in-counter-strike-2-cs2/)** — CS2 launch options + Win32PrioritySeparation = 40.
- **[xbitlabs.com — Win32PrioritySeparation explainer](https://www.xbitlabs.com/blog/win32priorityseparation-performance/)** — value bitfield breakdown.
- **~~github.com/Calyptotech/CalyptoNVPIPresets~~** — **DEAD (404)**. If you saw it linked elsewhere, the repo was removed. Use the inline values above.

**Note on Calypto's old latency guide:** Mirrors live on Scribd as "Calypto's Latency Guide" PDF. Most of its NVPI recommendations are captured above — the parts still relevant in 2026. The CPU-affinity-on-every-other-core advice from that guide is **outdated on modern Ryzen / Intel hybrid CPUs** — let Windows scheduler + Game Mode handle it.
