# Optimizationmaxxing continuity checkpoint — Asta elevated read-back

Date: 2026-10-09
Branch: `fix/asta-qos-performance-setup`

## Scope

Repair the Asta transaction path after a real Windows receipt showed most actions rolled back because protected PowerShell and BCD verification ran from the unelevated Tauri parent after the elevated writer completed.

## Evidence recovered

- v0.4.21 is the current published release and its automated CI/build/release checks passed.
- The reported receipt contains Windows error 5 (`Access is denied`) for `Get-NetQosPolicy` and `Get-MMAgent`, plus BCD preflight reads marked ambiguous.
- An elevated PowerShell diagnostic on this host can read those same surfaces, confirming the failure is token/elevation-path related rather than proof that the settings are absent.
- Unsupported capabilities (`RSS`, `RSC`, and USB link power on this rig) are correctly no-write cases and must remain separate from permission failures.

## Locked decisions

- Keep the app least-privilege at launch; do not replace the product's per-operation UAC flow with a global `requireAdministrator` manifest.
- Run generated, catalog-owned read-back commands through the existing elevated helper only when the normal read is permission-blocked/ambiguous.
- Preserve atomic per-tweak rollback and never convert `Unknown` into `Verified`.
- Keep shipped PowerShell/batch command text ASCII-safe.

## Implemented in the working tree

1. Added elevated output-capturing read-back support and routed protected PowerShell/BCD verification through one UAC boundary.
2. Routed BCD pre-state capture through the same fallback and kept ambiguous BCD state fail-closed with no write.
3. Normalized raw PowerShell CLIXML permission failures into targeted receipts instead of treating them as evidence of drift.
4. Made PCIe Link State verification and apply/revert desktop-aware: desktops require AC disabled and ignore the unused DC value; laptops still require both AC and DC disabled.
5. Bumped the pending release to v0.4.22 and added a changelog entry covering the repair.

## Verification performed

- TypeScript no-emit, catalog audit (108 tweaks, zero errors/warnings), driver-profile audit, BIOS evidence checks, production frontend build, catalog JSON parsing, release metadata checks, and `git diff --check` pass after the PCIe refinement.
- The current host is elevated and exposes the original desktop mismatch: PCIe Link State AC is `0x00000000` while DC is `0x00000002`; the new desktop-aware verifier now treats that as correct.
- Local `cargo check --frozen --locked` and its offline retry stalled before starting a Rust compiler and were stopped; the Windows release workflow remains the authoritative Rust/build gate.

## Verification still required

- Automated source/build/CI checks.
- A real Windows run with the packaged app: one UAC consent, Asta receipt with no permission-driven rollback, and a second Tune/audit read-back.
- Reboot persistence and actual Fortnite gameplay remain separate human gates.

## Best next action

Run the focused checks again, explicitly stage only this repair and its release metadata, push v0.4.22 through the documented GitHub workflow, then have Diggy install that packaged build and repeat Asta once with UAC consent. A successful source/CI release does not replace the physical-PC receipt, reboot-persistence, or gameplay gates.
