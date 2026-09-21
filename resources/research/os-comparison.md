# Custom Windows builds for Fortnite — current decision guide

**Last reviewed: 2026-09-20.** There is no honest universal “lowest-input-delay
OS.” A custom image can lower idle process count, but it can also remove update,
security, recovery, driver, or anti-cheat prerequisites. A benchmark from another
rig is not proof of a latency win on yours.

## The recommendation

For a primary competitive Fortnite machine, use a **stock, fully patched Windows
11 install on a Microsoft-supported branch**. Keep Secure Boot, TPM 2.0, and any
current Epic tournament prerequisites enabled. Then use optimizationmaxxing to
measure and apply reversible, cataloged changes. This gives the app a known
baseline, preserves Windows Update and recovery, and makes a drift check possible.

Microsoft's release table currently lists 26H1 build 28000, 25H2 build 26200,
and 24H2 build 26100. **26H1 is a specialized release for selected new devices,
not a normal in-place upgrade for existing PCs.** Home/Pro support currently
ends Oct 13, 2027 for 25H2 and Oct 14, 2026 for 24H2; 26H1 has a separate
device-specific lifecycle. “Newest” is not automatically “fastest”: these are
support facts, not Fortnite benchmark results. [Microsoft Windows 11 release information](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information),
[26H1 availability](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-version-26h1),
[Home/Pro lifecycle](https://learn.microsoft.com/lifecycle/products/windows-11-home-and-pro)

**Practical answer for an existing x64 esports rig:** use fully patched stock
Windows 11 25H2 as the supported starting point, unless the exact rig has a
known-good supported alternative. Do not tell existing users to upgrade to
26H1: Microsoft limits it to selected new devices. Avoid a fresh 24H2 install
this close to Home/Pro end of support. Windows 10 22H2 left normal support on
2025-10-14. None of these facts proves which branch has the lowest latency on a
particular PC.

## What the custom-build labels really mean

| Option | What can be said safely | Recommendation |
|---|---|---|
| **Stock Windows 11** | Supported update, driver, recovery, and security path. Exact latency depends on the rig and settings. | **Best default for tournament and primary machines.** |
| **Windows 11 IoT Enterprise LTSC** | A separately licensed enterprise channel with a different servicing model. Feature, launcher, HDR, capture, and anti-cheat behavior must be tested; a long support window is not a latency guarantee. | Consider only for a controlled lab or organization with a legitimate license and a complete compatibility test. |
| **Windows X-Lite** | Third-party images vary by edition. The official UltraLite page says components such as Windows Update, Defender, BitLocker, Backup/Restore, OneDrive, speech/diagnostics, Hyper-V, WSL2, and WSA may be absent or unsupported; the author recommends full-featured updatable builds for most users. | **Not the primary Fortnite recommendation.** If retained, use an updatable edition as a secondary test image and keep stock recovery media. |
| **Atlas OS / ReviOS / Tiny11 / Ghost Spectre** | These are playbooks or modified images, not a single stable compatibility target. Their behavior changes with the underlying Windows build and the options selected. Do not infer anti-cheat or tournament support from a community post. | Lab-only unless the owner validates every game, driver, update, recovery, and tournament requirement on that exact image. |
| **A custom optimizationmaxxing OS** | Owning the image would make us responsible for servicing, signing, recovery, driver packaging, privacy/security decisions, and anti-cheat regressions. A stripped image cannot be “set and forget.” | **Do not build one yet.** Keep the app as a reversible policy/tuning layer. Revisit only with an update pipeline, signed releases, rollback media, and a dedicated compatibility lab. |

## X-Lite 24H2: should you switch?

It is not possible to conclude that X-Lite is “bad for Fortnite” from the name
alone. The risk is the removed contract around the game, not a guaranteed FPS
penalty. If your current install launches Fortnite, passes the relevant Epic
checks, and has stable frametimes, the image may be usable for casual testing.

For a competitive primary install, the support-first choice is stock Windows
11 25H2. X-Lite is not proven worse or faster by its name; its editions can
remove or disable Windows Update, Defender, recovery, and optional components.
Those removals are a compatibility, servicing, and recovery tradeoff—not proof
of lower input delay. X-Lite's own UltraLite page recommends a full-featured,
updatable build for most users. [Windows X-Lite UltraLite](https://windowsxlite.com/ultralight)

Atlas's own security FAQ makes the same important distinction: unmodified
Microsoft Windows is the most trusted baseline, while a stripped system trades
security and update behavior for a smaller surface. [Atlas security FAQ](https://docs.atlasos.net/faq/general-faq/atlas-and-security/)

Do not delete the X-Lite install until the stock image has passed your real
workflow: Fortnite launch and update, Epic login, anti-cheat checks, GPU/capture
drivers, OBS or dual-PC capture, controller/HID devices, audio, sleep/restart,
and a repeatable Asta Bench run. optimizationmaxxing can compare the two images,
but it cannot certify a tournament or another anti-cheat provider from registry
state alone.

### X-Lite Competitive Lab

If you want to keep X-Lite because you like its minimal surface, treat it as a
measured second image rather than assuming that removed Defender or services are
an input-lag win. The app's Extreme profile can still expose the eligible
OS/driver/game changes on that image, but it will not disable security,
anti-cheat, Windows Update, Secure Boot, TPM, IOMMU, or hardware identity
controls to chase a theoretical microsecond. Those are compatibility and
eligibility boundaries, not a performance nerf.

Run the comparison with the same BIOS, GPU driver, Fortnite build, display mode,
input polling, capture path, map/route, and background workload. Record:

1. OS edition, build, servicing state, and what X-Lite removed.
2. Fortnite launch/update, Epic login, anti-cheat, OBS/dual-PC capture, audio,
   HID, sleep/resume, and restart checks.
3. Asta Bench frametime percentiles, PresentMon capture, DPC/ISR distribution,
   and input-to-photon evidence where the hardware supports it.

Keep the image only when it wins the complete workload without breaking recovery
or competitive eligibility. If a component is already removed, the app can flag
the missing contract and recommend a stock-image A/B test; it cannot safely
reconstruct the removed Windows component from inside the optimizer.

## Tournament and anti-cheat boundary

Epic's current guidance makes Secure Boot, TPM 2.0, and IOMMU relevant to
Fortnite competitive security. Requirements can change, so the app must link to
Epic's current help and tournament notices rather than promise that a particular
custom image is eligible. [Epic Secure Boot and TPM guidance](https://www.epicgames.com/help/c-34254770/c-Trending_0/a17911497?lang=en-US),
[Epic IOMMU guidance](https://www.epicgames.com/help/c-34254770/c-45529661/a17757744),
[Epic anti-cheat update](https://www.fortnite.com/news/fortnite-anti-cheat-update-february-27-2025)

Never use a kernel hack, hardware-ID spoofer, anti-cheat bypass, or a tweak that
disables required security simply because it might reduce a microsecond of
overhead. Epic warns that tools hiding or altering hardware IDs can lead to a
ban. [Epic hardware-ID warning](https://www.epicgames.com/help/en-US/c-Category_Fortnite/c-Fortnite_PlayerBehavior/a000085508)

## What optimizationmaxxing should do

The app should scan the actual OS build, firmware/security state, drivers,
display mode, power plan, memory, and input devices; recommend a profile; apply
only catalog entries allowed by that profile; and re-read each native action.
Unknown is not the same as verified: imperative PowerShell actions need a
declared read-back contract before the app can claim that they remain applied.
That is why Extreme can be aggressive while still excluding tournament-breaking
or high anti-cheat-risk entries.

### Sources

- [Microsoft supported Windows client versions](https://learn.microsoft.com/en-us/windows/release-health/supported-versions-windows-client)
- [Windows X-Lite UltraLite](https://windowsxlite.com/ultralight)
- [Atlas security FAQ](https://docs.atlasos.net/faq/general-faq/atlas-and-security/)
- [Epic Secure Boot and TPM guidance](https://www.epicgames.com/help/c-34254770/c-Trending_0/a17911497?lang=en-US)
- [Epic IOMMU guidance](https://www.epicgames.com/help/c-34254770/c-45529661/a17757744)
- [Epic hardware-ID warning](https://www.epicgames.com/help/en-US/c-Category_Fortnite/c-Fortnite_PlayerBehavior/a000085508)
