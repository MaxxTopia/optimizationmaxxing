# Continuity checkpoint: Pinnacle Asta and persistence release (2026-09-24)

## Scope

Harden the Tune Now, Asta, Diff, and Optimization Lab flows after the gaming-PC
Windows recovery/update loop exposed late lane selection, console flashes,
opaque confirmation failures, and drift that was reported but not repaired.

## Behavior now

- Tune Now chooses intensity and game context before the read-only rig scan.
- Asta inventories the complete applicable software catalog for the detected rig
  and Fortnite context. It separates standard actions from higher-risk review
  actions and asks for a second confirmation before the review lane. BIOS,
  NVRAM, and firmware recipes remain manual and are never automatic.
- Transaction-capable actions capture pre-state, apply, verify, and roll back on
  failure. Tune Now makes one bounded repair attempt when an eligible row drifts
  during the same run. It does not create a hidden retry loop or promise that a
  future Windows Update/vendor utility cannot change the setting again.
- Read-only PowerShell verification uses a hidden child process, so scanning and
  verification do not flash black console windows. The elevated UAC apply path is
  deliberately separate.
- The desktop confirmation helper falls back to the webview confirmation when a
  stale shell rejects the dialog plugin ACL, so the safety gate remains visible.
- Asta and Tune Now expose the existing two-phase reboot persistence proof. It
  arms the exact receipt set before a real restart and checks live read-back after
  Windows has restarted; it never silently reapplies drift.
- Optimization Lab now explains and labels its ready transactional lane as a
  separate evidence/apply surface rather than implying that it is only a plan.

## Release

- Version: `0.4.11` (the prior `v0.4.10` tag is already published and must not be overwritten)
- Intended tag: `v0.4.11`
- Scoped source: this worktree's frontend/native tuning changes, release notes,
  version metadata, and continuity notes only.
- The canonical optimizationmaxxing checkout may contain unrelated work; it is
  not used as a staging source for this release.

## Verification boundary

TypeScript, catalog audits, Rust tests, frontend build, and CI bundle/signing
prove the implementation and release artifacts. They cannot prove real UAC
behavior, registry/BCD rollback, Fortnite anti-cheat eligibility, Windows Update
interference, or reboot persistence on Diggy's physical PC.

## Diggy-owed field test after install

1. Install/relaunch the signed `v0.4.11` client.
2. Open Tune Now and confirm the intensity/game choice appears before scanning;
   run a low-risk lane and verify no read-only black console flashes appear.
3. Open Asta, confirm the inventory separates standard/review/manual rows, and
   verify the second review confirmation is required before higher-risk rows.
4. Open Your Tune/Diff and confirm immediate read-back status is honest.
5. Arm reboot persistence proof, restart Windows, then run the post-reboot check.

## Best next move

Install the CI-signed `v0.4.11` artifact on the gaming PC and run the field test above.
If the real machine still shows drift, capture the exact tweak receipt and live
read-back rather than reapplying the whole catalog.
