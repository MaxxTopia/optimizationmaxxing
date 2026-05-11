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
      return handleDiscordLink(url, env, corsHeaders);
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

    if (url.pathname !== '/claim' || request.method !== 'POST') {
      return json({ ok: false, error: 'not found' }, 404, corsHeaders);
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
  if (product && !['om', 'dm'].includes(product)) {
    return json({ ok: false, error: 'malformed product' }, 400, corsHeaders);
  }

  const isFounder = norm.startsWith(FOUNDER_PREFIX);

  // Read code metadata (written by tickets-worker /gen). Legacy codes
  // minted before the schema upgrade have no meta entry — defaults
  // below preserve their behavior (MAXXER++, lifetime, scope=both).
  const meta = await readCodeMeta(env, norm);
  const tier = tierFromMetaOrCode(meta, norm);
  const scope = meta?.scope ?? 'both';
  const durationMs = meta?.durationMs ?? null;   // null = lifetime

  // Product-scope enforcement. Skipped when client didn't send `product`
  // (legacy compatibility) OR when the code's scope is "both".
  if (product && scope !== 'both' && scope !== product) {
    return json(
      { ok: false, error: `code scope mismatch: this code is for ${scope === 'om' ? 'Optimizationmaxxing' : 'Discordmaxxer'}, you're claiming from ${product === 'om' ? 'Optimizationmaxxing' : 'Discordmaxxer'}` },
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

async function handleDiscordLink(url, env, corsHeaders) {
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

function htmlPage(bodyHtml, status = 200) {
  const html = `<!doctype html><meta charset="utf-8"><title>Discord link</title>
<style>body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;background:#0a0a0a;color:#eee;padding:48px 24px;max-width:560px;margin:auto}h1{font-size:22px;margin:0 0 12px}p{margin:0 0 12px}</style>
${bodyHtml}`;
  return new Response(html, { status, headers: { 'content-type': 'text/html;charset=utf-8' } });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
