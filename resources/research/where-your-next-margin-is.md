# Where your next margin is — after the scan comes back clean

The most common wrong assumption with a tuning tool is: *"Once I've optimized everything in software, the only thing left is buying better hardware."* It isn't true, and believing it is how people waste the most money. There are two whole layers between "clean software" and "new hardware" — and one of them is bigger than any hardware upgrade you could buy.

Here's the honest order of remaining margins once Match Scan and the tweak catalog come back clean.

## Layer 1 — Software / config / thermals (what this app fixes)

This is the layer the app actually owns: registry/BCD tweaks, presets, XMP/EXPO, refresh rate, VBS, background contention, thermal throttling, mouse acceleration, audio. Match Scan's pre-game scan, live spot-check, and deep scans get this layer to its ceiling, and every fix is traced to a source.

Honest ceiling: **software closes roughly 70% of the gap between a stock budget rig and a $5,000 build. Hardware is the remaining ~30%** (Blur Busters' latency research and our own latency-budget guide land in the same place). So a clean software pass is most of the win — but it is *not* "everything except hardware."

## Layer 2 — Settings the app can only *advise* on (not auto-detect)

A clean scan does **not** mean these are right, because Windows can't read them:

- **In-game settings** — sensitivity, Reflex/anti-lag, FPS cap strategy, view/render distance, the audio mix. Reflex on/off lives inside the game engine; the OS can't see it. Match Scan can tell you you're *missing the prerequisites* (HAGS, refresh rate) but not whether you flipped the in-game toggle.
- **Peripheral firmware** — mouse lift-off distance, debounce, motion sync / ripple control / angle snapping, polling rate actually achieved, hall-effect rapid trigger. These live in the device, set in the vendor's software — invisible to any read-only scanner. (And "higher is better" is often wrong: 8000 Hz polling can *cost* FPS on a CPU-bound rig; motion sync *adds* latency.)
- **Monitor OSD** — overdrive/response-time, an "instant"/low-lag mode, backlight strobing. Vendor-private, not readable over the cable. Set overdrive to your panel's tested tier (RTINGS / the Blur Busters UFO test) and turn off eco/dynamic modes.

This layer has real frames in it, and the only honest thing a tool can do is hand you the checklist. That's why our guides exist.

## Layer 3 — You (the biggest remaining margin, by a mile)

After the rig is clean and the settings are dialled, the largest lever left for ~99% of players is **mechanics and decision-making**: aim consistency, crosshair placement, game sense, positioning, a real warmup routine, VOD review — plus the boring stuff that actually moves it (sleep, a consistent setup, ergonomics so your aim doesn't drift over a long session). A perfectly tuned rig at its ceiling still loses to better fundamentals. No amount of hardware closes this gap; it dwarfs the hardware margin for everyone who isn't already a top-tier pro. (See the Grind layer guide.)

## Layer 4 — Hardware (last, most expensive, and bounded)

Hardware is the *final* lever, not the next one — and it only helps when you're **measurably bottlenecked**. The trap: people buy a new GPU to fix stutter that was actually a 60 Hz cable, an untrained EXPO profile, or a thermally-throttling CPU — all things the scan catches for free.

Before you spend a cent, find out what's actually limiting you:

- **CPU-bound** (the common case for competitive shooters at 1080p low settings — Fortnite, Valorant, CS2 are CPU-heavy): a new GPU does **nothing** for your FPS. The levers are a faster CPU, better cooling, and tighter RAM. Match Scan's session recorder (with PresentMon) reports your CPU-vs-GPU-bound split so you don't guess.
- **GPU-bound** (higher resolutions / higher graphics settings): then, and only then, a faster GPU is the upgrade.
- **Thermals / RAM first**: a repaste, better airflow, an undervolt, or finally enabling EXPO often buys more than a part swap — on the rig you already own.

## The one-line version

Clean software is ~70% of the gap and the cheapest 70% you'll ever buy — but the order of what's left is **in-game/peripheral settings → your own mechanics → targeted hardware where you're proven-bottlenecked.** Hardware is last. The whole point of scanning first is to make sure you never upgrade hardware to fix something that was free to fix.
