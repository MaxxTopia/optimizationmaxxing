# Gaming mice + settings for competitive play

> **The "every pro uses 1600 DPI" myth.** They don't. ProSettings.net's
> May 2026 dataset (650+ Valorant pros, 328 Fortnite pros) shows 800 DPI
> is the dominant competitive default. 1600 DPI is a real minority but it's
> not the consensus. Same eDPI lands different ways. Read the per-genre
> sections below before changing anything you've already built muscle for.

## DPI — by the numbers

Pulled from prosettings.net databases (the largest tracked-pro dataset
in esports, May 2026):

| Title | DPI distribution | Median eDPI | cm/360 |
|---|---|---|---|
| Valorant (650 pros) | ~50% at 800 · ~40% at 400 · pretty much none above 1600 | 267 | ~45 cm |
| Fortnite (328 pros) | ~85% at 800 · small contingent on 400 | sens ~7.5% at 800 DPI | 30–35 cm |
| CS2 | overwhelming majority at 400 | 880 | 50–55 cm |
| Apex Legends | wider spread — 800 / 1600 / 3200 all common | varies; aim training intensive | 25–35 cm |

**The 1600-DPI camp.** Real but specific:

- A subset of Valorant pros (~10–15%) run 1600 because lower in-game sens
  numbers feel cleaner mathematically. Same eDPI as 800; pure preference.
- Apex tolerates higher DPI well — strafe / movement-aim benefits from
  finer sensor increments at speed.
- Fortnite builders / edit-course practitioners sometimes split DPI:
  high for editing, low for aiming. Most don't bother.

If your mental model is "every pro uses 1600," the data doesn't support
it. **Pick eDPI from your genre median, then choose whichever raw DPI gets
you there cleanly.**

## Polling rate

- **1000 Hz minimum.** Default for 95% of gaming mice.
- **4000 / 8000 Hz** on supported mice (Razer Viper V3 Pro, Pulsar X2 V3,
  Logitech G Pro X Superlight 2, Endgame Gear OP1 8K, Finalmouse ULX
  Phantom). Cuts mouse-to-screen latency by 0.5–1 ms vs 1000 Hz. Real but
  small — you'll notice it on flicks under heavy network load, not in
  static aim drills.
- Polling above 1000 Hz costs CPU. ProSettings.net's May 2026 Valorant
  data: 67% on 1000 Hz, 18% on 4000 Hz, 8% on 2000 Hz, 6% on 8000 Hz.
  The high-poll camp is growing but not dominant.
- Pin the mouse driver to a non-game core via Process Lasso if you see
  polling-rate jitter under load. Or apply our HID priority + queue size
  catalog tweaks (`hid.mouse.*`).

## Lift-off distance (LOD)

- **1 mm or lowest.** Modern PAW3950 / Focus Pro 35K / HERO 2 sensors all
  support sub-1 mm. Set in vendor software (G HUB / Razer Synapse / Pulsar
  Fusion / Endgame Gear app).
- High LOD ruins arm-drag flicks. Test by lifting the mouse 2 mm and
  trying to track a slow-moving target — if the cursor keeps tracking,
  your LOD is too high.

## Mouse acceleration

- **OFF.** Always. Both Windows-side and game-side.
- Our `ui.mouse.disable-acceleration` catalog tweak flips the three
  HKCU registry values. Game-side: every competitive title has a "raw
  input" or "no acceleration" toggle.

## Recommended mice (2025–2026 generation)

| Mouse | Weight | Polling | Sensor | Verdict |
|---|---|---|---|---|
| Logitech G Pro X Superlight 2 | 60 g | 8000 Hz | HERO 2 | All-rounder GOAT |
| Razer Viper V3 Pro | 54 g | 8000 Hz | Focus Pro 35K | Fastest sensor |
| Pulsar X2 V3 | 52 g | 8000 Hz | XS-1 | Best value flagship |
| Endgame Gear OP1 8K | 52 g | 8000 Hz | PAW3950 | Minimal shape, hardcore |
| ZOWIE EC2-CW / EC3-CW | 70–77 g | 1000 Hz | 3370 | CS-tier classic ergo |
| Finalmouse ULX Phantom | 38 g | 8000 Hz | proprietary | Lightest serious mouse |

**Avoid:** mice with vendor software that can't be killed after configuration
(some Razer Synapse versions, MSI software). Anything that requires a
running daemon to keep DPI / polling / LOD applied is a bad pick — those
are stored on the mouse, not in Windows.

## Mousepad

- **XL hard pad** (Pulsar Paracontrol, Artisan Hayate, ZOWIE G-SR-SE) for
  low-DPI / low-sens competitive players who use a lot of arm.
- Soft cloth (Artisan Zero, X-Raypad Equate Plus) for higher-sens / wrist
  players. Replace every 6–12 months — pads dirty up + friction drifts.
- Stitched edges if you slam the edge of the pad on flicks. Otherwise the
  cloth peels at the corners.

## Mouse driver / firmware hygiene

1. Apply firmware once via vendor software.
2. Set DPI / polling / LOD / button mappings.
3. Kill the daemon — Process Lasso → "Always Disabled" on G_HUB.exe /
   RzSynapse.exe / pulsarfusion.exe. Settings persist on the mouse.

## What our catalog does for you

- `ui.mouse.disable-acceleration` — Windows pointer accel off.
- `hid.mouse.priority-realtime` — kernel mouse-class thread runs at
  realtime priority. Catches under-load polling jitter.
- `hid.mouse.queue-size.optimize` — caps the mouse driver event queue at
  20 events so packets get drained sooner.

## What we'd LOVE to do but can't

- DPI / polling / LOD — these live in mouse firmware, not Windows. Vendor
  app is the only path. We link out, document settings, then step aside.

## Sources

- **ProSettings.net** ([Valorant May 2026 guide](https://prosettings.net/guides/valorant-options/),
  [Fortnite May 2026 guide](https://prosettings.net/guides/fortnite-options/),
  [CS2 list](https://prosettings.net/lists/cs2/)) — the largest tracked-pro
  dataset. 650+ Valorant pros, 328 Fortnite pros, hundreds across CS2 +
  Apex. Median / distribution figures above are from these sheets.
- **[Codelife](https://www.youtube.com/channel/UCzwJlXggvorZSvyWwZJ497w)** —
  Fortnite optimization + pro-settings creator + Epic Partner. Best single
  channel for current Fortnite pro-rig coverage.
- **Rocket Jump Ninja** YouTube — mouse-shape grading, sensor reviews.
- **Tarrik / Bryjy** — input-lag mouse reviews.
- **VLR.gg** — Valorant pro-config aggregator.
