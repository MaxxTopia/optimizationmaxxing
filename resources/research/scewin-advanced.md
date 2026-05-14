# SCEWIN — full BIOS audit for advanced tuners

SCEWIN (`SCEWIN_64.exe`) dumps every UEFI variable on your motherboard to a plain-text file. Read it, diff it, audit it — then go change settings **in the BIOS UI itself**.

**Use SCEWIN to read. Never to write.** A bad write can leave the board unable to POST (recovery = SPI flasher + BIOS chip reflash). The 4-step panel above is the only workflow we recommend.

This guide is for advanced users who want a complete audit of their BIOS state — finding settings the vendor hid, catching post-update resets, and verifying tunes stuck after a reboot. If you accept the trade-off (you do the work in BIOS, we never push a write), SCEWIN is the single best tool for *finding* every knob you have.

---

## When SCEWIN earns its keep

1. **Catalog every hidden setting.** Most boards expose ~30-40% of variables in the BIOS UI. The rest are vendor-suppressed defaults you can only see via a dump.
2. **Diff before / after.** Apply one change, reboot, re-dump. Anything moving besides your target = your board reset something on you (common after CMOS clear, BIOS flash, or a flaky save).
3. **Cross-rig comparison.** Compare your dump against a teammate's known-good rig on the same chipset. Settings that differ are the diff list to investigate.
4. **Pre-update snapshot.** Dump before flashing a BIOS update. Vendor updates routinely reset PBO / EXPO / fan curves to stock — you have a target state to manually restore from.

---

## Getting SCEWIN

SCEWIN is part of the AMI Aptio toolkit — vendor-distributed, not publicly downloaded. Common sources:

- **Vendor service / RMA tools** (sometimes bundled with motherboard manufacturer utilities)
- **TechPowerUp + Overclock.net threads** — unsigned community uploads, VirusTotal-scan before running
- **AMI partner channel** if you have an OEM relationship

If you can't find a known-clean copy, stop here and use vendor docs + the in-BIOS UI. Don't run a random executable that touches NVRAM.

---

## The workflow (mirrors the panel above)

### 1. Dump

