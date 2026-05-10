# Standby memory list — the silent stutter source pros clean every session

Windows aggressively caches files into the **standby list** — a "soft" memory pool that holds recently-touched data so it can be re-served without disk I/O. Helpful for desktop work. **Brutal for long gaming sessions** because Windows starts pushing your active game's working-set memory back to the standby list to make room for whatever Discord / Chrome / OBS just touched. Result: mid-endgame frametime drops because the game is paging memory back in from the standby list when it needs to draw the next frame.

This is the gatekept reason pros restart their game every 2-3 hours. The fix is **standby list clearing** — periodically calling Windows' `NtSetSystemInformation(SystemMemoryListInformation, MemoryPurgeStandbyList=4)` to force the OS to drop the standby cache and free pages back to the active pool.

## How to fix it (today, manually)

There's a tool community pros have used for ~10 years called **Intelligent Standby List Cleaner (ISLC)** by Wagnard. It runs a small tray process that monitors free + standby memory and triggers the purge when standby exceeds a threshold.

1. Download ISLC: [wagnardsoft.com → Tools → Intelligent Standby List Cleaner](https://www.wagnardsoft.com/forums/viewtopic.php?f=15&t=1256)
2. Settings (recommended for 16-32 GB systems):
   - **The list size is at least:** `1024 MB`
   - **Free memory is lower than:** `1024 MB`
   - **Auto-Purge** when both conditions met
   - **Start ISLC minimized** + **Run when Windows starts** for set-and-forget
3. Click **Start** — ISLC monitors memory in the background. When standby grows past 1 GB AND free drops under 1 GB, it triggers the purge silently. No noticeable hit; you'll just stop getting mid-session stutter.

## Why we ship this as articleware (for now)

The `NtSetSystemInformation` API requires `SeProfileSingleProcessPrivilege` — an elevated token privilege most processes don't enable by default. We could:

1. **Re-elevate the entire app** every launch — annoying UAC prompt every start
2. **Spawn an elevated subprocess** for the cleanup — UAC prompt every cycle
3. **Register a scheduled task** with `HighestAvailable` that runs the cleanup on a 30-second interval — clean approach but needs first-run setup

We're building option (3) for v0.1.63+: a one-click "Enable standby cleaner" button in Settings that creates the scheduled task with proper privilege escalation, then a tray status indicator showing when purges fire. For v0.1.62 we link to ISLC as the proven path.

## What our tools-page DOES surface for you

`/diagnostics` already shows your free + standby memory split via `Win32_OperatingSystem` + perfmon counters. Run it during a game session to see the standby list balloon — that's the smoking gun.

## Anti-cheat note

ISLC runs as a normal user-mode process with elevated privileges (no driver, no kernel hooks, no game-process injection). Anti-cheats don't flag it. The underlying `NtSetSystemInformation` syscall is documented Microsoft API used by SysInternals tools (RAMMap from Mark Russinovich does the exact same thing).

## Microsoft's own version

Sysinternals ships `RAMMap` which exposes the same purge functionality:

1. Download [RAMMap from Microsoft Sysinternals](https://learn.microsoft.com/en-us/sysinternals/downloads/rammap)
2. Run elevated → Empty menu → "Empty Standby List"

RAMMap doesn't auto-trigger like ISLC, but if you'd rather use a Microsoft-published tool one-shot before a tournament, this is the same mechanism.

## Citations

- [Wagnard's ISLC tool](https://www.wagnardsoft.com/forums/viewtopic.php?f=15&t=1256) — the de-facto pro standby cleaner
- [Microsoft Sysinternals RAMMap](https://learn.microsoft.com/en-us/sysinternals/downloads/rammap) — same API, manual trigger
- [Mark Russinovich's standby list explainer](https://learn.microsoft.com/en-us/sysinternals/learn/the-standby-list-and-modified-page-list) — Microsoft documentation of why this matters
- r/Windows10 long-running threads on standby clearing for gaming
