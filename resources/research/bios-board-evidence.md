# Board-specific BIOS evidence

Last reviewed: 2026-09-20

## What motherboard and CPU detection can and cannot tell us

Windows can report board manufacturer, product, a vendor-defined revision string, BIOS identity/version, and the processor name through SMBIOS/WMI. That is enough to choose an exact model's official manual, CPU-support list, and support page when the reported identity is reliable. It does not enumerate every setup variable, prove the installed firmware exposes every manual item, or reveal current values. SMBIOS fields can be missing or generic. The `cpuBrand` field is a legacy API name; its value is the full `Win32_Processor.Name` string when available.

Treat evidence as separate levels:

1. **Detected identity:** values reported by Windows. Display them as reported; do not silently normalize a near-match into a different board.
2. **Model manual:** confirms that a setting/path is documented for the model, not for every revision, CPU, or BIOS release.
3. **CPU compatibility:** the exact CPU model and board must appear together on the OEM CPU-support list. Preserve the OEM's minimum-BIOS requirement verbatim. “Not in our local curated subset” is not the same as unsupported. Do not compare opaque BIOS versions unless the vendor's version scheme has been reviewed and implemented for that board family.
4. **Firmware-specific availability:** requires a matching OEM release note/manual or direct verification for the board revision, installed CPU, and BIOS version. A manual or CPU-support match alone does not prove a menu is visible in the current firmware. If evidence is absent, availability is unknown.
5. **Observed state:** Windows signals can cover a subset of settings. A user-supplied SCEWIN export is partial, unauthenticated evidence from a particular capture; a missing entry does not establish that a setting is unavailable or currently off.
6. **Performance recommendation:** requires workload-specific repeatable measurement and a recovery path. A documented menu option is not evidence that changing it improves Fortnite latency.

The app must not recommend writing firmware variables. Preserve the user's existing BIOS practices/recipes as user-controlled references where applicable, but never present another system's voltage or memory timings as a known-good value for this kit/CPU/board.

## Current curated catalog in the app

The resolver currently contains five exact board records:

