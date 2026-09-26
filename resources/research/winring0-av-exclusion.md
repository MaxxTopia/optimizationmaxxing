# WinRing0 blocked — what it means

Live Thermals uses LibreHardwareMonitor. Some CPU package temperature,
per-core temperature, voltage, and fan sensors require **WinRing0**, a
privileged Windows driver that reads hardware registers. It is not a Fortnite
optimization and it does not change CPU clocks. Windows Defender or another AV
may block it because kernel sensor drivers are a sensitive attack surface.

## If Live Thermals says “probe failed”

1. Keep the fallback sensor view if it shows the data you need.
2. Check the AV event log and confirm the blocked file belongs to the
   optimizationmaxxing installation or LibreHardwareMonitor. Do not allow an
   unknown driver just because its name contains WinRing0.
3. If it is the expected file, add the narrowest file/process allow rule in
   the AV product's own UI, or ask the administrator to approve it. Prefer a
   signed vendor rule for the exact file over excluding an entire drive,
   `%TEMP%`, or all of `System32`.
4. Restart the app and choose **Enable full sensor access** again. Remove the
   allow rule if you stop using the sensor feature.

## Windows Defender

Use the Defender event's exact path and hash when creating a narrowly scoped
allow rule. This app intentionally does not add a blanket Defender exclusion
or disable Memory Integrity for you. If Memory Integrity, Secure Boot policy,
or an enterprise AV blocks the driver, use fallback sensors or a trusted
hardware monitor instead of weakening those protections blindly.

## Why the app mentions it

Without WinRing0, the app can still show many GPU, NVMe, ACPI, and motherboard
readings. The missing CPU-package readings make thermal diagnosis less
complete, but the driver is optional. A sensor failure is not evidence that a
game needs a CPU tweak.
