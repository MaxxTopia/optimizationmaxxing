/**
 * optmaxxing-vip — first-claim-wins ledger for VIP redemption codes,
 * shared between optimizationmaxxing and discordmaxxer.
 *
 * v4 (2026-05-11):
 *   - New POST /profile endpoint = user-set profile flair (banner URL,
 *     animated avatar URL, theme colors) for discordmaxxer's Channel E/F/G
 *     identity layer. Auth = claimCode + userId pair must match a stored
 *     claim record. Writes to `profile:<userId>` KV namespace. Invalidates
 *     roster memo so /roster picks up the change within ~5 min server cache
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
 *   - Codes prefixed `FOUND` get a sequential founder number 1-33
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
const OFFER_TIERS = [
  { rarity: 'gold', chance: 70, price: 99 },
  { rarity: 'emerald', chance: 24, price: 77 },
  { rarity: 'diamond', chance: 6, price: 69 },
];

// Profile-flair validation. URLs must be https:// and ≤256 chars; viewer
// plugin HEAD-checks Content-Length at render time to enforce file-size caps.
// Colors must be lowercase #RRGGBB.
const PROFILE_URL_RE = /^https:\/\/[^\s]{1,250}$/;
const PROFILE_COLOR_RE = /^#[0-9a-f]{6}$/i;
const PROFILE_KV_PREFIX = "profile:";

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

// Per-tier gating for profile flair fields. Worker-side enforcement so
// client-side gating can't be bypassed by editing the plugin's JS.
const PROFILE_FIELD_MIN_TIER = {
  bannerUrl: TIER_MAXXER,
  avatarAnimatedUrl: TIER_MAXXER_PLUS,
  themeColorPrimary: TIER_MAXXER_PLUS_PLUS,
  themeColorSecondary: TIER_MAXXER_PLUS_PLUS,
};

const ROSTER_CACHE_TTL_SEC = 300; // 5 minutes
let rosterMemoCache = null;
let rosterMemoCachedAt = 0;

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const url = new URL(request.url);

    if (url.pathname === '/roster' && request.method === 'GET') {
      return handleRoster(env, corsHeaders);
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
      return handleProfileUpdate(body, env, corsHeaders);
    }

    // ---- Admin dashboard: one bookmarkable page to mint/list/revoke codes
    // across all products. The HTML page is public (useless without the
    // token); every /admin/* API call requires Bearer ADMIN_TOKEN. ----
    if (url.pathname === '/admin' && request.method === 'GET') {
      return new Response(ADMIN_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
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
  // minted before the schema upgrade have no meta entry — defaults
  // below preserve their behavior (MAXXER++, lifetime, scope=both).
  const meta = await readCodeMeta(env, norm);
  // Admin-revoked codes can't be claimed (the dashboard sets meta.revoked).
  if (meta && meta.revoked) {
    return json({ ok: false, error: 'this code has been revoked' }, 403, corsHeaders);
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
    parsed.tier ??= tier;
    parsed.claimedAt ??= Date.now();
    await env.VIP_CLAIMS.put(
      key,
      JSON.stringify(parsed),
      { metadata: { claimedAt: parsed.claimedAt, founderNumber: parsed.founderNumber ?? null, expiresAt: parsed.expiresAt ?? null } },
    );
    rosterMemoCache = null;
    if (parsed.userId) {
      ctx.waitUntil(grantDiscordRoles(env, parsed.userId, parsed.tier ?? tier));
    }
  }

  return json(
    {
      ok: true,
      status: 'idempotent',
      boundHwid: parsed.hwid,
      tier: parsed.tier ?? tier,
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
  const record = {
    version: 1,
    session,
    status: 'pending',
    ticketId: `OMAX-${genCode()}`,
    rarity: tier.rarity,
    chanceLabel: `${tier.chance}% pull`,
    price: tier.price,
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
  return {
    version: 1,
    status: 'offered',
    ticketId: sessionRecord.ticketId,
    rarity: sessionRecord.rarity,
    chanceLabel: sessionRecord.chanceLabel,
    price: sessionRecord.price,
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
  return json({
    ok: true,
    status,
    ticketId: record.ticketId,
    rarity: record.rarity,
    chanceLabel: record.chanceLabel,
    price: record.price,
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
  return htmlPage(
    `<h1>MAXX VIP offer</h1>` +
      `<p><b>${escapeHtml(offer.rarity.toUpperCase())}</b> · lifetime VIP for <b>$${escapeHtml(String(offer.price))}</b> instead of $115.</p>` +
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
  return (
    '**MAXXTOPIA — your first-time VIP offer**\n\n' +
    `You have a **${offer.rarity.toUpperCase()}** limited-time offer: lifetime VIP for **$${offer.price}** instead of $115.\n` +
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
 *      'founder' — founder maps to MAXXER++)
 *   2. Founder prefix → MAXXER++ (founders always top-tier underneath)
 *   3. First-char prefix: '1' → MAXXER, '2' → MAXXER+, '3' → MAXXER++
 *   4. Default → MAXXER++ (backwards compat with pre-prefix random codes)
 */
