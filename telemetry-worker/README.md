# optmaxxing-telemetry

Cloudflare Worker for the **anonymous opt-in** usage-stats endpoint. Mirrors the layout of `vip-worker/`.

## Deploy

```powershell
cd projects/optimizationmaxxing/telemetry-worker
# 1) Create the KV namespace (one-time):
wrangler kv namespace create telemetry-events
# 2) Paste the returned `id` into wrangler.toml under [[kv_namespaces]]
# 3) Deploy:
wrangler deploy
# → Live at https://optmaxxing-telemetry.<account>.workers.dev/event
```

After deploy, set `OPTMAXXING_TELEMETRY_URL` in `src-tauri/src/telemetry.rs` (or env at build) to the workers.dev URL above (or a custom-domain route).

## Endpoint

`POST /event`, JSON body:
```json
{
  "kind": "tweak.applied",
  "version": "0.1.54",
  "deviceId": "32-char-hex",
  "payload": { "tweakId": "process.fortnite.priority-high" }
}
```

Returns 204 No Content on accept. 400 on validation. 5xx on KV failure.

## Validation rules (server-side)

- `kind` ∈ `{tweak.applied, preset.applied, bench.composite, app.launch}`
- `version` matches `\d+\.\d+\.\d+`
- `deviceId` matches `[a-f0-9]{32}` — anonymous device hash, **not** the rig HWID used by VIP. See `telemetry.rs::anonymous_device_id` for the salt that prevents cross-correlation.
- `payload` ≤ 2 KB JSON

## What we store

Per event, in KV `telemetry-events` keyed by `<iso-ts>-<rand>`, value:
```json
{
  "kind": "...",
  "version": "...",
  "deviceId": "...",
  "payload": {...},
  "ts": "ISO timestamp",
  "ip2": "first.two.octets"
}
```

`ip2` is the first two octets of the client IP — rough region bucket, not a fingerprint vector. Per-event TTL is 90 days.

## Inspect

```powershell
wrangler kv key list --binding TELEMETRY --remote
wrangler kv key get --binding TELEMETRY --remote "<key>"
```

## Privacy contract surfaced to users

Settings page copy: "Anonymous device hash + which tweak/preset you applied + your Asta Bench score. No personal data, no IP logging beyond what Cloudflare needs to route the request. Used to show 'X% of users on Asta Mode see +Y composite' on the website. Off by default."

If we ever change what's collected, the Settings copy + this README must update first.
