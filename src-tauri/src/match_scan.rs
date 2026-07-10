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
    /// research guide id (see src/lib/research.ts) that explains the fix, if one
    /// exists — e.g. a "couldn't read sensors" finding points at the AV-exclusion
    /// guide. Rendered as a deep-link in the finding card.
    #[serde(default)]
    pub guide_id: Option<String>,
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
                    guide_id: None,
                }),
                Some(true) => findings.push(Finding {
                    id: "ram.xmp-on".into(),
                    severity: "ok".into(),
                    title: "RAM is running at its rated XMP/EXPO speed".into(),
                    cause: String::new(),
                    fix: String::new(),
                    evidence,
                    tweak_id: None,
                    guide_id: None,
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
                        guide_id: None,
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
                        guide_id: None,
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
                    guide_id: None,
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
                    guide_id: None,
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
                guide_id: None,
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
                guide_id: None,
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
                guide_id: None,
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
                guide_id: None,
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
                    guide_id: None,
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
                        guide_id: None,
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
                            guide_id: None,
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
            guide_id: None,
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
                    guide_id: None,
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
                        guide_id: None,
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
                        guide_id: None,
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
                guide_id: None,
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
    // Did we read at least one usable GPU temperature? Matching a GPU component
    // but reading no temps must not collapse to a green headline.
    let mut read_signal = false;

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

        let temp = |needle: &str| -> Option<f64> {
            comp.sensors
                .iter()
                .find(|s| s.kind.to_lowercase().contains("temperature") && s.name.to_lowercase().contains(needle))
                .and_then(|s| s.value)
        };
        // A "junction"/"memory" sensor is VRAM, not the core hotspot — only fall
        // back to a bare "junction" reading when it isn't a memory sensor, or we
        // misread VRAM temp as the core hotspot and flag a bogus delta.
        let non_mem_junction = comp
            .sensors
            .iter()
            .find(|s| {
                let n = s.name.to_lowercase();
                s.kind.to_lowercase().contains("temperature")
                    && n.contains("junction")
                    && !n.contains("memory")
                    && !n.contains("vram")
            })
            .and_then(|s| s.value);
        let core = temp("core").or_else(|| temp("gpu "));
        let hotspot = temp("hot spot").or_else(|| temp("hotspot")).or(non_mem_junction);
        let memjunc = temp("memory junction").or_else(|| temp("vram")).or_else(|| temp("memory"));
        if core.is_some() || hotspot.is_some() || memjunc.is_some() {
            read_signal = true;
        }

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
                    guide_id: None,
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
                    guide_id: None,
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
                    guide_id: None,
                });
            }
        }
    }

    if !read_signal {
        notes.push("No GPU sensors were returned — the bundled hardware monitor may have been blocked by antivirus, or the GPU is older than the sensors expose.".into());
        findings.push(Finding {
            id: "gpu.no-signal".into(),
            severity: "unknown".into(),
            title: "Couldn't read GPU temperatures".into(),
            cause: "The hardware monitor returned no GPU temperature sensors. Antivirus may have blocked the bundled monitor from loading, or the card is older than the hotspot/junction sensors the scan reads (pre-RTX-30 / some AMD cards).".into(),
            fix: "If you're on an RTX 30/40/50 or RX 6000/7000 card, add the antivirus exclusion in the linked guide and re-run. On older cards, hotspot/VRAM-junction temps simply aren't exposed.".into(),
            evidence: None,
            tweak_id: None,
            guide_id: Some("winring0-av-exclusion".into()),
        });
    }
    notes.push("Hotspot & VRAM-junction temps come from NVAPI/ADL (RTX 30/40/50 + RX 6000/7000). Pre-RTX-30 and some cards don't expose them; CPU temps/throttle need the deep CPU scan.".into());

    let crit = findings.iter().any(|f| f.severity == "critical");
    let warn = findings.iter().any(|f| f.severity == "warn");
    let headline = if crit {
        "Your GPU is throttling on a temperature you'd never normally see.".into()
    } else if warn {
        "Your GPU has a thermal issue worth fixing.".into()
    } else if !read_signal {
        "Couldn't read your GPU temperatures — thermal state unknown.".into()
    } else {
        "GPU thermals look healthy.".into()
    };

    MatchScanReport {
        headline,
        findings,
        checked: if read_signal { 1 } else { 0 },
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
    // Did we actually read a usable thermal/voltage signal? A CPU component can
    // match yet expose zero sensors (probe ran but WinRing0 didn't load) — that
    // must NOT collapse to a green "healthy" headline.
    let mut read_signal = false;

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

        // Seed with NEG_INFINITY, NOT f64::MIN: f64::MIN is the most-negative
        // *finite* value, so an empty iterator would fold to a finite number
        // and pass the `is_finite()` guards below — rendering a phantom
        // "healthy (-1.8e308C)" reading when no temp sensors came back.
        let max_temp = comp
            .sensors
            .iter()
            .filter(|s| s.kind.to_lowercase().contains("temperature"))
            .filter_map(|s| s.value)
            .fold(f64::NEG_INFINITY, f64::max);
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

        if max_temp.is_finite() || vcore.is_some() {
            read_signal = true;
        }

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
                    guide_id: None,
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
                    guide_id: None,
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
                    guide_id: None,
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
                guide_id: None,
            });
        }
    }

    // Classify WHY no sensors came back so the card gives accurate advice
    // instead of always blaming antivirus. The elevated probe reports the
    // reason in `error` (UAC code 1223, a driver/parse failure, etc.).
    let err_lc = lhm.error.as_deref().unwrap_or("").to_lowercase();
    let uac_denied = err_lc.contains("uac denied") || err_lc.contains("1223");
    let probe_failed = !err_lc.is_empty() && !uac_denied;
    if !read_signal {
        // No-data run: surface an explicit "couldn't read" finding so the UI
        // shows an unknown state instead of an empty (and falsely green) card.
        if uac_denied {
            notes.push("The admin (UAC) prompt was declined, so the elevated probe never ran — no CPU sensors this run.".into());
            findings.push(Finding {
                id: "cpu.no-signal".into(),
                severity: "unknown".into(),
                title: "Couldn't read CPU sensors — the admin prompt was declined".into(),
                cause: "The deep CPU scan needs admin to load WinRing0, the driver that reads core temps and voltages. The Windows admin (UAC) prompt was dismissed or declined, so the probe didn't run.".into(),
                fix: "Re-run the CPU deep scan and click \"Yes\" on the Windows admin (UAC) prompt.".into(),
                evidence: None,
                tweak_id: None,
                guide_id: None,
            });
        } else if probe_failed {
            notes.push("Admin was granted but the elevated probe returned no CPU sensors — usually antivirus blocking the WinRing0 driver from loading.".into());
            findings.push(Finding {
                id: "cpu.no-signal".into(),
                severity: "unknown".into(),
                title: "Couldn't read CPU sensors — the hardware-monitor driver didn't load".into(),
                cause: "Admin was granted, but the WinRing0 kernel driver didn't load — almost always antivirus (Windows Defender included) blocking it, since the same CPU registers are used by some malware. It's a false positive.".into(),
                fix: "Add a Windows Defender / AV exclusion for the hardware-monitor driver (see the linked guide), then re-run the CPU deep scan.".into(),
                evidence: lhm.error.clone(),
                tweak_id: None,
                guide_id: Some("winring0-av-exclusion".into()),
            });
        } else {
            notes.push("No CPU sensors came back — the elevated probe needs admin (UAC) + the WinRing0 driver, which some antivirus blocks. Temps shown elsewhere from WMI are motherboard-only, not the cores.".into());
            findings.push(Finding {
                id: "cpu.no-signal".into(),
                severity: "unknown".into(),
                title: "Couldn't read CPU core temperature or voltage".into(),
                cause: "The deep CPU scan needs admin (UAC) plus the WinRing0 kernel driver. Either UAC wasn't accepted, or your antivirus blocked the driver from loading — so the scan got no core sensors this run.".into(),
                fix: "Re-run the CPU deep scan and accept the UAC prompt. If it still comes back empty, your antivirus is blocking the hardware-monitor driver — add the exclusion in the linked guide, then try again.".into(),
                evidence: None,
                tweak_id: None,
                guide_id: Some("winring0-av-exclusion".into()),
            });
        }
    }
    notes.push("CPU core temp / Vcore come from the elevated hardware monitor (WinRing0). Effective-clock-vs-rated and the exact throttle-reason bits are the next add.".into());

    let crit = findings.iter().any(|f| f.severity == "critical");
    let warn = findings.iter().any(|f| f.severity == "warn");
    let headline = if crit {
        "Your CPU is thermal-throttling — cooling is costing you frames.".into()
    } else if warn {
        "Your CPU has a thermal / voltage issue worth addressing.".into()
    } else if !read_signal {
        if uac_denied {
            "Couldn't read your CPU sensors — the admin (UAC) prompt was declined. Re-run and click Yes.".into()
        } else if probe_failed {
            "Couldn't read your CPU sensors — the WinRing0 driver was blocked (usually antivirus).".into()
        } else {
            "Couldn't read your CPU sensors — thermal state unknown (needs admin + WinRing0).".into()
        }
    } else {
        "CPU thermals and voltage look healthy.".into()
    };

    MatchScanReport {
        headline,
        findings,
        checked: if read_signal { 1 } else { 0 },
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
            guide_id: None,
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
                guide_id: None,
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
            guide_id: None,
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
    /// Raw nvidia-smi `clocks_throttle_reasons.active` bitmask this sample (0 if
    /// no NVIDIA GPU / read failed). Decoded to named flags at Stop.
    gpu_throttle_mask: u64,
    /// CPU effective clock this sample = rated base MHz x (% Processor
    /// Performance / 100). Driver-free (perf counter), so it includes turbo
    /// (>base) and catches throttling (<base under load). None if unreadable.
    eff_clock_mhz: Option<f32>,
    /// Machine-wide CPU utility % this sample — used to only count effective
    /// clock "under load" (idle core-parking downclock is not throttling).
    cpu_util_pct: Option<f32>,
}

