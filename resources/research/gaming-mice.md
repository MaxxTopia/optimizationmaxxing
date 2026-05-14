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

## Polling rate — read this before going past 1000 Hz

- **1000 Hz is the right default for Fortnite.** Period. Anything higher
  has CPU cost, and Fortnite is already CPU-bound during 50-player
  endgames where the main thread is starving.
- **4000 / 8000 Hz** generates 4–8× the USB interrupts per second. The CPU
  has to service every one of them. On a 9800X3D running idle, you'll
  never feel it. **On a stacked endgame (40+ players left, 9 builds
  visible, audio mixer engaged) on anything below a 7800X3D, 8000 Hz
  polling has been measured to cost 5–15% on frametime.** That's the exact
  scenario that decides FNCS games. Razer and Logitech both caveat this
  in their own docs.
- **The pro data backs this up.** ProSettings.net May 2026 Valorant: 67%
  on 1000 Hz, 18% on 4000 Hz, 8% on 2000 Hz, 6% on 8000 Hz. Fortnite is
  even more conservative — Peterbot, Bugha, Clix all run 1000 Hz despite
  having 8K-capable mice. The high-poll camp exists, it's just not the
  competitive consensus.
- **Practical rule:** stay at 1000 Hz unless (a) your CPU is 7800X3D / 9800X3D
  tier *and* (b) you've actually A/B-tested it in your endgame replay
  buffer. The 0.5–1 ms latency win at 8K isn't worth a 5–15% frametime
  drop where it matters.
- If you do go higher, pin the mouse driver to a non-game core via Process
  Lasso. Or apply our HID priority + queue size catalog tweaks
  (`hid.mouse.*`).

## Lift-off distance (LOD) — what it is, how to set it, how to test

**What LOD is.** The vertical distance the sensor keeps tracking before
"giving up" when you lift the mouse. Too high = cursor keeps moving when
you reset your aim; too low = sensor cuts out on micro-bumps over a
thicker pad.

**Why it matters more than the number suggests.** Low-sens / arm-drag
players reset position dozens of times per fight. Every reset where the
cursor "follows" the lift instead of staying put is a flick that starts
from the wrong origin. Across a build battle, that's 5–10 mis-aimed
flicks you didn't notice.

**Target setting.** **1 mm** for cloth pads (the mainstream choice). **2 mm**
*only* if you run a thick or stacked pad (Artisan Hayate hybrid + secondary
mat) and notice tracking dropouts on lifts. Modern PAW3950 / Focus Pro
35K / HERO 2 sensors all support sub-1 mm cleanly.

**Where to set it.**

| Vendor | Path |
|---|---|
| Logitech | G HUB → mouse → DPI/Sensor → LOD slider |
| Razer | Synapse → Performance → Lift-off Distance |
| Pulsar | Pulsar Fusion → Sensor → LOD |
| Endgame Gear | Endgame Gear Configurator → Sensor → LOD |
| Finalmouse | xpanel.finalmouse.com (browser) → Sensor → LOD |
| ZOWIE | DPI / LOD set via underside buttons — see ZOWIE manual |

**60-second test to verify.** Pick up your mouse 2 mm off the pad, move
it 5 cm sideways, set it back down. If the cursor moved during the lift,
your LOD is too high — drop it one notch. If the cursor *cuts out
mid-stroke* on a normal swipe (sensor drops then re-acquires), your LOD
is too low for your pad — raise it one notch.

**Calibration matters more than the absolute number.** The Razer Focus
Pro 35K sensor (Viper V3 Pro / Cobra Pro) has a per-pad Surface
Calibration in Synapse — run it once on the actual pad you use, not the
default profile. Same for Endgame Gear's surface tuning.

## Mouse acceleration

- **OFF.** Always. Both Windows-side and game-side.
- Our `ui.mouse.disable-acceleration` catalog tweak flips the three
  HKCU registry values. Game-side: every competitive title has a "raw
  input" or "no acceleration" toggle.

## Recommended mice (2025–2026 generation)

