# Fortnite — in-game pro settings (cited)

> **Settings keep getting reset after the catalog tweak?** Fortnite rewrites `GameUserSettings.ini` from its encrypted cloud profile on every launch. Fix: set the file read-only after the tweak applies. **PowerShell (one line):**
>
> ```
> attrib +R "$env:LOCALAPPDATA\FortniteGame\Saved\Config\WindowsClient\GameUserSettings.ini"
> ```
>
> Untick read-only (`attrib -R "<same path>"`) when you want to retune in-game; re-tick after. The "everything Low, View Distance Far" stack is captured in the Graphics table below — that's the spec you want stuck. Full read-only flow is at the bottom of this guide.

The catalog handles Engine.ini + GameUserSettings.ini. The remaining input-lag wins live inside Fortnite's own Settings menu — the values you have to flip yourself because they're stored in encrypted player profiles, not user-editable INI files. This is the consensus stack from Peterbot, Clix, Bugha, and Mongraal's published configs.

## Display tab

- **Window Mode: Fullscreen Windowed (Borderless).** Epic removed exclusive-fullscreen in Chapter 5; "Fullscreen" is now a relabel of borderless. Lowest input lag of the surviving options.
- **Resolution: native (1920×1080 for the vast majority of pros).** Higher resolutions on pro 240+Hz monitors cost frames the player can't see anyway. Some pros stretch (1440×1080) — purely for FOV preference, not perf.
- **Frame Rate Limit: match your monitor refresh.** 240 Hz monitor → 240 cap. Uncapped + VSync off creates frame-pacing drift; matching cap stabilizes 1% lows. The catalog's GameUserSettings.ini tweak sets this to 240 by default.
- **VSync: Off.** Always. Adds frames of input lag. The catalog enforces this in GameUserSettings.ini.
- **HDR: Off.** Adds composition latency in the Windows display pipeline. Every cited pro config has it disabled.

## Graphics tab — the consensus baseline

| Setting | Pro consensus | Why |
|---|---|---|
| Quality Presets | **Custom** (then individual values below) | Auto-presets touch settings you don't want touched |
| Rendering Mode | **Performance** (NOT Cinematic / Epic) | Performance mode bypasses the Cinematic renderer — major FPS gain on every rig, no visibility tradeoff |
| Anti-Aliasing | **Off** | Costs frames; sharper enemy outlines without it |
| 3D Resolution | **100%** | Lowering it scales everything; doesn't help past 100 |
| View Distance | **Far** (NOT Epic) | Epic adds detail beyond what matters at engagement range |
| Shadows | **Off** | Costs frames + reveals enemies' positions to opponents (their shadow gives them away too) |
| Textures | **Low** | Aim is on enemy outlines, not foliage detail |
| Effects | **Low** | Reduces explosion / build-particle clutter — easier to track shots through chaos |
| Post Processing | **Low** | Removes camera grain + bloom that hide enemy outlines |

## Latency tab

- **NVIDIA Reflex Low Latency: On + Boost** if you're on RTX 20-series or newer. Documented 5–30 ms reduction depending on CPU/GPU bottleneck. Game-side SDK feature — there is no Windows registry or driver flag we can flip for you, you have to enable it inside Fortnite.
- **AMD Anti-Lag** if Radeon — same idea, different vendor.

## Game tab — quality-of-life

- **Show FPS: On.** You need to see the cap holding, the 1% lows, and what happens when you change a setting. Without it, every "tweak" is faith.
- **First Person Camera (Locker / Lobby): off** unless you specifically want it. Some Chapter 5+ menus default this on; the lobby render burns CPU you'd rather have for the match.
- **Replay recording: off** during competitive sessions. Replay captures eat ~3-5% CPU. Turn back on if you're VOD-reviewing.

## Audio tab

- **Music Volume: 0.** Always. The footstep + reload audio is information; music is decoration.
- **Voice Chat Notification Sounds: off.** They mask gunshot directionality.
- **Visualize Sound Effects: ON.** Free directional indicators for footsteps + shots. Used by every cited pro.

