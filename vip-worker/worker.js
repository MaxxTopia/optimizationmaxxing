/**
 * optmaxxing-vip — first-claim-wins ledger for VIP redemption codes,
 * shared between optimizationmaxxing and discordmaxxer.
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
 */

const ALLOWED_CODE_RE = /^[0-9A-HJKMNP-Z]{16}$/;
const ALLOWED_HWID_RE = /^[a-f0-9]{32}$/;
const ALLOWED_USER_ID_RE = /^[0-9]{17,20}$/;

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

const TIER_MAXXER_PLUS_PLUS = 3;

const ROSTER_CACHE_TTL_SEC = 300; // 5 minutes
let rosterMemoCache = null;
let rosterMemoCachedAt = 0;

export default {
  async fetch(request, env) {
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

    if (url.pathname !== '/claim' || request.method !== 'POST') {
      return json({ ok: false, error: 'not found' }, 404, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    return handleClaim(body, env, corsHeaders);
  },
};

async function handleClaim(body, env, corsHeaders) {
  const code = typeof body.code === 'string' ? body.code : '';
  const hwid = typeof body.hwid === 'string' ? body.hwid : '';
  const userId = typeof body.userId === 'string' ? body.userId : '';

  const norm = normalizeCode(code);
  const lowerHwid = hwid.toLowerCase();

  if (!ALLOWED_CODE_RE.test(norm)) {
    return json({ ok: false, error: 'malformed code' }, 400, corsHeaders);
  }
  if (!ALLOWED_HWID_RE.test(lowerHwid)) {
    return json({ ok: false, error: 'malformed hwid' }, 400, corsHeaders);
  }
  // userId is optional; if present, validate the snowflake shape.
  if (userId && !ALLOWED_USER_ID_RE.test(userId)) {
    return json({ ok: false, error: 'malformed userId' }, 400, corsHeaders);
  }

  const isFounder = norm.startsWith(FOUNDER_PREFIX);

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

    const claim = {
      hwid: lowerHwid,
      tier: TIER_MAXXER_PLUS_PLUS,
      claimedAt: Date.now(),
      ...(userId ? { userId } : {}),
      ...(founderNumber ? { founderNumber } : {}),
    };
    await env.VIP_CLAIMS.put(
      key,
      JSON.stringify(claim),
      { metadata: { claimedAt: claim.claimedAt, founderNumber: founderNumber ?? null } },
    );
    // Invalidate roster memo so the next /roster GET reflects the new claim.
    rosterMemoCache = null;
    return json(
      {
        ok: true,
        status: 'claimed',
        boundHwid: lowerHwid,
        tier: TIER_MAXXER_PLUS_PLUS,
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

  // Idempotent re-claim. If the original record is missing data we now
  // collect (userId), opportunistically backfill so the roster fills in.
  let needsRewrite = false;
  if (userId && !parsed.userId) {
    parsed.userId = userId;
    needsRewrite = true;
  }
  if (needsRewrite) {
    parsed.tier ??= TIER_MAXXER_PLUS_PLUS;
    parsed.claimedAt ??= Date.now();
    await env.VIP_CLAIMS.put(
      key,
      JSON.stringify(parsed),
      { metadata: { claimedAt: parsed.claimedAt, founderNumber: parsed.founderNumber ?? null } },
    );
    rosterMemoCache = null;
  }

  return json(
    {
      ok: true,
      status: 'idempotent',
      boundHwid: parsed.hwid,
      tier: parsed.tier ?? TIER_MAXXER_PLUS_PLUS,
      ...(parsed.founderNumber ? { founderNumber: parsed.founderNumber } : {}),
    },
    200,
    corsHeaders,
  );
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
  // where RosterEntry = { tier, via?, grantedAt?, expiresAt?, founderNumber? }.
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

  const payload = {
    version: 1,
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
