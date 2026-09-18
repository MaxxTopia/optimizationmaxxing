# BIOS readiness per chipset (reviewed 2026-09-17)

optimizationmaxxing treats firmware as a read-only, user-controlled boundary. It can report signals that affect stability, security, tournament eligibility, and scheduler behavior, but it does not write BIOS variables, flash firmware, change voltages, change thermal or power limits, or apply overclock presets.

## Establish a recovery baseline

Before changing anything in firmware, save the board's profile if the vendor supports it and photograph the current pages. Keep the exact board model, BIOS version, CPU, memory kit, and recovery instructions with the backup. Change one setting at a time and be prepared to clear CMOS or restore the vendor profile.

## Cross-platform readiness checks

- Use UEFI/GPT and keep CSM disabled only when the installed OS, GPU, and recovery path support it.
- Keep Secure Boot and TPM 2.0 enabled for competitive environments that require them. Epic's current Fortnite guidance also calls out IOMMU for relevant tournament/security checks; confirm the event's current rules before entering.
- Enable Above 4G Decoding and Re-Size BAR when the board, GPU, firmware, and driver support them. Verify the result in the OS; do not promise a fixed FPS gain.
- Use a stable vendor BIOS with current CPU microcode and release notes. A newer BIOS is not automatically faster if it introduces instability.
- Leave fan control and CPU behavior at vendor defaults while establishing a baseline. A stable temperature and clock trace is more useful than a copied preset.

## Intel desktop platforms

For affected 13th/14th-generation desktop CPUs, use Intel Default Settings and a board BIOS containing current microcode. Intel's current guidance identifies microcode 0x12F or later as the baseline to check. Investigate WHEA errors, crashes, clock instability, and degraded benchmark results before blaming Windows tweaks.

Keep XMP as an optional manufacturer-rated memory profile, not a promise that every CPU and board will train it. Do not use this guide to set SVID offsets, Load-Line Calibration, manual Vcore, fixed ratios, PL1/PL2, ICCMAX, or MultiCore Enhancement. The app never writes those controls.

Intel Application Optimization (APO) is a supported-feature path for specific processors, BIOS/DTT combinations, and games. Intel currently lists the 14900KF as supported and recommends Windows 11 25H2 or later for the feature, but Fortnite is not a current official advanced-game-list guarantee. Leave APO in its supported default path and measure; Advanced Mode can regress a title.

## AMD AM5 platforms

Keep the board on a current stable BIOS/AGESA and use the vendor's default CPPC/3D V-Cache scheduling path. Do not use a copied PBO, Curve Optimizer, SoC-voltage, PPT/TDC/EDC, scalar, or fixed-frequency recipe as a latency tweak. Those are stability and lifespan experiments outside this app's scope.

If you enable a manufacturer-rated EXPO profile, validate it on the actual CPU and board. Do not assume that DDR5-6000, a particular UCLK ratio, or a logical-core range is universal. Dual-CCD X3D routing varies with firmware, driver, and processor topology; optimizationmaxxing does not guess a cache CCD from core numbers.

## What the app can report

The diagnostics and BIOS audit can surface UEFI mode, Secure Boot, TPM, IOMMU, Re-Size BAR, memory speed/profile signals, firmware version, and CPU-specific warnings where Windows exposes them. A value marked unknown is not treated as a pass. A SCEWIN dump is an optional read-only evidence source, not an app-controlled write path.

## Safe competitive baseline

1. Stock, fully patched Windows 11 on a supported branch.
2. Current stable motherboard BIOS and vendor-default CPU settings.
3. Secure Boot, TPM 2.0, and IOMMU verified when required by the game or event.
4. Re-Size BAR verified when supported.
5. Memory at JEDEC or its manufacturer-rated profile, followed by a real stability test.
6. A repeatable Fortnite capture before and after one change; record FPS/1% lows, frametime, DPC/ISR behavior, WHEA, crashes, and eligibility.

## Official references

- [Intel 13th/14th-gen desktop stability guidance](https://www.intel.com/content/www/us/en/support/articles/000102331/processors.html)
- [Intel Application Optimization supported processors](https://www.intel.com/content/www/us/en/support/articles/000095419/processors.html)
- [Intel APO game-support guidance](https://www.intel.com/content/www/us/en/support/articles/000098266/processors.html)
- [Epic Secure Boot and TPM guidance](https://www.epicgames.com/help/c-34254770/c-Trending_0/a17911497?lang=en-US)
- [Epic IOMMU guidance](https://www.epicgames.com/help/c-34254770/c-45529661/a17757744)
