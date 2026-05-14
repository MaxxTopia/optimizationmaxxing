# RAM tightening — copy-paste BIOS recipes per IC

The RAM Advisor card on `/diagnostics` identifies your IC die from the part number. **Match the IC below to the BIOS recipe**. Type these values into your motherboard's DRAM timing menu, then run [TestMem5](https://github.com/CoolCmd/TestMem5) (anta777 extreme config) for 1–2 hours to validate before tournament use. Never auto-flash; never copy a recipe blindly into XMP/EXPO+ overrides without verifying the IC first.

The numbers below are the **SAFE** Buildzoid/DRAM-Calculator consensus. FAST/EXTREME tiers exist for daily-driver overclockers; they're not appropriate here.

## DDR4 (AM4 Ryzen 3000/5000, Intel 10/11/12-gen)

### Samsung B-die — the GOAT

Voltages run hotter than other ICs but the timings scale further.

| Frequency | tCL | tRCD | tRP | tRAS | tRC | tRFC | VDIMM | VSOC (AMD) |
|---|---|---|---|---|---|---|---|---|
| 3600 | 14 | 15 | 15 | 30 | 48 | 256 | 1.45 V | 1.10 V |
| 3800 | 14 | 16 | 16 | 32 | 50 | 280 | 1.50 V | 1.10 V |
| 4000 | 15 | 16 | 16 | 34 | 52 | 280 | 1.55 V | 1.15 V |

Secondary: tRRDS 4 / tRRDL 6 / tWR 12 / tWTRS 4 / tWTRL 12 / tFAW 16 / tRDRDSCL 2 / tWRWRSCL 2.

### Hynix DJR — modern Hynix, good headroom

| Frequency | tCL | tRCD | tRP | tRAS | tRC | tRFC | VDIMM |
|---|---|---|---|---|---|---|---|
| 3600 | 16 | 17 | 17 | 34 | 52 | 312 | 1.40 V |
| 3800 | 16 | 18 | 18 | 36 | 56 | 320 | 1.42 V |
| 4000 | 17 | 19 | 19 | 38 | 58 | 336 | 1.45 V |

### Hynix CJR — older Hynix, more conservative

| Frequency | tCL | tRCD | tRP | tRAS | tRC | tRFC | VDIMM |
|---|---|---|---|---|---|---|---|
| 3200 | 16 | 17 | 17 | 34 | 52 | 312 | 1.35 V |
| 3600 | 17 | 19 | 19 | 36 | 56 | 336 | 1.40 V |

### Micron Rev.E — common in budget kits

| Frequency | tCL | tRCD | tRP | tRAS | tRC | tRFC | VDIMM |
|---|---|---|---|---|---|---|---|
| 3200 | 16 | 18 | 18 | 36 | 56 | 416 | 1.38 V |
| 3600 | 16 | 19 | 19 | 38 | 58 | 480 | 1.40 V |

Micron is the **least responsive to tightening** — gains here are 2–4% FPS, not the 5–8% of B-die. Set your expectations.

## DDR5 (AM5 Ryzen 7000/9000, Intel 12+ gen)

### Hynix A-die — the modern GOAT

A-die ships in most premium DDR5 kits (G.Skill Trident Z5 RGB DDR5-6000 CL30, Corsair Dominator Titanium DDR5-6000, Kingston Fury Renegade DDR5-6400).

| Frequency | tCL | tRCD | tRP | tRAS | tRC | tRFC1 | VDIMM | VSOC |
|---|---|---|---|---|---|---|---|---|
| 6000 | 28 | 36 | 36 | 72 | 108 | 560 | 1.40 V | 1.20 V |
| 6200 | 30 | 36 | 36 | 76 | 112 | 580 | 1.42 V | 1.25 V |
| 6400 | 30 | 38 | 38 | 80 | 118 | 600 | 1.45 V | 1.25 V |

