# Match Scan — build spec (v0.3.0 MVP + v0.3.1 frametime)

**One-line:** start it before you queue, play a real ranked/scrim, stop it — get a plain-English verdict on whether your rig held up (thermal throttling, instability, stutter, CPU-vs-GPU bound) and exactly what to change. Works for overclockers and non-overclockers alike.

**Why it fits the product:** measurement is already the free-tier thesis; this is the coach rule applied to hardware (surface hidden data, don't echo the obvious). It also closes the loop with the efficacy audit — prove a tweak's effect on YOUR rig in a real match instead of trusting consensus.

**Hard rule it respects:** read-only. No voltage/ratio/BIOS/MSR writes — ever. It diagnoses and recommends; it never tunes.

---

## What already exists (reuse, don't rebuild)
- `src-tauri/resources/lhm/` — LibreHardwareMonitorLib.dll + `read_sensors.ps1` (per-core temp, Vcore/VID, clocks, load, power; needs WinRing0 elevation).
- `toolkit.rs::read_dpc_snapshot()` — %DPC + %interrupt per logical CPU.
- `toolkit.rs::whea_count_last_30_days()` — WHEA-Logger event count (instability/degradation signal). Generalize to "since timestamp T".
- `bios_audit.rs` — XMP/EXPO trained, power plan / C-states, VBS/HVCI, SMT.
- `auto_pin.rs` — sysinfo game-process detection (the auto Start/Stop trigger).
- `drivers.rs` — known-bad GPU driver / voltage-instability flagging.

## What's NEW to build

### A. Throttle + clock telemetry (Rust)
Extend the LHM read into a `RigSample` taken ~1x/sec:
```
RigSample {
  ts_ms, 
  cpu_pkg_temp_c, cpu_max_core_temp_c, cpu_tjmax_c,
  cpu_eff_clock_mhz, cpu_rated_base_mhz, cpu_vcore_v, cpu_pkg_power_w, cpu_pl1_w, cpu_pl2_w,
  cpu_throttle: { thermal: bool, power_limit: bool, current_limit: bool },   // from LHM throttle sensors; fallback inference below
  gpu_temp_c, gpu_hotspot_c, gpu_core_clock_mhz, gpu_power_w, gpu_power_limit_w, gpu_util_pct,
  gpu_throttle_reason: enum,   // nvidia-smi clocks_throttle_reasons OR LHM
  cpu_util_pct, ram_used_pct,
  dpc_total_pct, dpc_worst_cpu, 
}
```
- **Throttle detection:** prefer LHM throttle sensors. Fallback inference when absent: `thermal = (max_core_temp >= tjmax - 2)`; `power_limit = (pkg_power >= pl1*0.97 AND eff_clock < rated_base)`; `clock_collapse = eff_clock dropped >X% under >Y% load`. NVIDIA GPU: parse `nvidia-smi --query-gpu=clocks_throttle_reasons.active` (already have nvidia-smi path).
- Sampler runs in a tokio task (like auto_pin), writes to an in-memory ring + flushes to `%LOCALAPPDATA%\optmaxxing\match-scans\<ts>.jsonl`. Overhead target <0.5% CPU at 1 Hz.

### B. WHEA-during-window
Generalize `whea_count_last_30_days` -> `whea_events_since(ts)`; capture count + first/last error type during the scan window. Any correctable WHEA mid-scan = instability flag (huge for OC stability).

### C. Session lifecycle (Rust + 3 commands)
- `match_scan_start()` -> begins sampler, records start ts, snapshots BIOS/power-plan/driver context once.
- `match_scan_stop()` -> stops sampler, runs the verdict engine, returns `MatchScanReport`, persists JSONL + report.
- `match_scan_status()` -> running?/elapsed/live last-sample (for a live mini-HUD).
- Auto-mode (opt-in): subscribe to auto_pin's game-detection to auto start on game launch / stop on exit.

### D. Verdict engine (Rust, pure function over the sample series)
Produces `MatchScanReport`:
```
MatchScanReport {
  duration_s, game_detected,
  thermal: { throttled: bool, total_throttle_s, worst: {ts, temp, clock_before, clock_after}, verdict_text },
  stability: { whea_events, worst_kind, verdict_text },          // 0 = stable
  power: { hit_pl_limit: bool, avg_pkg_w, verdict_text },
  stutter: { dpc_spikes: [{ts, cpu, pct, likely_driver}], verdict_text },   // likely_driver via DPC-by-CPU + known offenders
  bound: { cpu_bound_pct, gpu_bound_pct, verdict_text },          // v0.3.1 (needs PresentMon); v0.3.0 = util-based heuristic
  headline: string,   // the one-liner
  recommendations: [ { issue, action, confidence } ],
}
```
Rule examples (plain-English, coach voice):
- thermal throttle >5s -> "You thermal-throttled Ns (worst HH:MM, CPU hit TjMax, clock A->B GHz). Likely cooler/contact or PL2 too aggressive. Fix cooling before anything else."
- bound: cpu_bound high + GPU util low -> "You were CPU-bound X% — a GPU upgrade won't raise FPS; the lever is CPU thermals/clocks + the CPU-bound tweaks."
- WHEA>0 -> "N correctable hardware errors mid-match = your current OC/RAM (EXPO) is NOT stable. Back off the last change."
- dpc spike -> "Stutter at HH:MM from <driver> DPC. See the DPC guide."
- clean -> "No throttling, 0 errors, frametimes stable. Your rig is holding peak; bottleneck is elsewhere (settings/network/aim)."

### E. Frontend (`/diagnostics` or new `/match-scan`)
- Big Start/Stop button + live mini-HUD (temp / clock / throttle dot / DPC) while running.
- Post-scan report card: headline + the 5 sections + recommendations, each linking the relevant guide/tweak. "Copy as text" for Discord (matches existing /diff pattern).
- Timeline sparkline (reuse the pure-SVG chart from AstaBenchHistoryGraph) of temp + eff-clock with throttle bands shaded.

### F. v0.3.1 — PresentMon frametime (the pro-grade layer)
- Bundle Intel **PresentMon** (MIT, redistributable, ETW-based — NO game injection, so no anti-cheat risk; same capture CapFrameX uses). Verify current PresentMon license + that the console build can be shipped.
- During a scan, run `PresentMon.exe` capturing the detected game PID -> per-frame present + (on supported GPUs) GPU-busy / latency.
- Adds to the report: real 1%/0.1% low frametimes, true CPU-vs-GPU-bound split, frametime-spike timeline correlated with the throttle/DPC events. This turns "util heuristic" into measured bound analysis.

## Anti-cheat / safety notes
- LHM/WinRing0: already shipped + AV-fallback handled. Reads only.
- PresentMon: ETW consumer, no injection -> the standard safe path (unlike RTSS overlay hooks). Still: surface a one-time "this reads performance counters, never touches the game" note.
- Nothing here writes a tunable. Auto-OC stays permanently out of scope.

## Build order
1. v0.3.0 MVP: A (throttle telemetry) + B (WHEA window) + C (lifecycle) + D (verdict, util-based bound) + E (UI). Ships the "am I throttling while I play" answer on existing sensors.
2. v0.3.1: F (PresentMon) -> real frametime + measured CPU/GPU-bound.

## Decisions (locked 2026-06-26)
- **Manual Start/Stop only** for the MVP (no auto-trigger yet).
- **VIP-only** feature.
- Verdict must always close with plain-English **what's wrong -> what's causing it -> how to fix it** per finding.

---

## G. VERIFIED master signal list

Synthesis of a 6-agent research sweep (1 verification + 5 domain discovery), all live-sourced June 2026. This SUPERSEDES the original freehand list — ~8 freehand errors were caught and corrected (noted inline). Organized by what we can actually SHIP.

### G0. Engineering-correctness rules (get these wrong and every number is wrong)
- **CPU% per process:** `\Process(*)\% Processor Time` is summed across logical cores — **divide by ProcessorCount**, and bind name->PID via the `ID Process` counter, not the name. Skipping this inflates every CPU reading 4-16x.
- **Per-PID GPU%:** PDH `GPU Engine(pid_<PID>_engtype_*)\Utilization Percentage` — enumerate/filter/sum like Task Manager. `engtype_3D` vs `engtype_VideoEncode` separates render contention from recording/encode.
- **Effective CPU clock is RING0-only:** `Win32_Processor.CurrentClockSpeed` is cached garbage. True effective clock + all throttle-reason bits + Vcore + VRM + FCLK need the LHM/WinRing0 driver (already bundled) + admin -> Tier 2.
- **CPU temp:** WMI `MSAcpi_ThermalZoneTemperature` is chipset/empty = WRONG-METHOD. Real core temp = LHM (RING0). Driver-free proxy = clock-vs-base under load.
- **GPU hotspot / GDDR6X memory-junction temp:** NOT in nvidia-smi/NVML. Only LHM/HWiNFO/GPU-Z (NVAPI). Unavailable pre-RTX-30; RTX 50-series + some AMD hide hotspot -> degrade gracefully.
- **PCIe link:** reading `.current` at idle reads a power-saving downtrain (Gen1 x16 normal) -> read `.max` or sample under load, else every healthy card false-alarms.
- **Display chroma/bit-depth:** `EnumDisplaySettings.dmBitsPerPel` is the framebuffer (always 32), NOT signal depth/chroma -> WRONG-METHOD. Chroma/RGB-range only via NVAPI.
- **Game UDP packet loss is UNREADABLE:** fire-and-forget, no ACKs; `netstat -s` UDP errors != wire loss. Loss/jitter must be PROXIED (active gateway+server probing) and labeled "estimated," never asserted.
- **Monitor OSD (overdrive/strobe/instant-mode):** vendor-private DDC/CI VCP codes -> effectively NOT readable. Advise, never "scan."
- **In-game settings (Reflex/VSync/cap/DLSS live state):** NOT OS-readable. Can read the NVCP/DRS global layer (shaky) -> surface as checklist, don't fake a reading.

### G1. TIER 1 — driver-free, ship first (WMI / perf-counter / registry / event-log / SMART; no UAC, no AC risk)
The shippable MVP core. Each = real competitive problem + clean read-only + commonly missed.
- **RAM not at XMP/EXPO** (#1 free-FPS miss) — `Win32_PhysicalMemory` ConfiguredClockSpeed vs SPD Speed.
- **Single-channel / one-DIMM RAM** — DIMM count + slot labels. (CORRECTION: can detect "1 stick"; CANNOT reliably prove "2 sticks wrong slots / interleave mode" — scope the claim.)
- **4-DIMM speed ceiling (AM5)** — infer from 4 DIMMs + configured speed.
- **Running below max refresh rate** (60Hz on a 240Hz panel — huge, embarrassingly common) — EnumDisplaySettings current vs max for current res.
- **Display routed through iGPU / game on iGPU** — QueryDisplayConfig adapter LUID per display (SOLID); per-PID GPU-by-adapter for the game (live).
- **Game installed on HDD / wrong drive** — MSFT_PhysicalDisk MediaType/BusType.
- **SSD near-full (<10-15%) + NVMe SMART temp/throttle** — free-space % + NVMe SMART log.
- **Memory pressure: hard faults/sec** (>~20 during stutter) — `Memory\Page Reads/sec` (NOT Page Faults/sec; "committed>RAM" is normal — dropped as a trigger).
- **Laptop on battery -> DPTF power cut** (20-45% loss) — Win32_Battery AC/DC + per-plan state.
- **Power plan / core parking / min proc-state** — powercfg + registry (1%-lows lever; "core parking" language is dated on 24H2 — frame as min-state/boost).
- **VBS / HVCI / Memory Integrity ON** (5-15% loss, ON by default Win11) — registry + Win32_DeviceGuard (configured vs running).
- **WHEA correctable-error rate** (early instability/degradation; timely re: Intel 13/14th-gen) — System event log WHEA-Logger ID 17/19/47.
- **Defender real-time scan spiking + missing exclusions** — live MsMpEng CPU (÷cores) + Get-MpPreference exclusions (game/shader/AC dirs).
- **Windows Update / Delivery-Optimization upload / scheduled task firing mid-match** — process enum + service state + Get-DeliveryOptimizationStatus.
- **Background CPU/GPU hogs** — per-PID CPU% (÷cores) + per-PID GPU%; name offenders.
- **NVIDIA App Game Filters / Photo Mode ON** (up to 15% loss, on by default) — NVIDIA App overlay config.
- **RGB software (iCUE/Armoury/SignalRGB) CPU hog** — per-PID CPU on named procs.
- **GameDVR background recording** (most-SOLID read in the scan) — GameDVR_Enabled/AllowGameDVR registry.
- **Xbox Game Bar (3-8%)** — AppX/registry presence.
- **Mouse "Enhance Pointer Precision" ON** (single strongest sleeper; updates silently re-enable it) + **pointer speed off 6/11 notch** — HKCU\Control Panel\Mouse MouseSpeed/Threshold1/2 + MouseSensitivity=10.
- **USB selective suspend ON (desktop)** — powercfg GUID + per-device flag.
- **Cloud-drive active sync mid-match (OneDrive/Dropbox/GDrive)** — proc + IO bytes if sync vol = game vol.
- **NIC: Wi-Fi-vs-Ethernet + 2.4 vs 5/6GHz band + RSSI + WLAN power-save** — Get-NetAdapter + `netsh wlan show interfaces` (Win11 exposes RSSI dBm). (CORRECTION: flag on retry/RSSI/power-save, not merely "media=Wi-Fi.")
- **NIC link low / half-duplex** — Get-NetAdapter LinkSpeed/FullDuplex. (CORRECTION: 100Mbps is a BAD-CABLE SYMPTOM, NOT a latency loss — bandwidth doesn't hurt UDP games; frame as cable fault, not perf.)
- **Background bandwidth hog (uplink saturation)** — Get-NetTCPConnection + PID + per-NIC bytes.
- **Bufferbloat / latency-under-load** — idle-ping baseline vs loaded re-ping, Waveform-style A-F grade.
- **Gateway-vs-server ping split** (the credibility engine — proves house vs ISP) — concurrent ping to default gateway AND the game-server IP (from Get-NetUDPEndpoint for the game PID).
- **Pending reboot / stale driver / pagefile disabled / too many startup apps / Focus-Assist off (mid-match popups)** — registry + Run keys.
- **Windows build known-bad regression** (e.g. KB-tagged builds w/ 33-50% loss) — CurrentBuild+UBR vs a maintained known-bad table.
- **NVIDIA GPU thermal/power throttle active under load** (no admin) — NVML clocks_throttle_reasons + temp/clocks.
- **GPU on HDD-adjacent... (n/a)**; **mixed-refresh multi-monitor + MPO (pre-24H2)** — QueryDisplayConfig per-path refresh + OS build gate + OverlayTestMode reg.
- **Nahimic / Sonic Studio / Realtek high-DPC audio driver present** (preinstalled OEM offender) — service/proc enum (confirm via Tier-2 ETW).
- **Spatial sound stacked on game HRTF** + **audio endpoint != 48kHz** — endpoint FxProperties / DeviceFormat.

### G2. TIER 2 — deep scan (opt-in; needs the bundled RING0 driver / HWiNFO-style sensor / ETW; UAC + small AC-flag risk — gate it)
- **Effective clock vs rated under load; CPU thermal/PL1-PL2-Tau/EDP-IccMax throttle bits; Vcore/VID; CPU hotspot/per-core max** — LHM RING0.
- **GPU hotspot vs edge delta (paste pump-out) + GDDR6X memory-junction throttle** — LHM/NVAPI (the highest-value Tier-2 item; core reads 70C while VRAM throttles at 100C).
- **VRM/MOSFET temp throttle** — LHM, board-dependent (many boards don't expose it — set expectations).
- **FCLK/UCLK 1:1 vs 2:1 (AMD)** — RING0 SMU, or infer 1:2 if configured >6000 on Zen4/5.
- **DPC/ISR latency by driver** (the clearest "feel" item — nvlddmkm/ndis/storport) — NT Kernel Logger `dpcisr` ETW exec-times (admin, no extra driver). Perturbs what it measures -> opt-in, short window.
- **Chroma subsampling 4:2:2/4:2:0 + Limited RGB range + signal bit depth** (softens enemy outlines/HUD — invisible to users) — NVAPI color control.
- **Achieved mouse polling rate vs set + jitter/burst%** (catches mice that lie / RF dropouts / shared-controller clumping) — active WM_INPUT raw-input timing probe (not passive). Offer as a "click to run" probe.
- **USB topology map** (mouse behind a hub / monitor-KVM / sharing a controller with capture card/NVMe) + **2.4GHz dongle on a USB3 controller** (RF interference) — SetupAPI/USB tree + node-connection IOCTL.
- **Exclusive-FS vs composed present mode; VRR actually engaged; per-game NVCP/DRS overrides (Power Mgmt, Max-FPS, LLM)** — PresentMon ETW (live) + NVAPI DRS. v0.3.1.

### G3. ADVISE-ONLY — not software-detectable (give a checklist, NEVER claim a reading = fabrication)
- Mouse firmware: LOD, debounce, angle-snapping, motion-sync/ripple/smoothing, sensor IPS-ceiling spin-outs, 2.4GHz-dongle battery%, rapid-trigger/SOCD (+ warn: rapid-trigger BANNED in CS2 comp Sept 2024).
- Driver/in-game mouse accel; in-game raw-input/sensitivity (fragile per-game config parse at best).
- Monitor OSD: overdrive/response-time, instant/low-lag mode, backlight strobing (ULMB/DyAc) — vendor-private VCP.
- Physical: dongle placement/distance/metal-case shadowing, front-vs-rear port labeling, mousepad friction, ambient temp, dust/clogged cooler, dried paste (temp proxy only), coil whine, bad/long cables + EMI (only an indirect "panel not hitting rated refresh -> suspect cable" inference), PSU transient headroom (estimate from component TDP if user inputs PSU watts — never claim a reading).
- DPI deviation from set value — only via an optional guided drag-the-ruler test.

### G4. DO-NOT-FLAG — myths the research debunked (flagging these as fixes would discredit the tool)
- **VRR/G-Sync OFF at 240+Hz with stable FPS = CORRECT**, not a fault ([[feedback_fortnite_gsync_off]]). V-Sync ON is correct WHEN paired with G-Sync+Reflex — don't blanket-flag.
- **Resizable BAR is NOT "free 5-10%"** — game-dependent, includes real regressions (-9% to -69% 0.1% lows). "Off -> worth testing per game," never a guaranteed win.
- **NIC 100Mbps** is a cable symptom, not a latency loss. **DNS** is connect-time only (not an in-match ping fix). **TCP tweaks** (Nagle/RWIN/autotuning) are placebo for UDP games. **8000Hz polling** is NOT universally better (costs FPS on CPU-bound rigs); keyboard 8K is marketing.
- **RTSS/Afterburner** often *improve* pacing — don't flag as a killer. **Wallpaper Engine** auto-pauses under fullscreen. **DirectStorage** irrelevant to CS2/Val/Fortnite. **Standby-list bloat** is usually normal caching (flag only WITH hard faults). **HAGS / Game Mode / borderless-FSO** are context, not universal faults. **Realtime priority / manual P-core-excluding affinity** are HARMFUL on hybrid CPUs — only flag those. **Disabling telemetry / SSD defrag (it's TRIM) / visual effects / 24-bit audio** = placebo for FPS — report state, don't sell as fixes.

### G5. MVP scope (v0.3.0)
Ship **all of Tier 1 (G1)** — preflight (config landmines, 1-second, before queue) + live (contention/throttle/network during the match), all driver-free, VIP-only, manual Start/Stop. Verdict per finding = **what's wrong -> what's causing it -> how to fix it** with a confidence + a link to the relevant tweak/guide; respect the G4 myth-guards so we never give bad advice. **Tier 2 (G2)** ships as an opt-in "Deep scan (admin)" toggle reusing the bundled LHM driver. **v0.3.1** adds PresentMon (frametime + true CPU/GPU-bound) and the active probes (polling-rate, chroma).
