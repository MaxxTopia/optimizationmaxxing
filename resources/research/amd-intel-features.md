# AMD + Intel CPU features — what to keep, what to disable

## Intel (12th-15th gen, hybrid P+E architecture)

### Hyper-Threading (HT)
- **Keep ON** for >90% of games.
- Edge case: pre-2020 esports titles (CS:GO, Overwatch 1) gained 1-3% on some chips with HT off. CS2 on 14900K? Leave HT on.

### E-cores
- **Default: keep enabled.** Intel Thread Director routes game threads to P-cores correctly.
- **Process Lasso pin** if you see stutter: pin game .exe to P-cores only via "CPU Affinity → Always". 13900K/14900K = cores 0-15.
- **Disable in BIOS only as last resort** for pre-Win11 23H2 machines that don't have Thread Director support.
- 15th gen (Core Ultra 200): Thread Director v2 + APO (Application Optimization). Leave E-cores on, install APO.

### Intel APO (Application Optimization)
- **Install** on Core Ultra rigs. Free download from Intel. Game-specific scheduler hints, +5-15% on supported titles (CS2, Metro Exodus, R6 Siege at launch).
- Requires Win11 23H2+.

### Performance Cores Boost / Thermal Velocity Boost
- BIOS-level. Leave on stock unless you've validated thermals at full load (20-min Cinebench R23 + 20-min OCCT).

## AMD (Zen 3 / 4 / 5)

### Simultaneous Multi-Threading (SMT)
- **Keep ON** for most titles.
- Edge case: 5800X3D / 7800X3D / 7950X3D — large L3 victim cache; some CS2 / R6 testing shows SMT-off + Process Lasso pin to CCD0 wins 5-8% in 1% lows. Test both.

### Precision Boost Overdrive (PBO)
- **Enable** in BIOS. Free perf scaling.
- Combine with **Curve Optimizer** (per-core undervolt: -10 to -30 negative offset). Cinebench R23 + OCCT to validate stability.
- 7800X3D / 7950X3D: PBO is locked. Use Curve Optimizer only.

### Core Performance Boost (CPB)
- **Keep ON.** Disabling caps you to base clock — never the right call.

### EXPO / DOCP (memory)
- **Enable** if your kit has EXPO. Stop running JEDEC fallback.
- See RAM Advisor for kit-specific manual targets.

### 3D V-Cache CCD pinning
- 7950X3D / 9950X3D: 16 cores split across 2 CCDs, only one has 3D V-Cache. Game Bar + Xbox Game Bar service handles routing on Win11 23H2+. **Don't disable Game Bar** if you have a dual-CCD X3D chip.

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
- Intel APO documentation (intel.com)
- AMD PBO whitepaper
- Hardware Unboxed multi-CCD scheduling deep-dives
- Wendell @ Level1Techs Curve Optimizer guides
