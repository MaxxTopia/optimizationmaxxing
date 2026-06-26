# Efficacy audit — 2026-06-26 (input-latency / frametime lens)

4-agent grading of all 103 catalog tweaks by ONE question: does it measurably reduce mouse->photon input latency or improve frametime stability? Consensus/"pros do it" was NOT accepted as proof — each tweak needed a real mechanism, ideally a measured delta, else THEORETICAL / PLACEBO / HARMFUL. Domains: GPU/present-path, CPU/scheduler/timer, network/NIC, background/services/config.

## KEEP-CORE — the genuine wins (this IS the product)
- `display.refresh.maximize` — biggest, fully measured (frame interval + scanout: 16.7ms@60 -> 4.2ms@240).
- `nvidia.nvpi.fortnite-profile` — VSync-off (dominant queue-latency lever, Battlenonsense), Prefer Max Perf (1% lows), pre-rendered frames deferred to native Reflex.
- Game configs: `apex.videoconfig.optimize` + `fortnite.engine-ini.optimize` + `fortnite.gus-ini.competitive` (real GPU-work / frametime wins); `cs2.autoexec.optimize` PARTIAL (raw-input/rate/mat_queue real).
- `process.msi-mode.gpu-nic-audio` — real DPC-latency reduction, MS-documented, safely scoped (excludes storage/xHCI). Best-grounded interrupt tweak. (Modern NVIDIA already defaults MSI -> win mostly on NICs/older GPUs.)
- `vbs.hvci.disable` + `bcd.hypervisorlaunchtype.off` — the one large repeatedly-measured CPU-bound FPS win (~5-15% CPU-bound). Correctly anti-cheat-gated (Vanguard/FACEIT REQUIRE VBS on some titles).
- `process.global-timer-resolution.allow` — grounded in Bruce Dawson's Win11 per-process timer change; conditional (only games leaning on default tick).
- USB/HID selective-suspend cluster: `process.usb-power-mgmt.disable`, `process.hid-power-mgmt.disable`, `power.usb3.link-power.disable` — real wake-stall removal at idle->active edges.
- `peripherals.rgb-control-apps.autostart-disable` — biggest real win in the background set: documented iCUE/Synapse/G-Hub DPC spikes + RAM.
- `ui.mouse.disable-acceleration` — genuine input CONSISTENCY (not latency); in-game raw-input already bypasses, so benefit is desktop/menus + OS-honoring games.
- `audio.comms-ducking.disable` — real competitive-audio win (footsteps survive voice). [NEW in v0.2.12]
- `ui.sticky-keys.disable` — prevents a match-ending input interruption.
- `process.windows-search.disable` — kills mid-match indexer disk/CPU spikes (situational).
- `power.fast-startup.disable` — stutter/stability hygiene.
- `ui.gamedvr.disable` / `ui.gamedvr.appcapture.disable` — removes background-encode stutter (modest).
- `net.nic.eee-powersave.disable` — THE one real network win: kills PHY sleep/wake micro-stalls on a thin UDP flow (a failure-mode fix, downstream of WAN, so it survives "ISP dominates ping").

## KEEP-HONEST — real but marginal/conditional; keep, never headline (many already labeled)
- `net.nic.interrupt-moderation.disable` (only other on-path UDP mechanism; sub-ms, CPU-costed), `net.nic.rss.enable` (defensive re-assert).
- `process.power-throttling.disable`, `process.{fortnite,valorant,cs2}.priority-high` (marginal on 8c+), `process.hags.enable` (ENABLER for Reflex, not a standalone lever), `power.pcie.link-state.off`, `hid.mouse.priority-realtime`.
- `monitor.mpo.disable` + `monitor.windowed-game-opt.disable` + `ui.fse.disable-global` — CONDITIONAL fixes; on 24H2 the optimization IS the low-latency DirectFlip/Independent-Flip path, so disabling can COST latency. (MPO + windowed already correctly labeled; FSE rationale still asserts a stale "~1 frame borderless penalty" -> relabel.)
- The whole privacy/telemetry/services/cosmetic-UI tail: real privacy/QoL, ~0 in-match FPS — fine to ship, must NOT be sold as performance.

## DEMOTE — no measured mechanism or off the gameplay path; strip the perf framing
- `process.mmcss.games-gpu-priority` ("GPU Priority=8" is not a real DXGK scheduling knob — folklore), `process.system.responsiveness` (MMCSS-registered threads only), `process.priority-separation.foreground=38` (client default already gives the boost).
- `bcd.tscsyncpolicy.enhanced` (unproven "0.1% lows on Ryzen"), `process.core-parking.disable` (moot on high-perf plan; can hurt hybrid Thread Director).
- `hid.keyboard.priority-realtime` (catalog admits kbd isn't jitter-sensitive).
- TCP-only NIC knobs mislabeled vs in-match: `net.nic.rsc.disable`, `net.nic.lso.disable` (RSC/LSO are TCP-segment features by spec), `net.nic.flow-control.disable` (only fires on saturation). Demote to "TCP/launcher-only" honesty. `net.throttling.disable` already done.
- `privacy.smartscreen.disable` (fires at launch, never in-match — security cut for zero in-game gain; pull from perf presets), `ui.win11.transparency.disable` + `ui.visualfx.best-performance` (swapchain bypasses DWM in-game -> strip latency implication), `bcd.quietboot` (boot logo only).

## CUT — placebo or net-negative
- `hid.mouse.queue-size.optimize` + `hid.keyboard.queue-size.optimize` — PLACEBO and mildly HARMFUL: queue depth != drain rate; a smaller queue just drops inputs sooner under burst. Default 100 is not a latency source.
- `process.exception-chain-validation.disable` — zero measurable win, pure security debit.
- `net.nic.checksum-offload.disable` — no in-match mechanism, mild CPU + risk; standard guidance is leave offload ON.

## Factual bugs the catalog owes (independent of efficacy)
1. `cs2.autoexec.optimize`: strip the dead `cl_cmdrate 128 / cl_updaterate 128 / cl_interp 0 / cl_interp_ratio 1` block — CS2 is sub-tick; these are deprecated/non-functional CS:GO cargo-cult. Keep raw-input/rate/mat_queue_mode/snd_mixahead.
2. `fortnite.gus-ini.competitive`: description mislabels `FullscreenMode=0` as "fullscreen-windowed" — it is true Fullscreen (value correct, copy wrong).
3. `fortnite.engine-ini.optimize`: add a Performance-Mode (DX11) note — the 2026 headline FPS lever (bypasses Nanite/Lumen) the config doesn't set.
4. `peripherals.usb.coalescing-disable-pinnacle`: strip the uncited "0.2-0.5ms LDAT" figure + the undocumented `IRQPriority=1` framing (keep the selective-suspend half).

## ADD — missing real wins
- Audio sample-rate match (48 kHz) + exclusive-mode / audio-enhancements toggles — the real competitive-audio companions to ducking-off; belong in KEEP-CORE audio tier.

## Product idea surfaced by this audit
Add a per-tweak EVIDENCE TIER badge (Measured / Mechanism / Situational / Cosmetic) in the UI. The product's whole pitch is "shows its work" — surfacing which tweaks are measured vs theoretical vs cosmetic is the honest, differentiating version of that, and directly answers "is this tweak misleading?".
