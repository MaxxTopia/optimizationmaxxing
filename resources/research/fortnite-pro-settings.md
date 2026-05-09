# Fortnite — in-game pro settings (cited)

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
