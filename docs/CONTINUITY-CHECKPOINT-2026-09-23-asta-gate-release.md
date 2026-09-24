# Continuity checkpoint: Asta queued-update gate release (2026-09-23)

## Scope

Release the Asta activation fix requested after completed essential Windows updates continued to show the update gate.

## Behavior

- Available or queued Windows Update items do not block Asta.
- The idle `wuauserv` service is diagnostic context only.
- A real Windows Update Agent install/uninstall operation still blocks.
- A registry-detected pending restart or pending file rename still blocks because Windows can still rewrite settings on reboot.
- A changed OS build is advisory drift context and receives live readback/reboot-persistence guidance rather than a hard block.

## Release

- Version: `0.4.9`
- Source baseline: `origin/main` at `a979d91`, including the two remote commits missing from the dirty local checkout.
- Intended release files: preflight policy, Asta copy, resilience documentation, version files, changelog, corrected NVPI checksum metadata, and this checkpoint.
- No unrelated local worker or continuity WIP is included.

## Verification and evidence boundary

- TypeScript check passed; Rust tests passed (95/95); catalog audit passed (100 tweaks); NVPI profile audit passed (6/6 artifacts); frontend build passed; desktop NSIS bundle built successfully.
- The clean build required aligning `@tauri-apps/plugin-updater` to `2.12.0` with the Rust updater plugin; the prior clean checkout failed before compilation on that mismatch.
- The non-breaking npm audit fix was applied; two React Router advisories remain and require the breaking `react-router-dom` 7 upgrade, so that larger migration is intentionally outside this focused release.
- Local bundling stops at the expected signing boundary because `TAURI_SIGNING_PRIVATE_KEY` is CI-only.
- CI signing and the updater artifact set remain the release proof; a local unsigned bundle is not live-client proof.
- Diggy must install/relaunch the signed build on the gaming PC and confirm Asta activates while ordinary Windows Update items remain queued. Real UAC/tweak persistence remains a human test.
