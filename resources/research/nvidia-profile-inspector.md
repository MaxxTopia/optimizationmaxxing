# NVIDIA Profile Inspector — exact settings, no broken .nip files

NVIDIA Control Panel exposes maybe 15% of the actual driver knobs. The rest live behind undocumented profile flags only reachable via **NVIDIA Profile Inspector** (NVPI). The old "download Calypto's .nip" workflow is dead — that GitHub repo (`Calyptotech/CalyptoNVPIPresets`) returns 404 and Calypto's profile (`github.com/Calypto`) currently has no NVPI preset repo. So this guide skips the import dance entirely. Set the values yourself — same result, no broken links.

Requires a GeForce 900-series or newer (Reflex hardware floor). 1000/2000/3000/4000/5000 all work.

> **2026 orientation:** Use NVIDIA's current official driver channel and verify the installed driver before importing a profile. Driver branches and the NVIDIA App/Control Panel split change over time, so this guide deliberately avoids embedding a driver number. NVPI writes driver profile data outside the game; it is still an external, version-sensitive tool and is not a tournament or anti-cheat approval.

> **Fortnite update check:** Season and engine updates can change rendering behavior. Re-test the in-game render mode, Reflex, frame cap, and VSync/VRR stack after a major game or driver update instead of treating this profile as permanent.

## TL;DR — 60-second setup

