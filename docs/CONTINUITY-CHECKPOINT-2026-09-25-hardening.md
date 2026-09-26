# OptimizationMaxxing hardening checkpoint - 2026-09-25

## Scope

This checkpoint covers the reliability, safety, UI clarity, research, hardware, preset, and catalog work requested during the September 25 hardening pass.

The work was performed in the isolated worktree:

`C:/Users/Diggy/projects/optimizationmaxxing-hardening`

It is detached at `origin/main` (`1940776`, v0.4.12). The original checkout at `C:/Users/Diggy/projects/optimizationmaxxing` was already dirty and was not reset, cleaned, overwritten, committed, pushed, installed, or deployed.

## Locked decisions

- Core Isolation / Memory Integrity remains enabled by default. It is not part of the esports preset; only an explicit compatibility or lab action may disable it.
- There is no blanket disable-all-mitigations action and no blanket CPU C-state or CPU-idle disable action.
- Fault Tolerant Heap, SysMain/Superfetch, global Search Indexer disable, Microsoft Store blocking, Windows Update disabling, Delivery Optimization peer sharing, and other disruptive actions are explicit opt-ins with warnings or troubleshooting-only scope.
- Windows Update cannot honestly be promised as permanently paused. The catalog offers an explicit NoAutoUpdate policy action, but it is not silently included in presets and requires manual patch discipline.
- The esports preset uses an idempotent named Ultimate Performance desktop plan and Game Mode. Reapplying it must not create duplicate plans.
- Re-apply uses selective verified repair: independently verified tweaks are kept, failed tweak groups are rolled back to their own captured pre-state, and no automatic repair happens merely from opening the audit.
- NIC bindings are not changed by a blind blanket script. IPv4/IPv6 and QoS Packet Scheduler are preserved; optional virtual, VPN, teaming, and vendor bindings require an explicit user decision or known-unused evidence.
- Session remains available as a hidden recovery utility, not a required optimization step.

## Implemented areas

- Transactional repair reporting and selective rollback in the Tauri backend and Diff page.
- Pending Windows Update/restart is advisory; an active update installation remains a hold.
- Power plan, Game Mode, Game DVR, background-app, update, Store, Delivery Optimization, device-idle, FTH, mitigation, hibernation, Spotlight, widgets, search, location, and related catalog research/scope.
- CPU-set explanations for logical Windows CPU-set IDs, detected-set count, P-core-only A/B testing, and the app-lifetime auto-pin watcher.
- Platform-aware Intel/AMD upgrade advisor with motherboard, memory, cooler, and compatibility context.
- Grind facts/setup presentation restored; public gear snapshot and event-result framing removed.
- Current mouse and keyboard entries updated, including PRO X2 SUPERSTRIKE, Finalmouse SLX Nightfall, current Razer options, and newer Wooting/Razer/SteelSeries keyboards.
- Network audit guidance now explains Intel Ethernet settings without unsafe blanket changes.
- Guides shortened and made more readable, including Custom OS review, Fortnite benchmark framing, and WinRing0/AV explanation.
- NVPI import flow hardened: both Fortnite downloads target one `Fortnite` profile, the generated catalog `.nip` matches the shipped XML shape, Valorant no longer assigns the Vanguard service executable, and the audit checks XML structure plus cross-file executable conflicts.

## Verification completed

- `npm run audit:catalog` - passed; 108 tweaks, 24 PowerShell actions, 18 read-back verified, 6 explicit-only, 0 errors, 0 warnings.
- `npm run audit:driver-profiles` - passed; 6 catalog hashes plus XML structure, generated-profile, and executable-conflict checks verified.
- `npm run test:bios-evidence` - passed; 9 checks.
- `npx tsc --noEmit` - passed.
- `npm run build` - passed; Vite build completed with the existing large-chunk warning.
- `cargo test --lib --manifest-path src-tauri/Cargo.toml --target-dir E:/CodexTemp/optimizationmaxxing-hardening-target -j 1` - passed; 98 tests, 0 failures. The fresh redirected build took 104m 07s because the old generated C: target was full.
- `git diff --check` - no whitespace errors; Git only reports expected LF/CRLF conversion warnings.
- The isolated `node_modules` junction was temporarily restored for the web build and remains an untracked dependency link; isolated `src-tauri/target` does not exist after verification.

## Known environment note

The original checkout's generated Rust target had consumed about 14 GB on C:. One generated library file was copied to `E:/CodexTemp/optimizationmaxxing-original-target-backup` and removed from the original generated target to restore working space. Source files and the user's original changes were not removed. The remaining generated cache is not source truth.

## Not yet proven

- No signed installed-build smoke test, UAC test, reboot persistence test, or real NIC/Intel advanced-property test has been run.
- No physical Fortnite benchmark or controlled P-core/E-core CPU-set A/B result exists.
- No real NVPI export/import reproduction has been run in this isolated source pass; the actual NVIDIA Profile Inspector dialog still needs a field test on the NVIDIA PC.
- No commit, push, release, deployment, or installed-client proof exists.

## Best next action

Review this isolated diff, then build/install the signed candidate on the test PC. Apply a small reversible preset, capture the receipt, reboot, re-read every action, and test NVPI and NIC flows before any release decision. Keep the original dirty checkout separate until that field pass is complete.
