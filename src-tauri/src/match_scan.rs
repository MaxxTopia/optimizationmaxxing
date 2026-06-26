//! Match Scan — read-only rig scanner that surfaces the silent, commonly-missed
//! things hurting competitive-FPS performance, each with a plain-English
//! what's-wrong -> what's-causing-it -> how-to-fix-it.
//!
//! MVP = Tier-1 "preflight": driver-free reads (registry / WMI via reused
//! probes), no UAC, no anti-cheat risk, runs in ~1 second before the user even
//! queues. It NEVER writes a tunable — it diagnoses and recommends only.
//! Live contention sampling + the RING0 "deep scan" (effective clock, GPU
//! hotspot/VRAM-junction temps) + PresentMon frametime are later increments.
//! Full vetted signal catalog: references/match-scan-spec.md (section G).

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use winreg::enums::*;
use winreg::RegKey;

use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    EnumDisplaySettingsW, DEVMODEW, ENUM_CURRENT_SETTINGS, ENUM_DISPLAY_SETTINGS_MODE,
};

use crate::bios_audit;
use crate::network_audit;
use crate::process_helpers;
use crate::toolkit;

/// Run a short PowerShell snippet and return trimmed stdout (None on failure).
fn run_ps(script: &str) -> Option<String> {
    let out = process_helpers::hidden_powershell()
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Per-PID GPU utilization (% on the 3D engine) via the Windows perf counters.
/// Read-only, no admin. Instance names look like
/// `pid_1234_luid_..._engtype_3D`; we sum across a PID's 3D engines.
fn read_gpu_by_pid() -> HashMap<u32, f32> {
    let mut map: HashMap<u32, f32> = HashMap::new();
    let script = "(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples | Where-Object { $_.CookedValue -gt 0.5 } | ForEach-Object { \"$($_.InstanceName)=$([math]::Round($_.CookedValue,1))\" }";
    if let Some(out) = run_ps(script) {
        for line in out.lines() {
            if let Some((inst, val)) = line.rsplit_once('=') {
                if let Some(rest) = inst.strip_prefix("pid_") {
                    if let Some(pid_str) = rest.split('_').next() {
                        if let (Ok(pid), Ok(v)) =
                            (pid_str.parse::<u32>(), val.trim().parse::<f32>())
                        {
                            *map.entry(pid).or_insert(0.0) += v;
                        }
                    }
                }
            }
        }
    }
    map
}

struct RefreshInfo {
    current_hz: u32,
    max_hz: u32,
    width: u32,
    height: u32,
}

/// Read the primary display's current refresh rate and the highest refresh it
/// supports AT THE CURRENT RESOLUTION (max Hz drops at higher res / on a
/// bandwidth-limited cable, so comparing at the same resolution is the honest
/// check). Returns None if the display can't be queried.
fn read_primary_refresh() -> Option<RefreshInfo> {
    unsafe {
        let mut dm = DEVMODEW {
            dmSize: std::mem::size_of::<DEVMODEW>() as u16,
            ..Default::default()
        };
        if !EnumDisplaySettingsW(PCWSTR::null(), ENUM_CURRENT_SETTINGS, &mut dm).as_bool() {
            return None;
        }
        let current_hz = dm.dmDisplayFrequency;
        let width = dm.dmPelsWidth;
        let height = dm.dmPelsHeight;
        let mut max_hz = current_hz;
        let mut i: u32 = 0;
        loop {
            let mut m = DEVMODEW {
                dmSize: std::mem::size_of::<DEVMODEW>() as u16,
                ..Default::default()
            };
            if !EnumDisplaySettingsW(PCWSTR::null(), ENUM_DISPLAY_SETTINGS_MODE(i), &mut m).as_bool()
            {
                break;
            }
            if m.dmPelsWidth == width && m.dmPelsHeight == height && m.dmDisplayFrequency > max_hz {
                max_hz = m.dmDisplayFrequency;
            }
            i += 1;
            if i > 10_000 {
                break; // safety against a misbehaving driver
            }
        }
        Some(RefreshInfo {
            current_hz,
            max_hz,
            width,
            height,
        })
    }
}

fn looks_like_gpu(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("nvidia")
        || n.contains("geforce")
        || n.contains("radeon")
        || n.contains("amd")
        || n.contains("arc")
        || n.contains("graphics")
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub id: String,
    /// "critical" (real FPS/latency loss) | "warn" | "info" | "ok"
    pub severity: String,
    /// what's wrong, one line
    pub title: String,
    /// what's causing it
    pub cause: String,
    /// how to fix it
    pub fix: String,
    /// the measured value behind the finding, if any
    pub evidence: Option<String>,
    /// catalog tweak id that addresses it, if one exists
    pub tweak_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct MatchScanReport {
    pub headline: String,
    pub findings: Vec<Finding>,
    /// how many checks actually ran (some skip when data is unavailable)
    pub checked: u32,
    /// honest caveats — what this tier could NOT read, so we never imply we did
    pub notes: Vec<String>,
}

fn hkcu_string(path: &str, name: &str) -> Option<String> {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(path)
        .ok()?
        .get_value::<String, _>(name)
        .ok()
}

fn hkcu_dword(path: &str, name: &str) -> Option<u32> {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(path)
        .ok()?
        .get_value::<u32, _>(name)
        .ok()
}

/// Run the driver-free preflight scan. Infallible: any read that fails is just
/// skipped (and surfaced in `notes`), so the scan always returns a report.
pub fn run_preflight() -> MatchScanReport {
    let mut findings: Vec<Finding> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let mut checked: u32 = 0;

    // ---- RAM: running at XMP/EXPO, or stuck at stock JEDEC? --------------
    // (#1 silent killer — XMP/EXPO is OFF by default; users assume it's on.)
    match bios_audit::read_bios_audit() {
        Ok(ba) => {
            checked += 1;
            let rated = ba.ram_speed_mhz;
            let configured = ba.ram_configured_mhz;
            let evidence = match (configured, rated) {
                (Some(c), Some(r)) => Some(format!("running {c} MT/s, rated {r} MT/s")),
                _ => None,
            };
            match ba.expo_xmp_active {
                Some(false) => findings.push(Finding {
                    id: "ram.xmp-off".into(),
                    severity: "critical".into(),
                    title: "RAM is running at stock speed, not its rated XMP/EXPO profile".into(),
                    cause: "Motherboards boot RAM at the slow JEDEC default; the rated speed only applies once you turn on the XMP (Intel) / EXPO (AMD) profile in BIOS. It's off until you enable it.".into(),
                    fix: "Reboot into BIOS, enable the XMP/EXPO profile (often one toggle), save & exit. This is usually the single biggest free FPS / 1%-low gain on a stock build.".into(),
                    evidence,
                    tweak_id: None,
                }),
                Some(true) => findings.push(Finding {
                    id: "ram.xmp-on".into(),
                    severity: "ok".into(),
                    title: "RAM is running at its rated XMP/EXPO speed".into(),
                    cause: String::new(),
                    fix: String::new(),
                    evidence,
                    tweak_id: None,
                }),
                None => notes.push(
                    "Couldn't confirm XMP/EXPO state on this board (some report the rated speed inconsistently).".into(),
                ),
            }

            // ---- Power plan: High/Ultimate vs Balanced/Saver -------------
            checked += 1;
            if let Some(name) = ba.power_plan_name.as_deref() {
                let n = name.to_lowercase();
                let is_perf = n.contains("high performance")
                    || n.contains("ultimate")
                    || n.contains("low latency");
                if !is_perf {
                    findings.push(Finding {
                        id: "power.plan-not-perf".into(),
                        severity: "warn".into(),
                        title: format!("Windows power plan is '{name}', not a performance plan"),
                        cause: "Balanced / Power-Saver plans let the CPU sit at a low minimum state and idle deeper between bursts, which adds wake latency and frametime variance (it hurts 1% lows more than average FPS).".into(),
                        fix: "Switch to High Performance (or the Win11 24H2+ Low-Latency profile) for ranked sessions: Control Panel > Power Options, or the app's power tweaks.".into(),
                        evidence: Some(format!("active plan: {name}")),
                        tweak_id: None,
                    });
                } else {
                    findings.push(Finding {
                        id: "power.plan-ok".into(),
                        severity: "ok".into(),
                        title: format!("Power plan is '{name}'"),
                        cause: String::new(),
                        fix: String::new(),
                        evidence: None,
                        tweak_id: None,
                    });
                }
            }
        }
        Err(e) => notes.push(format!("RAM/power-plan probe failed: {e:#}")),
    }

    // ---- Mouse acceleration (Enhance Pointer Precision) ------------------
    // OFF = MouseSpeed/Threshold1/Threshold2 all "0". Updates silently re-enable it.
    checked += 1;
    let ms = hkcu_string("Control Panel\\Mouse", "MouseSpeed");
    let t1 = hkcu_string("Control Panel\\Mouse", "MouseThreshold1");
    let t2 = hkcu_string("Control Panel\\Mouse", "MouseThreshold2");
    match (ms.as_deref(), t1.as_deref(), t2.as_deref()) {
        (Some(a), Some(b), Some(c)) => {
            let accel_on = a != "0" || b != "0" || c != "0";
            if accel_on {
                findings.push(Finding {
                    id: "mouse.accel-on".into(),
                    severity: "critical".into(),
                    title: "Mouse acceleration (Enhance Pointer Precision) is ON".into(),
                    cause: "With it on, the same physical motion moves the crosshair a different distance depending on how fast you flick — it destroys aim consistency and muscle memory. Windows updates silently re-enable it.".into(),
                    fix: "Turn it off: Settings > Bluetooth & devices > Mouse > Additional settings > Pointer Options > uncheck 'Enhance pointer precision'. Or apply the app's mouse-acceleration tweak.".into(),
                    evidence: Some(format!("MouseSpeed={a}, Threshold1={b}, Threshold2={c}")),
                    tweak_id: Some("ui.mouse.disable-acceleration".into()),
                });
            } else {
                findings.push(Finding {
                    id: "mouse.accel-off".into(),
                    severity: "ok".into(),
                    title: "Mouse acceleration is off (1:1 tracking)".into(),
                    cause: String::new(),
                    fix: String::new(),
                    evidence: None,
                    tweak_id: None,
                });
            }
        }
        _ => notes.push("Couldn't read the mouse-acceleration registry keys.".into()),
    }

    // ---- Pointer speed off the 6/11 notch (MouseSensitivity != 10) -------
    checked += 1;
    if let Some(sens) = hkcu_string("Control Panel\\Mouse", "MouseSensitivity") {
        if sens != "10" {
            findings.push(Finding {
                id: "mouse.pointer-notch".into(),
                severity: "info".into(),
                title: "Windows pointer speed isn't on the default 6/11 notch".into(),
                cause: "Any notch other than the 6th makes Windows multiply or skip raw mouse counts before they reach the cursor — fine inside raw-input games, but it mangles desktop aim trainers and any title without raw input.".into(),
                fix: "Set the pointer-speed slider to the 6th notch (the default), which is 1:1: Mouse settings > Additional settings > Pointer Options.".into(),
                evidence: Some(format!("MouseSensitivity={sens} (10 = 6/11)")),
                tweak_id: None,
            });
        }
    }

    // ---- Game DVR / background recording --------------------------------
    checked += 1;
    if let Some(en) = hkcu_dword("System\\GameConfigStore", "GameDVR_Enabled") {
        if en == 1 {
            findings.push(Finding {
                id: "gamedvr.on".into(),
                severity: "warn".into(),
                title: "Game DVR background recording is enabled".into(),
                cause: "Game DVR keeps a background capture path alive that spends CPU/GPU cycles recording your gameplay even when you never save a clip — a known background-stutter source.".into(),
                fix: "Turn it off (Settings > Gaming > Captures) or apply the app's Game DVR tweak. Use a dedicated recorder (OBS/ShadowPlay) only when you actually want to record.".into(),
                evidence: Some("GameDVR_Enabled=1".into()),
                tweak_id: Some("ui.gamedvr.disable".into()),
            });
        }
    }

    // ---- Monitor running below its max refresh rate ---------------------
    // A 240Hz panel stuck at 60/120Hz (cable downgrade / Windows default /
    // a profile reset) silently halves motion sampling. Huge, very common.
    checked += 1;
    if let Some(r) = read_primary_refresh() {
        // Only flag a meaningful gap (>5Hz) at the same resolution.
        if r.max_hz > r.current_hz + 5 {
            let big = r.max_hz >= 120 && r.current_hz <= 75;
            findings.push(Finding {
                id: "display.refresh-below-max".into(),
                severity: if big { "critical".into() } else { "warn".into() },
                title: format!(
                    "Monitor is running at {} Hz but supports {} Hz",
                    r.current_hz, r.max_hz
                ),
                cause: "Windows often defaults a high-refresh monitor to 60 Hz after a driver reset or on a weaker cable/port — so you're seeing a fraction of the frames your panel can actually show. It's the most common silent display fault.".into(),
                fix: format!(
                    "Set it to {} Hz: Settings > System > Display > Advanced display > Choose a refresh rate. If {} Hz isn't offered, your cable/port can't carry it at this resolution — use the DisplayPort cable that came with the monitor.",
                    r.max_hz, r.max_hz
                ),
                evidence: Some(format!(
                    "{} Hz now / {} Hz max at {}x{}",
                    r.current_hz, r.max_hz, r.width, r.height
                )),
                tweak_id: Some("display.refresh.maximize".into()),
            });
        } else {
            findings.push(Finding {
                id: "display.refresh-ok".into(),
                severity: "ok".into(),
                title: format!("Monitor is at its max refresh ({} Hz)", r.current_hz),
                cause: String::new(),
                fix: String::new(),
                evidence: None,
                tweak_id: None,
            });
        }
    } else {
        notes.push("Couldn't read the display refresh rate.".into());
    }

    // ---- VBS / HVCI on (CPU hot-path tax, ON by default on Win11) --------
    checked += 1;
    match toolkit::read_vbs_report() {
        Ok(v) => {
            // vbs_status: 2 = enabled & running (Win32_DeviceGuard).
            if v.vbs_status >= 2 || v.hvci_enabled {
                findings.push(Finding {
                    id: "vbs.on".into(),
                    severity: "warn".into(),
                    title: "Virtualization-Based Security / Memory Integrity is running".into(),
                    cause: "VBS/HVCI runs Windows inside a thin hypervisor and checks memory on the CPU's hot path. It's on by default on many Win11 installs and costs a measurable few-to-~10% in CPU-bound games.".into(),
                    fix: "If your anti-cheat doesn't require it (some do — Vanguard/FACEIT), turn off Memory Integrity (Windows Security > Device Security > Core Isolation) and/or apply the app's VBS/HVCI tweak. Tournament Mode can also gate this.".into(),
                    evidence: Some(v.status.clone()),
                    tweak_id: Some("vbs.hvci.disable".into()),
                });
            }
        }
        Err(e) => notes.push(format!("VBS probe failed: {e:#}")),
    }

    // ---- WHEA correctable errors (instability / silicon degradation) -----
    checked += 1;
    match toolkit::read_microcode_report() {
        Ok(m) => {
            if let Some(n) = m.whea_events_30d {
                if n > 5 {
                    findings.push(Finding {
                        id: "whea.errors".into(),
                        severity: "critical".into(),
                        title: format!("{n} hardware (WHEA) errors logged in the last 30 days"),
                        cause: "Correctable WHEA-Logger errors mean the CPU, RAM (EXPO/XMP), or SoC is running on the edge of stability — on an Intel 13th/14th-gen K chip it's also the fingerprint of the known Vmin degradation. They cause random stutters/crashes, not steady FPS loss.".into(),
                        fix: "Back off your most recent overclock/undervolt or RAM EXPO/XMP one step and re-test. On Intel 13/14th-gen, make sure your BIOS + microcode are updated to the stability patch. If it persists, RMA territory.".into(),
                        evidence: Some(format!("{n} WHEA-Logger events / 30 days; {}", m.status)),
                        tweak_id: None,
                    });
                }
            }
        }
        Err(e) => notes.push(format!("WHEA/microcode probe failed: {e:#}")),
    }

    // ---- GPU PCIe link below x16 (slot/riser limiting the card) ----------
    // Compare MAX negotiated width, not idle current (idle ASPM downtrains to
    // x1 on a healthy card — reading current would false-alarm everyone).
    checked += 1;
    match toolkit::read_pcie_links() {
        Ok(links) => {
            if let Some(gpu) = links.iter().find(|l| looks_like_gpu(&l.device)) {
                if let Some(maxw) = gpu.max_width {
                    if maxw < 16 {
                        findings.push(Finding {
                            id: "pcie.gpu-narrow".into(),
                            severity: "warn".into(),
                            title: format!("GPU is on a PCIe x{maxw} link, not x16"),
                            cause: "The card's maximum negotiated lane width is below x16 — usually it's in the wrong/secondary slot, on a riser, or the slot is shared with an M.2 drive. Costs a few % to noticeable FPS depending on the GPU.".into(),
                            fix: "Move the GPU to the top PCIe x16 slot wired straight to the CPU, reseat it, and check BIOS for a slot-bifurcation / M.2-sharing setting that's stealing lanes.".into(),
                            evidence: Some(format!("{}: max x{maxw}", gpu.device)),
                            tweak_id: None,
                        });
                    }
                }
            }
        }
        Err(e) => notes.push(format!("PCIe link probe failed: {e:#}")),
    }

    // ---- Single-channel RAM (one stick) ---------------------------------
    // Honest scope: we can reliably catch "one DIMM"; we CANNOT prove "two
    // sticks in the wrong slots" read-only, so we only flag the 1-stick case.
    checked += 1;
    let dimms = toolkit::read_ram_modules();
    let populated = dimms.iter().filter(|m| m.capacity_gb > 0).count();
    if populated == 1 {
        findings.push(Finding {
            id: "ram.single-stick".into(),
            severity: "critical".into(),
            title: "Only one RAM stick is installed (single-channel)".into(),
            cause: "A single DIMM runs the memory bus in single-channel — roughly half the bandwidth of a matched pair. That's a large, very common FPS / 1%-low loss, especially on iGPUs and Ryzen.".into(),
            fix: "Add a second matching stick (same kit) and populate the dual-channel slots your manual specifies (usually A2+B2 / slots 2+4). Then enable XMP/EXPO.".into(),
            evidence: Some(format!("{populated} DIMM populated")),
            tweak_id: None,
        });
    }

    // ---- Network: Wi-Fi / link speed / local gateway latency ------------
    checked += 1;
    match network_audit::read_network_audit() {
        Ok(net) => {
            let media = net.media_type.unwrap_or_default().to_lowercase();
            let is_wifi = media.contains("11")
                || media.contains("wireless")
                || media.contains("wi-fi")
                || media.contains("wifi")
                || media.contains("wlan");
            if is_wifi {
                findings.push(Finding {
                    id: "net.wifi".into(),
                    severity: "warn".into(),
                    title: "You're playing on Wi-Fi".into(),
                    cause: "Wi-Fi adds jitter and the occasional retransmit even at full bars — variance that breaks the client's prediction and feels like 'laggy hit-reg' even when your average ping looks fine.".into(),
                    fix: "For ranked, plug in Ethernet — it's the single biggest connection upgrade. If you truly can't, be on the 5/6 GHz band right next to the router and turn off the Wi-Fi adapter's power-saving.".into(),
                    evidence: Some(format!("active adapter: {}", net.adapter_name.unwrap_or_else(|| "Wi-Fi".into()))),
                    tweak_id: None,
                });
            }
            if let Some(mbps) = net.link_speed_mbps {
                if mbps > 0 && mbps < 1000 && !is_wifi {
                    findings.push(Finding {
                        id: "net.link-slow".into(),
                        severity: "info".into(),
                        title: format!("Ethernet negotiated at {mbps} Mbps, not 1 Gbps"),
                        cause: "Games only need a few Mbps, so this won't raise your ping — but a wired link training below 1 Gbps almost always means a damaged/cheap cable or a bad port, which can also drop packets.".into(),
                        fix: "Swap to a known-good Cat5e/Cat6 cable and try a different port. It's a cable-health flag, not a bandwidth problem.".into(),
                        evidence: Some(format!("link speed: {mbps} Mbps")),
                        tweak_id: None,
                    });
                }
            }
            if let Some(rtt) = net.gateway_rtt_ms {
                if rtt > 10.0 {
                    findings.push(Finding {
                        id: "net.gateway-slow".into(),
                        severity: "warn".into(),
                        title: format!("High latency to your own router ({rtt:.0} ms)"),
                        cause: "The hop to your own gateway should be ~1 ms wired. Several ms here means the problem is inside your house (Wi-Fi, a powerline adapter, or a saturated link) — before any of it reaches the internet, so it's on you to fix, not the ISP.".into(),
                        fix: "Go wired, drop powerline/MoCA adapters, and make sure nothing on your network is mid-download. Then re-check.".into(),
                        evidence: Some(format!("{rtt:.1} ms to gateway")),
                        tweak_id: None,
                    });
                }
            }
        }
        Err(e) => notes.push(format!("Network probe failed: {e:#}")),
    }

    // ---- Mechanical HDD present (games belong on an SSD) -----------------
    checked += 1;
    if let Some(hdd) = run_ps(
        "(Get-PhysicalDisk | Where-Object MediaType -eq 'HDD' | Select-Object -ExpandProperty FriendlyName) -join '; '",
    ) {
        if !hdd.is_empty() {
            findings.push(Finding {
                id: "storage.hdd-present".into(),
                severity: "info".into(),
                title: "A mechanical hard drive (HDD) is installed".into(),
                cause: "If your competitive games or their shader caches live on a spinning HDD, you get traversal stutter, texture pop-in, longer loads, and late spawns. SSDs/NVMe eliminate it.".into(),
                fix: format!("Make sure your ranked games are installed on an SSD/NVMe, not the HDD ({hdd}). Move the install if needed (Steam/Epic let you move a game between drives)."),
                evidence: Some(format!("HDD: {hdd}")),
                tweak_id: None,
            });
        }
    }

    // ---- Headline + honest scope note -----------------------------------
    let crits = findings.iter().filter(|f| f.severity == "critical").count();
    let warns = findings.iter().filter(|f| f.severity == "warn").count();
    let headline = if crits > 0 {
        format!(
            "{crits} thing{} silently costing you performance — fix {}.",
            if crits == 1 { " is" } else { "s are" },
            if crits == 1 { "it" } else { "them" }
        )
    } else if warns > 0 {
        format!("Config is mostly clean — {warns} thing{} worth tightening.", if warns == 1 { "" } else { "s" })
    } else {
        "Quick scan is clean — no silent config killers found.".into()
    };

    notes.push(
        "This is the fast pre-game scan (config + connection). The Live spot-check catches background apps stealing CPU; the GPU deep scan reads hotspot / VRAM-junction temps. CPU effective-clock/throttle bits and real mouse polling rate need the full session recorder + deep CPU scan (next).".into(),
    );

    MatchScanReport {
        headline,
        findings,
        checked,
        notes,
    }
}

/// GPU deep scan: interpret a LibreHardwareMonitor report for the silent GPU
/// thermal faults users never see — hotspot-vs-edge delta (paste pump-out) and
/// GDDR6X memory-junction throttling (core reads a cool 70C while VRAM throttles
/// at 100C+). GPU sensors come from the UNELEVATED LHM probe (NVAPI/ADL), so no
/// UAC. Pre-RTX-30 / some AMD cards hide hotspot — we degrade gracefully.
pub fn interpret_lhm_gpu(lhm: &toolkit::LhmReport) -> MatchScanReport {
    let mut findings: Vec<Finding> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let mut found_gpu = false;

    for comp in &lhm.components {
        let kind = comp.kind.to_lowercase();
        let name = comp.name.to_lowercase();
        let is_gpu = kind.contains("gpu")
            || name.contains("geforce")
            || name.contains("radeon")
            || name.contains("nvidia")
            || name.contains("arc");
        if !is_gpu {
            continue;
        }
        found_gpu = true;

        let temp = |needle: &str| -> Option<f64> {
            comp.sensors
                .iter()
                .find(|s| s.kind.to_lowercase().contains("temperature") && s.name.to_lowercase().contains(needle))
                .and_then(|s| s.value)
        };
        let core = temp("core").or_else(|| temp("gpu "));
        let hotspot = temp("hot spot").or_else(|| temp("hotspot")).or_else(|| temp("junction"));
        let memjunc = temp("memory junction").or_else(|| temp("vram")).or_else(|| temp("memory"));

        // Hotspot vs edge delta — >20C signals paste pump-out / bad mount.
        if let (Some(c), Some(h)) = (core, hotspot) {
            let delta = h - c;
            if delta >= 20.0 {
                findings.push(Finding {
                    id: "gpu.hotspot-delta".into(),
                    severity: "warn".into(),
                    title: format!("GPU hotspot is {delta:.0}C hotter than the edge sensor"),
                    cause: "A hotspot-to-edge gap above ~20C usually means the thermal paste has pumped out or the cooler isn't mounted evenly — the core is throttling on the hotspot long before the temperature you normally watch looks bad.".into(),
                    fix: "Repaste the GPU (or reseat the cooler / check mounting pressure). A fresh high-quality paste or PTM7950 pad typically drops the delta back under 15C.".into(),
                    evidence: Some(format!("{}: core {c:.0}C, hotspot {h:.0}C (delta {delta:.0}C)", comp.name)),
                    tweak_id: None,
                });
            }
        }
        // GDDR6X memory-junction throttle (rated ~110C, throttles ~95C+).
        if let Some(m) = memjunc {
            if m >= 95.0 {
                findings.push(Finding {
                    id: "gpu.vram-throttle".into(),
                    severity: "critical".into(),
                    title: format!("GPU memory (VRAM) is running hot at {m:.0}C"),
                    cause: "GDDR6X memory throttles its own clock around 95-110C independently of the core — so your FPS drops in long sessions even though the GPU core temp looks fine. It's one of the most overlooked throttles on RTX 3080-class+ cards.".into(),
                    fix: "Improve case airflow (a fan blowing across the back of the card helps a lot), and on a 3080/3090 consider replacing the memory thermal pads. Keep VRAM under ~90C.".into(),
                    evidence: Some(format!("{}: VRAM/memory-junction {m:.0}C", comp.name)),
                    tweak_id: None,
                });
            }
        }
        if findings.is_empty() {
            if let Some(c) = core {
                findings.push(Finding {
                    id: "gpu.temps-ok".into(),
                    severity: "ok".into(),
                    title: format!("{} thermals look healthy ({c:.0}C core)", comp.name),
                    cause: String::new(),
                    fix: String::new(),
                    evidence: hotspot.map(|h| format!("hotspot {h:.0}C")),
                    tweak_id: None,
                });
            }
        }
    }

    if !found_gpu {
        notes.push("No GPU sensors were returned — the bundled hardware monitor may have been blocked by antivirus, or the GPU is older than the sensors expose.".into());
    }
    notes.push("Hotspot & VRAM-junction temps come from NVAPI/ADL (RTX 30/40/50 + RX 6000/7000). Pre-RTX-30 and some cards don't expose them; CPU temps/throttle need the deep CPU scan.".into());

    let crit = findings.iter().any(|f| f.severity == "critical");
    let warn = findings.iter().any(|f| f.severity == "warn");
    let headline = if crit {
        "Your GPU is throttling on a temperature you'd never normally see.".into()
    } else if warn {
        "Your GPU has a thermal issue worth fixing.".into()
    } else {
        "GPU thermals look healthy.".into()
    };

    MatchScanReport {
        headline,
        findings,
        checked: 1,
        notes,
    }
}

/// CPU deep scan: interpret an ELEVATED LibreHardwareMonitor report (WinRing0,
/// needs admin/UAC) for the things `Win32_Processor` lies about — the hottest
/// core temp (thermal-throttle headroom) and an unusually high Vcore. We only
/// flag extremes to avoid false alarms on healthy tuning.
pub fn interpret_lhm_cpu(lhm: &toolkit::LhmReport) -> MatchScanReport {
    let mut findings: Vec<Finding> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let mut found_cpu = false;

    for comp in &lhm.components {
        let kind = comp.kind.to_lowercase();
        let name = comp.name.to_lowercase();
        let is_cpu = kind.contains("cpu")
            || name.contains("ryzen")
            || name.contains("intel")
            || name.contains("core i")
            || name.contains("processor");
        if !is_cpu {
            continue;
        }
        found_cpu = true;

        let max_temp = comp
            .sensors
            .iter()
            .filter(|s| s.kind.to_lowercase().contains("temperature"))
            .filter_map(|s| s.value)
            .fold(f64::MIN, f64::max);
        let vcore = comp
            .sensors
            .iter()
            .find(|s| {
                s.kind.to_lowercase().contains("voltage")
                    && (s.name.to_lowercase().contains("core")
                        || s.name.to_lowercase().contains("vcore")
                        || s.name.to_lowercase().contains("vid"))
            })
            .and_then(|s| s.value);

        if max_temp.is_finite() {
            if max_temp >= 95.0 {
                findings.push(Finding {
                    id: "cpu.thermal".into(),
                    severity: "critical".into(),
                    title: format!("CPU is at {max_temp:.0}C — at or past its thermal limit"),
                    cause: "At TjMax the CPU cuts its own clocks and voltage to protect itself — you lose 1% lows and consistency exactly when a fight loads it up. Usually a cooler that's undersized, badly mounted, or has dried paste.".into(),
                    fix: "Improve cooling: reseat/repaste the cooler, raise the fan curve, or set a conservative undervolt / PBO offset (Curve Optimizer / PL adjustment) to drop temps without losing real performance.".into(),
                    evidence: Some(format!("hottest core {max_temp:.0}C")),
                    tweak_id: None,
                });
            } else if max_temp >= 85.0 {
                findings.push(Finding {
                    id: "cpu.warm".into(),
                    severity: "warn".into(),
                    title: format!("CPU is running warm ({max_temp:.0}C)"),
                    cause: "You've got some headroom left, but a long session or a hot room would push this into throttling.".into(),
                    fix: "Tidy cooling / airflow now (or a light undervolt) so a long ranked set doesn't tip into throttling.".into(),
                    evidence: Some(format!("hottest core {max_temp:.0}C")),
                    tweak_id: None,
                });
            }
        }
        if let Some(v) = vcore {
            if v >= 1.45 {
                findings.push(Finding {
                    id: "cpu.vcore".into(),
                    severity: "warn".into(),
                    title: format!("CPU core voltage is high ({v:.3} V)"),
                    cause: "Sustained high Vcore runs hotter and, over time, accelerates silicon degradation (the Intel 13/14th-gen issue). If you didn't set this, the board's 'auto' is over-volting.".into(),
                    fix: "In BIOS, set a sensible Load-Line Calibration and a modest undervolt / Curve Optimizer negative offset — you keep the clocks at lower voltage and temps.".into(),
                    evidence: Some(format!("Vcore {v:.3} V")),
                    tweak_id: None,
                });
            }
        }
        if findings.is_empty() && max_temp.is_finite() {
            findings.push(Finding {
                id: "cpu.temps-ok".into(),
                severity: "ok".into(),
                title: format!("CPU thermals look healthy ({max_temp:.0}C under this load)"),
                cause: String::new(),
                fix: String::new(),
                evidence: vcore.map(|v| format!("Vcore {v:.3} V")),
                tweak_id: None,
            });
        }
    }

    if !found_cpu {
        notes.push("No CPU sensors came back — the elevated probe needs admin (UAC) + the WinRing0 driver, which some antivirus blocks. Temps shown elsewhere from WMI are motherboard-only, not the cores.".into());
    }
    notes.push("CPU core temp / Vcore come from the elevated hardware monitor (WinRing0). Effective-clock-vs-rated and the exact throttle-reason bits are the next add.".into());

    let crit = findings.iter().any(|f| f.severity == "critical");
    let warn = findings.iter().any(|f| f.severity == "warn");
    let headline = if crit {
        "Your CPU is thermal-throttling — cooling is costing you frames.".into()
    } else if warn {
        "Your CPU has a thermal / voltage issue worth addressing.".into()
    } else {
        "CPU thermals and voltage look healthy.".into()
    };

    MatchScanReport {
        headline,
        findings,
        checked: 1,
        notes,
    }
}

/// Live contention spot-check: a ~1-second sample of which background apps are
/// stealing CPU from the game right now. Per-process CPU is divided by the
/// logical core count (sysinfo reports it summed across cores), so the % is of
/// the whole machine — getting this wrong inflates every reading 4-16x.
pub fn run_live_spotcheck() -> MatchScanReport {
    let ncpu = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1) as f32;
    let self_pid = std::process::id();

    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    std::thread::sleep(std::time::Duration::from_millis(1000));
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    // Per-PID GPU% (3D engine) over the same window, read-only.
    let gpu = read_gpu_by_pid();

    // (pct-of-total-machine-CPU, name_lowercase, display name, pid)
    let mut rows: Vec<(f32, String, String, u32)> = Vec::new();
    for (pid, proc_) in sys.processes() {
        if pid.as_u32() == self_pid {
            continue;
        }
        let pct = proc_.cpu_usage() / ncpu;
        if pct >= 3.0 {
            let name = proc_.name().to_string_lossy().to_string();
            let lc = name.to_lowercase();
            rows.push((pct, lc, name, pid.as_u32()));
        }
    }
    rows.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let sampled = rows.len() as u32;
    let mut findings: Vec<Finding> = Vec::new();
    let mut emitted: HashSet<u32> = HashSet::new();
    let is_rgb = |lc: &str| {
        lc.contains("icue")
            || lc.contains("armoury")
            || lc.contains("aura")
            || lc.contains("mystic")
            || lc.contains("signalrgb")
            || lc.contains("synapse")
            || lc.contains("openrgb")
            || lc.contains("lightingservice")
            || lc.contains("wallpaper")
    };

    for (pct, lc, name, pid) in &rows {
        if findings.len() >= 6 {
            break;
        }
        let (sev, cause, fix): (&str, String, String) = if lc.contains("msmpeng") {
            ("critical",
             "Windows Defender is actively scanning right now — its real-time / scheduled scan competes with the game for CPU and disk and is a classic source of mid-match stutter.".into(),
             "Add your game, shader-cache, and anti-cheat folders to Defender exclusions (Windows Security > Virus & threat protection > Exclusions), and schedule full scans for when you're not playing.".into())
        } else if lc.contains("chrome") || lc.contains("msedge") || lc.contains("firefox")
            || lc.contains("brave") || lc.contains("opera") || lc.contains("vivaldi") {
            ("warn",
             "A web browser is using real CPU in the background — tabs with video/animation or hardware-accelerated WebGL keep working and steal CPU + GPU from your game.".into(),
             "Close the browser (or at least media/streaming tabs) before you queue. If you keep it open for guides, turn off its hardware acceleration.".into())
        } else if lc.contains("discord") {
            ("warn",
             "Discord is using noticeable CPU — usually its hardware-accelerated overlay or an active video/stream in a channel.".into(),
             "Keep it for voice, but turn off Discord's in-game overlay and hardware acceleration (Settings > Advanced) if you don't need them.".into())
        } else if lc.contains("obs") {
            ("warn",
             "OBS is running and encoding — a real CPU/GPU cost while you play.".into(),
             "Only run OBS when you're actually recording/streaming, and use the NVENC (GPU) encoder so it doesn't tax the CPU.".into())
        } else if is_rgb(lc) {
            ("warn",
             "RGB / peripheral / wallpaper software is using real CPU in the background — these are well-known DPC-latency and CPU offenders, and the lighting adds nothing while you play.".into(),
             "Set your lights once, then disable the software's autostart for ranked (the LEDs keep their last state). Apply the app's RGB-autostart tweak.".into())
        } else if lc.contains("onedrive") || lc.contains("dropbox") || lc.contains("googledrive")
            || lc.contains("backup") {
            ("warn",
             "A cloud-sync / backup app is active — if it watches the drive your game streams from, it competes for disk and uplink and causes hitches.".into(),
             "Pause syncing while you play (tray icon > Pause), especially if the game is on the same drive it syncs.".into())
        } else if *pct >= 12.0 {
            ("warn",
             format!("This background app is using {pct:.0}% of your total CPU while you're trying to play — that's contention your game has to fight for."),
             "If you don't need it during a match, close it before you queue.".into())
        } else {
            continue;
        };

        let g = gpu.get(pid).copied().unwrap_or(0.0);
        emitted.insert(*pid);
        let gpu_suffix = if g >= 1.0 {
            format!(" + {g:.0}% GPU")
        } else {
            String::new()
        };
        findings.push(Finding {
            id: format!(
                "live.hog.{}",
                lc.chars().filter(|c| c.is_alphanumeric()).collect::<String>()
            ),
            severity: sev.into(),
            title: format!("{name} is using {pct:.0}% CPU{gpu_suffix} in the background"),
            cause,
            fix,
            evidence: Some(format!("{pct:.0}% of total CPU{gpu_suffix}")),
            tweak_id: if is_rgb(lc) {
                Some("peripherals.rgb-control-apps.autostart-disable".into())
            } else {
                None
            },
        });
    }

    // GPU-only hogs: a background app burning GPU but little CPU (e.g. a
    // browser playing video) that the CPU pass above missed.
    if findings.len() < 6 {
        let mut gpu_rows: Vec<(u32, f32)> = gpu.iter().map(|(p, v)| (*p, *v)).collect();
        gpu_rows.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        for (pid, g) in gpu_rows {
            if findings.len() >= 6 {
                break;
            }
            if pid == self_pid || emitted.contains(&pid) || g < 8.0 {
                continue;
            }
            let name = match sys
                .process(sysinfo::Pid::from_u32(pid))
                .map(|p| p.name().to_string_lossy().to_string())
            {
                Some(n) => n,
                None => continue,
            };
            let lc = name.to_lowercase();
            let known = lc.contains("chrome")
                || lc.contains("msedge")
                || lc.contains("firefox")
                || lc.contains("brave")
                || lc.contains("discord")
                || lc.contains("obs")
                || is_rgb(&lc);
            if !known {
                continue;
            }
            emitted.insert(pid);
            findings.push(Finding {
                id: format!(
                    "live.gpuhog.{}",
                    lc.chars().filter(|c| c.is_alphanumeric()).collect::<String>()
                ),
                severity: "warn".into(),
                title: format!("{name} is using {g:.0}% of your GPU in the background"),
                cause: "This app is doing real GPU work while you play — usually video playback, an overlay, or hardware acceleration. Those are frames the game could have had.".into(),
                fix: "Close it, or turn off its hardware acceleration, before you queue.".into(),
                evidence: Some(format!("{g:.0}% GPU")),
                tweak_id: None,
            });
        }
    }

    if findings.is_empty() {
        findings.push(Finding {
            id: "live.clean".into(),
            severity: "ok".into(),
            title: "No background app is stealing meaningful CPU right now".into(),
            cause: String::new(),
            fix: String::new(),
            evidence: None,
            tweak_id: None,
        });
    }

    let crits = findings.iter().filter(|f| f.severity == "critical").count();
    let warns = findings.iter().filter(|f| f.severity == "warn").count();
    let headline = if crits > 0 {
        "Something is actively stealing resources from your game right now.".into()
    } else if warns > 0 {
        format!(
            "{warns} background app{} using CPU you could give back to the game.",
            if warns == 1 { " is" } else { "s are" }
        )
    } else {
        "Nothing's contending for CPU right now — your background is clean.".into()
    };

    let notes = vec![
        "Live spot-check = a 1-second CPU-contention sample. Per-app GPU usage, network spikes, and a full Start/Stop session recording (throttle + frametime over a whole match) are the next steps.".into(),
    ];

    MatchScanReport {
        headline,
        findings,
        checked: sampled,
        notes,
    }
}

// ── Session recorder: Start before you queue, Stop after the match ───────
// Samples driver-free signals (~every 2s) over a real match, then turns the
// series into a plain-English verdict: did you thermal-throttle, was your
// connection/CPU contended, did anything destabilise (WHEA). Read-only.

struct SessionSample {
    dpc_pct: f32,
    mem_avail_pct: f32,
    gpu_temp_c: Option<f32>,
    gpu_throttling: bool,
}

#[derive(Default)]
struct SessionState {
    samples: Vec<SessionSample>,
    started: Option<Instant>,
    whea_at_start: Option<u32>,
}

static SESSION_RUNNING: AtomicBool = AtomicBool::new(false);
static SESSION: OnceLock<Mutex<SessionState>> = OnceLock::new();
static SESSION_THREAD: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();

fn session_state() -> &'static Mutex<SessionState> {
    SESSION.get_or_init(|| Mutex::new(SessionState::default()))
}
fn session_thread() -> &'static Mutex<Option<JoinHandle<()>>> {
    SESSION_THREAD.get_or_init(|| Mutex::new(None))
}

