# Continuity checkpoint: Asta safety hardening (2026-10-18)

## Scope

Harden the Asta apply and benchmark path in the `fix/asta-copy-v0.4.28`
worktree. The target is a reversible, hardware-aware workflow that does not
mistake an attempted write, an old receipt, or an incomplete network probe for
verified performance improvement.

## Current state

- Canonical worktree: `C:\Users\Diggy\projects\optimizationmaxxing-v0.4.27-copyfix`
- Branch: `fix/asta-copy-v0.4.28`
- Current branch and `origin/main` both point to the continuity follow-up
  commit `2b9b083`; the published `v0.4.30` tag points to release commit
  `666c5b2`.
- Released tag/commit: `v0.4.30` / `666c5b2`
- v0.4.30 was pushed and published by CI run `39156375162`:
  `https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.4.30`.
  The release is non-draft and non-prerelease; the signed installer,
  `latest.json`, and installer signature are present.
- Published installer SHA-256:
  `D5AE1C0CA92A3FD9E66FAC3F57BA961EFBACB2FA44BEDAAB5B2CD5FD419CFB6F`.
- MaxxTopia received the release dispatch successfully in workflow run
  `39156825570`; its follow-up Cloudflare Pages deploy completed successfully
  in run `39156839191`.
- The installed executable has not been replaced automatically: the file at
  `C:\Program Files\optimizationmaxxing\optimizationmaxxing.exe` is still
  version `0.4.29`. Installing v0.4.30 is the remaining local user-test step.
- The local environment still has no `TAURI_SIGNING_PRIVATE_KEY`; the release
  workflow used the existing CI signing secrets. No key was invented or
  rotated. CI emitted only a non-blocking GitHub Actions Node 20 deprecation
  annotation.
- The v0.4.30 client source now contains the catalog-driven Pinnacle plan in
  `src/pages/Asta.tsx` and `resources/catalog/v1.json`. It selects every
  matching measured/mechanism row with a complete native transaction contract,
  plus named transaction-backed experimental hardware rows. The installed
  v0.4.29 client does not yet contain this follow-up.
- Pre-existing generated schema modifications remain unstaged and must not be
  overwritten: `src-tauri/gen/schemas/acl-manifests.json`,
  `src-tauri/gen/schemas/desktop-schema.json`, and
  `src-tauri/gen/schemas/windows-schema.json`.

## Changes in this pass

- Asta's receipt recovery counts only a new or changed receipt after a native
  aggregate error. The phrase “receipts were recorded” no longer causes old
  historical rows to be counted as actions from the current run.
- Asta's verified and explicit lanes now use one native apply batch, normally
  reducing the apply path to one Windows consent. Protected preflight,
  read-back, or failure-only rollback can still require an additional consent;
  UAC is never bypassed.
- The native Asta batch keeps verified actions in per-tweak selective-rollback
  groups while explicit actions remain visible and are never silently reverted
  without a complete restore contract. Individual read-back is authoritative,
  so harmless aggregate shell noise cannot turn a live-verified batch into a
  false partial result.
- Missing ping jitter is preserved as `null` through the median bench and is
  never scored as perfect 0 ms jitter.
- Closed-loop evidence excludes ping from improved/regressed metric counts and
  returns an `insufficient` verdict when ping is not measurable on both sides.
- Reboot persistence items now carry an optional per-action `verifiedAt` value;
  legacy saved reports without that field still load, and the UI exposes the
  per-action post-reboot result in a disclosure panel.
- Asta now arms reboot proof with only the receipts created by that run instead
  of silently including every historical active receipt. The standalone
  persistence card can still deliberately arm all active receipts.
- Asta does not arm a reboot proof after a material local proxy regression,
  including when an explicit-only action remains active because it has no
  automatic revert contract. It also refuses to arm proof when the benchmark
  is insufficient or has missing metrics, such as sparse ping coverage.
