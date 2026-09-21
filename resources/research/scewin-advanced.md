# SCEWIN — read-only firmware evidence workflow

**Last reviewed: 2026-09-20.** SCEWIN is an AMI/vendor tool that exports setup-script text for
firmware questions exposed by that tool and firmware. The Diagnostics inspector can parse a
user-selected text export locally and compare two snapshots. It does not execute SCEWIN, upload or
save the raw dump, write NVRAM, flash firmware, or apply BIOS changes.

Use this guide only when Windows cannot expose a value you need to audit. A dump is evidence, not
a recipe. Never import another board's dump and never copy a voltage, thermal-limit, power-limit,
PBO, Curve Optimizer, fixed-frequency, LLC, or memory-timing value from a different rig.

## When a read-only dump is useful

- Record firmware version and security state before and after a vendor BIOS update.
- Review values the export actually reports for settings Windows cannot read.
- Compare your own pre/post snapshots to detect an unexpected reset.
- Give support a scrubbed diagnostic snapshot without claiming that an unknown value is safe.

An omitted question is **unknown**, not proof that a setting is absent or unavailable. SCEWIN
exports can omit suppressed, duplicate, or otherwise unreported questions; a standard export also
does not necessarily include boot-order controls. Text metadata is not authenticated hardware
identity or live firmware read-back.

Do not use SCEWIN during a tournament session. Obtain it only from a trusted motherboard/OEM
source; do not run an unsigned random upload that touches firmware storage. If a trusted copy is
not available, stop at the vendor BIOS UI and Windows diagnostics.

## 1. Export a snapshot

Run the vendor-provided executable from an elevated Command Prompt only if you have verified its
source and signature. The common read-only export form is:

```text
SCEWIN_64.exe /o /s pre-audit.txt
```

Save the file outside the machine as a diagnostic backup. Scrub board serials, UUIDs, asset tags,
and other identifying data before sharing it.

## 2. Compare only against your own reference

Use Diagnostics → BIOS audit → SCEWIN snapshot inspector to compare two local exports, or use a
trusted text-diff tool. For meaningful before/after interpretation, use your own snapshots from the
same board model, board revision, and BIOS version:

```text
code --diff pre-audit.txt previous-audit.txt
```

A difference means “investigate,” not “copy the other value.” If export metadata does not identify
the exact board/revision/BIOS, the app requires you to confirm both files came from the same
firmware. That confirmation is not independently verified. Firmware menus and variable meanings
vary by board, BIOS version, CPU, memory kit, and OEM policy.

## 3. Review safe boundaries

The audit may help you confirm whether the board exposes or hides:

- UEFI/CSM, Secure Boot, TPM/PTT/fTPM, IOMMU, Above 4G Decoding, and Re-Size BAR;
- vendor-rated memory-profile state and whether a profile was reset after an update;
- CPU microcode/firmware version and vendor-default policy where the board reports it;
- display, boot, fan, and device settings that are relevant to troubleshooting.

Keep security controls enabled for ordinary use and tournament eligibility unless the game's
current official rules explicitly say otherwise. For Intel 13th/14th-generation desktop CPUs,
use the current motherboard BIOS and Intel Default Settings guidance; do not “fix” high voltage by
copying a community undervolt. For AMD, leave PBO, Curve Optimizer, SoC voltage, and power/current
controls at vendor defaults for this app's supported path.

## 4. Re-export after a firmware change

If you made a documented, reversible BIOS change in the vendor UI, reboot and export again:

```text
SCEWIN_64.exe /o /s post-audit.txt
```

Compare values reported in both exports. Extra or missing records need manual review; omission does
not prove that a setting failed to save. This comparison is of two files, not a live firmware
read-back or proof of reboot persistence. Verify critical settings in the firmware UI and use the
board's documented recovery path if the PC behaves unexpectedly.

## Do not do this

- Do not use SCEWIN import/write switches. The app importer is for text inspection only.
- Do not flash BIOS or change voltage, thermal limits, power limits, or overclock controls from
  this guide.
- Do not disable Secure Boot, TPM, IOMMU, Defender, or anti-cheat protections to chase a benchmark.
- Do not publish an unsanitized dump or treat “unknown” as “verified.”
- Do not run firmware utilities while connected to a competitive/tournament server.

The supported app path scans Windows-visible hardware and firmware context, then accepts optional
SCEWIN text exports for a best-effort local comparison. It does not infer hidden BIOS settings from
the board vendor, prescribe settings from a partial dump, or change firmware. Firmware remains a
manual, read-only audit boundary.

## Sources

- Motherboard/OEM firmware and recovery documentation for the exact board
- [Intel guidance for 13th/14th-generation desktop stability](https://www.intel.com/content/www/us/en/support/articles/000102331/processors.html)
- [Epic Games TPM/Secure Boot guidance](https://www.epicgames.com/help/c-34254770/c-Trending_0/a17911497?lang=en-US)
- [Epic Games IOMMU guidance](https://www.epicgames.com/help/c-34254770/c-45529661/a17757744)
