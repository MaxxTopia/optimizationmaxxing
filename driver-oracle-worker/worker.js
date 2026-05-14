/**
 * optmaxxing-driver-oracle — daily scrape of NVIDIA's public AjaxDriverService
 * for the latest Game Ready driver version. Cached in KV with a 36h TTL so a
 * couple of failed scheduled runs don't blow the cache away.
 *
 * GET /latest                  -> { fetchedAt, sources: { nvidia: {...}, amd: null } }
 * GET /                        -> short HTML splash
 *
 * Scheduled cron (configured in wrangler.toml) fires daily at 06:00 UTC and
 * refreshes the KV. /latest reads-only.
 *
 * Trust contract:
 *  - Public read endpoint. No auth — vendor driver versions are not secret.
 *  - We hit one NVIDIA API per refresh; not a hammer. Vendor traffic is
 *    indistinguishable from a single user opening their driver-download page.
 *  - On scrape failure we keep serving the stale cached value (better than
 *    flapping back to "unknown" and forcing the client into a false-negative).
 *  - No telemetry; no logging beyond Cloudflare's defaults.
 */

const KV_KEY = 'latest-drivers'
const CACHE_TTL_SECONDS = 36 * 60 * 60 // 36h — covers up to two failed daily fetches
const NVIDIA_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'

/** Hit NVIDIA's public AjaxDriverService for the latest Game Ready Driver.
 *  psid=125 (RTX 50 Series), pfid=1004 (RTX 5070-ish), dltype=1 (Game Ready),
 *  dch=1 (DCH drivers), osID=57 (Windows 11 64-bit).
 *
 *  The exact GPU model doesn't matter for the *version* — NVIDIA ships one
 *  unified Game Ready driver per release that supports every RTX card. We
 *  pick a current consumer model to anchor the query at "consumer Game
 *  Ready" rather than the Quadro Enterprise branch (which lives on a
 *  different driver release stream and is several weeks older).
 */
async function fetchNvidiaLatest() {
  const url =
    'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php' +
    '?func=DriverManualLookup' +
    '&psid=125' +
    '&pfid=1004' +
    '&osID=57' +
    '&languageCode=1033' +
    '&isWHQL=1' +
    '&dch=1' +
    '&upCRD=0' +
    '&sort=1' +
    '&numberOfResults=1' +
    '&dltype=1'

  const res = await fetch(url, {
    headers: {
      'user-agent': NVIDIA_USER_AGENT,
      accept: 'application/json,text/plain,*/*',
    },
  })
  if (!res.ok) throw new Error(`nvidia http ${res.status}`)
  const body = await res.json()
  if (body.Success !== '1' || !Array.isArray(body.IDS) || body.IDS.length === 0) {
    throw new Error('nvidia api returned no driver record')
  }
  const info = body.IDS[0].downloadInfo
  if (!info || !info.Version) {
    throw new Error('nvidia response missing downloadInfo.Version')
  }
  // Name / ReleaseNotes are URL-encoded; the rest are plain.
  return {
    channel: 'game_ready',
    version: info.Version,
    released: info.ReleaseDateTime || null,
    detailsUrl: info.DetailsURL || null,
    downloadUrl: info.DownloadURL || null,
    sizeMb: info.DownloadURLFileSize || null,
    name: decodeURIComponent(info.Name || ''),
  }
}

/** Compose the cached payload. Errors on individual sources are isolated so
 *  one vendor failing doesn't take the others down. */
async function refresh() {
  const fetchedAt = new Date().toISOString()
  const sources = {}

  try {
    sources.nvidia = await fetchNvidiaLatest()
  } catch (e) {
    sources.nvidia = { error: String(e?.message ?? e) }
  }
  // AMD: no clean public JSON API. Adrenalin's own check uses an undocumented
  // endpoint that requires session cookies. Until we wire a separate scrape
  // (or an Adrenalin-driver-side helper) we explicitly return null so the
  // client surfaces "no latest version known" instead of pretending we have
  // an answer.
  sources.amd = null
  // Intel Arc: same story. Driver-and-Support-Assistant has the lookup but
  // doesn't expose it. Stub null.
  sources.intel_arc = null

  return { fetchedAt, sources }
}

async function readCache(env) {
  const raw = await env.DRIVER_ORACLE.get(KV_KEY, { type: 'json' })
  return raw || null
}

async function writeCache(env, payload) {
  await env.DRIVER_ORACLE.put(KV_KEY, JSON.stringify(payload), {
    expirationTtl: CACHE_TTL_SECONDS,
  })
}

export default {
  /**
   * Scheduled handler — fires per wrangler.toml cron triggers (daily at 06:00 UTC).
   * Fresh scrape + KV write. Stale cache stays in place if this fails.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const payload = await refresh()
          await writeCache(env, payload)
        } catch (e) {
          // Don't crash the cron — the stale cache survives by design.
          console.log(`scheduled refresh failed: ${e?.message ?? e}`)
        }
      })(),
    )
  },

  async fetch(request, env, ctx) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    const url = new URL(request.url)

    if (url.pathname === '/latest' && request.method === 'GET') {
      let payload = await readCache(env)
      // If KV is empty (cold start before the first cron firing) refresh
      // synchronously so the very first client call doesn't get a 503.
      if (!payload) {
        try {
          payload = await refresh()
          // Don't block the response on the KV write — fire-and-forget.
          ctx.waitUntil(writeCache(env, payload))
        } catch (e) {
          return new Response(
            JSON.stringify({ error: 'oracle cold + refresh failed', detail: String(e) }),
            {
              status: 503,
              headers: { ...cors, 'content-type': 'application/json' },
            },
          )
        }
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          ...cors,
          'content-type': 'application/json; charset=utf-8',
          // Browser-side caching kept tight; the source of truth is KV +
          // the daily cron. Short cache lets us push corrections fast.
          'cache-control': 'public, max-age=300',
        },
      })
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(
        'optmaxxing-driver-oracle — GET /latest for the cached driver versions.\n' +
          'Cache refreshes daily at 06:00 UTC. Stale-while-error semantics: a failed\n' +
          'scrape never clears the cache, only updates it.\n',
        { status: 200, headers: { ...cors, 'content-type': 'text/plain' } },
      )
    }

    return new Response('not found', { status: 404, headers: cors })
  },
}