/// UDP + NIC error/discard counters — snapshotted at Start and again at Stop.
/// The delta is the packet-LOSS check: loss deletes inputs, latency only delays
/// them. All driver-free, no admin. (Ported from Desktop\fight-capture.)
#[derive(Clone, Default)]
struct NetSnap {
    udp_recv_errors: i64,
    udp_no_port: i64,
    rx_discarded: i64,
    rx_errors: i64,
    tx_discarded: i64,
    tx_errors: i64,
}

#[derive(Default)]
struct SessionState {
    samples: Vec<SessionSample>,
    started: Option<Instant>,
    whea_at_start: Option<u32>,
    /// Path to the PresentMon CSV being captured this session, if a supported
    /// game was found at Start.
    presentmon_csv: Option<String>,
    /// Rated CPU base clock (MHz) from Win32_Processor.MaxClockSpeed — the
    /// reference the effective clock is throttle-checked against.
    base_clock_mhz: Option<f32>,
    /// UDP/NIC error counters captured at Start; deltaed at Stop for loss.
    net_before: Option<NetSnap>,
}

/// Known competitive-game executables we'll point PresentMon at.
const GAME_EXES: &[&str] = &[
    "fortniteclient-win64-shipping.exe",
    "valorant-win64-shipping.exe",
    "valorant.exe",
    "cs2.exe",
    "r5apex.exe",
    "r5apex_dx12.exe",
    "overwatch.exe",
    "cod.exe",
    "modernwarfare.exe",
    "rainbowsix.exe",
    "rocketleague.exe",
    "destiny2.exe",
    "pubg.exe",
    "tslgame.exe",
    "marvel-win64-shipping.exe",
    "discovery.exe",
];

fn find_game_pid() -> Option<u32> {
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    for (pid, p) in sys.processes() {
        let n = p.name().to_string_lossy().to_lowercase();
        if GAME_EXES.iter().any(|g| n == *g) {
            return Some(pid.as_u32());
        }
    }
    None
}

