# Continuity checkpoint: Fortnite competitive game-feel audit

Date: 2026-10-07
Scope: Investigate a report that Fortnite felt slow, build inputs felt late, and ping bars turned yellow or red after using OptimizationMaxxing. Harden the app so stale or partially applied settings cannot be presented as healthy, and make diagnostics distinguish frame-time, local network, and live-game evidence.

## Recovered state

- Release candidate is v0.4.19 in the working tree. No commit, push, deployment, or public release was made because the required native verification did not complete.
- Working branch: `fix/asta-qos-performance-setup`.
- The working tree was clean at the start of this audit. The current uncommitted changes are intentional and span the preset, Tune/Asta verification, CPU-set restore, match diagnostics, and the adaptive network path; no unrelated files were reset or cleaned.
- Screenshots and the user's report do not prove that a single tweak caused the symptom. Yellow or red Fortnite network bars can reflect packet loss, congestion, routing, or loaded-connection behavior; a slow feel can also come from frame-time spikes, DPC/ISR load, throttling, or CPU scheduling.

## Changes in this session

- Presets now perform a fresh native verification read before deciding that a tweak is already applied. A drifted or unknown receipt is repaired instead of being silently skipped, and a verification failure aborts the apply path rather than fail-open to an empty applied map.
- Battle Royale and Siege curated packs use the transaction/rollback path. After the user's explicit preference for aggressive game prioritization, the Fortnite pack includes the reversible `CpuPriorityClass=3` High launch setting. It never uses Realtime. The Fortnite pack now also includes refresh selection, HAGS, power-throttling removal, Store-app background suppression, Edge background suppression, RSS, mouse acceleration off, Game Mode on, capture/auto-clip off, and desktop-only NIC power-save protection. Desktop-only actions remain rig-gated; route-dependent NIC interrupt/packet-shaping experiments and broad RGB/OEM startup sweeps remain deliberate lab/manual actions because they can regress latency or OEM controls rather than improve them.
- Rig-aware desktop-only actions are skipped on laptops or unknown chassis while universal actions remain eligible.
- CPU Set restore now has a visible Restore native action, and the auto-pin daemon clears an existing live pin when a matching rule is emptied or removed. Saving an empty rule therefore does not leave the current Fortnite process pinned forever.
- Fight Capture no longer calls system-wide UDP/NIC counters direct Fortnite packet loss. It reports them as a local error/discard signal and tells the user to correlate with Fortnite Net Debug Stats before changing a NIC setting.
- Network calibration now resolves the active IPv4 default route using route and interface metrics, confirms that it maps to a present physical adapter, and records interface index/GUID/PnP identity plus signed driver provider/version/date. The audit and the catalog actions use the same route selection instead of touching every physical NIC.
- Network traffic evidence now reads adapter counters and Fortnite process/UDP-endpoint presence without packet payloads or remote addresses. The UI distinguishes Fortnite UDP detection, Fortnite-open/no-UDP, cumulative adapter-counter history, and unavailable evidence; it does not call lifetime counters proof of unrelated current traffic.
- The six NIC experiment actions now skip unsupported properties, store schema-2 identity-bound pre-state, refuse legacy or foreign rollback state, and verify the active adapter before apply/read-back/revert. The measured experiment automatically reverts on route identity changes, adapter error/discard deltas, inconclusive probes, or clear RTT/jitter/loss/DPC regression.
- The measured experiment now fails closed when adapter identity or physical-device proof is missing at apply time or on either side of the comparison; that result is inconclusive and is rolled back instead of being treated as a pass.
- The before/after comparison is also bound to the pre-apply adapter identity, closing the route-change race where both measurements could otherwise land on a new adapter and look internally consistent.
- Added `docs/RESILIENCE.md` with the detection, fallback, rollback, restart, and rebuild boundaries for adaptive calibration. The design resolves a dependency into an observable condition where possible; it does not pretend ICMP or counters prove Fortnite server latency.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Vite emitted the existing large-chunk warning only.
- `npm run audit:catalog`: passed; 108 tweaks, 0 errors, 0 warnings.
- Embedded PowerShell parser check: passed; all 24 catalog apply/revert script pairs parsed without syntax errors.
- `npm run audit:driver-profiles`: passed.
- `npm run test:bios-evidence`: passed; 9 catalog checks passed.
- The final fail-closed adapter-identity change passed `npx tsc --noEmit` and `npm run build`.
- Release metadata was synchronized to v0.4.19 in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`; the changelog has a v0.4.19 entry.
- The Fortnite preset mapping now contains 13 performance controls; TypeScript, production build, and catalog audit passed after the expansion.
- `rustfmt --edition 2021 --check src-tauri/src/auto_pin.rs src-tauri/src/match_scan.rs`: passed.
- `rustfmt --edition 2021 --check src-tauri/src/network_audit.rs`: the new function formatting is clean; the command still reports the repository's pre-existing compact vendor-test formatting at the bottom of that file. It was not mass-reformatted.
- `git diff --check`: passed; Git only reported existing LF-to-CRLF normalization warnings for two edited TypeScript files.
- Native `cargo test` was attempted in a fresh USB target and stalled before starting `rustc`; a retry in a fresh C: target started compiling but failed with `os error 112` while writing `windows-sys`, despite the volume-level free-space check reporting available space. Native tests are therefore unverified in this session, not reported as passed.
- A final native test attempt was directed to a new E: target. Cargo created the target but produced no compiler process or output for more than a minute, so the probe was stopped; native tests remain unverified rather than falsely reported as passed.
- The authorized final native test retry used `E:\\optimizationmaxxing-cargo-target-20261007-v019` with `--locked --offline`. It progressed through dependency compilation, then the E: volume stopped responding to read/volume probes while Rust processes waited. After a bounded recovery window the Cargo tree was stopped safely; the native test has no pass result.
- Follow-up retries confirmed the USB is physically mounted as the read/write NTFS volume `GAMING_USB` with roughly 294 GB free, but it intermittently disappears or blocks during high-volume Cargo writes. The default parallel retry hit a `windows-sys` rustc allocation failure (`STATUS_STACK_BUFFER_OVERRUN`); a serial low-debug retry later failed when LLVM could not create the Cargo fingerprint output and reported `permission denied` while the E: target path was flapping. These are environment/storage failures, not source-test passes.
- A fresh serial target was started after the volume recovered, but Cargo did not reach a compiler before the volume became unreliable again; it was stopped cleanly. No source or user files were removed.
- The latest direct-toolchain rerun used `E:\\optimizationmaxxing-cargo-target-20261007-v019-trace` with one Cargo job, incremental compilation disabled, test debug info disabled, and explicit stable `rustc.exe`/`rustdoc.exe` paths to bypass Rustup's `rust-src` auto-install conflict. It compiled through many dependencies and reached `windows-sys v0.61.2`, confirming the earlier Rustup component conflict was avoidable.
- During that latest `windows-sys` stage, E: volume probes intermittently blocked and rustc stopped advancing during a bounded health window. The process tree was stopped cleanly; native tests still have no pass result, no source or user files were deleted, and packaging/release was not attempted.
- Windows storage diagnostics identified E: as the removable `PNY USB 3.2.1 FD` (Disk 1), not an SSD. The system log recorded Disk 1 I/O retries (Event 153), repeated paging I/O errors (Event 51), and an NTFS delayed-write failure for `$Mft` (Event 50) during the Cargo attempts. `chkdsk E: /scan` also stopped producing progress on the same volume and was stopped; the USB is not a trustworthy live Cargo target even though its current health flags say Healthy/OK.
- The stable workaround used the existing NVMe target after measuring about 12 GiB of ignored generated Cargo output on C: and only about 187 MiB free. The first NVMe retry reached the linker but failed with `LNK1318: Unexpected PDB error` under that low-space condition. `cargo clean --manifest-path src-tauri/Cargo.toml` removed only the ignored generated target cache (14,786 files, 12.1 GiB); no source or user files were changed.
- The subsequent direct-toolchain native run on the stable C: target used one Cargo job, incremental compilation disabled, test debug info disabled, and `--locked --offline`. It passed: 99 library tests, 0 failures; binary unit tests and doc tests also passed. This is the first complete native verification result for v0.4.19.
- `npm run tauri:build` was then run on the stable C: target with the direct stable toolchain workaround. TypeScript/Vite passed, the optimized Rust release built, and NSIS produced `C:\\Users\\Diggy\\projects\\optimizationmaxxing-hardening\\src-tauri\\target\\release\\bundle\\nsis\\optimizationmaxxing_0.4.19_x64-setup.exe`. The command exited only at updater signing because the configured public key was present but `TAURI_SIGNING_PRIVATE_KEY` was not; this is the documented CI-signing boundary, not a compile or bundle failure. No release commit, tag, push, or CI publish has been attempted yet.
- A repo-wide `cargo fmt --check` remains unsuitable because the repository has pre-existing formatting differences in unrelated native files. The touched Rust files pass file-level rustfmt.

## Live, unfinished, and field gates

- Live: signed public v0.4.18. The v0.4.19 hardening changes are local and uncommitted; no push, deployment, or release was performed.
- Not yet proven: UAC behavior, installed-client behavior, reboot persistence, actual Fortnite packet loss, ping under load, frame-time/1% lows, DPC/ISR behavior, or click-to-pixel input latency on the user's PC.
- The app's network counter is a useful local signal, not a Fortnite-flow capture. It cannot prove that a build input was dropped.

## Test handoff

1. On the target PC, inspect the CPU Sets page. If a Fortnite rule shows a restricted subset, use Restore native before judging input feel. For a deliberate experiment, use all detected CPUs as the baseline; do not treat IDs such as 56 as core numbers or speed ratings.
2. In Fortnite, enable Net Debug Stats. Reproduce the issue in a real match or build fight, not only in the lobby.
3. Run Fight Capture from before queue until after the bad-feeling exchange. Record the worst frametime, 1% behavior, CPU/GPU bound, DPC, effective clock, present mode, and the local UDP/NIC counter result.
4. Reproduce once while the connection is loaded by normal household upload/download traffic. If Fortnite shows packet loss or the bars worsen only under load, investigate router queue management, cable/driver, and ISP routing before applying more NIC tweaks.
5. If frame-time/DPC/clock data is clean but the game still feels late, keep the safe baseline and investigate game/server/input-device or monitor-path causes; do not infer a successful optimization from ping alone.

## Risk plan

- HOT: if fresh verification finds drift or a transaction mismatch, stop and roll back the affected tweak group; do not continue with a partial preset.
- RESTART: settings that require reboot or driver reload must show that state and be re-read after reboot; a receipt alone is not persistence proof.
- REBUILD: if the target PC regresses after the safe baseline, restore native CPU scheduling, revert the preset group, and keep the diagnostic capture for comparison.

## Best next move

Review the intentional diff and run the final pre-ship safety checks, then commit/tag/push v0.4.19 through the documented CI-signing path; do not use the current E: flash drive for live Cargo output. After CI/public-release verification, the target-PC gate is a reboot plus a real Fortnite capture with Net Debug Stats and frame-time/DPC evidence. Do not claim improved gameplay feel from source or build evidence alone.
