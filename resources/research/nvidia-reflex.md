# NVIDIA Reflex — does it add input delay?

**No. Reflex *reduces* input delay.** Common myth driven by old Pre-Render Limit confusion. The real gotcha is that **NVCP and in-game settings can fight each other** — see "common confusion" at the bottom.

## What it actually does

- **Reflex Low Latency mode** pulls the CPU's render-queue submission timing forward so the GPU is never idle waiting for the next frame *and* the render queue never balloons. Result: lower end-to-end input-to-photon latency.
- **Reflex Boost** forces the GPU clock to stay at max (no power-saving idle) when the title is GPU-bound, shaving an additional 1-3 ms.
- **Reflex Latency Marker** (the on-screen overlay) just measures; it's not part of the latency reduction.

## Verified gains (NVIDIA + Battle(non)sense + Hardware Unboxed, RTX 30/40-series)

- **GPU-bound** (high settings, 1440p+): **20-30 ms reduction** vs OFF.
- **CPU-bound** (low settings, 1080p): **5-10 ms reduction**.
- **At hard frame caps below GPU's max:** 0-5 ms (already low; smaller delta).

## Per-game settings

| Game | In-game setting | Notes |
|---|---|---|
| **Fortnite** | `NVIDIA Reflex Low Latency = On + Boost` | CPU-bound title — expect 5-10 ms gain, not 20-30 ms. Smaller but still positive. Peterbot, Bugha, Clix all run On + Boost per public configs. |
| Valorant | `NVIDIA Reflex Low Latency = On + Boost` | GPU-bound at competitive settings — bigger delta. |
| Apex Legends | `NVIDIA Reflex Low Latency = On + Boost` | Engine-integrated since 2021. |
| CS2 | `NVIDIA Reflex Low Latency = Enabled + Boost` | Source 2 integration shipped 2023. |
| Overwatch 2 | `NVIDIA Reflex = Enabled + Boost` | Native. |
| COD MW3 / Warzone | `NVIDIA Reflex Low Latency = Enabled + Boost` | Native. |
| Marvel Rivals · R6 Siege | `NVIDIA Reflex = On + Boost` | Native. |

Reflex requires a GeForce 900-series or newer + a game that integrates the SDK. AMD has Anti-Lag+ as a partial parallel.

## NVCP settings — they can fight in-game Reflex

This is the kernel of truth behind "Reflex doesn't work in-game, you have to set it elsewhere":

- **NVIDIA Control Panel → Manage 3D settings → Low Latency Mode**: set to **On** or **Off** for any title that has in-game Reflex. **Do NOT set it to "Ultra"** — Ultra fights the in-game Reflex implementation and can produce neutral or worse results.
- **NVCP → Power management mode**: `Prefer maximum performance` (so the GPU doesn't downclock independently of Reflex Boost).
- **NVCP → Vertical sync**: `Off` (in-game vsync also off — vsync re-introduces queue latency Reflex spent ms removing).

In-game Reflex is the canonical path and works correctly when NVCP isn't actively undermining it.

## Common confusion sources

- **"Reflex adds latency" pre-render myth**: came from `Maximum Pre-Rendered Frames` in old NVCP. That setting (now `Low Latency Mode`) at value 1 vs OFF can hurt frame pacing on CPU-bound titles. Reflex's in-game integration sidesteps this entirely.
- **"Boost makes it worse" myth**: Boost only affects GPU clocks during GPU-bound segments. Power draw goes up; latency goes down. No frame-pacing penalty.
- **"It doesn't work in Fortnite because Fortnite is CPU-bound"**: it works, the delta is just smaller (5-10 ms vs 20-30 ms in GPU-bound titles). Still worth turning on — there's no scenario where it hurts a properly-configured rig.

## Citations

- NVIDIA Reflex SDK whitepaper (developer.nvidia.com/reflex)
- Battle(non)sense YouTube series on input-lag measurement
- Hardware Unboxed Reflex deep-dive (Aug 2021)
- Codelife — Peterbot UPDATED Settings 2026 (March 2026)
