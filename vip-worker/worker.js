/**
 * optmaxxing-vip — first-claim-wins ledger for VIP redemption codes,
 * shared between optimizationmaxxing and discordmaxxer.
 *
 * v4 (2026-05-11):
 *   - New POST /profile endpoint = user-set profile flair (banner URL,
 *     animated avatar URL, theme colors) for discordmaxxer's Channel E/F/G
 *     identity layer. Auth = claimCode + userId pair must match a stored
 *     claim record. Writes to `profile:<userId>` KV namespace. Invalidates
 *     roster memo so /roster picks up the change within ~30 sec server cache
 *     + 1 hr client cache.
 *   - /roster payload now `version: 2` and includes a `profile` sub-object
 *     per user (when set). v1 clients ignore unknown fields gracefully.
 *
 * v3 (2026-05-10):
 *   - Auto-grants the @VIP Discord role on successful claim when a
 *     userId is included in the body (the discordmaxxer path — Vencord
 *     plugins know the user's Discord snowflake from UserStore).
 *   - New /discord-link endpoint = OAuth callback for the optmaxxing
 *     path, where the client has no Discord identity. App opens the
 *     OAuth URL with `state=<hwid>`; worker exchanges code → user
 *     identify → looks up the HWID claim → grants the role. State
 *     param is the hwid because that's the only thing tying an app
 *     session to a granted tier.
 *   - Discord API logic mirrors maxxtopia/tickets-worker/worker.js's
 *     `handleGrantVipClick` — different repo so we inline rather than
 *     extract; both files reference each other in comments and should
 *     stay in sync if the role-grant contract changes.
 *
 * v2 (2026-05-10):
 *   - Body accepts optional `userId` (Discord snowflake).
 *   - Codes prefixed `FNDR` get a sequential founder number 1-33
 *     atomically assigned from KV `founder-counter`. Cap = 33; the 34th
 *     valid Founder code claim is rejected.
 *   - Claim values are now JSON `{ hwid, userId?, founderNumber?, claimedAt, tier }`
 *     instead of a bare hwid string. Reader stays backwards-compatible
 *     with v1 claims (plain string).
 *   - GET /roster returns the public roster: `[{ userId, tier, founderNumber? }]`
 *     for status-flair lookups in client UIs. Skips entries with no userId.
 *
 * Code authenticity: 16 chars Crockford-base32 = ~80 bits unguessable.
 * Cloudflare per-IP rate limits handle brute-force.
 *
 * Bind:
 *   - KV namespace `VIP_CLAIMS`
 *   - (no separate namespace for the founder counter — same KV)
 *
 * Required env vars (wrangler.toml [vars]):
 *   DISCORD_GUILD_ID, VIP_ROLE_ID                  — universal @VIP role
 *   MAXXER_ROLE_ID, MAXXER_PLUS_ROLE_ID,
 *   MAXXER_PLUS_PLUS_ROLE_ID                       — per-tier (optional)
 *   DISCORD_OAUTH_CLIENT_ID                        — Discord app ID (Maxx bot)
 *   DISCORD_OAUTH_REDIRECT_URI                     — must match Discord
 *                                                    dev-portal exactly
 *
 * Required secrets (wrangler secret put NAME):
 *   DISCORD_BOT_TOKEN                              — Maxx bot token
 *   DISCORD_OAUTH_CLIENT_SECRET                    — from Discord dev portal
 */

const ALLOWED_CODE_RE = /^[0-9A-HJKMNP-Z]{16}$/;
const ALLOWED_HWID_RE = /^[a-f0-9]{32}$/;
const ALLOWED_USER_ID_RE = /^[0-9]{17,20}$/;

// Free profile activation is identity-gated rather than userId-gated. The
// desktop client supplies only its HWID; Discord OAuth supplies the account
// identity. This prevents a caller from claiming another user's visible
// Discord ID while still making the free profile showcase self-serve.
const FREE_CLAIM_SESSION_PREFIX = 'free-claim:';
const FREE_CLAIM_USER_PREFIX = 'free-user:';
const FREE_CLAIM_SESSION_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
const FREE_CLAIM_TTL_SEC = 10 * 60;

// ─── Waitlist (DM-on-launch) ───────────────────────────────────────────
// Lets a visitor click "notify me" on a SOON product, do one Discord OAuth
// click, and get DM'd by the Maxx bot when it launches. Reuses the OAuth +
// bot already wired here, and the SAME registered /discord-link redirect URI
// (tagged via a `wl_<product>` state) so no second dev-portal redirect is
// needed. Signups stored as waitlist:<product>:<userId> in VIP_CLAIMS.
const WAITLIST_KV_PREFIX = 'waitlist:';
const PRODUCT_SLUG_RE = /^[a-z0-9-]{2,32}$/;
const MAX_DM_PER_CALL = 20; // free-tier subrequest budget — ~2 subrequests per DM

// First-time Tune Now offer flow. The app creates one short-lived pending
// session, then Discord OAuth binds the offer to the Discord account. The
// offer is a discount invitation, not a contest prize and it never grants
// VIP by itself.
const OFFER_SESSION_PREFIX = 'offer-session:';
const OFFER_TICKET_PREFIX = 'offer-ticket:';
const OFFER_USER_PREFIX = 'offer-user:';
const OFFER_SESSION_RE = /^[A-Za-z0-9_-]{32,96}$/;
const OFFER_TICKET_RE = /^OMAX-[0-9A-HJKMNP-Z]{16}$/;
const OFFER_TTL_SEC = 7 * 24 * 60 * 60;
const OFFER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const OFFER_NORMAL_PRICE = 115;
const OFFER_TIERS = [
  { rarity: 'gold', chance: 70, price: 69 },
  { rarity: 'emerald', chance: 24, price: 55 },
  { rarity: 'diamond', chance: 6, price: 33 },
];

// Profile-flair validation. URLs must be https:// and ≤250 chars total; viewer
// plugin HEAD-checks Content-Length at render time to enforce file-size caps.
// Colors must be lowercase #RRGGBB. Presentation controls are deliberately
// small enums: they are owner-owned data that other Discordmaxxer clients can
// render consistently, not arbitrary CSS or HTML from the roster.
const PROFILE_URL_RE = /^https:\/\/[^\s"']{1,242}$/;
const PROFILE_COLOR_RE = /^#[0-9a-f]{6}$/i;
const PROFILE_ENUMS = {
  bannerPosition: new Set(['center', 'top', 'bottom']),
  avatarPosition: new Set(['center', 'top', 'bottom']),
  bannerFit: new Set(['cover', 'contain']),
  avatarFit: new Set(['cover', 'contain']),
  avatarScale: new Set(['0.9', '1', '1.1']),
  mediaEffect: new Set(['none', 'glow', 'scanline']),
};
const PROFILE_KV_PREFIX = "profile:";
// Shared Discordmaxxer banner media is stored in R2 and addressed by a
// short, stable HTTPS URL so it can be placed in the existing roster field.
// The bucket is intentionally a separate binding: local files are only
// uploaded after the user explicitly clicks "Publish as shared banner".
const PROFILE_MEDIA_PREFIX = "profile-media/";
const PROFILE_MEDIA_PUBLIC_ORIGIN = "https://optmaxxing-vip.maxxtopia.workers.dev";
const PROFILE_MEDIA_PATH_RE = /^\/profile-media\/([0-9]{17,20})\/(banner|avatar)\/([0-9a-f-]{36})$/i;
const PROFILE_MEDIA_DATA_URI_RE = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/;
const PROFILE_MEDIA_MIME_TYPES = new Set([
  'image/gif', 'image/png', 'image/jpeg', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);
const PROFILE_MEDIA_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PROFILE_MEDIA_MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const PROFILE_MEDIA_MAX_OBJECTS = 5;

// Crockford-style "FOUND" — F=15, O=N/A so we use 0, U=N/A so we use V… stop.
// Crockford excludes I/L/O/U so "FOUND" doesn't survive the regex. Instead, we
// reserve a dedicated PREFIX scheme: any code whose normalized first 5 chars
// equal "FNDXX" (F-N-D plus two more letters chosen for distinctiveness) is
// treated as a Founder code. Mint script ships codes shaped FNDR-... already.
//
// Picked prefix: "FNDR" (4 chars — F, N, D, R all valid Crockford). The 5th
// character onwards is the random body. Founder cap: 33.
const FOUNDER_PREFIX = "FNDR";
const FOUNDER_CAP = 33;
const FOUNDER_COUNTER_KEY = "founder-counter";

const TIER_FREE = 0;
const TIER_MAXXER = 1;
const TIER_MAXXER_PLUS = 2;
const TIER_MAXXER_PLUS_PLUS = 3;

// Minimum tier for profile flair fields. The complete showcase pair is free:
// one active banner, one active animated avatar, and the two theme colors.
// Paid tiers add presentation controls around that same media; they never
// downgrade the free media or disable animation. Keep this worker-side so the
// roster claim/auth check cannot be bypassed by editing the plugin's JS.
const PROFILE_FIELD_MIN_TIER = {
  bannerUrl: TIER_FREE,
  avatarAnimatedUrl: TIER_FREE,
  themeColorPrimary: TIER_FREE,
  themeColorSecondary: TIER_FREE,
  bannerPosition: TIER_MAXXER,
  avatarPosition: TIER_MAXXER,
  bannerFit: TIER_MAXXER_PLUS,
  avatarFit: TIER_MAXXER_PLUS,
  avatarScale: TIER_MAXXER_PLUS,
  mediaEffect: TIER_MAXXER_PLUS_PLUS,
};

const ROSTER_CACHE_TTL_SEC = 30;
const ROSTER_SNAPSHOT_KEY = 'roster/v2.json';
const ROSTER_RETRY_AFTER_SEC = 300;
let rosterMemoCache = null;
let rosterMemoCachedAt = 0;

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-expose-headers': 'accept-ranges, content-length, content-range, content-type, etag',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const url = new URL(request.url);

    if (url.pathname === '/roster' && request.method === 'GET') {
      return handleRoster(env, corsHeaders, ctx);
    }

    if (url.pathname.startsWith('/profile-media/') &&
        (request.method === 'GET' || request.method === 'HEAD')) {
      return handleProfileMediaGet(request, url, env, corsHeaders);
    }

    if (url.pathname === '/profile-media' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
      }
      if (await rateLimited(request, 'profile-media', 60, 60)) {
        return json({ ok: false, error: 'too many profile media uploads; try again shortly' }, 429, corsHeaders);
      }
      return handleProfileMediaUpload(body, env, corsHeaders);
    }

    // Free profile activation: start an identity-checked Discord OAuth
    // session, then let the desktop client poll until the callback has issued
    // a Tier 0 claim for this user's HWID.
    if (url.pathname === '/free-claim/start' && request.method === 'POST') {
      if (await rateLimited(request, 'free-claim-start', 8, 60)) {
        return json({ ok: false, error: 'rate limited, slow down' }, 429, corsHeaders);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
      }
      return handleFreeClaimStart(body, env, corsHeaders);
    }
    if (url.pathname === '/free-claim/status' && request.method === 'GET') {
      if (await rateLimited(request, 'free-claim-status', 60, 60)) {
        return json({ ok: false, error: 'rate limited, slow down' }, 429, corsHeaders);
      }
      return handleFreeClaimStatus(url, env, corsHeaders);
    }

    // OAuth callback for the optmaxxing path: app launches the user's
    // browser into the Discord OAuth URL with `state=<hwid>`, Discord
    // bounces back here with `code=...&state=...`, and we trade code →
    // user identify → role grant.
    if (url.pathname === '/discord-link' && request.method === 'GET') {
      return handleDiscordLink(url, env, corsHeaders, ctx);
    }

    // Waitlist: start (redirect into Discord OAuth), public count, admin notify.
    if (url.pathname === '/waitlist/start' && request.method === 'GET') {
      return handleWaitlistStart(url, env);
    }
    if (url.pathname === '/waitlist/count' && request.method === 'GET') {
      return handleWaitlistCount(url, env, corsHeaders);
    }
    if (url.pathname === '/waitlist/notify' && request.method === 'POST') {
      return handleWaitlistNotify(request, env, corsHeaders);
    }

    // First-time Tune Now discount offer flow. Prepare/status are safe to
    // call from the desktop app; Discord OAuth is the identity boundary.
    if (url.pathname === '/offer/prepare' && request.method === 'POST') {
      if (await rateLimited(request, 'offer-prepare', 8, 60)) {
        return json({ ok: false, error: 'rate limited, slow down' }, 429, corsHeaders);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
      }
      return handleOfferPrepare(body, request, env, corsHeaders);
    }
    if (url.pathname === '/offer/start' && request.method === 'GET') {
      return handleOfferStart(url, env);
    }
    if (url.pathname === '/offer/status' && request.method === 'GET') {
      if (await rateLimited(request, 'offer-status', 30, 60)) {
        return json({ ok: false, error: 'rate limited, slow down' }, 429, corsHeaders);
      }
      return handleOfferStatus(url, env, corsHeaders);
    }

    if (url.pathname === '/profile' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
      }
      return handleProfileUpdate(body, env, corsHeaders, ctx);
    }

    // ---- Admin dashboard: one bookmarkable page to mint/list/revoke codes
    // across all products. The HTML page is public (useless without the
    // token); every /admin/* API call requires Bearer ADMIN_TOKEN. ----
    if (url.pathname === '/admin' && request.method === 'GET') {
      return new Response(ADMIN_HTML_V2, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }
    if (url.pathname.startsWith('/admin/')) {
      return handleAdmin(url, request, env, corsHeaders);
    }

    if (url.pathname !== '/claim' || request.method !== 'POST') {
      return json({ ok: false, error: 'not found' }, 404, corsHeaders);
    }

    // Per-IP write-flood brake (Cache-API backed; costs no KV writes). Stops a
    // single source from spamming /claim to burn the shared account-wide KV write
    // budget OR to grief the scarce Founder slots (1-33) with crafted FNDR codes.
    // Does NOT change who is accepted — only how fast one IP may try.
    if (await rateLimited(request, 'vip-claim', 20, 60)) {
      return json({ ok: false, error: 'rate limited, slow down' }, 429, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    return handleClaim(body, env, ctx, corsHeaders);
  },
};

// Per-IP write-flood brake backed by the Cache API. The Cache API is FREE and
// separate from the KV write budget, so this guard never itself consumes the
// account-wide ~1000-writes/day KV cap it exists to protect. Per-colo (not
// global), which is enough to stop the trivial single-source curl flood that
// could otherwise drain the cap and take down every KV feature at once.
// Returns true if the caller is OVER the limit and should be rejected.
async function rateLimited(request, keyPrefix, limit, windowSec) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const bucket = Math.floor(Date.now() / (windowSec * 1000));
    const cacheKey = new Request(`https://rl.internal/${keyPrefix}/${encodeURIComponent(ip)}/${bucket}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    const count = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
    if (count >= limit) return true;
    await cache.put(cacheKey, new Response(String(count + 1), { headers: { 'Cache-Control': `max-age=${windowSec}` } }));
    return false;
  } catch {
    return false; // never let the limiter itself break the endpoint
  }
}

async function handleClaim(body, env, ctx, corsHeaders) {
  const code = typeof body.code === 'string' ? body.code : '';
  const hwid = typeof body.hwid === 'string' ? body.hwid : '';
  const userId = typeof body.userId === 'string' ? body.userId : '';
  // product = "om" | "dm". Optional for backwards-compat with older
  // clients; when missing, scope enforcement is skipped (matches the
  // legacy "all codes work for everything" behavior).
  const product = typeof body.product === 'string' ? body.product.toLowerCase() : '';

  const norm = normalizeCode(code);
  const lowerHwid = hwid.toLowerCase();

  if (!ALLOWED_CODE_RE.test(norm)) {
    return json({ ok: false, error: 'malformed code' }, 400, corsHeaders);
  }
  if (!ALLOWED_HWID_RE.test(lowerHwid)) {
    return json({ ok: false, error: 'malformed hwid' }, 400, corsHeaders);
  }
  if (userId && !ALLOWED_USER_ID_RE.test(userId)) {
    return json({ ok: false, error: 'malformed userId' }, 400, corsHeaders);
  }
  if (product && !['om', 'dm', 'aim'].includes(product)) {
    return json({ ok: false, error: 'malformed product' }, 400, corsHeaders);
  }

  const isFounder = norm.startsWith(FOUNDER_PREFIX);

  // Read code metadata (written by tickets-worker /gen). Legacy codes
  // minted before the schema upgrade have no meta entry — defaults below
  // preserve ordinary legacy behavior (MAXXER++, lifetime, scope=both).
  // FNDR codes are the explicit Founder exception and resolve to lifetime
  // MAXXER+ through tierFromMetaOrCode/effectiveClaimTier.
  const meta = await readCodeMeta(env, norm);
  // Revoked or archived keys are permanently unavailable for new claims.
  if (meta && (meta.revoked || meta.archivedAt)) {
    return json({ ok: false, error: meta.archivedAt ? 'this code has been removed' : 'this code has been revoked' }, 403, corsHeaders);
  }
  const tier = tierFromMetaOrCode(meta, norm);
  const scope = meta?.scope ?? 'both';
  const durationMs = meta?.durationMs ?? null;   // null = lifetime

  // Product-scope enforcement. Skipped when client didn't send `product`
  // (legacy compatibility) OR when the code's scope is "both".
  if (product && scope !== 'both' && scope !== product) {
    const productName = {
      om: 'Optimizationmaxxing',
      dm: 'Discordmaxxer',
      aim: 'Aimmaxxer',
    };
    return json(
      { ok: false, error: `code scope mismatch: this code is for ${productName[scope] || scope}, you're claiming from ${productName[product] || product}` },
      403,
      corsHeaders,
    );
  }

  const key = `claim:${norm}`;
  const existing = await env.VIP_CLAIMS.get(key);

  if (!existing) {
    // First claim for this code. Founder codes get an atomic counter
    // increment + cap check before we accept the binding.
    let founderNumber;
    if (isFounder) {
      const assigned = await assignFounderNumber(env);
      if (assigned === null) {
        return json(
          { ok: false, error: 'founder cap reached (33). All slots taken.' },
          410,
          corsHeaders,
        );
      }
      founderNumber = assigned;
    }

    const claimedAt = Date.now();
    const expiresAt = durationMs ? claimedAt + durationMs : null;
    const claim = {
      hwid: lowerHwid,
      tier,
      scope,
      claimedAt,
      ...(expiresAt ? { expiresAt } : {}),
      ...(userId ? { userId } : {}),
      ...(founderNumber ? { founderNumber } : {}),
    };
    await env.VIP_CLAIMS.put(
      key,
      JSON.stringify(claim),
      { metadata: { claimedAt, founderNumber: founderNumber ?? null, expiresAt: expiresAt ?? null } },
    );
    rosterMemoCache = null;
    try {
      await refreshRosterSnapshotUser(env, claim);
    } catch (error) {
      console.warn('[claim] roster snapshot refresh failed:', error?.message ?? error);
    }

    if (userId) {
      ctx.waitUntil(grantDiscordRoles(env, userId, tier));
    }

    return json(
      {
        ok: true,
        status: 'claimed',
        boundHwid: lowerHwid,
        tier,
        scope,
        ...(expiresAt ? { expiresAt } : {}),
        ...(founderNumber ? { founderNumber } : {}),
      },
      200,
      corsHeaders,
    );
  }

  const parsed = parseClaim(existing);
  if (parsed.hwid !== lowerHwid) {
    return json(
      { ok: false, error: 'already claimed by another rig', boundHwid: parsed.hwid },
      409,
      corsHeaders,
    );
  }

  // Expiry check on re-validation. Expired claims are rejected with a
  // distinct error so the client knows to downgrade to FREE (vs network
  // failure which trusts the cache).
  if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
    return json(
      {
        ok: false,
        error: 'subscription expired',
        expiredAt: parsed.expiresAt,
        boundHwid: parsed.hwid,
      },
      410,  // Gone
      corsHeaders,
    );
  }

  // Idempotent re-claim. If the original record is missing data we now
  // collect (userId, scope, expiresAt for pre-schema-upgrade claims),
  // opportunistically backfill so the roster + expiry logic fills in.
  let needsRewrite = false;
  const canonicalTier = effectiveClaimTier(parsed, tier);
  if (parsed.tier !== canonicalTier) {
    parsed.tier = canonicalTier;
    needsRewrite = true;
  }
  if (userId && !parsed.userId) {
    parsed.userId = userId;
    needsRewrite = true;
  }
  if (!parsed.scope) {
    parsed.scope = scope;
    needsRewrite = true;
  }
  // Legacy claim with no expiresAt but a tracked-as-non-lifetime code:
  // back-fill from the meta's durationMs counted from the ORIGINAL
  // claimedAt. Without this, codes minted as monthly but claimed
  // before the schema upgrade would never expire.
  if (!parsed.expiresAt && durationMs && parsed.claimedAt) {
    parsed.expiresAt = parsed.claimedAt + durationMs;
    needsRewrite = true;
  }
  if (needsRewrite) {
    parsed.claimedAt ??= Date.now();
    await env.VIP_CLAIMS.put(
      key,
      JSON.stringify(parsed),
      { metadata: { claimedAt: parsed.claimedAt, founderNumber: parsed.founderNumber ?? null, expiresAt: parsed.expiresAt ?? null } },
    );
    rosterMemoCache = null;
    try {
      await refreshRosterSnapshotUser(env, parsed);
    } catch (error) {
      console.warn('[claim] roster snapshot refresh failed:', error?.message ?? error);
    }
    if (parsed.userId) {
      ctx.waitUntil(grantDiscordRoles(env, parsed.userId, canonicalTier));
    }
  }

  return json(
    {
      ok: true,
      status: 'idempotent',
      boundHwid: parsed.hwid,
      tier: canonicalTier,
      scope: parsed.scope ?? scope,
      ...(parsed.expiresAt ? { expiresAt: parsed.expiresAt } : {}),
      ...(parsed.founderNumber ? { founderNumber: parsed.founderNumber } : {}),
    },
    200,
    corsHeaders,
  );
}

