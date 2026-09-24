# Optimizationmaxxing resilience notes

This is the small failure register for the automatic tuning path. It records
what the app can prove locally and what still needs a human or a real machine
test.

| Failure mode | Detection signal | Current safeguard | Recovery / fallback |
| --- | --- | --- | --- |
| Windows Update or a driver installer rewrites settings during a tune | Read-only preflight sees a Windows Update Agent install/uninstall operation, a pending reboot, or a pending file rename; an OS build change is advisory drift context | Tune Now/Asta block only while an update operation or pending restart is detected; available or queued updates do not block, and a completed build change can be re-applied with live readback | Use `Diff` after the reboot; re-apply only drifted rows after reviewing the recorded target |
| An apply partially succeeds or live state does not match | Transaction report is `failed`, `rolled_back`, or `partial`; post-apply verification reports mismatch/unknown | Automatic Tune Now uses captured pre-state, live verification, and reverse-order rollback; unsupported PowerShell contracts are excluded | Use the transaction detail and Settings restore/revert path; a `partial` report requires human review |
| A script runs but cannot be read back or deterministically undone | Missing `verify` or `revert` contract in the catalog action | The automatic planner denies the action; it remains available only through explicit review surfaces | Do not infer success from process exit code; use the named catalog recovery path |
| Confirmation fails in the desktop shell | A rejected dialog invocation or an unhandled promise is surfaced in the error state | Desktop confirmation goes through the async dialog helper, the capability includes `dialog:allow-confirm`, and the helper falls back to the webview confirmation if an older shell rejects the plugin call | Rebuild and relaunch the desktop shell; browser preview remains non-destructive |
| A read-back probe flashes a black console | A native verifier or scan starts a visible `powershell.exe` child | Read-only PowerShell probes use `CREATE_NO_WINDOW`; the elevated apply path remains separate so UAC is not hidden or silently bypassed | Install/relaunch the rebuilt shell and run Tune Now scan plus verify; an intentional UAC prompt is expected when an apply needs elevation |
| A successful apply drifts before the result is shown | The post-transaction read-back contains a mismatch for a selected tweak | Tune Now performs one bounded repair attempt only for transaction-capable actions, then reports remaining drift; script-only or unknown actions stay explicit | Open Your Tune/Diff and re-apply only after reviewing the receipt; use reboot persistence proof for a real restart check |
| Asta's extreme catalog contains a material security or compatibility tradeoff | A row is hard-blocked, experimental, high anti-cheat risk, tournament-breaking, or lacks deterministic read-back | Asta separates the full applicable inventory into standard and review lanes and asks for a second confirmation for review rows; firmware/BIOS/NVRAM recipes are excluded from automation | Inspect the individual tweak and test on a restore-backed, non-tournament session before opting in |
| A rebuilt client is not the client being tested | Local build succeeds but the installed/running app has not been replaced | Build output is kept separate from live proof; no release/install claim is made by build success | Install/relaunch the rebuilt client, then test Asta/Tune Now and verify the live UI on the target PC |

## Verification boundary

Build, TypeScript, catalog audits, and Rust tests prove the implementation is
internally consistent. They do not prove that a specific NVIDIA driver choice,
Fortnite anti-cheat path, UAC prompt, Windows Update session, or tournament
machine behaves correctly. Those remain field gates after the rebuilt client
is installed and relaunched.

## Next field test

1. Let the Windows Update queue in the user's screenshot finish, and restart if Windows requests it.
2. Install/relaunch the rebuilt optimizationmaxxing client.
3. Run Tune Now scan, confirm the stability gate is clear, and test the automatic lane.
4. Open `Diff` and confirm the result is reported as verified, drifted, or unknown rather than inferred from a command exit code.
5. Arm reboot persistence proof, restart Windows, and use `Check after reboot`; do not call a tweak persistent from an app restart alone.