## Cosmetics — what actually costs FPS

**Top pros don't run default skin.** Peterbot, Clix, Mongraal, Veno, Khanada all play with their preferred skin every match including FNCS finals. The "default skin = lowest delay" line is folklore — the delta on modern hardware is sub-1 FPS for typical skins, invisible past 144 FPS.

What *does* cost FPS is **heavy-VFX cosmetics**:

| Cosmetic type | Real FPS cost | Recommendation |
|---|---|---|
| **Skin — low-poly / no VFX** (Renegade Raider, basic Battle Pass skins, OG colorways) | ~0 FPS | Wear what looks good. |
| **Skin — heavy VFX / particle effects** (DJ Bop, holographic Marvel mythics, animated Icon skins) | -2 to -5 FPS in dense fights | Skip during FNCS / scrims. Save for pubs. |
| **Back bling — animated / pet** (anything with a pet animation, particle trail, glowing elements) | -1 to -3 FPS | Pick a static back bling or none. |
| **Back bling — static** (Battle Pass crystals, basic backpacks) | ~0 FPS | Free. |
| **Pickaxe — basic mesh** (default, Renegade Raider, common-rarity pickaxes) | ~0 FPS | Pick what looks good. |
| **Pickaxe — heavy VFX** (animated rotating pickaxes, particle-trail pickaxes) | -1 FPS during pickaxe-out moments | Pickaxe-out is the third-most-common visible weapon — picking a simple mesh adds up. |
| **Weapon wrap — solid color** (Reactive Slurp ON tier 1, Default, basic colors) | ~0 FPS | Free win. |
| **Weapon wrap — animated** (holographic / fire / Slurp tier 3+ / Refract) | -1 to -2 FPS during shotgun fights | The most-visible cosmetic. Solid wraps are the pro standard. |
| **Glider trail / contrail** | Negligible | Wear what you want. |

**The "zero-delay pickaxe" claim is a myth.** The pickaxe pull-out animation length + input registration frame is identical across every pickaxe in the game. The TikTok "0-delay pickaxe tier list" videos compare pickaxe-out FPS without accounting for the underlying scene render — the deltas are within FPS-counter noise.

**The real cosmetic rule**: avoid **animated wraps**, **heavy-VFX skins**, and **pet/particle back blings** during competitive sessions. Within that constraint, wear what feels right. Mongraal runs ICON Series Mongraal skin in FNCS. Pete runs his Falcons skin. The aesthetic-as-superstition tax is real — pros pick their drip.

## What this guide *won't* tell you to do

- **DPI / sens.** Personal — see the /grind page for cited rig snapshots from individual pros. eDPI band ~250–300 is where the converged-mechanics players sit, but copying numbers is a worse strategy than building muscle memory at any value.
- **Keybinds.** Same — see /grind. Wall+Stairs on M5/M4 is the default schoolbook; some pros remap.

## Make it stick

Fortnite rewrites GameUserSettings.ini on launch from the encrypted profile. To prevent it from undoing the catalog tweak:

1. Apply the catalog's `Fortnite: competitive GameUserSettings.ini` tweak.
2. Open `%LOCALAPPDATA%\FortniteGame\Saved\Config\WindowsClient\GameUserSettings.ini` in Explorer.
3. Right-click → Properties → check "Read-only".
4. Re-launch Fortnite. The locked file means the engine reads your values and uses them without overwriting.

Trade-off: as long as it's read-only, in-game Settings panel changes won't persist either. Untick when you want to retune in-game; re-tick when you're done.

## Cited sources

- [Peterbot ProSettings.net](https://prosettings.net/players/peterbot/) — May 2026
- [Clix ProSettings.net](https://prosettings.net/players/clix/)
- [Mongraal ProSettings.net](https://prosettings.net/players/mongraal/)
- [Bugha public Fortnite Masterclass settings](https://www.fortnitemasterclass.com/) — gameplay segments
- The catalog's `fortnite.engine-ini.optimize` + `fortnite.gus-ini.competitive` tweaks ship the file-side values matching this guide.