// ─── First-time Tune Now offers ────────────────────────────────────────

async function handleOfferPrepare(body, request, env, corsHeaders) {
  const session = typeof body.session === 'string' ? body.session : '';
  if (!OFFER_SESSION_RE.test(session)) {
    return json({ ok: false, error: 'malformed offer session' }, 400, corsHeaders);
  }

  const key = OFFER_SESSION_PREFIX + session;
  const existingRaw = await env.VIP_CLAIMS.get(key);
  if (existingRaw) {
    const existing = parseJsonRecord(existingRaw);
    if (existing) return offerJson(existing, request, corsHeaders);
  }

  const issuedAt = Date.now();
  const tier = pickOfferTier();
  const discount = offerDiscount(tier.price);
  const record = {
    version: 1,
    session,
    status: 'pending',
    ticketId: `OMAX-${genCode()}`,
    rarity: tier.rarity,
    chanceLabel: `${tier.chance}% pull`,
    price: tier.price,
    ...discount,
    issuedAt,
    expiresAt: issuedAt + OFFER_WINDOW_MS,
    createdAt: issuedAt,
    dmSentAt: null,
  };
  await env.VIP_CLAIMS.put(key, JSON.stringify(record), { expirationTtl: OFFER_TTL_SEC });
  return offerJson(record, request, corsHeaders);
}

async function handleOfferStart(url, env) {
  const session = url.searchParams.get('session') || '';
  if (!OFFER_SESSION_RE.test(session)) {
    return htmlPage('<h1>Bad offer link</h1><p>This offer link is malformed.</p>', 400);
  }
  const raw = await env.VIP_CLAIMS.get(OFFER_SESSION_PREFIX + session);
  const record = parseJsonRecord(raw);
  if (!record) {
    return htmlPage('<h1>Offer not found</h1><p>Run Tune Now again to request a current offer.</p>', 404);
  }
  if (Date.now() > record.expiresAt) {
    await expireOfferSession(env, record);
    return htmlPage('<h1>Offer expired</h1><p>This first-time VIP offer was available for three days.</p>', 410);
  }
  if (record.status !== 'pending') {
    return offerHtml(record, record.dmSentAt ? 'Maxx Bot has already sent the offer to your Discord account.' : 'Your offer is linked to your Discord account.', 200);
  }
  if (!env.DISCORD_OAUTH_CLIENT_ID || !env.DISCORD_OAUTH_REDIRECT_URI) {
    return htmlPage('<h1>Discord linking is not configured</h1><p>Tell Diggy that the offer worker needs its OAuth settings.</p>', 500);
  }
  const authUrl =
    'https://discord.com/api/oauth2/authorize?' +
    new URLSearchParams({
      client_id: env.DISCORD_OAUTH_CLIENT_ID,
      redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify guilds.join',
      state: `offer_${session}`,
      prompt: 'consent',
    }).toString();
  return Response.redirect(authUrl, 302);
}

async function handleOfferStatus(url, env, corsHeaders) {
  const session = url.searchParams.get('session') || '';
  if (!OFFER_SESSION_RE.test(session)) {
    return json({ ok: false, error: 'malformed offer session' }, 400, corsHeaders);
  }
  const raw = await env.VIP_CLAIMS.get(OFFER_SESSION_PREFIX + session);
  const record = parseJsonRecord(raw);
  if (!record) return json({ ok: false, error: 'offer not found' }, 404, corsHeaders);
  if (Date.now() > record.expiresAt && record.status !== 'redeemed' && record.status !== 'revoked') {
    await expireOfferSession(env, record);
  }
  return offerJson(record, url, corsHeaders);
}

async function handleOfferJoin(code, session, env, ctx) {
  if (!OFFER_SESSION_RE.test(session)) {
    return htmlPage('<h1>Bad offer link</h1><p>This offer link is malformed.</p>', 400);
  }
  const sessionKey = OFFER_SESSION_PREFIX + session;
  const sessionRecord = parseJsonRecord(await env.VIP_CLAIMS.get(sessionKey));
  if (!sessionRecord) {
    return htmlPage('<h1>Offer not found</h1><p>Run Tune Now again to request a current offer.</p>', 404);
  }
  if (Date.now() > sessionRecord.expiresAt) {
    await expireOfferSession(env, sessionRecord);
    return htmlPage('<h1>Offer expired</h1><p>This first-time VIP offer was available for three days.</p>', 410);
  }
  if (!env.DISCORD_OAUTH_CLIENT_ID || !env.DISCORD_OAUTH_CLIENT_SECRET || !env.DISCORD_OAUTH_REDIRECT_URI) {
    return htmlPage('<h1>OAuth not configured</h1><p>The offer worker is missing its Discord OAuth settings.</p>', 500);
  }

  let accessToken;
  try {
    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_OAUTH_CLIENT_ID,
        client_secret: env.DISCORD_OAUTH_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '');
      return htmlPage(`<h1>Discord rejected the sign-in</h1><p>${tokenRes.status}: ${escapeHtml(text.slice(0, 240))}</p>`, 400);
    }
    accessToken = (await tokenRes.json()).access_token;
  } catch (e) {
    return htmlPage(`<h1>Sign-in failed</h1><p>${escapeHtml(String(e))}</p>`, 502);
  }
  if (!accessToken) return htmlPage('<h1>No access token from Discord</h1>', 502);

  let userJson;
  try {
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return htmlPage(`<h1>Could not read your Discord account</h1><p>${userRes.status}</p>`, 502);
    userJson = await userRes.json();
  } catch (e) {
    return htmlPage('<h1>Discord identity lookup failed</h1>', 502);
  }
  const userId = userJson.id;
  if (!userId || !ALLOWED_USER_ID_RE.test(String(userId))) {
    return htmlPage('<h1>Discord returned a bad user id</h1>', 502);
  }
  const username = typeof userJson.username === 'string' ? userJson.username : '';

  // Best-effort guild join means the bot can DM the user even if they had not
  // joined the server yet. The offer remains valid if Discord declines it.
  await joinDiscordGuild(env, userId, accessToken);

  const userKey = OFFER_USER_PREFIX + userId;
  const existing = parseJsonRecord(await env.VIP_CLAIMS.get(userKey));
  let offer = existing;
  if (!offer) {
    // Keep the server-issued session offer as the final offer so the app,
    // callback page, DM, and admin ledger never show different terms. The
    // permanent account key prevents a later session from issuing another
    // offer for the same Discord account.
    offer = deriveAccountOffer(sessionRecord, userId, username);
    await env.VIP_CLAIMS.put(userKey, JSON.stringify(offer));
    await env.VIP_CLAIMS.put(OFFER_TICKET_PREFIX + offer.ticketId, JSON.stringify(offer));
  }

  if (offer.expiresAt && Date.now() > offer.expiresAt) {
    offer.status = 'expired';
    await env.VIP_CLAIMS.put(userKey, JSON.stringify(offer));
    await env.VIP_CLAIMS.put(OFFER_TICKET_PREFIX + offer.ticketId, JSON.stringify(offer));
    sessionRecord.status = 'expired';
    sessionRecord.ticketId = offer.ticketId;
    await env.VIP_CLAIMS.put(sessionKey, JSON.stringify(sessionRecord), { expirationTtl: OFFER_TTL_SEC });
    return offerHtml(offer, 'This offer expired before it was linked.', 410);
  }

  offer.username = username || offer.username || '';
  offer.status = offer.status === 'redeemed' || offer.status === 'revoked' ? offer.status : 'offered';
  offer.linkedAt ??= Date.now();
  await env.VIP_CLAIMS.put(userKey, JSON.stringify(offer));
  await env.VIP_CLAIMS.put(OFFER_TICKET_PREFIX + offer.ticketId, JSON.stringify(offer));

  sessionRecord.status = offer.status;
  sessionRecord.ticketId = offer.ticketId;
  sessionRecord.rarity = offer.rarity;
  sessionRecord.chanceLabel = offer.chanceLabel;
  sessionRecord.price = offer.price;
  sessionRecord.expiresAt = offer.expiresAt;
  sessionRecord.discordLinked = true;
  if (offer.dmSentAt) sessionRecord.dmSentAt = offer.dmSentAt;
  await env.VIP_CLAIMS.put(sessionKey, JSON.stringify(sessionRecord), { expirationTtl: OFFER_TTL_SEC });

  if (!offer.dmSentAt && offer.status === 'offered') {
    ctx.waitUntil(sendOfferDmAndMark(env, offer));
  }
  const message = offer.dmSentAt
    ? 'Maxx Bot already sent this offer to your Discord account.'
    : 'Maxx Bot is sending the offer to your Discord account now.';
  return offerHtml(offer, message, 200);
}

function deriveAccountOffer(sessionRecord, userId, username) {
  const discount = offerDiscount(sessionRecord.price);
  return {
    version: 1,
    status: 'offered',
    ticketId: sessionRecord.ticketId,
    rarity: sessionRecord.rarity,
    chanceLabel: sessionRecord.chanceLabel,
    price: sessionRecord.price,
    ...discount,
    issuedAt: sessionRecord.issuedAt,
    expiresAt: sessionRecord.expiresAt,
    session: sessionRecord.session,
    userId,
    username,
    linkedAt: Date.now(),
    dmSentAt: null,
    redeemedAt: null,
  };
}

function pickOfferTier() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  const roll = n[0] % 100;
  return roll < 70 ? OFFER_TIERS[0] : roll < 94 ? OFFER_TIERS[1] : OFFER_TIERS[2];
}

function offerDiscount(price) {
  const savings = Math.max(0, OFFER_NORMAL_PRICE - Number(price));
  return {
    normalPrice: OFFER_NORMAL_PRICE,
    savings,
    discountPercent: Math.round((savings / OFFER_NORMAL_PRICE) * 100),
  };
}

