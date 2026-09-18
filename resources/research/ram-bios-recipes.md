# RAM stability and profile audit (reviewed 2026-09-17)

There is no universal "safe" timing or voltage recipe. The same kit can train differently across CPUs, boards, BIOS releases, DIMM layouts, temperatures, and memory-controller margin. optimizationmaxxing therefore reports the installed memory and, for VIP users, exposes an explicitly manual timing/voltage worksheet. It never writes timings, memory voltage, SoC voltage, or BIOS variables.

## What the app can observe

The RAM Advisor uses the data Windows exposes to show capacity, type, current speed, reported timings/profile information, and whether the current state looks like JEDEC, a manufacturer profile, or a custom state. Unknown fields stay unknown. Part-number heuristics are hints, not proof of the DRAM die or of stable overclocking headroom.

## A safe order of operations

1. Capture a baseline: current BIOS version, memory kit part number, capacity, speed, timings, idle temperature, WHEA count, Fortnite frametime, and a repeatable benchmark route.
2. Start at JEDEC defaults if you are isolating crashes, WHEA errors, boot loops, or unexplained frametime spikes.
3. If desired, enable only the memory kit's manufacturer-rated XMP/EXPO profile. Verify the exact kit and board support list first; rated does not mean guaranteed on every CPU memory controller.
4. Reboot and check that the operating system reports the expected capacity and speed. Then run a real memory test and the game workload long enough to expose errors.
5. Keep the profile only when repeated tests are clean and Fortnite frametime is no worse. A higher memory number without stable frame pacing is not a win.

## Validation signals

Use a bootable memory test or a current in-OS memory test for the first pass, then a longer mixed CPU/GPU/game session. Watch for WHEA-Logger events, corrected hardware errors, application crashes, anti-cheat failures, shader compilation errors, and frametime spikes. One error is enough to return to the last known-good profile; do not hide it with a larger voltage.

For tournament use, validate after a cold boot, a warm reboot, sleep/resume if you use it, and several hours of the actual game. Keep a known-good JEDEC or vendor-default profile available for recovery.

## VIP manual tuning lab

The app now keeps the enthusiast controls available without pretending that a
copy-paste table is a universal truth. The worksheet is die-gated: it can show
secondary timing starting points when the DRAM die is identified, and it always
shows the actual voltage rails that must be checked against the exact kit, board,
CPU, and BIOS documentation. The voltage column starts from the kit's rated
XMP/EXPO value; it is not an automatic over-voltage recipe.

Use it like a real experiment: save the known-good BIOS profile, change one
setting, record the result, cold-boot and warm-boot, run memory validation, then
run the same Fortnite route. A value is not "applied" because it was typed into
the BIOS; it is only retained if the board trains it, Windows reports the
expected state, the memory test is clean, and the game frametime does not regress.

Tune Now will never import this worksheet. That separation is deliberate: an
extreme automatic OS/driver tune can be receipt-backed and reverted, while a
firmware experiment needs the board's own recovery path and a human at the BIOS.

## What this app deliberately does not recommend

- Copy-pasting per-IC primary or secondary timing tables.
- Blind DRAM, SoC, VDDIO, or memory-controller voltage values copied across platforms.
- PBO, Curve Optimizer, fixed clocks, Load-Line Calibration, or power-limit changes presented as memory tuning.
- Assuming DDR5-6000, a 1:1 fabric ratio, a specific tRFC, or a logical-core mapping is optimal on every platform.
- Treating a part-number lookup as a stability guarantee.

If you want a manual overclocking experiment, open the VIP Manual Tuning Lab,
keep it separate from Tune Now, change one variable, retain the old profile, and
use the motherboard vendor's recovery procedure. That experiment is not part of
optimizationmaxxing's applied-tweak contract.

## Useful evidence to retain

Save the kit label or part number, BIOS screenshots, test logs, WHEA export, and before/after frametime captures. This makes a regression diagnosable and lets the app's restore path return Windows-side changes without pretending it can restore BIOS state.
