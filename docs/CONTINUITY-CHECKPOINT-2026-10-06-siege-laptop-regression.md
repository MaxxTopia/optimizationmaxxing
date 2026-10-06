# Continuity checkpoint: v0.4.18 Siege laptop regression

Date: 2026-10-06
Scope: Repair the Rainbow Six Siege preset after a laptop client reported a drop from 150 FPS to 120 FPS, then verify and release the fix.

## Recovered evidence

- The attached older-build screenshots showed three expected desktop-only skips, but still listed 12 verified settings and 15 actions.
- The older flow also prompted for the experimental Microsoft Store app background activity policy.
- The screenshots do not prove which setting caused the FPS regression. The likely risk cluster is laptop-sensitive display refresh/VSync coupling, HAGS, background-app policy, and OEM control-center/RGB startup behavior.
- No affected laptop has been retested in this session. Target-device FPS, reboot persistence, and OEM behavior remain field gates.

## Decisions

- The one-click Siege baseline must not change laptop-sensitive settings unless the rig snapshot explicitly proves a desktop chassis.
- Deferred IDs: display.refresh.maximize, process.hags.enable, process.background-apps.disable, and peripherals.rgb-control-apps.autostart-disable.
- Existing desktop-only exclusions remain in place, including the desktop Ultimate Performance clone on laptops.
- Unknown form factor is fail-closed for the four laptop-sensitive settings; universal safe baseline entries remain available.
- If an older receipt shows that a deferred setting was previously applied, the UI offers an explicit recovery button that restores only those saved app-owned values. It does not silently revert unrelated changes.
- The Siege guide now labels official-control items and laptop behavior directly. The compatibility card explains the reduced laptop eligibility instead of implying that the whole preset was applied.

## Files changed

- package.json
- src-tauri/Cargo.toml
- src-tauri/tauri.conf.json
- src/lib/presets.ts
- src/pages/Presets.tsx
- src/components/RainbowSixSiegePackGuide.tsx
- src/lib/changelog.ts

## Verification

- npm run audit:catalog: passed; 108 tweaks, 0 errors, 0 warnings.
- npm run audit:driver-profiles: passed; catalog hashes and XML checks match.
- npx tsc --noEmit: passed.
- npm run build: passed; Vite emitted only the existing large-chunk warning.
- cargo test: passed; 99 tests passed, 0 failed, using CARGO_TARGET_DIR on E:\CodexTemp\optmaxxing_siege_build_20261004\cargo-target.
- npm run tauri:build: the optimized binary and unsigned NSIS installer were created on the USB target. Local signing stopped because this checkout has the public key but not TAURI_SIGNING_PRIVATE_KEY; CI owns the signed release artifact.
- Commit `21117a0`, tag `v0.4.18`, push, CI run `37526628908`, signed assets, updater metadata, and public release are complete. The public release is https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.18.

## Release and field handoff

- Live version: v0.4.18. The signed NSIS installer, `.sig`, and `latest.json` are published; the updater manifest reports version `0.4.18`.
- Release workflow: GitHub Actions run `37526628908` completed successfully, including the catalog audit, Windows build, artifact signing, publication, and MaxxTopia notification.
- User is authorized to publish from the earlier explicit push-live request in this thread.
- After release, affected laptop users should install v0.4.18. If the preset shows Older laptop settings are still active, click Restore deferred laptop settings once, then apply the safe baseline.
- On laptops, use the OEM plugged-in Turbo or Performance mode deliberately. Do not stack forced HAGS, refresh, VSync, or MUX changes without checking the game and OEM control panel.
- The next best proof is a controlled retest on the affected laptop: record refresh/VSync/FPS-cap state, apply the recovery if offered, apply the new preset, reboot, and compare Siege FPS and frame-time behavior. This is user/device evidence, not a source-build claim.

## Known risks

- The new lane prevents reapplication of the four sensitive settings, but it cannot know whether an old release changed a setting outside the app receipt or whether another utility changed it.
- A 150-to-120 FPS report is not causal proof from screenshots alone; the release should describe this as reducing the regression risk, not guaranteeing a particular FPS result.
- The source/build/release gates do not prove that the affected laptop recovered 150 FPS, that reboot persistence is correct on that device, or that a specific setting caused the original drop.
