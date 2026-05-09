# SCEWIN — read-only BIOS export for advanced tuners

SCEWIN (`SCEWIN_64.exe`) is a Windows-side utility that exports your full
BIOS / UEFI variable store to a plain-text file. **Read-only is the only mode
we recommend.** The same tool can write the variable store back, which is
how some tuner shops change settings without entering BIOS. We will never
ship a one-click "apply BIOS preset" feature here — the consequences of a
malformed write are **brick-tier** and not undoable from inside Windows.

This article is for users who want to:

1. Diagnose a non-obvious BIOS setting that's affecting performance.
2. Back up a known-good configuration before they change anything in BIOS.
3. Compare configurations between rigs (a tuned rig vs a stock-vendor rig).

## Why read-only

A bad BIOS write can leave your machine unable to POST. Some boards have
a backup BIOS chip ("dual BIOS"). Most don't. The recovery path is a
SPI flasher + BIOS chip dump from the vendor — that's a $30 hardware
purchase + half a day with a hot air station.

We've also seen vendor-issued tuner tools (e.g. ASUS AI Suite) brick boards
on otherwise-routine writes. SCEWIN is a thin wrapper over the same
mechanism. **Don't write with it.**

## How to get SCEWIN

SCEWIN is part of the Intel-licensed AMI BIOS toolkit. AMI doesn't
distribute it publicly — it ships with motherboard vendor service tools,
and copies float around. Common sources:

- Vendor service / RMA tools — sometimes bundled.
- TechPowerUp threads + community uploads — unsigned, scan with
  VirusTotal first.
- AMI partner channel if you have an OEM relationship.

If you can't find a known-clean copy, **don't run a random one.** Stick to
the Diagnostics page's BIOS Date / BIOS Version readout and use vendor
docs.

## Read-only workflow

1. **Backup first.** From an admin Command Prompt:
   ```
   SCEWIN_64.exe /o /s mybios.txt
   ```
   This dumps every BIOS variable to `mybios.txt`. Keep the file off the
   rig (cloud storage, USB stick, separate drive).

2. **Diff against a known-good rig** — if you have a teammate with a
   similar board running clean, ask them to do the same dump. Compare the
   two files in any text-diff tool. Settings that differ are the ones
   worth investigating in BIOS itself.

3. **Don't paste the file publicly.** It contains your motherboard serial
   number + board UUID. Strip those before sharing for help.

## What you can actually change (in BIOS, not via SCEWIN)

The BIOS-per-chipset article covers the common knobs:

- ReBAR / Above-4G-Decode
- Resizable BAR vendor toggles
- DDR EXPO / XMP profile
- AMD PBO + Curve Optimizer
- LLC (Load Line Calibration)
- C-States / Power-Saving features
- Memory training timings (for the brave)

Apply each one in BIOS, reboot, validate stability with TestMem5 or
y-cruncher for memory tweaks, OCCT for voltage tweaks. Never change two
things at once — that's how you spend a weekend chasing a phantom crash.

## When NOT to use SCEWIN

- You don't know what a UEFI variable is. Stick to BIOS UI + this app.
- You're trying to cheat anticheat checks. They check for SCEWIN-style
  tampering on some titles.
- You're chasing a 1% gain on a tournament rig. The downside (brick) is
  catastrophically larger than the upside.

## Sources

- AMI Aptio Toolkit reference (vendor-distribution).
- Vendor BIOS-recovery docs (ASUS BIOS FlashBack, MSI Flash BIOS button).
- TechPowerUp + Overclock.net forums for community workflows.
