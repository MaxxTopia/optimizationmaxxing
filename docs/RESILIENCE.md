# Optimizationmaxxing resilience notes

This is the small failure register for the automatic tuning path. It records
what the app can prove locally and what still needs a human or a real machine
test.

| Failure mode | Detection signal | Current safeguard | Recovery / fallback |
| --- | --- | --- | --- |
| Windows Update or a driver installer rewrites settings during a tune | Read-only preflight sees an active Windows Update service, a pending reboot, a pending file rename, or an OS build change since the last apply | Tune Now blocks the automatic lane and asks for updates to finish, a restart if requested, and a fresh scan | Use `Diff` after the reboot; re-apply only drifted rows after reviewing the recorded target |
| An apply partially succeeds or live state does not match | Transaction report is `failed`, `rolled_back`, or `partial`; post-apply verification reports mismatch/unknown | Automatic Tune Now uses captured pre-state, live verification, and reverse-order rollback; unsupported PowerShell contracts are excluded | Use the transaction detail and Settings restore/revert path; a `partial` report requires human review |
| A script runs but cannot be read back or deterministically undone | Missing `verify` or `revert` contract in the catalog action | The automatic planner denies the action; it remains available only through explicit review surfaces | Do not infer success from process exit code; use the named catalog recovery path |
| Confirmation fails in the desktop shell | A rejected dialog invocation or an unhandled promise is surfaced in the error state | Desktop confirmation goes through the async dialog helper and the capability includes `dialog:allow-confirm` | Rebuild and relaunch the desktop shell; browser preview remains non-destructive |
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
