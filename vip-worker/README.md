# optmaxxing-vip — Cloudflare Worker

First-claim-wins ledger for VIP redemption codes.

## Deploy in 5 steps

1. **Install Wrangler** (one-time, on your machine):
   ```
   npm install -g wrangler
   wrangler login
   ```
   Opens a browser, log into the Cloudflare account that owns
   `maxxtopia.com`.

2. **Create the KV namespace**:
   ```
   cd C:\Users\Diggy\projects\optimizationmaxxing\vip-worker
   wrangler kv namespace create vip-claims
   ```
   Output looks like:
   ```
   🌀 Creating namespace with title "optmaxxing-vip-vip-claims"
   ✨ Success! Add the following to your configuration file in your kv_namespaces array:
   { binding = "VIP_CLAIMS", id = "abc123...def456" }
   ```
   Copy the `id` value.

3. **Paste the id into `wrangler.toml`** — replace
   `REPLACE_ME_WITH_KV_NAMESPACE_ID` with the actual id.

4. **Dry-run and deploy from the profile-media-enabled worker checkout**:
   ```
   cd C:\Users\Diggy\projects\optimizationmaxxing-profile-media\vip-worker
   powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -DryRun
   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
   ```
   The guarded script checks that revoke/remove, the product/status/duration
   ledger filters, CSV export, and the shared profile-media R2 binding are
   present before deploying.
   Output ends with the live URL, e.g.
   `https://optmaxxing-vip.<your-account>.workers.dev`.

5. **Tell the desktop app where to find it** — set this env var on your
   build machine (or hard-code in `src-tauri/src/vip.rs::WORKER_URL`):
   ```
   setx OPTMAXXING_VIP_WORKER_URL "https://optmaxxing-vip.<your-account>.workers.dev/claim"
   ```
   Then rebuild the app.

## Free profile-flair activation

Profile flair is a free Discordmaxxer feature. A free user does not need a
payment or a VIP code, but the worker still needs to know which Discord
account owns the profile so one user cannot claim another user's visible
Discord ID. The desktop client starts the flow from **DMHub → Activate free
profile** (or the `DMVipClaim` plugin), opens Discord OAuth with the `identify`
scope, and polls until the worker returns a Tier 0 claim bound to that PC.

The client uses these worker routes:

- `POST /free-claim/start` with `{ "hwid": "<32 hex characters>" }`
- `GET /free-claim/status?session=<short-lived-session>`
- the existing `/discord-link` callback, using a `free_<session>` state

The OAuth client ID and redirect URI are non-secret Worker vars; the Discord
OAuth client secret must be configured as a Worker secret before this flow can
complete. The free claim is idempotent for the same Discord account and PC,
and it is scoped to Discordmaxxer (`dm`). Paid claims continue to use
`POST /claim` and are unchanged.

## (Optional) Custom domain

If you want `vip.maxxtopia.com/claim` instead of the workers.dev subdomain:

- Add a DNS record on Cloudflare: `vip` CNAME → `optmaxxing-vip.<your-account>.workers.dev`.
- Uncomment the `[[routes]]` block in `wrangler.toml` and run `wrangler deploy` again.
- Update `OPTMAXXING_VIP_WORKER_URL` to `https://vip.maxxtopia.com/claim`.

## Free-tier headroom

- Worker requests: 100k/day (this endpoint will see < 100/day forever).
- KV reads: 100k/day, KV writes: 1k/day. A typical claim is 1 read + 1
  write. We're nowhere near limits.

## Test it works

```
curl -X POST https://optmaxxing-vip.<your-account>.workers.dev/claim \
  -H "content-type: application/json" \
  -d '{"code":"MAXX-AAAA-BBBB-CCCC-DDDD","hwid":"00000000000000000000000000000000"}'
```
First call returns `{"ok":true,"status":"claimed",...}`. Same call with a
different hwid returns `409 already claimed by another rig`.

## First-time Tune Now offers

The desktop app uses the same Worker for a separate discount-offer ledger:

The current first-time ladder is measured against the regular $115 lifetime
price:

- Gold (70% pull): $69, **40% off**, save $46
- Emerald (24% pull): $55, **52% off**, save $60
- Diamond (6% pull): $33, **71% off**, save $82

Previously issued offers keep their original price and expiry. New sessions use
the ladder above, and the Worker returns the normal price, savings, and rounded
discount percentage with every offer response.

- `POST /offer/prepare` creates one pending offer session and starts its
  three-day countdown.
- `GET /offer/start?session=...` sends the user through Discord OAuth.
- The OAuth callback binds the offer to one Discord account and Maxx Bot sends
  the offer details by DM. The user can ignore the offer; it does not grant VIP.
- `GET /offer/status?session=...` lets the app refresh the countdown and link
  status after the browser flow returns.