| Mouse | Weight | Polling | Sensor | Verdict |
|---|---|---|---|---|
| [Logitech G Pro X Superlight 2](https://www.logitechg.com/en-us/products/gaming-mice/pro-x-superlight-2-wireless-lightspeed.html) | 60 g | 8000 Hz | HERO 2 | All-rounder GOAT — Peterbot / Mongraal / Veno / Reet |
| [Razer Viper V3 Pro](https://www.razer.com/gaming-mice/razer-viper-v3-pro) | 54 g | 8000 Hz | Focus Pro 35K | Fastest sensor on the market |
| [Pulsar X2 V3](https://pulsar.gg/products/x2-v3) | 52 g | 8000 Hz | XS-1 | Best price-perf flagship |
| [Endgame Gear OP1 8K](https://endgamegear.com/gaming-mice/op1-8k) | 52 g | 8000 Hz | PAW3950 | Minimal shape, hardcore |
| [ZOWIE EC2-CW / EC3-CW](https://zowie.benq.com/en-us/peripheral/mouse.html) | 70–77 g | 1000 Hz | 3370 | CS-tier classic ergo |
| **Finalmouse UltralightX Prophecy** | 33 g | 8000 Hz | proprietary | **Lightest serious competitive mouse — and configures via [xpanel.finalmouse.com](https://xpanel.finalmouse.com) in your browser, no software install. Same model in 3 sizes (classic / medium / small).** |

**Why the Finalmouse XPANEL matters:** zero driver/daemon to install, kill,
or babysit. Settings (DPI, LOD, polling, Motion Sync) save to the mouse
itself. Same idea as Wooting's wootility-web for keyboards. If you hate
G HUB / Synapse / pulsarfusion eating background memory + occasionally
hijacking mouse settings on Windows updates, this is the cleanest path.

**Avoid:** mice with vendor software that can't be killed after configuration
(some Razer Synapse versions, MSI software). Anything that requires a
running daemon to keep DPI / polling / LOD applied is a bad pick — those
should store on the mouse, not in Windows.

## Mouse skates / feet (replacement)

Stock skates wear in 3-9 months of heavy play. Aftermarket skates =
faster glide, controlled stop, no peeling-corner risk on aggressive
flicks. Boardzy keeps a running 200+ mouse + accessory tierlist on
[YouTube](https://www.youtube.com/@boardzy) — best single source for
current consensus.

| Brand | Glide | Best for | Notes |
|---|---|---|---|
| **Tiger Arc / Arc 2** | Controlled | Default pick — durability + price | Most-recommended budget pick on r/MouseReview. Don't peel at corners. |
| **Corepad Skatez Air** | Fast | Day-one releases for new mice | Has effectively replaced Hyperglide for new mouse drops (Hyperglide ships slow + stocks out). 100% PTFE. |
| **Hyperglide** | Fastest | Established mouse models | Original PTFE skate — still the speed reference where in stock. |
| **Hotline Games** | Controlled | Budget tier with cuts for less-common mice | Ships pre-cut for mice nobody else stocks. |
| **X-Raypad Obsidian** | Fast | If you run X-Raypad pads | Designed to pair with Equate / Aqua Control + family. |

**Application tip.** Clean the underside with isopropyl 90%+ before
applying. Press each skate firmly for 10 s with a finger. Wait 10 min
before first use — the adhesive needs to settle or skates lift on the
first quick swipe.

## Mousepad

- **XL hard pad** (Pulsar Paracontrol, Artisan Hayate, ZOWIE G-SR-SE) for
  low-DPI / low-sens competitive players who use a lot of arm.
- Soft cloth (Artisan Zero, X-Raypad Equate Plus) for higher-sens / wrist
  players. Replace every 6–12 months — pads dirty up + friction drifts.
- Stitched edges if you slam the edge of the pad on flicks. Otherwise the
  cloth peels at the corners.

## Mouse driver / firmware hygiene

1. Apply firmware once via vendor software (or browser, for Finalmouse).
2. Set DPI / polling / LOD / button mappings.
3. Kill the daemon — Process Lasso → "Always Disabled" on G_HUB.exe /
   RzSynapse.exe / pulsarfusion.exe. Settings persist on the mouse.

Finalmouse skips this step entirely — XPANEL is browser-based, nothing
to kill.

## What our catalog does for you

- `ui.mouse.disable-acceleration` — Windows pointer accel off.
- `hid.mouse.priority-realtime` — kernel mouse-class thread runs at
  realtime priority. Catches under-load polling jitter.
- `hid.mouse.queue-size.optimize` — caps the mouse driver event queue at
  20 events so packets get drained sooner.

## What we'd LOVE to do but can't

- DPI / polling / LOD — these live in mouse firmware, not Windows. Vendor
  app (or browser configurator, for Finalmouse / Wooting) is the only path.

## Sources

- **ProSettings.net** ([Valorant May 2026 guide](https://prosettings.net/guides/valorant-options/),
  [Fortnite May 2026 guide](https://prosettings.net/guides/fortnite-options/),
  [CS2 list](https://prosettings.net/lists/cs2/)) — the largest tracked-pro
  dataset. 650+ Valorant pros, 328 Fortnite pros, hundreds across CS2 +
  Apex.
- **[Boardzy](https://www.youtube.com/@boardzy)** — 200+ mouse + accessory
  tierlist updated annually. Best current source for skate / mouse / pad
  consensus.
- **[Codelife](https://www.youtube.com/channel/UCzwJlXggvorZSvyWwZJ497w)** —
  Fortnite optimization + pro-settings creator + Epic Partner. Best single
  channel for current Fortnite pro-rig coverage.
- **Rocket Jump Ninja** YouTube — mouse-shape grading, sensor reviews.
- **Tarrik / Bryjy** — input-lag mouse reviews.
- **VLR.gg** — Valorant pro-config aggregator.
- **r/MouseReview** — community consensus on skates + sensors + niche shapes.
- **[Finalmouse XPANEL](https://xpanel.finalmouse.com)** — browser-based
  configurator for the UltralightX Prophecy line.
