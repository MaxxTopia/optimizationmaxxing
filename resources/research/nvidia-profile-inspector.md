# NVIDIA Profile Inspector — gatekept .nip files unlock 10-50ms

NVIDIA Control Panel exposes maybe 15% of the actual driver knobs. The rest live behind undocumented profile flags only reachable via **NVIDIA Profile Inspector** (NVPI) — a third-party tool that reads/writes the same `.nip` profile XML the driver uses internally. Pros pass around community `.nip` files (Calypto, GeForce-Tweak-Guide forks, per-game low-latency presets) that flip flags like:

- `0x1095DEF8` — Frame Rate Limiter v3 mode
- `0x10920000` series — Texture filtering quality bias
- `0x10930F00` — Threaded Optimization (often defaults ON for Fortnite which causes stutter)
- `0x10D8C5C9` — Pre-rendered frames application override (Reflex bypass)
- `0x809D5F60` — VR pre-rendered frames

Most "Reflex On" recommendations in tutorials don't mention these. They're real, they stack with in-game Reflex, and the per-game .nip files published by community curators are the closest thing to a 10-50ms free win the scene has.

## What you actually do

1. **Get NVPI** — only download from the official source: [github.com/Orbmu2k/nvidiaProfileInspector](https://github.com/Orbmu2k/nvidiaProfileInspector). DO NOT grab the random Russian-mirror copies that show up in Google search results — they bundle adware. Latest releases on the GitHub releases page only.
2. **Get a profile** — start with one of:
   - **Calypto's profiles**: [github.com/Calyptotech/CalyptoNVPIPresets](https://github.com/Calyptotech/CalyptoNVPIPresets) — per-game low-latency .nip files, updated regularly.
   - **GeForce-Tweak-Guide community forks**: search "[game name] nvidia profile inspector" on r/Nvidia + r/CompetitiveApex. Pinned threads usually maintain a current .nip link.
3. **Apply the profile** — NVPI → File → Import → select the .nip → Apply changes (top-right green checkmark). Driver re-reads on next game launch.
4. **Verify** — open NVPI again on the same game profile, scroll through the values, confirm they took. Some flags need a driver restart (or a reboot) to apply.

## Per-game callouts

| Game | Why .nip matters | The flag that matters most |
|---|---|---|
| **Fortnite** | UE5 enables Threaded Optimization in driver defaults — causes stutter on the main thread. Forcing it OFF in NVPI fixes it. | `0x10930F00 = 0` (Threaded Optimization OFF) |
| **CS2** | Source 2 has weird interactions with the Frame Rate Limiter — using NVPI's v3 limiter consistently beats both in-game cap and NVCP UI cap. | `0x1095DEF8 = 3` (FRL v3 mode) |
| **Valorant** | Vanguard kernel-AC checks driver state — most NVPI changes are AC-safe but verify per patch (see r/VALORANT pinned). Particularly worth: forcing prefer-max-performance on `vgc.exe` profile. | per-app prefer-max-performance |
| **Apex Legends** | Source engine handles Reflex weirdly — NVPI low-latency mode = ULTRA on the per-game profile (NCP cap stays at OFF) is what ImperialHal-tier configs run. | low-latency mode = Ultra on per-game profile |

## Why we don't auto-apply this for you

Two reasons. One: NVPI's flags interact with driver versions — what works on driver 580 may regress on 600. We'd need to publish + test per-driver-version .nip files. Two: bundling Orbmu2k's binary changes our license-compliance surface significantly. The honest path is articleware: tell you what works, link to the maintained sources, get out of your way.

When the v0.1.62+ updater pipeline matures we may bundle a curated per-driver `.nip` library + an "Apply Calypto profile" button. Until then, NVPI yourself — the import is two clicks once you have it.

## Sanity check / safe defaults

If you're new to NVPI and don't want to start with a community profile:

- Open NVPI → select the game's profile from the dropdown → set:
  - **Power management mode** = Prefer maximum performance
  - **Texture filtering — Quality** = High performance
  - **Threaded optimization** = OFF (Fortnite specifically — leave AUTO for Valorant)
  - **Low Latency Mode** = ON (NOT Ultra — fights in-game Reflex; see our [NVIDIA Reflex guide](#))
  - **Vertical Sync** = OFF
- File → Apply changes
- Test in-game

That gets you 60-80% of what a Calypto profile would. The .nip files are an additional layer of optimization on top.

## Anti-cheat note

NVPI changes are **driver-side**, not game-side. Anti-cheats that operate at the kernel level (Vanguard, EAC, BattlEye) generally don't flag NVPI use because all it's doing is writing to NVIDIA driver profile storage — not modifying the game binary or injecting DLLs. **However:** verify per-game per-AC patch. We've never seen NVPI flagged but absence of evidence isn't evidence of absence.

## Citations

- [github.com/Orbmu2k/nvidiaProfileInspector](https://github.com/Orbmu2k/nvidiaProfileInspector) — official source (only place to get NVPI)
- [github.com/Calyptotech/CalyptoNVPIPresets](https://github.com/Calyptotech/CalyptoNVPIPresets) — per-game .nip profiles
- r/Nvidia, r/CompetitiveApex, r/FortniteCompetitive — community .nip threads
- NVIDIA Reflex SDK whitepaper (developer.nvidia.com/reflex)