**FCLK target on AM5**: 2000 MHz (UCLK 1:1 with MEMCLK at 6000 MT/s). Anything past 6200 MT/s breaks the 1:1 ratio and INCREASES latency — don't push frequency past where the 1:1 holds.

### Hynix M-die — the budget DDR5 standard

| Frequency | tCL | tRCD | tRP | tRAS | tRC | tRFC1 | VDIMM |
|---|---|---|---|---|---|---|---|
| 6000 | 30 | 38 | 38 | 76 | 114 | 580 | 1.40 V |
| 6200 | 32 | 40 | 40 | 80 | 120 | 600 | 1.42 V |

### Samsung B-die DDR5 — limited availability

Samsung's DDR5 B-die equivalent is in some Crucial Pro kits + select G.Skill Royal Neo. Treat conservatively until you've verified yours specifically:

| Frequency | tCL | tRCD | tRP | tRAS | VDIMM |
|---|---|---|---|---|---|
| 6000 | 30 | 38 | 38 | 76 | 1.40 V |

### Micron DDR5 — rare in the wild for OC

Crucial DDR5 typically; lower binning, treat at JEDEC + small tighten:

| Frequency | tCL | tRCD | tRP | tRAS | VDIMM |
|---|---|---|---|---|---|
| 5600 | 36 | 40 | 40 | 80 | 1.35 V |

## What to actually do (5-step recipe)

1. **Detect your IC** via the RAM Advisor card on `/diagnostics`. If "unknown", run [Thaiphoon Burner](https://www.softnology.biz/files.html) → Read → it dumps the SPD with the actual IC name.
2. **Pick your frequency** based on your CPU's IMC tolerance (Ryzen 5000 → 3600 MT/s 1:1; Ryzen 7000/9000 → 6000 MT/s 1:1; Intel 13/14-gen → 6400-7200 MT/s common ceilings).
3. **Type the SAFE values** for your IC + frequency into the BIOS DRAM timing screen. Leave anything not listed at AUTO — those subtimings are derived from primaries.
4. **Set VDIMM** to the table value. AMD users: set VSOC manually too (don't trust AUTO — boards over-volt it).
5. **Validate with [TestMem5](https://github.com/CoolCmd/TestMem5) at the anta777 extreme config** for 1–2 hours minimum. ZERO errors. If you see one error, raise tCL by 1 step, re-test. Don't ship to scrim until two clean hours.

## Why we don't auto-apply this

Three reasons:

1. **Wrong-IC application = boot loop**. Samsung B-die voltages on Hynix DJR will crash boot. Recovery: clear CMOS + reflash BIOS. Bad day.
2. **No standard BIOS API** for timing writes. Every vendor (ASUS / MSI / Gigabyte / ASRock) has a different SCEWIN dump format. We'd ship 4 ASCII-fragile recipe-typers.
3. **DRAM tuning is your responsibility**. The bricks-your-stick risk is real. We surface what you have + which knobs to turn. You turn them.

The RAM Advisor card on `/diagnostics` will keep us honest: it tells you the IC, links you here, and lists the exact tools. The tightening is yours.

## Citations

- [DRAM Calculator for Ryzen (techpowerup)](https://www.techpowerup.com/download/ryzen-dram-calculator/) — SAFE/FAST/EXTREME recipes per IC. AM4 still excellent; AM5 use Buildzoid's manual approach.
- [Buildzoid — Hynix DDR5 M-die tuning guide](https://www.youtube.com/@ActuallyHardcoreOverclocking)
- [r/overclocking RAM wiki](https://www.reddit.com/r/overclocking/wiki/index/ramoc/) — community per-IC tables, regularly updated
- [Hynix Modules DB (benzhaomin)](https://benzhaomin.github.io/HynixModules/) — part-number to IC lookup
- [TestMem5 (CoolCmd)](https://github.com/CoolCmd/TestMem5) — validation tool of record for tightened timings
- [Thaiphoon Burner (Softnology)](https://www.softnology.biz/files.html) — SPD read tool when our heuristic can't ID your kit