function parseJsonRecord(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function offerJson(record, requestOrUrl, corsHeaders) {
  const origin = requestOrUrl instanceof URL
    ? requestOrUrl.origin
    : new URL(requestOrUrl.url).origin;
  const status = Date.now() > record.expiresAt && record.status === 'pending' ? 'expired' : record.status;
  const discount = offerDiscount(record.price);
  return json({
    ok: true,
    status,
    ticketId: record.ticketId,
    rarity: record.rarity,
    chanceLabel: record.chanceLabel,
    price: record.price,
    normalPrice: Number.isFinite(record.normalPrice) ? record.normalPrice : discount.normalPrice,
    savings: Number.isFinite(record.savings) ? record.savings : discount.savings,
    discountPercent: Number.isFinite(record.discountPercent) ? record.discountPercent : discount.discountPercent,
    issuedAt: new Date(record.issuedAt).toISOString(),
    expiresAt: new Date(record.expiresAt).toISOString(),
    discordLinked: record.discordLinked === true || status === 'offered' || status === 'redeemed',
    dmSent: Boolean(record.dmSentAt),
    connectUrl: status === 'pending' ? `${origin}/offer/start?session=${encodeURIComponent(record.session)}` : null,
  }, 200, corsHeaders);
}

async function expireOfferSession(env, record) {
  if (record.status === 'pending') record.status = 'expired';
  await env.VIP_CLAIMS.put(OFFER_SESSION_PREFIX + record.session, JSON.stringify(record), { expirationTtl: OFFER_TTL_SEC });
}

function offerHtml(offer, message, status = 200) {
  const expiry = new Date(offer.expiresAt).toUTCString();
  const state = offer.status === 'redeemed' ? 'already used' : offer.status === 'revoked' ? 'cancelled' : offer.status === 'expired' ? 'expired' : 'available';
  const discount = offerDiscount(offer.price);
  const savings = Number.isFinite(offer.savings) ? offer.savings : discount.savings;
  const discountPercent = Number.isFinite(offer.discountPercent) ? offer.discountPercent : discount.discountPercent;
  return htmlPage(
    `<h1>MAXX VIP offer</h1>` +
      `<p><b>${escapeHtml(offer.rarity.toUpperCase())} TICKET</b> · lifetime VIP for <b>$${escapeHtml(String(offer.price))}</b> instead of $115 — <b>${discountPercent}% off</b> (save $${savings}).</p>` +
      `<p>Offer status: <b>${escapeHtml(state)}</b>. It expires <b>${escapeHtml(expiry)}</b>.</p>` +
      `<p>${escapeHtml(message)}</p>` +
      `<p>Ticket ID: <code>${escapeHtml(offer.ticketId)}</code></p>` +
      `<p style="opacity:.7">This is a limited-time discount offer, not a contest. Use it only if you want it. It does not unlock VIP until Diggy confirms the purchase.</p>`,
    status,
  );
}

async function joinDiscordGuild(env, userId, accessToken) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return false;
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`,
      {
        method: 'PUT',
        headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken }),
      },
    );
    return response.status === 201 || response.status === 204;
  } catch {
    return false;
  }
}

function offerDmText(offer) {
  const discount = offerDiscount(offer.price);
  const savings = Number.isFinite(offer.savings) ? offer.savings : discount.savings;
  const discountPercent = Number.isFinite(offer.discountPercent) ? offer.discountPercent : discount.discountPercent;
  return (
    '**MAXXTOPIA — your first-time VIP offer**\n\n' +
    `You have a **${offer.rarity.toUpperCase()} TICKET**: lifetime VIP for **$${offer.price}** instead of $115 — **${discountPercent}% off** (save **$${savings}**).\n` +
    `Ticket: **${offer.ticketId}**\n` +
    `Valid until: **${new Date(offer.expiresAt).toUTCString()}**\n\n` +
    'This is a limited-time discount, not a contest. You can ignore it if you do not want VIP. ' +
    'If you want to use it, open a Maxxtopia ticket and give Diggy the ticket ID before it expires. ' +
    'The offer is tied to your Discord account.'
  );
}

async function sendOfferDmAndMark(env, offer) {
  const ok = await dmUser(env, offer.userId, offerDmText(offer));
  if (!ok) return false;
  const key = OFFER_TICKET_PREFIX + offer.ticketId;
  const current = parseJsonRecord(await env.VIP_CLAIMS.get(key));
  if (current && !current.dmSentAt) {
    current.dmSentAt = Date.now();
    await env.VIP_CLAIMS.put(key, JSON.stringify(current));
    await env.VIP_CLAIMS.put(OFFER_USER_PREFIX + current.userId, JSON.stringify(current));
    if (current.session) {
      const sessionKey = OFFER_SESSION_PREFIX + current.session;
      const sessionRecord = parseJsonRecord(await env.VIP_CLAIMS.get(sessionKey));
      if (sessionRecord) {
        sessionRecord.dmSentAt = current.dmSentAt;
        await env.VIP_CLAIMS.put(sessionKey, JSON.stringify(sessionRecord), { expirationTtl: OFFER_TTL_SEC });
      }
    }
  }
  return true;
}

/**
 * Read the `meta:<code>` record written by tickets-worker /gen. Returns
 * null for legacy codes minted before the schema upgrade (or any code
 * not minted through the slash-command flow — e.g. older
 * mint-unbound-codes.py output that landed directly in DMs).
 */
async function readCodeMeta(env, normCode) {
  try {
    const raw = await env.VIP_CLAIMS.get(`meta:${normCode}`);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    if (typeof meta !== 'object' || !meta) return null;
    return meta;
  } catch {
    return null;
  }
}

/**
 * Derive tier from meta (preferred) or code prefix (fallback). Returns
 * one of TIER_MAXXER / TIER_MAXXER_PLUS / TIER_MAXXER_PLUS_PLUS.
 *
 * Priority:
 *   1. meta.tier string ('maxxer' / 'maxxerplus' / 'maxxerplusplus' /
 *      'founder' — founder maps to lifetime MAXXER+)
 *   2. Founder prefix → MAXXER+ (founder pass is a one-time lifetime grant)
 *   3. First-char prefix: '1' → MAXXER, '2' → MAXXER+, '3' → MAXXER++
 *   4. Default → MAXXER++ (backwards compat with pre-prefix random codes)
 */
function tierFromMetaOrCode(meta, normCode) {
  const t = meta?.tier;
  if (t === 'maxxer') return TIER_MAXXER;
  if (t === 'maxxerplus') return TIER_MAXXER_PLUS;
  if (t === 'maxxerplusplus') return TIER_MAXXER_PLUS_PLUS;
  if (t === 'founder') return TIER_MAXXER_PLUS;
  if (normCode.startsWith(FOUNDER_PREFIX)) return TIER_MAXXER_PLUS;
  const first = normCode[0];
  if (first === '1') return TIER_MAXXER;
  if (first === '2') return TIER_MAXXER_PLUS;
  if (first === '3') return TIER_MAXXER_PLUS_PLUS;
  return TIER_MAXXER_PLUS_PLUS;
}

// Founder status is the durable entitlement. Normalize old claims that were
// stored as tier 3 before Founder became a one-time lifetime MAXXER+ pass,
// while leaving ordinary MAXXER++ claims unchanged.
function effectiveClaimTier(claim, fallbackTier = TIER_MAXXER_PLUS_PLUS) {
  const founderNumber = Number(claim?.founderNumber);
  if (Number.isInteger(founderNumber) && founderNumber >= 1 && founderNumber <= FOUNDER_CAP) {
    return TIER_MAXXER_PLUS;
  }
  const tier = Number(claim?.tier);
  if (Number.isInteger(tier) && tier >= TIER_FREE && tier <= TIER_MAXXER_PLUS_PLUS) {
    return tier;
  }
  return fallbackTier;
}

async function getProfileAuth(body, env) {
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const claimCode = typeof body?.claimCode === 'string' ? body.claimCode : '';
  if (!ALLOWED_USER_ID_RE.test(userId)) {
    return { status: 400, error: 'malformed userId' };
  }
  const normCode = normalizeCode(claimCode);
  if (!ALLOWED_CODE_RE.test(normCode)) {
    return { status: 400, error: 'malformed claimCode' };
  }
  const claimRaw = await env.VIP_CLAIMS.get(`claim:${normCode}`);
  if (!claimRaw) {
    return { status: 401, error: 'unknown claimCode' };
  }
  const parsed = parseClaim(claimRaw);
  if (parsed.userId !== userId) {
    return { status: 401, error: 'claimCode does not match userId' };
  }
  const meta = await readCodeMeta(env, normCode);
  if (meta?.archivedAt) {
    return { status: 403, error: 'claimCode has been removed' };
  }
  if (meta?.revoked) {
    return { status: 403, error: 'claimCode has been revoked' };
  }
  if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
    return { status: 410, error: 'Discordmaxxer claim expired' };
  }
  // A legacy claim with no scope remains usable. Once scope is present,
  // profile writes must be explicitly for Discordmaxxer or for both products.
  if (parsed.scope && parsed.scope !== 'both' && parsed.scope !== 'dm') {
    return { status: 403, error: 'claim scope is not Discordmaxxer' };
  }
  return { userId, normCode, parsed, tier: effectiveClaimTier(parsed) };
}

function decodeProfileMediaDataUri(dataUri, claimedMime) {
  if (typeof dataUri !== 'string' || dataUri.length === 0) {
    return { error: 'missing dataUri' };
  }
  const match = dataUri.match(PROFILE_MEDIA_DATA_URI_RE);
  if (!match) {
    return { error: 'dataUri must be a base64 data URL' };
  }
  const dataUriMime = match[1].toLowerCase();
  const mime = typeof claimedMime === 'string' && claimedMime.trim()
    ? claimedMime.trim().toLowerCase()
    : dataUriMime;
  // File.type can be application/octet-stream for a file selected from an
  // unusual Windows association. In that case the explicit client MIME is
  // the useful value; any other mismatch is rejected.
  if (dataUriMime !== 'application/octet-stream' && dataUriMime !== mime) {
    return { error: 'dataUri MIME does not match the selected file type' };
  }
  if (!PROFILE_MEDIA_MIME_TYPES.has(mime)) {
    return { error: 'unsupported media type' };
  }
  const base64 = match[2].replace(/\s+/g, '');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const estimatedBytes = Math.floor(base64.length * 3 / 4) - padding;
  const maxBytes = mime.startsWith('video/')
    ? PROFILE_MEDIA_MAX_VIDEO_BYTES
    : PROFILE_MEDIA_MAX_IMAGE_BYTES;
  if (estimatedBytes > maxBytes) {
    return { error: `file exceeds the ${mime.startsWith('video/') ? '15 MB video' : '5 MB image'} limit` };
  }
  let binary;
  try {
    binary = atob(base64);
  } catch {
    return { error: 'invalid base64 media data' };
  }
  if (binary.length > maxBytes) {
    return { error: `file exceeds the ${mime.startsWith('video/') ? '15 MB video' : '5 MB image'} limit` };
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime, bytes };
}

function profileMediaKeyForUrl(value, userId, kind = 'banner') {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    if (parsed.origin !== PROFILE_MEDIA_PUBLIC_ORIGIN) return null;
    const match = parsed.pathname.match(PROFILE_MEDIA_PATH_RE);
    if (!match || match[1] !== userId || match[2] !== kind) return null;
    return `${PROFILE_MEDIA_PREFIX}${match[1]}/${match[2]}/${match[3]}`;
  } catch {
    return null;
  }
}

function isVideoProfileUrl(value) {
  return typeof value === 'string' && /(?:[?&]dmx-media=video(?:&|#|$)|\.(?:mp4|webm|mov)(?:[?#]|$))/i.test(value);
}

async function readProfileRecord(env, userId) {
  const raw = await env.VIP_CLAIMS.get(`${PROFILE_KV_PREFIX}${userId}`);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function pruneProfileMedia(env, userId, profile, preserveKey) {
  if (!env.PROFILE_MEDIA?.list || !env.PROFILE_MEDIA?.delete) return;
  try {
    const listed = await env.PROFILE_MEDIA.list({
      prefix: `${PROFILE_MEDIA_PREFIX}${userId}/`,
      limit: 1000,
    });
    const objects = Array.isArray(listed?.objects) ? listed.objects : [];
    const keep = new Set([
      profileMediaKeyForUrl(profile?.bannerUrl, userId, 'banner'),
      profileMediaKeyForUrl(profile?.avatarAnimatedUrl, userId, 'avatar'),
      preserveKey,
    ].filter(Boolean));
    const candidates = objects
      .filter(object => object?.key && !keep.has(object.key))
      .sort((a, b) => String(a.uploaded ?? '').localeCompare(String(b.uploaded ?? '')));
    const deleteCount = Math.max(0, objects.length - PROFILE_MEDIA_MAX_OBJECTS);
    await Promise.all(candidates.slice(0, deleteCount).map(object => env.PROFILE_MEDIA.delete(object.key)));
  } catch (error) {
    // Orphan cleanup is best effort. A temporary R2 list/delete failure must
    // not turn a valid new upload into a broken profile action.
    console.warn('[profile-media] prune failed:', error?.message ?? error);
  }
}

async function handleProfileMediaUpload(body, env, corsHeaders) {
  const auth = await getProfileAuth(body, env);
  if (auth.error) return json({ ok: false, error: auth.error }, auth.status, corsHeaders);
  const kind = body?.kind === 'avatar' ? 'avatar' : body?.kind === 'banner' ? 'banner' : '';
  if (!kind) {
    return json({ ok: false, error: 'kind must be banner or avatar' }, 400, corsHeaders);
  }
  const field = kind === 'avatar' ? 'avatarAnimatedUrl' : 'bannerUrl';
  if (auth.tier < PROFILE_FIELD_MIN_TIER[field]) {
    return json({ ok: false, error: `${field} requires tier ${PROFILE_FIELD_MIN_TIER[field]}+` }, 403, corsHeaders);
  }
  if (!env.PROFILE_MEDIA) {
    return json({ ok: false, error: 'profile media storage is not configured yet' }, 503, corsHeaders);
  }
  const decoded = decodeProfileMediaDataUri(body?.dataUri, body?.mime);
  if (decoded.error) return json({ ok: false, error: decoded.error }, 400, corsHeaders);
  if (kind === 'avatar' && decoded.mime.startsWith('video/')) {
    return json({ ok: false, error: 'shared avatars accept GIF/image files; send video once to native Discord instead' }, 400, corsHeaders);
  }

  const token = crypto.randomUUID();
  const key = `${PROFILE_MEDIA_PREFIX}${auth.userId}/${kind}/${token}`;
  await env.PROFILE_MEDIA.put(key, decoded.bytes, {
    httpMetadata: {
      contentType: decoded.mime,
      contentDisposition: 'inline',
      cacheControl: 'public, max-age=300',
    },
  });
  await pruneProfileMedia(env, auth.userId, await readProfileRecord(env, auth.userId), key);
  const publicUrl = `${PROFILE_MEDIA_PUBLIC_ORIGIN}/${key}` +
    (decoded.mime.startsWith('video/') ? '?dmx-media=video' : '');
  return json({
    ok: true,
    url: publicUrl,
    mime: decoded.mime,
    bytes: decoded.bytes.byteLength,
  }, 201, corsHeaders);
}

async function handleProfileMediaGet(request, url, env, corsHeaders) {
  const match = url.pathname.match(PROFILE_MEDIA_PATH_RE);
  if (!match) return json({ ok: false, error: 'media not found' }, 404, corsHeaders);
  if (!env.PROFILE_MEDIA) {
    return json({ ok: false, error: 'profile media storage is not configured yet' }, 503, corsHeaders);
  }
  const key = `${PROFILE_MEDIA_PREFIX}${match[1]}/${match[2]}/${match[3]}`;
  const metadata = await env.PROFILE_MEDIA.head(key);
  if (!metadata) return json({ ok: false, error: 'media not found' }, 404, corsHeaders);

  const totalSize = Number(metadata.size);
  const rangeHeader = request.method === 'GET' ? request.headers.get('range') : null;
  let range = null;
  if (rangeHeader) {
    const matchRange = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!matchRange || (!matchRange[1] && !matchRange[2]) || !Number.isFinite(totalSize) || totalSize <= 0) {
      return new Response(null, { status: 416, headers: { ...corsHeaders, 'content-range': `bytes */${Number.isFinite(totalSize) ? totalSize : '*'}` } });
    }
    let offset;
    let end;
    if (matchRange[1]) {
      offset = Number(matchRange[1]);
      end = matchRange[2] ? Number(matchRange[2]) : totalSize - 1;
    } else {
      const suffixLength = Number(matchRange[2]);
      offset = Math.max(0, totalSize - suffixLength);
      end = totalSize - 1;
    }
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset < 0 || end < offset || offset >= totalSize) {
      return new Response(null, { status: 416, headers: { ...corsHeaders, 'content-range': `bytes */${totalSize}` } });
    }
    end = Math.min(end, totalSize - 1);
    range = { offset, length: end - offset + 1, end };
  }

  const object = request.method === 'HEAD'
    ? metadata
    : range
      ? await env.PROFILE_MEDIA.get(key, { range: { offset: range.offset, length: range.length } })
      : await env.PROFILE_MEDIA.get(key);
  if (!object) return json({ ok: false, error: 'media not found' }, 404, corsHeaders);

  const headers = new Headers(corsHeaders);
  headers.set('cache-control', object.httpMetadata?.cacheControl || 'public, max-age=300');
  if (object.httpMetadata?.contentType) headers.set('content-type', object.httpMetadata.contentType);
  if (object.httpMetadata?.contentDisposition) headers.set('content-disposition', object.httpMetadata.contentDisposition);
  headers.set('accept-ranges', 'bytes');
  headers.set('content-length', String(range ? range.length : totalSize));
  if (range) headers.set('content-range', `bytes ${range.offset}-${range.end}/${totalSize}`);
  if (object.etag) headers.set('etag', object.etag);
  return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers });
}

/**
 * POST /profile — user updates their custom profile flair (banner URL,
 * animated avatar URL, theme colors). Auth = claimCode + userId must match
 * a stored claim record. Every field is validated server-side; the current
 * profile showcase fields are free at the tier layer but remain claim-gated.
 *
 * Body: { userId, claimCode, profile: { bannerUrl?, avatarAnimatedUrl?,
 *         themeColorPrimary?, themeColorSecondary?, bannerPosition?,
 *         avatarPosition?, bannerFit?, avatarFit?, avatarScale?,
 *         mediaEffect? } }
 *
 * To clear a field, send it as an empty string or omit it AND set
 * `replace: true` to overwrite the stored record. Default behavior merges
 * with the existing record (so a partial update only changes the supplied
 * fields). To delete the entire flair record, send `{ replace: true,
 * profile: {} }`.
 */
async function handleProfileUpdate(body, env, corsHeaders, ctx) {
  const profile = body.profile && typeof body.profile === 'object' ? body.profile : null;
  const replace = body.replace === true;

  if (!profile) {
    return json({ ok: false, error: 'missing profile object' }, 400, corsHeaders);
  }

  // Auth check: claim must exist AND must be bound to this userId. This is
  // the entire authorization model — the claim code is the user's secret.
  const auth = await getProfileAuth(body, env);
  if (auth.error) return json({ ok: false, error: auth.error }, auth.status, corsHeaders);
  const { userId, tier } = auth;
  const requestedUpdatedAt = body?.ifUpdatedAt === undefined ? undefined : Number(body.ifUpdatedAt);
  if (requestedUpdatedAt !== undefined && !Number.isFinite(requestedUpdatedAt)) {
    return json({ ok: false, error: 'ifUpdatedAt must be a timestamp' }, 400, corsHeaders);
  }

  // Validate each provided field and apply its centrally-defined minimum tier.
  // The media URLs and colors are FREE; presentation controls are paid
  // enhancements only. A lower tier never gets a smaller/less animated asset.
  // Reject the whole request on the first violation — clearer feedback than
  // partial accept.
  const validated = {};
  for (const [field, value] of Object.entries(profile)) {
    if (!(field in PROFILE_FIELD_MIN_TIER)) {
      return json({ ok: false, error: `unknown field: ${field}` }, 400, corsHeaders);
    }
    // Empty string clears the field on a merge (treated same as undefined
    // here — final write filters empty strings out).
    if (value === '' || value === null || value === undefined) {
      validated[field] = '';
      continue;
    }
    if (typeof value !== 'string') {
      return json({ ok: false, error: `${field} must be a string` }, 400, corsHeaders);
    }
    if (tier < PROFILE_FIELD_MIN_TIER[field]) {
      return json({ ok: false, error: `${field} requires tier ${PROFILE_FIELD_MIN_TIER[field]}+` }, 403, corsHeaders);
    }
    if (field === 'bannerUrl' || field === 'avatarAnimatedUrl') {
      if (!PROFILE_URL_RE.test(value)) {
        return json({ ok: false, error: `${field} must be a https:// URL ≤250 chars` }, 400, corsHeaders);
      }
      if (field === 'avatarAnimatedUrl' && isVideoProfileUrl(value)) {
        return json({ ok: false, error: 'shared avatar URLs must be GIF/image media; video avatars are native-Discord-only' }, 400, corsHeaders);
      }
    }
    if (field === 'themeColorPrimary' || field === 'themeColorSecondary') {
      if (!PROFILE_COLOR_RE.test(value)) {
        return json({ ok: false, error: `${field} must be #RRGGBB hex` }, 400, corsHeaders);
      }
    }
    if (field in PROFILE_ENUMS && !PROFILE_ENUMS[field].has(value)) {
      return json({ ok: false, error: `${field} has an unsupported value` }, 400, corsHeaders);
    }
    validated[field] = value;
  }

  const profileKey = `${PROFILE_KV_PREFIX}${userId}`;
  const existingRaw = await env.VIP_CLAIMS.get(profileKey);
  let existing = {};
  if (existingRaw) {
    try { existing = JSON.parse(existingRaw); } catch (_) { existing = {}; }
  }
  const currentUpdatedAt = Number(existing.updatedAt);
  if (requestedUpdatedAt !== undefined && Number.isFinite(currentUpdatedAt) && requestedUpdatedAt !== currentUpdatedAt) {
    return json({ ok: false, error: 'profile changed on another PC', currentUpdatedAt }, 409, corsHeaders);
  }
  let final;
  if (replace) {
    // Replace mode: stored record becomes exactly what was provided,
    // stripping empty/cleared fields.
    final = {};
    for (const [k, v] of Object.entries(validated)) {
      if (v) final[k] = v;
    }
  } else {
    // Merge mode: keep existing fields, overlay provided ones; empty-string
    // values clear the matching field.
    final = { ...existing };
    for (const [k, v] of Object.entries(validated)) {
      if (v === '') delete final[k];
      else final[k] = v;
    }
  }

  // A tier can change independently of the profile record (for example, an
  // expired subscription or a Founder normalization). Do not leave old paid
  // presentation settings active after that change. The media URLs and theme
  // colors remain untouched because they are intentionally free for everyone.
  for (const [field, minimumTier] of Object.entries(PROFILE_FIELD_MIN_TIER)) {
    if (tier < minimumTier) delete final[field];
  }

  // Keep an updatedAt-only tombstone when all profile fields are cleared.
  // Deleting the record made another client interpret its last local media as
  // authoritative and republish the stale banner/avatar on the next sync.
  // The tombstone is small, preserves the clear operation across clients, and
  // is removed only when the claim itself expires or is revoked.
  final.updatedAt = Date.now();
  await env.VIP_CLAIMS.put(profileKey, JSON.stringify(final));

  // Versioned R2 objects avoid overwriting media while it is being viewed.
  // Once the profile points at a replacement (or clears the field), delete
  // only previous objects owned by this user. External URLs are never
  // touched, and a cleanup failure must not turn a successful profile save
  // into a 500.
  if (env.PROFILE_MEDIA) {
    for (const [kind, previousValue, nextValue] of [
      ['banner', existing.bannerUrl, final.bannerUrl],
      ['avatar', existing.avatarAnimatedUrl, final.avatarAnimatedUrl],
    ]) {
      const previousMediaKey = profileMediaKeyForUrl(previousValue, userId, kind);
      const nextMediaKey = profileMediaKeyForUrl(nextValue, userId, kind);
      if (previousMediaKey && previousMediaKey !== nextMediaKey) {
        try {
          await env.PROFILE_MEDIA.delete(previousMediaKey);
        } catch (error) {
          console.warn('[profile] old media cleanup failed:', error?.message ?? error);
        }
      }
    }
  }

  // Invalidate roster memo so the next /roster GET sees the new flair.
  rosterMemoCache = null;
  try {
    await updateRosterSnapshotUser(env, userId, rosterEntryFromClaim(auth.parsed, final));
  } catch (error) {
    // The profile write is authoritative in KV. Snapshot refresh is a
    // read-optimized mirror and must not make a successful profile save fail.
    console.warn('[profile] roster snapshot refresh failed:', error?.message ?? error);
  }

  return json({ ok: true, profile: final }, 200, corsHeaders);
}

function cleanProfileFields(profile, tier = TIER_MAXXER_PLUS_PLUS) {
  const cleaned = {};
  if (!profile || typeof profile !== 'object') return cleaned;
  for (const [field, minimumTier] of Object.entries(PROFILE_FIELD_MIN_TIER)) {
    if (tier < minimumTier) continue;
    if (typeof profile[field] === 'string' && profile[field]) cleaned[field] = profile[field];
  }
  return cleaned;
}

function rosterEntryFromClaim(claim, profile) {
  const parsed = claim && typeof claim === 'object' ? claim : {};
  if (!parsed.userId) return null;
  if (parsed.expiresAt && Date.now() > parsed.expiresAt) return null;
  if (parsed.scope && parsed.scope !== 'both' && parsed.scope !== 'dm') return null;
  const tier = effectiveClaimTier(parsed);
  const entry = {
    tier,
    via: parsed.founderNumber ? 'founder' : 'subscription',
  };
  if (parsed.claimedAt) entry.grantedAt = new Date(parsed.claimedAt).toISOString();
  if (parsed.expiresAt) entry.expiresAt = new Date(parsed.expiresAt).toISOString();
  if (parsed.founderNumber) entry.founderNumber = parsed.founderNumber;
  const cleaned = cleanProfileFields(profile, tier);
  if (Number.isFinite(Number(profile?.updatedAt))) entry.profileUpdatedAt = Number(profile.updatedAt);
  if (Object.keys(cleaned).length) entry.profile = cleaned;
  return entry;
}

function rosterResponse(payload, corsHeaders) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Profile media and widget skins are owner-scoped. Do not let a browser
      // or an intermediary replay an older roster after the Worker has
      // invalidated its memo following a profile update. The Worker still
      // keeps its bounded in-memory/R2 snapshot cache; this header only stops
      // client-side HTTP caches from reintroducing stale owner state.
      'cache-control': 'no-store',
      ...corsHeaders,
    },
  });
}

async function readRosterSnapshot(env) {
  if (!env.PROFILE_MEDIA?.get) return null;
  try {
    const object = await env.PROFILE_MEDIA.get(ROSTER_SNAPSHOT_KEY);
    if (!object?.body) return null;
    const payload = JSON.parse(await new Response(object.body).text());
    if (!payload || payload.version !== 2 || !payload.users || typeof payload.users !== 'object') return null;
    return payload;
  } catch (error) {
    console.warn('[roster] snapshot read failed:', error?.message ?? error);
    return null;
  }
}

async function writeRosterSnapshot(env, payload) {
  if (!env.PROFILE_MEDIA?.put) return;
  await env.PROFILE_MEDIA.put(ROSTER_SNAPSHOT_KEY, JSON.stringify(payload), {
    httpMetadata: {
      contentType: 'application/json',
      // The snapshot is the durable source of truth, not a browser cache. A
      // client must fetch the current owner map after focus/profile changes.
      cacheControl: 'no-store',
    },
  });
}

async function updateRosterSnapshotUser(env, userId, entry) {
  if (!userId || !env.PROFILE_MEDIA?.put) return;
  const snapshot = await readRosterSnapshot(env);
  // A missing snapshot means the one-time legacy migration has not completed.
  // Do not create a partial roster from a single write; the next successful
  // /roster migration will include all existing claims.
  if (!snapshot) return;
  const users = { ...snapshot.users };
  if (entry) users[userId] = entry;
  else delete users[userId];
  await writeRosterSnapshot(env, {
    version: 2,
    issuedAt: new Date().toISOString(),
    users,
  });
}

async function refreshRosterSnapshotUser(env, claim) {
  if (!claim?.userId) return;
  const profile = await readProfileRecord(env, claim.userId);
  await updateRosterSnapshotUser(env, claim.userId, rosterEntryFromClaim(claim, profile));
}

async function buildRosterFromKv(env, now) {
  const users = {};
  let cursor;
  do {
    const options = { prefix: 'claim:', limit: 1000 };
    if (cursor) options.cursor = cursor;
    const page = await env.VIP_CLAIMS.list(options);
    for (const key of page.keys) {
      const raw = await env.VIP_CLAIMS.get(key.name);
      if (!raw) continue;
      const parsed = parseClaim(raw);
      const entry = rosterEntryFromClaim(parsed);
      if (entry) users[parsed.userId] = entry;
    }
    cursor = page.cursor;
    if (page.list_complete) break;
  } while (cursor);

  // Merge profile flair (banner / animated avatar / theme colors) onto roster
  // entries. Only users with a claim record get the flair merge.
  cursor = undefined;
  do {
    const options = { prefix: PROFILE_KV_PREFIX, limit: 1000 };
    if (cursor) options.cursor = cursor;
    const page = await env.VIP_CLAIMS.list(options);
    for (const key of page.keys) {
      const userId = key.name.slice(PROFILE_KV_PREFIX.length);
      if (!users[userId]) continue;
      const raw = await env.VIP_CLAIMS.get(key.name);
      if (!raw) continue;
      try {
        const profile = JSON.parse(raw);
        const cleaned = cleanProfileFields(profile, users[userId].tier);
        if (Number.isFinite(Number(profile.updatedAt))) users[userId].profileUpdatedAt = Number(profile.updatedAt);
        if (Object.keys(cleaned).length) users[userId].profile = cleaned;
      } catch (_) {
        // Corrupt profile record — skip silently, fall through to no flair.
      }
    }
    cursor = page.cursor;
    if (page.list_complete) break;
  } while (cursor);

  return {
    version: 2,
    issuedAt: new Date(now).toISOString(),
    users,
  };
}

async function handleRoster(env, corsHeaders, ctx) {
  const now = Date.now();
  if (rosterMemoCache && now - rosterMemoCachedAt < ROSTER_CACHE_TTL_SEC * 1000) {
    return rosterResponse(rosterMemoCache, corsHeaders);
  }

  const snapshot = await readRosterSnapshot(env);
  if (snapshot) {
    rosterMemoCache = snapshot;
    rosterMemoCachedAt = now;
    return rosterResponse(snapshot, corsHeaders);
  }

  try {
    // One-time migration for the pre-snapshot schema. Once this succeeds,
    // normal roster reads use one R2 object instead of KV list scans.
    const payload = await buildRosterFromKv(env, now);
    try {
      await writeRosterSnapshot(env, payload);
    } catch (error) {
      console.warn('[roster] snapshot write failed:', error?.message ?? error);
    }
    rosterMemoCache = payload;
    rosterMemoCachedAt = now;
    return rosterResponse(payload, corsHeaders);
  } catch (error) {
    // KV list has a small daily quota on the free plan. Do not turn that
    // expected exhaustion into a 500; clients can keep their last good roster
    // and retry after the quota window rolls over.
    console.warn('[roster] legacy migration unavailable:', error?.message ?? error);
    return json({
      ok: false,
      error: 'roster temporarily unavailable; retry after the KV quota resets',
      retryAfterSeconds: ROSTER_RETRY_AFTER_SEC,
    }, 503, {
      ...corsHeaders,
      'cache-control': 'no-store',
      'retry-after': String(ROSTER_RETRY_AFTER_SEC),
    });
  }
}