struct FrameStats {
    frames: usize,
    avg_fps: f32,
    low1_fps: f32,
    low01_fps: f32,
    /// Worst single frametime (ms) over the whole capture — the one 100 ms frame
    /// that eats one edit even when the average FPS looks fine.
    worst_ms: f32,
    /// Median frametime (ms), the baseline the spike count is measured against.
    median_ms: f32,
    /// How many frames exceeded ~2x the median frametime (visible hitches).
    spikes_2x: usize,
    /// Dominant PresentMon PresentMode ("Hardware: Independent Flip" = true
    /// fullscreen / lowest latency; "Composed: Flip" = you're not truly
    /// fullscreen and paying input lag for it). None if the column is absent.
    present_mode: Option<String>,
    cpu_bound_pct: f32,
    gpu_bound_pct: f32,
    /// True only when the CSV had MsCPUBusy + MsGPUBusy columns AND at least one
    /// frame was classified. When false, the cpu/gpu bound percentages are
    /// meaningless (no data) and must not be surfaced as a bottleneck verdict.
    bound_measured: bool,
}

/// Parse a PresentMon 2.x CSV: MsBetweenPresents = frametime; MsCPUBusy /
/// MsGPUBusy decide CPU-vs-GPU-bound. Columns are found by header name so a
/// reordering won't break it. None if too few frames were captured.
fn parse_presentmon_csv(path: &str) -> Option<FrameStats> {
    let text = std::fs::read_to_string(path).ok()?;
    let mut lines = text.lines();
    let header = lines.next()?;
    let cols: Vec<&str> = header.split(',').map(|c| c.trim()).collect();
    let idx = |name: &str| cols.iter().position(|c| c.eq_ignore_ascii_case(name));
    let i_ft = idx("MsBetweenPresents")?;
    let i_cpu = idx("MsCPUBusy");
    let i_gpu = idx("MsGPUBusy");
    let i_mode = idx("PresentMode");

    let mut ft: Vec<f32> = Vec::new();
    let mut cpu_bound = 0usize;
    let mut gpu_bound = 0usize;
    let mut mode_counts: HashMap<String, usize> = HashMap::new();
    for line in lines {
        let f: Vec<&str> = line.split(',').collect();
        let frametime = match f.get(i_ft).and_then(|v| v.trim().parse::<f32>().ok()) {
            Some(x) if x > 0.0 && x < 1000.0 => x,
            _ => continue,
        };
        ft.push(frametime);
        if let Some(im) = i_mode {
            if let Some(m) = f.get(im).map(|v| v.trim()).filter(|v| !v.is_empty()) {
                *mode_counts.entry(m.to_string()).or_insert(0) += 1;
            }
        }
        if let (Some(ic), Some(ig)) = (i_cpu, i_gpu) {
            let cpu = f.get(ic).and_then(|v| v.trim().parse::<f32>().ok()).unwrap_or(0.0);
            let gpu = f.get(ig).and_then(|v| v.trim().parse::<f32>().ok()).unwrap_or(0.0);
            if gpu >= frametime * 0.95 {
                gpu_bound += 1;
            } else if cpu > gpu {
                cpu_bound += 1;
            }
        }
    }
    if ft.len() < 30 {
        return None;
    }
    let n = ft.len();
    let avg_ms = ft.iter().sum::<f32>() / n as f32;
    let worst_ms = ft.iter().copied().fold(0.0f32, f32::max);
    ft.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median_ms = ft[n / 2];
    let spikes_2x = ft.iter().filter(|&&x| x > median_ms * 2.0).count();
    let pct = |p: f32| -> f32 {
        let rank = ((p / 100.0) * (n as f32 - 1.0)).round() as usize;
        ft[rank.min(n - 1)]
    };
    let present_mode = mode_counts
        .into_iter()
        .max_by_key(|(_, c)| *c)
        .map(|(m, _)| m);
    let classified = cpu_bound + gpu_bound;
    let bound_total = classified.max(1) as f32;
    Some(FrameStats {
        frames: n,
        avg_fps: 1000.0 / avg_ms,
        low1_fps: 1000.0 / pct(99.0),
        low01_fps: 1000.0 / pct(99.9),
        worst_ms,
        median_ms,
        spikes_2x,
        present_mode,
        cpu_bound_pct: cpu_bound as f32 / bound_total * 100.0,
        gpu_bound_pct: gpu_bound as f32 / bound_total * 100.0,
        bound_measured: i_cpu.is_some() && i_gpu.is_some() && classified > 0,
    })
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

/// Best-effort GPU temp + the raw throttle-reason bitmask via nvidia-smi (no
/// admin). (None, 0) if nvidia-smi is missing (AMD/Intel/integrated) or anything
/// fails. The mask is decoded to named flags at Stop; bit 0x1 (GpuIdle) is
/// benign and stripped there.
fn read_gpu_quick() -> (Option<f32>, u64) {
    let mut cmd = std::process::Command::new("nvidia-smi");
    cmd.args([
        "--query-gpu=temperature.gpu,clocks_throttle_reasons.active",
        "--format=csv,noheader,nounits",
    ]);
    process_helpers::make_hidden(&mut cmd);
    let out = match cmd.output() {
        Ok(o) if o.status.success() => o,
        _ => return (None, 0),
    };
    let s = String::from_utf8_lossy(&out.stdout);
    let line = s.lines().next().unwrap_or("");
    let parts: Vec<&str> = line.split(',').map(|x| x.trim()).collect();
    let temp = parts.first().and_then(|t| t.parse::<f32>().ok());
    let mask = parts
        .get(1)
        .map(|h| u64::from_str_radix(h.trim_start_matches("0x"), 16).unwrap_or(0))
        .unwrap_or(0);
    (temp, mask)
}

/// True if the mask has a *meaningful* throttle bit set (idle / app-clocks /
/// sync-boost / display are benign and ignored).
fn gpu_mask_is_throttling(mask: u64) -> bool {
    // 0x4 SW power cap, 0x8 HW slowdown, 0x20 SW thermal, 0x40 HW thermal,
    // 0x80 HW power brake — the ones that actually cut your clocks.
    (mask & 0x00EC) != 0
}

/// Decode an nvidia-smi throttle-reason mask to human flags, most-serious first.
fn decode_gpu_throttle(mask: u64) -> Vec<&'static str> {
    let mut out = Vec::new();
    if mask & 0x40 != 0 {
        out.push("HW thermal slowdown");
    }
    if mask & 0x20 != 0 {
        out.push("SW thermal slowdown");
    }
    if mask & 0x80 != 0 {
        out.push("HW power-brake slowdown");
    }
    if mask & 0x04 != 0 {
        out.push("SW power cap");
    }
    if mask & 0x08 != 0 {
        out.push("HW slowdown");
    }
    out
}

