# optmaxxing-driver-oracle

Cloudflare Worker that scrapes NVIDIA's public AjaxDriverService once a day and exposes the latest Game Ready Driver version via `GET /latest`. Client reads this and tells the user "Update available — v596.49 (released 2026-05-12)" vs "Up to date" — actual version diff, not age-based guessing.

## Deploy (one-time)

```powershell
cd projects/optimizationmaxxing/driver-oracle-worker

# 1) Create the KV namespace
wrangler kv namespace create driver-oracle

# 2) Paste the returned `id` into wrangler.toml under [[kv_namespaces]]

# 3) Deploy. Cron trigger registers automatically.
wrangler deploy

# → Live at https://optmaxxing-driver-oracle.<account>.workers.dev/latest
```

The first request after cold start triggers a synchronous scrape (KV empty → refresh inline). Every subsequent request reads from KV.

## Response shape

```json
{
  "fetchedAt": "2026-05-14T11:50:00.000Z",
  "sources": {
    "nvidia": {
      "channel": "game_ready",
      "version": "596.49",
      "released": "Tue May 12, 2026",
      "detailsUrl": "https://www.nvidia.com/en-us/drivers/details/237xxx/",
      "downloadUrl": "https://us.download.nvidia.com/Windows/.../596.49-...-whql.exe",
      "sizeMb": "765.4 MB",
      "name": "GeForce Game Ready Driver"
    },
    "amd": null,
    "intel_arc": null
  }
}
```

`null` for AMD / Intel Arc = "no oracle data yet; client should not show an Update Available hint." We don't pretend we know what we don't.

## Why NVIDIA only (for now)

| Vendor | Public JSON API? | Status |
|---|---|---|
| NVIDIA | Yes — AjaxDriverService since GeForce Experience era | **Active** |
| AMD | No public API. Adrenalin uses an undocumented endpoint with session cookies. | Stub null |
| Intel Arc | No. Driver-and-Support-Assistant has it but isn't exposed. | Stub null |

If AMD/Intel ship JSON APIs (or we land an Adrenalin-side helper) the worker gets two more `fetchXxxLatest()` functions and the sources struct gains real entries.

## Inspect

```powershell
# Read the cached payload from KV directly
wrangler kv key get --binding DRIVER_ORACLE --remote latest-drivers
```

## Trust contract

- **Public read.** Driver versions aren't secret.
- **No telemetry.** Worker logs only what Cloudflare logs by default.
- **Stale-while-error.** A failed scrape never clears the cache. Last-known-good stays live until the next successful refresh.
- **Minimal vendor traffic.** One NVIDIA request per day — indistinguishable from a single user opening the driver-download page.