function tierFromMetaOrCode(meta, normCode) {
  const t = meta?.tier;
  if (t === 'maxxer') return TIER_MAXXER;
  if (t === 'maxxerplus') return TIER_MAXXER_PLUS;
  if (t === 'maxxerplusplus' || t === 'founder') return TIER_MAXXER_PLUS_PLUS;
  if (normCode.startsWith(FOUNDER_PREFIX)) return TIER_MAXXER_PLUS_PLUS;
  const first = normCode[0];
  if (first === '1') return TIER_MAXXER;
  if (first === '2') return TIER_MAXXER_PLUS;
  if (first === '3') return TIER_MAXXER_PLUS_PLUS;
  return TIER_MAXXER_PLUS_PLUS;
}

/**
 * POST /profile — user updates their custom profile flair (banner URL,
 * animated avatar URL, theme colors). Auth = claimCode + userId must match
 * a stored claim record. Per-field tier gating enforced server-side.
 *
 * Body: { userId, claimCode, profile: { bannerUrl?, avatarAnimatedUrl?,
 *         themeColorPrimary?, themeColorSecondary? } }
 *
 * To clear a field, send it as an empty string or omit it AND set
 * `replace: true` to overwrite the stored record. Default behavior merges
 * with the existing record (so a partial update only changes the supplied
 * fields). To delete the entire flair record, send `{ replace: true,
 * profile: {} }`.
 */
