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

## Open questions for Diggy
- Manual Start/Stop only for MVP, or auto-trigger on game launch from day one? (auto is one subscribe to auto_pin.)
- Free tier or VIP? (Recommend FREE — measurement has always been free here; it's the trust hook that sells the VIP presets.)
