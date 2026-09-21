# optimizationmaxxing resilience contract

Scope: the post-v0.4.6 optimization lab improvement pass. This document is
part of the product contract: a feature is not considered production-ready
because it works on the happy path. It must also expose what it cannot prove,
retain a recovery path, and fail closed when evidence is missing.

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

## Existing product risk register

These pre-existing product safeguards remain part of the contract while the
new lab features are added.

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

## Risk register

| Risk | Detection signal | Recovery / plan B | Class |
| --- | --- | --- | --- |
| PresentMon is missing, cannot attach, or stops mid-capture | Match Scan reports no process, no samples, or an incomplete session | Keep the result unmeasured; fall back to the Asta proxy only as a candidate signal and never call it game proof | HOT |
| A transaction partially applies or a read-back mismatches | Native verification is not `verified`, the UAC batch returns an error, or receipt creation fails | Restore captured pre-state in reverse order. If any restore fails, report `partial`, retain the receipt, and require user review | HOT / RESTART |
| A setting drifts after reboot, Windows Update, or a driver install | Reboot validation or the next rig scan reports mismatch/unknown | Mark the receipt drifted, show the exact verifier, and require an explicit reapply; do not silently repair | RESTART |
| A board or BIOS profile is stale or not exact | SMBIOS identity, revision, or CPU support does not match the catalog | Use the unknown-board path and manual SCEWIN comparison. Never copy a nearby-board recipe | REBUILD |
| An NVPI/NIC artifact is malformed, stale, or regresses the capture | Hash/revision display, import verification, profile diff, or before/after evidence disagrees | Restore the exported profile or adapter defaults, then rerun the same capture; keep the shipped artifact unchanged | HOT |
| Driver oracle or update feed is offline | Fetch fails or the response fails schema validation | Use the cached last-known-good response for display only. Missing data never authorizes a driver install or tweak | HOT |
| A security, anti-cheat, or tournament-sensitive setting causes incompatibility | Review lane, risk metadata, anti-cheat tags, or user-reported failure | Keep it manual/review-only, restore the receipt, and preserve Secure Boot/Defender/anti-cheat access | RESTART |

`HOT` means the app can recover without restarting Windows. `RESTART` means
the user must reboot or return to firmware to prove the state. `REBUILD` means
the evidence catalog or shipped artifact must be corrected; the app must not
claim automatic failover for it.

## Safeguard backlog

P0 (implemented in this pass):

- Capture every native pre-state before a transaction mutates anything.
- Reject arbitrary PowerShell from the transactional path unless it has both a
  revert script and a read-only verifier.
- Verify every attempted action and reverse the transaction on failure.
- Show `committed`, `rolled_back`, or `partial` with per-action receipts and
  rollback errors.
- Keep exact board matching separate from CPU-only or nearby-board guesses.
- Keep Asta proxy results and PresentMon game evidence as separate verdicts.

P1 (implemented in this pass):

- Keep a local, schema-validated last-known-good driver-oracle response.
- Version the shipped NVIDIA profiles with review date, settings count, hash,
  and rollback text; keep NIC tuning advisory and adapter-specific.
- Add named per-game capture contracts so the same process and scene boundary
  can be reused by the lab and Match Scan.
- Add a local feature policy so a new automation feature can be disabled while
  diagnosing a field regression.

P2 (follow-up before a broad release claim):

- Expand exact board and memory-kit records only from primary OEM/QVL/SPD
  evidence, with a fixture matrix for each supported BIOS revision.
- Add a signed, versioned optimization-policy feed with expiry and a cached
  last-known-good manifest. A missing or invalid manifest must fail closed for
  mutation, while the app remains usable for diagnostics and rollback.
- Run real Fortnite same-scene captures across Intel, AMD, NVIDIA, Windows
  builds, driver branches, and anti-cheat states. Keep the results opt-in and
  local unless users explicitly consent to anonymous telemetry.
- Add field proof for UAC apply, reboot persistence, updater recovery, and
  profile import on clean machines. Source/build tests are not device proof.

## Remote control and kill-switch design

The app already has a signed updater channel for application releases. The new
local feature policy is intentionally not presented as a remote kill switch.
Before using a remote policy for optimization mutation, require a signed
manifest with a schema version, monotonic revision, expiry, feature states,
and an integrity-protected cached last-known-good copy. Invalid, expired, or
missing policy must disable new mutation and leave read-only diagnostics,
rollback, and recovery available. Every policy decision should be logged
locally with the manifest revision; no credentials or secrets belong in it.

The older release-driven contract still applies: a remote control may disable
an action or hide a redemption route, but it must never apply a replacement
tweak, change a user's settings, or weaken local revert. If a remote config is
missing, malformed, unsigned, or stale, the app fails closed for the listed
experimental lane and keeps diagnostics and local recovery available.

## Operational boundary

The optimization lab does not write BIOS/NVRAM, SPD, CPU voltage, thermal
limits, anti-cheat bypasses, or visibility cheats. Manual firmware recipes may
be documented, but the app must identify the exact board and leave the final
change, stability test, and rollback to the user. A local benchmark improvement
is a candidate until the actual game capture and a reboot persistence check
agree.

## Release gates

Before publishing a release, run the catalog audit, TypeScript build, Rust test
suite, and native artifact build. Then verify the version, changelog, manifest,
artifact hash, and public Updates route. A green local build is not proof that
the installed desktop app or public website has updated; those are separate
checks.