/// CPU effective-clock inputs, driver-free: (busiest-core % Processor
/// Performance, whole-package % Processor Utility). Performance is relative to
/// the rated base clock and exceeds 100 under turbo, so base x perf/100 is the
/// real (effective) clock — the number HWiNFO calls "Effective Clock". We take
/// the MAX across per-core instances (not `_Total`), because `_Total` averages
/// in idle/parked cores and would underreport the working core's clock — a
/// false throttle. Utility gates "under load" so idle downclock isn't mistaken
/// for throttling.
fn read_cpu_perf() -> Option<(f32, f32)> {
    let script = "$s=(Get-Counter '\\Processor Information(*)\\% Processor Performance','\\Processor Information(_Total)\\% Processor Utility' -ErrorAction SilentlyContinue).CounterSamples; \
$p=($s | Where-Object { $_.Path -like '*performance*' -and $_.InstanceName -ne '_Total' } | Measure-Object -Property CookedValue -Maximum).Maximum; \
$u=($s | Where-Object { $_.Path -like '*utility*' } | Select-Object -First 1).CookedValue; \
\"$p;$u\"";
    let out = run_ps(script)?;
    let mut it = out.split(';');
    let perf = it.next()?.trim().parse::<f32>().ok()?;
    let util = it.next().and_then(|v| v.trim().parse::<f32>().ok());
    Some((perf, util.unwrap_or(0.0)))
}

/// Rated CPU base clock (MHz) from Win32_Processor.MaxClockSpeed — the reference
/// the effective clock is throttle-checked against. None if the WMI read fails.
fn read_base_clock_mhz() -> Option<f32> {
    let out = run_ps(
        "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty MaxClockSpeed)",
    )?;
    out.trim().parse::<f32>().ok().filter(|v| *v > 0.0)
}