- `/admin/offers` lists linked offers. `POST /admin/offers/redeem` marks one
  used after payment; `revoke` and `dm` are available for support recovery.

The ticket number is an identifier, not proof by itself. Screenshots are only a
visual reminder. The Discord account binding, expiry, and admin ledger are the
authoritative checks. KV is adequate for the current low-volume campaign; the
resilience register names Durable Objects as the stronger uniqueness lock if
concurrent abuse becomes material.

## Inspecting + invalidating claims

List all current claims:
```
wrangler kv key list --binding VIP_CLAIMS
```

Revoke a specific claim (lets the code be re-claimed by anyone):
```
wrangler kv key delete --binding VIP_CLAIMS "claim:<bare-code>"
```
The bare code is the 16-char string without the `MAXX-` prefix or dashes.

## Discordmaxxer shared profile media

The Discordmaxxer Profile Flair editor has two intentionally different
actions:

- **The profile-flair showcase is available to every Discordmaxxer user.** No
  paid tier is required. A valid Discordmaxxer claim is still required to
  publish one active shared banner, one active animated avatar, and the two
  theme colors so they sync across PCs and show to other Discordmaxxer users;
  without a claim, the client keeps the draft local to that install. Replacing
  a field updates that one active slot. Vanilla Discord does not render these
  roster-only colors or flair.
- **Tier enhancements do not downgrade the free media.** Free accepts the
  same full-quality banner/avatar URLs and colors. MAXXER adds owner-selected
  banner/avatar crop anchors (`center`, `top`, or `bottom`); MAXXER+ adds
  show-whole-image fit and avatar scale; MAXXER++ adds an optional `glow` or
  `scanline` finish. These settings are stored with the owner's profile and
  are returned to every Discordmaxxer client through the roster, so a viewer's
  local profile settings cannot replace the profile being viewed.
- **Publish as shared banner** uploads a selected GIF, image, or video to the
  `PROFILE_MEDIA` R2 bucket, saves the resulting HTTPS URL through `POST
  /profile`, and makes it available to other Discordmaxxer clients on the
  roster. Video URLs receive a `dmx-media=video` hint because the object URL
  intentionally has no file extension.
- **Publish as shared avatar** uploads a GIF/image avatar and saves it to the
  same roster. Video avatars remain a one-time native Discord action because
  the Discordmaxxer avatar renderer uses `<img>` and cannot reliably render a
  video as an avatar.
- **Send banner once** is a separate native Discord `/users/@me/profile`
  update. It does not save the file to the roster, and it cannot make the
  Discordmaxxer-only gradient/flair appear in vanilla Discord.

The media route accepts image files up to 5 MB and banner video files up to
15 MB. It serves `GET`, `HEAD`, and single-range `GET` requests at
`/profile-media/<userId>/<banner|avatar>/<uuid>` with the stored content type
so the roster renderer can load the same asset on another PC. Replacing or
clearing a shared banner/avatar removes the previous object owned by that
user; a best-effort per-user retention pass keeps at most five recent objects
and external URLs are never deleted. Uploads are rate-limited at 60/minute.
Roster responses and the app cache converge in about 30 seconds. Profile
writes carry an `updatedAt` conflict check so a stale second PC gets a clear
refresh-and-review error instead of silently overwriting newer flair. After
the first successful legacy migration, `/roster` reads one R2 snapshot rather
than scanning KV on every cold worker instance. If the free KV list quota is
temporarily exhausted before that migration, the endpoint returns a retryable
503 and clients should keep their last good roster instead of replacing it
with an empty one; the next UTC quota reset completes the migration.

Deployment from this worker directory:

```
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

The binding is declared in `wrangler.toml`. The deploy script refuses to run
if the VIP remove/revoke handlers, full ledger filters, or shared profile-media
binding are missing.
Deploy only from this profile-media-enabled worker checkout; an older
Optimizationmaxxing checkout can overwrite the dashboard and remove the live
R2 binding. Keep the worker and the Discordmaxxer client release paired: the
worker stores the shared media and roster snapshot, while the client renders it.

## Operational notes

- KV is eventually-consistent (~60s propagation). In a worst-case
  collision two friends could both claim the same code within a minute
  and both end up with VIP. For our scale (gifting friends, not selling
  codes at scale) that's fine.
- If you need strong consistency later, swap KV for Durable Objects.
  ~10 lines of code change; costs $0.20/M requests on the paid tier.
- The shared `VIP_SECRET` in `src-tauri/src/vip.rs` is unrelated to this
  worker. The worker only checks "has this code been claimed before?" —
  the codes themselves are unguessable random strings (80 bits). The
  HMAC secret is only used by the offline HWID-bound flow (the older
  `mint-vip-code.py <hwid>` path), which still works as a fallback.
