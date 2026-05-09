/**
 * Hardcoded changelog. Surfaced via the What's-New modal on first launch
 * after an upgrade. Keep entries short — bullets, not paragraphs. Newest
 * first. The current app version comes from package.json via Vite.
 */

export interface ChangelogEntry {
  version: string
  date: string
  highlights: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.47',
    date: '2026-05-08',
    highlights: [
      'NEW Cloudflare Worker first-claim ledger — drop a code in DM, friend pastes, code locks to their rig on first activation. No back-and-forth needed.',
      'Worker code at vip-worker/ with 5-step deploy in vip-worker/README.md. Free tier (100k req/day, 100k KV reads/day, 1k KV writes/day) — never going to hit it.',
      'New mint script: scripts/mint-unbound-codes.py — generates fresh random Crockford-base32 codes (16 chars = 80 bits, unguessable) ready to paste in DMs. Run with N to mint a batch: `python scripts/mint-unbound-codes.py 10`.',
      'VipRedemptionPanel now tries online claim first (the new flow), falls back to local HWID-bound HMAC verify if the worker is unreachable — so the older offline scripts/mint-vip-code.py <hwid> path still works as a fallback for high-trust gifts.',
      'New "already claimed by another rig" amber message replaces the generic fail when the worker returns 409 — tells the friend the code is dead and to ask for a fresh one.',
      'Worker URL configurable via OPTMAXXING_VIP_WORKER_URL env var at build time; default points at the workers.dev subdomain shape.',
    ],
  },
  {
    version: '0.1.46',
    date: '2026-05-08',
    highlights: [
      'NEW HWID-bound VIP redemption codes — no backend, no Stripe, no recurring billing. Friend installs the app, copies their HWID fingerprint from a hidden panel, DMs it to me, I run scripts/mint-vip-code.py <hwid> + DM the code back. Friend pastes + activates. Code only works on that exact rig.',
      'Easter-egg trigger: tap the VIP "$8" price on the Pricing page 5 times within 3 seconds → reveals the HWID display + redemption input. Apple-developer-mode pattern; nothing in the UI hints the price is interactive.',
      'Hypixel gold redemption panel — confetti burst on success, shake animation on miss, copyable fingerprint, MAXX-XXXX-XXXX-XXXX-XXXX paste-friendly format with whitespace + lowercase tolerated.',
      'Crockford-style base32 (no I/L/O/U) so codes survive being typed by hand from a phone.',
      'Rust + Python parity-locked: both implementations share the VIP_SECRET constant + algorithm, with a Rust unit test asserting the canonical "32 zeros" HWID produces the exact code Python emits. Drift between the two now fails CI.',
      'useVipStore extended with applyRedemption(code, hwid) — persists code + bound HWID alongside tier. Survives reboots; doesn\'t survive moving to a new rig (HWID changes).',
      '+8 cargo tests for vip module (mint determinism, per-HWID divergence, verify accept/reject, prefix/whitespace tolerance, alphabet sanity, Python parity vector). 32/32 unit tests pass.',
    ],
  },
  {
    version: '0.1.45',
    date: '2026-05-08',
    highlights: [
      'LHM dependency set complete — 27 DLLs bundled (LibreHardwareMonitorLib + HidSharp + RAMSPDToolkit-NDD + DiskInfoToolkit + 23 .NET runtime support libs). Validated end-to-end on a Ryzen 7 2700 + RTX 2070 + WD_BLACK SN770 + Corsair DDR4-3600 + ASRock X570 Steel Legend.',
      'Bundle config switched to glob (resources/lhm/*.dll) so future LHM upgrades do not require itemizing each transitive dep.',
      'Probe-validated sensor coverage: AMD Tctl/Tdie + per-core clocks + per-core load + per-core VID, NVIDIA GPU core temp + hot spot + fan + power + memory clock, NVMe SMART, motherboard zones via Nuvoton SuperIO.',
    ],
  },
  {
    version: '0.1.44',
    date: '2026-05-08',
    highlights: [
      'NEW LibreHardwareMonitor-backed Live Thermals. Real CPU package + per-core temps, GPU core/memory clocks + power + fan, NVMe SMART, motherboard zones, fan RPMs, voltage rails. v0.9.6 LHM bundled (~1.5 MB).',
      'Two-tier probe: unelevated user-mode probe runs every 2.5 s automatically (gets ACPI + GPU + SMART). "Enable full sensor access (UAC)" button fires the elevated probe — loads WinRing0 kernel driver, unlocks CPU package + voltage rails. Persists preference for next launch.',
      'Throttle banner fires automatically when any CPU sensor ≥ 95 °C, package ≥ 90 °C, or any GPU temp ≥ 88 °C.',
      'Fallback path: if LHM bundle fails (AV blocking the driver), card auto-falls-back to the v0.1.43 WMI + nvidia-smi probe so users still get something useful.',
      'NEW troubleshooting guide: "AV blocking WinRing0 / LHM" with Add-MpPreference snippet for Defender + notes for Bitdefender/Kaspersky/ESET/CrowdStrike. Linked from the Live Thermals error fallback.',
      'Per-component tile layout — CPU tile leads with package KPI + load + power + per-core breakdown details; each GPU gets its own tile with core+mem clocks; storage tile shows SMART temp + wear; motherboard sensors top-8.',
    ],
  },
  {
    version: '0.1.43',
    date: '2026-05-08',
    highlights: [
      'NEW Live Thermals + Throttle Watch on /toolkit — refreshes every 2 s. ACPI motherboard zones, NVIDIA GPU temp / clock / power / fan / utilization (via nvidia-smi), CPU live MHz vs base ratio. Banners red when thermal throttle is suspected.',
      'CPU throttle detection: surfaces "% of max frequency" from Win32_PerfFormattedData_Counters_ProcessorInformation; flags red if any thermal zone ≥ 80 °C while CPU runs < 90% of max.',
      'GPU throttle reasons decoded: nvidia-smi clocks_throttle_reasons.active hex bitmask → human-readable labels (sw power cap, hw thermal slowdown, hw power brake, etc.).',
      'NEW 8311 X-ONU-SFPP stick monitor on /toolkit — fetches the 8311 community firmware metrics endpoint (default https://192.168.11.1/cgi-bin/luci/8311/metrics), shows live temperature / TX/RX optical power / voltage / bias / PON state. Amber pill at 55 °C, red at 60 °C (pon.wiki recommends active cooling above 60 °C).',
      'Self-signed TLS tolerated for the LuCI cert. Auto-refresh toggle. Persists URL to localStorage. Raw JSON viewable for firmware-version debugging.',
      'Old "Live thermal probes" 28 °C ACPI-only card replaced. Disk Cleanup card unwrapped from the broken 2-column grid that left an empty right pane after extraction.',
      '+4 cargo tests for the 8311 metrics parser (typical shape, nested fields, string-with-units, parse-error fallback). 24/24 unit tests pass.',
    ],
  },
  {
    version: '0.1.42',
    date: '2026-05-08',
    highlights: [
      'NEW Dashboard Quick Start — first-run 3-card walkthrough (pick your game / apply preset / tune later) with deep-link to /tweaks?game=<id>. Dismissible; reappears on major upgrades.',
      'NEW /guides page — curated articles moved out of /toolkit footer into a dedicated route with per-game chip filter, search, and an "include advanced (SCEWIN / overclocks)" toggle. Old Toolkit section now redirects.',
      'Per-game callouts on every guide — pick Fortnite + see "For Fortnite:" line at the top of every relevant article. Article cards expose all callouts inline when expanded.',
      'NEW guide: lightweight Windows distros — Atlas / X-Lite / Tiny11 / Ghost Spectre / ReviOS compared side-by-side. Anticheat compat, update story, idle RAM, recommended-for. Includes our verdict on whether to build a maxxer-OS (not yet).',
      'NEW guide: BIOS + tweaks vs tournament rules — Fortnite (FNCS/EAC), Valorant (Vanguard/VCT), CS2 (VAC), Warzone (Ricochet+BattlEye). Maps every catalog tweak to per-anticheat verdicts.',
      'NEW guide: SCEWIN advanced track — read-only BIOS export workflow for diagnostics + before-you-flash backup. Article-only; we never auto-edit BIOS at runtime.',
      'gaming-mice guide rewritten with current ProSettings.net data (650+ Valorant pros, 328 Fortnite pros, May 2026): the "every pro uses 1600 DPI" myth is out — 800 is dominant in Val + Fortnite, 400 in CS2. Cited per-genre.',
      'Latency probe heads-up — first-run banner explains the brief flash so it doesn\'t feel broken. Persists optmaxxing-latency-probe-seen.',
      'Motion tokens (--motion-snap / --motion-arc / --motion-glow) — applied uniformly across all 5 themes. Per-theme tone via glow speed: Sonic kinetic, BO3 Zombies + DMC heavy, Val + Akatsuki neutral.',
      'surface-card hover-lift (1 px) for TikTok-pace responsiveness. Reduced-motion preference respected.',
    ],
  },
  {
    version: '0.1.41',
    date: '2026-05-08',
    highlights: [
      'NEW Akatsuki theme — cloud-red on void with Sharingan-gold accents and Cinzel display serifs. Brings the theme count to 5 (val · sonic · dmc · bo3 · akatsuki).',
      'BO3 theme reworked into BO3 Zombies — Pack-a-Punch gold + blood maroon + Origins-crypt black + parchment text + Pirata One serif headings + faint blood-drip text-shadow. The orange/olive corporate read is gone.',
      'Val theme polished — desaturated red, deeper base, sharper borders, tactical heading weight. No more candy-red plastic.',
      'NEW maxxer suite sidebar — ported wholesale from maxxtopia.com so the desktop app reads as the same product family. Indigo "fidget orb" close button with breathing pulse + smoke trail, click-zap electricity ripple in each product\'s accent, "Banish/Unleash the Menu" DMC tooltip, Sharingan-gold M brand mark.',
      '7 maxxer products in the rail (optimizationmaxxing, discordmaxxer, clipmaxxer, dropmaxxer, aimmaxxer, viewmaxxing, editmaxxing) with per-product accents + lock overlays for "coming soon".',
      'Heading fonts now load Pirata One + Cinzel + Cormorant Garamond + Metal Mania from Google Fonts on first launch (graceful fallback to system serifs offline).',
    ],
  },
  {
    version: '0.1.40',
    date: '2026-05-08',
    highlights: [
      'NEW per-game tweak filter — Tweaks page gains a Game chip row (Fortnite / Valorant / CS2 / Apex / Warzone / osu / OW2). Universal tweaks always show; tagged ones show only when their game is picked.',
      'NEW Tournament-eligibility flagging — high-risk tweaks (HVCI off, Hyper-V off, Spectre mitigations off) carry a per-game ⚠ pill and a "hide tournament-breaking" filter when a game is selected.',
      'NEW Risk legend — click the ? next to the Risk filter to see what 1/2/3/4 actually mean (Safe / Standard / Expert / Extreme). Hover any chip for the same.',
      'VIP badges restyled with a Hypixel-gold gradient + crown so locked tweaks read as locked at a glance instead of as another accent chip.',
      'NEW in-app Bufferbloat probe — runs a 30 MB Cloudflare /__down stream while pinging 1.1.1.1, scores idle vs loaded p50 with an A–F grade. External Waveform / DSLReports / fast.com / Ookla links demoted to a "deeper test" footer.',
      'No more flashing cmd windows — every PowerShell / ping / bcdedit probe now runs with CREATE_NO_WINDOW. Latency Probe + Bufferbloat + PCIe link + DPC + Session suspend are all silent.',
      'Centralized Game registry at src/lib/games.ts — single source of truth for tweak filtering, Session profiles, and (Phase 4) per-guide callouts.',
    ],
  },
  {
    version: '0.1.39',
    date: '2026-05-08',
    highlights: [
      'NEW Game Session mode — pick the game you\'re playing today (Fortnite / Valorant / CS2 / osu / Custom), see every competing launcher / voice / music / overlay running, hit Start to suspend them all',
      'Suspend-Process freezes them in RAM — no CPU, no IO, instant resume on End Session',
      'Per-game keep-list: Epic stays alive when you pick Fortnite, Vanguard + Riot stack stay alive for Valorant, Steam stays alive for CS2',
      'Force-resume-by-name recovery for stuck-suspended processes after a crash',
    ],
  },
  {
    version: '0.1.38',
    date: '2026-05-08',
    highlights: [
      '3 new fiber-aware NIC offload tweaks: net.nic.rsc.disable, net.nic.checksum-offload.disable, net.nic.lso.disable — let the CPU handle packet work for tighter frametimes',
      'Renamed Ultimate Performance plan → "DT Tournament" with explicit thermal-limits-still-active note',
      'New Recommended Gear research article — mouse / keyboard / pad / monitor / network framework, no affiliate links',
    ],
  },
  {
    version: '0.1.37',
    date: '2026-05-07',
    highlights: [
      'Launch splash screen — transparent 360×360 squircle with the lightning bolt + neon-blue ripple sweeping vertically through the bolt path',
      'Closes when the React app finishes mounting (1.2s minimum so the animation gets one full sweep) — 5s self-close fallback if the main window never wakes',
      'Tauri 2 splash via separate window definition; main window starts hidden, Rust close_splashscreen command swaps them',
    ],
  },
  {
    version: '0.1.36',
    date: '2026-05-07',
    highlights: [
      'New brand mark — pink-magenta squircle with white lightning bolt (the lightning-bolt-in-square design from discordmaxxer\'s earlier era)',
      'Replaced ICO + 3 PNG sizes (32×32, 128×128, 256×256) + SVG, fixed broken /vite.svg favicon reference in index.html',
    ],
  },
  {
    version: '0.1.35',
    date: '2026-05-07',
    highlights: [
      'Research-driven mega-batch — 4 parallel research agents, every claim cited, then ship',
      'NEW Diagnostics cards: Intel 13/14gen Microcode (Vmin Shift Instability detector vs 0x12B floor) + VBS Status (BCD + HVCI + Win32_DeviceGuard tri-probe)',
      'Live DPC sparkline with 1-Hz toggle — 60s rolling window with 5% threshold reference line',
      'Catalog 68 → 87: HID priority (mouse + keyboard ThreadPriority=31 + queue size 20), VBS HVCI registry disable, IFEO CpuPriorityClass=High for Fortnite/Valorant/CS2, 9 service kills (WerSvc, MapsBroker, RetailDemo, Fax, WMP-Net, Geolocation, Smart Card x3, Biometric, TabletInput), 13 scheduled-task batch disable (Compat Appraiser, CEIP, Maps, Feedback, WER), MSI mode PS enumeration on Display+Net+AudioEndpoint with hard exclude of storage/xHCI',
      'NEW Clean State Gaming community preset (🛡) bundling 19 of the above',
      'Honest non-shippers: IFEO Affinity is folklore (does not work). Realtime priority causes input starvation. CRU is too risky for one-click. NVPI/DDU need Phase 4d-v2 ExternalToolInvoke.',
    ],
  },
  {
    version: '0.1.34',
    date: '2026-05-07',
    highlights: [
      'New Latency Probe on Toolkit — 6 curated gaming-relevant ping targets (Cloudflare, Google, Epic, Riot NA/EUW/KR) + custom-host slot for game-server IP from netstat',
      'New PCIe Link card on Diagnostics — flags GPU running below max width (x8 instead of x16) or below max gen, with ASPM caveat copy',
      'New AMD UCLK warning on Diagnostics — heuristic flag if Ryzen 7000 RAM > 6400 MT/s likely fell into 1:2 mode (or Ryzen 5000 > 3800 MT/s lost FCLK 1:1)',
      'New Discord low-FPS research article — 4 manual toggles + why we can\'t automate it (Discord uses binary leveldb prefs)',
    ],
  },
  {
    version: '0.1.33',
    date: '2026-05-07',
    highlights: [
      'Audit-deferral correctness pass — every UX/edge-case flag from the 3-agent audit shipped',
      'DPC measurement: migrated to ProcessorInformation class (per-NUMA / per-CCD breakdown on hybrid Intel + dual-CCD Ryzen)',
      'DPC card: warming-up badge for first read; auto-retry after 1.5s if all-zero',
      'NIC tweaks: replaced -ErrorAction SilentlyContinue with probe-and-log to %LOCALAPPDATA%\\optmaxxing\\nic-tweak.log so users can verify which adapters actually accepted each property',
      'New formFactor target: laptop-hostile tweaks (core-parking, PCIe ASPM, USB-3 link-power, dynamic-tick, power-throttling) now gated to desktop only',
      'FileWrite revert: pins apply-time resolved path in pre-state so env-var changes between apply/revert can\'t restore to the wrong file',
      'registry::delete_value now propagates permission errors instead of swallowing all',
      'is_user_profile_path no longer trusts %TEMP%/%TMP% (could redirect outside profile)',
      'Preview drawer: surfaces "one-way" actions (subkey-delete + PowershellScript with revert: null) prominently before apply',
    ],
  },
  {
    version: '0.1.32',
    date: '2026-05-07',
    highlights: [
      'AUDIT-DRIVEN CORRECTNESS PASS — 3 research agents validated every tweak against Microsoft Learn + community sources',
      'Removed 10 placebos / folklore entries (catalog 78 → 68 honest tweaks): bcd.useplatformtick, bcd.clockres.0.5ms, MaxFreeTcbs, GlobalMaxTcpWindowSize, Tcp1323Opts, DefaultTTL, MaxUserPort, TcpTimedWaitDelay, IRPStackSize, bcd.hpet-device duplicate',
      'Fixed 2 actively wrong tweaks: ui.zone-warning.disable (value 1 → 2 to actually strip MOTW), ui.mouse.disable-shadow (now writes Desktop\\MouseShadow not Cursors\\Scheme Source)',
      'Fixed 2 revert bugs: power.pcie.link-state.off restores AC=1 (was 2), net.nic.flow-control falls back through 4 vendor-spelled values',
      'Rebuilt Network Low-Latency preset around tweaks that actually move the needle on Win10/11 (NIC interrupt mod, RSS, hosts blocks)',
      'Trimmed Frame Pacing to 6 verified-real BCD tweaks; Tournament FPS to 6 entries (dropped placebo + duplicate)',
      'Updated rationales for priority-separation, cpu-mitigations (only Spectre v2 + Meltdown not MDS), windows-spotlight (CloudContent not lock-screen), telemetry (Enterprise-only caveat)',
    ],
  },
  {
    version: '0.1.31',
    date: '2026-05-07',
    highlights: [
      'New FileWrite engine action variant — catalog can now ship file-level tweaks (Engine.ini, GameUserSettings.ini, .nip profiles, .cfg overrides)',
      'Snapshot-backed revert: prior file bytes captured base64 (≤1 MB), restored byte-perfectly',
      'Path env-var expansion: %USERPROFILE% / %APPDATA% / %WINDIR% / etc.',
      'User-profile paths apply unelevated; system paths route through the existing one-UAC batch',
      'Phase 4d-v2 milestone — ExternalToolInvoke (NVIDIA Profile Inspector + ParkControl + msi-util) deferred until we have signed bundled binaries',
    ],
  },
  {
    version: '0.1.30',
    date: '2026-05-07',
    highlights: [
      'New DPC + Interrupt Time card on Diagnostics — measurable before/after for every preset',
      'Save baseline → apply preset → Refresh → see exactly which way the needle moved',
      'Healthy-rig threshold lines (green ≤2% · neutral 2-5% · red >5%) so you can tell at a glance whether a driver is misbehaving',
      'This is the differentiator: every other tweak utility applies and asks you to trust them. We measure.',
    ],
  },
  {
    version: '0.1.29',
    date: '2026-05-07',
    highlights: [
      'Catalog 70 → 78: 8 deepest-impact latency tweaks pros run that no other tuner ships',
      'NIC: Interrupt Moderation off · Flow Control off · RSS forced on (PowerShell, all up-physical adapters)',
      'CPU: Core Parking disabled (powercfg, no third-party tool) · TCP window cap',
      'Power: PCIe ASPM off · USB-3 Link Power Mgmt off (reveal + disable in one)',
      'Timer: device-side HPET disable (Service Start=4) — pairs with bcd.useplatformclock',
      'New "Tournament FPS" community preset bundles all 8 — one UAC, fully reversible',
    ],
  },
  {
    version: '0.1.28',
    date: '2026-05-07',
    highlights: [
      'New "Scan rig state" on Tweaks page — compares every tweak\'s current registry/BCD value against its target so you can see which are already set vs which would change',
      'Per-row state badge: ✓ already set · ◐ partial match · ✗ would change · ? unknown (PowerShell)',
      'Expanded TweakRow now shows a per-action breakdown: "Currently 1, target 0", etc.',
      'New "On-rig" filter — show only tweaks that already match, would change, or are partial',
    ],
  },
  {
    version: '0.1.27',
    date: '2026-05-07',
    highlights: [
      'New Diagnostics page — one-shot rollup of rig + live CPU/RAM + temps + disk-free with Copy-snapshot for Discord support posts',
      'Landing site refreshed to v0.1.27 stats (70 tweaks, 10 presets)',
    ],
  },
  {
    version: '0.1.26',
    date: '2026-05-07',
    highlights: [
      'Changelog page now reachable from the in-app nav (was direct-URL-only)',
      'Rig targeting expanded to 26/70 tweaks — OS-build floors on FSE, Power Throttling, Ultimate Performance, Bing-in-Start, Modern Standby, Storage Sense, Cloud Clipboard',
    ],
  },
  {
    version: '0.1.25',
    date: '2026-05-07',
    highlights: [
      'Catalog now 70 tweaks: + Wake Timers, News-and-Interests, Storage Sense, Snap Layouts hover, Cloud Clipboard',
      '/changelog page route — full version history',
      'Dashboard score-blocker hint: "Lift the score: try <preset>"',
      'Compare matrix gains free-text search; Preview KindChip glyphs (🔑 🗝 ⚙ ⌨); Community preset glyphs (🔋 🎨 🎥 🏆 🌙)',
      'web-landing/ sitemap.xml + robots.txt for indexability',
    ],
  },
  {
    version: '0.1.23',
    date: '2026-05-07',
    highlights: [
      'New Calm Mode community preset — bundles every Win10/11 annoyance kill (Recall, Spotlight, Sticky Keys, transparency, autostart pile-up)',
      'OG image scaffolding (web-landing/og.html → og.png) for social sharing',
    ],
  },
  {
    version: '0.1.21',
    date: '2026-05-07',
    highlights: [
      'Expandable TweakRow — click to see Rationale / Risk explanation / Source',
      'Recently Applied card on Dashboard',
      'Compare Presets matrix modal',
      'Preset glyphs across the UI (⚡ 🎯 🎬 ⏱ 🌐)',
    ],
  },
  {
    version: '0.1.20',
    date: '2026-05-07',
    highlights: [
      'Suggest a Tweak modal on Tweaks page — copy-as-message, email, Discord (when wired)',
      'Tweaks Preview drawer redesign — per-action cards with Before → After value boxes (replaces raw JSON)',
    ],
  },
  {
    version: '0.1.19',
    date: '2026-05-07',
    highlights: [
      'What\'s-New modal on first launch after upgrade — shows new entries since you last opened the app',
    ],
  },
  {
    version: '0.1.18',
    date: '2026-05-07',
    highlights: [
      'New Tune Score on Dashboard — 0-100 health grade with Stock / Lukewarm / Tuned / Tournament tiers',
      'Apply All Recommended button — batches every visible recommendation into one UAC',
    ],
  },
  {
    version: '0.1.17',
    date: '2026-05-07',
    highlights: [
      '4 bundled community presets — Laptop Tuning, iGPU Rig, Streamer Plus, Competitive FPS Pure',
      'Browse community button on Presets page — one-click import per preset',
    ],
  },
  {
    version: '0.1.16',
    date: '2026-05-07',
    highlights: [
      'Custom Preset Builder — pick any tweaks from the catalog, name + describe, save locally',
      'Export / Import as JSON for sharing presets with friends',
      'Landing site refreshed to v0.1.16 stats',
    ],
  },
  {
    version: '0.1.15',
    date: '2026-05-07',
    highlights: [
      'Catalog 60 tweaks: + Discord/Steam autostart-kill, + Bing-in-Start disable',
      'Per-tweak rig targeting (15 entries tagged) — recommendations sharpen per CPU/RAM/OS-build',
    ],
  },
  {
    version: '0.1.13',
    date: '2026-05-07',
    highlights: [
      '+5 tweaks from LLM extraction pass-3 — Driver Auto-Updates, SmartScreen, Zone Warning, MPO, Win11 Windowed-Game-Opt',
      'New Recommended Tweaks card on Dashboard — top 6 unapplied that match your rig',
    ],
  },
  {
    version: '0.1.11',
    date: '2026-05-06',
    highlights: [
      'Restore Point on Settings — one-click bulk revert under a single UAC',
      'Tweaks page gains free-text search + risk / admin / state filters',
    ],
  },
  {
    version: '0.1.9',
    date: '2026-05-06',
    highlights: [
      'PowerShell action engine — vetted scripts via base64-utf16-le encoding for cmd.exe safety',
      '+3 PowerShell tweaks: MMAgent compression off, Ultimate Performance scheme, Hibernation off',
    ],
  },
  {
    version: '0.1.6',
    date: '2026-05-06',
    highlights: [
      'BcdeditSet engine + 5 boot-store tweaks (TSC sync, hypervisor off, useplatformclock, etc)',
      'New Frame Pacing preset bundling boot-time timer overhauls',
    ],
  },
]
