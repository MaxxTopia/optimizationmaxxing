# Windows standby memory: when not to clear it

## Short answer

For Fortnite, leave Optimizationmaxxing's background standby cleaner **off** unless you are investigating a repeatable memory-related problem. A large standby number by itself is not a problem: Windows counts standby pages as available memory and can reuse them when applications need RAM. The standby list also contains cached data, so emptying it can mean Windows has to fetch that data again.

This cleaner is not a proven FPS boost, and there is no universal “best” purge interval. Do not run a purge during a match as routine maintenance.

## Competitive-player evidence (reviewed 2026-09-24)

Do not describe scheduled standby purging as a pro-approved or standard competitive-Fortnite practice. I could not verify a reliable, current primary-source consensus from professional players. Epic's competitive PC guide emphasizes in-game settings, current GPU drivers, and closing competing background programs; it does not prescribe standby-memory purging. This is absence of a verified recommendation, not proof that no individual player has ever used a cleaner.

## If you want to test it

1. Pick the same repeatable Creative/replay route and keep game settings, FPS cap, overlays, and background apps unchanged. Do not use a ranked match as the test.
2. With the cleaner off, run the test three times and record 1% lows, frame-time spikes, and hitches/loading—not only average FPS.
3. Close Fortnite and every other game. In **Settings → Background standby cleaner**, click **Run once (all games closed)** and approve Windows UAC. This one-time action does not create a recurring task.
4. Repeat the same test. Repeat the off/on comparison in another session if possible. Keep using the cleaner only if the improvement is consistent, larger than normal run-to-run variation, and does not introduce new hitches or loading delays. Otherwise, leave it off.

There is no evidence-based best scheduled interval. If deliberately testing scheduled mode, 30 minutes is simply the least frequent available choice—not a performance recommendation. The task skips its purge when it detects a supported game process, including Fortnite. It still wakes briefly to check, and custom or unlisted games are not covered. Turn the task off after the test.

The game check is a safeguard, not a guarantee of zero background activity. The one-time run uses the same game check, but should still only be used with all games closed. This app does not inject into or change the game process, but no third-party utility should be described as universally compatible with every anti-cheat or system configuration.

## Diagnose memory pressure instead of chasing a large cache number

Open **Task Manager → Performance → Memory** and look at **Available**, not just the cached/standby amount. If Fortnite has a repeatable memory-pressure symptom, check for unusually high use by other applications and capture comparable runs. A purge cannot fix a game, driver, or background application that is actually leaking memory. Windows Performance Recorder/Analyzer is a better next step for a persistent issue than repeatedly emptying cache.

## References

- [Microsoft: Results for the Memory Footprint assessment](https://learn.microsoft.com/en-us/windows-hardware/test/assessments/results-for-the-memory-footprint-assessment) — available memory includes free and standby memory; standby pages are cached data that can be replaced or reused.
- [Microsoft: Memory Footprint Optimization](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/memory-footprint-optimization) — available memory includes standby pages that can be repurposed without first writing them to persistent storage.
- [Microsoft Sysinternals: RAMMap](https://learn.microsoft.com/en-us/sysinternals/downloads/rammap) — inspection tool for understanding Windows physical-memory use.
- [Microsoft: `NtSetSystemInformation`](https://learn.microsoft.com/en-us/windows/win32/sysinfo/ntsetsysteminformation) — API reference; it does not establish that periodic standby purging improves game performance.
- [Epic Games Store: Fortnite on PC competitive settings guide (2026)](https://store.epicgames.com/news/fortnite-on-pc-best-settings-for-competitive-play-in-2026) — discusses in-game performance settings and reducing competing background-app load; does not recommend scheduled standby purging.
