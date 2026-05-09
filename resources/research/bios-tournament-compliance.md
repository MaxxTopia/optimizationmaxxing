# BIOS + system tweaks vs tournament rules

You don't lose tournaments to a missing 2% FPS. You lose them to a single
disabled mitigation that flagged your account on the first match. This
guide maps every catalog tweak that touches Secure Boot / TPM / VBS /
Hyper-V / mitigations against the four anticheats you'll meet in 2026.

## Per-anticheat rules (verified against vendor docs, 2026)

### Fortnite — Easy Anti-Cheat (FNCS)

- **Required:** TPM 2.0 + Secure Boot ON (Win11 hardware floor; Epic
  enforces tournament eligibility on Win11 only).
- **Allowed:** VBS / HVCI off. Hyper-V off (most hardware doesn't run it
  by default).
- **Hard ban:** HWID spoofers, kernel-level injectors, ANY tool advertising
  "anti-anticheat."
- **Soft ban / unrank:** Driver-signature enforcement off (test mode), sus
  process injectors (RTSS overlays usually OK; aggressive ones aren't).

### Valorant — Vanguard (VCT)

- **Required:** Secure Boot ON, TPM 2.0, Vanguard service running, kernel
  driver loaded at boot (not just on game launch).
- **Allowed:** VBS off, HVCI off (each tournament season Vanguard's
  thresholds shift — verify the day-of). Most BIOS perf tweaks pass.
- **Hard ban:** Hypervisor-based cheats. Disabling Hyper-V is OK but a
  loaded hypervisor that isn't Windows' is an instant ban.
- **Soft ban / "Vanguard-required"** error at launch: Test-mode signing,
  CSM legacy boot, Secure Boot off.

### CS2 — VAC + ESL/FACEIT clients

- **Required by VAC:** Nothing at the BIOS level — VAC is a
  signature-and-behaviour engine. ESL / FACEIT add their own kernel
  AC clients with their own checks.
- **Allowed:** Almost everything. CS2 is the most permissive ranked AC.
- **Hard ban:** Known cheat signatures + macro / AHK scripts on FACEIT.
- **Soft ban:** Trust Factor downgrade for new accounts, weird HW IDs,
  Steam-side flags.

### Warzone / OW2 — BattlEye + Ricochet (kernel)

- **Required:** TPM 2.0 + Secure Boot ON for ranked CoD; BattlEye demands
  Secure Boot on most builds. OW2 is laxer.
- **Allowed:** VBS off (rare flags), Hyper-V off, mitigations off (rare
  flags).
- **Hard ban:** Same as Vanguard — kernel cheats + hypervisor abuse.

## Catalog tweak compliance map

The Tweaks page already shows ⚠ pills on tweaks with a verdict. Here's
the underlying logic:

| Tweak | Fortnite | Valorant | CS2 | Warzone |
|---|---|---|---|---|
| Disable HVCI / Memory Integrity (`vbs.hvci.disable`) | safe | **risk** | safe | **risk** |
| BCD: Disable Hyper-V at Boot (`bcd.hypervisorlaunchtype.off`) | safe | **risk** | safe | safe |
| Spectre / Meltdown mitigations off (`process.cpu-mitigations.disable-DANGER`) | **risk** | **risk** | safe | **risk** |
| Game-priority IFEO (`process.fortnite/valorant/cs2.priority-high`) | safe | safe | safe | safe |
| Service kills (WerSvc / MapsBroker / Geolocation / etc.) | safe | safe | safe | safe |
| HID priority + queue size (`hid.mouse.*` / `hid.keyboard.*`) | safe | safe | safe | safe |
| NIC offload tweaks (Interrupt Mod / RSS / Flow Control) | safe | safe | safe | safe |
| Hosts-block telemetry / Windows ads | safe | safe | safe | safe |

**"Risk"** does NOT mean automatic ban. It means: anticheat may either fail
to load (forcing you off ranked until you re-enable), or trip a flag that
gets revisited if anything else looks unusual. **Don't ship to a tournament
with risk-flagged tweaks active.** The "hide tournament-breaking" filter on
the Tweaks page hides them when you've selected your game.

## What we don't touch (and won't)

- **Secure Boot.** Never. Disabling Secure Boot kills Vanguard + BattlEye.
- **TPM 2.0.** Same — no toggle in this app, ever.
- **Driver signature enforcement** (test mode). Same.
- **Anything that disables the kernel-level AC drivers themselves.** Even
  on a "single-player rig," the AC driver is what allows you to launch the
  game. We never touch them.

## Pre-tournament checklist

1. Apply the Tournament FPS preset (no risk-flagged tweaks in it by design).
2. Verify on the Diagnostics page: VBS Status reads "fully off" + Hyper-V
   reads "off" + Secure Boot reads ON.
3. Boot into the game once for a casual match. If anticheat loads, you're
   fine. If it errors, hit Restore Point in Settings.
4. Bring the laptop / second rig as backup. We've seen 0% of users get
   banned for these tweaks; we've seen 100% of "I'll wing it" lose a slot.

## Citations

- Vanguard support docs (Riot Help Center) — TPM/Secure Boot requirement.
- BattlEye vendor docs.
- VACnet whitepaper / public Steam Trust Factor research.
- Epic FNCS competitive ruleset (latest published season).
- Microsoft Learn — Secure Boot + VBS + HVCI documentation.
