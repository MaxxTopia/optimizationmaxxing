# Continuity checkpoint: Asta safety hardening (2026-10-18)

## Scope

Harden the Asta apply and benchmark path in the `fix/asta-copy-v0.4.28`
worktree. The target is a reversible, hardware-aware workflow that does not
mistake an attempted write, an old receipt, or an incomplete network probe for
verified performance improvement.

## Current state

- Canonical worktree: `C:\Users\Diggy\projects\optimizationmaxxing-v0.4.27-copyfix`
- Branch: `fix/asta-copy-v0.4.28`
- Base tag/commit: `v0.4.28` / `5b6812d`
- Published v0.4.28 remains untouched. This hardening patch is not committed,
  pushed, installed, signed, or verified live in the installed app. An
  unsigned local executable and NSIS installer were built successfully.
- The installed/running client is still the published v0.4.28 build: `C:\Program
  Files\optimizationmaxxing\optimizationmaxxing.exe`, file version `0.4.28`,
  SHA-256 `CF863EB903A0FAF895F994DFBDEB55142BB1C936CB39D4A225602AADED0485BD`.
  It does not contain this worktree's hardening changes.
- The local environment has no `TAURI_SIGNING_PRIVATE_KEY`; the release workflow
  is configured to use the existing CI signing secrets. No key was invented or
  rotated, and no release/tag/push was performed.
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
guard, receipt-summary recovery, sparse-ping handling, and the incomplete-
evidence reboot-proof guard. `cargo fmt --check` was not a clean gate because the repository already
contains broad unrelated rustfmt drift; the worktree was not reformatted.

## Still unfinished / user-owed

1. If the gate is clean, decide whether to commit/tag/push a new release;
   publishing is a separate explicit boundary.
2. Install/relaunch a signed rebuilt client and run a read-only Asta plan, one
   controlled Fortnite capture, and a real reboot persistence check. Source
   tests cannot prove UAC behavior, the installed binary, FPS, input latency,
   or Fortnite server ping.

## Best next action

Review the final diff before any release action. The next implementation
backlog item is the signed installed-build smoke test; the next release item is
that smoke test on a signed build using the project's existing CI signing
configuration.
