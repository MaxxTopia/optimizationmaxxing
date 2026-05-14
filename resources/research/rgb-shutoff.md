# Turn RGB off — for real, persistently, without leaving software running

> **The honest input-delay audit first.** The LEDs themselves don't cause
> measurable input delay. RGB control *software* (iCUE, Razer Synapse,
> Aura, Mystic Light, etc.) sitting in the background polling USB at
> 60–1000 Hz to push color frames absolutely does. DPC pulls from
> Hardware Unboxed + Gamers Nexus repeatedly catch iCUE and Synapse
> spiking 200µs+ on otherwise-quiet rigs. So the fix is two halves:
>
> 1. **Kill the software's autostart** — the catalog tweak
>    `Disable RGB control apps at startup` does this. Real, measurable
>    win whether your LEDs are on or off.
> 2. **Persistently set the LEDs off at the controller level** — what
>    this guide is for. After this one-time setup, the LEDs stay off
>    across reboots with no software needed.

If you only do half-1, your LEDs stay at whatever color they were when
the software was last running. Most stuck on the rainbow default.
Half-2 fixes that without bringing the software back to life every boot.

---

## T-Force RAM specifically (TeamGroup)

T-Force RGB RAM ships defaulted-on at the LED controller. There's no
BIOS RGB-off toggle on most boards. The fix:

1. **Install T-Force Blitz** one time — TeamGroup's official RGB tool.
   <https://www.teamgroupinc.com/en/download/> → search "T-Force Blitz."
   ~80 MB installer.
2. Launch Blitz. Select your RAM module(s) in the device list.
3. Set effect to **"Static"**, color to **black / `#000000`**, brightness
   to **0**. Apply to all zones.
4. Click **"Save"** / **"Sync to Memory"** in Blitz — this writes the
   off-state to the RAM module's onboard controller flash. The LEDs are
   now persistent-off independent of any software.
5. **Uninstall T-Force Blitz** from Settings → Apps. Reboot.
6. LEDs stay off. Forever. No background process, no kernel driver,
   no startup tax.

That's it. Same flow works for setting any static color permanently — you
only need Blitz running long enough to flash the controller.

> If Blitz says "Save successful but settings revert on reboot," your
> RAM kit is from a batch with the older controller that doesn't support
> save-to-flash (rare on 2023+ T-Force kits, common on early Delta-RGB).
> In that case fall back to OpenRGB or unplug the RGB power — see below.

---

## Per-component playbook

### Motherboard RGB (Aura / Mystic Light / RGB Fusion / Polychrome)

**First check BIOS.** Even if there's no top-level "RGB off" item, most
2020+ boards have it nested under:

- **ASUS:** Advanced → Onboard Devices Configuration → **RGB LED** /
  **Onboard LED** → Disabled
- **MSI:** Settings → Advanced → Integrated Peripherals → **Onboard LED
  Switch** / **EZ LED Control** → Off
- **Gigabyte:** Settings → IO Ports → **Onboard LEDs** / **RGB Fusion**
  → Off (also F2 Easy Mode has the "LED" toggle on AORUS boards)
- **ASRock:** Advanced → Onboard Devices Configuration → **RGB LED** → Off

If your BIOS truly doesn't expose it, fall back to the vendor app's
save-to-flash mode (same flow as the T-Force section, just substitute
Aura/Mystic Light/Fusion/Polychrome).

**Addressable headers (ARGB/12V/5V):** If you have RGB fans or strips
chained off the mobo, the BIOS toggle controls the entire chain. If
not exposed, **unplug the ARGB header pin** from the board. Zero
software, zero firmware, just physics.

### GPU RGB

Each vendor:

- **MSI Gaming X / Trio / Suprim:** MSI Center → Mystic Light → set GPU
  zones black + save → uninstall MSI Center
