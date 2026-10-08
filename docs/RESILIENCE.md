# Optimizationmaxxing resilience notes

This is the failure register for automatic tuning and adaptive hardware/network calibration. A dependency is an input to measure, not a reason to apply a universal value.

| Failure mode | Detection signal | Current safeguard | Recovery / fallback |
| --- | --- | --- | --- |
| Windows Update or a driver installer rewrites settings during a tune | Read-only preflight sees a Windows Update Agent install/uninstall operation, a pending reboot, or a pending file rename; an OS build change is advisory drift context | Tune Now/Asta block only while an update operation or pending restart is detected; available or queued updates do not block, and a completed build change can be re-applied with live readback | Use `Diff` after the reboot; re-apply only drifted rows after reviewing the recorded target |
| An apply partially succeeds or live state does not match | Transaction report is `failed`, `rolled_back`, or `partial`; post-apply verification reports mismatch/unknown | Automatic Tune Now uses captured pre-state, live verification, and reverse-order rollback; unsupported PowerShell contracts are excluded | Use the transaction detail and Settings restore/revert path; a `partial` report requires human review |
| A script runs but cannot be read back or deterministically undone | Missing `verify` or `revert` contract in the catalog action | The automatic planner denies the action; it remains available only through explicit review surfaces | Do not infer success from process exit code; use the named catalog recovery path |
| Confirmation fails in the desktop shell | A rejected dialog invocation or an unhandled promise is surfaced in the error state | Desktop confirmation goes through the async dialog helper, the capability includes `dialog:allow-confirm`, and the helper falls back to the webview confirmation if an older shell rejects the plugin call | Rebuild and relaunch the desktop shell; browser preview remains non-destructive |
| A read-back probe flashes a black console | A native verifier or scan starts a visible `powershell.exe` child | Read-only PowerShell probes use `CREATE_NO_WINDOW`; the elevated apply path remains separate so UAC is not hidden or silently bypassed | Install/relaunch the rebuilt shell and run Tune Now scan plus verify; an intentional UAC prompt is expected when an apply needs elevation |
| A successful apply drifts before the result is shown | The post-transaction read-back contains a mismatch for a selected tweak | Tune Now performs one bounded repair attempt only for transaction-capable actions, then reports remaining drift; script-only or unknown actions stay explicit | Open `Your Tune`/`Diff` and re-apply only after reviewing the receipt; use reboot persistence proof for a real restart check |
| Asta's extreme catalog contains a material security or compatibility tradeoff | A row is hard-blocked, experimental, high anti-cheat risk, tournament-breaking, or lacks deterministic read-back | Asta separates the full applicable inventory into standard and review lanes and asks for a second confirmation for review rows; firmware/BIOS/NVRAM recipes are excluded from automation | Inspect the individual tweak and test on a restore-backed, non-tournament session before opting in |
| A rebuilt client is not the client being tested | Local build succeeds but the installed/running app has not been replaced | Build output is kept separate from live proof; no release/install claim is made by build success | Install/relaunch the rebuilt client, then test Asta/Tune Now and verify the live UI on the target PC |

## Persistence and safety register

The app cannot prevent Windows, a driver package, an OEM utility, Group Policy,
or another optimizer from changing a setting after the app writes it. The
reliable contract is therefore: capture the prior value, apply one named
action, read the live value back, report drift precisely, and validate again
after a real reboot. Automatic silent re-application would hide ownership and
can fight Windows Update or a device driver, so it is intentionally not used.

| Risk class | Failure mode | Detection / safeguard | Fallback |
| --- | --- | --- | --- |
| HOT | One action in a batch fails while earlier actions succeeded | Per-tweak receipts, verification, and selective repair/revert; a failed repair no longer rolls back unrelated verified rows | Re-apply only the named drift row after reviewing its live value |
| HOT | Windows Update or a pending installer races the batch | Active Windows Update installation blocks automatic tuning; a pending reboot is shown as an advisory and is included in persistence guidance | Finish the installer, reboot when appropriate, then scan and verify again |
| HOT | A tweak applies now but is rewritten during reboot | Reboot persistence is an explicit arm/check flow, not an app-restart claim; the result is `verified`, `drifted`, or `unknown` | Use the receipt and Diff page; do not call an unverified tweak persistent |
| RESTART | A duplicated custom power plan accumulates on repeat | Ultimate Performance selection reuses the named plan when present, checks command exit codes, and activates the plan idempotently | Remove only a stale named plan after inspecting the plan list; never delete the active plan blindly |
| REBUILD | A network binding or Intel advanced property breaks VPN, Hyper-V, WSL, or file sharing | The adapter audit is read-only and the UI tells users which core bindings to preserve; only explicit, named NIC properties are catalog actions | Restore the recorded adapter property and re-enable the affected binding in Windows |
| REBUILD | A security reduction is mistaken for a latency tweak | Core isolation/Memory Integrity, exploit mitigations, FTH, Windows Update, Store, and background-app policies are explicit-only, warned, and excluded from automatic Tune Now | Keep the default security state; use a restore point and a short, measured lab test before opting in |
| REBUILD | A guide or hardware claim goes stale | Review dates and source links remain visible; setup/settings are labeled as dated snapshots rather than universal prescriptions | Refresh the source record before changing a recommendation |

