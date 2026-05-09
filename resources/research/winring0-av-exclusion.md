# If your AV blocks WinRing0 (LibreHardwareMonitor driver)

We bundle [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)
to read CPU package temp, per-core temps, voltage rails, and fan RPMs. The
library uses a kernel driver called **WinRing0** (also called
`WinRing0x64.sys`) to read MSRs (Model-Specific Registers).

WinRing0 is a real, signed, decade-old driver shipped with HWInfo, AIDA64,
OpenHardwareMonitor, ThrottleStop, and dozens of other monitoring tools.
It does one thing: read CPU registers. It can't write them.

Some antivirus and EDR tools still flag it because the same registers are
used by some malware. False positive — not a real threat. The fix is a
simple exclusion.

## Symptom

The Live Thermals card shows:

> LibreHardwareMonitor probe failed: <some error>

…and CPU package / per-core temps are missing. GPU temps may also be
missing on some configurations.

## Fix — Windows Defender (most common)

Open an **admin PowerShell** (Win+X → Terminal (Admin)) and run:

```powershell
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\optmaxxing"
Add-MpPreference -ExclusionPath "C:\Program Files\optimizationmaxxing"
Add-MpPreference -ExclusionProcess "optimizationmaxxing.exe"
```

That whitelists our install directory + the kernel driver path WinRing0
loads from. Restart optimizationmaxxing and click "Enable full sensor
access (UAC)" again.

## Fix — Third-party AVs

Most enterprise AVs (Bitdefender, Kaspersky, ESET, Sophos, CrowdStrike,
SentinelOne) need an admin to add an exclusion via their console. Same
two paths:

- `%LOCALAPPDATA%\optmaxxing\` (where the elevated probe writes its temp
  files)
- `C:\Program Files\optimizationmaxxing\` (where the bundled DLL lives)

Look for "Trusted applications" / "File exclusions" / "Process exclusions"
in your AV's settings. Some AVs also require excluding the WinRing0 driver
path itself — `C:\Windows\System32\drivers\WinRing0x64.sys`.

## What if I don't trust the driver?

Honest answer: don't enable it. The Live Thermals card still works in
**user-mode**. You'll see ACPI thermal zones, GPU temps, NVMe SMART, fan
RPMs from the chipset — most of what matters for spotting overheating.
The only gap is CPU package temp + voltage rails, which need admin on
Windows by design (Microsoft removed user-mode MSR access in Win10).

You can also run HWInfo or AIDA64 alongside our app — both ship the same
WinRing0 with the same admin requirement, just from a different vendor.

## I added the exclusion and it still fails

A few rarer causes:

1. **Secure Boot policy on locked Win11 builds.** Some OEM laptops + most
   corporate-locked rigs reject unsigned-by-Microsoft drivers regardless
   of AV settings. There's no workaround short of a BIOS Secure-Boot
   toggle, which is its own can of worms (see the BIOS-tournament-
   compliance guide).
2. **HVCI / Memory Integrity ON.** WinRing0 won't load with HVCI on. Our
   `vbs.hvci.disable` tweak turns this off — but only apply if you're
   not on a Vanguard tournament rig (Riot may flag the change).
3. **An older WinRing0 from a previous tool.** If you previously installed
   HWInfo / AIDA / ThrottleStop and uninstalled them, the old driver may
   still be registered with Windows and conflict. Run
   `sc.exe delete WinRing0_1_2_0` from admin cmd, reboot, retry.

## Why we bundle this at all

You asked "we should cover everything as an optimization app." Real
package-temp readings are the only way to detect a thermal-throttling
CPU before the framerate drops. Without them, we can show you symptoms
(low MHz, high motherboard temp) but not the root cause (CPU at TJ
Max). Trade-off: one UAC prompt + one AV exclusion vs no insight into
what your CPU is actually doing.
