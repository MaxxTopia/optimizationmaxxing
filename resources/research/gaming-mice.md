# Gaming mice + settings for competitive play

## Polling rate
- **1000 Hz minimum** for any competitive title. Default for 95% of gaming mice.
- **4000 / 8000 Hz** on supported mice (Razer Viper V2 Pro / V3 Pro, Pulsar X2 / X2H, Logitech G Pro X Superlight 2, ZOWIE EC3-CW post-2024 update). Cuts mouse-to-screen latency by 0.5-1 ms vs 1000 Hz. Real but small.
- Above 1000 Hz costs CPU. Pin mouse driver to a non-game core via Process Lasso if you see polling-rate jitter while gaming.

## DPI
- **400-1600 DPI** is the competitive band. Anything outside is muscle-memory mismatch for pro coaching content.
- **800 DPI default**. Most popular among Valorant / CS2 pros.
- 400 DPI: S1mple, NiKo (CS2). 800 DPI: TenZ, ScreaM, Aspas, demon1. 1600 DPI: a few outliers (Niko's old setup).
- Multiply DPI × in-game sensitivity to get **eDPI** (effective DPI). Track your eDPI across games for muscle-memory transfer.

## Lift-off distance (LOD)
- **1 mm or lowest**. Aiming through arm-drag flicks is sloppy if LOD is high.
- Modern flagship sensors (PixArt PAW3950, PMW3395) all support sub-1mm. Use the manufacturer software to set.

## Mouse acceleration
- **OFF.** Always. The "Disable Mouse Acceleration" tweak in our catalog flips the three Windows registry values needed.
- Game-side: every competitive title also has a "raw input" or "no acceleration" toggle. Enable.

## Recommended mice (2025-2026 generation)
| Mouse | Weight | Polling | Sensor | Verdict |
|---|---|---|---|---|
| Logitech G Pro X Superlight 2 | 60g | 8000 Hz | HERO 2 | All-rounder GOAT |
| Razer Viper V3 Pro | 54g | 8000 Hz | Focus Pro 35K | Fastest sensor |
| Pulsar X2H V3 | 52g | 8000 Hz | XS-1 | Best value flagship |
| Endgame Gear OP1 8K | 52g | 8000 Hz | PixArt PAW3950 | Hardcore minimal shape |
| ZOWIE EC2-CW / EC3-CW | 70-77g | 1000 Hz | 3370 | CS-tier classic ergo |
| Finalmouse ULX Phantom | 38g | 8000 Hz | proprietary | Lightest serious mouse |

Avoid: any mouse with software requiring background processes that can't be set-and-forget (some Razer Synapse versions, MSI software).

## Mousepad
- **XL hard pad** for low-DPI competitive (e.g. Pulsar Paracontrol, Artisan Hayate, ZOWIE G-SR-SE).
- Soft cloth + 800 DPI is fine for everyone else.
- Replace every 6-12 months — pads dirty up and friction shifts.

## Mouse driver / firmware
- Always run latest firmware via vendor app (G HUB, Razer Synapse, Pulsar Fusion).
- Once configured, **kill the background daemon** (Process Lasso → set "Always disabled" on G_HUB.exe / RzSynapse.exe). Settings persist on the mouse, daemon isn't needed running.

## Mouse-side our catalog handles
- Disable Mouse Acceleration (HKCU registry — already in v1 catalog)

## Mouse-side we'd LOVE to handle but can't
- Polling rate (set in mouse firmware, not Windows)
- DPI (mouse firmware)
- Lift-off distance (mouse firmware)

These are vendor-specific — we link out to the right vendor app.

## Citations
- prosettings.net (eDPI database for pros)
- Rocket Jump Ninja YouTube (mouse reviews + shape grading)
- Bryjy / Tarrik input-lag mouse reviews
