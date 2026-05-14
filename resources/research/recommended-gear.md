# Recommended gear — what to look for, not which to buy

Hardware tier lists rot fast (a "best mouse 2026" article is wrong by Q3). What follows is the **framework** you use to vet a piece of gear, plus the specs that genuinely matter for tournament play. When a specific product is mentioned it's because the spec it represents is canonical.

## Mouse — what to demand

- **Sensor:** PixArt PMW3950 / PAW3395 / Razer Focus Pro 30K. Anything older = pass. Track DPI deviation, lift-off distance < 1 mm, no smoothing.
- **Polling rate:** 1000 Hz minimum. **8000 Hz on flagship** is not placebo — the latency distribution tightens visibly under our polling-rate stability test (deferred feature). 4000 Hz is a sweet spot for most rigs (8000 Hz can DPC-spike on weaker USB hosts).
- **Wireless:** the right wireless mouse beats a wired one because it's lighter, not because the radio is faster. If you're not on a 4K-receiver-with-paracord-style donglehub, wired is honest.
- **Weight:** under 65 g. Modern flagships hit 50 g without sacrificing battery. A heavy mouse trains slower flicks — period.
- **Shape:** matters more than spec. Buy in person if possible; specs only tell you which mice DESERVE consideration.

## Keyboard — what to demand

- **Hall-effect / magnetic switches** if you're competing seriously. Adjustable actuation point + Rapid Trigger is not optional in 2026 for tac-shooters.
- **Polling rate:** 1000 Hz minimum. Some hall-effect keyboards now expose **8000 Hz** — same caveat as mouse polling (USB host has to handle it cleanly).
- **N-key rollover:** non-negotiable.
- **Form factor:** 60% / 65% / TKL. Anything bigger eats mouse-arm space. Numpad-on-the-right is a competitive disadvantage for low-sens players.
- **Software:** if the configurator is web-only or requires a constant-running service, skip — you don't want vendor-bloat eating CPU mid-match.

## Mousepad

- **Size:** XL minimum (450 × 400 mm). Tournament players don't change pad size between games.
- **Surface:** "control" pads (Artisan Zero / Hayate Otsu / X-raypad pads) for low-sens, "speed" pads for high-sens. Which one you prefer is a personal-feel test, not a spec.
- **Stitched edges:** keeps the cloth from peeling at year 2.
- **Replace yearly.** Pads compress + the surface texture wears flat. A worn pad is invisible micro-input-jitter. Budget for it.

## Network — fiber + ONU + SFP+

- **Connection type:** **fiber-to-the-home with a managed ONU** is the meaningful upgrade. Cable + DOCSIS adds variable jitter that Tournament FPS preset can't fix.
- **ONU options:** the carrier-supplied ONU is usually fine; if it has a wifi-router built-in, **bypass it** with a separate router so the ONU just handles fiber↔ethernet.
- **SFP+ stick** instead of an ONU: only worth it if your carrier supports XGS-PON and you want to put the SFP+ directly in your router (skips one device, one HOP, one source of variable buffering). Not a meaningful latency win on 1 Gbps services.
- **Router:** wired ethernet from the router to the gaming rig. Cat6 is sufficient. Wifi for gaming is a handicap regardless of how good your AP is — interference is non-deterministic.
- **Switch:** unmanaged gigabit consumer switch is fine. **Don't** put a managed enterprise switch in line — many of them buffer packets at the QoS layer in ways that add 1-3 ms of variable latency for no benefit on a single-host LAN.

## Monitor

- **Refresh rate:** 240 Hz is the new floor for competitive. 360 Hz / 480 Hz OLEDs are the real flex.
- **Panel type:** OLED for color + response time, IPS for sustained brightness, TN is dying.
- **Adaptive sync:** G-Sync compatible (over DisplayPort) ON in driver, FPS capped 3 below max refresh in-game (per the NVIDIA Reflex research article). VRR + capped FPS = lowest input lag at high FPS **for most games**.
  - **Fortnite caveat:** at 240+ Hz with stable FPS above refresh, pros run **G-Sync OFF + V-Sync OFF + Reflex On+BOOST + uncapped or refresh-3 cap**. At that frame rate the marginal G-Sync overhead (per [Blur Busters G-Sync 101](https://blurbusters.com/gsync/gsync101-input-lag-tests-and-settings/)) loses to raw V-Sync-off rendering, and tearing is essentially invisible. For lower-refresh / unstable-FPS rigs the standard G-Sync stack still wins.
- **Connection:** DisplayPort 1.4 or 2.0. HDMI 2.1 is fine but DP is the desktop-PC native.
- **Cable quality:** matters more than people admit on 4K@240+ — buy a **DP 1.4-rated certified cable**, not the cheapest one.
- **Firmware update:** check the vendor's support page yearly. ASUS / LG / Samsung have shipped meaningful frame-pacing fixes in firmware updates.

## Audio

- **Wired headset > wireless** for competition. Same wireless argument as mouse — wireless audio adds 5-30 ms of buffering depending on codec.
- **DAC / AMP:** doesn't help latency; helps imaging. Imaging matters in CS / Valorant / R6 (footstep direction). If you can hear footsteps with onboard audio, save the money.
- **Disable audio enhancements** in Windows Sound panel. We don't have a one-click for this yet (research-article queue item).

## What we don't ship VIP-tier links for

We don't run an Amazon-affiliate scheme and we don't take vendor money. The gear list in this article is **what to look for**, not where to click. If you want specific 2026-current product picks, the relevant communities (Tom's Hardware, Linus Tech Tips' WAN show, the Esports Boost discord) update tier lists quarterly with real testing data — not glossy "best of" articles.

## What an actual VIP edition would unlock

The current `vipGate: 'vip'` field on tweaks gates the highest-risk + highest-reward entries (cpu-mitigations off, MSI mode, HVCI off, NIC offload disables, IFEO priority tweaks). We don't have a leaderboard / supporter badge / Discord-verified-pro flair yet — those need a backend we haven't built. The 4-theme system (Val / Sonic / DMC / BO3) does already exist as a free customization surface, so "supporter custom skin" is technically already there for any user.
