# AMD Radeon — competitive low-latency setup (Adrenalin)

If you're on a Radeon GPU, most "NVIDIA tweak" guides don't map to your hardware. Here's the Radeon-specific stack that actually lowers latency for competitive play, plus the one feature you must NOT touch.

## Do NOT use Anti-Lag+ (it got people VAC-banned)

In October 2023, driver 23.10.1 shipped **Anti-Lag+**, which worked by detouring `engine.dll` inside the game. VAC flagged that as cheating and banned CS2 players within ~24 hours; it also caused false bans in Apex (EAC). AMD pulled it in 23.10.2 and the bans were later reversed. Anti-Lag+ is effectively dead. **Never force the old driver-level Anti-Lag+ in an anti-cheat game.** Its safe replacement is Anti-Lag 2 (below).

## Anti-Lag 2 — the Reflex equivalent (use it where supported)

- **Anti-Lag 2** is a developer-integrated SDK: the latency reduction is inserted *inside the game's logic*, just before your input is sampled. That makes it both more effective and anti-cheat-safe (it's not a driver hook).
- **Supported GPUs:** RDNA 1 and newer (RX 5000-series and up, plus Ryzen 6000-series APUs and newer).
- **It's per-game integrated, not a global driver toggle.** The supported list keeps growing — among competitive titles it now includes **Counter-Strike 2** (a launch title, built with Valve), **Dota 2**, **Apex Legends**, **THE FINALS**, **Marvel Rivals**, **NARAKA: BLADEPOINT**, **Deadlock**, **FragPunk**, and **Call of Duty: Black Ops 6 / Warzone**. It is still **not** natively in Valorant or Fortnite — for those, use the in-game latency/Reflex-style option if present and cap your FPS.
- Turn it on in the game's settings (or the per-game Adrenalin profile) where the option exists.

## Skip HYPR-RX for competitive — set things manually

HYPR-RX is the one-click button that turns on Anti-Lag + Radeon Boost + RSR (+ AFMF frame-gen on RDNA3+). For competitive aim, **don't** use it: Boost drops resolution while you're flicking (shimmer), RSR softens the image, and frame generation adds latency. Enable only the piece you want (Anti-Lag 2 in CS2) and leave the rest off.

## Turn these OFF for competitive

- **Radeon Chill** — dynamically lowers FPS when motion is low; adds input latency and FPS variance. Off.
- **Radeon Boost** — drops render resolution during fast camera movement, i.e. exactly when you're flicking. Off.
- **Enhanced Sync** — tear-mitigation that can stutter; prefer V-Sync OFF + an FPS cap. Off.
- **Frame generation (AFMF / AFMF 2)** — smoothness feature, adds latency. Off for competitive.

## Upscaling: native first, then in-game FSR over RSR

Run **native resolution** for competitive clarity. If you need headroom, prefer the game's built-in **FSR** (it has the depth/motion data, so it's cleaner) over driver-level **RSR** (whole-screen upscale, softer, a fallback). AMD's own guidance is FSR-when-available.

## Display + driver basics

- Keep the **latest Adrenalin** driver; if a release regresses your title, roll back one.
- Run the **standard VRR stack** for fluctuating FPS (FreeSync ON + V-Sync ON in the driver + an FPS cap a few below refresh), or — at 240 Hz+ with FPS consistently above refresh — **FreeSync/V-Sync OFF + accept tearing** for the lowest latency, the same logic competitive players use on G-Sync.

*Uncertain / verify on your rig: whether Anti-Lag 2 strictly requires HAGS (Hardware-Accelerated GPU Scheduling) is not clearly documented by AMD — HAGS is generally fine to leave on in Windows 11 either way. No Anti-Lag feature is RDNA4-exclusive; Anti-Lag 2 supports RDNA1+.*