async function handleProfileUpdate(body, env, corsHeaders) {
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const claimCode = typeof body.claimCode === 'string' ? body.claimCode : '';
  const profile = body.profile && typeof body.profile === 'object' ? body.profile : null;
  const replace = body.replace === true;

  if (!ALLOWED_USER_ID_RE.test(userId)) {
    return json({ ok: false, error: 'malformed userId' }, 400, corsHeaders);
  }
  const normCode = normalizeCode(claimCode);
  if (!ALLOWED_CODE_RE.test(normCode)) {
    return json({ ok: false, error: 'malformed claimCode' }, 400, corsHeaders);
  }
  if (!profile) {
    return json({ ok: false, error: 'missing profile object' }, 400, corsHeaders);
  }

  // Auth check: claim must exist AND must be bound to this userId. This is
  // the entire authorization model — the claim code is the user's secret.
  const claimRaw = await env.VIP_CLAIMS.get(`claim:${normCode}`);
  if (!claimRaw) {
    return json({ ok: false, error: 'unknown claimCode' }, 401, corsHeaders);
  }
  const parsed = parseClaim(claimRaw);
  if (parsed.userId !== userId) {
    return json({ ok: false, error: 'claimCode does not match userId' }, 401, corsHeaders);
  }
  const tier = parsed.tier ?? TIER_MAXXER_PLUS_PLUS;

  // Validate + tier-gate each provided field. Reject the whole request on
  // the first violation — clearer feedback than partial accept.
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
    }
    if (field === 'themeColorPrimary' || field === 'themeColorSecondary') {
      if (!PROFILE_COLOR_RE.test(value)) {
        return json({ ok: false, error: `${field} must be #RRGGBB hex` }, 400, corsHeaders);
      }
    }
    validated[field] = value;
  }

  const profileKey = `${PROFILE_KV_PREFIX}${userId}`;
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
    const existingRaw = await env.VIP_CLAIMS.get(profileKey);
    let existing = {};
    if (existingRaw) {
      try { existing = JSON.parse(existingRaw); } catch (_) { existing = {}; }
    }
    final = { ...existing };
    for (const [k, v] of Object.entries(validated)) {
      if (v === '') delete final[k];
      else final[k] = v;
    }
  }

  // Drop the whole record if no flair remains — keeps KV tidy.
  if (Object.keys(final).filter(k => k !== 'updatedAt').length === 0) {
    await env.VIP_CLAIMS.delete(profileKey);
  } else {
    final.updatedAt = Date.now();
    await env.VIP_CLAIMS.put(profileKey, JSON.stringify(final));
  }

  // Invalidate roster memo so the next /roster GET sees the new flair.
  rosterMemoCache = null;

  return json({ ok: true, profile: final }, 200, corsHeaders);
}