- Asta now retains each newly applied receipt ID together with its action key
  from the batch result or recovery path. A temporary failure reading the
  receipt summary no longer skips the after benchmark; when IDs are known,
  the safety rollback can still target the current run and the read failure is
  shown as an explicit diagnostic.
- Asta resets the benchmark phase when the baseline cannot be captured, so a
  failed preflight cannot leave the UI looking as if it is still measuring.
- Ping evidence now requires at least ten successful replies in every median
  run before jitter is considered comparable. Sparse replies remain unknown
  and cannot influence a keep/revert verdict.
- The QoS policy guard now skips only explicit inactive/local-only or
  non-matching managed-policy evidence; a valid effective ActiveStore rule is
  not rejected merely because its detail mentions ActiveStore or Group Policy.
- Asta's inventory summary now shows the total catalog size and defines the
  buckets in plain language: eligible rows are matching software rows not
  already verified, already-on-target rows need no write, and separate-review
  rows are a subset of eligible rather than an additional count.
- Asta now keeps separate receipt sets for safety rollback and reboot proof:
  any active receipt from the current batch can remain a rollback target, but
  only an individually live-verified receipt can be armed as persistence proof.
  The final post-benchmark read-back synchronizes that proof set after any
  safety action instead of trusting the immediate apply report.
- Opening Asta is now list-only and does not trigger live verification or a
  protected read. Preview is the explicit live read-back boundary. The apply
  receipt includes per-action status/detail disclosure and explicitly counts
  active unverified actions outside reboot-persistence proof.
- The native Asta batch writes an `asta_inflight` marker before protected
  pre-state capture and changes, then records a completed marker only after
  receipts and selective rollback finish. If the app or Windows interrupts a
  run, the next Asta open warns the user to reconcile the live state instead of
  assuming that no write occurred.
- Resilience notes document automatic local regression rollback, receipt
  reconciliation, measurement limits, the shared Asta batch, and the remaining
  installed-smoke and lab-mode backlog.
- The follow-up selection model defines a catalog-driven evidence-led baseline
  plus a named experimental lane for broadly useful Fortnite settings. Both
  lanes require a complete transaction contract and a readable live state;
  only the three documented first-apply restore captures may start from
  `NOT_CONFIGURED`. Risk-4/security, policy-owned, firmware, static-file, and
  ambiguous rows stay visible but unchecked. The automatic experimental lane
  now covers the compatible active-route NIC controls (interrupt moderation,
  flow control, LSO, and RSC), core parking, device-idle performance, PCIe and
  USB link power, mouse input priority, MSI mode, and Delivery Optimization
  peer sharing. These rows remain visibly experimental but use the same single
  batched UAC path when their live state is readable. Asta's selection summary
  now also distinguishes untouched Pinnacle defaults from a user-customized
  selection so the UI never claims manual choices were automatic.
- The core-parking, device-idle, PCIe-link, and USB-link power actions now
  capture exact current AC/DC values (and the USB Attributes state) before
  writing, then restore those values on rollback/revert. They no longer guess
  generic restore values such as 0, 1, or 2.
- The USB 3 Link Power action now uses Windows' actual setting GUID
  `d4e98f31-5ffe-4ce1-be31-1b38b384c009` in both its apply and restore paths.
  The previous catalog GUID was not the USB 3 setting and could incorrectly
  make an exposed control appear unavailable.

## Verification performed

The latest full source gate passed on this worktree: TypeScript check, Vite
production build, catalog audit (108 tweaks, zero errors/warnings),
driver-profile audit, BIOS evidence test, `cargo check`, Rust tests (104
passed), and `git diff --check` (with only the known line-ending notices in
the pre-existing generated schemas). This gate includes the receipt-proof
split, final post-benchmark read-back, list-only Asta startup, per-action
receipt details, and the durable interruption marker. The native release build
also compiled the optimized executable and NSIS installer successfully. The
overall `npm run tauri:build` command stopped only at the signing step because
this worktree has a public signing key configured but no
`TAURI_SIGNING_PRIVATE_KEY`; no signing key was invented or rotated. Rust tests
now total 104 passed after the legacy reboot report compatibility test.

