# Valorant — in-game pro settings (cited)

**Why this is guide-only, not a tweak:** Vanguard (Valorant's kernel-mode anti-cheat) actively scans the game's config directory and resets unauthorized writes. Shipping a FileWrite tweak would either no-op silently or risk a false-positive ban. This article is the next-best path — what to flip yourself, in-game, sourced from the publicly-published configs of TenZ, yay, Demon1, and aspas.

## Display tab

- **Display Mode: Fullscreen.** Valorant supports true exclusive fullscreen (unlike Fortnite Ch5+) — keep it on. Lowest input lag of the available modes.
- **Resolution: native (1920×1080 for almost every pro).** Stretched res (1280×960 → 1920×1080) is a holdover from CS culture; modern pros are ~70/30 native vs stretched. If you don't already prefer stretched, default to native.
- **Aspect Ratio Method: Letterbox** if you do go stretched (4:3 with bars instead of squashed pixels).
- **Frame Rate Limit Mode: Custom**, **Frame Rate Limit: at least 2× your monitor refresh rate (e.g. 480 fps on a 240 Hz monitor).** Counterintuitive but documented: Valorant's input pipeline benefits from headroom even when the display can't show the extra frames. TenZ + yay both run uncapped or 4× refresh.

## Graphics Quality tab

| Setting | Pro consensus | Why |
|---|---|---|
| Material Quality | **Low** | No competitive read advantage; costs frames |
| Texture Quality | **Low** | Same |
| Detail Quality | **Low** | Reduces foliage / debris density — easier to pick out enemy outlines |
| UI Quality | **Low** | Free frames, no visual penalty |
| Vignette | **Off** | Adds a faint dark edge that hides peripheral movement |
| VSync | **Off** | Always |
| Anti-Aliasing | **MSAA 2x** OR **None** | Pros split. yay runs MSAA 2x for outline clarity; TenZ runs none for raw fps |
| Anisotropic Filtering | **1x** | No competitive read; costs frames |
| Improve Clarity | **Off** | Adds a sharpening pass = halos around enemy edges that look like outlines but aren't. Confuses target-acquisition |
| Bloom | **Off** | Blooms ability VFX into white-out splashes that hide enemies |
| Distortion | **Off** | Heat-haze effects on Brimstone smokes / Brim ult / etc. obscure enemy positions |
| Cast Shadows | **Off** | Enemy shadows give them away → opponent advantage too. Net even. Most pros: off. |
| First Person Shadows | **Off** | Yours never matter to you |

## Stats tab — turn ALL of these ON

- Show Computer Stats: **Show Only Client FPS** at minimum. You need to see the cap holding.
- Network Round Trip Time: **On**. Spike awareness mid-game.
- Network Round Trip Time Graph: **On** if you want to debug; off if it's distracting.
- Packet Loss: **On**. Single biggest "why did that peek lose" cause.

## Audio tab

- **Music Volume: 0.** Always.
- **Comms / Voice Receiver Volume: tuned to your team** — but never higher than ambient/footstep audio.
- **HRTF: On.** Critical. Provides directional audio cues from above/below — essential for vertical-map utility (Bind, Ascent, Pearl). Default Off.
- **Voice Chat Notification Sounds: Off.** They mask gunshot directionality.

## Crosshair / Settings.ini

- **Crosshair Outlines: thin or off.** Per-pro preference. yay = no outline; TenZ = thin.
- **Center Dot: off** (most pros — adds visual noise on long flicks). On for some controller-style players.
- **Color: cyan or yellow.** Avoid red (blends with enemy outlines, blood splatters). Pro split: cyan #00FFFF or yellow #FFFF00.

## What this guide *won't* tell you to do

- **DPI / sens.** Personal — see /grind for cited rig snapshots from Valorant pros (when added). eDPI band ~280-320 is the converged-mechanics standard. Same caveat as Fortnite: copying numbers doesn't substitute for muscle memory at any value.
- **Auto-flash any of this.** Vanguard flags config-dir writes. If you want this stuff to persist, change it in-game and let Riot's signed config-writer handle it.

## Tournament compliance (VAC / FACEIT / VCT)

These are all in-game settings — Vanguard, FACEIT AC, and VCT pre-match config audits all permit any value the game itself allows you to set. Nothing here is bannable. The only territory we deliberately skip (for everyone, not just Valorant): kernel-mode driver injection, BIOS auto-flash, and any "pro CFG" that ships executable code rather than data.

## Cited sources

- [TenZ ProSettings.net](https://prosettings.net/players/tenz/) — May 2026
- [yay ProSettings.net](https://prosettings.net/players/yay/)
- [Demon1 ProSettings.net](https://prosettings.net/players/demon1/)
- [aspas ProSettings.net](https://prosettings.net/players/aspas/)
- The catalog ships no Valorant tweaks deliberately (Vanguard interference). This guide is the path.
