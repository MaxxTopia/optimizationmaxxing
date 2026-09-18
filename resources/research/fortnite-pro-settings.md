# Fortnite — current competitive validation guide

This is a validation guide, not a universal pro preset. Fortnite, Windows, GPU drivers,
display modes, and anti-cheat requirements change. Tune one variable at a time, record the
build/driver/monitor state, and keep a setting only when a repeatable match or benchmark run
improves frame-time consistency without hurting control.

Epic's current PC requirements and competitive/anti-cheat guidance are the authority for
supported modes and tournament eligibility:

- [Epic PC requirements](https://www.epicgames.com/help/en-US/c-Category_Fortnite/c-Fortnite_PlayerBehavior/what-are-the-system-requirements-for-fortnite-on-pc-and-mac-a5720377103003)
- [Epic anti-cheat update](https://www.fortnite.com/news/fortnite-anti-cheat-update-february-27-2025)

## What optimizationmaxxing changes

The catalog's engine/config actions are snapshot-backed and reversible. Tune Now now asks for
a game context, so Fortnite-tagged actions are not applied during a Valorant or Windows-only
run. The old GameUserSettings preset contains fixed 240 FPS / 1920×1080 values and is
explicit-only; it is not a scan-aware recommendation and Tune Now will not apply it.

Do not mark the file read-only as a default. Fortnite and cloud/profile updates can rewrite it,
and a read-only file prevents legitimate in-game changes. If you deliberately test the legacy
preset, keep a copy, verify every value in-game, and remove the read-only attribute before
retuning:

```powershell
$gameSettings = "$env:LOCALAPPDATA\FortniteGame\Saved\Config\WindowsClient\GameUserSettings.ini"
attrib -R $gameSettings
```

## Display and frame pacing

- Test Fullscreen and Windowed Fullscreen on the current Fortnite and Windows build. Keep the
  mode that gives the best combination of frame-time consistency, alt-tab behavior, VRR behavior,
  and measured input response on the target rig.
- Use the monitor's highest supported mode only when the system can feed it consistently. The
  app's display action reads the current resolution and selects the highest mode Windows exposes;
  it does not cap a high-refresh display at 240 Hz.
- Choose a frame cap from a repeatable scene and the display/VRR strategy. Matching a monitor's
  nominal refresh is only a starting point; uncapped, capped-below-refresh, and tear-tolerant
  paths have different tradeoffs.
- Test VSync, VRR, and the cap as a matrix. There is no universal “refresh minus three” or
  “lowest latency” result across drivers, engines, and displays.
- HDR, overdrive, and backlight strobing are display-path choices. Compare them at the same
  resolution, cap, and scene; do not claim a fixed millisecond cost without a measurement.

## Rendering and in-game controls

- Compare the render modes Fortnite currently exposes on the installed build. Performance mode
  can reduce visual workload, but no current build should be described as the universal number-one
  mode or as the mode every top player uses.
- Start with Custom quality, then validate view distance, 3D resolution, textures, meshes, and
  effects against visibility and stable 1% lows. Resolution and view distance are player and rig
  choices, not automatic latency switches.
- If NVIDIA Reflex is offered for the GPU/build, compare Off, On, and On + Boost in the same
  scene. Reflex is an in-game integration; do not promise a fixed 5–30 ms gain. When using Reflex,
  avoid stacking a contradictory driver low-latency mode without measuring.
- On Radeon, use the current in-game/official Anti-Lag path when supported. Never recommend
  unofficial injection or anti-cheat-bypassing latency tools.
- Test mouse polling at 1000 Hz first. 4/8 kHz can be useful on some rigs but can increase CPU
  work or frame-time variance; keep it only if polling is actually achieved and the same scene
  remains stable.
- Avoid undocumented INI keys such as old cosmetic-streaming tokens unless the current Epic
  build documents them and the setting is verified after launch. A stale key can be ignored or
  trigger a settings rewrite.

## Audio and capture

Use one spatializer at a time. Verify the endpoint format, enhancements, Discord behavior, and
audio-driver DPC activity with the actual device. Capture-card and dual-PC paths need a separate
end-to-end test: the app can report configuration, but it cannot prove the sender/receiver path,
audio sync, or match acceptance without the real hardware.

## Acceptance checklist

1. Record Windows build, GPU driver, Fortnite build, monitor mode, cap, Reflex/VRR state, and
   mouse polling rate.
2. Run the same replay or controlled creative scene at least three times before and after one
   change; record frametime percentiles and input method, not only the FPS average.
3. Re-launch Fortnite and re-check the settings that the game owns.
4. Run the app's Diff/rescan view. A catalog receipt is not proof that a game setting stayed
   active; a mismatch must be repaired or reverted.
5. For tournaments, re-check Epic's current Secure Boot, TPM, IOMMU, and anti-cheat requirements.

No Windows tweak can prove “fastest edits” or lowest total input delay without this controlled
game/device measurement. That evidence gate is intentional.