## Adaptive calibration flow

The network path resolves variables into observable conditions before it offers a
write:

1. Detect the active IPv4 default route using route and interface metrics.
2. Resolve its adapter, interface index, hardware/virtual status, PnP identity,
   and signed driver metadata.
3. Read only properties the active driver actually exposes.
4. Classify available local traffic evidence: Fortnite process and UDP endpoint
   presence, adapter counters, and route stability.
5. Apply one reversible catalog action to that route adapter only, after
   binding the action to the identity captured by the audit.
6. Read the property back. During a measured experiment, compare the same
   probes and counters and require both sides to still match the pre-apply
   adapter identity.
7. Keep only a verified, non-regressing result. Revert on route identity
   change, adapter errors/discards, inconclusive probes, or a measured
   regression.

| Network failure mode | Detection | Safe behavior |
| --- | --- | --- |
| VPN, Hyper-V, WSL, or another virtual route is active | Default route does not resolve to `Get-NetAdapter -Physical` | Skip physical NIC actions and explain that the active route is virtual. |
| The user changes Wi-Fi/Ethernet, a route metric changes, or a driver reloads during a test | Interface index plus PnP/GUID identity differs before/after | Do not keep the change; attempt the catalog rollback. |
| A vendor driver does not expose a property | The read-back value is null or the cmdlet returns no object | Skip that action; never substitute a guessed Intel/Realtek/Killer value. |
| A legacy or foreign prestate exists | Ownership record is missing, malformed, or not schema 2 | Refuse apply/revert instead of overwriting or guessing the old value. |
| Fortnite is closed or has no UDP endpoints yet | Process/endpoint evidence is absent | The app may inspect capabilities, but labels the result as not game-traffic evidence. |
| Another application is using the adapter | Counter deltas and process/route evidence show non-game traffic | Report local adapter evidence; do not claim Fortnite server latency proof. |
| An action changes the driver but read-back fails | Native verifier returns unknown or a post-check cannot measure two common targets | Roll back the receipt and surface the reason. |
| The route changes after preflight but both measurements land on the new route | Before/after identity does not match the pre-apply identity | Treat the result as inconclusive and roll back; never accept a new-route comparison as proof for the original action. |
| Errors or discards increase during the after window | Adapter counter delta is one or more | Treat it as a regression and revert. |
| A reboot or driver update changes the live state | Fresh audit differs from the receipt's recorded identity/value | Mark drift and require a new verified apply; do not report persistence from an old receipt. |

## Safeguard backlog

1. Add a signed installed-build smoke test that opens Diff, runs a read-only
   scan, and records the exact catalog revision used for verification.
2. Add a per-action “last verified after reboot” timestamp to the receipt UI so
   a reboot check cannot be confused with an ordinary app restart.
3. Keep destructive/security-degrading actions out of profile presets unless a
   future release adds a dedicated lab-mode consent and rollback checklist.

## Proof boundaries

- A verified catalog receipt proves that the requested native value was read back at apply time. It does not prove better FPS, input latency, or Fortnite server ping.
- ICMP probes and adapter counters are local proxies. Fortnite Net Debug Stats and a real match are still required for an in-game claim.
- No packet payloads, remote endpoint addresses, firmware, BIOS, or kernel-driver writes are part of this calibration path.
- Build, TypeScript, catalog audits, and Rust tests prove implementation
  consistency. They do not prove that a specific NVIDIA driver choice, UAC
  prompt, Windows Update session, or tournament machine behaves correctly.

## Next field test

1. Install/relaunch the rebuilt optimizationmaxxing client.
2. Run a read-only network audit and confirm the active physical adapter,
   driver, and exposed properties match the intended Ethernet device.
3. Run one measured NIC experiment while Fortnite is open and showing Net Debug
   Stats, or leave the result labeled as a local proxy when Fortnite is closed.
4. Confirm the action is verified or automatically reverted; then reboot and
   re-read the live value before calling it persistent.
