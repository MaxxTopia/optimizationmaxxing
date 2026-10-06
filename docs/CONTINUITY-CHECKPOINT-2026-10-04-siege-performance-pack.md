# Continuity checkpoint - Rainbow Six Siege performance pack

Date: 2026-10-06 (v0.4.17 release checkpoint)

## Scope and repository state

- Canonical worktree: `C:\\Users\\Diggy\\projects\\optimizationmaxxing-hardening`
- Branch: `fix/asta-qos-performance-setup`; base commit `707b67a` (`v0.4.16`, same as `origin/main` before this release).
- Intentional working-tree changes are the v0.4.17 Siege pack, catalog, verifier, version/changelog, and this checkpoint. Preserve unrelated work if any appears later.
- v0.4.17 is the candidate release. The release build is being produced on `E:\\CodexTemp\\optmaxxing_siege_build_20261004` so the C: drive is not used for Cargo targets. Commit, tag, push, and signed CI verification are still pending at checkpoint time.

## User intent and locked boundary

The user wants a free Rainbow Six Siege performance pack for stable FPS, lower input latency, and better frame pacing/1% lows. They explicitly do not want benchmark or A/B-test chores.

The preset has two honest layers: the one-click lane writes receipt-backed, read-back-verified Windows settings; the guide gives exact values and official paths for NVIDIA Control Panel, Siege graphics/config, overlays, Ethernet advanced properties, thermal/firmware controls, FPS caps, and frame pacing where the app does not have a safe universal write/read-back/rollback contract. Do not claim those guided controls were changed by the apply button, and do not promise a universal FPS or latency result.

## Siege implementation

- The free Rainbow Six Siege preset is now a transaction-backed baseline, not a single tweak. It covers compatible display refresh, mouse acceleration off, Game Mode on, Game DVR/automatic capture off, HAGS preference on, desktop Ultimate Performance clone, background power throttling policy, USB/HID power behavior, Edge/background-app policy, recognized RGB startup entries, RSS, and reversible Ethernet power settings.
- The preset applies the eligible actions as one verified transaction. A PowerShell verifier must pass for every PowerShell action; any mismatch rolls the transaction back instead of leaving a partial baseline. The card shows eligible verified settings, action count, and compatibility skips.
- `net.nic.rss.enable` and `net.nic.eee-powersave.disable` save exact per-adapter pre-state under `%LOCALAPPDATA%\\optmaxxing\\backups\\nic-rss-stash.json` and `nic-eee-stash.json`; revert restores the saved state and only touches owned adapter state.
- The guide covers Siege fullscreen/native/100% render, costly effects low, motion blur/lens off, one FPS limiter and a refresh-aware cap, Reflex/NVIDIA profile/shader cache, overlays/startup, IPv4/IPv6/QoS/required bindings, EEE/Green off, RSS on, jumbo off, thermals/firmware, and frame-time/1% low choices.
- The guide labels NVIDIA DB writes, Siege per-account config edits, arbitrary overlay termination, and firmware fan curves as manual/official-control steps because they are not universal safe verified writes.
- Asta/network guidance remains precise: Wake-on-Magic-Packet is a sleep/wake feature, not an active-game latency control. The pack does not force DSCP or broad undocumented NIC writes.

## Laptop behavior

- Form-factor filtering happens before the transaction is built. A detected laptop skips only actions explicitly marked desktop-only; it does not skip the pack.
- On a laptop, the desktop Ultimate Performance clone, desktop-only background power-throttling action, and desktop-only Ethernet power-saving action are withheld to preserve OEM battery/thermal policy. Compatible Game Mode/DVR/HAGS, refresh, mouse, USB/HID, background policy, recognized RGB startup, and RSS actions remain eligible and are applied in the same verified transaction.
- The UI now says `Not applicable on this rig`, identifies laptop/unknown chassis context, and states that the remaining eligible verified settings stay available. The screenshot message is therefore a compatibility skip, not a tune failure.
- The guide tells laptop users to select the manufacturer's plugged-in performance/turbo mode instead of forcing a desktop power plan.

## Verification

- `npm run audit:catalog`: passed; catalog v1.9.4, 108 tweaks, 0 errors, 0 warnings.
- `npm run test:bios-evidence`: passed; 9 checks.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; 220 modules transformed. Existing large-JavaScript-chunk advisory remains.
- `git diff --check`: passed; only LF/CRLF normalization warnings.
- ASCII shipped-script scan: passed for tracked `.ps1`, `.bat`, and `.cmd` files.
- Fresh concrete-toolchain test: `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml` passed on the E: target; 99 passed, 0 failed. Rust used the installed stable toolchain path, not the rustup updater shim.
- `npm run tauri:build` compiled and bundled the x64 installer at `E:\\CodexTemp\\optmaxxing_siege_build_20261004\\target_release_017\\release\\bundle\\nsis\\optimizationmaxxing_0.4.17_x64-setup.exe`. The command exited 1 only at the signing step because this machine does not have `TAURI_SIGNING_PRIVATE_KEY`; the installer is unsigned/local-only and signed CI is the public artifact authority.

## Known limits and release gate

- No live power-plan/registry/NIC action, installed-app behavior, target-PC reboot persistence, or gameplay/input-latency gain is claimed from source/build tests. The real user gate is installing the signed candidate, applying/reverting on both a laptop and desktop, and checking the receipt/read-back and any required reboot.
- Do not broaden the pack with undocumented driver-database, firmware, service, or NIC writes merely to make the card appear fully automatic. Keep exact scope, snapshots, read-back, rollback, and explicit device/form-factor handling.
- Build output is directed to `E:\\CodexTemp\\optmaxxing_siege_build_20261004` on the PNY USB. Preserve that cache; do not delete USB files.
- The user explicitly authorized `push all` in this thread. After the release build succeeds, stage only the intended v0.4.17 files plus this checkpoint, commit `release: v0.4.17 siege performance pack coverage`, tag `v0.4.17`, push `HEAD:main` and the tag, then verify CI and the public signed release.

## Exact next action

Run the final status/diff check, commit/tag/push the scoped v0.4.17 release, wait for CI, and verify the public release asset. Then report the laptop behavior and the remaining real-PC install/reboot/read-back gate without overstating performance results.