/**
 * Atomic-ish founder number assignment. KV doesn't have native atomic
 * counters, so we use a read-modify-write loop with metadata-version CAS.
 * Under realistic launch volume (Founder slots are dripped manually, max
 * ~1 claim/min) collisions are essentially impossible. The CAS retry caps
 * exposure if two claims hit the same instant.
 *
 * Returns the assigned number 1..33, or null if the cap is reached.
 */
async function assignFounderNumber(env) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = await env.VIP_CLAIMS.get(FOUNDER_COUNTER_KEY);
    const current = raw ? parseInt(raw, 10) : 0;
    if (Number.isNaN(current) || current < 0) {
      // Corrupted counter — bail rather than overflow the cap.
      return null;
    }
    const next = current + 1;
    if (next > FOUNDER_CAP) {
      return null;
    }
    // No KV CAS primitive — just write the new value. Two simultaneous
    // claimants in attempt 0 would both read `current` and write the same
    // `next`, giving them the same number. The retry-on-mismatch below
    // catches this on attempt 1: we re-read after writing and confirm our
    // value. If the counter advanced past us, retry.
    await env.VIP_CLAIMS.put(FOUNDER_COUNTER_KEY, String(next));
    const verify = await env.VIP_CLAIMS.get(FOUNDER_COUNTER_KEY);
    if (verify === String(next)) {
      return next;
    }
    // Someone else also wrote — back off briefly and try again.
    await new Promise(r => setTimeout(r, 50 + Math.floor(Math.random() * 100)));
  }
  return null;
}

function parseClaim(value) {
  // v1 stored claims as a bare hwid string. v2+ stores JSON.
  if (typeof value !== 'string') return { hwid: '' };
  const trimmed = value.trim();
  if (!trimmed) return { hwid: '' };
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      return {
        hwid: typeof obj.hwid === 'string' ? obj.hwid.toLowerCase() : '',
        userId: typeof obj.userId === 'string' ? obj.userId : undefined,
        tier: typeof obj.tier === 'number' ? obj.tier : undefined,
        founderNumber: typeof obj.founderNumber === 'number' ? obj.founderNumber : undefined,
        claimedAt: typeof obj.claimedAt === 'number' ? obj.claimedAt : undefined,
        // Added in the v0.6 schema upgrade. Legacy claims have these
        // as undefined; the caller back-fills.
        scope: typeof obj.scope === 'string' ? obj.scope : undefined,
        expiresAt: typeof obj.expiresAt === 'number' ? obj.expiresAt : undefined,
      };
    } catch {
      return { hwid: '' };
    }
  }
  // v1 — plain hwid string.
  return { hwid: trimmed.toLowerCase() };
}

function normalizeCode(code) {
  return code
    .toUpperCase()
    .replace(/^MAXX-?/, '')
    .replace(/[\s-]/g, '');
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

// ─── Discord role grant ────────────────────────────────────────────────
// Mirrors maxxtopia/tickets-worker/worker.js's handleGrantVipClick. PUT
// to /guilds/{guild}/members/{user}/roles/{role} is idempotent — granting
// to a user who already has the role returns 204 with no error. We grant
// the universal @VIP first (gates the lounge channels), then the per-tier
// role if configured. Per-tier env vars are optional; missing ones are
// silently skipped, since the tier-ladder Discord roles aren't all created
// in every deploy.

const TIER_TO_ROLE_ENV = {
  1: 'MAXXER_ROLE_ID',
  2: 'MAXXER_PLUS_ROLE_ID',
  3: 'MAXXER_PLUS_PLUS_ROLE_ID',
};

async function grantDiscordRoles(env, userId, tier) {
  if (!env.DISCORD_BOT_TOKEN) {
    console.warn('[grantDiscordRoles] DISCORD_BOT_TOKEN not set — skipping');
    return;
  }
  if (!env.DISCORD_GUILD_ID) {
    console.warn('[grantDiscordRoles] DISCORD_GUILD_ID not set — skipping');
    return;
  }
  const grants = [];
  if (env.VIP_ROLE_ID) {
    grants.push({ name: 'VIP', id: env.VIP_ROLE_ID });
  }
  const tierEnvKey = TIER_TO_ROLE_ENV[tier];
  if (tierEnvKey && env[tierEnvKey]) {
    grants.push({ name: `tier-${tier}`, id: env[tierEnvKey] });
  }
  for (const g of grants) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${g.id}`,
        {
          method: 'PUT',
          headers: {
            'authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
            'x-audit-log-reason': `auto-grant via vip-worker (tier ${tier})`,
          },
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(
          `[grantDiscordRoles] ${g.name} (${g.id}) → ${res.status}: ${text.slice(0, 200)}`,
        );
      }
    } catch (e) {
      console.warn(`[grantDiscordRoles] ${g.name} fetch failed:`, e?.message ?? e);
    }
  }
}

// ─── Discord OAuth callback (optmaxxing path) ──────────────────────────
// optmaxxing has no Discord identity at claim time. After redemption, the
// app shows a "Link Discord" button that opens the user's browser into
// the Discord OAuth URL with `state=<hwid>`. Discord redirects back here
// with `code` + `state`. We exchange the code for an access token, fetch
// /users/@me to get the Discord user ID, look up the HWID claim's tier,
// then grant the matching roles. State carries the hwid so we don't need
// session storage; the hwid → claim lookup is the only join key.

async function handleDiscordLink(url, env, corsHeaders, ctx) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');
  if (errParam) {
    if (state?.startsWith('free_')) {
      await updateFreeClaimSession(env, state.slice('free_'.length), {
        status: 'error',
        error: 'Discord authorization was cancelled',
      });
    }
    return htmlPage(
      `<h1>Discord link cancelled</h1><p>${escapeHtml(errParam)}</p>` +
        `<p>You can re-try from the app.</p>`,
      400,
    );
  }
  if (!code || !state) {
    return htmlPage(
      `<h1>Missing code or state</h1>` +
        `<p>This page is the Discord OAuth callback. Don't open it directly — start from the app.</p>`,
      400,
    );
  }
    // Waitlist signups share this redirect URI, tagged `wl_<product>`. Route them
    // out BEFORE the HWID-claim logic so the VIP path is never touched.
    if (state.startsWith('offer_')) {
      return handleOfferJoin(code, state.slice('offer_'.length), env, ctx);
    }
    if (state.startsWith('free_')) {
      return handleFreeClaimJoin(code, state.slice('free_'.length), env);
    }
    if (state.startsWith('wl_')) {
      return handleWaitlistJoin(code, state, env);
    }
  if (!ALLOWED_HWID_RE.test(state.toLowerCase())) {
    return htmlPage(`<h1>Bad state</h1><p>HWID format invalid.</p>`, 400);
  }
  if (
    !env.DISCORD_OAUTH_CLIENT_ID ||
    !env.DISCORD_OAUTH_CLIENT_SECRET ||
    !env.DISCORD_OAUTH_REDIRECT_URI
  ) {
    return htmlPage(
      `<h1>OAuth not configured</h1>` +
        `<p>Worker missing DISCORD_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI. Tell Diggy.</p>`,
      500,
    );
  }
  const lowerHwid = state.toLowerCase();

  // 1. Exchange code → access token.
  let tokenRes;
  try {
    tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_OAUTH_CLIENT_ID,
        client_secret: env.DISCORD_OAUTH_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI,
      }),
    });
  } catch (e) {
    return htmlPage(`<h1>OAuth exchange failed</h1><p>${escapeHtml(String(e))}</p>`, 502);
  }
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    return htmlPage(
      `<h1>Discord rejected the OAuth code</h1><p>${tokenRes.status}: ${escapeHtml(text.slice(0, 300))}</p>`,
      400,
    );
  }
  const tokenJson = await tokenRes.json().catch(() => ({}));
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    return htmlPage(`<h1>No access_token in OAuth response</h1>`, 502);
  }

  // 2. Identify the Discord user.
  let userRes;
  try {
    userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    return htmlPage(`<h1>Identify failed</h1><p>${escapeHtml(String(e))}</p>`, 502);
  }
  if (!userRes.ok) {
    return htmlPage(`<h1>Identify rejected</h1><p>${userRes.status}</p>`, 502);
  }
  const userJson = await userRes.json().catch(() => ({}));
  const userId = userJson.id;
  if (!userId || !ALLOWED_USER_ID_RE.test(String(userId))) {
    return htmlPage(`<h1>Discord returned bad user id</h1>`, 502);
  }

  // 3. Find the HWID's claim. KV doesn't support secondary index, so we
  // scan claim:* keys (small N for our launch volume — see /roster note).
  // If we ever cross a few hundred claims, add a hwid → code reverse index.
  let matchedClaim = null;
  let cursor;
  do {
    const page = await env.VIP_CLAIMS.list({ prefix: 'claim:', cursor, limit: 1000 });
    for (const key of page.keys) {
      const raw = await env.VIP_CLAIMS.get(key.name);
      if (!raw) continue;
      const parsed = parseClaim(raw);
      if (parsed.hwid === lowerHwid) {
        matchedClaim = { key: key.name, parsed };
        break;
      }
    }
    cursor = page.cursor;
    if (matchedClaim || page.list_complete) break;
  } while (cursor);

  if (!matchedClaim) {
    return htmlPage(
      `<h1>No claim found for that HWID</h1>` +
        `<p>Redeem your code in the app first, then click Link Discord.</p>`,
      404,
    );
  }

  // 4. Backfill userId onto the claim (if not already set) so the roster
  // can render this user.
  const tier = effectiveClaimTier(matchedClaim.parsed);
  if (!matchedClaim.parsed.userId) {
    matchedClaim.parsed.userId = userId;
    matchedClaim.parsed.tier = tier;
    matchedClaim.parsed.claimedAt ??= Date.now();
    await env.VIP_CLAIMS.put(matchedClaim.key, JSON.stringify(matchedClaim.parsed));
    rosterMemoCache = null;
    try {
      await refreshRosterSnapshotUser(env, matchedClaim.parsed);
    } catch (error) {
      console.warn('[discord-link] roster snapshot refresh failed:', error?.message ?? error);
    }
  } else if (matchedClaim.parsed.userId !== userId) {
    return htmlPage(
      `<h1>HWID already linked to a different Discord user</h1>` +
        `<p>If this was a mistake, ping Diggy in the Maxxtopia ticket thread.</p>`,
      409,
    );
  }

  // 5. Grant the roles.
  await grantDiscordRoles(env, userId, tier);

  return htmlPage(
    `<h1>✓ Discord linked</h1>` +
      `<p>Your <b>@VIP</b> role is granted. Close this tab and go back to the app.</p>` +
      `<p style="opacity:0.6;font-size:12px">User ${escapeHtml(userId)} · tier ${tier}</p>`,
    200,
  );
}

// ─── Free Discordmaxxer profile activation ─────────────────────────────

function freeClaimSessionKey(session) {
  return `${FREE_CLAIM_SESSION_PREFIX}${session}`;
}

function freeClaimUserKey(userId, hwid) {
  return `${FREE_CLAIM_USER_PREFIX}${userId}:${hwid}`;
}

async function updateFreeClaimSession(env, session, patch) {
  if (!FREE_CLAIM_SESSION_RE.test(String(session || ''))) return null;
  const key = freeClaimSessionKey(session);
  const raw = await env.VIP_CLAIMS.get(key);
  if (!raw) return null;
  let current;
  try { current = JSON.parse(raw); } catch { return null; }
  const next = { ...current, ...patch };
  await env.VIP_CLAIMS.put(key, JSON.stringify(next), { expirationTtl: FREE_CLAIM_TTL_SEC });
  return next;
}

function freeClaimAuthorizeUrl(session, env) {
  return 'https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
    client_id: env.DISCORD_OAUTH_CLIENT_ID,
    redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state: `free_${session}`,
    prompt: 'consent',
  }).toString();
}

async function handleFreeClaimStart(body, env, corsHeaders) {
  const hwid = typeof body?.hwid === 'string' ? body.hwid.toLowerCase() : '';
  if (!ALLOWED_HWID_RE.test(hwid)) {
    return json({ ok: false, error: 'malformed hwid' }, 400, corsHeaders);
  }
  if (!env.DISCORD_OAUTH_CLIENT_ID || !env.DISCORD_OAUTH_CLIENT_SECRET || !env.DISCORD_OAUTH_REDIRECT_URI) {
    return json({ ok: false, error: 'free activation is not configured yet' }, 503, corsHeaders);
  }

  const session = genCode();
  const now = Date.now();
  const expiresAt = now + FREE_CLAIM_TTL_SEC * 1000;
  await env.VIP_CLAIMS.put(freeClaimSessionKey(session), JSON.stringify({
    version: 1,
    session,
    status: 'pending',
    hwid,
    createdAt: now,
    expiresAt,
  }), { expirationTtl: FREE_CLAIM_TTL_SEC });

  return json({
    ok: true,
    status: 'pending',
    session,
    authorizeUrl: freeClaimAuthorizeUrl(session, env),
    expiresAt,
  }, 200, corsHeaders);
}

async function handleFreeClaimStatus(url, env, corsHeaders) {
  const session = (url.searchParams.get('session') || '').toUpperCase();
  if (!FREE_CLAIM_SESSION_RE.test(session)) {
    return json({ ok: false, error: 'malformed session' }, 400, corsHeaders);
  }
  const raw = await env.VIP_CLAIMS.get(freeClaimSessionKey(session));
  if (!raw) return json({ ok: false, error: 'activation session not found or expired' }, 404, corsHeaders);
  let record;
  try { record = JSON.parse(raw); } catch { return json({ ok: false, error: 'activation session is invalid' }, 500, corsHeaders); }

  if (record.status === 'pending' && Number(record.expiresAt) <= Date.now()) {
    await updateFreeClaimSession(env, session, { status: 'expired', error: 'activation session expired' });
    return json({ ok: false, status: 'expired', error: 'activation session expired' }, 410, corsHeaders);
  }
  if (record.status === 'claimed') {
    return json({
      ok: true,
      status: 'claimed',
      code: record.code,
      userId: record.userId,
      tier: TIER_FREE,
      scope: 'dm',
      claimedAt: record.claimedAt,
    }, 200, corsHeaders);
  }
  if (record.status === 'error' || record.status === 'expired') {
    return json({ ok: false, status: record.status, error: record.error || 'activation failed' }, 400, corsHeaders);
  }
  return json({ ok: true, status: 'pending', expiresAt: record.expiresAt }, 200, corsHeaders);
}

async function handleFreeClaimJoin(code, session, env) {
  if (!FREE_CLAIM_SESSION_RE.test(String(session || ''))) {
    return htmlPage(`<h1>Bad activation link</h1><p>The activation session is invalid.</p>`, 400);
  }
  const raw = await env.VIP_CLAIMS.get(freeClaimSessionKey(session));
  if (!raw) return htmlPage(`<h1>Activation expired</h1><p>Return to Discordmaxxer and start free activation again.</p>`, 410);
  let record;
  try { record = JSON.parse(raw); } catch { record = null; }
  if (!record || record.status !== 'pending') {
    return htmlPage(`<h1>Activation already finished</h1><p>Return to Discordmaxxer to continue.</p>`, 409);
  }
  if (Number(record.expiresAt) <= Date.now()) {
    await updateFreeClaimSession(env, session, { status: 'expired', error: 'activation session expired' });
    return htmlPage(`<h1>Activation expired</h1><p>Return to Discordmaxxer and start free activation again.</p>`, 410);
  }
  if (!env.DISCORD_OAUTH_CLIENT_ID || !env.DISCORD_OAUTH_CLIENT_SECRET || !env.DISCORD_OAUTH_REDIRECT_URI) {
    await updateFreeClaimSession(env, session, { status: 'error', error: 'OAuth is not configured' });
    return htmlPage(`<h1>OAuth not configured</h1><p>Tell Diggy.</p>`, 500);
  }

  let tokenRes;
  try {
    tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_OAUTH_CLIENT_ID,
        client_secret: env.DISCORD_OAUTH_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI,
      }),
    });
  } catch (error) {
    await updateFreeClaimSession(env, session, { status: 'error', error: 'OAuth exchange failed' });
    return htmlPage(`<h1>OAuth exchange failed</h1><p>${escapeHtml(String(error))}</p>`, 502);
  }
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    await updateFreeClaimSession(env, session, { status: 'error', error: 'Discord rejected the OAuth code' });
    return htmlPage(`<h1>Discord rejected the OAuth code</h1><p>${tokenRes.status}: ${escapeHtml(text.slice(0, 300))}</p>`, 400);
  }
  const tokenJson = await tokenRes.json().catch(() => ({}));
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    await updateFreeClaimSession(env, session, { status: 'error', error: 'No access token returned' });
    return htmlPage(`<h1>No access token returned</h1>`, 502);
  }

  let userRes;
  try {
    userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    await updateFreeClaimSession(env, session, { status: 'error', error: 'Discord identify failed' });
    return htmlPage(`<h1>Discord identify failed</h1><p>${escapeHtml(String(error))}</p>`, 502);
  }
  if (!userRes.ok) {
    await updateFreeClaimSession(env, session, { status: 'error', error: 'Discord identify rejected' });
    return htmlPage(`<h1>Discord identify rejected</h1><p>${userRes.status}</p>`, 502);
  }
  const userJson = await userRes.json().catch(() => ({}));
  const userId = String(userJson.id || '');
  if (!ALLOWED_USER_ID_RE.test(userId)) {
    await updateFreeClaimSession(env, session, { status: 'error', error: 'Discord returned a bad user id' });
    return htmlPage(`<h1>Discord returned a bad user id</h1>`, 502);
  }

  const hwid = String(record.hwid || '').toLowerCase();
  let claimCode = null;
  const existingIndexRaw = await env.VIP_CLAIMS.get(freeClaimUserKey(userId, hwid));
  if (existingIndexRaw) {
    try {
      const existingIndex = JSON.parse(existingIndexRaw);
      if (ALLOWED_CODE_RE.test(existingIndex.code || '')) {
        const existingClaimRaw = await env.VIP_CLAIMS.get(`claim:${existingIndex.code}`);
        const existingClaim = existingClaimRaw ? parseClaim(existingClaimRaw) : null;
        if (existingClaim?.userId === userId && existingClaim?.hwid === hwid && effectiveClaimTier(existingClaim) === TIER_FREE) {
          claimCode = existingIndex.code;
        }
      }
    } catch (_) {
      // A damaged free-user index is harmless; the next branch rebuilds it.
    }
  }

  if (!claimCode) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = genCode();
      if (!(await env.VIP_CLAIMS.get(`claim:${candidate}`))) {
        claimCode = candidate;
        break;
      }
    }
    if (!claimCode) {
      await updateFreeClaimSession(env, session, { status: 'error', error: 'could not allocate a free claim' });
      return htmlPage(`<h1>Could not allocate a free claim</h1><p>Please try again.</p>`, 503);
    }
    const claimedAt = Date.now();
    const claim = { hwid, userId, tier: TIER_FREE, scope: 'dm', claimedAt };
    await env.VIP_CLAIMS.put(`claim:${claimCode}`, JSON.stringify(claim));
    await env.VIP_CLAIMS.put(freeClaimUserKey(userId, hwid), JSON.stringify({ code: claimCode, userId, hwid, claimedAt }));
    rosterMemoCache = null;
    try {
      await refreshRosterSnapshotUser(env, claim);
    } catch (error) {
      console.warn('[free-claim] roster snapshot refresh failed:', error?.message ?? error);
    }
  }

  const claimedAt = Date.now();
  await updateFreeClaimSession(env, session, {
    status: 'claimed',
    code: claimCode,
    userId,
    tier: TIER_FREE,
    scope: 'dm',
    claimedAt,
  });
  return htmlPage(
    `<h1>✓ Discordmaxxer activated</h1>` +
      `<p>Free profile flair is ready. Close this tab and return to Discordmaxxer.</p>` +
      `<p style="opacity:0.6;font-size:12px">Your banner, animated avatar, and profile colors can now sync to other Discordmaxxer clients.</p>`,
    200,
  );
}

// ─── Waitlist handlers ─────────────────────────────────────────────────

// GET /waitlist/start?product=<slug> — bounce the visitor into Discord OAuth
// with a `wl_<product>` state and the identify + guilds.join scopes. The site's
// "Get on the waitlist" buttons point straight here.
function handleWaitlistStart(url, env) {
  const product = (url.searchParams.get('product') || '').toLowerCase();
  if (!PRODUCT_SLUG_RE.test(product)) {
    return htmlPage(`<h1>Missing product</h1><p>Expected /waitlist/start?product=&lt;slug&gt;</p>`, 400);
  }
  if (!env.DISCORD_OAUTH_CLIENT_ID || !env.DISCORD_OAUTH_REDIRECT_URI) {
    return htmlPage(`<h1>OAuth not configured</h1><p>Tell Diggy.</p>`, 500);
  }
  const authUrl =
    'https://discord.com/api/oauth2/authorize?' +
    new URLSearchParams({
      client_id: env.DISCORD_OAUTH_CLIENT_ID,
      redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify guilds.join',
      state: `wl_${product}`,
      prompt: 'consent',
    }).toString();
  return Response.redirect(authUrl, 302);
}

