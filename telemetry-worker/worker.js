/**
 * optmaxxing-telemetry — anonymous opt-in usage stats.
 *
 * POST /event with `{ kind, version, deviceId, payload }`
 *
 *   - `kind`         one of: "tweak.applied", "preset.applied",
 *                    "bench.composite", "app.launch". Anything else → 400.
 *   - `version`      semver string (e.g. "0.1.54"). Loose-validated.
 *   - `deviceId`     32-char hex anonymous device hash. NOT the rig HWID
 *                    used by VIP — see telemetry.rs::anonymous_device_id
 *                    for the salt. Cross-correlation is the bug we're
 *                    avoiding.
 *   - `payload`      arbitrary JSON object, capped at 2 KB.
 *
 * GET /summary?days=N (admin token in `x-admin-token` header or `?token=`)
 *   - Aggregates events from KV — counts, distributions, top tweaks/presets,
 *     unique-device count, recent activity. Operator-only. Constant-time
 *     token comparison. No PII echoed (deviceId hashes are aggregated, not
 *     exposed). See README for token bootstrap.
 *
 * Storage: KV `telemetry-events` keyed by `<ts>-<rand>`, value =
 *   `{ kind, version, deviceId, payload, ts, ip2 }`. TTL 90 days.
 *
 * Returns 204 on accept, 400 on validation error, 5xx on KV failure.
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
const SUMMARY_MAX_DAYS = 90
const SUMMARY_DEFAULT_DAYS = 7
const SUMMARY_KV_BATCH = 1000
const TOP_N = 15

export default {
  async fetch(request, env) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-admin-token',
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    const url = new URL(request.url)

    if (url.pathname === '/summary' && request.method === 'GET') {
      return handleSummary(request, env, url, cors)
    }

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

/**
 * Constant-time string compare. Returns false on length mismatch — that's
 * fine here, the token shape is fixed at deploy time so a length-leak
 * just reveals "the user got the length wrong," not the secret.
 */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * GET /summary — operator dashboard. Aggregates events from KV inside a
 * day window and returns counts + distributions + top-N tweaks/presets +
 * recent activity.
 *
 * Auth: TELEMETRY_ADMIN_TOKEN secret in the worker env. Header
 * `x-admin-token` is preferred over `?token=` query param so the token
 * doesn't get logged in CF access logs by accident.
 *
 * Cost-discipline: KV LIST is paginated; we cap at SUMMARY_KV_BATCH * a
 * small page count to avoid burning CPU on long windows. Beyond 90 days
 * the TTL has already evicted older events anyway.
 */
async function handleSummary(request, env, url, cors) {
  const expected = env.TELEMETRY_ADMIN_TOKEN
  if (!expected || typeof expected !== 'string' || expected.length < 16) {
    return new Response('admin token not configured', { status: 503, headers: cors })
  }
  const provided =
    request.headers.get('x-admin-token') ||
    url.searchParams.get('token') ||
    ''
  if (!constantTimeEqual(provided, expected)) {
    return new Response('forbidden', { status: 403, headers: cors })
  }

  let days = Number(url.searchParams.get('days')) || SUMMARY_DEFAULT_DAYS
  if (!Number.isFinite(days) || days < 1) days = SUMMARY_DEFAULT_DAYS
  if (days > SUMMARY_MAX_DAYS) days = SUMMARY_MAX_DAYS
  const nowMs = Date.now()
  const windowMs = days * 24 * 60 * 60 * 1000
  const windowStart = new Date(nowMs - windowMs).toISOString()
  const now = new Date(nowMs).toISOString()

  // Aggregators.
  const byKind = Object.create(null)
  const byVersion = Object.create(null)
  const byDay = Object.create(null)
  const byRegion = Object.create(null)
  const devices = new Set()
  const tweakCounts = Object.create(null)
  const presetCounts = Object.create(null)
  const recent = []
  const RECENT_CAP = 50
  let totalEvents = 0
  let parseErrors = 0
  let pagesRead = 0

  // KV LIST + paginated get. Keys are sorted lexicographically and we
  // chose `<ISO ts>-<rand>` so listing alphabetically is also a chronological
  // walk. The "list-prefix=window-start-date" trick is too narrow (a key
  // generated at 23:59:59 might sort weirdly across day boundaries with
  // the random suffix), so we list all and filter by ts in-record. KV TTL
  // already caps the universe at 90 days.
  let cursor = undefined
  const SAFETY_PAGE_LIMIT = 30
  while (pagesRead < SAFETY_PAGE_LIMIT) {
    const listed = await env.TELEMETRY.list({ limit: SUMMARY_KV_BATCH, cursor })
    pagesRead++
    if (!listed || !Array.isArray(listed.keys)) break
    // Fetch values in parallel for this page.
    const records = await Promise.all(
      listed.keys.map((k) => env.TELEMETRY.get(k.name).catch(() => null))
    )
    for (const raw of records) {
      if (!raw) continue
      let rec
      try {
        rec = JSON.parse(raw)
      } catch {
        parseErrors++
        continue
      }
      const ts = rec && rec.ts
      if (typeof ts !== 'string') continue
      if (ts < windowStart) continue
      totalEvents++
      const kind = rec.kind || 'unknown'
      byKind[kind] = (byKind[kind] || 0) + 1
      const version = rec.version || 'unknown'
      byVersion[version] = (byVersion[version] || 0) + 1
      const day = ts.slice(0, 10)
      byDay[day] = (byDay[day] || 0) + 1
      if (rec.ip2) byRegion[rec.ip2] = (byRegion[rec.ip2] || 0) + 1
      if (rec.deviceId) devices.add(rec.deviceId)
      const payload = rec.payload || {}
      // Common identifier fields the client sends today.
      const tweakId = payload.tweakId || payload.id || null
      if (kind === 'tweak.applied' && typeof tweakId === 'string') {
        tweakCounts[tweakId] = (tweakCounts[tweakId] || 0) + 1
      }
      const presetId = payload.presetId || payload.id || null
      if (kind === 'preset.applied' && typeof presetId === 'string') {
        presetCounts[presetId] = (presetCounts[presetId] || 0) + 1
      }
      if (recent.length < RECENT_CAP) {
        recent.push({
          ts,
          kind,
          version,
          ip2: rec.ip2 || '',
          payloadKeys: Object.keys(payload).slice(0, 6),
        })
      }
    }
    if (listed.list_complete || !listed.cursor) break
    cursor = listed.cursor
  }

  const summary = {
    windowDays: days,
    windowStart,
    now,
    totalEvents,
    uniqueDevices: devices.size,
    pagesRead,
    parseErrors,
    byKind,
    byVersion,
    byDay: Object.entries(byDay)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, count]) => ({ day, count })),
    byRegion,
    topTweaks: topN(tweakCounts, TOP_N),
    topPresets: topN(presetCounts, TOP_N),
    recent: recent.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, RECENT_CAP),
  }
  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function topN(counts, n) {
  return Object.entries(counts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}
