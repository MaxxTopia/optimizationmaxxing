# The latency budget — every layer, cited

Click-to-pixel latency is the sum of device, OS, game, render, display, and
network layers. The examples below are illustrative measurement ranges from
the cited hardware and latency research, not a promise that every tuned rig
will land in one total or that a budget rig has one fixed baseline.

That gap isn't magic. It is the sum of every layer between your mouse click
and the photon hitting your eye. The split between software, hardware, and
network is rig-dependent, so this guide does not promise a fixed percentage or
a fixed total for a tuned system.

Here's where every millisecond hides, with citations.

## The full chain

```
mouse click
  ↓ 0.5–8 ms   input device + cable / wireless transit
  ↓ 1–10 ms    Windows + driver (HID stack, kernel scheduler, DPC)
  ↓ 5–25 ms    game thread → render thread → driver queue
  ↓ 4–16 ms    GPU render
  ↓ 2–17 ms    display scanout (panel response + pixel paint)
  ↓ 10–80 ms   network UDP roundtrip (only matters for shoot-time)
photon hits eye
```

Those ranges are illustrative component ranges, not a valid promise for a
specific rig or a sum that the app can infer automatically.

## Per layer — what costs what + how to fix

### 1. Input device (0.5–8 ms)

- **Mouse polling rate.** 1000 Hz baseline = 1 ms median latency. 4000 Hz
  shaves 0.6 ms off median, ~1 ms off worst-case. 8000 Hz another ~0.4 ms.
