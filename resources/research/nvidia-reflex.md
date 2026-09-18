# NVIDIA Reflex — does it add input delay?

**Not inherently. Reflex changes the render queue and can reduce latency when
the title and workload benefit from it; some configurations see little change
or a trade-off.** The real gotcha is that NVCP and in-game settings can fight
each other — see "common confusion" at the bottom.

> **Driver note:** Driver versions, NVIDIA App behavior, and Fortnite support
> are volatile. Use the app's live driver card and NVIDIA's official driver
> page after every driver or major Fortnite update; this guide does not freeze
> a version number or promise that an optional control-panel setting is still
> present. ([NVIDIA drivers](https://www.nvidia.com/en-us/geforce/drivers/))

## What it actually does

- **Reflex Low Latency mode** pulls the CPU's render-queue submission timing forward so the GPU is never idle waiting for the next frame *and* the render queue never balloons. Result: lower end-to-end input-to-photon latency.
- **Reflex Boost** changes GPU power-state behavior in supported workloads. It
  can trade extra power and heat for responsiveness; keep it only if a
  repeatable capture on the target rig improves the result.
- **Reflex Latency Marker** (the on-screen overlay) just measures; it's not part of the latency reduction.

## Reflex 2 / Frame Warp

Availability and supported titles are changing. Treat Frame Warp as an
official-title-and-driver feature, not a universal setting: enable it only
when NVIDIA and the game's current documentation list the exact GPU, driver,
and title combination. Everything else in this guide refers to the ordinary
in-game Reflex controls. ([NVIDIA Reflex](https://www.nvidia.com/en-us/geforce/technologies/reflex/))

## What can be verified

The direction and size of the change depend on GPU load, frame cap, driver,
game integration, and display path. Use an in-game latency indicator or a
hardware measurement tool with the same repeatable scene; do not publish a
fixed millisecond gain from the switch alone.

## Per-game settings

| Game | In-game setting | Notes |
|---|---|---|
| **Fortnite** | `NVIDIA Reflex Low Latency = On + Boost` | A reasonable test baseline on supported GeForce systems. Measure the current Fortnite build; do not assume a fixed gain or copy a creator's result. |
| Valorant | `NVIDIA Reflex Low Latency = On + Boost` | GPU-bound at competitive settings — bigger delta. |
| Apex Legends | `NVIDIA Reflex Low Latency = On + Boost` | Engine-integrated since 2021. |
| CS2 | `NVIDIA Reflex Low Latency = Enabled + Boost` | Source 2 integration shipped 2023. |
| Overwatch 2 | `NVIDIA Reflex = Enabled + Boost` | Native. |
| COD MW3 / Warzone | `NVIDIA Reflex Low Latency = Enabled + Boost` | Native. |
| Marvel Rivals · R6 Siege | `NVIDIA Reflex = On + Boost` | Native. |

Reflex requires a supported GeForce system and a game that integrates the SDK.
AMD users should use the current official Anti-Lag feature supported by their
driver and title; do not enable obsolete or anti-cheat-risk variants.

## NVCP settings — they can fight in-game Reflex

This is the kernel of truth behind "Reflex doesn't work in-game, you have to set it elsewhere":

- **NVIDIA Control Panel → Manage 3D settings → Low Latency Mode**: set to **On** or **Off** for any title that has in-game Reflex. **Do NOT set it to "Ultra"** — Ultra fights the in-game Reflex implementation and can produce neutral or worse results.
- **NVCP → Power management mode**: compare the default and per-game options;
  `Prefer maximum performance` trades power and heat for fewer clock-state
  transitions and is not automatically better.
- **NVCP → Vertical sync**: `Off` (in-game vsync also off — vsync re-introduces queue latency Reflex spent ms removing).

In-game Reflex is the canonical path and works correctly when NVCP isn't actively undermining it.

## Common confusion sources

- **"Reflex adds latency" pre-render myth**: came from `Maximum Pre-Rendered Frames` in old NVCP. That setting (now `Low Latency Mode`) at value 1 vs OFF can hurt frame pacing on CPU-bound titles. Reflex's in-game integration sidesteps this entirely.
- **"Boost makes it worse" myth**: Boost only affects GPU clocks during GPU-bound segments. Power draw goes up; latency goes down. No frame-pacing penalty.
- **"It doesn't work in Fortnite because Fortnite is CPU-bound"**: CPU-bound
  and capped workloads can leave less queue to remove. Test the current build
  instead of assuming a positive or negative result.

## Citations

- NVIDIA Reflex SDK whitepaper (developer.nvidia.com/reflex)
- Battle(non)sense YouTube series on input-lag measurement
- Hardware Unboxed Reflex deep-dive (Aug 2021)
- Codelife — Peterbot UPDATED Settings 2026 (March 2026)
