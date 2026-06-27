# BIOS + system tweaks vs tournament rules

You don't lose tournaments to a missing 2% FPS. You lose them to a single
disabled mitigation that flagged your account on the first match. This
guide maps every catalog tweak that touches Secure Boot / TPM / VBS /
IOMMU / Hyper-V / mitigations against the four anticheats you'll meet in 2026.

## Per-anticheat rules (verified against vendor docs, 2026)

> **Heads-up (the big 2025-2026 shift):** the floor is moving past TPM + Secure
> Boot toward **IOMMU + VBS attestation**. Fortnite now requires IOMMU for
> tournaments, FACEIT requires TPM/Secure Boot for all CS2 + IOMMU/VBS by Elo,
> and RICOCHET gates CoD playlists via Azure Attestation. Treat anything that
> disables VBS/Memory Integrity as competitive-risky — see the trend note under
> the compliance map.

### Fortnite — Easy Anti-Cheat (FNCS)

- **Required:** As of the **Feb 19, 2026** Epic anti-cheat update, tournament /
  competitive eligibility now needs **three** BIOS security features ON:
  **Secure Boot + TPM 2.0 + IOMMU** (Intel VT-d / AMD-Vi). The older
  two-feature floor (TPM + Secure Boot only) is no longer enough — enable all
  three or you're blocked from tournaments. Win11 hardware floor; Epic enforces
  tournament eligibility on Win11 only.
- **Allowed:** Hyper-V off (most hardware doesn't run it by default).
  **Caveat:** enabling IOMMU can require turning VBS / Memory Integrity ON, so
  the catalog's "VBS off is safe for Fortnite" verdict can conflict with the
  IOMMU tournament requirement — leave VBS alone if you compete in FNCS.
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

- **Required by VAC:** Nothing at the BIOS level — Valve's VAC / Premier
  matchmaking is a signature-and-behaviour engine with no BIOS requirement.
  That narrow part is still true.
- **Required by FACEIT (the dominant third-party platform):** TPM 2.0 +
  Secure Boot are **mandatory for ALL players since Nov 25, 2025**. IOMMU + VBS
  are enforced in expanding waves — already mandatory for everyone **above
  3,000 Elo since Aug 2025** (limited rollout since April 2025). FACEIT pairs
  IOMMU with VBS, so **disabling HVCI / Memory Integrity (part of VBS) risks
  the FACEIT Anti-Cheat refusing to launch** and losing competitive
  eligibility. CS2 is **no longer "the most permissive ranked AC"** for anyone
  who plays FACEIT.
- **Hard ban:** Known cheat signatures + macro / AHK scripts on FACEIT.
- **Soft ban:** Trust Factor downgrade for new accounts, weird HW IDs,
  Steam-side flags.

### Warzone / OW2 — RICOCHET (kernel)

- **Required:** As of **RICOCHET Season 04 (June 4, 2026)**, TPM 2.0 + Secure
  Boot are required to access **ALL playlists** in Black Ops 7 and Warzone —
  not just ranked. Enforcement is via **Microsoft Azure Attestation**: players
  who fail attestation aren't fully locked out, but are pushed into a separate
  restricted matchmaking pool (Nuketown 24/7 in BO7, Battle Royale Casual in
  Warzone) and can't match with compliant PC or console players. CoD's kernel
  anti-cheat is **RICOCHET** (not BattlEye — RICOCHET has been CoD's engine
  since 2021); RICOCHET is what enforces the Secure Boot / TPM attestation.
  OW2 uses Blizzard's Defense Matrix and is laxer.
- **Allowed:** VBS off (rare flags), Hyper-V off, mitigations off (rare
  flags).
- **Hard ban:** Same as Vanguard — kernel cheats + hypervisor abuse.

## Catalog tweak compliance map

The Tweaks page already shows ⚠ pills on tweaks with a verdict. Here's
the underlying logic:

| Tweak | Fortnite | Valorant | CS2 | Warzone |
|---|---|---|---|---|
| Disable HVCI / Memory Integrity (`vbs.hvci.disable`) | **risk** | **risk** | **risk** | **risk** |
| IOMMU / VT-d / AMD-Vi OFF in BIOS (not a catalog tweak) | **risk** | safe | **risk** | safe |
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

**The 2025-2026 IOMMU + VBS attestation trend (why HVCI disable is now risky
almost everywhere):** the defining shift this cycle is anticheats demanding
**IOMMU and VBS**, not just TPM + Secure Boot. Fortnite added IOMMU for
tournaments (Feb 19, 2026); FACEIT made TPM/Secure Boot mandatory for all CS2
players (Nov 25, 2025) and enforces IOMMU + VBS in waves (>3,000 Elo since Aug
2025); RICOCHET expanded Azure-attestation TPM/Secure Boot gating across all CoD
playlists (S04, June 2026). The practical upshot: **`vbs.hvci.disable` is now
risk for every competitive title above** — disabling VBS/Memory Integrity can
block FACEIT CS2 and conflict with Fortnite's IOMMU requirement (enabling IOMMU
often forces VBS on). IOMMU is a **BIOS toggle this app never touches**, but if
you compete in Fortnite or FACEIT CS2 it must be ON — verify it in your BIOS,
not here.

## What we don't touch (and won't)

- **Secure Boot.** Never. Disabling Secure Boot kills Vanguard + BattlEye.
- **TPM 2.0.** Same — no toggle in this app, ever.
- **Driver signature enforcement** (test mode). Same.
- **Anything that disables the kernel-level AC drivers themselves.** Even
  on a "single-player rig," the AC driver is what allows you to launch the
  game. We never touch them.

## Pre-tournament checklist

1. Apply the Tournament FPS preset (no risk-flagged tweaks in it by design).
2. Verify on the Diagnostics page: Secure Boot reads ON + Hyper-V reads "off".
   **For Fortnite (FNCS) or FACEIT CS2:** VBS / Memory Integrity must read **ON**
   and IOMMU (VT-d / AMD-Vi) must be enabled in BIOS — do NOT disable HVCI/VBS.
   For Valorant / Warzone where VBS-off is still allowed, "VBS fully off" is fine.
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
- Fortnite IOMMU + Secure Boot + TPM tournament requirement (Feb 19, 2026):
  https://www.fortnite.com/competitive/rules-guidelines/rules-library/new-fortnite-anti-cheat-pc-requirements-and-latest-legal-action
  and https://tracker.gg/fortnite/articles/how-to-enable-secure-boot-tpm-and-iommu-for-fortnite
- FACEIT rollout of TPM / Secure Boot / IOMMU / VBS (Nov 25, 2025 mandate):
  https://www.faceit.com/news/faceit-rollout-of-tpm-secure-boot-iommu-and-vbs
  and https://support.faceit.com/hc/en-us/articles/12452232454940-Enabling-Windows-Security-Requirements
- Call of Duty BO7 / Warzone RICOCHET Season 04 attestation across all playlists
  (June 4, 2026): https://www.callofduty.com/blog/2026/06/call-of-duty-black-ops-7-warzone-ricochet-anti-cheat-season-04
  and https://support.activision.com/articles/trusted-platform-module-and-secure-boot