/// Best-effort GPU temp + throttle via nvidia-smi (no admin). (None, false) if
/// nvidia-smi is missing (AMD/Intel/integrated) or anything fails.
fn read_gpu_quick() -> (Option<f32>, bool) {
    let mut cmd = std::process::Command::new("nvidia-smi");
    cmd.args([
        "--query-gpu=temperature.gpu,clocks_throttle_reasons.active",
        "--format=csv,noheader,nounits",
    ]);
    process_helpers::make_hidden(&mut cmd);
    let out = match cmd.output() {
        Ok(o) if o.status.success() => o,
        _ => return (None, false),
    };
    let s = String::from_utf8_lossy(&out.stdout);
    let line = s.lines().next().unwrap_or("");
    let parts: Vec<&str> = line.split(',').map(|x| x.trim()).collect();
    let temp = parts.first().and_then(|t| t.parse::<f32>().ok());
    let throttling = parts
        .get(1)
        .map(|h| {
            let v = u64::from_str_radix(h.trim_start_matches("0x"), 16).unwrap_or(0);
            // bit 0 (0x1) = GpuIdle, not a problem — mask it out.
            (v & !0x1) != 0
        })
        .unwrap_or(false);
    (temp, throttling)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub running: bool,
    pub elapsed_s: u64,
    pub samples: u32,
}