/// Snapshot UDP receive-error / no-port counters + summed NIC discard/error
/// counters across the Up, non-virtual adapters. Driver-free, no admin.
fn read_net_snapshot() -> Option<NetSnap> {
    let script = "$u = netstat -s -p udp; $re=0; $np=0; \
foreach ($l in $u) { if ($l -match 'Receive Errors\\s*=\\s*(\\d+)') { $re=[int64]$Matches[1] }; if ($l -match 'No Ports\\s*=\\s*(\\d+)') { $np=[int64]$Matches[1] } } \
$rxd=0; $rxe=0; $txd=0; $txe=0; \
foreach ($a in (Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and -not $_.Virtual })) { $s=Get-NetAdapterStatistics -Name $a.Name -ErrorAction SilentlyContinue; if ($s) { $rxd+=[int64]$s.ReceivedDiscardedPackets; $rxe+=[int64]$s.ReceivedPacketErrors; $txd+=[int64]$s.OutboundDiscardedPackets; $txe+=[int64]$s.OutboundPacketErrors } } \
\"$re;$np;$rxd;$rxe;$txd;$txe\"";
    let out = run_ps(script)?;
    let n: Vec<i64> = out
        .trim()
        .split(';')
        .map(|v| v.trim().parse::<i64>().unwrap_or(0))
        .collect();
    if n.len() < 6 {
        return None;
    }
    Some(NetSnap {
        udp_recv_errors: n[0],
        udp_no_port: n[1],
        rx_discarded: n[2],
        rx_errors: n[3],
        tx_discarded: n[4],
        tx_errors: n[5],
    })
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

pub fn session_start(presentmon_exe: Option<String>, csv_path: String) -> Result<(), String> {
    if SESSION_RUNNING.load(Ordering::SeqCst) {
        return Err("A session is already recording.".into());
    }
    let whea = toolkit::read_microcode_report()
        .ok()
        .and_then(|m| m.whea_events_30d);
    // Rated base clock + a network baseline for the loss check — both cheap,
    // both driver-free. Captured once at Start.
    let base_clock_mhz = read_base_clock_mhz();
    let net_before = read_net_snapshot();

    // If a supported game is running and PresentMon is bundled, start a frametime
    // capture against it (ETW, no injection; PresentMon self-elevates -> one UAC).
    let mut csv_used: Option<String> = None;
    if let Some(exe) = presentmon_exe {
        if std::path::Path::new(&exe).exists() {
            if let Some(pid) = find_game_pid() {
                let _ = std::fs::remove_file(&csv_path);
                let mut cmd = std::process::Command::new(&exe);
                cmd.args([
                    "--process_id",
                    &pid.to_string(),
                    "--output_file",
                    &csv_path,
                    "--stop_existing_session",
                    "--restart_as_admin",
                    "--timed",
                    "5400",
                    "--terminate_after_timed",
                ]);
                process_helpers::make_hidden(&mut cmd);
                if cmd.spawn().is_ok() {
                    csv_used = Some(csv_path);
                }
            }
        }
    }

    {
        let mut st = session_state().lock();
        st.samples.clear();
        st.started = Some(Instant::now());
        st.whea_at_start = whea;
        st.presentmon_csv = csv_used;
        st.base_clock_mhz = base_clock_mhz;
        st.net_before = net_before;
    }
    SESSION_RUNNING.store(true, Ordering::SeqCst);
    let handle = std::thread::spawn(move || {
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
            let (gpu_temp_c, gpu_throttle_mask) = read_gpu_quick();
            // CPU effective clock = base MHz x (% Processor Performance / 100).
            let (eff_clock_mhz, cpu_util_pct) = match read_cpu_perf() {
                Some((perf, util)) => (
                    base_clock_mhz.map(|b| b * perf / 100.0),
                    Some(util),
                ),
                None => (None, None),
            };
            session_state().lock().samples.push(SessionSample {
                dpc_pct: dpc,
                mem_avail_pct,
                gpu_temp_c,
                gpu_throttle_mask,
                eff_clock_mhz,
                cpu_util_pct,
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
                guide_id: None,
            }],
            checked: 0,
            notes,
        };
    }

    // ── Headline #1: throttle flags (GPU reasons + CPU effective-clock drop) ──
    let gpu_or_mask: u64 = st.samples.iter().fold(0u64, |a, s| a | s.gpu_throttle_mask);
    let throttle_samples = st
        .samples
        .iter()
        .filter(|s| gpu_mask_is_throttling(s.gpu_throttle_mask))
        .count();
    let gpu_reasons = decode_gpu_throttle(gpu_or_mask);
    let max_gpu = st
        .samples
        .iter()
        .filter_map(|s| s.gpu_temp_c)
        .fold(f32::MIN, f32::max);
    let gpu_temp_measured = max_gpu != f32::MIN;

    // CPU effective clock: the busiest core's actual clock, minimum while the
    // machine was under load (util >= 15%). Below base under load = throttling.
    let base = st.base_clock_mhz;
    let loaded_eff: Vec<f32> = st
        .samples
        .iter()
        .filter(|s| s.cpu_util_pct.map(|u| u >= 15.0).unwrap_or(false))
        .filter_map(|s| s.eff_clock_mhz)
        .collect();
    let all_eff: Vec<f32> = st.samples.iter().filter_map(|s| s.eff_clock_mhz).collect();
    let eff_measured = !all_eff.is_empty();
    let max_eff = all_eff.iter().copied().fold(0.0f32, f32::max);
    let has_loaded = !loaded_eff.is_empty();
    let min_eff = if has_loaded {
        loaded_eff.iter().copied().fold(f32::MAX, f32::min)
    } else {
        all_eff.iter().copied().fold(f32::MAX, f32::min)
    };
    let cpu_throttled = has_loaded && base.map(|b| min_eff < b * 0.97).unwrap_or(false);

    let mut flags: Vec<String> = Vec::new();
    if cpu_throttled {
        flags.push("CPU (effective clock fell below base under load)".into());
    }
    for r in &gpu_reasons {
        flags.push(format!("GPU {r}"));
    }
    let hw_thermal_or_power = (gpu_or_mask & (0x40 | 0x08 | 0x80)) != 0;
    if !flags.is_empty() {
        let sev = if cpu_throttled || hw_thermal_or_power {
            "critical"
        } else {
            "warn"
        };
        findings.push(Finding {
            id: "session.throttle-flags".into(),
            severity: sev.into(),
            title: format!("Throttle flags tripped: {}", flags.join("; ")),
            cause: "A throttle flag means the CPU or GPU cut its own clocks mid-match to stay inside a thermal or power limit — you lose frames and 1% lows exactly when a fight loads the rig.".into(),
            fix: "Thermal flag: improve airflow / fan curve, repaste (run the GPU or CPU deep scan for the temp behind it). Power flag: check the GPU power limit in Afterburner and the CPU power limits (PL1/PL2) in BIOS.".into(),
            evidence: Some(if throttle_samples > 0 {
                format!("GPU throttling in {throttle_samples} of {n} samples; reasons 0x{gpu_or_mask:X}")
            } else {
                format!("reasons mask 0x{gpu_or_mask:X}")
            }),
            tweak_id: None,
            guide_id: None,
        });
    } else {
        findings.push(Finding {
            id: "session.throttle-flags".into(),
            severity: "ok".into(),
            title: "No throttle flags tripped during the match".into(),
            cause: String::new(),
            fix: String::new(),
            evidence: if !eff_measured && !gpu_temp_measured {
                Some("neither CPU effective clock nor NVIDIA throttle reasons could be read this run".into())
            } else {
                None
            },
            tweak_id: None,
            guide_id: None,
        });
    }

    // ── Headline #2: lowest effective clock under load ──────────────────────
    if eff_measured {
        let base_txt = base.map(|b| format!(", base {b:.0} MHz")).unwrap_or_default();
        let sev = if cpu_throttled { "warn" } else { "info" };
        let load_txt = if has_loaded {
            "under load"
        } else {
            "(no loaded samples this run)"
        };
        findings.push(Finding {
            id: "session.eff-clock".into(),
            severity: sev.into(),
            title: format!("Lowest CPU effective clock {load_txt}: {min_eff:.0} MHz{base_txt}"),
            cause: if cpu_throttled {
                "The busiest core dropped below the rated base clock while the machine was loaded — that's the CPU throttling (thermal or power limit), the thing average FPS never shows.".into()
            } else {
                "The busiest core held at or above its base clock the whole match — the CPU wasn't clock-throttling.".into()
            },
            fix: if cpu_throttled {
                "Chase CPU cooling (reseat/repaste, fan curve) or set a modest undervolt / Curve Optimizer offset, and check BIOS power limits aren't set low. Run the CPU deep scan for the temperature behind it.".into()
            } else {
                "No action — the CPU clock held. If FPS still feels low you're likely CPU-bound at full clock (a faster CPU helps) or the bottleneck is elsewhere.".into()
            },
            evidence: Some(format!("peak {max_eff:.0} MHz, min {min_eff:.0} MHz")),
            tweak_id: None,
            guide_id: None,
        });
    }

    // GPU ran hot but never tripped a throttle flag — a heads-up.
    if throttle_samples == 0 && gpu_temp_measured && max_gpu >= 84.0 {
        findings.push(Finding {
            id: "session.gpu-hot".into(),
            severity: "warn".into(),
            title: format!("GPU ran hot ({max_gpu:.0}C) but didn't throttle"),
            cause: "You're close to the thermal limit — a longer or hotter session would start cutting clocks.".into(),
            fix: "Give it more airflow now so a long ranked set doesn't tip into throttling.".into(),
            evidence: Some(format!("peak {max_gpu:.0}C")),
            tweak_id: None,
            guide_id: None,
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
            guide_id: None,
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
            guide_id: None,
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
                guide_id: None,
            });
        }
    }

    // Frametime + CPU-vs-GPU-bound from PresentMon (the bottleneck truth).
    match st.presentmon_csv.clone().as_deref().and_then(parse_presentmon_csv) {
        Some(fs) => {
            let stutter = fs.low01_fps < fs.avg_fps * 0.5;
            findings.push(Finding {
                id: "session.frametime".into(),
                severity: if stutter { "warn".into() } else { "info".into() },
                title: format!(
                    "Frametime: {:.0} FPS avg, {:.0} FPS 1% low, {:.0} FPS 0.1% low",
                    fs.avg_fps, fs.low1_fps, fs.low01_fps
                ),
                cause: if stutter {
                    "Your 0.1% lows are less than half your average — that's stutter/hitching spikes, the thing you feel even when the FPS counter looks high.".into()
                } else {
                    "Captured per-frame with PresentMon — frame pacing is consistent.".into()
                },
                fix: if stutter {
                    "Chase the stutter sources (DPC, background apps, shader-comp, memory pressure) above — smoothing the lows matters more than raising the average.".into()
                } else {
                    "No action — your frame delivery is even.".into()
                },
                evidence: Some(format!("{} frames captured", fs.frames)),
                tweak_id: None,
                guide_id: None,
            });

            // ── Headline #3: worst single frametime spike ───────────────────
            let worst_fps = if fs.worst_ms > 0.0 { 1000.0 / fs.worst_ms } else { 0.0 };
            let big_spike = fs.worst_ms > 50.0 || fs.spikes_2x > 0;
            findings.push(Finding {
                id: "session.worst-frame".into(),
                severity: if fs.worst_ms > 50.0 {
                    "warn".into()
                } else {
                    "info".into()
                },
                title: format!(
                    "Worst frametime spike: {:.1} ms ({:.0} FPS for that frame)",
                    fs.worst_ms, worst_fps
                ),
                cause: if big_spike {
                    "One long frame in an otherwise smooth graph is what eats a single edit in a single fight — average FPS hides it completely. Line each eaten edit on your recording up against this: on a spike -> the machine; on a flat graph -> the game.".into()
                } else {
                    "No large single-frame spikes — frame delivery stayed tight, so an eaten edit is far more likely the game than the machine.".into()
                },
                fix: if big_spike {
                    "Chase the spike sources below (DPC driver stalls, background apps, shader compilation, memory pressure). Smoothing these matters more than raising the average.".into()
                } else {
                    "No action on frametime — the machine held. If inputs still feel eaten, the cause is upstream (game/netcode), not a local hitch.".into()
                },
                evidence: Some(format!(
                    "median {:.1} ms; {} frame(s) over 2x median",
                    fs.median_ms, fs.spikes_2x
                )),
                tweak_id: None,
                guide_id: None,
            });

            // Present mode — true fullscreen vs composed (added input lag).
            if let Some(mode) = fs.present_mode.as_deref() {
                let composed = mode.to_lowercase().contains("composed");
                findings.push(Finding {
                    id: "session.present-mode".into(),
                    severity: if composed { "warn".into() } else { "ok".into() },
                    title: format!("Present mode: {mode}"),
                    cause: if composed {
                        "\"Composed\" flip means you're not truly fullscreen — the desktop compositor is in the path, adding a frame of input lag. It's a common cost of borderless/windowed or an overlay forcing composition.".into()
                    } else {
                        "\"Independent Flip\" is true fullscreen — the lowest-latency present path, exactly what you want.".into()
                    },
                    fix: if composed {
                        "Use the game's Fullscreen mode (not borderless) where possible, and close overlays that force composition. In Fortnite, fullscreen-windowed is its lowest-lag mode since exclusive fullscreen was removed — verify it flips to Independent Flip here.".into()
                    } else {
                        String::new()
                    },
                    evidence: None,
                    tweak_id: None,
                    guide_id: None,
                });
            }

            if fs.bound_measured {
                let (title, cause, fix) = if fs.cpu_bound_pct >= 60.0 {
                    (
                        format!("You were CPU-bound {:.0}% of the match", fs.cpu_bound_pct),
                        "The GPU sat idle waiting on the CPU most of the time — your CPU is the bottleneck, not the graphics card.".to_string(),
                        "A faster GPU will NOT raise your FPS here. The levers are CPU cooling/clocks, faster + tighter RAM (XMP/EXPO), and the CPU-bound tweaks. See the 'where your next margin is' guide.".to_string(),
                    )
                } else if fs.gpu_bound_pct >= 60.0 {
                    (
                        format!("You were GPU-bound {:.0}% of the match", fs.gpu_bound_pct),
                        "The GPU was saturated most of the time — it's the bottleneck.".to_string(),
                        "Lower a few graphics settings for instant FPS; a faster GPU is the upgrade that actually helps here (unlike a CPU-bound rig).".to_string(),
                    )
                } else {
                    (
                        format!(
                            "Balanced load ({:.0}% CPU-bound / {:.0}% GPU-bound)",
                            fs.cpu_bound_pct, fs.gpu_bound_pct
                        ),
                        "Neither part is a clear bottleneck.".to_string(),
                        "Chase settings + thermals before spending on any upgrade.".to_string(),
                    )
                };
                findings.push(Finding {
                    id: "session.bound".into(),
                    severity: "info".into(),
                    title,
                    cause,
                    fix,
                    evidence: None,
                    tweak_id: None,
                    guide_id: None,
                });
            } else {
                notes.push("CPU-vs-GPU-bound couldn't be computed — this PresentMon capture didn't include the per-frame MsCPUBusy/MsGPUBusy columns.".into());
            }
        }
        None => {
            if st.presentmon_csv.is_some() {
                notes.push("Frametime capture started but produced too few frames (short session, or an anti-cheat blocked the ETW trace).".into());
            } else {
                notes.push("Frametime + CPU/GPU-bound need a supported game running when you hit Start (PresentMon attaches to it, one-time admin prompt). No supported game was detected this session.".into());
            }
        }
    }

    // ── UDP + NIC packet-loss delta (loss deletes inputs; latency only delays) ──
    if let Some(before) = st.net_before.clone() {
        if let Some(after) = read_net_snapshot() {
            let udp_err = (after.udp_recv_errors - before.udp_recv_errors).max(0);
            let udp_np = (after.udp_no_port - before.udp_no_port).max(0);
            let rxd = (after.rx_discarded - before.rx_discarded).max(0);
            let rxe = (after.rx_errors - before.rx_errors).max(0);
            let txd = (after.tx_discarded - before.tx_discarded).max(0);
            let txe = (after.tx_errors - before.tx_errors).max(0);
            let nic_bad = rxd + rxe + txd + txe;
            if udp_err > 0 || nic_bad > 0 {
                findings.push(Finding {
                    id: "session.net-loss".into(),
                    severity: "warn".into(),
                    title: format!(
                        "Packets were lost or errored during the match (UDP errors +{udp_err}, NIC bad +{nic_bad})"
                    ),
                    cause: "Game traffic is UDP: lost or errored packets DELETE inputs outright — unlike latency, which only delays them. Counters climbing during the fight point at the route / cable / adapter, not your ping.".into(),
                    fix: "Go wired with a known-good Cat5e/6 cable into a CPU-direct port, drop powerline/MoCA/Wi-Fi extenders, and update the NIC driver. Re-run to confirm the counters stay flat.".into(),
                    evidence: Some(format!(
                        "UDP recv-err +{udp_err}, no-port +{udp_np}; NIC rx-disc +{rxd} rx-err +{rxe} tx-disc +{txd} tx-err +{txe}"
                    )),
                    tweak_id: None,
                    guide_id: None,
                });
            } else {
                findings.push(Finding {
                    id: "session.net-clean".into(),
                    severity: "ok".into(),
                    title: "No UDP or NIC packet loss during the match".into(),
                    cause: String::new(),
                    fix: String::new(),
                    evidence: Some("no receive errors or adapter discards accrued".into()),
                    tweak_id: None,
                    guide_id: None,
                });
            }
        }
    }

    if max_gpu == f32::MIN {
        notes.push("No NVIDIA GPU temps / throttle reasons were available (AMD/Intel/integrated, or nvidia-smi missing) — GPU throttle detection is NVIDIA-only. Use the GPU deep scan for AMD edge+hotspot.".into());
    }
    if !eff_measured {
        notes.push("CPU effective clock couldn't be read this run (the Windows performance counter was unavailable) — the clock/throttle verdict fell back to GPU-only.".into());
    }
    notes.push(format!(
        "Sampled {n} times over {duration_s}s. GPU throttle reasons come from nvidia-smi (NVIDIA-only); CPU effective clock is the busiest core via Windows perf counters (base {}); frametime, worst spike and present mode come from PresentMon.",
        base.map(|b| format!("{b:.0} MHz")).unwrap_or_else(|| "unknown".into())
    ));

    let crits = findings.iter().filter(|f| f.severity == "critical").count();
    let warns = findings.iter().filter(|f| f.severity == "warn").count();
    let headline = if crits > 0 {
        "Your rig didn't hold up — something throttled or destabilised mid-match.".into()
    } else if warns > 0 {
        format!("Mostly fine, but {} thing{} hurt you during the match.", warns, if warns == 1 { "" } else { "s" })
    } else if !gpu_temp_measured {
        // Clean on what we COULD measure, but GPU throttle was never sampled
        // (NVIDIA-only) — don't claim "no throttling" we didn't observe.
        "Stable memory and low DPC the whole match — no issues in what was sampled. GPU throttle wasn't measured (NVIDIA-only); the bottleneck is likely settings, network, or aim.".into()
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::toolkit::{LhmComponent, LhmReport, LhmSensorReading};

    fn sensor(name: &str, kind: &str, value: f64) -> LhmSensorReading {
        LhmSensorReading {
            name: name.into(),
            kind: kind.into(),
            value: Some(value),
            min: None,
            max: None,
        }
    }

    fn report(components: Vec<LhmComponent>) -> LhmReport {
        LhmReport {
            ok: true,
            elevated: true,
            lhm_version: Some("0.9.6".into()),
            components,
            error: None,
        }
    }

    fn failed_report(err: &str) -> LhmReport {
        LhmReport {
            ok: false,
            elevated: false,
            lhm_version: None,
            components: vec![],
            error: Some(err.into()),
        }
    }

    #[test]
    fn cpu_uac_denied_reports_prompt_not_antivirus() {
        // Elevated probe returns the UAC-denied error (exit code 1223).
        let r = interpret_lhm_cpu(&failed_report("elevated probe exited with code 1223 (UAC denied)"));
        assert_eq!(r.checked, 0);
        let f = r.findings.iter().find(|f| f.id == "cpu.no-signal").unwrap();
        // UAC case must steer to the prompt, NOT an AV exclusion / guide link.
        assert!(f.title.to_lowercase().contains("admin prompt"));
        assert!(f.fix.to_lowercase().contains("yes"));
        assert_eq!(f.guide_id, None, "declining UAC is not an AV problem");
        assert!(r.headline.to_lowercase().contains("uac"));
    }

    #[test]
    fn cpu_probe_failure_blames_driver_with_guide() {
        // Admin granted but the driver/probe failed (e.g. parse/driver-load error).
        let r = interpret_lhm_cpu(&failed_report("couldn't parse elevated LHM output: expected value"));
        assert_eq!(r.checked, 0);
        let f = r.findings.iter().find(|f| f.id == "cpu.no-signal").unwrap();
        assert!(f.fix.to_lowercase().contains("exclusion"));
        assert_eq!(f.guide_id.as_deref(), Some("winring0-av-exclusion"));
        assert!(!r.headline.to_lowercase().contains("uac"));
    }

    // ---- CPU: no-data must NOT read as healthy --------------------------

    #[test]
    fn cpu_no_components_reports_unknown_not_healthy() {
        let r = interpret_lhm_cpu(&report(vec![]));
        assert_eq!(r.checked, 0, "a no-data scan checked nothing");
        assert!(
            r.headline.to_lowercase().contains("couldn't read"),
            "headline must say it couldn't read, got: {}",
            r.headline
        );
        assert!(!r.headline.to_lowercase().contains("healthy"));
        let f = r.findings.iter().find(|f| f.severity == "unknown").unwrap();
        assert_eq!(f.guide_id.as_deref(), Some("winring0-av-exclusion"));
    }

    #[test]
    fn cpu_component_with_no_sensors_reports_unknown() {
        // WinRing0 didn't load: the CPU is named but exposes zero sensors.
        let comp = LhmComponent {
            name: "Intel Core i7-13700K".into(),
            kind: "cpu".into(),
            sensors: vec![],
        };
        let r = interpret_lhm_cpu(&report(vec![comp]));
        assert_eq!(r.checked, 0);
        assert!(r.headline.to_lowercase().contains("couldn't read"));
        assert!(r.findings.iter().any(|f| f.id == "cpu.no-signal"));
    }

    #[test]
    fn cpu_with_healthy_temp_reads_healthy() {
        let comp = LhmComponent {
            name: "AMD Ryzen 7 7800X3D".into(),
            kind: "cpu".into(),
            sensors: vec![sensor("Core (Tctl/Tdie)", "temperature", 62.0)],
        };
        let r = interpret_lhm_cpu(&report(vec![comp]));
        assert_eq!(r.checked, 1);
        assert!(r.headline.to_lowercase().contains("healthy"));
        assert!(r.findings.iter().any(|f| f.severity == "ok"));
    }

    #[test]
    fn cpu_critical_temp_still_flags() {
        let comp = LhmComponent {
            name: "Intel Core i9-14900K".into(),
            kind: "cpu".into(),
            sensors: vec![sensor("Core Max", "temperature", 98.0)],
        };
        let r = interpret_lhm_cpu(&report(vec![comp]));
        assert!(r.findings.iter().any(|f| f.id == "cpu.thermal" && f.severity == "critical"));
    }

    // ---- GPU: no-data must NOT read as healthy -------------------------

    #[test]
    fn gpu_no_components_reports_unknown_not_healthy() {
        let r = interpret_lhm_gpu(&report(vec![]));
        assert_eq!(r.checked, 0);
        assert!(r.headline.to_lowercase().contains("couldn't read"));
        assert!(!r.headline.to_lowercase().contains("healthy"));
        let f = r.findings.iter().find(|f| f.id == "gpu.no-signal").unwrap();
        assert_eq!(f.guide_id.as_deref(), Some("winring0-av-exclusion"));
    }

    #[test]
    fn gpu_with_core_temp_reads_healthy() {
        let comp = LhmComponent {
            name: "NVIDIA GeForce RTX 4080".into(),
            kind: "gpu_nvidia".into(),
            sensors: vec![sensor("GPU Core", "temperature", 65.0)],
        };
        let r = interpret_lhm_gpu(&report(vec![comp]));
        assert_eq!(r.checked, 1);
        assert!(r.headline.to_lowercase().contains("healthy"));
    }

    #[test]
    fn gpu_memory_junction_not_misread_as_core_hotspot() {
        // Card exposes a "GPU Memory Junction" temp but NO core hotspot. The
        // memory junction must not be treated as the hotspot (that produced a
        // bogus hotspot-delta warn). It should still flag the VRAM throttle.
        let comp = LhmComponent {
            name: "NVIDIA GeForce RTX 3090".into(),
            kind: "gpu_nvidia".into(),
            sensors: vec![
                sensor("GPU Core", "temperature", 60.0),
                sensor("GPU Memory Junction", "temperature", 100.0),
            ],
        };
        let r = interpret_lhm_gpu(&report(vec![comp]));
        assert!(
            !r.findings.iter().any(|f| f.id == "gpu.hotspot-delta"),
            "memory junction must not be read as the core hotspot"
        );
        assert!(
            r.findings.iter().any(|f| f.id == "gpu.vram-throttle"),
            "VRAM at 100C should still flag the memory-junction throttle"
        );
    }

    // ---- PresentMon: bound% with no busy columns is not 'balanced' -----

    #[test]
    fn presentmon_without_busy_columns_is_not_measured() {
        let dir = std::env::temp_dir();
        let path = dir.join("optmaxxing_test_no_busy.csv");
        // Header has frametime but NO MsCPUBusy / MsGPUBusy columns.
        let mut csv = String::from("Application,MsBetweenPresents\n");
        for _ in 0..50 {
            csv.push_str("game.exe,6.94\n");
        }
        std::fs::write(&path, csv).unwrap();
        let fs = parse_presentmon_csv(path.to_str().unwrap()).expect("enough frames");
        let _ = std::fs::remove_file(&path);
        assert!(
            !fs.bound_measured,
            "no busy columns means CPU/GPU-bound cannot be claimed"
        );
    }

    #[test]
    fn presentmon_with_busy_columns_is_measured() {
        let dir = std::env::temp_dir();
        let path = dir.join("optmaxxing_test_with_busy.csv");
        let mut csv = String::from("Application,MsBetweenPresents,MsCPUBusy,MsGPUBusy\n");
        for _ in 0..50 {
            // GPU busy ~= frametime -> GPU-bound frames.
            csv.push_str("game.exe,6.94,3.0,6.90\n");
        }
        std::fs::write(&path, csv).unwrap();
        let fs = parse_presentmon_csv(path.to_str().unwrap()).expect("enough frames");
        let _ = std::fs::remove_file(&path);
        assert!(fs.bound_measured);
        assert!(fs.gpu_bound_pct > 90.0, "frames were GPU-bound");
    }

    #[test]
    fn presentmon_reports_worst_spike_and_present_mode() {
        let dir = std::env::temp_dir();
        let path = dir.join("optmaxxing_test_spike.csv");
        let mut csv = String::from("Application,MsBetweenPresents,PresentMode\n");
        for _ in 0..60 {
            csv.push_str("game.exe,6.94,Hardware: Independent Flip\n");
        }
        // One big hitch — the single frame that eats an edit.
        csv.push_str("game.exe,120.0,Hardware: Independent Flip\n");
        std::fs::write(&path, &csv).unwrap();
        let fs = parse_presentmon_csv(path.to_str().unwrap()).expect("enough frames");
        let _ = std::fs::remove_file(&path);
        assert!(fs.worst_ms >= 119.0, "worst single frame captured");
        assert!(fs.spikes_2x >= 1, "the 120ms frame is a >2x-median spike");
        assert_eq!(fs.present_mode.as_deref(), Some("Hardware: Independent Flip"));
    }

    #[test]
    fn gpu_throttle_mask_decodes_named_flags() {
        // 0x1 idle alone is not a throttle; benign bits decode to nothing.
        assert!(!gpu_mask_is_throttling(0x1));
        assert!(decode_gpu_throttle(0x1 | 0x2 | 0x10).is_empty());
        // HW thermal (0x40) + SW power cap (0x4) are real throttles.
        assert!(gpu_mask_is_throttling(0x40));
        let names = decode_gpu_throttle(0x40 | 0x4);
        assert!(names.iter().any(|n| n.contains("HW thermal")));
        assert!(names.iter().any(|n| n.contains("power cap")));
    }
}
