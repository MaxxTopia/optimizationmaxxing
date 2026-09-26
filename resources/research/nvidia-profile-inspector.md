# NVIDIA Profile Inspector (.nip) — import, verify, test

**Reviewed: 2026-09-25.** The app's profile buttons download files; they do not apply driver settings. A profile is a set of NVIDIA driver overrides, not a Fortnite config edit, an anti-cheat approval, or proof of lower input delay.

## Use a downloaded profile

1. Download the latest NVIDIA Profile Inspector release from [Orbmu2k's releases](https://github.com/Orbmu2k/nvidiaProfileInspector/releases).
2. Export the current game profile first and keep the `.nip` backup.
3. Open NVPI and choose **File → Import Profile(s)**. Select the `.nip` you downloaded. Use the menu instead of double-clicking the file so you can see the import strategy.
4. For a normal test, choose **Merge**. Choose **Replace** only when you intentionally want the shipped settings to replace the selected profile after making a backup.
5. Check the profile name, executable association, and imported settings. For Fortnite, choose one of the two Fortnite downloads at a time; both intentionally target the `Fortnite` profile.
6. Click **Apply changes**. Close and reopen NVPI to confirm the values are still present. Re-check after GPU-driver updates; updates can change or reset profile behavior.
7. Test one profile at a time in the same game scene, with the same render mode, Reflex, cap, display path, and background workload. Keep it only if repeatable evidence improves without a feature or image-quality regression.

## If NVPI says the application is already in use

This means the executable is already assigned to another NVPI profile. It is not a warning that the `.nip` file is automatically dangerous. Cancel the import, find the older profile that owns the executable, and remove that executable from the old duplicate or remove the old duplicate profile. Then import the current file into the intended profile. Do not leave `FortniteClient-Win64-Shipping.exe` in both `Fortnite` and an older `Fortnite (optimizationmaxxing)` profile.

The Valorant download targets `VALORANT-Win64-Shipping.exe` only. `vgc.exe` is the Vanguard service, not the game executable, so it is intentionally not included in the profile.

## Included profiles

| Profile | Contents | How to treat it |
|---|---|---|
| Fortnite latency baseline | 4 driver settings: power mode, texture filtering quality, VSync, and maximum pre-rendered frames | Candidate to compare with your current profile; not a universal fastest preset. |
| Fortnite performance render lab | 9 settings; adds conventional texture-sample/trilinear, LOD, FXAA, and MFAA overrides | Aggressive image-quality experiment on the same `Fortnite` profile. Import it instead of, not alongside, the latency baseline. It may introduce shimmer and does not remove foliage, clouds, terrain, or change visibility. |
| VALORANT / CS2 / Apex Legends | 6 settings per game | Per-title candidates; verify the matching game executable and current in-game latency options. |
| Marvel Rivals | 12 settings | Test only in Marvel Rivals; sharing Unreal Engine does not imply Fortnite gains. |

Use the game's own supported latency options first. If Fortnite exposes NVIDIA Reflex, test its current in-game modes and frame caps; do not stack Low Latency Mode or other driver overrides by assumption. NVIDIA's [Reflex overview](https://www.nvidia.com/en-us/geforce/news/reflex-low-latency-apex-legends-valorant-fortnite-cs2/) describes the in-game integration, but the best cap/sync combination remains display- and workload-dependent.

## RMInstLoc registry claim

The claim that adding an `RMInstLoc` DWORD makes the GPU run from a “faster location” is not supported by a demonstrated Fortnite latency result. Public driver-header material describes it as a resource-manager placement field, not a general input-latency control. The app does **not** add `RMInstLoc`, `RMInstLoc2`, or wildcard variants. Do not copy registry values from a tweak list; a value existing in Registry Editor does not prove the driver uses it or that performance improved. [Header diff reference](https://fossies.org/diffs/NVIDIA-open-gpu-kernel-modules/610.57.04_vs_615.71.09/src/nvidia/interface/nvrm_registry.h-diff.html)

## Measurement and limits

- Compare repeatable Fortnite frametime percentiles and input-to-photon results when you have suitable measurement hardware. Keep a written record of the original profile for rollback.
- LatencyMon measures DPC/ISR behavior; it does **not** measure end-to-end mouse-to-photon latency or prove a profile improved gameplay.
- Do not use hidden foliage/terrain/visibility flags, game-memory edits, or anti-cheat workarounds. Check the current game and tournament rules after updates.

Sources: [NVIDIA Profile Inspector](https://github.com/Orbmu2k/nvidiaProfileInspector), [NVIDIA Reflex](https://www.nvidia.com/en-us/geforce/news/reflex-low-latency-apex-legends-valorant-fortnite-cs2/).
