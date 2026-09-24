# Continuity checkpoint: Background Standby Cleaner guidance release (2026-09-24)

## Scope

Make Background Standby Cleaner safer to understand and test for competitive
Fortnite use, then publish the app release and update the MaxxTopia download
page. This is a conservative, measurement-first change; it does not promise an
FPS or input-latency gain.

## Behavior in v0.4.12

- The recurring cleaner schedule is off by default.
- The app explains that standby memory is reusable cache, does not present a
  universal best interval or claim verified pro consensus, and describes timer
  intervals as experiments.
- A one-shot run is available without installing a recurring scheduled task.
- The cleaner checks for supported game processes and skips a purge when one is
  detected. This is a best-effort guard, not a guarantee for every game,
  launcher, anti-cheat system, or process-name variant.
- The app recommends testing outside a match: repeat the same Creative/replay
  route, compare frame-time spikes, 1% lows, and hitches across repeated runs,
  then leave the schedule disabled if results are not repeatable.
- Elevated one-shot resource resolution was fixed, including handling the
  Windows verbatim path prefix.
- Unsupported statements about pro usage and anti-cheat safety were removed.

The recommendation is empirical because available Windows memory-footprint
guidance measures memory use, not Fortnite performance, and Epic's competitive
PC guidance emphasizes game settings and managing background activity rather
than endorsing a standby-cache purge interval. See:

- https://learn.microsoft.com/en-us/windows-hardware/test/assessments/results-for-the-memory-footprint-assessment
- https://store.epicgames.com/news/fortnite-on-pc-best-settings-for-competitive-play-in-2026

## Release and live state

- Version: 0.4.12.
- Release commit: 721110e9a8c4d3fe4db2f48a0a3a7e07020e1c43.
- Branch: codex/standby-cleaner-guidance-v0.4.12.
- Published tag: v0.4.12.
- origin/main and the release tag both resolve to the release commit.
- GitHub release is public and not a draft:
  https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.12
- CI signing and release workflow 36044702654 succeeded. Published assets are
  the Windows x64 installer, its updater signature, and latest.json.
- MaxxTopia sync workflow 36045754018 and Cloudflare Pages deploy
  36045789541 both succeeded.
- Cache-busted https://maxxtopia.com/optimizationmaxxing/ returned HTTP 200
  and contained v0.4.12 and the versioned installer link. The installer HEAD
  request returned HTTP 200 with Content-Length 11520763.
- No claim is made that the new behavior has been field-tested on Diggy's PC.

## Verification performed

- npx tsc --noEmit: passed.
- npm run audit:catalog: passed (catalog v1.9.2, 100 tweaks, no errors or
  warnings).
- PowerShell parser: no script parse errors; shipped script is ASCII-only.
- git diff --check: passed.
- cargo test --manifest-path src-tauri/Cargo.toml: 98/98 passed.
- npm run tauri:build created the local Windows installer, then exited at the
  updater-signing step because the private signing key is not present locally.
  The signed CI release artifacts are the signing proof; do not report local
  signing as passed.

## Remaining risks and follow-up

- Real UAC one-shot behavior, the in-game process guard, and performance impact
  remain unverified on Diggy's machine. Do not enable a recurring schedule by
  default based on theory alone.
- Before attributing any change to the cleaner, keep the route, game settings,
  driver, and background applications fixed; repeat comparable runs and compare
  frame-time behavior. Stop using it if it causes hitches, instability, or
  anti-cheat concerns.
- Production npm audit still reports two moderate React Router 6.x advisories.
  The available fix is a major-version upgrade. One advisory concerns an
  open-redirect edge case in Link/useNavigate; the SSR hydration advisory is
  scoped to SSR/manual hydration, while this app uses client-side BrowserRouter
  Declarative Mode. These are follow-up maintenance items, not introduced by
  this release.
- CI reports a Node 20 action-runtime deprecation warning; the successful run
  also notes a future ubuntu-latest image migration. Update the workflow
  actions/runners in a separate scoped maintenance change.

## Best next move

Install the public signed v0.4.12 build. Keep the recurring cleaner disabled.
If desired, test one one-shot run only while Fortnite is closed, then conduct
repeatable same-route comparisons before considering any scheduled use. Treat
no measurable benefit as a reason to leave the feature off.