The latest gate also passed after exact receipt selection, the narrowed QoS
guard, receipt-summary recovery, sparse-ping handling, the incomplete-evidence
reboot-proof guard, and the exact AC/DC power restore contracts. The new
PowerShell action strings were parsed without syntax errors, and a read-only
`powercfg /qh` check confirmed the targeted core-parking, device-idle, PCIe,
and USB 3 setting GUIDs are discoverable on this host; Asta still skips the
control on rigs whose driver or power plan does not expose it. `cargo fmt --check` was not a clean gate because the repository already
contains broad unrelated rustfmt drift; the worktree was not reformatted.

The signed v0.4.29 release was downloaded, its installer hash matched the
published release digest, installed, relaunched, and checked through the actual
desktop window. The v0.4.30 release is now published with the installer,
signature, and `latest.json` returning successfully over HTTPS. These checks
verify packaging and release availability only; they do not verify a protected
Windows write, reboot persistence, Fortnite FPS, input latency, or server ping.

The Asta selection and power-contract follow-up passed `npx tsc --noEmit`,
`npm run build`, the catalog audit (108 tweaks, zero errors/warnings), the
driver-profile audit, the BIOS evidence test, `cargo test` (104 passed), and
`git diff --check`. These checks prove source/build integrity only; they do not
prove the new selection behavior in the installed client until v0.4.30 is
installed and opened.

The new release policy gate also passed: `npm run audit:asta-policy` reports
catalog v1.9.4, 108 rows, 14 named Pinnacle rows, three first-apply restore
rows, and zero errors.

The follow-up was then tightened so the app-owned Ultimate Performance plan is
the only named situational baseline exception, while tournament-breaking
metadata and static game-file writes remain blocked even for named experimental
rows. The type check, production build, catalog audit, and diff check passed
again after that correction. The installed v0.4.29 client still does not
contain this source follow-up.

This session added `scripts/audit-asta-policy.mjs` and the
`audit:asta-policy` npm script as a release-facing policy gate. It checks that
the named Pinnacle experimental and baseline IDs exist, do not overlap, carry
honest warning/expected-impact copy, and have complete PowerShell verifier and
restore contracts or supported native action kinds. It also checks the Asta
source guard fragments that keep risk-4/security, static-file, policy-owned,
and ambiguous rows out of automatic selection. The first audit found missing
trade-off metadata on six intentionally promoted rows; those catalog entries
now explain their risks and expected impact, and the audit passes with zero
errors.

The release workflow now runs this policy audit before the catalog audit and
Tauri packaging, so a future tag cannot package a broadened or under-documented
automatic lane without failing CI first.

## Still unfinished / user-owed

1. Install v0.4.30, relaunch the app, and read back both the installed
   executable at `C:\Program Files\optimizationmaxxing\optimizationmaxxing.exe`
   and the in-app version; both must report `0.4.30` before testing Asta.
   Then use Asta's read-only preview, run one protected apply, restart Windows,
   and use its Check-after-reboot flow. This is the human UAC/reboot gate;
   source and packaging tests cannot prove it.
2. Run one controlled Fortnite before/after capture with the same scene,
   route, graphics, cap, driver, and background load. The desktop Asta proxy is
   not proof of FPS, input latency, build registration, or server ping.
3. Confirm the installed Asta screen shows compatible “Pinnacle default” and
   “Pinnacle experimental” rows selected while ambiguous/policy/security rows
   remain unchecked.

## Best next action

Install the published v0.4.30 client, confirm the executable and in-app version
both read `0.4.30`, then use it for a read-only Asta preview, one protected
apply, a Windows restart, and Check after reboot before judging Fortnite. Then
run one controlled same-scene A/B capture. Keep the existing unrelated
generated-schema changes and continuity file rename untouched.
