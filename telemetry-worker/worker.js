/**
 * optmaxxing-telemetry — anonymous opt-in usage stats.
 *
 * Endpoint: POST /event with `{ kind, version, deviceId, payload }`
 *
 *   - `kind`         one of: "tweak.applied", "preset.applied",
 *                    "bench.composite", "app.launch". Anything else → 400.
 *   - `version`      semver string (e.g. "0.1.54"). Loose-validated.
 *   - `deviceId`     32-char hex anonymous device hash. NOT the rig HWID
 *                    used by VIP — see telemetry.rs::anonymous_device_id
 *                    for the salt. Cross-correlation is the bug we're
 *                    avoiding.
 *   - `payload`      arbitrary JSON object, capped at 2 KB. Up to the
 *                    sender what to put in it.
 *
 * Storage: KV `telemetry-events` keyed by `<ts>-<rand>`, value =
 *   `{ kind, version, deviceId, payload, ts, ip2 }` where `ip2` is just
 *   the first two octets of the client IP (rough geo, no de-anonymization).
 *   TTL: 90 days. Older events evicted automatically.
 *
 * Returns 204 on accept, 400 on validation error, 5xx on KV failure.
 * Never echoes the stored data — minimal info leak.
 */

const ALLOWED_KINDS = new Set([
  'tweak.applied',
  'preset.applied',
  'bench.composite',
  'app.launch',
])
const ALLOWED_VERSION_RE = /^\d+\.\d+\.\d+$/
const ALLOWED_DEVICE_RE = /^[a-f0-9]{32}$/
const MAX_PAYLOAD_BYTES = 2 * 1024
const KV_TTL_SECONDS = 90 * 24 * 60 * 60

export default {
  async fetch(request, env) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    const url = new URL(request.url)
    if (url.pathname !== '/event' || request.method !== 'POST') {
      return new Response('not found', { status: 404, headers: cors })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return new Response('invalid json', { status: 400, headers: cors })
    }
    const { kind, version, deviceId, payload } = body || {}
    if (!ALLOWED_KINDS.has(kind)) {
      return new Response('bad kind', { status: 400, headers: cors })
    }
    if (typeof version !== 'string' || !ALLOWED_VERSION_RE.test(version)) {
      return new Response('bad version', { status: 400, headers: cors })
    }
    if (typeof deviceId !== 'string' || !ALLOWED_DEVICE_RE.test(deviceId)) {
      return new Response('bad deviceId', { status: 400, headers: cors })
    }
    if (payload != null && typeof payload !== 'object') {
      return new Response('payload must be object or omitted', { status: 400, headers: cors })
    }
    const payloadJson = payload ? JSON.stringify(payload) : '{}'
    if (payloadJson.length > MAX_PAYLOAD_BYTES) {
      return new Response('payload too large', { status: 400, headers: cors })
    }

    // Light geo: first two octets of client IP. NOT a fingerprint vector
    // — millions of devices share /16 ranges. Used to bucket events into
    // approximate region without storing identifiable IPs.
    const cf = request.headers.get('cf-connecting-ip') || ''
    const octets = cf.split('.')
    const ip2 = octets.length >= 2 ? `${octets[0]}.${octets[1]}` : ''

    const ts = new Date().toISOString()
    const rand = crypto.randomUUID().slice(0, 8)
    const key = `${ts}-${rand}`
    const record = JSON.stringify({ kind, version, deviceId, payload: payload ?? {}, ts, ip2 })

    try {
      await env.TELEMETRY.put(key, record, { expirationTtl: KV_TTL_SECONDS })
    } catch (e) {
      return new Response(`kv write failed: ${e.message ?? e}`, { status: 502, headers: cors })
    }
    return new Response(null, { status: 204, headers: cors })
  },
}
