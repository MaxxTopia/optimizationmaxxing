# OptimizationMaxxing continuity checkpoint - 2026-10-20 Asta proxy regression

## Scope

This pass hardens the Asta apply and rollback path after a user receipt showed
the local composite proxy falling from 95 to 92. The source fix is in the local
worktree `fix/asta-copy-v0.4.28`; it has not been pushed or published. Existing
dirty continuity, schema, and generated files were preserved.

## Root cause and changes

- A physical NIC action could require an IPv4 default route even when the rig
  only exposed IPv6 or when route selection changed. Apply and verification now
  enumerate IPv4 and IPv6 default routes, select an Up physical adapter, and
  reject virtual/VPN candidates.
- NIC rollback previously resolved the current route again instead of restoring
  the adapter captured before the write. NIC ownership records now retain PNP,
  interface GUID, name, and index identity; revert uses that saved identity and
  refuses a different device.
- A missing app-owned NIC ownership record is now a safe no-op during rollback,
  rather than a second rollback failure.
- The elevated batch now returns one result per command while keeping one UAC
  boundary. A failed command is reported against its exact tweak; unrelated
  commands are not falsely reported as failed or rolled back.
- Asta and generic receipt rollback now map elevated results back to individual
  actions, preserving truthful committed, failed, and reverted states.
- The existing closed-loop bench remains in place: reversible actions can be
  reverted after a material proxy regression; explicit/manual actions without a
  verified restore contract remain visible for review instead of being silently
  guessed or overwritten.

## Verification

Passed in this worktree:

- `cargo test --manifest-path src-tauri/Cargo.toml` - 104 passed
- `npx tsc --noEmit`
- `npm run build`
- `npm run audit:catalog` - 108 rows, zero errors or warnings
- `npm run audit:asta-policy`
- `npm run test:powershell-contracts`
- PowerShell parser audit - 48 action scripts parsed
- `git diff --check`

The native desktop package build produced the executable and NSIS installer:
`src-tauri/target/release/optimizationmaxxing.exe` and
`src-tauri/target/release/bundle/nsis/optimizationmaxxing_0.4.33_x64-setup.exe`.
The command returned nonzero only at the Tauri signing step because this
worktree has a public key but no `TAURI_SIGNING_PRIVATE_KEY`; the artifact is
not a signed release and was not published.

## Not proven yet

- No source check proves that a particular user's Fortnite FPS, ping, input
  latency, or game feel improves. The Asta composite is a host proxy, not a
  Fortnite performance measurement.
- Real Windows UAC, the user's active Intel adapter, reboot persistence, and a
  same-scene Fortnite comparison still require a packaged-build device test.
- A prior 95-to-92 receipt may have left an explicit/manual action active if it
  had no safe restore contract. The new receipt should identify each such row;
  use the app's review/revert path rather than guessing a Windows value.

## Best next action

The local build cannot sign without the private updater key; CI owns that
secret. After the authorized v0.4.33 tag is published by CI, install the
signed packaged build on the test PC,
run Asta with the same route, graphics, cap, driver, and background load, and
save the per-action receipt. Restart Windows and run the persistence check. If
the proxy regresses, confirm that only the responsible reversible action(s) are
reverted and capture the exact diagnostic for the next fix.

