# optmaxxing-vip — Cloudflare Worker

First-claim-wins ledger for VIP redemption codes.

## Deploy in 5 steps

1. **Install Wrangler** (one-time, on your machine):
   ```
   npm install -g wrangler
   wrangler login
   ```
   Opens a browser, log into the Cloudflare account that owns
   `maxxtopia.com`.

2. **Create the KV namespace**:
   ```
   cd C:\Users\Diggy\projects\optimizationmaxxing\vip-worker
   wrangler kv namespace create vip-claims
   ```
   Output looks like:
   ```
   🌀 Creating namespace with title "optmaxxing-vip-vip-claims"
   ✨ Success! Add the following to your configuration file in your kv_namespaces array:
   { binding = "VIP_CLAIMS", id = "abc123...def456" }
   ```
   Copy the `id` value.

3. **Paste the id into `wrangler.toml`** — replace
   `REPLACE_ME_WITH_KV_NAMESPACE_ID` with the actual id.

4. **Deploy**:
   ```
   wrangler deploy
   ```
   Output ends with the live URL, e.g.
   `https://optmaxxing-vip.<your-account>.workers.dev`.

5. **Tell the desktop app where to find it** — set this env var on your
   build machine (or hard-code in `src-tauri/src/vip.rs::WORKER_URL`):
   ```
   setx OPTMAXXING_VIP_WORKER_URL "https://optmaxxing-vip.<your-account>.workers.dev/claim"
   ```
   Then rebuild the app.

## (Optional) Custom domain

If you want `vip.maxxtopia.com/claim` instead of the workers.dev subdomain:

- Add a DNS record on Cloudflare: `vip` CNAME → `optmaxxing-vip.<your-account>.workers.dev`.
- Uncomment the `[[routes]]` block in `wrangler.toml` and run `wrangler deploy` again.
- Update `OPTMAXXING_VIP_WORKER_URL` to `https://vip.maxxtopia.com/claim`.

## Free-tier headroom

- Worker requests: 100k/day (this endpoint will see < 100/day forever).
- KV reads: 100k/day, KV writes: 1k/day. A typical claim is 1 read + 1
  write. We're nowhere near limits.

## Test it works

```
curl -X POST https://optmaxxing-vip.<your-account>.workers.dev/claim \
  -H "content-type: application/json" \
  -d '{"code":"MAXX-AAAA-BBBB-CCCC-DDDD","hwid":"00000000000000000000000000000000"}'
```
First call returns `{"ok":true,"status":"claimed",...}`. Same call with a
different hwid returns `409 already claimed by another rig`.

## Inspecting + invalidating claims

List all current claims:
```
wrangler kv key list --binding VIP_CLAIMS
```

Revoke a specific claim (lets the code be re-claimed by anyone):
```
wrangler kv key delete --binding VIP_CLAIMS "claim:<bare-code>"
```
The bare code is the 16-char string without the `MAXX-` prefix or dashes.

## Operational notes

- KV is eventually-consistent (~60s propagation). In a worst-case
  collision two friends could both claim the same code within a minute
  and both end up with VIP. For our scale (gifting friends, not selling
  codes at scale) that's fine.
- If you need strong consistency later, swap KV for Durable Objects.
  ~10 lines of code change; costs $0.20/M requests on the paid tier.
- The shared `VIP_SECRET` in `src-tauri/src/vip.rs` is unrelated to this
  worker. The worker only checks "has this code been claimed before?" —
  the codes themselves are unguessable random strings (80 bits). The
  HMAC secret is only used by the offline HWID-bound flow (the older
  `mint-vip-code.py <hwid>` path), which still works as a fallback.
