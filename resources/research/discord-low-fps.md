# Discord — low-FPS while gaming

Discord ships with three settings that consume GPU + CPU during a game and have measurable FPS impact. None of them are toggleable via registry or file (Discord stores prefs in IndexedDB, which is binary leveldb format we can't safely write to). **All four toggles below are manual.**

## The fixes (in priority order)

### 1. Hardware Acceleration off

`User Settings → Voice & Video → Advanced → H.264 Hardware Acceleration` — toggle off.

`User Settings → App Settings → Advanced → Hardware Acceleration` — toggle off.

Both default to ON. The video-call one is the bigger CPU drain even when you're not in a call (it pre-warms the encoder). Restart Discord after toggling.

### 2. In-game overlay off

`User Settings → Game Overlay → Enable in-game overlay` — toggle off.

The overlay injects into the game's render thread. Even if you never open the overlay window, the injection adds a per-frame DLL hop. Pros run with this off and use Discord on a phone or alt-tab to type.

### 3. Streamer Mode off (unless actively streaming)

`User Settings → Streamer Mode → Enable Streamer Mode` — toggle off.

Streamer Mode adds extra hooks to obscure DMs and hide names — useful when streaming, costly when not.

### 4. Reduce Motion (optional, free win)

`User Settings → Accessibility → Reduce Motion` — toggle on.

Kills the slide / fade animations that compose during channel switches. Doesn't help mid-game but reduces idle GPU when you alt-tab to Discord.

## Why we can't automate this

Discord stores preferences in `%APPDATA%\discord\Local Storage\leveldb\` — Google's leveldb binary format. Writing raw bytes there is fragile (the file is a database, not a config). The Discord client also actively rewrites the file on most app starts. A FileWrite catalog entry would either silently miss or corrupt your preferences.

## Verifying the impact

Run our DPC measurement card with Discord closed → save baseline. Open Discord with all four toggles ON → re-measure. Apply the four fixes. Restart Discord. Re-measure.

Typical wins on a mid-tier gaming rig: **5-15% lower DPC time at idle**, **2-8 fps recovered** in CPU-bound games.

## Related catalog tweaks

- `process.discord.autostart-disable` — kills the auto-launch at login (separate concern; doesn't address the hardware-accel-while-running cost)
