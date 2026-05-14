# The latency budget — every layer, cited

The total click-to-pixel latency on a stock high-end rig running Fortnite
at 240 Hz lands around **25–35 ms**. On a stock budget rig (1660 Ti, 144 Hz
IPS, basic gaming mouse, no tweaks) it's **50–80 ms**.

That gap isn't magic. It's the sum of every layer between your mouse click
and the photon hitting your eye. About 70% of it is software-tunable. The
remaining 30% is silicon lottery + monitor refresh + ISP geography.

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

Total: **22.5–156 ms** depending on every choice in the stack.

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

- **HID priority + queue size.** Windows' kernel HID class threads run at
  default priority and process events in batches. Pinning them to realtime
  + capping the event queue at 20 cuts median latency by ~1–3 ms under
  load. ([Microsoft — Real-Time Priority docs](https://learn.microsoft.com/en-us/windows/win32/procthread/scheduling-priorities))
  We ship `hid.mouse.priority-realtime` + `hid.keyboard.priority-realtime`
  + queue size tweaks for both.
- **DPC %.** Driver work that can't yield. Healthy idle = < 2%. Above 5%
  on a quiet rig means a misbehaving driver — usually a NIC, audio, or
  USB-C controller. Asta Bench surfaces this. Our `monitor.windowed-game-opt.disable`
  + `vbs.hvci.disable` (VIP) move it on most rigs.
- **Mouse acceleration.** Windows' EPP (Enhance Pointer Precision) adds
  nonlinear gain → unpredictable cm/360 → wasted aim corrections. Off,
  always. Our `ui.mouse.disable-acceleration` flips the registry trio.
- **Power throttling.** Modern Windows aggressively idles cores between
  frames. `process.power-throttling.disable` keeps your game.exe at full
  boost.

**Tunable.** Most of it. The Asta Mode preset hits every lever here.

### 3. Game thread → render thread → driver queue (5–25 ms)

This is the biggest single latency sink, and where NVIDIA Reflex earned its
reputation.

- **Reflex Low Latency (NVIDIA).** Caps the driver's pre-render queue +
  syncs the game thread's frame-start to the GPU's actual readiness, not
  the V-sync clock. Real measured impact: **5–30 ms** depending on rig +
  game. Use ON+BOOST. ([NVIDIA Reflex platform overview](https://www.nvidia.com/en-us/geforce/news/reflex-low-latency-platform/) · [Reflex 2 + Frame Warp announcement](https://www.nvidia.com/en-us/geforce/news/reflex-2-even-lower-latency-gameplay-with-frame-warp/))
- **Cap your FPS at refresh − 3.** On a 240 Hz monitor, cap at 237. The
  -3 prevents the driver queue from building up at 100% V-sync, which
  introduces 3–8 ms of queueing delay. ([Battle(non)sense FPS cap research](https://www.youtube.com/watch?v=tEa78ZmxmI8))
  Fortnite has a built-in cap. Use it.
- **Fullscreen exclusive.** Borderless windowed runs through DWM
  compositor → +1 frame of latency. Fullscreen-exclusive bypasses DWM.
  Fortnite supports it, just toggle in settings. Our `ui.fse.disable-global`
  catalog tweak forces the OS-level FSO override off.
- **Hardware-Accelerated GPU Scheduling (HAGS).** Lets the GPU schedule
  its own frames instead of the CPU brokering. Net positive on Pascal /
  Turing / Ampere, mixed on Ada. Test both for your rig; Asta Mode's
  `process.hags.enable` toggles it on.
- **Game DVR / Xbox Game Bar.** Background recorder running every match.
  Costs 2–5 ms latency + 1–2% framerate. Off via `ui.gamedvr.disable`.

**Tunable.** ~80% of the sink lives here. Reflex alone closes more of the
gap than any other single change in the stack.

### 4. GPU render (4–16 ms = your frame time)

You can't really cheat physics here. Frame time = 1/FPS. 240 fps = 4.17 ms.
The leverage is making sure nothing stretches it:

- **Stripped drivers via NVCleanstall.** Removes telemetry, Discord chat
  detector, USB-C audio, HD audio bundle. Net ~1–3% framerate on dense
  scenes. We point at NVCleanstall in the Driver Advisor.
- **NVIDIA Profile Inspector.** Force "Maximum Performance" power state
  + "Threaded Optimization Off" for Fortnite specifically. Saves
  occasional frametime spikes.
- **Engine.ini hand-tune.** The Asta Mode `fortnite.engine-ini.optimize`
  tweak nukes post-processing / motion blur / mesh LOD biasing, which
  costs you nothing visible but gives the GPU back 8–15% headroom in
  endgame storms.

**Tunable.** Maybe 20% of the layer. Hardware ceiling is hardware.

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

## Realistic deltas you can actually move

What Asta Mode + Reflex + tightened RAM + a wired flagship mouse on a
240 Hz IPS gets you, vs the same person on stock everything:

| Layer | Stock | Tuned | Delta |
|---|---|---|---|
| Input | 8 ms | 1.5 ms | -6.5 |
| Windows + driver | 6 ms | 2 ms | -4 |
| Game / render queue | 22 ms | 6 ms (Reflex+FSE+cap) | -16 |
| GPU frame | 8 ms (120 fps) | 4.5 ms (220 fps) | -3.5 |
| Display | 7 ms (60 Hz IPS) | 2.5 ms (240 Hz IPS) | -4.5 |
| Network | 25 ms | 15 ms (wired + cake QoS) | -10 |
| **Total** | **76 ms** | **31.5 ms** | **-44.5** |

44 ms is the difference between "I get edited around" and "I'm in the
late game." That's what closing the gap looks like.

## What's left after every software lever pulled

Roughly 30%. All hardware:

- **Silicon lottery on CPU + RAM.** A great B-die kit at 3800 CL14 is
  measurably faster than a worse kit at 3600 CL16. RAM advisor on
  /diagnostics names what you have.
- **Monitor refresh ceiling.** 240 Hz vs 480 Hz is ~2 ms of scanout.
  Real but small.
- **Monitor panel quality.** OLED vs cheap IPS is ~3–5 ms in dark
  transitions. Only matters for VA/IPS tier panels in dim scenes.
- **ISP route quality.** No software fix.

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
- **Asta Mode at /asta** — bundle of every layer-2 / 3 / 4 software lever
  in one button (VIP-only).
- **Bufferbloat probe at /toolkit** — measures layer-6 idle vs loaded ping.
- **Live thermals at /toolkit** — confirms layer-4 GPU isn't thermally
  throttling (which silently caps your fps).
