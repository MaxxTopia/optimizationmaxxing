# AMD + Intel CPU features — what to keep, what to disable

## Intel (12th-15th gen, hybrid P+E architecture)

### Hyper-Threading (HT) — 12th-14th gen only
- **Keep ON** for >90% of games.
- Edge case: pre-2020 esports titles (CS:GO, Overwatch 1) gained 1-3% on some chips with HT off. CS2 on 14900K? Leave HT on.
- **15th-gen Arrow Lake (Core Ultra 200S, Lion Cove P-cores) removed Hyper-Threading/SMT entirely** — first mainline Intel desktop without it since Nehalem. There is no HT toggle on these chips, so this advice doesn't apply; nothing to do.

### E-cores
- **Default: keep enabled.** Intel Thread Director routes game threads to P-cores correctly.
- **[Process Lasso](https://bitsum.com/) pin** if you see stutter: pin game .exe to P-cores only via "CPU Affinity → Always". 13900K/14900K = cores 0-15. Our own `/auto-pin → Fortnite → Auto-pick` does the same with no third-party install.
- **Disable in BIOS only as last resort** for pre-Win11 23H2 machines that don't have Thread Director support.
- 15th gen (Core Ultra 200): Thread Director v2 + APO (Application Optimization). Leave E-cores on, install APO.

### Intel APO (Application Optimization)
- **Install it** on supported rigs: **14th-gen K-series (14900K / 14700K / 14600K)** and **Core Ultra 200S / Arrow Lake**. Free — install **Intel APO + the Intel Dynamic Tuning (DSA)** app from the Microsoft Store / intel.com. It feeds the scheduler game-specific thread hints; documented gains run 5-15%, and up to ~24-31% in a few titles.
- **Fortnite is NOT on Intel's official APO game list** — don't go looking for a Fortnite toggle in the APO app, there isn't one. The list (Intel KB 000098266, last reviewed 06/08/2026) covers ~49 titles — CS2, Valorant, Dota 2, League of Legends, R6 Siege, Metro Exodus, etc. — but no Fortnite. If you run those other titles, APO is still a free, native, zero-anti-cheat-risk win that most people never enable; install it and confirm the supported games you play are toggled **ON**.
- **EAC caveat (read this):** Arrow Lake + Windows 24H2 had an EAC freeze/crash with Fortnite on early builds. It's fixed — but only if you're **fully updated**: the Nov 2024 24H2 cumulative + the Jan 2025 Intel microcode. Update Windows + GPU drivers and let EAC self-update before leaning on APO.
- Requires Win11 23H2+.

### Performance Cores Boost / Thermal Velocity Boost
- BIOS-level. Leave on stock unless you've validated thermals at full load (20-min [Cinebench R23](https://www.maxon.net/en/downloads/cinebench-r23-downloads) + 20-min [OCCT](https://www.ocbase.com/)).

### 13th/14th-gen K-series instability — get on the fixed microcode (read this if you own a 13700K/13900K/14700K/14900K)
- **What happened:** Intel confirmed the root cause of the 13th/14th-gen desktop instability was **elevated operating voltage causing a Vmin shift / permanent silicon degradation** on K-series chips — manifesting as crashes, decompression errors, and freezes that get worse over time.
- **The fix:** Intel shipped microcode **0x12B** (which rolls up the earlier 0x125 and 0x129 mitigations) plus the **Intel Default Settings** power profile. A later **0x12F** update further addressed Vmin Shift. Delivered via a **motherboard BIOS update** — there's no in-Windows toggle.
- **Action:** Flash the latest BIOS for your board (check that its release notes cite microcode **0x12B or newer**) and run the **Intel Default** power profile, not the board vendor's unlimited/"performance" preset. Negligible gaming-perf cost.
- **Important:** these stop *further* degradation but **cannot reverse damage already done** — if a chip is already unstable, RMA it. Intel extended the warranty to 5 years for affected SKUs.

## AMD (Zen 3 / 4 / 5)

### Simultaneous Multi-Threading (SMT)
- **Keep ON** for most titles.
- Edge case: some CS2 / R6 testing shows SMT-off winning 5-8% in 1% lows on a few chips. Test both — but this is separate from CCD pinning (below), and on a single-CCD X3D it's the only lever worth touching, not affinity.

### Precision Boost Overdrive (PBO)
- **Enable** in BIOS. Free perf scaling.
- Combine with **Curve Optimizer** (per-core undervolt: -10 to -30 negative offset). Cinebench R23 + OCCT to validate stability.
- 7800X3D / 7950X3D: PBO is locked. Use Curve Optimizer only.

### Core Performance Boost (CPB)
- **Keep ON.** Disabling caps you to base clock — never the right call.

### EXPO / DOCP (memory)
- **Enable** if your kit has EXPO. Stop running JEDEC fallback.
- See RAM Advisor for kit-specific manual targets.

### 3D V-Cache CCD handling — single-CCD vs dual-CCD (people get this backwards)

**Single-CCD X3D (5800X3D / 7800X3D / 9800X3D): do NOTHING. There is only one CCD, and it has the V-Cache, so the game already runs on the cache cores 100% of the time. CCD "pinning" on these chips is placebo** — you can't pin to a CCD that doesn't exist. Anyone selling you an affinity tweak for a 7800X3D is selling you nothing. Just enable EXPO + Curve Optimizer and play. (This corrects older advice, including our own — there is no affinity win here.)

**Dual-CCD X3D (7950X3D / 9950X3D):** 16 cores across 2 CCDs, only one has 3D V-Cache — here routing matters. The stack:
- **CPPC Preferred Cores = Driver** (or Auto) in BIOS.
- Install the **AMD 3D V-Cache Performance Optimizer** driver (ships with the chipset driver).
- **Keep Xbox Game Bar ON** — on Win11 23H2+ it's what flags the foreground game so the scheduler parks the frequency CCD and routes the game to the V-Cache CCD. **Don't disable Game Bar on a dual-CCD X3D.**
- Manual `/auto-pin` (or Process Lasso) to the V-Cache CCD is a **fallback only** if the driver/Game Bar routing misbehaves — not the default.

> For Fortnite specifically: EAC is sensitive to runtime manipulation of the game process. Prefer the native AMD driver + Game Bar routing above; if you must pin, pin the **launcher** and let it inherit, never set a rule directly on `FortniteClient-Win64-Shipping.exe`. See the auto-pin notes in the app.

### Fixed-frequency under-volt for esports (Zen 4 / Zen 5)
- Single-CCD chip: lock all cores to a single clock (e.g. 5.2 GHz on 7700X) + tight FCLK. 0% boost variance = consistent frame times. Costs 5-8% multi-core.

## Both

### Disable Virtualization-Based Security (VBS)
- Adds 5-10% latency to every kernel call. **Off** for gaming. (We have this in the catalog as a tweak.)
- Re-enable temporarily if your job's VPN / corporate IT requires it.

### Disable Microsoft Defender Realtime (with care)
- Real-time scanning runs alongside every PowerShell / process spawn. ~3% sustained CPU.
- **Don't disable globally.** Use Process Exclusions for game directories + folders that game-launcher writes to.

### Disable VMP / SVM in BIOS
- If you don't run Hyper-V, WSL2, Docker Desktop, Vanguard (yes, Vanguard *requires* virtualization off on some chips for fastest path), Sandbox, or Android emulators → **off**.
- If you do, leave on. The tradeoff is real but specific.

## Citations
- Intel APO supported-games list + setup (intel.com support 000098266, last reviewed 06/08/2026 — Fortnite not listed)
- Intel community blog — 13th/14th-gen desktop instability root cause (Vmin shift) + 0x12B microcode mitigation; TechPowerUp / Wccftech corroboration of 0x12B (rolls up 0x125 + 0x129)
- Arrow Lake (Core Ultra 200S) drops Hyper-Threading — PCWorld, Tom's Hardware
- Tom's Hardware — Arrow Lake APO testing; EAC/24H2 Fortnite fix coverage
- AMD PBO whitepaper; AMD 3D V-Cache Performance Optimizer driver notes
- HWBusters + overclock.net — X3D single- vs dual-CCD core-parking / V-Cache routing
- Hardware Unboxed multi-CCD scheduling deep-dives
- Wendell @ Level1Techs Curve Optimizer guides