Run from an **admin Command Prompt** (not PowerShell — SCEWIN's args are cmd.exe-style):

```
SCEWIN_64.exe /o /s pre-tune.txt
```

- `/o` = output to file
- `/s` = silent (no console flood)

Save `pre-tune.txt` somewhere off the rig (USB, cloud). Treat it like a system backup — if the board ever fails to POST after a tune, this file is your reference for what it looked like before.

### 2. Diff

Open the dump in any text-diff tool — VS Code's built-in diff, Beyond Compare, Notepad++ Compare plugin, WinMerge. If you have a teammate dump or a previous snapshot of your own rig:

```
code --diff pre-tune.txt teammate.txt
```

Each variable appears as a `Setup Question` block with a numeric `Token`, current `Value`, and an `Options` list of all selectable values for that variable. The diff shows you which variables differ and what values they're set to on each side.

### 3. What to actually look for

Skim the dump for these high-impact variables. Variable names are vendor-specific (Intel boards use one naming scheme, AMD another) — search by keyword.

**Big FPS / latency wins:**

- **Resizable BAR / Above 4G Decoding** — GPU mapping. Should be ON (`01`). Common in dumps to find this set OFF after a BIOS update.
- **CSM (Compatibility Support Module) / Legacy Boot** — should be OFF. CSM ON disables Resizable BAR + slows boot.
- **PCIe ASPM (Active State Power Management)** — set to `Disabled` for lowest latency, `L1` if you need package-C-state idle power savings. Don't run `L0s` or `Auto`.
- **PCIe Link Speed for the GPU slot** — force `Gen4` or `Gen5` instead of `Auto`. Some boards drop to Gen3 on cold boot.
- **Power Supply Idle Control** (AMD) — set to `Typical Current Idle`. The default `Low Current Idle` can cause idle crashes on Ryzen 7000 / 9000.

**Memory:**

- **DOCP / EXPO / XMP profile** — verify the profile actually applied. The dump shows the live timing values, not just "EXPO enabled".
- **Memory Context Restore** (AMD) — ON saves 5-10s on POST after a successful train.
- **Power Down Mode** — OFF for the lowest memory latency. ON saves a tiny bit of idle power.
- **Gear Mode** (Intel) — `Gear 1` is lower-latency than `Gear 2` if your DDR speed allows it.

**CPU:**

- **PBO (Precision Boost Overdrive)** + **Curve Optimizer** values per-core (AMD) — verify the per-core CO offsets actually committed. Easy to set in UI, easy for the board to silently revert.
- **MCE (Multi-Core Enhancement)** (Intel) — `Disabled` is spec, `Enabled` is the vendor's all-core boost. Performance vs power / heat trade is on you.
- **C-States** (specifically C6 / Package C-States) — `Disabled` is lowest latency, `Auto` is best for idle power. Tournament rigs disable; daily drivers leave on auto.
- **CPU SVID Behavior** (Intel) — `Intel's Failsafe` raises voltage, `Trained` runs the calibrated curve. Match what your stability testing converged on.

**iGPU / display path:**

- **Primary Display** — force `PEG` (PCIe Express Graphics) so the GPU drives the desktop, not the iGPU.
- **iGPU Multi-Monitor** — OFF unless you're explicitly using both.

Note variables that look out-of-range or that you don't recognize. Cross-reference against your motherboard manual or [The Stilt's BIOS guides](https://www.overclock.net/) for naming.

### 4. Apply changes in BIOS UI

Take the list from step 3 into BIOS. Change **one setting at a time**, reboot, validate stability with TestMem5 (RAM) or OCCT (voltage / current). Bundling changes is how you spend a weekend chasing a phantom crash to one of three things you flipped at once.

Hit **Save & Exit**, not Discard. Some boards stack a "Save changes?" confirm dialog on top of the F10 hotkey — if you miss it, the change rolls back.

### 5. Verify

Re-dump after reboot:

```
SCEWIN_64.exe /o /s post-tune.txt
```

Diff `post-tune.txt` against `pre-tune.txt`. **Exactly the variables you intended to change should differ** — nothing else.

- ✅ Diff shows only your targets → tune committed
- ⚠ Diff shows extra changes → BIOS reset other settings (CMOS event, post-update default restore) — note them and decide whether to re-apply
- ❌ Diff shows none of your targets → change didn't commit. Re-enter BIOS, set it again, watch for the Save dialog

---

## Trade-offs you accept

- **No undo from inside Windows.** Every change is BIOS-level, applies before the OS boots. If a setting kills POST, recovery is BIOS FlashBack button (ASUS), Q-Flash Plus (Gigabyte), Flash BIOS (MSI), or a hardware flasher.
- **Anticheat.** Some tournament titles flag SCEWIN-style NVRAM tampering. SCEWIN itself is read-only — but if anticheat sees it touched the variable store this session, your rig can get flagged. Don't run it while connected to a tournament server.
- **No 1%-gain chasing.** The shortlist above covers ~95% of what's actually leaving FPS / stability on the table. Past that, you're hunting marginal returns at brick risk.

---

## Don't do this

- **Don't use `SCEWIN_64.exe /i`** (import / write). That's the brick path.
- **Don't paste your dump publicly** without scrubbing the `Setup Question Index`, board serial, and UUID lines.
- **Don't ignore the diff after a BIOS update.** Vendor updates routinely reset PBO / EXPO / Resizable BAR / fan curves to stock — the diff is the only way to see exactly what reverted.

---

## Sources

- AMI Aptio Toolkit reference (vendor-distribution)
- Vendor BIOS-recovery docs — ASUS BIOS FlashBack, MSI Flash BIOS button, Gigabyte Q-Flash Plus
- TechPowerUp + Overclock.net forums for community workflows
- [The Stilt's BIOS tuning archive](https://www.overclock.net/) for variable-name decoding