// OAuth callback for a waitlist signup: code → token → identify → add to the
// Maxxtopia guild (so the bot can DM) → store the signup. guild-join is
// best-effort; if it fails we still record the signup and tell them to join.
async function handleWaitlistJoin(code, state, env) {
  const product = state.slice(3); // strip 'wl_'
  if (!PRODUCT_SLUG_RE.test(product)) {
    return htmlPage(`<h1>Bad waitlist link</h1>`, 400);
  }
  if (!env.DISCORD_OAUTH_CLIENT_ID || !env.DISCORD_OAUTH_CLIENT_SECRET || !env.DISCORD_OAUTH_REDIRECT_URI) {
    return htmlPage(`<h1>OAuth not configured</h1><p>Tell Diggy.</p>`, 500);
  }

  // 1. code → access token.
  let accessToken;
  try {
    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_OAUTH_CLIENT_ID,
        client_secret: env.DISCORD_OAUTH_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => '');
      return htmlPage(`<h1>Discord rejected the sign-in</h1><p>${tokenRes.status}: ${escapeHtml(t.slice(0, 200))}</p>`, 400);
    }
    accessToken = (await tokenRes.json()).access_token;
  } catch (e) {
    return htmlPage(`<h1>Sign-in failed</h1><p>${escapeHtml(String(e))}</p>`, 502);
  }
  if (!accessToken) return htmlPage(`<h1>No access token from Discord</h1>`, 502);

  // 2. identify.
  let userJson;
  try {
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return htmlPage(`<h1>Couldn't read your Discord account</h1>`, 502);
    userJson = await userRes.json();
  } catch (e) {
    return htmlPage(`<h1>Identify failed</h1>`, 502);
  }
  const userId = userJson.id;
  if (!userId || !ALLOWED_USER_ID_RE.test(String(userId))) {
    return htmlPage(`<h1>Discord returned a bad user id</h1>`, 502);
  }
  const username = typeof userJson.username === 'string' ? userJson.username : '';

  // 3. Add to the Maxxtopia guild so the bot shares a server with them and can
  //    DM on launch. 201 = added, 204 = already a member. Non-fatal otherwise.
  let joined = false;
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID) {
    try {
      const jr = await fetch(
        `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`,
        {
          method: 'PUT',
          headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken }),
        },
      );
      joined = jr.status === 201 || jr.status === 204;
    } catch (_) {
      /* non-fatal — they can join manually */
    }
  }

  // 4. Store the signup (idempotent per product+user).
  const key = `${WAITLIST_KV_PREFIX}${product}:${userId}`;
  if (!(await env.VIP_CLAIMS.get(key))) {
    await env.VIP_CLAIMS.put(
      key,
      JSON.stringify({ userId, username, product, joinedAt: Date.now() }),
    );
  }

  return htmlPage(
    `<h1>✓ You're on the ${escapeHtml(product)} waitlist</h1>` +
      `<p>The Maxxtopia bot will DM you the moment <b>${escapeHtml(product)}</b> goes live.</p>` +
      (joined
        ? `<p style="opacity:.7">You've been added to the Maxxtopia Discord so the bot can reach you.</p>`
        : `<p><b>One step left:</b> join the Discord so the bot can DM you → <a href="https://discord.gg/S78eecbWdx">discord.gg/S78eecbWdx</a></p>`) +
      `<p style="opacity:.6;font-size:12px">Signed up as ${escapeHtml(username)} · ${escapeHtml(String(userId))}. You can close this tab.</p>`,
    200,
  );
}

// GET /waitlist/count?product=<slug> — public signup count (for "N waiting" UI).
async function handleWaitlistCount(url, env, corsHeaders) {
  const product = (url.searchParams.get('product') || '').toLowerCase();
  if (!PRODUCT_SLUG_RE.test(product)) {
    return json({ ok: false, error: 'bad product' }, 400, corsHeaders);
  }
  let count = 0;
  let cursor;
  do {
    const page = await env.VIP_CLAIMS.list({ prefix: `${WAITLIST_KV_PREFIX}${product}:`, cursor, limit: 1000 });
    count += page.keys.length;
    cursor = page.cursor;
    if (page.list_complete) break;
  } while (cursor);
  return json({ ok: true, product, count }, 200, corsHeaders);
}

// POST /waitlist/notify {product, message?, dryRun?} — admin only. DMs up to
// MAX_DM_PER_CALL un-notified signups via the bot, marks them, returns the
// remaining count. Call again until remaining = 0 (keeps each call inside the
// free-tier subrequest budget and below Discord's DM-open rate limit).
async function handleWaitlistNotify(request, env, corsHeaders) {
  if (!adminAuthed(request, env)) {
    return json({ ok: false, error: 'unauthorized' }, 401, corsHeaders);
  }
  let b;
  try { b = await request.json(); } catch (e) {
    return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
  }
  const product = typeof b.product === 'string' ? b.product.toLowerCase() : '';
  if (!PRODUCT_SLUG_RE.test(product)) {
    return json({ ok: false, error: 'bad product' }, 400, corsHeaders);
  }
  const message =
    typeof b.message === 'string' && b.message.trim()
      ? b.message.trim().slice(0, 1800)
      : `🎉 ${product} is now live! You asked for a heads-up on maxxtopia.com — here it is. → https://maxxtopia.com/${product}/`;
  const dryRun = b.dryRun === true;

  // Gather all signup keys for the product.
  const keys = [];
  let cursor;
  do {
    const page = await env.VIP_CLAIMS.list({ prefix: `${WAITLIST_KV_PREFIX}${product}:`, cursor, limit: 1000 });
    for (const k of page.keys) keys.push(k.name);
    cursor = page.cursor;
    if (page.list_complete) break;
  } while (cursor);

  let sent = 0, failed = 0, alreadyNotified = 0, remaining = 0;
  for (const key of keys) {
    if (sent >= MAX_DM_PER_CALL) { remaining++; continue; }
    const raw = await env.VIP_CLAIMS.get(key);
    if (!raw) continue;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
    if (rec.notifiedAt) { alreadyNotified++; continue; }
    if (dryRun) { remaining++; continue; }
    const ok = await dmUser(env, rec.userId, message);
    if (ok) {
      sent++;
      rec.notifiedAt = Date.now();
      await env.VIP_CLAIMS.put(key, JSON.stringify(rec));
    } else {
      failed++;
    }
  }
  return json({ ok: true, product, sent, failed, alreadyNotified, remaining, total: keys.length, dryRun }, 200, corsHeaders);
}

// Open (or reuse) a DM channel and send one message via the Maxx bot.
async function dmUser(env, userId, content) {
  if (!env.DISCORD_BOT_TOKEN) return false;
  try {
    const chRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ recipient_id: userId }),
    });
    if (!chRes.ok) return false;
    const ch = await chRes.json();
    if (!ch.id) return false;
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${ch.id}/messages`, {
      method: 'POST',
      headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return msgRes.ok;
  } catch {
    return false;
  }
}

function htmlPage(bodyHtml, status = 200) {
  const html = `<!doctype html><meta charset="utf-8"><title>Discord link</title>
