# Continuity checkpoint - profile media upload hardening (2026-10-20)

## Scope and recovered state

The canonical Worker checkout is `C:\Users\Diggy\projects\optimizationmaxxing-profile-media`, branch `codex/profile-flair-media-upload`. The follow-up source is uncommitted and unpushed. Deploy only from `vip-worker` in this checkout after an explicit publish request. The separate optimizationmaxxing checkout is dirty and is not the deployment source.

## What changed

- Profile media upload accepts the client’s selected banner/avatar file on Save,
  validates ownership through the Discordmaxxer claim, stores a stable R2 URL,
  and lets the profile write publish that URL to the roster.
- Upload validation covers allowed MIME types, 5 MB images, 15 MB videos,
  4096px banners, 2048px avatars, and 20-second media. GIF, PNG, JPEG, WebP,
  MP4, QuickTime, and WebM metadata parsers are covered, including a real
  nested WebM duration fixture.
- Banner video poster companions are accepted, validated, stored, served with
  `dmx-poster=1`, and deleted with their source media.
- Replacements and clears delete old owned objects; retention caps each user at
  five primary uploads; an hourly scheduled pass removes unreferenced uploads
  and orphan poster companions older than 24 hours.
- `wrangler.toml` schedules the cleanup. The README now explains the actual
  boundary: the Worker gates and caches media and stores posters, but does not
  transcode GIF/video because no codec runtime is configured.

## Verification

- `node --check vip-worker/worker.js` passed.
- `node --test vip-worker/profile-media.test.mjs` passed: 19 tests.
- The suite covers free activation, media ownership, upload/serve/range reads,
  poster storage, metadata limits, WebM duration rejection, replacement and
  clear cleanup, retention, scheduled cleanup, tier gates, stale-write guards,
  and migration behavior.
- No commit, push, deploy, or production profile mutation was made.

## Remaining work and gates

- A real media-processing service is still needed if product requirements call
  for codec-level GIF/video optimization. Do not claim transcoding is live.
- Reload and test the source-staged Discordmaxxer client, then perform the
  signed-in two-account recipient test for banner/avatar playback and widget
  ownership. Source tests do not prove recipient rendering.
- Before deployment, run the documented Worker dry-run and obtain explicit
  approval to deploy. Keep an off-machine copy for disaster recovery.

## Follow-up - validated URL import and local image optimization (2026-10-20)

The client and Worker now close the shared-media gap that previously made a
local file preview per-client only:

- `plugins/DMProfileFlair/index.tsx` automatically resizes/re-encodes local
  PNG/JPEG/WebP files when they exceed the safe image byte or dimension limit.
  GIF/video remains fail-closed with a specific size/format/duration message;
  the client does not pretend it can codec-transcode animated media.
- Pasted external HTTPS media is no longer saved as an unowned hotlink. The
  client calls `POST /profile-media/import` during Save, shows progress, and
  keeps a rejected import error inline under the affected field.
- `vip-worker/worker.js` validates redirects, HTTPS-only URL shape, private and
  metadata-network targets, response content type, streamed byte limits, and
  media metadata before storing an owner-scoped stable R2 copy. The existing
  claim, replacement, cleanup, poster, range-read, and conflict protections
  remain in place.

## Verification and current state

- `node --test vip-worker/profile-media.test.mjs` passed: 22 tests, including
  stable imported URLs, oversized-response rejection before storage, unsafe
  redirect blocking, webpage rejection, ownership, replacement, cleanup, and
  the prior upload paths.
- The Worker and client changes are local, uncommitted, unpushed, and
  undeployed. The live Worker does not provide the new import route until an
  explicitly approved deployment.
- Remote imports preserve original GIF/video bytes. Local banner-video uploads
  can still include a client-generated poster; remote video poster extraction
  is not yet implemented. True animated-media optimization requires a separate
  media-processing service.
- Next proof gate: run the client type/build checks, reload the source-staged
  client, and test a local static image, a local GIF/video, a valid direct URL,
  an HTML URL, an oversized URL, and a URL that redirects to a private target.

## Follow-up - scoped Worker deployment and Free-plan schedule repair (2026-10-20)

- The explicitly approved deployment was made only from this profile-media
  checkout. No Discordmaxxer client, ticket Worker, other Worker, namespace,
  credential, or live profile/claim data was changed.
- The live Worker version is `368c1e7e-fe3e-4c44-ad69-2c304ee3585f` at
  `https://optmaxxing-vip.maxxtopia.workers.dev`.
- The deployment preserves `VIP_CLAIMS` namespace
  `06752792b28c4e5e9d3ed3d48d3278ec` and the shared
  `discordmaxxer-profile-media` R2 binding.
- Added live-safe `GET /healthz`, `GET /readyz`, and `POST /validate` routes;
  validation is read-only and does not create or modify claims.
- `node --check vip-worker/worker.js`, the profile-media suite (22/22), the
  deployment dry-run, and `git diff --check` passed.
- Live smoke checks passed: `/healthz` 200, `/readyz` 200 with KV reachable,
  a synthetic unclaimed validation 404, a malformed claim 400, and a
  synthetic profile-media lookup 404 (`media not found`) through the preserved
  R2-backed route.
- The first deploy uploaded code but Cloudflare rejected the optional hourly
  cleanup schedule because this Free account already has five cron triggers.
  The schedule was removed from this Worker only and the clean redeploy
  succeeded. Profile-media serving, uploads, claims, validation, and ticket
  flows do not depend on that best-effort cleanup timer.
- Remaining human proof: test one real signed-in claim and the Discordmaxxer
  recipient profile-media flow. Do not claim recipient rendering from these
  Worker checks alone.
- Best next action: keep the Free plan for now, watch daily KV `put` usage,
  and revisit paid Workers only if real public traffic approaches the free
  quota or scheduled cleanup becomes operationally necessary.
