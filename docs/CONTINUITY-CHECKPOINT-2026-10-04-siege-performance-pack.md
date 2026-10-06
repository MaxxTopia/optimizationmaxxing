# Continuity checkpoint - Rainbow Six Siege performance pack

Date: 2026-10-05 (release checkpoint refresh)

## Scope and repository state

- Canonical worktree: `C:\Users\Diggy\projects\optimizationmaxxing-hardening`
- Branch: `fix/asta-qos-performance-setup`; base commit `96da444` (`v0.4.15`, same as `origin/main` at last read-only check).
- Isolated worktree; the user's original checkout was not edited.
- The worktree also contains Asta/QoS verification and Optimization Lab work. Preserve it; see [the Asta/QoS checkpoint](CONTINUITY-CHECKPOINT-2026-10-04-asta-qos-performance-setup.md).
- No changes are committed, pushed, deployed, or installed on the user's PC. A local unsigned installer was produced during the release gate; it is not a signed/public release.

## User intent and locked boundary

The user wants a free Rainbow Six Siege performance pack for stable FPS, lower input latency, and better frame pacing/1% lows. They explicitly do not want benchmark or A/B-test chores. Do not ask them to benchmark or present setup as an experiment.

Be precise: the one-click preset writes receipt-backed Windows settings. NVIDIA Control Panel, Siege graphics, startup/overlay choices, Ethernet advanced properties, and firmware fan/thermal controls are shown with values and paths because the app does not have a safe verified write path for them. Do not claim the apply button changed these. No universal FPS/latency result is promised.

## Siege implementation

- Added the free Rainbow Six Siege preset with rig-aware compatibility filtering and an Apply Windows baseline action.
- One-click lane includes maximum supported display refresh, Windows mouse acceleration off, Game Mode on, Game DVR/automatic capture off, HAGS preference on (supported OS/driver; restart may be needed), and desktop Ultimate Performance power plan.
- Added a styled setup guide covering Siege graphics/FPS cap, Reflex/NVIDIA profile/shader cache, startup/overlays, Ethernet bindings/adapter properties, thermals, and frame pacing. It does not request benchmarking.
- Clarified Asta/network guidance: Wake-on-Magic-Packet is a sleep/wake feature, not an active-game latency tweak; Asta does not include it as a performance action. Cataloged RSS, EEE, and interrupt-moderation controls may require Asta's review lane when their PowerShell actions lack exact read-back/restore contracts. Removed one-at-a-time NIC test instructions from Network Audit per the user's preference.
- Added allowlisted Windows Settings shortcuts for display refresh, Game Mode, Game Bar, Captures, Startup Apps, and Ethernet. They navigate only and are labeled as such. The Ethernet guide gives the path to adapter bindings and advanced properties.
- Kept app-only versus manual settings explicit; NVIDIA-only guidance is hidden when another GPU vendor is detected.
- The power-plan action clones the built-in plan, writes an atomic ownership receipt, records the prior active GUID, verifies the owned GUID/name, restores the previous plan only when the owned clone is active, and deletes only its own clone. Receipt failures clean up a newly created clone; legacy schema-1 receipts remain readable.
- Added a resilience-register entry for power-plan receipt/name drift.

## Verification

- `npm run audit:catalog`: passed; 108 tweaks, 0 errors, 0 warnings.
- `npm run test:bios-evidence`: passed; 9 checks.
- `npx tsc --noEmit`: passed; Vite production bundle passed with the existing ~1.4 MB JavaScript chunk advisory.
- `git diff --check`: passed; only existing LF/CRLF normalization warnings.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml` passed on the E: target with low-debug overrides: 99 passed, 0 failed. The default C: target remains space-constrained.
- Direct optimized Cargo build passed. `npm run tauri:build -- --ignore-version-mismatches -- --locked` produced `optimizationmaxxing_0.4.16_x64-setup.exe`, but exited 1 because this machine has the Tauri public key without `TAURI_SIGNING_PRIVATE_KEY`; the installer is unsigned/local-only.
- Earlier verification in this worktree: Windows PowerShell parser accepted the power-plan apply/revert and verifier strings; `cargo check --tests --offline` passed. Full Rust tests were not previously executed successfully.
- No live power-plan/registry action, installed-app behavior, target-PC reboot persistence, or gameplay gain is claimed.
- Latest read-only on this PC: Intel I211 Gigabit NIC, driver 12.18.11.1 (2020-06-15), link up at 1 Gbps; Wake-on-Magic-Packet and wake-pattern disabled; `AllowComputerToTurnOffDevice` disabled; EEE off; RSS on; interrupt moderation disabled; flow control disabled; jumbo off; LSO enabled; 1024 receive/transmit buffers; auto-negotiation set to 1 Gbps full duplex. No Windows setting was changed. Wake-on-Magic-Packet is a sleep/wake capability, not active-game packet handling, and already matches the user's requested off state.

## Known limits and release hold

- The preset does not edit the NVIDIA driver profile, Siege per-account config, startup list, NIC advanced properties, or firmware thermal/fan settings. The guide supplies values and direct navigation. This means the full requested pack is not yet one-button/apply-ready; the new Settings shortcuts do not close that gap.
- Do not add undocumented driver database or broad NIC/service writes to make the bundle appear complete. Keep exact snapshots, read-back, rollback, and explicit device scope.
- Build and temp output are directed to `E:\CodexTemp\optmaxxing_siege_build_20261004` on the PNY USB (`GAMING_USB`). Latest read-only space check: about 316.6 GB free on E: and 11.3 GB on C:. No USB files were deleted.
- Diggy explicitly authorized `push all` on 2026-10-04. That authorization remains valid. The required tests and optimized build now pass, and version/changelog files are at 0.4.16, but no commit, tag, push, signed release, or deploy has been performed yet. The local worktree uses a stale shared `node_modules` junction, so the Tauri build required `--ignore-version-mismatches`; the source lockfile remained authoritative and no dependency change was made.
- No user benchmark/test is owed. The user must still manually set the values marked as manual if using this partial local build; do not confuse that with app-applied state.

## Exact next action

Run final release checks, stage only the intended 0.4.16 source and continuity files, commit/tag/push under the documented sequence, and rely on signed CI for public updater artifacts. Preserve the E: build cache. After release, Diggy's remaining human gate is installing the package, rerunning Asta, and checking reboot persistence; no benchmark chore is owed.
