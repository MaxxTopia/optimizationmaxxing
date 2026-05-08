# NVIDIA Reflex — does it add input delay?

**No. Reflex *reduces* input delay.** Common myth driven by old Pre-Render Limit confusion.

## What it actually does
- Reflex Low Latency mode pulls the CPU's render-queue submission timing forward so the GPU is never idle waiting for the next frame *and* the render queue never balloons. Result: lower end-to-end input-to-photon latency.
- Reflex Boost forces the GPU clock to stay at max (no power-saving idle) when the title is GPU-bound, shaving an additional 1-3 ms.
- Reflex Latency Marker (the on-screen overlay) just measures; it's not part of the latency reduction.

## Verified gains (NVIDIA + Linus Tech Tips + Battle(non)sense benchmarks, RTX 30/40-series)
- GPU-bound (high settings, 1440p+): **20-30 ms reduction** vs OFF.
- CPU-bound (low settings, 1080p): **5-10 ms reduction**.
- At hard frame caps below GPU's max: **0-5 ms** (already low; smaller delta).

## Recommendation
- **ON + BOOST** in NVIDIA Control Panel for any title that supports it (Valorant, Fortnite, Overwatch 2, CS2 via Reflex+, Apex, COD, Marvel Rivals, Rainbow Six Siege).
- Reflex requires a GeForce 900-series or newer + a game that integrates the SDK. AMD has Anti-Lag+ as a partial parallel.

## Common confusion sources
- "Reflex adds latency" pre-render myth: came from `Maximum Pre-Rendered Frames` in old NVCP. That setting (now `Low Latency Mode`) at value 1 vs OFF can hurt frame pacing on CPU-bound titles. Reflex's in-game integration sidesteps this entirely.
- "Boost makes it worse" myth: Boost only affects GPU clocks during GPU-bound segments. Power draw goes up; latency goes down. No frame-pacing penalty.

## Citations
- NVIDIA Reflex SDK whitepaper (developer.nvidia.com/reflex)
- Battle(non)sense YouTube series on input-lag measurement
- Hardware Unboxed Reflex deep-dive (Aug 2021)