pub fn session_status() -> SessionStatus {
    let st = session_state().lock();
    SessionStatus {
        running: SESSION_RUNNING.load(Ordering::SeqCst),
        elapsed_s: st.started.map(|s| s.elapsed().as_secs()).unwrap_or(0),
        samples: st.samples.len() as u32,
    }
}

pub fn session_start() -> Result<(), String> {
    if SESSION_RUNNING.load(Ordering::SeqCst) {
        return Err("A session is already recording.".into());
    }
    let whea = toolkit::read_microcode_report()
        .ok()
        .and_then(|m| m.whea_events_30d);
    {
        let mut st = session_state().lock();
        st.samples.clear();
        st.started = Some(Instant::now());
        st.whea_at_start = whea;
    }
    SESSION_RUNNING.store(true, Ordering::SeqCst);
    let handle = std::thread::spawn(|| {
        let mut sys = sysinfo::System::new();
        while SESSION_RUNNING.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(2000));
            if !SESSION_RUNNING.load(Ordering::SeqCst) {
                break;
            }
            sys.refresh_memory();
            let mem_avail_pct = if sys.total_memory() > 0 {
                (sys.available_memory() as f32 / sys.total_memory() as f32) * 100.0
            } else {
                100.0
            };
            let dpc = toolkit::read_dpc_snapshot()
                .map(|d| d.total_dpc_percent)
                .unwrap_or(0.0);
            let (gpu_temp_c, gpu_throttling) = read_gpu_quick();
            session_state().lock().samples.push(SessionSample {
                dpc_pct: dpc,
                mem_avail_pct,
                gpu_temp_c,
                gpu_throttling,
            });
        }
    });
    *session_thread().lock() = Some(handle);
    Ok(())
}

