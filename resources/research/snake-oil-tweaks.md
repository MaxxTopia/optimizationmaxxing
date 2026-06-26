# Tweaks we deliberately DON'T do (and why)

Most "FPS boost" lists on the internet are a mix of three things: real wins, harmless placebo, and stuff that actively makes your PC worse or less safe. We only ship the first kind, clearly labeled. This page is the opposite list — popular tweaks that 2026 evidence says are placebo or harmful, so you know what we left out and why.

If a tweak isn't here and isn't in the catalog, it usually means "real but irreversible" (BIOS / RAM timings / driver wipes) — those live in the advanced guides instead, because we never auto-apply anything we can't cleanly revert.

## Harmful — don't do these

- **Disable the page file (set it to 0).** Games memory-map files from the page file even with 16–32 GB of RAM; zeroing it causes hard crashes and kills crash dumps. Leave it system-managed.
- **Process priority = Realtime.** Realtime outranks mouse, keyboard, and disk I/O — a busy game can lock the whole machine until a hard reset. "High" is worth roughly +1 FPS and is the ceiling worth using. (We expose High, never Realtime, for HID/game processes.)
- **Force all interrupts onto CPU 0.** The correct move is the opposite — spread NIC interrupts across cores (RSS), which we do. Pinning everything to core 0 is a latency anti-pattern.
- **"Debloat everything" scripts.** Mass-removing packages breaks Xbox/Game Pass auth, Windows Update, and the Store, and a heavily tampered environment can trip kernel anti-cheat (Vanguard / EAC / Ricochet). We remove specific, named, reversible background offenders — not the whole OS.
- **Disable Defender entirely.** Won't gain you a measurable frame and re-exposes you to real threats. The legitimate fix for the one known Defender CPU-tax case is a folder exclusion, not turning AV off.
- **Disable Spectre/Meltdown mitigations.** On modern CPUs the gain is 1–2% (inside run-to-run noise) and it re-opens side-channel vulnerabilities (e.g. the 2025 VMScape class). We tag our one mitigations-off tweak as DANGER, Intel-only, VIP, and anti-cheat-flagged for exactly this reason — it is not a default.

## Placebo — won't move your FPS

- **8000 Hz mouse polling "for lower latency."** The theoretical gain over 1000 Hz is under 1 ms (sub-perceptual), while 8000 Hz can cost double-digit CPU percentages and *lower* FPS in CPU-bound games. Pros run 1000 Hz; 2000 Hz captures ~90% of any benefit at a fraction of the cost.
- **Audio Exclusive Mode / 96–192 kHz output.** FPS games render shared-mode; exclusive mode just blocks Discord/voice, and ultra-high sample rates force upward resampling and waste CPU. Match your output to 24-bit / 48 kHz and move on.
- **Nagle's algorithm / TcpAckFrequency edits for shooters.** Nagle is TCP-only. Fortnite, Valorant, CS2, and Apex send gameplay over UDP, so these never touch your in-match ping (they only affect TCP launcher/login/download/voice). We keep our TCP tweak with an explicit honesty caveat.
- **NetworkThrottlingIndex = off.** The best-instrumented community testing finds no DPC or latency gain versus the default of 10, and occasionally slightly worse. As of v0.2.6 we keep it available but de-recommended and out of every default preset.
- **RAM "cleaners" / memory optimizers.** Force-evicting your working set is what *causes* the stutter they claim to fix (Russinovich's "memory-optimization hoax"). The real fix for standby-list bloat is the targeted standby cleaner — see that guide.
- **Generic registry / "power-plan" FPS packs on a capable PC.** Average-FPS deltas are run-to-run noise; the only real effects show up in 1% lows on bloated, low-end, or RAM-starved systems. Frame pacing beats raw average FPS, and most "I gained 40 FPS" reports are placebo.

## Reversed since older guides (we now match current consensus)

- **HAGS (Hardware-Accelerated GPU Scheduling): leave ON.** It's FPS-neutral but now required infrastructure for NVIDIA Reflex and AMD Anti-Lag 2. Old "turn it off" advice is stale. (Only caveat: it reserves ~1 GB VRAM, so it can stutter on ≤8 GB cards.)
- **Game Mode: leave ON.** Helps 1%/min FPS, rarely hurts. Disable Game *Bar* / background recording (we do) — not Game Mode itself.
- **bcdedit clock flags (useplatformclock / useplatformtick / disabledynamictick) + HPET disable: revert to / leave at default.** Microsoft documents the clock flags as debugging-only; on Windows 11 disabledynamictick is tied to mouse-input desync and added latency. `useplatformclock=no` is already the default (modern Windows runs invariant TSC) so forcing it is a no-op. Disabling HPET is worse than useless: the TSC periodically resyncs against HPET, so removing it lets the TSC drift over long sessions — clock skew that some anti-cheats can read as a speedhack. As of v0.2.6 we gate disabledynamictick to Win10; as of v0.2.12 we de-recommend hpet.disable + useplatformclock.disable and removed all of them from our presets.
- **MPO (Multi-Plane Overlay): only disable if you actually see flicker/stutter.** It is not an FPS lever, and on a healthy single-monitor rig disabling it can cost the low-latency Independent Flip path. Our tweak is the fix for a specific multi-monitor VRR bug, not a blanket gain.
- **NVCP Ultra Low Latency Mode (NULL): prefer Reflex.** Where a game has Reflex, it overrides and beats NULL. Use NULL only as a fallback.
- **Frame Generation (DLSS 3/4, FSR, AFMF) for competitive: off.** It adds latency (DLSS3 ~+16 ms, AFMF1 ~+20 ms). It's a smoothness feature, not a competitive-performance one.
- **DirectStorage: irrelevant for competitive.** No competitive shooter uses it, and it can *cost* ~10% FPS on strong GPUs in the few titles that do.

---

*Our rule: every tweak we ship is reversible and either has measured evidence behind it or is labeled clearly as optional/contested. Anything irreversible (BIOS, RAM timings, driver wipes) is a guide, never an auto-apply. If you ever catch us shipping something on this page as a "boost," call it out — not being snake-oil is the whole point.*