<style>body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;background:#0a0a0a;color:#eee;padding:48px 24px;max-width:560px;margin:auto}h1{font-size:22px;margin:0 0 12px}p{margin:0 0 12px}</style>
${bodyHtml}`;
  return new Response(html, { status, headers: { 'content-type': 'text/html;charset=utf-8' } });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// =====================================================================
// ADMIN DASHBOARD — mint / list / revoke / label codes across all
// products from one bookmarkable page (/admin). Added 2026-06-11.
// API endpoints under /admin/* require `Authorization: Bearer <ADMIN_TOKEN>`
// (set via `wrangler secret put ADMIN_TOKEN`). The /admin HTML page is
// public but inert without the token.
// =====================================================================

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // excludes I L O U
const DURATIONS = {
  '3hr': 10800000,
  'day': 86400000,
  'week': 604800000,
  'month': 2592000000,
  'lifetime': null,
};

function genCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 16; i++) out += CROCKFORD[bytes[i] & 31];
  return out;
}

// Cosmetic display form (the worker normalizes it back). aim -> aimr-, all
// others -> MAXX-. Grouped in 4s like the mint scripts.
function displayCode(code, scope) {
  const pre = scope === 'aim' ? 'aimr-' : 'MAXX-';
  return pre + (code.match(/.{1,4}/g) || [code]).join('-');
}

function adminAuthed(request, env) {
  const tok = (env.ADMIN_TOKEN || '').trim();
  if (!tok) return false;
  const hdr = request.headers.get('authorization') || '';
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1].trim() === tok;
}

async function handleAdmin(url, request, env, corsHeaders) {
  if (!adminAuthed(request, env)) {
    return json({ ok: false, error: 'unauthorized' }, 401, corsHeaders);
  }
  const path = url.pathname;

  // POST /admin/mint {count, scope, tier, duration, label?}
  if (path === '/admin/mint' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    const count = Math.max(1, Math.min(100, parseInt(b.count, 10) || 1));
    const scope = ['aim', 'om', 'dm', 'both'].includes(b.scope) ? b.scope : 'both';
    const tier = [1, 2, 3].includes(parseInt(b.tier, 10)) ? parseInt(b.tier, 10) : 3;
    const durKey = Object.prototype.hasOwnProperty.call(DURATIONS, b.duration) ? b.duration : 'lifetime';
    const durationMs = DURATIONS[durKey];
    const label = typeof b.label === 'string' ? b.label.slice(0, 80) : '';
    const mintedAt = Date.now();
    const minted = [];
    for (let i = 0; i < count; i++) {
      const code = genCode();
      const meta = { tier, scope, durationMs, mintedAt, durationKey: durKey };
      if (label) meta.label = label;
      await env.VIP_CLAIMS.put('meta:' + code, JSON.stringify(meta));
      minted.push({ code, display: displayCode(code, scope) });
    }
    return json({ ok: true, minted, scope, tier, duration: durKey, label }, 200, corsHeaders);
  }

  // GET /admin/list  -> every minted code + its claim state
  if (path === '/admin/list' && request.method === 'GET') {
    const rows = [];
    const now = Date.now();
    const includeArchived = /^(1|true)$/i.test(url.searchParams.get('includeArchived') || '');
    let cursor;
    do {
      const options = { prefix: 'meta:' };
      if (cursor) options.cursor = cursor;
      const res = await env.VIP_CLAIMS.list(options);
      for (const k of res.keys) {
        const code = k.name.slice(5);
        let meta = {};
        try { meta = JSON.parse(await env.VIP_CLAIMS.get(k.name)) || {}; } catch (e) {}
        const archivedAt = typeof meta.archivedAt === 'number' && Number.isFinite(meta.archivedAt)
          ? meta.archivedAt
          : null;
        if (archivedAt && !includeArchived) continue;
        let claim = null;
        const raw = await env.VIP_CLAIMS.get('claim:' + code);
        if (raw) {
          claim = parseClaim(raw);
        }
        const claimedAt = claim?.claimedAt ?? null;
        const durationMs = typeof meta.durationMs === 'number'
          ? meta.durationMs
          : (meta.durationKey && Object.prototype.hasOwnProperty.call(DURATIONS, meta.durationKey)
            ? DURATIONS[meta.durationKey]
            : null);
        const expiresAt = claim?.expiresAt ?? (durationMs && claimedAt ? claimedAt + durationMs : null);
        const expired = !!(claim && expiresAt != null && now >= expiresAt);
        const canRemove = !archivedAt && (!claim || !!meta.revoked || expired);
        const scope = meta.scope || 'both';
        const tierRelevant = scope === 'dm' || scope === 'both';
        const duration = Object.prototype.hasOwnProperty.call(DURATIONS, meta.durationKey)
          ? meta.durationKey
          : typeof meta.durationMs === 'number' && meta.durationMs !== 0
            ? Object.keys(DURATIONS).find((key) => DURATIONS[key] === meta.durationMs) || 'unknown'
            : 'lifetime';
        const durationLabel = ({
          '3hr': '3 hours', day: '1 day', week: '1 week', month: '1 month',
          lifetime: 'Lifetime', unknown: 'Legacy / unknown',
        })[duration] || 'Legacy / unknown';
        const status = archivedAt
          ? 'archived'
          : meta.revoked
            ? 'revoked'
            : !claim
              ? 'unclaimed'
              : expired
                ? 'expired'
                : !claim.hwid
                  ? 'reset / awaiting rebind'
                  : 'claimed';
        const purchaserDiscordId = meta.discordUserId || meta.purchaserDiscordId || null;
        rows.push({
          code,
          display: displayCode(code, scope),
          scope,
          tier: tierRelevant ? (meta.tier ?? null) : null,
          tierRelevant,
          duration,
          durationLabel,
          durationSource: meta.durationKey ? 'code metadata' : 'legacy record',
          mintedAt: meta.mintedAt || null,
          label: meta.label || '',
          source: meta.source || 'legacy / dashboard',
          orderId: meta.orderId || null,
          resellerId: meta.resellerId || null,
          purchaserDiscordId,
          status,
          revoked: !!meta.revoked,
          archived: !!archivedAt,
          archivedAt,
          canRemove,
          claimed: claim ? {
            claimedAt,
            hwid: claim.hwid || null,
            userId: claim.userId || null,
            expiresAt,
            founderNumber: claim.founderNumber || null,
            extensionTotalMs: claim.extensionTotalMs || 0,
          } : null,
        });
      }
      cursor = res.list_complete ? null : res.cursor;
    } while (cursor);
    rows.sort((a, b) => (b.mintedAt || 0) - (a.mintedAt || 0));
    return json({ ok: true, rows, count: rows.length, includeArchived }, 200, corsHeaders);
  }

  // GET /admin/offers — first-time Tune Now offers, kept separate from paid
  // activation codes. This is the source Diggy checks before honoring a
  // discount; an offer never grants VIP automatically.
  if (path === '/admin/offers' && request.method === 'GET') {
    const rows = [];
    let cursor;
    do {
      const options = { prefix: OFFER_TICKET_PREFIX, limit: 1000 };
      if (cursor) options.cursor = cursor;
      const page = await env.VIP_CLAIMS.list(options);
      for (const key of page.keys) {
        const offer = parseJsonRecord(await env.VIP_CLAIMS.get(key.name));
        if (!offer) continue;
        rows.push({
          ticketId: offer.ticketId,
          rarity: offer.rarity,
          price: offer.price,
          normalPrice: OFFER_NORMAL_PRICE,
          savings: Number.isFinite(offer.savings) ? offer.savings : offerDiscount(offer.price).savings,
          discountPercent: Number.isFinite(offer.discountPercent) ? offer.discountPercent : offerDiscount(offer.price).discountPercent,
          chanceLabel: offer.chanceLabel,
          status: offer.status,
          userId: offer.userId || null,
          username: offer.username || null,
          issuedAt: offer.issuedAt || null,
          expiresAt: offer.expiresAt || null,
          dmSentAt: offer.dmSentAt || null,
          redeemedAt: offer.redeemedAt || null,
        });
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    rows.sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));
    return json({ ok: true, rows, count: rows.length }, 200, corsHeaders);
  }

  // Mark an offer used only after the discount has actually been honored.
  // Viewing or DMing an offer does not consume it.
  if (path === '/admin/offers/redeem' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    const ticketId = typeof b.ticketId === 'string' ? b.ticketId.toUpperCase().trim() : '';
    if (!OFFER_TICKET_RE.test(ticketId)) return json({ ok: false, error: 'malformed ticket id' }, 400, corsHeaders);
    const key = OFFER_TICKET_PREFIX + ticketId;
    const offer = parseJsonRecord(await env.VIP_CLAIMS.get(key));
    if (!offer) return json({ ok: false, error: 'offer not found' }, 404, corsHeaders);
    if (offer.status === 'redeemed') return json({ ok: true, status: 'redeemed', ticketId }, 200, corsHeaders);
    if (offer.status === 'revoked') return json({ ok: false, error: 'offer revoked' }, 410, corsHeaders);
    if (Date.now() > offer.expiresAt) {
      offer.status = 'expired';
      await env.VIP_CLAIMS.put(key, JSON.stringify(offer));
      if (offer.userId) await env.VIP_CLAIMS.put(OFFER_USER_PREFIX + offer.userId, JSON.stringify(offer));
      return json({ ok: false, error: 'offer expired', expiresAt: offer.expiresAt }, 410, corsHeaders);
    }
    offer.status = 'redeemed';
    offer.redeemedAt = Date.now();
    offer.redeemedBy = 'admin';
    await env.VIP_CLAIMS.put(key, JSON.stringify(offer));
    if (offer.userId) await env.VIP_CLAIMS.put(OFFER_USER_PREFIX + offer.userId, JSON.stringify(offer));
    return json({ ok: true, status: 'redeemed', ticketId, userId: offer.userId || null }, 200, corsHeaders);
  }

  if (path === '/admin/offers/revoke' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    const ticketId = typeof b.ticketId === 'string' ? b.ticketId.toUpperCase().trim() : '';
    if (!OFFER_TICKET_RE.test(ticketId)) return json({ ok: false, error: 'malformed ticket id' }, 400, corsHeaders);
    const key = OFFER_TICKET_PREFIX + ticketId;
    const offer = parseJsonRecord(await env.VIP_CLAIMS.get(key));
    if (!offer) return json({ ok: false, error: 'offer not found' }, 404, corsHeaders);
    offer.status = b.revoked === false ? 'offered' : 'revoked';
    offer.revokedAt = b.revoked === false ? null : Date.now();
    await env.VIP_CLAIMS.put(key, JSON.stringify(offer));
    if (offer.userId) await env.VIP_CLAIMS.put(OFFER_USER_PREFIX + offer.userId, JSON.stringify(offer));
    return json({ ok: true, ticketId, status: offer.status }, 200, corsHeaders);
  }

  if (path === '/admin/offers/dm' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    const ticketId = typeof b.ticketId === 'string' ? b.ticketId.toUpperCase().trim() : '';
    if (!OFFER_TICKET_RE.test(ticketId)) return json({ ok: false, error: 'malformed ticket id' }, 400, corsHeaders);
    const key = OFFER_TICKET_PREFIX + ticketId;
    const offer = parseJsonRecord(await env.VIP_CLAIMS.get(key));
    if (!offer) return json({ ok: false, error: 'offer not found' }, 404, corsHeaders);
    if (!offer.userId) return json({ ok: false, error: 'offer is not linked to Discord' }, 409, corsHeaders);
    const sent = await sendOfferDmAndMark(env, offer);
    return json({ ok: sent, sent, ticketId }, sent ? 200 : 502, corsHeaders);
  }

  // POST /admin/remove {code, reason?} archives an inactive key without
  // deleting its claim/audit records or making it reusable.
  if (path === '/admin/remove' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    const code = normalizeCode(typeof b?.code === 'string' ? b.code : '');
    if (!ALLOWED_CODE_RE.test(code)) {
      return json({ ok: false, error: 'malformed code' }, 400, corsHeaders);
    }
    const key = 'meta:' + code;
    const raw = await env.VIP_CLAIMS.get(key);
    if (!raw) return json({ ok: false, error: 'no such code' }, 404, corsHeaders);
    let meta = {};
    try { meta = JSON.parse(raw) || {}; } catch (e) {}
    const archivedAt = typeof meta.archivedAt === 'number' && Number.isFinite(meta.archivedAt)
      ? meta.archivedAt
      : null;
    if (archivedAt) {
      return json({ ok: true, status: 'already_removed', code, removedAt: archivedAt }, 200, corsHeaders);
    }
    const claimRaw = await env.VIP_CLAIMS.get('claim:' + code);
    const claim = claimRaw ? parseClaim(claimRaw) : null;
    const now = Date.now();
    const durationMs = typeof meta.durationMs === 'number'
      ? meta.durationMs
      : (meta.durationKey && Object.prototype.hasOwnProperty.call(DURATIONS, meta.durationKey)
        ? DURATIONS[meta.durationKey]
        : null);
    const expiresAt = claim?.expiresAt ?? (durationMs && claim?.claimedAt ? claim.claimedAt + durationMs : null);
    const active = !!(claim && !meta.revoked && (expiresAt == null || now < expiresAt));
    if (active) {
      return json({ ok: false, error: 'active claimed codes must be revoked or allowed to expire before removal' }, 409, corsHeaders);
    }
    meta.revoked = true;
    meta.revokedAt = typeof meta.revokedAt === 'number' ? meta.revokedAt : now;
    meta.archivedAt = now;
    meta.archivedBy = 'admin';
    meta.archiveReason = (typeof b?.reason === 'string' ? b.reason : 'test/retired code').trim().slice(0, 120);
    await env.VIP_CLAIMS.put(key, JSON.stringify(meta));
    return json({ ok: true, status: 'removed', code, removedAt: now }, 200, corsHeaders);
  }

  // POST /admin/revoke {code, revoked?}  -> toggle meta.revoked
  if (path === '/admin/revoke' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    const code = normalizeCode(typeof b?.code === 'string' ? b.code : '');
    if (!ALLOWED_CODE_RE.test(code)) {
      return json({ ok: false, error: 'malformed code' }, 400, corsHeaders);
    }
    const key = 'meta:' + code;
    const raw = await env.VIP_CLAIMS.get(key);
    if (!raw) return json({ ok: false, error: 'no such code' }, 404, corsHeaders);
    let meta = {};
    try { meta = JSON.parse(raw) || {}; } catch (e) {}
    if (meta.archivedAt && b?.revoked === false) {
      return json({ ok: false, error: 'removed codes cannot be restored' }, 409, corsHeaders);
    }
    meta.revoked = b?.revoked === false ? false : true;
    if (meta.revoked) meta.revokedAt = typeof meta.revokedAt === 'number' ? meta.revokedAt : Date.now();
    else delete meta.revokedAt;
    await env.VIP_CLAIMS.put(key, JSON.stringify(meta));
    return json({ ok: true, code, revoked: meta.revoked }, 200, corsHeaders);
  }

  // POST /admin/label {code, label}
  if (path === '/admin/label' && request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    const code = normalizeCode(typeof b.code === 'string' ? b.code : '');
    const key = 'meta:' + code;
    const raw = await env.VIP_CLAIMS.get(key);
    if (!raw) return json({ ok: false, error: 'no such code' }, 404, corsHeaders);
    let meta = {};
    try { meta = JSON.parse(raw) || {}; } catch (e) {}
    meta.label = (typeof b.label === 'string' ? b.label : '').slice(0, 80);
    await env.VIP_CLAIMS.put(key, JSON.stringify(meta));
    return json({ ok: true, code, label: meta.label }, 200, corsHeaders);
  }

  return json({ ok: false, error: 'not found' }, 404, corsHeaders);
}

const ADMIN_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maxxtopia — VIP codes</title>
<style>
 :root{--bg:#0a0a0a;--panel:#141414;--line:#262626;--accent:#a855f7;--txt:#eaeaea;--mut:#8a8a8a;--good:#3ad17a;--bad:#ff5a5a;--warn:#ffb84d}
 *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.5 Segoe UI,system-ui,sans-serif}
 header{padding:16px 22px;border-bottom:2px solid var(--accent);display:flex;align-items:center;gap:12px}
 header h1{font-size:18px;margin:0;letter-spacing:.5px}header .sub{color:var(--mut);font-size:12px}
 .wrap{max-width:1500px;margin:0 auto;padding:22px}
 .card{background:var(--panel);border:1px solid var(--line);padding:16px;margin-bottom:18px}
 label{display:block;color:var(--mut);font-size:12px;margin:0 0 4px}
 select,input{background:#0e0e0e;border:1px solid var(--line);color:var(--txt);padding:7px 9px;font:13px Segoe UI,sans-serif}
 .rowf{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
 button{background:var(--accent);color:#0a0a0a;border:0;padding:8px 16px;font:600 13px Segoe UI;cursor:pointer}
 button.ghost{background:#1d1d1d;color:var(--txt);border:1px solid var(--line)}
 button.bad{background:#3a1414;color:var(--bad);border:1px solid #5a2020}
 table{width:100%;border-collapse:collapse;font-size:12.5px}
 th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);white-space:nowrap}
 th{color:var(--mut);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
 .mono{font-family:Consolas,monospace}
 .pill{padding:2px 7px;border-radius:2px;font-size:11px;font-weight:600}
 .pill.un{background:#102a1a;color:var(--good)}.pill.cl{background:#2a2410;color:var(--warn)}.pill.rv{background:#2a1010;color:var(--bad)}
 .scopep{padding:1px 6px;border:1px solid var(--line);border-radius:2px;font-size:11px}
 #mintOut{margin-top:12px}.code{font-family:Consolas,monospace;background:#0e0e0e;border:1px solid var(--line);padding:4px 8px;display:inline-block;margin:3px 4px 0 0;cursor:pointer}
 .muted{color:var(--mut)}.gate{max-width:420px;margin:60px auto;text-align:center}
 .ledger-scroll{overflow:auto;margin-top:12px;max-height:70vh}
 #ledgerTable{min-width:1100px}
 #ledgerTable th:last-child,#ledgerTable td:last-child{position:sticky;right:0;z-index:1;min-width:172px;background:var(--panel);box-shadow:-8px 0 12px rgba(0,0,0,.2)}
 .archive-toggle{display:flex;align-items:center;gap:6px;margin:0;white-space:nowrap}
 .archive-toggle input{accent-color:var(--accent)}
 a{color:var(--accent)}
</style></head><body>
<header><h1>MAXXTOPIA · VIP CODES</h1><span class="sub">mint · track · revoke — all products</span></header>
<div class="wrap">
 <div id="gate" class="gate card" style="display:none">
   <label>Admin token</label>
   <input id="tokIn" type="password" style="width:100%" placeholder="paste ADMIN_TOKEN">
   <div style="margin-top:10px"><button onclick="saveTok()">Unlock</button></div>
   <p class="muted" style="margin-top:10px;font-size:12px">Stored in this browser only.</p>
 </div>
 <div id="app" style="display:none">
   <div class="card">
     <div class="rowf" style="justify-content:space-between">
       <div><h2 style="margin:0;font-size:16px">First-time Tune Now offers</h2><div class="muted" style="font-size:12px">Discount offers are account-linked; mark them used only after payment.</div></div>
       <div><button class="ghost" onclick="loadOffers()">Refresh offers</button> <span id="offerStat" class="muted"></span></div>
     </div>
     <div style="overflow:auto;margin-top:12px"><table><thead><tr>
       <th>Ticket</th><th>Offer</th><th>Status</th><th>Discord</th><th>Expires</th><th>Bot DM</th><th></th>
     </tr></thead><tbody id="offerRows"></tbody></table></div>
   </div>
   <div class="card">
     <div class="rowf">
       <div><label>Product</label><select id="scope" onchange="syncTier()"><option value="aim">aimmaxxer</option><option value="om">optimizationmaxxing</option><option value="dm">discordmaxxer</option><option value="both">any (both)</option></select></div>
       <div id="tierField"><label>Discordmaxxer tier</label><select id="tier"><option value="3">MAXXER++ (3)</option><option value="2">MAXXER+ (2)</option><option value="1">MAXXER (1)</option></select></div>
       <div><label>Duration</label><select id="dur"><option value="lifetime">lifetime</option><option value="month">month</option><option value="week">week</option><option value="day">day</option><option value="3hr">3 hours</option></select></div>
       <div><label>Count</label><input id="count" type="number" value="1" min="1" max="100" style="width:70px"></div>
       <div style="flex:1;min-width:160px"><label>Label (who/why — optional)</label><input id="label" style="width:100%" placeholder="e.g. friend - twitch giveaway"></div>
       <div><button onclick="mint()">Mint</button></div>
     </div>
     <div id="mintOut"></div>
   </div>
   <div class="card">
     <div class="rowf" style="justify-content:space-between">
       <div style="flex:1;min-width:200px"><input id="filter" oninput="render();renderOffers()" placeholder="filter codes / offers / Discord user" style="width:100%"></div>
       <div class="rowf"><label class="archive-toggle"><input id="includeArchived" type="checkbox" onchange="load()"> Show removed</label> <button class="ghost" onclick="load()">Refresh</button> <span id="stat" class="muted">loading...</span> <button class="ghost" onclick="logout()">Lock</button></div>
     </div>
     <div class="ledger-scroll"><table id="ledgerTable"><thead><tr>
       <th>Code</th><th>Product</th><th>Tier</th><th>Duration</th><th>Status</th><th>Claimed by</th><th>Label</th><th>Minted</th><th>Actions</th>
     </tr></thead><tbody id="rows"></tbody></table></div>
   </div>
 </div>
</div>
<script>
var DATA=[];
var OFFERS=[];
function tok(){return localStorage.getItem('vipAdminToken')||'';}
function saveTok(){var v=document.getElementById('tokIn').value.trim();if(v){localStorage.setItem('vipAdminToken',v);boot();}}
function logout(){localStorage.removeItem('vipAdminToken');location.reload();}
var API_TIMEOUT_MS=15000;
function api(path,method,body){
  var controller=typeof AbortController==='function'?new AbortController():null;
  var timer=controller?setTimeout(function(){controller.abort();},API_TIMEOUT_MS):null;
  return fetch(path,{method:method||'GET',cache:'no-store',headers:{'authorization':'Bearer '+tok(),'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller?controller.signal:undefined})
    .then(function(r){return r.text().then(function(text){var j={};try{j=JSON.parse(text)||{};}catch(e){j={ok:false,error:'Invalid server response'};}j._status=r.status;return j;});})
    .catch(function(e){var timedOut=!!(e&&e.name==='AbortError');return {ok:false,error:timedOut?'Request timed out after 15 seconds.':'Network error: '+(e&&e.message||'request failed'),_network:true,_timeout:timedOut,_status:0};})
    .finally(function(){if(timer)clearTimeout(timer);});
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function fmtDate(ms){if(!ms)return '';var d=new Date(ms);return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});}
function copyTxt(t){navigator.clipboard.writeText(t);}
function tierApplies(scope){return scope==='dm'||scope==='both';}
function syncTier(){var field=document.getElementById('tierField');if(field)field.style.display=tierApplies(document.getElementById('scope').value)?'':'none';}
function mint(){
  var scope=document.getElementById('scope').value;
  var body={count:+document.getElementById('count').value,scope:scope,duration:document.getElementById('dur').value,label:document.getElementById('label').value};
  if(tierApplies(scope))body.tier=+document.getElementById('tier').value;
  document.getElementById('mintOut').innerHTML='<span class="muted">minting...</span>';
  api('/admin/mint','POST',body).then(function(j){
    if(!j.ok){document.getElementById('mintOut').innerHTML='<span style="color:var(--bad)">'+esc(j.error||'failed')+'</span>';if(j._status===401)logout();return;}
    var all=j.minted.map(function(m){return m.display;}).join('\\n');
    window._mintAll=all;
    var h='<div class="muted" style="margin-bottom:4px">Minted '+j.minted.length+' · <a href="#" onclick="copyTxt(window._mintAll);return false">copy all</a></div>';
    h+=j.minted.map(function(m){return '<span class="code" onclick="copyTxt(this.textContent)" title="click to copy">'+esc(m.display)+'</span>';}).join('');
    document.getElementById('mintOut').innerHTML=h;load();
  });
}
function revoke(code,val){api('/admin/revoke','POST',{code:code,revoked:val}).then(function(j){if(j.ok)load();else alert(j.error||'failed');});}
function removeCode(code){if(!confirm('Remove this key from the active ledger? It will stay permanently unusable, and its claim/audit record will be retained.'))return;api('/admin/remove','POST',{code:code,reason:'test/retired code'}).then(function(j){if(j.ok)load();else alert(j.error||'Remove failed');});}
function relabel(code){var cur='';for(var i=0;i<DATA.length;i++)if(DATA[i].code===code)cur=DATA[i].label;var v=prompt('Label for this code:',cur);if(v!==null)api('/admin/label','POST',{code:code,label:v}).then(function(j){if(j.ok)load();else alert(j.error||'failed');});}
function load(){
  document.getElementById('stat').textContent='loading...';
  var includeArchived=document.getElementById('includeArchived').checked;
  api('/admin/list'+(includeArchived?'?includeArchived=1':'')).then(function(j){
    if(!j.ok){document.getElementById('stat').textContent=j.error||'error';if(j._status===401)logout();return;}
    DATA=Array.isArray(j.rows)?j.rows:[];document.getElementById('stat').textContent=j.count+' codes';render();
  });
}
function loadOffers(){
  document.getElementById('offerStat').textContent='loading...';
  api('/admin/offers').then(function(j){
    if(!j.ok){document.getElementById('offerStat').textContent=j.error||'error';if(j._status===401)logout();return;}
    OFFERS=Array.isArray(j.rows)?j.rows:[];document.getElementById('offerStat').textContent=j.count+' offers';renderOffers();
  });
}
function offerAction(ticketId,action){
  var path=action==='redeem'?'/admin/offers/redeem':action==='revoke'?'/admin/offers/revoke':'/admin/offers/dm';
  if(action==='redeem'&&!confirm('Mark this discount used after payment?'))return;
  api(path,'POST',{ticketId:ticketId}).then(function(j){if(j.ok){loadOffers();}else alert(j.error||'failed');});
}
function renderOffers(){
  var f=(document.getElementById('filter').value||'').toLowerCase();
  var body='';
  OFFERS.forEach(function(r){
    var hay=(r.ticketId+' '+(r.username||'')+' '+(r.userId||'')+' '+r.rarity+' '+r.status).toLowerCase();
    if(f&&hay.indexOf(f)<0)return;
    var status=r.status==='redeemed'?'<span class="pill cl">used</span>':r.status==='revoked'?'<span class="pill rv">revoked</span>':r.status==='expired'?'<span class="pill rv">expired</span>':'<span class="pill un">available</span>';
    var actions='';
    if(r.status==='offered'&&!r.redeemedAt){actions+='<button class="ghost" onclick="offerAction(\\''+r.ticketId+'\\',\\'redeem\\')">mark used</button> ';}
    if(r.userId&&r.status==='offered'){actions+='<button class="ghost" onclick="offerAction(\\''+r.ticketId+'\\',\\'dm\\')">DM again</button> ';}
    if(r.status==='offered'){actions+='<button class="bad" onclick="offerAction(\\''+r.ticketId+'\\',\\'revoke\\')">revoke</button>';}
    body+='<tr>'+
      '<td class="mono">'+esc(r.ticketId)+'</td>'+
      '<td>'+esc((r.rarity||'').toUpperCase())+' · $'+esc(r.price)+' <span class="muted">('+esc(r.discountPercent)+'% off · save $'+esc(r.savings)+ ' · '+esc(r.chanceLabel||'')+')</span></td>'+
      '<td>'+status+'</td>'+
      '<td title="'+esc(r.userId||'')+'">'+esc(r.username||r.userId||'pending')+'</td>'+
      '<td class="muted">'+esc(fmtDate(r.expiresAt))+'</td>'+
      '<td class="muted">'+(r.dmSentAt?esc(fmtDate(r.dmSentAt)):'not sent')+'</td>'+
      '<td>'+actions+'</td></tr>';
  });
  document.getElementById('offerRows').innerHTML=body||'<tr><td colspan="7" class="muted" style="padding:18px">no offers match</td></tr>';
}
function render(){
  var f=(document.getElementById('filter').value||'').toLowerCase();
  var body='';
  DATA.forEach(function(r){
    var hay=(r.code+' '+r.label+' '+r.scope+' '+(r.claimed&&r.claimed.hwid||'')+' '+(r.claimed&&r.claimed.userId||'')).toLowerCase();
    if(f&&hay.indexOf(f)<0)return;
    var status=r.archived?'<span class="pill rv">removed</span>':(r.revoked?'<span class="pill rv">revoked</span>':(r.claimed&&r.canRemove?'<span class="pill rv">expired</span>':(r.claimed?'<span class="pill cl">claimed</span>':'<span class="pill un">unclaimed</span>')));
    var by='';
    if(r.claimed){var who=r.claimed.userId?('user '+r.claimed.userId):(r.claimed.hwid?(r.claimed.hwid.slice(0,10)+'…'):'?');var exp=r.claimed.expiresAt?(' · exp '+fmtDate(r.claimed.expiresAt)):'';by='<span title="'+esc((r.claimed.hwid||'')+' '+(r.claimed.userId||''))+'">'+esc(who)+'</span><span class="muted">'+esc(exp)+'</span>';}
    var act=r.archived?('<span class="muted">removed '+esc(fmtDate(r.archivedAt))+'</span>'):(r.revoked?('<button class="ghost" onclick="revoke(\\''+r.code+'\\',false)">unrevoke</button>'):('<button class="bad" onclick="revoke(\\''+r.code+'\\',true)">revoke</button>'));
    if(r.canRemove)act+=' <button class="bad" onclick="removeCode(\\''+r.code+'\\')">Remove</button>';
    body+='<tr>'
      +'<td class="mono" onclick="copyTxt(this.textContent)" title="click to copy" style="cursor:pointer">'+esc(r.display)+'</td>'
      +'<td><span class="scopep">'+esc(r.scope)+'</span></td>'
      +'<td>'+esc(r.tier==null?'':r.tier)+'</td>'
      +'<td>'+esc(r.duration)+'</td>'
      +'<td>'+status+'</td>'
      +'<td>'+by+'</td>'
      +'<td onclick="relabel(\\''+r.code+'\\')" title="click to edit" style="cursor:pointer">'+(r.label?esc(r.label):'<span class="muted">+ label</span>')+'</td>'
      +'<td class="muted">'+esc(fmtDate(r.mintedAt))+'</td>'
      +'<td>'+act+'</td>'
      +'</tr>';
  });
  document.getElementById('rows').innerHTML=body||'<tr><td colspan="9" class="muted" style="padding:18px">no codes match</td></tr>';
}
function boot(){document.getElementById('gate').style.display='none';document.getElementById('app').style.display='block';syncTier();load();loadOffers();}
if(tok())boot();else document.getElementById('gate').style.display='block';
</script>
</body></html>`;

