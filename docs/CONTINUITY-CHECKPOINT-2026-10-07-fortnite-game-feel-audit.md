# Continuity checkpoint: Fortnite competitive game-feel audit

Date: 2026-10-07
Scope: Investigate a report that Fortnite felt slow, build inputs felt late, and ping bars turned yellow or red after using OptimizationMaxxing. Harden the app so stale or partially applied settings cannot be presented as healthy, and make diagnostics distinguish frame-time, local network, and live-game evidence.

## Recovered state

- v0.4.19 was natively verified, committed as `637f6babb77c1003b607426dbc18e913055efdc6`, pushed to `main`, tagged, and published through the documented CI signing path.
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
- `npm run tauri:build` was then run on the stable C: target with the direct stable toolchain workaround. TypeScript/Vite passed, the optimized Rust release built, and NSIS produced `C:\\Users\\Diggy\\projects\\optimizationmaxxing-hardening\\src-tauri\\target\\release\\bundle\\nsis\\optimizationmaxxing_0.4.19_x64-setup.exe`. The command exited only at updater signing because the configured public key was present but `TAURI_SIGNING_PRIVATE_KEY` was not; this is the documented CI-signing boundary, not a compile or bundle failure. GitHub Actions run `37816704942` then signed and published the release successfully.
- Public release verification passed: `v0.4.19` is non-draft and non-prerelease at `https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.19`, with `latest.json`, `optimizationmaxxing_0.4.19_x64-setup.exe`, and its `.sig` uploaded. The public `latest.json` reports version `0.4.19`; the MaxxTopia notification step also completed successfully.
- A repo-wide `cargo fmt --check` remains unsuitable because the repository has pre-existing formatting differences in unrelated native files. The touched Rust files pass file-level rustfmt.

## Live, unfinished, and field gates

- Live: signed public v0.4.19 from commit `637f6babb77c1003b607426dbc18e913055efdc6`; `main` and tag `v0.4.19` were pushed. The release workflow and MaxxTopia notification completed successfully.
- USB build path: E: is a removable PNY USB 3.2.1 FD with Event 153/51/50 storage errors, so it is not a reliable Cargo target. The supported workaround is to build on the stable NVMe C: target after clearing only the ignored generated Cargo cache; the app can still be copied to or installed from USB after packaging, but Cargo should not compile there.
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

The release is shipped. The best next move is the target-PC gate: install v0.4.19, exercise UAC and the installed client, reboot, then run a real Fortnite capture with Net Debug Stats and frame-time/DPC evidence. Do not claim improved gameplay feel from source or build evidence alone. Keep the USB for transfer/install media or backups, not live Cargo output; replace it if it continues to show Disk 1 I/O errors.

## Follow-up checkpoint: Asta read-back hardening and fullscreen Alt+Tab guidance

Date: 2026-10-09

### Scope and decisions

- Asta and Tune diagnostics now distinguish `MISMATCH`, `UNKNOWN`, and `NOT_CONFIGURED` PowerShell read-back results instead of presenting every nonzero verifier exit as an unexplained failure.
- The generic Rust PowerShell fallback now states that no write was attempted and gives a rebuild-required diagnostic when a verifier exits without an explicit reason.
- Asta may create the app-owned first-run restore record immediately before applying only the readable, safe setup cases for the named Ultimate Performance plan and RSS. Foreign, malformed, missing-but-owned, or adapter-mismatched recovery records remain fail-closed and show a repair/restore path.
- The Fortnite QoS verifier now checks the catalog's actual contract: the effective `FortniteClient-Win64-Shipping.exe` policy in `ActiveStore` with DSCP 46, while reporting local-only policy state as unknown instead of claiming success.
- The catalog guidance for `ui.fse.disable-global` now explains the user's specific symptom: a multi-second black transition on Alt+Tab in true fullscreen that does not occur in borderless/windowed fullscreen points first to the fullscreen-optimization/presentation-path override. It is a rollback diagnostic, not a new aggressive tweak. MPO remains a separate conditional multi-monitor/VRR flicker workaround.

### Verification

- `npm run audit:catalog`: passed; 108 tweaks, 0 errors, 0 warnings.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; only the existing large-chunk warning remained.
- `npm run audit:driver-profiles`: passed.
- `npm run test:bios-evidence`: passed.
- `git diff --check`: passed; only expected LF-to-CRLF normalization warnings were reported.
- A native Rust test was attempted against the USB target after the system drive filled during the earlier compile, but Cargo created the target and then stayed idle without spawning `rustc`; it was stopped cleanly after a bounded wait. Native tests are unverified for this follow-up and are not reported as passed.

### Current state and human gates

- Public v0.4.19 is unchanged; this follow-up is local on `fix/asta-qos-performance-setup` and has not been committed, published, or installed into the user's client.
- The source/build gate is green for the web/catalog surfaces. UAC elevation, first apply, reboot persistence, actual Asta application, and the Fortnite true-fullscreen Alt+Tab repro remain physical-PC gates.
- For the black flash: first revert the OptimizationMaxxing fullscreen-optimization override and verify the game's executable/shortcut Compatibility setting does not have “Disable fullscreen optimizations” enabled. If the symptom remains, inspect HDR/VRR, refresh-rate/resolution switching, and the display driver path; do not disable MPO solely for this symptom.

### Best next action

Build/install this local revision, run Asta as Administrator once, confirm the receipt explains any skipped row and the first-run restore records, reboot and re-check drift, then test true fullscreen versus borderless Alt+Tab. Only after that physical proof should this revision be published.

## Release candidate: v0.4.20

Date: 2026-10-09

- The Asta/read-back/fullscreen guidance changes were versioned as v0.4.20 in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`; a changelog entry was added.
- `npx tsc --noEmit`, `npm run audit:catalog`, `npm run audit:driver-profiles`, and `npm run test:bios-evidence` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed: 99 library tests, 0 failures; only the existing two dead-code warnings remain.
- `npm run tauri:build` compiled the optimized binary and produced `src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.4.20_x64-setup.exe`. The local command stopped only at the documented updater-signing boundary because the private signing key is CI-only; CI must sign and publish the artifacts.
- Pre-ship checks passed: `git diff --check`, shipped PowerShell/batch/cmd ASCII scan, and release-surface authorship scan.
- This checkpoint is still awaiting the CI-signed release and live artifact verification. UAC, actual Asta first apply, reboot persistence, and Fortnite gameplay/Alt+Tab behavior remain target-PC gates.
