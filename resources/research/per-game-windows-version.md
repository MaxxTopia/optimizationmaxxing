# Windows version guidance for competitive games

**Last reviewed: 2026-09-17.** There is no Microsoft-certified “best Fortnite
Winver” that guarantees lower input delay. The useful question is whether the
branch is supported, fully patched, compatible with the hardware and anti-cheat
stack, and measurably stable on the player's own machine.

## Current answer

For a new primary Fortnite install, choose **stock Windows 11 25H2** when the
system already has a known-good 25H2 driver and capture stack. Test **Windows 11
26H1** on a separate image when the motherboard, GPU, capture card, and game
stack are confirmed. Keep the image fully patched and retain the ability to
roll back. Windows 11 24H2 is still supported for Home/Pro until 2026-10-13,
but it is not the branch I would select for a fresh long-lived install now.

Microsoft's current supported-client table lists 26H1 as build 28000, 25H2 as
build 26200, and 24H2 as build 26100. Home/Pro end-of-service is 2028-03-14,
2027-10-12, and 2026-10-13 respectively. Windows 10 22H2 ended normal support
on 2025-10-14. These are lifecycle facts, not FPS benchmarks. [Microsoft supported
Windows client versions](https://learn.microsoft.com/en-us/windows/release-health/supported-versions-windows-client)

## Per-game baseline

| Game | Baseline to test first | What the app should avoid claiming |
|---|---|---|
| **Fortnite / Unreal Engine** | Fully patched stock Windows 11 25H2 or a validated 26H1 image; keep current Epic security requirements enabled. | That a stripped image, a specific build number, or a registry tweak guarantees lower input delay or tournament eligibility. |
| **VALORANT** | Fully patched supported Windows 11 with the security features Riot currently requires. | That disabling VBS, HVCI, Secure Boot, TPM, or services is safe for ranked/tournament play. |
| **CS2 / Apex / Overwatch / R6** | The current supported Windows 11 branch with the game's current launcher and anti-cheat updates. | That one game's scheduler result transfers to every other engine or anti-cheat. |
| **Rocket League / older DX titles** | Any supported Windows version that passes the game's current requirements, with the same-rig benchmark as the deciding evidence. | That an older, unsupported Windows release is a sound security or tournament baseline. |

The app can make a hardware-aware recommendation, but the recommendation should
be phrased as “best next test” rather than “universally fastest.” A/B testing
must hold GPU driver, BIOS settings, game build, display mode, input polling,
background apps, map, and benchmark route constant. Compare frametime percentiles,
input-to-photon measurements when available, DPC/ISR distributions, and real
match behavior—not only average FPS.

## LTSC and custom images

Windows 11 IoT Enterprise LTSC may be appropriate for a controlled organization
with a legitimate license and a fixed software image. Its servicing model does
not prove lower latency, and game launchers, HDR, capture, drivers, and anti-cheat
still need a clean-room test. It is not a magic “gaming edition.”

Third-party images such as X-Lite, Atlas OS, ReviOS, Tiny11, and Ghost Spectre
must be evaluated as exact image/configuration combinations. Do not reuse a
community compatibility claim after a new cumulative update. X-Lite's official
UltraLite documentation says Windows Update, Defender, BitLocker, Backup/Restore,
and several optional components may be missing or unsupported, and recommends a
full-featured updatable build for most users. [X-Lite UltraLite documentation](https://windowsxlite.com/ultralight)

## Intel 14900KF note

For a Core i9-14900KF, first install the latest motherboard BIOS and use Intel
Default Settings. Intel's current Vmin Shift guidance specifically recommends a
BIOS containing microcode **0x12F or later**. Do not trade hardware lifespan for
a benchmark by using unlimited board presets, voltage overrides, or thermal-limit
changes. [Intel Vmin Shift guidance](https://www.intel.com/content/www/us/en/support/articles/000102331/processors.html)

Intel Application Optimization is a separate, optional scheduler feature. Intel
lists the i9-14900KF among verified processors, requires current BIOS/DTT support,
and recommends Windows 11 25H2 or later. The visible game list varies by system;
Fortnite is not a promise merely because the CPU is supported. If a title is not
shown for that exact configuration, treat Advanced Mode as an experiment with
possible degradation and a clear off switch. [Intel APO overview](https://www.intel.com/content/www/us/en/support/articles/000095419/processors.html),
[Intel APO game list](https://www.intel.com/content/www/us/en/support/articles/000098266/processors.html)

## What to do in a fresh-install checklist

1. Record the current OS build, BIOS version, GPU driver, display refresh mode,
   input polling rate, and a repeatable Fortnite benchmark route.
2. Install a supported stock Windows 11 image and current OEM/chipset/GPU
   drivers. Keep Secure Boot and TPM 2.0 enabled; check Epic's current IOMMU
   guidance before tournaments.
3. Run the optimizationmaxxing scan. Select Light or Competitive first; use
   Aggressive/Extreme only after a restore point and a clean before/after test.
4. Re-scan after Windows Update, GPU-driver changes, and major game updates.
   “Applied” is history; “verified” requires a live read-back.
5. If a change produces a real regression, revert the receipt and preserve the
   before/after evidence instead of layering another tweak on top.

### Sources

- [Microsoft supported Windows client versions](https://learn.microsoft.com/en-us/windows/release-health/supported-versions-windows-client)
- [Intel Vmin Shift guidance](https://www.intel.com/content/www/us/en/support/articles/000102331/processors.html)
- [Intel APO overview](https://www.intel.com/content/www/us/en/support/articles/000095419/processors.html)
- [Intel APO game list](https://www.intel.com/content/www/us/en/support/articles/000098266/processors.html)
- [Windows X-Lite UltraLite documentation](https://windowsxlite.com/ultralight)
- [Epic Secure Boot and TPM guidance](https://www.epicgames.com/help/c-34254770/c-Trending_0/a17911497?lang=en-US)
- [Epic IOMMU guidance](https://www.epicgames.com/help/c-34254770/c-45529661/a17757744)