const ADMIN_HTML_V2 = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#090812">
<title>Maxxtopia — License Control Plane</title>
<style>
:root{
  color-scheme:dark;
  --bg:#080710;
  --bg2:#100d1d;
  --panel:rgba(22,18,39,.88);
  --panel2:#17132a;
  --panel3:#0d0b18;
  --line:#2d2644;
  --line2:#40355d;
  --text:#f5f1ff;
  --muted:#aaa1c0;
  --faint:#756b8d;
  --purple:#a56bff;
  --cyan:#5cecff;
  --green:#5ee69b;
  --yellow:#ffd166;
  --red:#ff718b;
  --blue:#6da8ff;
  --shadow:0 18px 55px rgba(0,0,0,.3);
}
*{box-sizing:border-box}
html{min-width:320px;background:var(--bg)}
body{
  margin:0;
  min-height:100vh;
  color:var(--text);
  background:
    radial-gradient(900px 450px at 8% -10%,rgba(170,85,255,.18),transparent 65%),
    radial-gradient(700px 400px at 100% 0%,rgba(75,225,255,.10),transparent 64%),
    linear-gradient(145deg,#080710 0%,#0b0914 48%,#100c1c 100%);
  font:14px/1.5 Inter,Segoe UI,system-ui,-apple-system,sans-serif;
}
button,input,select{font:inherit}
button{border:0;cursor:pointer}
button:disabled{opacity:.55;cursor:wait}
a{color:var(--cyan)}
.hidden{display:none!important}
.topbar{
  position:sticky;top:0;z-index:10;
  display:flex;align-items:center;justify-content:space-between;gap:18px;
  min-height:72px;padding:12px clamp(16px,4vw,48px);
  background:rgba(9,8,18,.86);
  border-bottom:1px solid rgba(92,236,255,.15);
  box-shadow:0 10px 35px rgba(0,0,0,.2);
  backdrop-filter:blur(18px);
}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.brandmark{
  position:relative;width:46px;height:46px;display:grid;place-items:center;flex:none;
  overflow:hidden;border-radius:15px;
  background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(17,12,31,.96));
  border:1px solid rgba(255,255,255,.13);
  box-shadow:0 0 0 1px rgba(165,107,255,.17),0 10px 28px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.08);
}
.brandmark:before{
  content:"";position:absolute;inset:-16px;border-radius:50%;
  background:conic-gradient(from 210deg,#ff5aa8,#a56bff 32%,#5cecff 57%,#5ee69b 75%,#ffd166 88%,#ff5aa8);
  opacity:.23;filter:blur(12px);animation:logo-spin 12s linear infinite;
}
.brandmark:after{content:"";position:absolute;inset:6px;border:1px solid rgba(255,255,255,.12);border-radius:10px;opacity:.7}
.brandmark svg{position:relative;z-index:1;width:34px;height:34px;display:block}
@keyframes logo-spin{to{transform:rotate(360deg)}}
.brand-copy{display:grid;gap:1px;min-width:0}
.brand-copy strong{font-size:15px;letter-spacing:.15em;white-space:nowrap}
.brand-copy span{color:var(--muted);font-size:10px;letter-spacing:.16em;white-space:nowrap}
.top-actions{display:flex;align-items:center;gap:10px}
.server-chip,.lock-btn,.sync-btn,.ghost-btn,.primary-btn,.danger-btn,.quick-btn{
  border:1px solid var(--line2);border-radius:9px;padding:9px 12px;
  color:var(--text);background:rgba(28,23,49,.85);transition:.18s ease;
}
.server-chip{color:var(--green);font-size:11px;letter-spacing:.08em;white-space:nowrap}
.server-chip i{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green)}
.lock-btn:hover,.sync-btn:hover,.ghost-btn:hover,.quick-btn:hover{border-color:var(--cyan);background:#211b38}
.primary-btn{color:#120c1d;font-weight:800;border-color:transparent;background:linear-gradient(100deg,#ff68b4,#a56bff 48%,#5cecff)}
.primary-btn:hover{filter:brightness(1.1);box-shadow:0 0 22px rgba(165,107,255,.28)}
.danger-btn{color:#ffb3bf;border-color:#673047;background:#291322}
.danger-btn:hover{border-color:var(--red);background:#351526}
.page-shell{width:min(1500px,100%);margin:0 auto;padding:30px clamp(16px,4vw,48px) 60px}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:24px}
.eyebrow{color:var(--cyan);font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
h1,h2,h3,p{margin-top:0}
h1{margin-bottom:8px;font-size:clamp(27px,4vw,42px);line-height:1.08;letter-spacing:-.03em}
h2{margin-bottom:5px;font-size:18px;letter-spacing:-.01em}
h3{margin-bottom:4px;font-size:13px}
.page-head p,.card-head p,.muted{color:var(--muted)}
.page-head p{max-width:700px;margin:0}
.head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:flex-end}
.auto-refresh{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12px;white-space:nowrap}
.auto-refresh input{accent-color:var(--purple)}
.toast{
  position:fixed;right:20px;bottom:20px;z-index:30;max-width:min(420px,calc(100vw - 40px));
  padding:12px 15px;border:1px solid var(--line2);border-radius:11px;
  background:#171127;box-shadow:var(--shadow);color:var(--text);
}
.toast.good{border-color:rgba(94,230,155,.55)}.toast.bad{border-color:rgba(255,113,139,.65);color:#ffc3cc}
.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:18px}
.stat-card,.card{
  border:1px solid var(--line);border-radius:16px;background:var(--panel);
  box-shadow:var(--shadow);
}
.stat-card{position:relative;overflow:hidden;padding:17px 18px}
.stat-card:before{content:"";position:absolute;inset:0 0 auto;height:2px;background:var(--accent,var(--purple))}
.stat-card .stat-label{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--muted);font-size:11px;letter-spacing:.09em;text-transform:uppercase}
.stat-card .stat-value{display:block;margin-top:10px;font-size:31px;line-height:1;font-weight:800;letter-spacing:-.04em}
.stat-card .stat-note{display:block;margin-top:8px;color:var(--faint);font-size:11px}
.stat-card.green{--accent:var(--green)}.stat-card.yellow{--accent:var(--yellow)}.stat-card.red{--accent:var(--red)}.stat-card.blue{--accent:var(--blue)}.stat-card.purple{--accent:var(--purple)}
.grid-main{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.55fr);gap:18px;align-items:start}
.card{padding:20px}
.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;margin-bottom:17px}
.card-head p{margin:0;font-size:12px}
.card-kicker{display:flex;align-items:center;gap:7px;color:var(--purple);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.card-kicker:before{content:"";width:22px;height:2px;background:linear-gradient(90deg,#ff68b4,#5cecff);border-radius:2px}
.mint-card{overflow:hidden}
.mint-card:after{content:"";display:block;height:3px;margin:20px -20px -20px;background:linear-gradient(90deg,#ff5aa8,#a56bff,#5cecff,#5ee69b,#ffd166,#ff5aa8);background-size:220% 100%;animation:rainbow 8s linear infinite}
@keyframes rainbow{to{background-position:220% 0}}
.field-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}
.field{grid-column:span 3}.field.wide{grid-column:span 6}.field.full{grid-column:1/-1}
.field label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.field label em{color:var(--faint);font-style:normal;letter-spacing:0;text-transform:none;font-weight:500}
input,select{
  width:100%;min-height:40px;padding:9px 11px;
  color:var(--text);background:var(--panel3);border:1px solid var(--line);border-radius:9px;outline:0;
}
input::placeholder{color:#696078}
input:focus,select:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(92,236,255,.10)}
.field-action{display:flex;align-items:flex-end}.field-action button{width:100%;min-height:40px}
.preset-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px}
.preset-row span{color:var(--faint);font-size:11px;margin-right:2px}
.quick-btn{padding:6px 9px;color:var(--muted);font-size:11px}
.mint-output{margin-top:16px;min-height:0}
.mint-output:empty{display:none}
.output-box{padding:13px;border:1px solid rgba(94,230,155,.35);border-radius:11px;background:rgba(35,94,67,.12)}
.output-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;color:var(--green);font-size:12px;font-weight:800}
.output-codes{display:flex;flex-wrap:wrap;gap:7px}
.code-chip{padding:7px 9px;border:1px solid var(--line2);border-radius:7px;background:#0c0a15;color:#e9dcff;font:12px Consolas,monospace;cursor:pointer}
.code-chip:hover{border-color:var(--cyan);color:#fff}
.code-cell{display:flex;align-items:center;gap:8px;min-width:220px}
.code-link{display:inline-block;min-width:0;padding:0;color:var(--text);background:transparent;font:12px Consolas,monospace;text-align:left;white-space:nowrap}
.code-link:hover{color:#fff;text-decoration:underline;text-decoration-color:var(--cyan);text-underline-offset:3px}
.copy-btn{padding:5px 7px;border:1px solid var(--line2);border-radius:7px;background:var(--panel3);color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.04em}
.copy-btn:hover{border-color:var(--cyan);color:var(--text);background:#211b38}
.code-link:focus-visible,.copy-btn:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.side-stack{display:grid;gap:18px}
.guardrail{border-color:rgba(255,209,102,.27);background:linear-gradient(145deg,rgba(52,40,28,.55),rgba(22,18,39,.9))}
.guard-list{display:grid;gap:11px;margin:16px 0 0;padding:0;list-style:none}
.guard-list li{display:grid;grid-template-columns:25px 1fr;gap:9px;color:var(--muted);font-size:12px}
.guard-list b{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:rgba(255,209,102,.13);color:var(--yellow);font-size:12px}
.guard-list strong{display:block;margin-bottom:1px;color:var(--text);font-size:12px}
.offer-filter{max-width:230px}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:11px;background:rgba(8,7,16,.38)}
table{width:100%;min-width:1030px;border-collapse:collapse}
th,td{padding:12px 13px;text-align:left;border-bottom:1px solid rgba(45,38,68,.72);vertical-align:top}
th{position:sticky;top:0;z-index:1;background:#151126;color:var(--faint);font-size:10px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
tbody tr:hover{background:rgba(92,236,255,.035)}
tbody tr:last-child td{border-bottom:0}
.mono{font-family:Consolas,ui-monospace,monospace}
.clickable{cursor:pointer}.clickable:hover{color:var(--cyan)}
.scope-pill,.status-pill,.mini-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--line2);border-radius:999px;font-size:10px;font-weight:800;white-space:nowrap}
.scope-pill{color:#e6d6ff;background:rgba(165,107,255,.10)}
.scope-pill.aim{color:#d8b5ff;background:rgba(165,107,255,.13);border-color:rgba(165,107,255,.46)}
.scope-pill.om{color:#83f2b4;background:rgba(94,230,155,.11);border-color:rgba(94,230,155,.40)}
.scope-pill.dm{color:#8cc2ff;background:rgba(109,168,255,.12);border-color:rgba(109,168,255,.44)}
.scope-pill.both{color:#ffe08b;background:rgba(255,209,102,.12);border-color:rgba(255,209,102,.42)}
.product-row.product-aim td:first-child{border-left:3px solid #b16dff;padding-left:10px}
.product-row.product-om td:first-child{border-left:3px solid #5ee69b;padding-left:10px}
.product-row.product-dm td:first-child{border-left:3px solid #6da8ff;padding-left:10px}
.product-row.product-both td:first-child{border-left:3px solid #ffd166;padding-left:10px}
.product-key{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:11px}
.product-key span{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:10px;font-weight:700}
.product-key i{width:7px;height:7px;border-radius:50%;box-shadow:0 0 9px currentColor}
.product-key i.aim{color:#b16dff;background:#b16dff}.product-key i.om{color:#5ee69b;background:#5ee69b}.product-key i.dm{color:#6da8ff;background:#6da8ff}.product-key i.both{color:#ffd166;background:#ffd166}
.status-pill:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}
.status-pill.available{color:var(--green);background:rgba(94,230,155,.09);border-color:rgba(94,230,155,.32)}
.status-pill.claimed{color:var(--yellow);background:rgba(255,209,102,.09);border-color:rgba(255,209,102,.30)}
.status-pill.expired{color:#d5a1ff;background:rgba(165,107,255,.09);border-color:rgba(165,107,255,.32)}
.status-pill.reset{color:#ffbd68;background:rgba(255,189,104,.09);border-color:rgba(255,189,104,.32)}
.status-pill.revoked{color:var(--red);background:rgba(255,113,139,.09);border-color:rgba(255,113,139,.32)}
.status-pill.archived{color:var(--muted);background:rgba(170,161,192,.08);border-color:rgba(170,161,192,.28)}
.subline{display:block;margin-top:4px;color:var(--faint);font-size:11px}
.action-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.action-row button{padding:6px 8px;border-radius:7px;font-size:11px}
.filter-bar{display:grid;grid-template-columns:minmax(250px,1.8fr) repeat(4,minmax(125px,1fr));gap:9px;margin-bottom:10px}
.filter-bar .search{position:relative}
.filter-bar .search input{padding-left:35px}
.search-icon{position:absolute;left:12px;top:10px;color:var(--faint);pointer-events:none}
.filter-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.quick-filters{display:flex;gap:7px;flex-wrap:wrap}
.quick-filters button{padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--muted);font-size:11px}
.quick-filters button:hover,.quick-filters button.active{color:var(--text);border-color:var(--purple);background:rgba(165,107,255,.12)}
.ledger-meta{color:var(--muted);font-size:12px}
.pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:13px}
.pagination .page-buttons{display:flex;align-items:center;gap:7px}
.pagination button{min-width:32px;padding:7px 9px;border:1px solid var(--line);border-radius:7px;background:var(--panel2);color:var(--muted)}
.pagination button:hover:not(:disabled){border-color:var(--cyan);color:var(--text)}
.pagination button.current{border-color:var(--purple);color:#fff;background:rgba(165,107,255,.16)}
.empty{text-align:center!important;padding:28px!important;color:var(--muted)}
.auth-shell{display:grid;place-items:center;min-height:calc(100vh - 73px);padding:25px}
.auth-card{width:min(500px,100%);position:relative;overflow:hidden;padding:28px;border:1px solid var(--line);border-radius:18px;background:rgba(22,18,39,.9);box-shadow:var(--shadow)}
.auth-card:before{content:"";position:absolute;inset:0 0 auto;height:4px;background:linear-gradient(90deg,#ff5aa8,#a56bff,#5cecff,#5ee69b,#ffd166,#ff5aa8);background-size:220% 100%;animation:rainbow 8s linear infinite}
.auth-card h1{margin-top:9px;font-size:30px}
.auth-card p{color:var(--muted);font-size:13px}
.auth-label{display:block;margin:20px 0 7px;color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.token-row{display:flex;gap:8px}.token-row input{flex:1}
.auth-note{margin:12px 0 0;color:var(--faint);font-size:11px}
.error{margin-top:8px;color:#ff9dad;font-size:12px}
.mobile-hide{display:block}
@media(max-width:1120px){.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-main{grid-template-columns:1fr}.side-stack{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-bar{grid-template-columns:repeat(3,minmax(0,1fr))}.filter-bar .search{grid-column:1/-1}}
@media(max-width:700px){.topbar{padding:10px 14px}.server-chip{display:none}.brand-copy span{font-size:9px}.page-shell{padding:22px 13px 45px}.page-head{align-items:flex-start;flex-direction:column}.head-actions{justify-content:flex-start}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.stat-card:last-child{grid-column:1/-1}.side-stack{grid-template-columns:1fr}.field{grid-column:span 6}.field.wide{grid-column:1/-1}.filter-bar{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-bar .search{grid-column:1/-1}.pagination{align-items:flex-start;flex-direction:column}.mobile-hide{display:none}}
@media(max-width:430px){.field{grid-column:1/-1}.stats{gap:8px}.stat-card{padding:14px}.stat-card .stat-value{font-size:25px}.card{padding:15px}.mint-card:after{margin-left:-15px;margin-right:-15px;margin-bottom:-15px}}
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <div class="brandmark" aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        <defs>
          <linearGradient id="maxxLogoGradient" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ff68b4"/>
            <stop offset=".38" stop-color="#a56bff"/>
            <stop offset=".68" stop-color="#5cecff"/>
            <stop offset="1" stop-color="#5ee69b"/>
          </linearGradient>
          <filter id="maxxLogoGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect x="7" y="7" width="50" height="50" rx="16" fill="#0f0b1b" stroke="url(#maxxLogoGradient)" stroke-opacity=".45"/>
        <path d="M17 47V17h7.5L32 29.5 39.5 17H47v30h-7V28.8L32 42l-8-13.2V47z" fill="url(#maxxLogoGradient)" filter="url(#maxxLogoGlow)"/>
        <circle cx="51" cy="13" r="2.2" fill="#ffd166"/>
      </svg>
    </div>
    <div class="brand-copy"><strong>MAXXTOPIA</strong><span>LICENSE CONTROL PLANE</span></div>
  </div>
  <div class="top-actions">
    <span class="server-chip"><i></i>SERVER TIME VERIFIED</span>
    <button id="lockBtn" class="lock-btn hidden" data-action="lock">Lock</button>
  </div>
</header>

<main id="gate" class="auth-shell hidden">
  <section class="auth-card">
    <div class="eyebrow">Private operator access</div>
    <h1>Open the license ledger.</h1>
    <p>Manage codes, bindings, durations, offers, and product scope from one server-backed view.</p>
    <label class="auth-label" for="tokIn">Admin token</label>
    <div class="token-row">
      <input id="tokIn" type="password" autocomplete="off" placeholder="Paste ADMIN_TOKEN">
      <button id="unlockBtn" class="primary-btn" data-action="unlock">Unlock</button>
    </div>
    <div id="authError" class="error"></div>
    <div class="auth-note">The token is stored only in this browser's local storage. Locking removes it from this browser.</div>
  </section>
</main>

<main id="app" class="page-shell hidden">
  <section class="page-head">
    <div>
      <div class="eyebrow">Maxxtopia / operator console</div>
      <h1>License ledger, without the guesswork.</h1>
      <p>Mint and audit product access from the same server-authoritative record. Duration and claim state below come from the Worker metadata, including reconciled legacy codes.</p>
    </div>
    <div class="head-actions">
      <label class="auto-refresh"><input id="autoRefresh" type="checkbox" checked> refresh every 60s</label>
      <span id="syncText" class="muted">Not synced</span>
      <button class="sync-btn" data-action="refresh">Refresh</button>
    </div>
  </section>

  <section class="stats">
    <article class="stat-card purple"><div class="stat-label">All codes <span>Σ</span></div><strong id="sumTotal" class="stat-value">—</strong><span class="stat-note">Across every product scope</span></article>
    <article class="stat-card green"><div class="stat-label">Available <span>●</span></div><strong id="sumAvailable" class="stat-value">—</strong><span class="stat-note">Unclaimed and ready to assign</span></article>
    <article class="stat-card yellow"><div class="stat-label">Bound <span>◉</span></div><strong id="sumClaimed" class="stat-value">—</strong><span class="stat-note">Claimed to a user or machine</span></article>
    <article class="stat-card red"><div class="stat-label">Attention <span>!</span></div><strong id="sumAttention" class="stat-value">—</strong><span class="stat-note">Expired, reset, or revoked</span></article>
    <article class="stat-card blue"><div class="stat-label">Offers <span>✦</span></div><strong id="sumOffers" class="stat-value">—</strong><span class="stat-note">Discount offers in the system</span></article>
  </section>

  <section class="grid-main">
    <article class="card mint-card">
      <div class="card-head">
        <div><div class="card-kicker">Issue access</div><h2>Mint a new code</h2><p>Use presets for fast support, or set the exact product scope and duration.</p></div>
        <span class="mini-pill">server-issued</span>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="scope">Product scope <em>required</em></label>
          <select id="scope"><option value="aim">Aimmaxer</option><option value="om">Optimizationmaxxing</option><option value="dm">Discordmaxxer</option><option value="both">Any product</option></select>
        </div>
        <div id="tierField" class="field">
          <label for="tier">Discordmaxxer tier <em>DM only</em></label>
          <select id="tier"><option value="3">MAXXER++ (3)</option><option value="2">MAXXER+ (2)</option><option value="1">MAXXER (1)</option></select>
        </div>
        <div class="field">
          <label for="dur">Duration <em>legacy-safe</em></label>
          <select id="dur"><option value="lifetime">Lifetime</option><option value="month">Monthly</option><option value="week">Weekly</option><option value="day">Daily</option><option value="3hr">3 hours</option></select>
        </div>
        <div class="field">
          <label for="count">Quantity <em>1–100</em></label>
          <input id="count" type="number" inputmode="numeric" value="1" min="1" max="100">
        </div>
        <div class="field wide">
          <label for="label">Internal label <em>optional</em></label>
          <input id="label" maxlength="80" placeholder="e.g. fusion00094 / reseller batch / support replacement">
        </div>
        <div class="field field-action">
          <button id="mintBtn" class="primary-btn" data-action="mint">Mint codes</button>
        </div>
      </div>
      <div class="preset-row"><span>Quick presets:</span><button class="quick-btn" data-action="preset" data-scope="aim" data-dur="lifetime">Aim lifetime</button><button class="quick-btn" data-action="preset" data-scope="aim" data-dur="week">Aim week</button><button class="quick-btn" data-action="preset" data-scope="om" data-dur="lifetime">Optimization lifetime</button><button class="quick-btn" data-action="preset" data-scope="dm" data-dur="month">Discord monthly</button></div>
      <div id="mintOut" class="mint-output"></div>
    </article>

    <div class="side-stack">
      <article class="card guardrail">
        <div class="card-kicker">Operator guardrails</div>
        <h2>What the ledger protects</h2>
        <ul class="guard-list">
          <li><b>01</b><div><strong>One code, one claim</strong>HWID binding and server validation prevent local-clock extensions.</div></li>
          <li><b>02</b><div><strong>Product-aware metadata</strong>Tier controls are only meaningful for Discordmaxxer; other products stay tier-free.</div></li>
          <li><b>03</b><div><strong>Auditable support actions</strong>Revoke to stop access, or remove a test code from the active ledger while retaining its evidence.</div></li>
        </ul>
      </article>
      <article class="card">
        <div class="card-head"><div><div class="card-kicker">Discount queue</div><h2>First-time offers</h2><p>Mark an offer used only after payment is confirmed.</p></div><span id="offerStat" class="muted"></span></div>
        <input id="offerFilter" class="offer-filter" placeholder="Search tickets or Discord ID">
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Offer</th><th>Buyer</th><th>Status</th><th>Actions</th></tr></thead><tbody id="offerRows"></tbody></table></div>
      </article>
    </div>
  </section>


  <section class="card" style="margin-top:18px">
    <div class="card-head">
      <div><div class="card-kicker">Source of truth</div><h2>Code ledger</h2><p>Search by code, Discord ID, order, reseller, label, or source. Click a code or use Copy to copy the full value.</p><div class="product-key" aria-label="Product color key"><span><i class="aim"></i>Aimmaxer</span><span><i class="om"></i>Optimizationmaxxing</span><span><i class="dm"></i>Discordmaxxer</span><span><i class="both"></i>Any product</span></div></div>
      <div class="head-actions"><span id="ledgerStat" class="muted"></span><button class="ghost-btn" data-action="export">Export CSV</button></div>
    </div>
    <div class="filter-bar">
      <div class="search"><span class="search-icon">⌕</span><input id="filter" placeholder="Search the entire ledger"></div>
      <select id="statusFilter" aria-label="Status filter"><option value="">All statuses</option><option value="unclaimed">Available</option><option value="claimed">Claimed / bound</option><option value="expired">Expired</option><option value="reset / awaiting rebind">Reset / rebind</option><option value="revoked">Revoked</option><option value="archived">Removed / archived</option></select>
      <select id="productFilter" aria-label="Product filter"><option value="">All products</option><option value="aim">Aimmaxer</option><option value="om">Optimizationmaxxing</option><option value="dm">Discordmaxxer</option><option value="both">Any product</option></select>
      <select id="durationFilter" aria-label="Duration filter"><option value="">All durations</option><option value="lifetime">Lifetime</option><option value="month">Monthly</option><option value="week">Weekly</option><option value="day">Daily</option><option value="3hr">3 hours</option><option value="unknown">Legacy / unknown</option></select>
      <select id="sortFilter" aria-label="Sort order"><option value="duration">Duration groups · newest within each</option><option value="newest">Newest minted</option><option value="oldest">Oldest minted</option><option value="status">Attention first</option><option value="expiry">Soonest expiry</option></select>
    </div>
    <div class="filter-tools">
      <div class="quick-filters"><button data-action="quick" data-value="">All</button><button data-action="quick" data-value="unclaimed">Available</button><button data-action="quick" data-value="claimed">Claimed</button><button data-action="quick" data-value="attention">Attention</button></div>
      <div class="head-actions"><label class="auto-refresh"><input id="includeArchived" type="checkbox"> show removed</label><button class="ghost-btn" data-action="clear">Clear filters</button><select id="pageSize" aria-label="Rows per page" style="width:auto"><option value="25">25 rows</option><option value="50">50 rows</option><option value="100">100 rows</option><option value="250">250 rows</select></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Code</th><th>Product</th><th>DM tier</th><th>Duration</th><th>Status</th><th>Claimed / purchaser</th><th>Order / reseller</th><th>Label</th><th>Minted (server)</th><th>Actions</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="pagination"><span id="pageMeta" class="ledger-meta"></span><div id="pageButtons" class="page-buttons"></div></div>
    <div class="subline">The server decides claim status and expiry. Dates use an explicit month name and server-normalized timestamps. Machine IDs are intentionally masked here. Remove is for test/retired codes and keeps the audit record.</div>
  </section>
</main>
<div id="toast" class="toast hidden"></div>

<script>
var DATA=[];
var OFFERS=[];
var currentPage=1;
var refreshTimer=null;
var toastTimer=null;
var quickStatus='';
var attentionStatuses={'expired':true,'reset / awaiting rebind':true,'revoked':true};

function $(id){return document.getElementById(id);}
function tok(){return localStorage.getItem('vipAdminToken')||'';}
function scopeLabel(scope){return {aim:'Aimmaxer',om:'Optimizationmaxxing',dm:'Discordmaxxer',both:'Any product'}[scope]||scope||'Unknown';}
function scopeClass(scope){return scope==='aim'||scope==='om'||scope==='dm'||scope==='both'?scope:'unknown';}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function fmtDate(ms){if(ms==null||ms==='')return '';var value=Number(ms);if(!isFinite(value))return 'unknown';var d=new Date(value);return isNaN(d.getTime())?'unknown':d.toLocaleString('en-US',{month:'short',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}
function fmtExpiry(ms){return ms==null?'no expiry':fmtDate(ms);}
function maskHwid(h){h=String(h||'');return h.length>9?h.slice(0,4)+'…'+h.slice(-4):h?'bound machine':'not bound';}
function showToast(message,kind){clearTimeout(toastTimer);var el=$('toast');el.textContent=message;el.className='toast '+(kind||'');el.classList.remove('hidden');toastTimer=setTimeout(function(){el.classList.add('hidden');},4200);}
function copyText(value){value=String(value||'');if(!value)return;var done=function(){showToast('Copied to clipboard.','good');};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(value).then(done).catch(function(){fallbackCopy(value,done);});}else fallbackCopy(value,done);}
function fallbackCopy(value,done){var area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();try{document.execCommand('copy');}catch(e){}area.remove();done();}
var API_TIMEOUT_MS=15000;
function api(path,method,body){
  var controller=typeof AbortController==='function'?new AbortController():null;
  var timer=controller?setTimeout(function(){controller.abort();},API_TIMEOUT_MS):null;
  return fetch(path,{method:method||'GET',cache:'no-store',headers:{'authorization':'Bearer '+tok(),'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller?controller.signal:undefined})
    .then(function(res){return res.text().then(function(text){var json={};try{json=JSON.parse(text)||{};}catch(e){json={ok:false,error:'Invalid server response'};}json._status=res.status;return json;});})
    .catch(function(e){var timedOut=!!(e&&e.name==='AbortError');return {ok:false,error:timedOut?'Request timed out after 15 seconds.':'Network error: '+(e&&e.message||'request failed'),_network:true,_timeout:timedOut};})
    .finally(function(){if(timer)clearTimeout(timer);});
}
function authError(message){localStorage.removeItem('vipAdminToken');$('app').classList.add('hidden');$('lockBtn').classList.add('hidden');$('gate').classList.remove('hidden');$('authError').textContent=message||'Token rejected. Enter a valid admin token.';}
function unlock(){var value=$('tokIn').value.trim();if(!value){$('authError').textContent='Paste an admin token first.';return;}localStorage.setItem('vipAdminToken',value);$('authError').textContent='';boot();}
function logout(){localStorage.removeItem('vipAdminToken');$('app').classList.add('hidden');$('lockBtn').classList.add('hidden');$('gate').classList.remove('hidden');$('tokIn').value='';$('authError').textContent='';}
function setBusy(id,busy){var el=$(id);if(!el)return;el.disabled=busy;if(busy)el.dataset.oldText=el.textContent;el.textContent=busy?'Working…':(el.dataset.oldText||el.textContent);}
function statusHtml(status){
  if(status==='archived')return '<span class="status-pill archived">Removed</span>';
  if(status==='revoked')return '<span class="status-pill revoked">Revoked</span>';
  if(status==='expired')return '<span class="status-pill expired">Expired</span>';
  if(status==='reset / awaiting rebind')return '<span class="status-pill reset">Reset / rebind</span>';
  if(status==='claimed')return '<span class="status-pill claimed">Claimed / bound</span>';
  return '<span class="status-pill available">Available</span>';
}
function tierApplies(scope){return scope==='dm'||scope==='both';}
function syncTier(){$('tierField').classList.toggle('hidden',!tierApplies($('scope').value));}
function durationKey(row){return row.duration||'unknown';}
function durationRank(row){var ranks={'3hr':0,'day':1,'week':2,'month':3,'lifetime':4,'unknown':5};var key=durationKey(row);return Object.prototype.hasOwnProperty.call(ranks,key)?ranks[key]:99;}
function attentionCount(){var n=0;DATA.forEach(function(row){if(attentionStatuses[row.status])n++;});return n;}
function updateSummary(){
  var available=0,claimed=0;
  DATA.forEach(function(row){if(row.status==='unclaimed')available++;if(row.status==='claimed')claimed++;});
  $('sumTotal').textContent=DATA.length;
  $('sumAvailable').textContent=available;
  $('sumClaimed').textContent=claimed;
  $('sumAttention').textContent=attentionCount();
  $('sumOffers').textContent=OFFERS.length;
}
function setSync(text){$('syncText').textContent=text||'Not synced';}
function load(silent){
  setSync('Syncing ledger…');
  var path='/admin/list';if($('includeArchived')&&$('includeArchived').checked)path+='?includeArchived=1';
  return api(path).then(function(json){
    if(!json.ok){if(json._status===401){authError();return;}var message=json.error||'Unable to load ledger.';setSync(json._timeout?'Ledger request timed out':'Ledger error');showToast(message,'bad');return;}
    DATA=Array.isArray(json.rows)?json.rows:[];currentPage=1;updateSummary();render();setSync('Synced '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));if(!silent)showToast(DATA.length+' codes loaded.','good');
  });
}
function loadOffers(silent){
  $('offerStat').textContent='Syncing…';
  return api('/admin/offers').then(function(json){
    if(!json.ok){if(json._status===401){authError();return;}$('offerStat').textContent=json.error||'Unable to load offers';showToast(json.error||'Unable to load offers.','bad');return;}
    OFFERS=Array.isArray(json.rows)?json.rows:[];$('offerStat').textContent=OFFERS.length+' total';updateSummary();renderOffers();if(!silent)showToast(OFFERS.length+' offers loaded.','good');
  });
}
function refreshAll(){Promise.all([load(true),loadOffers(true)]);}
function setAutoRefresh(){clearInterval(refreshTimer);if($('autoRefresh').checked)refreshTimer=setInterval(function(){if(tok()&&!$('app').classList.contains('hidden'))refreshAll();},60000);}
function mint(){
  var count=Math.max(1,Math.min(100,Number($('count').value)||1));
  var scope=$('scope').value;
  var body={count:count,scope:scope,duration:$('dur').value,label:$('label').value.trim()};
  if(tierApplies(scope))body.tier=Number($('tier').value);
  $('mintOut').innerHTML='<div class="muted">Issuing '+count+' code'+(count===1?'':'s')+'…</div>';
  setBusy('mintBtn',true);
  api('/admin/mint','POST',body).then(function(json){
    if(!json.ok){$('mintOut').innerHTML='<div class="error">'+esc(json.error||'Mint failed.')+'</div>';if(json._status===401)authError();else showToast(json.error||'Mint failed.','bad');setBusy('mintBtn',false);return;}
    var minted=Array.isArray(json.minted)?json.minted:[];var all=minted.map(function(item){return item.display;}).join('\\n');window._mintAll=all;
    $('mintOut').innerHTML='<div class="output-box"><div class="output-head"><span>Issued '+minted.length+' code'+(minted.length===1?'':'s')+'</span><button class="quick-btn" data-action="copy-all">Copy all</button></div><div class="output-codes">'+minted.map(function(item){return '<button class="code-chip" data-action="copy" data-value="'+esc(item.display)+'">'+esc(item.display)+'</button>';}).join('')+'</div></div>';
    showToast(minted.length+' code'+(minted.length===1?'':'s')+' minted.','good');setBusy('mintBtn',false);refreshAll();
  });
}
function revoke(code,value){
  var promptText=value?'Revoke this code? It will stop validating.':'Restore this code?';
  if(!confirm(promptText))return;
  api('/admin/revoke','POST',{code:code,revoked:value}).then(function(json){if(json.ok){showToast(value?'Code revoked.':'Code restored.','good');load(true);}else{if(json._status===401)authError();else showToast(json.error||'Action failed.','bad');}});
}
function removeCode(code){
  if(!confirm('Remove this code from the active ledger? It will stay permanently unusable, and its audit record will be retained.'))return;
  api('/admin/remove','POST',{code:code,reason:'operator removed test/retired code'}).then(function(json){
    if(json.ok){showToast('Code removed from the active ledger.','good');load(true);}
    else{if(json._status===401)authError();else showToast(json.error||'Remove failed.','bad');}
  });
}
function relabel(code){
  var row=DATA.find(function(item){return item.code===code;});var value=prompt('Internal label for this code:',row&&row.label||'');
  if(value===null)return;
  api('/admin/label','POST',{code:code,label:value}).then(function(json){if(json.ok){showToast('Label saved.','good');load(true);}else{if(json._status===401)authError();else showToast(json.error||'Label update failed.','bad');}});
}
function offerAction(ticketId,action){
  if(action==='redeem'&&!confirm('Mark this offer used after payment has been confirmed?'))return;
  var path=action==='redeem'?'/admin/offers/redeem':action==='revoke'?'/admin/offers/revoke':'/admin/offers/dm';
  api(path,'POST',{ticketId:ticketId}).then(function(json){if(json.ok){showToast(action==='dm'?'DM queued.':action==='redeem'?'Offer marked used.':'Offer revoked.','good');loadOffers(true);}else{if(json._status===401)authError();else showToast(json.error||'Offer action failed.','bad');}});
}
function renderOffers(){
  var query=($('offerFilter').value||'').toLowerCase();var body='';
  OFFERS.forEach(function(row){
    var hay=(row.ticketId+' '+(row.username||'')+' '+(row.userId||'')+' '+(row.rarity||'')+' '+(row.status||'')).toLowerCase();
    if(query&&hay.indexOf(query)<0)return;
    var status=row.status==='redeemed'?'<span class="status-pill claimed">Used</span>':row.status==='revoked'?'<span class="status-pill revoked">Revoked</span>':row.status==='expired'?'<span class="status-pill expired">Expired</span>':'<span class="status-pill available">Available</span>';
    var actions='';
    if(row.status==='offered'&&!row.redeemedAt)actions+='<button class="ghost-btn" data-action="offer" data-offer-action="redeem" data-ticket="'+esc(row.ticketId)+'">Use</button> ';
    if(row.userId&&row.status==='offered')actions+='<button class="ghost-btn" data-action="offer" data-offer-action="dm" data-ticket="'+esc(row.ticketId)+'">DM</button> ';
    if(row.status==='offered')actions+='<button class="danger-btn" data-action="offer" data-offer-action="revoke" data-ticket="'+esc(row.ticketId)+'">Revoke</button>';
    body+='<tr><td><div class="mono">'+esc(row.ticketId)+'</div><span class="subline">'+esc((row.rarity||'').toUpperCase())+' · $'+esc(row.price)+' · '+esc(row.discountPercent)+'% off</span></td><td>'+esc(row.username||row.userId||'pending')+'<span class="subline">'+esc(row.userId||'')+'</span></td><td>'+status+'<span class="subline">expires '+esc(fmtDate(row.expiresAt)||'—')+'</span></td><td><div class="action-row">'+actions+'</div></td></tr>';
  });
  $('offerRows').innerHTML=body||'<tr><td colspan="4" class="empty">No offers match this search.</td></tr>';
}
function filteredRows(){
  var query=($('filter').value||'').trim().toLowerCase();
  var status=$('statusFilter').value;var product=$('productFilter').value;var duration=$('durationFilter').value;
  var rows=DATA.filter(function(row){
    var claim=row.claimed||{};
    var hay=(row.code+' '+row.display+' '+(row.label||'')+' '+(row.scope||'')+' '+(row.orderId||'')+' '+(row.resellerId||'')+' '+(row.purchaserDiscordId||'')+' '+(claim.userId||'')+' '+(row.source||'')).toLowerCase();
    if(query&&hay.indexOf(query)<0)return false;
    if(quickStatus==='attention'&&!attentionStatuses[row.status])return false;
    if(quickStatus&&quickStatus!=='attention'&&row.status!==quickStatus)return false;
    if(status&&quickStatus!=='attention'&&row.status!==status)return false;
    if(product&&row.scope!==product)return false;
    if(duration&&durationKey(row)!==duration)return false;
    return true;
  });
  var sort=$('sortFilter').value;
  rows.sort(function(a,b){
    if(sort==='duration')return durationRank(a)-durationRank(b)||Number(b.mintedAt||0)-Number(a.mintedAt||0)||String(a.code).localeCompare(String(b.code));
    if(sort==='oldest')return Number(a.mintedAt||0)-Number(b.mintedAt||0);
    if(sort==='status'){var rank=function(row){return row.status==='revoked'?0:row.status==='expired'?1:row.status==='reset / awaiting rebind'?2:row.status==='claimed'?3:4;};return rank(a)-rank(b)||Number(b.mintedAt||0)-Number(a.mintedAt||0);}
    if(sort==='expiry'){var ae=a.claimed&&a.claimed.expiresAt==null?Number.MAX_SAFE_INTEGER:Number(a.claimed&&a.claimed.expiresAt||0);var be=b.claimed&&b.claimed.expiresAt==null?Number.MAX_SAFE_INTEGER:Number(b.claimed&&b.claimed.expiresAt||0);return ae-be;}
    return Number(b.mintedAt||0)-Number(a.mintedAt||0);
  });
  return rows;
}
function claimHtml(row){
  var claim=row.claimed;var out='';
  if(claim&&claim.userId)out+='<div>Discord <span class="mono">'+esc(claim.userId)+'</span></div>';
  if(row.purchaserDiscordId&&(!claim||row.purchaserDiscordId!==claim.userId))out+='<div class="subline">purchased for <span class="mono">'+esc(row.purchaserDiscordId)+'</span></div>';
  if(claim&&claim.hwid)out+='<div class="subline">'+esc(maskHwid(claim.hwid))+'</div>';
  if(claim&&claim.expiresAt!=null)out+='<div class="subline">expires '+esc(fmtExpiry(claim.expiresAt))+'</div>';
  if(claim&&claim.founderNumber)out+='<div class="subline">founder #'+esc(claim.founderNumber)+'</div>';
  if(!out&&row.status==='unclaimed')out='<span class="muted">Not claimed</span>';
  if(!out&&row.status==='reset / awaiting rebind')out='<span class="muted">Awaiting rebind</span>';
  if(!out)out='<span class="muted">No claimant recorded</span>';
  return out;
}
function rowActions(row){
  if(row.archived)return '<div class="action-row"><span class="muted">Removed '+esc(fmtDate(row.archivedAt)||'')+'</span></div>';
  var html='<div class="action-row">';
  html+=row.revoked?'<button class="ghost-btn" data-action="revoke" data-value="false" data-code="'+esc(row.code)+'">Restore</button>':'<button class="danger-btn" data-action="revoke" data-value="true" data-code="'+esc(row.code)+'">Revoke</button>';
  if(row.status==='expired'||row.status==='unclaimed'||row.status==='revoked')html+='<button class="danger-btn" data-action="remove" data-code="'+esc(row.code)+'">Remove</button>';
  html+='</div>';return html;
}
function render(){
  var rows=filteredRows();var size=Number($('pageSize').value)||25;var pages=Math.max(1,Math.ceil(rows.length/size));if(currentPage>pages)currentPage=pages;
  var start=(currentPage-1)*size;var visible=rows.slice(start,start+size);var body='';
  visible.forEach(function(row){
    var claim=row.claimed||{};
    body+='<tr class="product-row product-'+scopeClass(row.scope)+'"><td><div class="code-cell"><button class="code-link mono clickable" data-action="copy" data-value="'+esc(row.display)+'" title="Click to copy">'+esc(row.display)+'</button><button class="copy-btn" data-action="copy" data-value="'+esc(row.display)+'" title="Copy full code">Copy</button></div></td><td><span class="scope-pill '+scopeClass(row.scope)+'">'+esc(scopeLabel(row.scope))+'</span></td><td>'+esc(row.tierRelevant?(row.tier==null?'not set':row.tier):'—')+'</td><td title="'+esc(row.durationSource||'')+'">'+esc(row.durationLabel||row.duration||'legacy / unknown')+'</td><td>'+statusHtml(row.status)+'</td><td>'+claimHtml(row)+'</td><td>'+(row.orderId?'<div class="mono">'+esc(row.orderId)+'</div>':'<span class="muted">—</span>')+(row.resellerId?'<span class="subline">reseller '+esc(row.resellerId)+'</span>':'')+'</td><td class="clickable" data-action="label" data-code="'+esc(row.code)+'">'+(row.label?esc(row.label):'<span class="muted">+ label</span>')+'</td><td class="muted">'+esc(fmtDate(row.mintedAt)||'—')+'</td><td>'+rowActions(row)+'</td></tr>';
  });
  $('rows').innerHTML=body||'<tr><td colspan="10" class="empty">No codes match the current filters.</td></tr>';
  $('ledgerStat').textContent=rows.length+' matching · '+DATA.length+' total';
  $('pageMeta').textContent=rows.length?'Showing '+(start+1)+'–'+Math.min(start+size,rows.length)+' of '+rows.length:'Nothing to show';
  var buttons='';var first=Math.max(1,currentPage-2);var last=Math.min(pages,first+4);first=Math.max(1,last-4);
  buttons+='<button data-action="page" data-page="'+(currentPage-1)+'" '+(currentPage===1?'disabled':'')+'>‹</button>';
  for(var page=first;page<=last;page++)buttons+='<button class="'+(page===currentPage?'current':'')+'" data-action="page" data-page="'+page+'">'+page+'</button>';
  buttons+='<button data-action="page" data-page="'+(currentPage+1)+'" '+(currentPage===pages?'disabled':'')+'>›</button>';
  $('pageButtons').innerHTML=buttons;
}
function clearFilters(){quickStatus='';$('filter').value='';$('statusFilter').value='';$('productFilter').value='';$('durationFilter').value='';$('sortFilter').value='duration';currentPage=1;render();}
function exportCsv(){
  var rows=filteredRows();var headers=['code','product','tier','duration','status','claimed_discord_id','purchaser_discord_id','expires_at','order_id','reseller_id','label','minted_at','archived_at'];
  var lines=[headers.join(',')];
  rows.forEach(function(row){var claim=row.claimed||{};var values=[row.display,scopeLabel(row.scope),row.tierRelevant?(row.tier==null?'':row.tier):'',row.durationLabel||row.duration||'legacy / unknown',row.status,claim.userId||'',row.purchaserDiscordId||'',claim.expiresAt==null?'':new Date(claim.expiresAt).toISOString(),row.orderId||'',row.resellerId||'',row.label||'',row.mintedAt==null?'':new Date(row.mintedAt).toISOString(),row.archivedAt==null?'':new Date(row.archivedAt).toISOString()];lines.push(values.map(function(value){return '"'+String(value).replace(/"/g,'""')+'"';}).join(','));});
  var blob=new Blob([lines.join('\\n')],{type:'text/csv;charset=utf-8'});var url=URL.createObjectURL(blob);var link=document.createElement('a');link.href=url;link.download='maxxtopia-license-ledger.csv';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);showToast('CSV exported for '+rows.length+' matching codes.','good');
}
function applyPreset(scope,dur){$('scope').value=scope;$('dur').value=dur;syncTier();$('scope').focus();}
function boot(){
  if(!tok()){$('gate').classList.remove('hidden');$('app').classList.add('hidden');$('lockBtn').classList.add('hidden');return;}
  $('gate').classList.add('hidden');$('app').classList.remove('hidden');$('lockBtn').classList.remove('hidden');syncTier();setAutoRefresh();load();loadOffers();
}
document.addEventListener('click',function(event){
  var button=event.target.closest('[data-action]');if(!button)return;
  var action=button.dataset.action;
  if(action==='unlock')unlock();
  else if(action==='lock')logout();
  else if(action==='refresh')refreshAll();
  else if(action==='mint')mint();
  else if(action==='copy')copyText(button.dataset.value);
  else if(action==='copy-all')copyText(window._mintAll||'');
  else if(action==='preset')applyPreset(button.dataset.scope,button.dataset.dur);
  else if(action==='clear')clearFilters();
  else if(action==='page'){currentPage=Math.max(1,Number(button.dataset.page)||1);render();}
  else if(action==='revoke')revoke(button.dataset.code,button.dataset.value==='true');
  else if(action==='remove')removeCode(button.dataset.code);
  else if(action==='label')relabel(button.dataset.code);
  else if(action==='offer')offerAction(button.dataset.ticket,button.dataset.offerAction);
  else if(action==='quick'){quickStatus=button.dataset.value||'';$('statusFilter').value=quickStatus==='attention'?'':quickStatus;currentPage=1;render();}
});
['filter','productFilter','durationFilter','sortFilter','pageSize'].forEach(function(id){$(id).addEventListener(id==='filter'?'input':'change',function(){currentPage=1;render();});});
$('statusFilter').addEventListener('change',function(){quickStatus='';currentPage=1;render();});
$('includeArchived').addEventListener('change',function(){currentPage=1;load(true);});
$('offerFilter').addEventListener('input',renderOffers);
$('scope').addEventListener('change',syncTier);
$('tokIn').addEventListener('keydown',function(event){if(event.key==='Enter')unlock();});
if(tok())boot();else $('gate').classList.remove('hidden');
</script>
</body>
</html>`;
