# OptimizationMaxxing resilience register

This is the short pre-mortem for the desktop tuning product. It is intentionally
plain language so another maintainer can recover the safety boundary without
depending on chat history.

## Locked safety rules

- Every catalog action must have a captured pre-state or an explicit reason it
  cannot. Revert must restore the captured value, not a guessed default.
- Experimental actions are opt-in. The UI names the expected benefit, the
  failure mode, and the recovery path before applying them.
- A benchmark is a comparison aid, not proof of lower Fortnite input latency.
  A CPU screen is a bounded stability screen, not an RMA diagnosis.
- Tournament Mode is an eligibility and preflight surface. It never claims that
  a tweak is invisible to anti-cheat or guarantees tournament eligibility.
- First-time Tune Now offers are server-backed discount invitations. Discord
  OAuth identifies the account, the offer expires after three days, and VIP is
  never granted automatically. A screenshot is only a visual reminder; the
  server-side offer record is what Diggy verifies.

## Risk register

| Priority | Failure mode | Detection signal | Current safeguard | Next safeguard |
| --- | --- | --- | --- | --- |
| P0 | An experimental registry, BCD, or device tweak makes Windows or a device unreliable. | Apply receipt, reboot failure, device disappears, user reports black screen. | Restore point before elevated batches, one-click revert, experimental confirmation, pre-state capture. | Add a catalog lint rule that blocks high-risk actions without a concrete inverse or explicit non-revertible label. |
| P0 | A bad catalog entry silently ships or a preset references a removed tweak. | Catalog audit error, missing preset IDs, failed apply preview. | `scripts/audit-catalog.mjs`, preset missing-ID warnings, no silent filtering. | Run the audit in release CI and make errors fail the build. |
| P1 | CPU screening creates unsafe heat or gives false confidence. | Temperature/noise warning, thread failure, WHEA delta, user reports instability. | Bounded 60s default, optional 3m run, explicit Stop screen control, WHEA described as a signal, follow-up tools named. | Add a live temperature cutoff before making the long run a default. |
| P1 | OS comparisons mistake a driver, BIOS, game patch, or background process for an OS advantage. | Same rig produces different results across repeated control runs. | Median-of-3, saved OS build and hardware, fair-test checklist, local-only storage. | Add a control run label and reject comparisons without matching driver/game metadata. |
| P1 | A tournament user changes a setting that conflicts with a current Epic requirement. | Pre-Tournament Audit flags Secure Boot, TPM, IOMMU, VBS, or unknown state. | Tournament copy is eligibility-first; no anti-cheat safety claims; audit remains separate from Tune Now. | Re-check the official rules link and cache a dated requirement snapshot during every content review. |
| P1 | A first-time offer is copied, duplicated, or honored after its deadline. | `/admin/offers` shows repeated Discord IDs, expired timestamps, or a used ticket presented again. | Server offer ledger, Discord OAuth binding, one offer record per Discord account, three-day expiry, admin-only redeem/revoke actions, no automatic VIP grant. | Move the per-account uniqueness lock to a Durable Object if offer volume or concurrent abuse makes KV eventual consistency material. |
| P1 | Maxx Bot cannot DM a linked offer holder. | Offer row has a linked Discord ID but no `dmSentAt`; Worker logs a Discord API failure. | Best-effort guild join, `dmSent` status, admin `DM again` action, and the app still shows the offer after OAuth. | Add a daily alert for linked offers with an unsent DM older than 15 minutes. |
| P1 | The offer worker is unavailable during Tune Now. | App shows a local fallback / status check instead of a server-backed offer. | Worker calls fail open for tuning; local copy is explicitly marked not account-secured and can be retried later. | Add a health check and a small in-app service-status banner if failures become common. |
| P2 | Upstream hardware, pro, or Fortnite guidance goes stale. | Review date ages; vendor or official rules page changes. | Evidence review stamps, source links, language that separates historic from current claims. | Add a freshness report that lists citations older than the review window. |
| P2 | A MaxxTopia update or release artifact is missing even though the app shipped. | Version mismatch, missing rendered Updates card, failed Pages/custom-domain check. | Changelog entry and release checklist; preview plus cache-busted custom route verification. | Add a release check that compares the app version, public update entry, and latest artifact manifest. |

## Kill-switch design

The safe remote control is a signed, versioned denylist of tweak IDs and preset
IDs, fetched only when the app already has an approved update/config path. It may
disable an action or hide a ticket redemption route, but it must never apply a
replacement tweak, change a user's settings, or weaken local revert. If the
config is missing, malformed, unsigned, or stale, the app fails closed for the
listed experimental lane and keeps the local catalog available. The app should
show the user which action was withheld and why.

The first implementation can remain local and release-driven: removing or
marking an experimental catalog item unavailable is safer than inventing a
live control plane before there is a signed endpoint, audit log, and rollback
procedure.

## Release gates

Before publishing a release, run the catalog audit, TypeScript build, Rust test
suite, and native artifact build. Then verify the version, changelog, manifest,
artifact hash, and public Updates route. A green local build is not proof that
the installed desktop app or public website has updated; those are separate
checks.
