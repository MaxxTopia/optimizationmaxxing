# Intel Arc — competitive setup

Arc is a different animal from GeForce/Radeon: its performance is unusually **driver-bound**, and one BIOS setting makes or breaks it. Here's the Arc-specific checklist.

## Resizable BAR is mandatory — check it first

Arc depends on **Resizable BAR** far more than other GPUs. Without it, an Arc card (including the B580) can lose roughly 20–40%. This is the single biggest Arc FPS lever.

- Enable in BIOS: look for **Resizable BAR** / **Above 4G Decoding** / **ReBAR**.
- Requires UEFI boot (CSM off) and a reasonably modern platform (Intel 10th-gen+ or Ryzen 3000+).
- Confirm it's "Enabled" in **Intel Graphics Software** (the app that now ships with the driver — it replaced the old Arc Control) after rebooting.

## Stay current on drivers (but spot-check each release)

Arc gains have come disproportionately from driver updates — Intel has shipped large per-driver uplifts, especially for older DirectX 9/11 titles. Keep the **latest WHQL/Game-On driver**. There's no permanently "safe" version to pin to: if a new driver regresses the title you play, roll back one and wait for the fix.

## XeSS: use the low-latency piece, skip frame-gen for competitive

XeSS 2 bundles three parts:
- **XeLL (Xe Low Latency)** — Intel's Reflex/Anti-Lag analog. **Enable it** where a game exposes it; it's the competitively useful part.
- **XeSS-SR (super resolution)** — fine for headroom if you need frames; run native for max clarity.
- **XeSS-FG / XeSS 3 multi-frame-generation** — adds latency and artifacts. **Leave off** for CS2 / Valorant / Apex / Fortnite.

## Intel Graphics Software caveats

> Intel retired **Arc Control** and folded it (plus the old Intel Graphics Command Center) into a single app, **Intel Graphics Software (IGS)** — that's what current Arc/Iris/UHD driver installs ship. The caveats below are unchanged; they just live in IGS now.

- IGS's built-in **frame-rate cap only covers DX9/DX11** (not DX12/Vulkan), and its **Speed Sync / Smart V-Sync** have been unreliable. For competitive play, use the **in-game** FPS cap and in-game V-Sync-off rather than relying on IGS for those.

## Display basics

Same VRR logic as everyone else: for fluctuating FPS run FreeSync/G-Sync-compatible ON + V-Sync ON in the driver + a cap below refresh; at high refresh with FPS above the panel, V-Sync OFF + accept tearing for the lowest latency.