- **ASUS ROG / TUF:** Armoury Crate → Aura Sync → off + save → uninstall
  Armoury Crate. (Caveat: Armoury Crate has multi-app removal nuisance.
  Use ASUS's official "Armoury Crate Uninstall Tool.")
- **Gigabyte AORUS:** RGB Fusion → off + save → uninstall
- **EVGA:** Precision X1 → LED → off + save → uninstall

GPUs almost universally retain the LED setting in NVRAM across reboots
once you've saved it, so the uninstall is safe.

### Case fans / AIO pump

If they daisy-chain off a controller hub (Lian Li L-Connect, NZXT CAM,
Corsair Commander, Cooler Master controller), the same save-to-flash
flow applies to the hub firmware. Set off → save → uninstall.

If the fans plug directly into mobo ARGB headers, see the motherboard
section above.

**AIO pumps with screens** (NZXT Kraken Elite, Corsair iCUE H150i with
LCD, Lian Li Galahad Trinity) are different — the screen needs the
vendor app to push frames. If you want the screen blank, set a static
black image, save, and the screen retains it; software can then stay
off. If you want the pump LEDs off but the screen running, you usually
need the vendor app running. There's no clean answer there.

### Mouse / keyboard / headset

Per-device, set static color to black or to an "off" / "static-off"
mode, save the profile **to the device's onboard memory** (every modern
gaming peripheral has this). After saving, uninstall the vendor app.

- **[Logitech G HUB](https://www.logitechg.com/en-us/innovation/g-hub.html):** Onboard Memory Mode → set color black → save
- **[Razer Synapse](https://www.razer.com/synapse-4):** Set to "None" effect → save to onboard profile slot
- **[Corsair iCUE](https://www.corsair.com/us/en/s/icue):** Hardware Profile tab → set lighting off → save to device
- **[SteelSeries GG](https://steelseries.com/gg):** Engine → CONFIGURE → lighting off → save to device

This is the single biggest "background app tax" recovery you'll feel.
Razer Synapse and iCUE are the most expensive RGB apps on a stock rig.

---

## OpenRGB fallback (one tool, every component)

If the per-vendor save-to-flash route doesn't stick — or if you just
want one tool for everything — OpenRGB is the open-source universal
controller. <https://openrgb.org>

**Anti-cheat caveat first.** OpenRGB uses the `inpoutx64.sys` kernel
driver to hit SMBus for RAM RGB. WinRing0-class signed driver, same
posture as HWInfo / AIDA64. **Vanguard, EAC, BattlEye don't flag it as
of mid-2026**, but the driver-loading event is visible to any kernel AC
and could be flagged in a future update. So:

- **OK:** run OpenRGB **once** to set static-off + save to device flash
  on supported hardware, then exit. Driver unloads at exit.
- **Not OK:** run OpenRGB as a startup service (`--startminimized`)
  during ranked / tournament play. The driver stays loaded the whole
  session. Same reason we ship LHM as opt-in, not auto-start.

The save-to-flash menu in OpenRGB is per-device. Right-click a device →
"Save Mode To Device." Devices that support it: most G.Skill Trident Z5,
some Corsair Vengeance RGB Pro, most ASUS Aura mobos, all Gigabyte AORUS
mobos with onboard LED storage. Devices that **don't**: most cheaper
ARGB fans, most ARGB strips, the entire NZXT lineup (NZXT bakes RGB
control into the controller hub, not the device).

---

## The "I just want them off and don't care about elegance" route

**Unplug the RGB header.** Mobo RGB strip header is usually labeled
JRGB / JRAINBOW / LED_C1. ARGB fan headers are 3-pin 5V (vs 4-pin 12V
for the older non-addressable). Pull the plug, RGB is off forever.

For RAM, you can't unplug the LEDs without disassembling the module —
this is where the T-Force Blitz save-to-flash flow is the actual fix.

---

## What this guide deliberately doesn't recommend

- **Auto-starting OpenRGB at boot.** Loads the kernel driver every
  session for cosmetic reasons. Not worth the AC exposure for a
  competitive rig.
- **Group Policy registry hacks to "force all USB RGB off."** No such
  thing exists. RGB controllers ignore generic OS-level toggles —
  they're powered from the SATA/PCIe rail and ignore Windows.
- **Disabling the LED kernel driver in Device Manager.** Some forum
  posts suggest this. It either does nothing (the LEDs are controlled
  off-CPU) or breaks the vendor app such that you can't reach the
  save-to-flash menu in step one. Counterproductive.

If the per-vendor save-to-flash + uninstall flow works on your gear,
that's the cleanest end state: zero background processes, zero kernel
drivers loaded for cosmetic reasons, LEDs persistently off across power
cycles. Pair it with the catalog tweak above and your RGB stack is
fully neutralized.