async function handleRoster(env, corsHeaders) {
  const now = Date.now();
  if (rosterMemoCache && now - rosterMemoCachedAt < ROSTER_CACHE_TTL_SEC * 1000) {
    return new Response(JSON.stringify(rosterMemoCache), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${ROSTER_CACHE_TTL_SEC}`,
        ...corsHeaders,
      },
    });
  }

  // List all claim:* keys + load each value. KV list is paginated; iterate
  // until done. For 33 founders + a few hundred MAXXER++ codes the total
  // count stays well under the 1000-key page size for a long time.
  //
  // Output shape matches discordmaxxer's plugins/_dm-shared/roster.ts:
  //   { version, issuedAt, users: { [userId]: RosterEntry } }
  // where RosterEntry = { tier, via?, grantedAt?, expiresAt?, founderNumber?, profile? }.
  const users = {};
  let cursor;
  do {
    const page = await env.VIP_CLAIMS.list({ prefix: 'claim:', cursor, limit: 1000 });
    for (const key of page.keys) {
      const raw = await env.VIP_CLAIMS.get(key.name);
      if (!raw) continue;
      const parsed = parseClaim(raw);
      // Only expose entries that opted in by sending their userId.
      // Pre-2026-05-10 claims have no userId and stay private.
      if (!parsed.userId) continue;
      const entry = {
        tier: parsed.tier ?? TIER_MAXXER_PLUS_PLUS,
        via: parsed.founderNumber ? 'founder' : 'subscription',
      };
      if (parsed.claimedAt) entry.grantedAt = new Date(parsed.claimedAt).toISOString();
      if (parsed.founderNumber) entry.founderNumber = parsed.founderNumber;
      users[parsed.userId] = entry;
    }
    cursor = page.cursor;
    if (page.list_complete) break;
  } while (cursor);

  // Merge profile flair (banner / animated avatar / theme colors) onto roster
  // entries. profile:<userId> KV is written by the /profile POST endpoint.
  // Only users with a profile record AND a claim record get the flair merge —
  // a stale profile record for a deleted/expired claim is silently dropped.
  cursor = undefined;
  do {
    const page = await env.VIP_CLAIMS.list({ prefix: PROFILE_KV_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      const userId = key.name.slice(PROFILE_KV_PREFIX.length);
      if (!users[userId]) continue;
      const raw = await env.VIP_CLAIMS.get(key.name);
      if (!raw) continue;
      try {
        const profile = JSON.parse(raw);
        // Whitelist the fields we'll serve so stale records can't smuggle
        // new keys through. Drop empty strings — the client treats missing
        // fields as "no flair set."
        const cleaned = {};
        if (typeof profile.bannerUrl === 'string' && profile.bannerUrl) cleaned.bannerUrl = profile.bannerUrl;
        if (typeof profile.avatarAnimatedUrl === 'string' && profile.avatarAnimatedUrl) cleaned.avatarAnimatedUrl = profile.avatarAnimatedUrl;
        if (typeof profile.themeColorPrimary === 'string' && profile.themeColorPrimary) cleaned.themeColorPrimary = profile.themeColorPrimary;
        if (typeof profile.themeColorSecondary === 'string' && profile.themeColorSecondary) cleaned.themeColorSecondary = profile.themeColorSecondary;
        if (Object.keys(cleaned).length) users[userId].profile = cleaned;
      } catch (_) {
        // Corrupt profile record — skip silently, fall through to no flair.
      }
    }
    cursor = page.cursor;
    if (page.list_complete) break;
  } while (cursor);

  const payload = {
    version: 2,
    issuedAt: new Date(now).toISOString(),
    users,
  };

  rosterMemoCache = payload;
  rosterMemoCachedAt = now;

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ROSTER_CACHE_TTL_SEC}`,
      ...corsHeaders,
    },
  });
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
  const tier = matchedClaim.parsed.tier ?? TIER_MAXXER_PLUS_PLUS;
  if (!matchedClaim.parsed.userId) {
    matchedClaim.parsed.userId = userId;
    matchedClaim.parsed.tier = tier;
    matchedClaim.parsed.claimedAt ??= Date.now();
    await env.VIP_CLAIMS.put(matchedClaim.key, JSON.stringify(matchedClaim.parsed));
    rosterMemoCache = null;
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
    let cursor;
    do {
      const res = await env.VIP_CLAIMS.list({ prefix: 'meta:', cursor });
      for (const k of res.keys) {
        const code = k.name.slice(5);
        let meta = {};
        try { meta = JSON.parse(await env.VIP_CLAIMS.get(k.name)) || {}; } catch (e) {}
        let claim = null;
        const raw = await env.VIP_CLAIMS.get('claim:' + code);
        if (raw) {
          try { claim = JSON.parse(raw); } catch (e) { claim = { hwid: raw }; }
        }
        rows.push({
          code,
          display: displayCode(code, meta.scope || 'both'),
          scope: meta.scope || 'both',
          tier: meta.tier ?? null,
          duration: meta.durationKey || (meta.durationMs ? '?' : 'lifetime'),
          mintedAt: meta.mintedAt || null,
          label: meta.label || '',
          revoked: !!meta.revoked,
          claimed: claim ? {
            claimedAt: claim.claimedAt || null,
            hwid: claim.hwid || null,
            userId: claim.userId || null,
            expiresAt: claim.expiresAt || null,
            founderNumber: claim.founderNumber || null,
          } : null,
        });
      }
      cursor = res.list_complete ? null : res.cursor;
    } while (cursor);
    rows.sort((a, b) => (b.mintedAt || 0) - (a.mintedAt || 0));
    return json({ ok: true, rows, count: rows.length }, 200, corsHeaders);
  }

  // GET /admin/offers — first-time Tune Now offers, kept separate from paid
  // activation codes. This is the source Diggy checks before honoring a
  // discount; an offer never grants VIP automatically.
  if (path === '/admin/offers' && request.method === 'GET') {
    const rows = [];
    let cursor;
    do {
      const page = await env.VIP_CLAIMS.list({ prefix: OFFER_TICKET_PREFIX, cursor, limit: 1000 });
      for (const key of page.keys) {
        const offer = parseJsonRecord(await env.VIP_CLAIMS.get(key.name));
        if (!offer) continue;
        rows.push({
          ticketId: offer.ticketId,
          rarity: offer.rarity,
          price: offer.price,
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

  // POST /admin/revoke {code, revoked?}  -> toggle meta.revoked
  if (path === '/admin/revoke' && request.method === 'POST') {
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
    meta.revoked = b.revoked === false ? false : true;
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
 .wrap{max-width:1100px;margin:0 auto;padding:22px}
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
       <div><label>Product</label><select id="scope"><option value="aim">aimmaxxer</option><option value="om">optimizationmaxxing</option><option value="dm">discordmaxxer</option><option value="both">any (both)</option></select></div>
       <div><label>Tier</label><select id="tier"><option value="3">MAXXER++ (3)</option><option value="2">MAXXER+ (2)</option><option value="1">MAXXER (1)</option></select></div>
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
       <div><button class="ghost" onclick="load()">Refresh</button> <span id="stat" class="muted"></span> <button class="ghost" onclick="logout()">Lock</button></div>
     </div>
     <div style="overflow:auto;margin-top:12px"><table><thead><tr>
       <th>Code</th><th>Product</th><th>Tier</th><th>Duration</th><th>Status</th><th>Claimed by</th><th>Label</th><th>Minted</th><th></th>
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
function api(path,method,body){return fetch(path,{method:method||'GET',headers:{'authorization':'Bearer '+tok(),'content-type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){j._status=r.status;return j;});});}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function fmtDate(ms){if(!ms)return '';var d=new Date(ms);return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});}
function copyTxt(t){navigator.clipboard.writeText(t);}
function mint(){
  var body={count:+document.getElementById('count').value,scope:document.getElementById('scope').value,tier:+document.getElementById('tier').value,duration:document.getElementById('dur').value,label:document.getElementById('label').value};
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
function relabel(code){var cur='';for(var i=0;i<DATA.length;i++)if(DATA[i].code===code)cur=DATA[i].label;var v=prompt('Label for this code:',cur);if(v!==null)api('/admin/label','POST',{code:code,label:v}).then(function(j){if(j.ok)load();else alert(j.error||'failed');});}
function load(){
  document.getElementById('stat').textContent='loading...';
  api('/admin/list').then(function(j){
    if(!j.ok){document.getElementById('stat').textContent=j.error||'error';if(j._status===401)logout();return;}
    DATA=j.rows;document.getElementById('stat').textContent=j.count+' codes';render();
  });
}
function loadOffers(){
  document.getElementById('offerStat').textContent='loading...';
  api('/admin/offers').then(function(j){
    if(!j.ok){document.getElementById('offerStat').textContent=j.error||'error';if(j._status===401)logout();return;}
    OFFERS=j.rows;document.getElementById('offerStat').textContent=j.count+' offers';renderOffers();
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
      '<td>'+esc((r.rarity||'').toUpperCase())+' · $'+esc(r.price)+' <span class="muted">('+esc(r.chanceLabel||'')+')</span></td>'+
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
    var status=r.revoked?'<span class="pill rv">revoked</span>':(r.claimed?'<span class="pill cl">claimed</span>':'<span class="pill un">unclaimed</span>');
    var by='';
    if(r.claimed){var who=r.claimed.userId?('user '+r.claimed.userId):(r.claimed.hwid?(r.claimed.hwid.slice(0,10)+'…'):'?');var exp=r.claimed.expiresAt?(' · exp '+fmtDate(r.claimed.expiresAt)):'';by='<span title="'+esc((r.claimed.hwid||'')+' '+(r.claimed.userId||''))+'">'+esc(who)+'</span><span class="muted">'+esc(exp)+'</span>';}
    var act=r.revoked?('<button class="ghost" onclick="revoke(\\''+r.code+'\\',false)">unrevoke</button>'):('<button class="bad" onclick="revoke(\\''+r.code+'\\',true)">revoke</button>');
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
function boot(){document.getElementById('gate').style.display='none';document.getElementById('app').style.display='block';load();loadOffers();}
if(tok())boot();else document.getElementById('gate').style.display='block';
</script>
</body></html>`;