- **Wired vs wireless.** Modern flagship wireless (G PRO X Superlight 2,
  Razer Viper V3 Pro, Pulsar X2 V3) is functionally identical to wired —
  Logitech LightSpeed claim < 1 ms link latency, independently measured at
  ~1.2 ms. Cable mice can sometimes be *slower* than wireless flagships
  if the polling chain is bad. ([Battle(non)sense LightSpeed test](https://www.youtube.com/watch?v=IIjFxKKIDmw))
- **Lift-off distance + sensor latency.** Sub-1 mm LOD on PAW3950 / Focus
  Pro 35K / HERO 2 sensors. Set in vendor app, then kill the daemon.

**Tunable.** Polling rate (mouse firmware), DPI / sens / LOD. Buy a
flagship mouse if you don't have one; nothing else in the stack repays
$130 better.

### 2. Windows + driver (1–10 ms)

- **HID priority + queue size.** Generic registry “queue” and realtime-priority
  recipes are not a universal input-latency fix and can drop events or harm
  system responsiveness. The catalog does not auto-apply that folklore as a
  default; measure the real device, DPC, and frametime path first.
  ([Microsoft — scheduling priorities](https://learn.microsoft.com/en-us/windows/win32/procthread/scheduling-priorities))
- **DPC %.** Driver work that cannot yield. Asta Bench surfaces spikes so the
  offending driver or device can be isolated. A windowed-optimizations or
  VBS/HVCI change may affect a particular system, but neither is a universal
  DPC cure and security/eligibility trade-offs must remain visible.
- **Mouse acceleration.** Windows' EPP (Enhance Pointer Precision) adds
  nonlinear gain → unpredictable cm/360 → wasted aim corrections. Off,
  always. Our `ui.mouse.disable-acceleration` flips the registry trio.
- **Power throttling.** Modern Windows balances responsiveness and power.
  The catalog can evaluate a reversible per-process policy, but a permanent
  “full boost” promise is not valid without measuring clocks, thermals, power,
  and frame time on the target rig.

**Tunable.** Some of it. The app should apply only catalog actions whose
preconditions and read-back checks pass; it cannot guarantee a DPC or input
delta from a label alone.

### 3. Game thread → render thread → driver queue (5–25 ms)

This is the biggest single latency sink, and where NVIDIA Reflex earned its
reputation.

- **Reflex Low Latency (NVIDIA).** It changes the render-queue relationship
  when a supported game exposes it. The result is title-, GPU-, cap-, and
  workload-dependent; use the in-game option and measure rather than claiming
  a fixed millisecond gain. ([NVIDIA Reflex platform overview](https://www.nvidia.com/en-us/geforce/news/reflex-low-latency-platform/) · [Reflex 2 + Frame Warp announcement](https://www.nvidia.com/en-us/geforce/news/reflex-2-even-lower-latency-gameplay-with-frame-warp/))
- **Cap your FPS deliberately.** A cap below refresh can help a VRR setup
  avoid saturation, while uncapped V-Sync-off can be the lower-latency choice
  for a stable high-FPS competitive setup. Compare both with the same scene;
  there is no universal “refresh minus three” result. ([Battle(non)sense FPS cap research](https://www.youtube.com/watch?v=tEa78ZmxmI8))
- **Display mode.** Borderless and fullscreen paths can differ by Windows build,
  presentation mode, driver, and game. Compare the game's supported modes on
  the target build; do not assume a fixed extra frame or that an OS override
  is beneficial.
- **Hardware-Accelerated GPU Scheduling (HAGS).** It changes where scheduling
  work is coordinated. Results vary with the GPU, driver, game, and Windows
  build; test both states with a repeatable capture.
- **Game DVR / Xbox Game Bar.** Background capture and overlays can compete
  for resources on some systems. If disabled, verify that recording or
  tournament workflows still work; do not attach a fixed latency or FPS cost.

**Tunable.** This layer is often important, but the contribution must be
measured per title and workload. Reflex alone is not a guaranteed winner on
every supported configuration.

### 4. GPU render (4–16 ms = your frame time)

You can't really cheat physics here. Frame time = 1/FPS. 240 fps = 4.17 ms.
The leverage is making sure nothing stretches it:

- **Driver package selection.** Removing optional components can reduce
  background software, but it can also remove display, audio, capture, or
  update functionality. Use the vendor package unless a specific component
  is measured as a problem on the target rig.
- **NVIDIA Profile Inspector.** Force "Maximum Performance" power state
  + "Threaded Optimization Off" for Fortnite specifically. Saves
  occasional frametime spikes.
- **Game configuration.** Only use settings documented for the current game
  build and preserve a rollback copy. A setting that lowers visual cost can
  change visibility, streaming, or anti-cheat behavior; no fixed FPS or
  “nothing visible” claim is valid across Fortnite updates.

**Tunable.** Some driver and render choices are measurable; the hardware
ceiling remains hardware.

### 5. Display scanout (2–17 ms)

The panel still has to paint pixels, and which pixels paint when depends
on its scanout pattern.

- **Refresh rate.** 144 Hz panel = 6.94 ms scan period. 240 Hz = 4.17 ms.
  360 Hz = 2.78 ms. 480 Hz = 2.08 ms. Higher = lower expected wait until
  your photon paints.
- **Panel type.** OLED < 1 ms response. Modern fast IPS ~2–3 ms.
  TN 1 ms but limited at 240 Hz. VA gets worst-case dark transitions
  measured at 8–16 ms (the "dark smearing" complaint). For competitive
  Fortnite, 240 Hz IPS or 240+ Hz OLED is the modern minimum.
- **G-Sync / FreeSync window.** When on + capped just below refresh, the
  monitor stops waiting for V-sync between frames. Saves the difference
  between worst-case and best-case scanout — a real 1–3 ms.
  ([NVIDIA G-Sync research](https://blurbusters.com/gsync/gsync101-input-lag-tests-and-settings/) — Blur Busters)
  - **Fortnite-pro caveat:** at 240+ Hz with stable FPS above refresh, pros
    run VRR **OFF** + V-Sync off + NVIDIA Reflex On+BOOST + uncapped (or
    refresh-3 cap). G-Sync adds ~1 ms versus raw V-Sync-off rendering, and
    tearing is essentially invisible at that frame rate — pros prefer the
    marginal latency win. For lower-refresh monitors or unstable FPS the
    standard G-Sync stack still wins.
- **Monitor input lag mode.** Vendor menu setting. Almost always called
  something different per vendor (ASUS = "Display Boost Off", LG =
  "Low Latency", Dell = "Low Input Lag"). 1–4 ms savings, free.

**Tunable.** Mode + sync window only — refresh + panel type are hardware.

### 6. Network — UDP roundtrip (10–80 ms)

Only relevant for **shoot time**, not for visual responsiveness. Your
shoot register depends on the server tick + your packet's roundtrip to
the game server.

- **ISP geography.** Hard ceiling. East-coast US to AWS us-east-1 (where
  Fortnite hosts NA matches) = 10–18 ms typical. Same coast to oc1 =
  120+ ms. Can't fix without moving.
- **Bufferbloat.** When something else uses your link, your idle 9 ms
  ping balloons to 80+. The Bufferbloat probe in our Toolkit measures
  the delta. Fix is router-side: enable cake / fq_codel / SQM.
- **Last-mile noise.** Wifi adds 5–15 ms of variance + retransmission
  spikes. Wire the gaming PC if it isn't already.

**Tunable.** Bufferbloat is software (router config). Geography isn't.
Wifi → wired is hardware ($30 cable).

## How to measure the margin

Capture the same game build, map or training scene, resolution, frame cap,
display mode, driver, and peripheral polling state before and after one
change. Record frametime percentiles, refresh mode, DPC/ISR spikes, and any
input-latency measurement available to the hardware. A prettier control or a
successful command is not proof of a lower click-to-photon result.

## What's left after software changes

The remaining margin varies by rig. Hardware, firmware, game workload, display
mode, and network route can each dominate:

- **CPU + RAM behavior.** Memory profiles and CPU topology can change
  frametime, but the RAM advisor reports configuration and stability signals;
  it does not prescribe manual timing or voltage values.
- **Monitor refresh ceiling.** 240 Hz vs 480 Hz is ~2 ms of scanout.
  Real but small.
- **Monitor panel quality.** OLED vs cheap IPS is ~3–5 ms in dark
  transitions. Only matters for VA/IPS tier panels in dim scenes.
- **ISP route quality.** No local Windows tweak can rewrite geography or the
  provider's route.

## Citations

- Battle(non)sense input-lag deep dives — the most-rigorous independently-
  measured esports latency channel.
- NVIDIA Reflex 2 whitepaper.
- Blur Busters' G-Sync 101 series — Mark Rejhon's research on sync windows.
- Microsoft Learn on Windows kernel priorities + DPC behavior.
- Optimum Tech monitor input-lag reviews.

## Direct hooks into this app

- **Asta Bench at /benchmark** — measures CPU latency + DPC % + ping
  jitter + frame-pacing stddev. Save before/after snapshots.
- **Asta Mode at /asta** — profile-gated catalog actions with confirmation,
  rollback snapshots, and native read-back where an action has a declared
  verifier (VIP-only for the higher-risk profiles).
- **Bufferbloat probe at /toolkit** — measures layer-6 idle vs loaded ping.
- **Live thermals at /toolkit** — confirms layer-4 GPU isn't thermally
  throttling (which silently caps your fps).
