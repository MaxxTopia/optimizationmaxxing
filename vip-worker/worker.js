/**
 * optmaxxing-vip — first-claim-wins ledger for VIP redemption codes.
 *
 * Endpoint: POST /claim with `{ code, hwid }`
 *
 *   - If `claim:<code>` is unset in KV: SET it to the supplied hwid +
 *     return 200 { ok:true, status:"claimed" }.
 *   - If set + same hwid: idempotent re-redeem → 200 { ok:true, status:"idempotent" }.
 *   - If set + different hwid: 409 { ok:false, error:"already claimed by another rig" }.
 *
 * Code authenticity comes from being unguessable — 16 chars of Crockford
 * base32 = ~80 bits. Cloudflare's per-IP rate limits handle brute-force.
 *
 * Bind a KV namespace named VIP_CLAIMS in wrangler.toml (see deploy
 * instructions in README.md).
 */

const ALLOWED_CODE_RE = /^[0-9A-HJKMNP-Z]{16}$/;
const ALLOWED_HWID_RE = /^[a-f0-9]{32}$/;

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const url = new URL(request.url);
    if (url.pathname !== '/claim' || request.method !== 'POST') {
      return json({ ok: false, error: 'not found' }, 404, corsHeaders);
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'malformed JSON' }, 400, corsHeaders);
    }
    const code = typeof body.code === 'string' ? body.code : '';
    const hwid = typeof body.hwid === 'string' ? body.hwid : '';
    const norm = normalizeCode(code);
    const lowerHwid = hwid.toLowerCase();
    if (!ALLOWED_CODE_RE.test(norm)) {
      return json({ ok: false, error: 'malformed code' }, 400, corsHeaders);
    }
    if (!ALLOWED_HWID_RE.test(lowerHwid)) {
      return json({ ok: false, error: 'malformed hwid' }, 400, corsHeaders);
    }

    const key = `claim:${norm}`;
    const existing = await env.VIP_CLAIMS.get(key);
    if (!existing) {
      await env.VIP_CLAIMS.put(
        key,
        lowerHwid,
        // KV metadata is a free way to record when this happened without
        // a second key.
        { metadata: { claimedAt: Date.now() } },
      );
      return json(
        { ok: true, status: 'claimed', boundHwid: lowerHwid },
        200,
        corsHeaders,
      );
    }
    if (existing === lowerHwid) {
      return json(
        { ok: true, status: 'idempotent', boundHwid: existing },
        200,
        corsHeaders,
      );
    }
    return json(
      {
        ok: false,
        error: 'already claimed by another rig',
        boundHwid: existing,
      },
      409,
      corsHeaders,
    );
  },
};

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
