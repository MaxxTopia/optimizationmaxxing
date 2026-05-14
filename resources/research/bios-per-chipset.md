# BIOS settings per chipset (curated 2026)

**Refuse to write BIOS in software. We tell you what to flip; you flip it manually after a backup.**

## Always: backup BIOS first
Boot into BIOS → look for "Save Profile" / "Backup CMOS" / "Export to USB". Save before *any* change. Re-flashing or fix-CMOS-via-clear-jumper costs you all your tuning.

## Universal toggles (any chipset)
- **Re-Size BAR / Smart Access Memory:** ON. Free 1-5% GPU gains on RTX 30/40-series + RX 6000/7000.
- **Above 4G Decoding:** ON (required for ReBAR on most boards).
- **CSM (Compatibility Support Module):** OFF (UEFI-only).
- **Secure Boot:** ON for Vanguard/EAC/BattlEye-using games.
- **TPM 2.0 / fTPM:** ON (Win11 requirement; some games gate on it now).
- **Fan curves:** custom — flat to 60°C, ramp 60-80°C, max above 80°C.
- **Spread Spectrum:** OFF (CPU + PCIe). Marginal stability gain at higher OCs.
- **Energy-Saving USB:** OFF for gaming peripherals (some boards label as "USB Power Save").

## Intel Z-series (Z690 / Z790 / Z890)
- **MultiCore Enhancement / Force Intel Specs:** OFF for safety on 13th/14th gen post-degradation drama. Use Intel Default Profile (200W PL1, 253W PL2 on K-SKUs).
- **CPU SVID / Voltage Mode:** Adaptive + offset (small negative). Avoid override unless you've validated thermals.
- **LLC (Load Line Calibration):** Mode 3-4 typical for 13/14th gen. Don't go aggressive (mode 5+) without thermal headroom.
- **C-States:** ON (cycles back is faster than waking from full power state on Intel Hybrid).
- **Memory training fast boot:** ON once stable.
- **Resizable BAR:** ON.
- **DMI / PEG link speed:** auto.
- **Z890 (Core Ultra 200):** Enable Application Optimization (APO) at OS level after install.

## Intel non-Z (B760 / H770)
- Most B/H boards lock multipliers — can't OC. Memory tuning still works (XMP).
- Same universal toggles + ReBAR.

## AMD X670E / X870E
- **EXPO** (or DOCP equivalent): ON. Loads XMP-equivalent profile.
- **Curve Optimizer:** -10 to -30 negative offset per core. Validate via [Cinebench R23](https://www.maxon.net/en/downloads/cinebench-r23-downloads) 30-min + [OCCT](https://www.ocbase.com/) 1-hour.
- **PBO:** Enabled, motherboard or scalar 10x.
- **PBO Limits:** Custom — PPT 230W, TDC 160A, EDC 225A is a healthy 7950X target.
- **FCLK / UCLK:** Lock 1:1 with memory speed up to 6000 MT/s. Above that drops to 2:1 — Intel territory.
- **PSS Support / Cool & Quiet:** ON (rare exception: Zen 3 esports tuners disable).
- **AMD CBS settings:** Mostly leave default; advanced tuners adjust SOC voltage in CBS section directly.

## AMD B650 / B650E
- Same as X670E. B650 can OC — voltage delivery is the only meaningful difference.

## Universal "DON'T" list
- **Don't disable XMP/EXPO** to "stabilize" — instead lower frequency or loosen primaries. Running JEDEC is leaving 25% of memory perf on the table.
- **Don't disable C-states unless you've measured DPC latency improvement** in LatencyMon. C-states off = always-warm CPU = ~10W more idle. Only worth it for CS2 / OW2-tier latency obsessives.
- **Don't enable "Auto OC" or "Game Boost" presets** unless you understand what they're flipping. Most just over-volt at stock clocks.
- **Don't manually undervolt Intel 13/14th gen below -50mV without validation.** The degradation issue is real for chips run too hot too long; aggressive UV can mask early symptoms.

## Vanguard / Anti-cheat caveat
- Riot Vanguard requires Secure Boot + TPM 2.0 + (sometimes) Memory Integrity ON (HVCI).
- Memory Integrity / VBS conflict: disable VBS for gaming via our catalog tweak — but Vanguard sometimes flags this. Test in non-ranked first.
- Some COD AC versions have demanded "Hyper-V off" — incompatible with Hyper-V virtualization on the same machine.

## Citations
- der8auer + Roman "Hartung" Hartung Z790 BIOS deep-dives
- Buildzoid Actually Hardcore Overclocking AM5 series
- Wendell @ Level1Techs
- AMD CBS reference + Intel BIOS reference