1. Download NVPI: **[github.com/Orbmu2k/nvidiaProfileInspector/releases](https://github.com/Orbmu2k/nvidiaProfileInspector/releases)** — grab the latest `nvidiaProfileInspector.zip`, extract, run the `.exe`. No install. Check the release date and driver compatibility before importing.
2. **Pick your shortcut:**
   - **Want the import-and-go path?** Grab one of our pre-built `.nip` profiles below → NVPI → **File → Import Profile(s)** → select the file → **Apply changes** (top-right green checkmark). Done.
   - **Want full transparency?** Use the global-baseline + per-game tables further down. Type the values into NVPI yourself.
3. Restart the game. Settings stick across driver updates.

## One-click `.nip` profiles (new in v0.1.83)

We hand-crafted these against [Orbmu2k's `NvApiDriverSettings.h`](https://github.com/Orbmu2k/nvidiaProfileInspector/blob/master/nvidiaProfileInspector/Native/NVAPI/NvApiDriverSettings.h) so every setting ID + value is verified, not guessed. Each profile binds to the game's `.exe` so NVPI auto-applies on launch.

| Game | Download | What's included |
|---|---|---|
| **Fortnite — competitive baseline** | [fortnite-pinnacle.nip](/nvpi-profiles/fortnite-pinnacle.nip) | 4 conservative settings: Power Mgmt = Prefer Max, Texture filtering High Performance, VSync force off, Max Pre-Rendered Frames = defer to the 3D app so in-game Reflex owns the queue |
| **Fortnite — clean render lab** | [fortnite-clean-render.nip](/nvpi-profiles/fortnite-clean-render.nip) | 7-setting experiment: the baseline plus Negative LOD clamp, FXAA off, and MFAA off. It does **not** remove foliage/clouds/terrain or alter visibility. Keep only if the same-scene test improves frametime without harming clarity. |
| **Valorant** | [valorant.nip](/nvpi-profiles/valorant.nip) | 6 settings: Power Mgmt Prefer Max, VSync off, Texture filtering High Perf, Negative LOD Clamp, FXAA off, Pre-rendered frames = 1. Threaded Optimization left at AUTO (Vanguard-cautious). Binds to `VALORANT-Win64-Shipping.exe` + `vgc.exe`. |
| **Counter-Strike 2** | [cs2.nip](/nvpi-profiles/cs2.nip) | Same 6-setting baseline as Valorant. Binds to `cs2.exe`. |
| **Apex Legends** | [apex-legends.nip](/nvpi-profiles/apex-legends.nip) | Same 6-setting baseline. Binds to `r5apex.exe` + `r5apex_dx12.exe`. |

The Fortnite profiles deliberately do **not** force Threaded Optimization, a fixed render queue, undocumented texture flags, foliage/cloud/terrain removals, or visibility changes. Those values can change meaning across driver versions, fight Fortnite's native Reflex path, or cross an anti-cheat/tournament boundary. The shipped baseline keeps the high-confidence clock, texture, sync, and queue ownership settings visible; the clean-render file is a separate, reversible experiment rather than an automatic recommendation.

### RMInstLoc: a real NVIDIA knob, not a proven latency switch

You may see guides claim that adding `RMInstLoc` or `RMInstLoc2` as a 32-bit DWORD in the NVIDIA display-class registry key “puts the GPU in the fastest location.” That claim is not established. Public NVIDIA open-driver headers describe `RMInstLoc` as a resource-manager placement bitfield with encodings for default, coherent system memory, non-coherent system memory, and video memory—not as a general input-latency toggle. Community VRAM research also warns that broad masks can be dangerous and reports no general latency win from copying the setting.

optimizationmaxxing therefore does **not** write `RMInstLoc`, `RMInstLoc2`, or broad `RMInstLoc*` masks automatically. If an engineer wants to test it in a lab, capture the exact display-class key and driver version, export a rollback copy, change one value, reboot, and compare GPU telemetry, DPC/ISR traces, frametime, and stability. A registry value existing after reboot is not evidence that the driver accepted it or that Fortnite improved.

- [NVIDIA open-driver `RMInstLoc` definitions](https://fossies.org/diffs/NVIDIA-open-gpu-kernel-modules/610.57.04_vs_615.71.09/src/nvidia/interface/nvrm_registry.h-diff.html)
- [Community VRAM research and risk notes](https://github.com/lmganon16/nvidia-vram-research/blob/main/AGENTS.md)
- [NVIDIA registry inventory](https://github.com/nohuto/regkit/blob/main/records/NVIDIA-DispGUID.txt)

**To import:** NVPI → File → Import Profile(s) → select the `.nip` → Apply changes. Verify by opening the game's profile in NVPI again — the values should reflect what's in the table.

### How to verify the .nip actually changed your driver settings

NVPI's "import successful" message only confirms the XML parsed. The green Apply button is what writes to the driver profile DB. To confirm the changes stuck:

1. **In NVPI, immediately after Apply** — keep the same game profile selected in the top dropdown. Scroll the settings list. Each of the four imported settings should now show its new value: **Power management mode** = `Prefer maximum performance`, **Texture filtering - Quality** = `High performance`, **Vertical Sync** = `Force off`, and **Maximum pre-rendered frames** = the 3D-app default.
2. **Close NVPI, re-open it, switch back to the game profile.** Values should still be there. If they revert, the Apply step didn't commit — try again as admin.
3. **Reboot, re-open NVPI** — values must persist. The driver profile DB is on disk, so a reboot is the strongest "did it actually save" test.
4. **In-game test (Fortnite specifically):** launch the same Creative or replay scenario before and after the import. Compare frametime consistency, 1% lows, and input feel with Reflex and the frame cap held constant. Do not treat a single match or a promised FPS number as proof.
5. **Driver version sanity** — if you update GeForce drivers after this, re-verify in NVPI. Some setting IDs get re-mapped across driver versions and the imported value may not survive.

## Conservative profile baseline to evaluate (not a universal recipe)

| NVPI section | Setting | Set to | Why |
|---|---|---|---|
| **Common** | Power management mode | **Prefer maximum performance** | Can reduce clock-transition variability on some systems; compare power, heat, and frame pacing. |
| **Sync and Refresh** | Vertical Sync | **Test Off and On with VRR** | Queue and tear behavior depends on the display path; there is no fixed frame penalty. |
| **Sync and Refresh** | Vertical Sync Tear Control | **Standard** | Only matters if you re-enable VSync; harmless otherwise. |
| **Sync and Refresh** | Frame Rate Limiter V3 | **Prefer the in-game cap when available** | Avoid two competing limiters; compare the game's cap, driver cap, and uncapped behavior with the same scene. |
| **Common** | Low Latency Mode | **On** (no Reflex) / **Off** (Reflex game) | Reflex replaces this — see per-game table. Never **Ultra** on a Reflex game (fights Reflex). |
| **Texture Filtering** | Texture filtering - Quality | **Application-controlled or High performance for an explicit test** | Visual quality and frame-time effects vary by GPU, resolution, and title; no fixed FPS gain is promised. |
| **Texture Filtering** | Texture filtering - Negative LOD bias | **Clamp** | Stops shimmer artifacts; required when AF is forced. |
| **Texture Filtering** | Texture filtering - LOD bias (DX) | **0.0000** | Default. Negative values are for ssaa edge sharpening — not competitive. |
| **Texture Filtering** | Anisotropic filtering setting | **Application-controlled** | Override only if game doesn't expose AF. |
| **Texture Filtering** | Anisotropic sample optimization | **Application-controlled or explicit test** | Driver shortcuts can change texture quality; compare the actual game scene. |
| **Texture Filtering** | Trilinear optimization | **Application-controlled or explicit test** | Driver shortcuts can change texture quality; compare the actual game scene. |
| **Antialiasing** | Antialiasing - FXAA | **Off** | Use the game's AA — driver-level FXAA blurs UI. |
| **Antialiasing** | Antialiasing - Transparency Multisampling | **Off** | Costs FPS; competitive titles don't need it. |
| **Antialiasing** | Antialiasing - Transparency Supersampling | **Off** | Same. |
| **Common** | Shader Cache Size | **Driver default or a measured larger limit** | A larger cache can reduce repeat shader compilation, but it consumes disk and does not replace a clean shader-cache rebuild after driver changes. |
| **Common** | Threaded optimization | **Auto** | Leave engine threading to Fortnite and the current driver; this profile does not force a driver-side override. |
| **Other** | Background Application Max Frame Rate | **Driver default unless a specific workflow needs otherwise** | Background rendering is a power/heat tradeoff and is not an input-latency control for the foreground game. |

The top-right **Apply changes** button is the green checkmark — `Ctrl+S` works too. PCGamingWiki confirms the import path is **File → Import Profile(s)** if you do later pick up a community `.nip`.

## Per-game overrides

### Fortnite (UE5; validate the current build)
| Setting | Value | Why |
|---|---|---|
| **Threaded optimization** | **Auto** | Leave engine threading to Fortnite and the current driver; re-test after driver or season updates. |
| **Low Latency Mode** | **Off** | In-game Reflex is canonical. Ultra fights Reflex. Off in NVPI = leave it to in-game. |
| **In-game** Reflex Low Latency | **Compare the modes the current build exposes** | Reflex is an in-game integration; use the mode that reduces the measured render queue without worsening stability. |
| **In-game** Frame Rate Limit | **Choose from a controlled cap/VRR matrix** | Refresh-minus-three is only a starting experiment; stable frame pacing and tear tolerance decide the result. |
| **Process priority** | **Normal/default first** | Manual priority changes can starve services or worsen frametimes; use only as an explicit, reversible test. |

**Visual-minimum boundary:** If the goal is the cleanest supported Fortnite image, use the game's Performance rendering mode, low effects/meshes, and the current official competitive settings guide. NVPI cannot safely turn off every foliage or cloud pass, and this app will not ship terrain/through-wall/visibility flags or game-memory edits. Those are not latency optimizations and can create an unfair-advantage or ban risk.

### Valorant
| Setting | Value | Why |
|---|---|---|
| **Power management mode** | **Prefer maximum performance** | Set on `VALORANT.exe` AND `vgc.exe` profiles. Vanguard service throttles GPU otherwise. |
| **Threaded optimization** | **Auto** | Engine handles it correctly. |
| **Low Latency Mode** | **Off** | Reflex shipped 2024 — leave to in-game. |
| **In-game** NVIDIA Reflex | **Compare the modes the current build exposes** | Do not reuse a fixed latency claim from another title or patch. |
| **In-game** Limit FPS Always | **Choose from a controlled cap/VRR matrix** | The correct cap depends on the display path and measured frametime. |
| **Anti-cheat** | **Check current official rules and behavior** | A driver-side profile is not a guarantee of anti-cheat or tournament eligibility. |

### Counter-Strike 2 (Source 2)
| Setting | Value | Why |
|---|---|---|
| **Frame Rate Limiter V3** | **Off** | Use in-game `fps_max` — Source 2 reads it natively. NVPI cap conflicts with engine cap. |
| **Low Latency Mode** | **Off** | Reflex integrated 2023. |
| **In-game** NVIDIA Reflex | **Enabled + Boost** | |
| **Launch options** | **Keep defaults unless a current game guide requires one** | `-high`, forced frequency, and uncapped values can change scheduling or frame pacing; validate them one at a time. |
| **Note** | **Check the current build's Reflex/capture behavior** | Do not assume `-noreflex` or another flag is universally better for players or streamers. |

### Apex Legends (Source engine, Reflex-integrated)
| Setting | Value | Why |
|---|---|---|
| **Low Latency Mode** | **Test driver default/Off against an explicit per-game setting** | Reflex and driver queue control can interact differently across builds; do not treat Ultra as an Apex default. |
| **In-game** NVIDIA Reflex | **Compare the modes the current build exposes** | |
| **In-game** FPS Cap | **Use the current in-game/launch setting only after checking patch notes** | Do not copy a fixed 189/237 cap across displays or builds. |

### Marvel Rivals / R6 Siege / Overwatch 2 / COD MW3
| Setting | Value |
|---|---|
| **Low Latency Mode** | Off |
| **Threaded optimization** | Auto |
| **In-game** Reflex | Enabled + Boost |

## Windows scheduler policy — measure, do not cargo-cult

`Win32PrioritySeparation` is a system-wide scheduler policy, not a universal
input-latency switch. The decimal values commonly copied from tuning guides
change foreground/background quantum behavior, but the result depends on the
Windows build, CPU topology, game, driver, and background load. The app keeps
this lane reversible and experimental; it does not call `26`, `38`, or `40` a
best value.

Before changing it, capture a baseline frametime trace, DPC/ISR sample, and
repeatable input test. Change one value, reboot, repeat the same test, and
keep it only if both frame pacing and control improve. Restore the captured
prior value if desktop responsiveness, voice, or stability worsens. Do not
use this setting as a tournament default without checking the current rules.

## Device-specific tips

| Hardware | Tip |
|---|---|
| **RTX 40-series / 50-series** | Disable frame generation when testing competitive latency if the title offers it | Generated frames can change queue behavior; measure the current title instead of using a fixed millisecond penalty. |
| **RTX 20/30-series** | Treat scaling/sharpening as an image-quality and workload test | There is no zero-cost guarantee; verify frametime and clarity at the target resolution. |
| **Older GPUs** | Use only settings the current driver and title document | Do not assume a driver Low Latency Mode setting substitutes for a missing in-game integration. |
| **VRR monitor** | Compare VRR/VSync/cap combinations at the same scene | “Refresh minus three” is a test point, not a universal lowest-latency stack. |
| **High-refresh competitive display** | Compare tear-free and tear-accepted paths with the same cap | Keep the mode that measures best and is acceptable to the player; public pro settings are not proof. |
| **1080p competitive** | Test texture-quality presets against the game's frametime and visibility | Driver texture shortcuts have title- and GPU-dependent effects; no fixed FPS gain is promised. |
| **HDR monitor** | NVPI **Display - Color Settings** — leave on **Use the 3D application setting**. Forcing HDR via NVPI breaks calibration on some VA panels. |
| **Variable refresh laptop (G-Sync Compatible)** | Test plugged-in and battery behavior separately | Power policy and panel behavior can change clocks, refresh, and frame pacing. |
| **Voicemeeter / virtual audio** | Disable **Background Application Max Frame Rate** *globally*, not just per game. Voicemeeter loop steals frames when minimized otherwise. |

## NVPI Revamped — newer fork (optional)

The original NVPI from Orbmu2k is on extended pause. The community-maintained fork has been the active version since 2024:

- **[github.com/xHybred/NvidiaProfileInspectorRevamped](https://github.com/xHybred/NvidiaProfileInspectorRevamped)** — active fork. Check its current release notes and driver compatibility before using it; fork version and exposed flags are not a universal performance recommendation. ([Nexus Mods](https://www.nexusmods.com/site/mods/1287))

Identical workflow — same `.exe`, same import path. Use Revamped if you want the latest DLSS preset toggles. Use Orbmu2k's if you want the most-cited canonical build.

## Verification

After applying, re-open NVPI on the same game profile and scroll through. Values should still be set. If anything reverted:
- Some flags need a **driver service restart** (Device Manager → disable/re-enable GPU) or **reboot**.
- Anti-cheat games (Vanguard/EAC) may reset or ignore profile values after a driver or game update. Re-check the profile and rerun the same controlled test; never auto-reapply blindly.

Want to measure the actual win? Use **LatencyMon** (free, [resplendence.com/latencymon](https://www.resplendence.com/latencymon)) before and after. End-to-end input-to-photon needs an LDAT or a camera at 1000fps — LatencyMon only catches kernel DPC latency.

## Anti-cheat note

NVPI writes to NVIDIA driver profile storage — **not** the game binary or game
memory. That narrows the mechanism, but it is not a guarantee of anti-cheat or
tournament acceptance. Check the current organizer and anti-cheat guidance and
test the exact game build after any profile or driver change.

## Shortcut: let the catalog generate the Fortnite profile for you

The Tweaks page has **"Fortnite: generate NVIDIA Profile Inspector profile (.nip)"** (NVIDIA-only). Applying it writes a profile artifact to `%LOCALAPPDATA%\optmaxxing\nvpi\Fortnite.nip` and opens the folder. Treat the four values as a starting profile, import them yourself, then re-open NVPI and run the controlled in-game test; a generated artifact is not proof that the driver accepted or improved the settings. The downloadable clean-render lab profile is intentionally separate so a user can compare it without replacing the measured baseline. Then either import the `.nip` in NVPI or run it headless (elevated):

```
nvidiaProfileInspector.exe -silentImport "%LOCALAPPDATA%\optmaxxing\nvpi\Fortnite.nip"
```

## Why we still don't write to the driver database for you

We generate the profile but we **never touch the NVIDIA driver profile DB ourselves** — NVPI does the import. Two reasons. One: NVPI's flags interact with driver versions — what works on 580 may regress on 600, and a bad driver-DB write is a rabbit hole we won't drag your rig into. Two: bundling Orbmu2k's binary changes our license-compliance surface. Generating the file + handing you the one-click import is the honest middle ground: nothing we do can break your driver, and you stay in control of the actual apply. Do the import yourself — 10 seconds.

## Citations

- **[github.com/Orbmu2k/nvidiaProfileInspector](https://github.com/Orbmu2k/nvidiaProfileInspector/releases)** — official NVPI. Only place to download. *(verified 200 OK May 2026)*
- **[github.com/xHybred/NvidiaProfileInspectorRevamped](https://github.com/xHybred/NvidiaProfileInspectorRevamped)** — active fork; inspect its current release and driver-support notes before use. *(repository link verified)*
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