- **ASRock X570 Steel Legend** — the [official manual](https://download.asrock.com/Manual/X570%20Steel%20Legend.pdf), [support page](https://www.asrock.com/mb/AMD/X570%20Steel%20Legend/), and [BIOS archive](https://www.asrock.com/mb/AMD/X570%20Steel%20Legend/bios.html). Its XMP, SMT, Secure Boot, and Above 4G entries are documented options, not claims that they are visible in every installed firmware or improve game performance.
- **ASUS ROG STRIX Z790-E GAMING WIFI** — the [14th Gen BIOS manual](https://dlcdnets.asus.com/pub/ASUS/mb/LGA1700/ROG_STRIX_Z790-E_GAMING_WIFI/E23863_ROG_STRIX_Z790_Series_BIOS_Manual_Intel_14th_EM_V2_WEB.pdf), [support page](https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_manual/), and [CPU-support list](https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_qvl_cpu/). Only the XMP menu path is currently curated.
- **ASRock Z790 Steel Legend WiFi** — the [model manual](https://download.asrock.com/Manual/Z790%20Steel%20Legend%20WiFi.pdf) and [CPU-support list](https://www.asrock.com/support/cpu.de.asp?s=1700&u=1384). No individual BIOS menu paths are currently curated.
- **MSI MAG Z790 TOMAHAWK WIFI** — the [model manual](https://download.msi.com/archive/mnu_exe/mb/MAGZ790TOMAHAWKWIFI.pdf) and [support page](https://www.msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI/support). No CPU rows or individual menu paths are locally curated yet.
- **GIGABYTE Z790 AORUS ELITE AX, revision 1.0 only** — the [model support page](https://www.gigabyte.com/Motherboard/Z790-AORUS-ELITE-AX-rev-10/support) and [manual](https://download.gigabyte.com/FileList/Manual/mb_manual_z790-ae-series_1104_e.pdf?v=5568e58ee416d6c8d3d88d15ad0bb1ad). It stays unselected if Windows does not report revision 1.0. No CPU rows or menu paths are locally curated yet.

There are five exact board/CPU support tuples: Ryzen 7 2700 + X570 Steel Legend (OEM requirement `All`); i9-14900K, i9-14900KF, and i9-14900KS + ASUS Z790-E (OEM requirements `1202`, `1202`, and `2002`); and i9-14900K + ASRock Z790 Steel Legend WiFi (OEM requirement `10.08`). These are compatibility rows only. The app intentionally does not compare OEM BIOS version strings until a vendor-specific ordering rule is independently verified.

The matching system is not tied to the developer's PC: it reads each user's reported board manufacturer, full product, revision, CPU name, and BIOS identity, then selects only an exact normalized model or an explicitly reviewed identity alias. CPU aliases are whole-token matched, so 14900K does not absorb 14900KF/KS. Revision-scoped records require a matching reported revision. Several major board/system OEM support portals are mapped for unprofiled systems; other or incomplete identities still display what Windows reported. Unknown coverage remains explicitly unknown, never a guessed BIOS recipe. This is a useful cross-hardware foundation, not an exhaustive database of every board and firmware.

## Adding or refreshing a profile

- Match both reported manufacturer and full product/model exactly after punctuation/case normalization. Do not use fuzzy model matching.
- Review the exact OEM manual, full CPU-support list, and support/release-notes page; record direct links, review date, CPU aliases/product IDs, required BIOS version (verbatim), and relevant revision/CPU caveats.
- Match CPU aliases on token boundaries, not substring alone (`2700` must not match `2700X`).
- Keep documented path, live Windows observation, compatibility evidence, and recommendation in separate fields.
- Show the detected BIOS string for context. Only compute a minimum-version pass/fail after a vendor-specific version scheme is validated; otherwise leave that comparison unknown.
- State explicitly when current BIOS visibility/value is unknown. Do not infer availability from SCEWIN export omission.
- Include only advice supported by a measured, repeatable game/workload result or a non-performance requirement such as security/eligibility. Keep firmware changes read-only in this application.
- Retest the profile after the OEM posts a BIOS/manual revision that may affect its claims.

## Sources

- Microsoft, [Win32_BaseBoard class](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-baseboard), for the scope of Windows board identity properties.
- Microsoft, [Win32_Processor class](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-processor), for the Windows processor name/model signal.
- ASRock, [X570 Steel Legend User Manual](https://download.asrock.com/Manual/X570%20Steel%20Legend.pdf), [product page](https://www.asrock.com/mb/AMD/X570%20Steel%20Legend/), and [BIOS archive](https://www.asrock.com/mb/AMD/X570%20Steel%20Legend/bios.html).
- ASRock, [Ryzen 7 2700 CPU support entry](https://www.asrock.com/support/cpu.asp?s=AM4&u=574), checked 2026-09-20; the table lists X570 Steel Legend support BIOS as `All`.
- ASUS, [ROG STRIX Z790-E 14th Gen BIOS manual](https://dlcdnets.asus.com/pub/ASUS/mb/LGA1700/ROG_STRIX_Z790-E_GAMING_WIFI/E23863_ROG_STRIX_Z790_Series_BIOS_Manual_Intel_14th_EM_V2_WEB.pdf) and [exact CPU support list](https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_qvl_cpu/), checked 2026-09-20.
- ASRock, [Z790 Steel Legend WiFi manual](https://download.asrock.com/Manual/Z790%20Steel%20Legend%20WiFi.pdf) and [exact CPU support list](https://www.asrock.com/support/cpu.de.asp?s=1700&u=1384), checked 2026-09-20.
- MSI, [MAG Z790 TOMAHAWK WIFI product/support page](https://www.msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI/support) and [model manual](https://download.msi.com/archive/mnu_exe/mb/MAGZ790TOMAHAWKWIFI.pdf), checked 2026-09-20.
- GIGABYTE, [Z790 AORUS ELITE AX Rev. 1.0 support page](https://www.gigabyte.com/Motherboard/Z790-AORUS-ELITE-AX-rev-10/support) and [Z790 AE-series manual](https://download.gigabyte.com/FileList/Manual/mb_manual_z790-ae-series_1104_e.pdf?v=5568e58ee416d6c8d3d88d15ad0bb1ad), checked 2026-09-20.
- OEM fallback portals checked 2026-09-20: [ASRock](https://www.asrock.com/support/), [ASUS](https://www.asus.com/support/), [MSI](https://www.msi.com/support), [GIGABYTE](https://www.gigabyte.com/Support), [BIOSTAR](https://www.biostar.com.tw/app/en/support/download.php), [NZXT motherboards](https://support.nzxt.com/hc/en-us/sections/39003384521627-Motherboards), [Supermicro](https://www.supermicro.com/en/support), [Dell](https://www.dell.com/support/home/en-us), [HP](https://support.hp.com/us-en), [Lenovo](https://support.lenovo.com/us/en), [Acer](https://www.acer.com/us-en/support/), and [Intel](https://www.intel.com/content/www/us/en/support.html).