pub fn session_stop() -> MatchScanReport {
    SESSION_RUNNING.store(false, Ordering::SeqCst);
    if let Some(h) = session_thread().lock().take() {
        let _ = h.join();
    }
    let whea_now = toolkit::read_microcode_report()
        .ok()
        .and_then(|m| m.whea_events_30d);

    let st = session_state().lock();
    let n = st.samples.len();
    let mut findings: Vec<Finding> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let duration_s = st.started.map(|s| s.elapsed().as_secs()).unwrap_or(0);

    if n == 0 {
        return MatchScanReport {
            headline: "The session was too short to gather any samples.".into(),
            findings: vec![Finding {
                id: "session.empty".into(),
                severity: "info".into(),
                title: "No samples recorded".into(),
                cause: "The recorder samples about every 2 seconds — start it, play at least a minute, then stop.".into(),
                fix: "Run Start before you queue, play your match, then Stop.".into(),
                evidence: None,
                tweak_id: None,
            }],
            checked: 0,
            notes,
        };
    }

    // GPU thermal throttling during the match.
    let throttle_samples = st.samples.iter().filter(|s| s.gpu_throttling).count();
    let max_gpu = st
        .samples
        .iter()
        .filter_map(|s| s.gpu_temp_c)
        .fold(f32::MIN, f32::max);
    if throttle_samples > 0 {
        let secs = throttle_samples as u64 * 2;
        findings.push(Finding {
            id: "session.gpu-throttle".into(),
            severity: "critical".into(),
            title: format!("Your GPU throttled for ~{secs}s during the match"),
            cause: "The GPU hit a thermal or power limit and cut its clocks mid-match — that's frame drops exactly when the action heats it up.".into(),
            fix: "Improve case airflow / raise the fan curve, and make sure the power limit isn't set low in MSI Afterburner. If only the hotspot is high, repaste (run the GPU deep scan).".into(),
            evidence: Some(format!("{throttle_samples} of {n} samples throttling; peak {max_gpu:.0}C")),
            tweak_id: None,
        });
    } else if max_gpu >= 84.0 {
        findings.push(Finding {
            id: "session.gpu-hot".into(),
            severity: "warn".into(),
            title: format!("GPU ran hot ({max_gpu:.0}C) but didn't throttle"),
            cause: "You're close to the thermal limit — a longer or hotter session would start cutting clocks.".into(),
            fix: "Give it more airflow now so a long ranked set doesn't tip into throttling.".into(),
            evidence: Some(format!("peak {max_gpu:.0}C")),
            tweak_id: None,
        });
    }

    // DPC latency peaks (stutter).
    let max_dpc = st.samples.iter().map(|s| s.dpc_pct).fold(0.0f32, f32::max);
    if max_dpc > 10.0 {
        findings.push(Finding {
            id: "session.dpc".into(),
            severity: "warn".into(),
            title: format!("DPC time spiked to {max_dpc:.0}% during the match"),
            cause: "High deferred-procedure-call time means a driver (often network, storage, or an RGB/audio device) stalled the CPU — felt as micro-stutter and input lag.".into(),
            fix: "Use LatencyMon to find the offending driver, then update it. Killing RGB/peripheral software (see the Live spot-check) often clears it.".into(),
            evidence: Some(format!("peak DPC {max_dpc:.1}%")),
            tweak_id: Some("peripherals.rgb-control-apps.autostart-disable".into()),
        });
    }

    // Memory pressure.
    let min_mem = st
        .samples
        .iter()
        .map(|s| s.mem_avail_pct)
        .fold(100.0f32, f32::min);
    if min_mem < 8.0 {
        findings.push(Finding {
            id: "session.mem".into(),
            severity: "warn".into(),
            title: format!("Free RAM dropped to {min_mem:.0}% during the match"),
            cause: "When free memory runs out, Windows starts paging to disk (hard faults) — the classic 'low CPU but stuttering' feeling, common on 16GB with a browser + Discord open.".into(),
            fix: "Close background apps before you play, or add RAM (32GB is the 2026 comfortable floor for the game + Discord + browser stack).".into(),
            evidence: Some(format!("min free RAM {min_mem:.0}%")),
            tweak_id: None,
        });
    }

    // Instability — new WHEA errors during the session.
    if let (Some(start), Some(now)) = (st.whea_at_start, whea_now) {
        if now > start {
            findings.push(Finding {
                id: "session.whea".into(),
                severity: "critical".into(),
                title: format!("{} new hardware error(s) logged during this match", now - start),
                cause: "Fresh WHEA errors while playing mean your CPU/RAM (EXPO/XMP) or undervolt isn't stable under load — random crashes/stutters, not steady FPS loss.".into(),
                fix: "Back your most recent overclock/undervolt or RAM EXPO/XMP off one step and re-test. On Intel 13/14th-gen, update BIOS/microcode.".into(),
                evidence: Some(format!("WHEA {start} -> {now}")),
                tweak_id: None,
            });
        }
    }

    if max_gpu == f32::MIN {
        notes.push("No NVIDIA GPU temps were available (AMD/Intel/integrated, or nvidia-smi missing) — GPU throttle detection this pass is NVIDIA-only. Use the GPU deep scan for AMD/edge+hotspot.".into());
    }
    notes.push(format!(
        "Sampled {n} times over {duration_s}s. CPU effective-clock/throttle bits and per-frame frametime (CPU-vs-GPU bound) need the deep CPU scan + PresentMon — the next build.",
    ));

    let crits = findings.iter().filter(|f| f.severity == "critical").count();
    let warns = findings.iter().filter(|f| f.severity == "warn").count();
    let headline = if crits > 0 {
        "Your rig didn't hold up — something throttled or destabilised mid-match.".into()
    } else if warns > 0 {
        format!("Mostly fine, but {} thing{} hurt you during the match.", warns, if warns == 1 { "" } else { "s" })
    } else {
        "Your rig held peak the whole match — no throttling, stable memory, low DPC. The bottleneck is elsewhere (settings, network, or aim).".into()
    };

    MatchScanReport {
        headline,
        findings,
        checked: n as u32,
        notes,
    }
}
