import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? this.values.get(key) : null; }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
  async list(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'cursor') && options.cursor === undefined) {
      throw new Error('KV list must omit an undefined cursor');
    }
    const { prefix = '', limit = 1000 } = options;
    const keys = [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .slice(0, limit)
      .map((name) => ({ name }));
    return { keys, list_complete: true, cursor: '' };
  }
}

class MemoryR2 {
  constructor() { this.values = new Map(); }
  async put(key, value, options = {}) {
    const bytes = value instanceof Uint8Array
      ? new Uint8Array(value)
      : typeof value === 'string'
        ? new TextEncoder().encode(value)
        : new Uint8Array(value);
    this.values.set(key, {
      bytes,
      httpMetadata: options.httpMetadata ?? {},
      etag: `"${key}"`,
      uploaded: new Date().toISOString(),
    });
  }
  async get(key, options = {}) {
    const stored = this.values.get(key);
    if (!stored) return null;
    let bytes = stored.bytes;
    const range = options?.range;
    if (range) bytes = bytes.slice(range.offset, range.offset + range.length);
    return {
      body: new Response(bytes).body,
      size: bytes.byteLength,
      httpMetadata: stored.httpMetadata,
      etag: stored.etag,
    };
  }
  async head(key) {
    const stored = this.values.get(key);
    if (!stored) return null;
    return {
      size: stored.bytes.byteLength,
      httpMetadata: stored.httpMetadata,
      etag: stored.etag,
    };
  }
  async list({ prefix = '', limit = 1000 } = {}) {
    const objects = [...this.values.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .slice(0, limit)
      .map(([key, value]) => ({ key, uploaded: value.uploaded }));
    return { objects, truncated: false };
  }
  async delete(key) { this.values.delete(key); }
}

const userId = '12345678901234567';
const claimCode = 'ABCDEFGHJKMNPQRS';
const adminToken = 'test-only-admin-token';

function request(path, method = 'GET', body, extraHeaders = {}) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context() {
  return { waitUntil(promise) { promise.catch(() => {}); } };
}

async function jsonResponse(response) {
  return { status: response.status, body: await response.json() };
}

function adminRequest(path, method = 'GET', body) {
  return request(path, method, body, { authorization: `Bearer ${adminToken}` });
}

async function seededEnvironment() {
  const kv = new MemoryKV();
  const media = new MemoryR2();
  await kv.put(`claim:${claimCode}`, JSON.stringify({
    hwid: 'a'.repeat(32),
    userId,
    tier: 3,
    claimedAt: Date.now(),
  }));
  return { kv, media, env: { VIP_CLAIMS: kv, PROFILE_MEDIA: media } };
}

test('free profile activation proves Discord identity and publishes a Tier 0 claim', async () => {
  const { kv, env } = await seededEnvironment();
  env.DISCORD_OAUTH_CLIENT_ID = '1502451778426372116';
  env.DISCORD_OAUTH_CLIENT_SECRET = 'test-only-oauth-secret';
  env.DISCORD_OAUTH_REDIRECT_URI = 'https://worker.test/discord-link';
  const freeUserId = '12345678901234568';
  const hwid = 'b'.repeat(32);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'test-free-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/users/@me')) {
      return new Response(JSON.stringify({ id: freeUserId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };

  try {
    const started = await worker.fetch(request('/free-claim/start', 'POST', { hwid }), env, context());
    const startJson = await jsonResponse(started);
    assert.equal(started.status, 200);
    assert.equal(startJson.body.ok, true);
    assert.equal(startJson.body.status, 'pending');
    assert.match(startJson.body.session, /^[0-9A-HJKMNP-TV-Z]{16}$/);

    const authorizeUrl = new URL(startJson.body.authorizeUrl);
    assert.equal(authorizeUrl.searchParams.get('client_id'), env.DISCORD_OAUTH_CLIENT_ID);
    assert.equal(authorizeUrl.searchParams.get('redirect_uri'), env.DISCORD_OAUTH_REDIRECT_URI);
    assert.equal(authorizeUrl.searchParams.get('scope'), 'identify');
    assert.equal(authorizeUrl.searchParams.get('state'), `free_${startJson.body.session}`);

    const pending = await worker.fetch(request(`/free-claim/status?session=${startJson.body.session}`), env, context());
    assert.equal(pending.status, 200);
    assert.equal((await jsonResponse(pending)).body.status, 'pending');

    const callback = await worker.fetch(
      request(`/discord-link?code=test-oauth-code&state=free_${startJson.body.session}`),
      env,
      context(),
    );
    assert.equal(callback.status, 200);
    assert.match(await callback.text(), /Discordmaxxer activated/i);

    const claimed = await worker.fetch(request(`/free-claim/status?session=${startJson.body.session}`), env, context());
    const claimedJson = await jsonResponse(claimed);
    assert.equal(claimed.status, 200);
    assert.equal(claimedJson.body.status, 'claimed');
    assert.equal(claimedJson.body.userId, freeUserId);
    assert.equal(claimedJson.body.tier, 0);
    assert.equal(claimedJson.body.scope, 'dm');
    assert.match(claimedJson.body.code, /^[0-9A-HJKMNP-TV-Z]{16}$/);

    const storedClaim = JSON.parse(await kv.get(`claim:${claimedJson.body.code}`));
    assert.deepEqual(storedClaim, {
      hwid,
      userId: freeUserId,
      tier: 0,
      scope: 'dm',
      claimedAt: storedClaim.claimedAt,
    });

    const profile = await worker.fetch(request('/profile', 'POST', {
      userId: freeUserId,
      claimCode: claimedJson.body.code,
      profile: {
        bannerUrl: 'https://cdn.example.test/free-banner.gif',
        avatarAnimatedUrl: 'https://cdn.example.test/free-avatar.gif',
        themeColorPrimary: '#ff00aa',
        themeColorSecondary: '#220044',
      },
    }), env, context());
    assert.equal(profile.status, 200);

    // Repeating activation for the same Discord account and PC is idempotent;
    // it must not mint a second free code.
    const secondStarted = await worker.fetch(request('/free-claim/start', 'POST', { hwid }), env, context());
    const secondStartJson = await jsonResponse(secondStarted);
    const secondCallback = await worker.fetch(
      request(`/discord-link?code=test-oauth-code-2&state=free_${secondStartJson.body.session}`),
      env,
      context(),
    );
    assert.equal(secondCallback.status, 200);
    const secondStatus = await worker.fetch(request(`/free-claim/status?session=${secondStartJson.body.session}`), env, context());
    const secondStatusJson = await jsonResponse(secondStatus);
    assert.equal(secondStatusJson.body.status, 'claimed');
    assert.equal(secondStatusJson.body.code, claimedJson.body.code);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local banner upload returns public media URL and serves bytes', async () => {
  const { media, env } = await seededEnvironment();
  const bytes = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const dataUri = `data:image/gif;base64,${Buffer.from(bytes).toString('base64')}`;

  const upload = await worker.fetch(request('/profile-media', 'POST', {
    userId,
    claimCode,
    kind: 'banner',
    mime: 'image/gif',
    dataUri,
  }), env, context());
  const uploadJson = await jsonResponse(upload);
  assert.equal(uploadJson.status, 201);
  assert.equal(uploadJson.body.ok, true);
  assert.match(uploadJson.body.url, /^https:\/\/optmaxxing-vip\.maxxtopia\.workers\.dev\/profile-media\//);
  assert.equal(media.values.size, 1);

  const mediaUrl = new URL(uploadJson.body.url);
  const served = await worker.fetch(request(mediaUrl.pathname), env, context());
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/gif');
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), bytes);

  const ranged = await worker.fetch(request(mediaUrl.pathname, 'GET', undefined, { range: 'bytes=1-3' }), env, context());
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), `bytes 1-3/${bytes.length}`);
  assert.equal(ranged.headers.get('content-length'), '3');
  assert.deepEqual(new Uint8Array(await ranged.arrayBuffer()), bytes.slice(1, 4));

  const head = await worker.fetch(request(mediaUrl.pathname, 'HEAD'), env, context());
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
});

test('shared avatar upload accepts GIFs and marks video banners for the renderer', async () => {
  const { media, env } = await seededEnvironment();
  const avatarBytes = Uint8Array.from([0x47, 0x49, 0x46, 0x38]);
  const avatar = await worker.fetch(request('/profile-media', 'POST', {
    userId, claimCode, kind: 'avatar', mime: 'image/gif',
    dataUri: `data:image/gif;base64,${Buffer.from(avatarBytes).toString('base64')}`,
  }), env, context());
  const avatarJson = await jsonResponse(avatar);
  assert.equal(avatar.status, 201);
  assert.match(avatarJson.body.url, /\/avatar\/[0-9a-f-]{36}$/i);

  const rejectedVideoAvatar = await worker.fetch(request('/profile-media', 'POST', {
    userId, claimCode, kind: 'avatar', mime: 'video/mp4',
    dataUri: 'data:video/mp4;base64,AAAA',
  }), env, context());
  assert.equal(rejectedVideoAvatar.status, 400);
  assert.match((await jsonResponse(rejectedVideoAvatar)).body.error, /GIF\/image/i);

  const video = await worker.fetch(request('/profile-media', 'POST', {
    userId, claimCode, kind: 'banner', mime: 'video/mp4',
    dataUri: 'data:video/mp4;base64,AAAA',
  }), env, context());
  const videoJson = await jsonResponse(video);
  assert.equal(video.status, 201);
  assert.match(videoJson.body.url, /\?dmx-media=video$/);
  assert.equal(media.values.size, 2);
});

test('media pruning keeps the current upload set bounded', async () => {
  const { media, env } = await seededEnvironment();
  const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
  for (let i = 0; i < 7; i++) {
    const response = await worker.fetch(request('/profile-media', 'POST', {
      userId, claimCode, kind: 'banner', mime: 'image/png', dataUri,
    }), env, context());
    assert.equal(response.status, 201);
  }
  assert.equal(media.values.size, 5);
});

test('saving a replacement or clearing a banner removes the old owned object', async () => {
  const { kv, media, env } = await seededEnvironment();
  const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
  const upload = await worker.fetch(request('/profile-media', 'POST', {
    userId, claimCode, kind: 'banner', mime: 'image/png', dataUri,
  }), env, context());
  const first = (await jsonResponse(upload)).body.url;
  const firstKey = [...media.values.keys()][0];

  const saveFirst = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { bannerUrl: first },
  }), env, context());
  assert.equal(saveFirst.status, 200);

  const secondUpload = await worker.fetch(request('/profile-media', 'POST', {
    userId, claimCode, kind: 'banner', mime: 'image/png', dataUri,
  }), env, context());
  const second = (await jsonResponse(secondUpload)).body.url;
  const secondKey = [...media.values.keys()].find((key) => key !== firstKey);
  assert.ok(secondKey);

  const saveSecond = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { bannerUrl: second },
  }), env, context());
  assert.equal(saveSecond.status, 200);
  assert.equal(media.values.has(firstKey), false);
  assert.equal(media.values.has(secondKey), true);

  const clear = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { bannerUrl: '' },
  }), env, context());
  assert.equal(clear.status, 200);
  assert.equal(media.values.has(secondKey), false);
  assert.equal(await kv.get(`profile:${userId}`), null);
});

test('media upload fails clearly before storage is configured', async () => {
  const { kv } = await seededEnvironment();
  const response = await worker.fetch(request('/profile-media', 'POST', {
    userId, claimCode, kind: 'banner', mime: 'image/gif',
    dataUri: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==',
  }), { VIP_CLAIMS: kv }, context());
  const result = await jsonResponse(response);
  assert.equal(result.status, 503);
  assert.match(result.body.error, /storage is not configured/i);
});

test('VIP admin page exposes product filters, the full ledger, and revoke/remove controls without caching', async () => {
  const { env } = await seededEnvironment();
  const response = await worker.fetch(request('/admin'), env, context());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(html, /\/admin\/remove/);
  assert.match(html, /id="productFilter"/);
  assert.match(html, /id="durationFilter"/);
  assert.match(html, /id="statusFilter"/);
  assert.match(html, /class="quick-filters"/);
  assert.match(html, /\$\('scope'\)\.addEventListener\('change',syncTier\)/);
  assert.match(html, /\['filter','productFilter','durationFilter','sortFilter','pageSize'\]\.forEach/);
  assert.match(html, /\$\('statusFilter'\)\.addEventListener\('change'/);
  assert.match(html, /function exportCsv\(/);
  assert.match(html, /id="pageSize"/);
  assert.match(html, /show removed/i);
  assert.match(html, /Request timed out after 15 seconds/);
  assert.match(html, /function removeCode\(/);
  assert.match(html, /function revoke\(/);
  assert.doesNotMatch(html, /\/admin\/(?:extend|reset-hwid)/);
  assert.doesNotMatch(html, /Reset HWID|Adjust time/);
});

test('VIP key removal requires revoke or expiry and archives rather than deleting records', async () => {
  const { kv, env } = await seededEnvironment();
  env.ADMIN_TOKEN = adminToken;
  const originalClaim = await kv.get(`claim:${claimCode}`);
  await kv.put(`meta:${claimCode}`, JSON.stringify({
    tier: 3, scope: 'dm', durationKey: 'lifetime', durationMs: null, mintedAt: Date.now(),
  }));

  const blocked = await worker.fetch(adminRequest('/admin/remove', 'POST', { code: claimCode }), env, context());
  assert.equal(blocked.status, 409);
  assert.match((await jsonResponse(blocked)).body.error, /must be revoked or allowed to expire/i);

  const revoked = await worker.fetch(adminRequest('/admin/revoke', 'POST', { code: claimCode, revoked: true }), env, context());
  assert.equal(revoked.status, 200);
  const revokedProfile = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#ff6ec7' },
  }), env, context());
  assert.equal(revokedProfile.status, 403);
  assert.match((await jsonResponse(revokedProfile)).body.error, /revoked/i);
  const revokedMedia = await worker.fetch(request('/profile-media', 'POST', {
    userId, claimCode, kind: 'banner', mime: 'image/gif', dataUri: 'invalid',
  }), env, context());
  assert.equal(revokedMedia.status, 403);

  const removed = await worker.fetch(adminRequest('/admin/remove', 'POST', { code: claimCode, reason: 'retired test key' }), env, context());
  const removedJson = await jsonResponse(removed);
  assert.equal(removedJson.status, 200);
  assert.equal(removedJson.body.status, 'removed');
  assert.equal(await kv.get(`claim:${claimCode}`), originalClaim);

  const metadata = JSON.parse(await kv.get(`meta:${claimCode}`));
  assert.equal(metadata.revoked, true);
  assert.equal(metadata.archiveReason, 'retired test key');
  assert.ok(metadata.archivedAt);

  const hidden = await worker.fetch(adminRequest('/admin/list'), env, context());
  assert.equal((await jsonResponse(hidden)).body.rows.some((row) => row.code === claimCode), false);
  const visible = await worker.fetch(adminRequest('/admin/list?includeArchived=1'), env, context());
  const visibleJson = await jsonResponse(visible);
  const archivedRow = visibleJson.body.rows.find((row) => row.code === claimCode);
  assert.equal(archivedRow.archived, true);
  assert.equal(archivedRow.canRemove, false);

  const archivedProfile = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#ff6ec7' },
  }), env, context());
  assert.equal(archivedProfile.status, 403);
  assert.match((await jsonResponse(archivedProfile)).body.error, /removed/i);

  const restore = await worker.fetch(adminRequest('/admin/revoke', 'POST', { code: claimCode, revoked: false }), env, context());
  assert.equal(restore.status, 409);
  const reClaim = await worker.fetch(request('/claim', 'POST', {
    code: claimCode, hwid: 'b'.repeat(32), product: 'dm',
  }), env, context());
  assert.equal(reClaim.status, 403);
  assert.match((await jsonResponse(reClaim)).body.error, /removed/i);
});

test('expired claimed VIP keys are eligible for removal while unexpired claims are protected', async () => {
  const { kv, env } = await seededEnvironment();
  env.ADMIN_TOKEN = adminToken;
  const expiredCode = '12345678ABCDEFGH';
  await kv.put(`meta:${expiredCode}`, JSON.stringify({
    tier: 1, scope: 'aim', durationKey: 'day', durationMs: 24 * 60 * 60 * 1000, mintedAt: Date.now() - 90000,
  }));
  await kv.put(`claim:${expiredCode}`, JSON.stringify({
    hwid: 'c'.repeat(32), claimedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  }));

  const listing = await worker.fetch(adminRequest('/admin/list'), env, context());
  const row = (await jsonResponse(listing)).body.rows.find((entry) => entry.code === expiredCode);
  assert.equal(row.canRemove, true);
  const removed = await worker.fetch(adminRequest('/admin/remove', 'POST', { code: expiredCode }), env, context());
  assert.equal(removed.status, 200);
  assert.equal(JSON.parse(await kv.get(`meta:${expiredCode}`)).revoked, true);
});

test('profile writes reject expired or non-Discordmaxxer scoped claims', async () => {
  const { kv, env } = await seededEnvironment();
  await kv.put(`claim:${claimCode}`, JSON.stringify({
    hwid: 'a'.repeat(32), userId, tier: 3, scope: 'om', claimedAt: Date.now(),
  }));
  const wrongScope = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#ff6ec7' },
  }), env, context());
  assert.equal(wrongScope.status, 403);

  await kv.put(`claim:${claimCode}`, JSON.stringify({
    hwid: 'a'.repeat(32), userId, tier: 3, scope: 'dm', claimedAt: Date.now(), expiresAt: Date.now() - 1,
  }));
  const expired = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#ff6ec7' },
  }), env, context());
  assert.equal(expired.status, 410);
});

test('free claims can publish the complete profile-flair showcase pair', async () => {
  const { kv, env } = await seededEnvironment();
  await kv.put(`claim:${claimCode}`, JSON.stringify({
    hwid: 'a'.repeat(32), userId, tier: 0, scope: 'dm', claimedAt: Date.now(),
  }));
  const accepted = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode,
    profile: {
      bannerUrl: 'https://cdn.example.test/banner.mp4',
      avatarAnimatedUrl: 'https://cdn.example.test/avatar.gif',
      themeColorPrimary: '#ff6ec7',
      themeColorSecondary: '#4a73ff',
    },
  }), env, context());
  assert.equal(accepted.status, 200);

  const acceptedAgain = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#ff6ec7' },
  }), env, context());
  assert.equal(acceptedAgain.status, 200);
});

test('profile presentation enhancements are tier-gated while free media stays full quality', async () => {
  const { kv, env } = await seededEnvironment();
  const claim = { hwid: 'a'.repeat(32), userId, scope: 'dm', claimedAt: Date.now() };

  await kv.put(`claim:${claimCode}`, JSON.stringify({ ...claim, tier: 0 }));
  const freeMedia = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode,
    profile: {
      bannerUrl: 'https://cdn.example.test/banner.mp4',
      avatarAnimatedUrl: 'https://cdn.example.test/avatar.gif',
      themeColorPrimary: '#ff00aa',
      themeColorSecondary: '#4a73ff',
    },
  }), env, context());
  assert.equal(freeMedia.status, 200);

  const freeEnhancement = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { bannerPosition: 'top' },
  }), env, context());
  assert.equal(freeEnhancement.status, 403);
  assert.match((await jsonResponse(freeEnhancement)).body.error, /bannerPosition requires tier 1\+/i);

  await kv.put(`claim:${claimCode}`, JSON.stringify({ ...claim, tier: 1 }));
  const maxxerEnhancement = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode,
    profile: { bannerPosition: 'top', avatarPosition: 'bottom' },
  }), env, context());
  assert.equal(maxxerEnhancement.status, 200);

  await kv.put(`claim:${claimCode}`, JSON.stringify({ ...claim, tier: 2 }));
  const plusEnhancement = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode,
    profile: { bannerFit: 'contain', avatarFit: 'contain', avatarScale: '1.1' },
  }), env, context());
  assert.equal(plusEnhancement.status, 200);

  await kv.put(`claim:${claimCode}`, JSON.stringify({ ...claim, tier: 3 }));
  const plusPlusEnhancement = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { mediaEffect: 'glow' },
  }), env, context());
  assert.equal(plusPlusEnhancement.status, 200);
  const saved = (await jsonResponse(plusPlusEnhancement)).body.profile;
  assert.equal(saved.bannerUrl, 'https://cdn.example.test/banner.mp4');
  assert.equal(saved.avatarAnimatedUrl, 'https://cdn.example.test/avatar.gif');
  assert.equal(saved.bannerPosition, 'top');
  assert.equal(saved.avatarPosition, 'bottom');
  assert.equal(saved.bannerFit, 'contain');
  assert.equal(saved.avatarFit, 'contain');
  assert.equal(saved.avatarScale, '1.1');
  assert.equal(saved.mediaEffect, 'glow');
});

test('tier downgrade removes paid presentation settings but keeps free media', async () => {
  const { kv, env } = await seededEnvironment();
  const claim = { hwid: 'a'.repeat(32), userId, scope: 'dm', claimedAt: Date.now() };
  await kv.put(`claim:${claimCode}`, JSON.stringify({ ...claim, tier: 3 }));

  const paid = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode,
    profile: {
      bannerUrl: 'https://cdn.example.test/banner.mp4',
      avatarAnimatedUrl: 'https://cdn.example.test/avatar.gif',
      themeColorPrimary: '#ff00aa',
      themeColorSecondary: '#4a73ff',
      bannerPosition: 'bottom',
      avatarPosition: 'top',
      bannerFit: 'contain',
      avatarFit: 'contain',
      avatarScale: '1.1',
      mediaEffect: 'scanline',
    },
    replace: true,
  }), env, context());
  assert.equal(paid.status, 200);

  await kv.put(`claim:${claimCode}`, JSON.stringify({ ...claim, tier: 0 }));
  const downgraded = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#00ffaa' },
  }), env, context());
  assert.equal(downgraded.status, 200);
  const saved = (await jsonResponse(downgraded)).body.profile;
  assert.equal(saved.bannerUrl, 'https://cdn.example.test/banner.mp4');
  assert.equal(saved.avatarAnimatedUrl, 'https://cdn.example.test/avatar.gif');
  assert.equal(saved.themeColorPrimary, '#00ffaa');
  assert.equal(saved.themeColorSecondary, '#4a73ff');
  assert.equal('bannerPosition' in saved, false);
  assert.equal('avatarPosition' in saved, false);
  assert.equal('bannerFit' in saved, false);
  assert.equal('avatarFit' in saved, false);
  assert.equal('avatarScale' in saved, false);
  assert.equal('mediaEffect' in saved, false);

  const roster = await worker.fetch(request('/roster'), env, context());
  const rosterUser = (await jsonResponse(roster)).body.users[userId];
  assert.equal(rosterUser.tier, 0);
  assert.deepEqual(rosterUser.profile, {
    bannerUrl: 'https://cdn.example.test/banner.mp4',
    avatarAnimatedUrl: 'https://cdn.example.test/avatar.gif',
    themeColorPrimary: '#00ffaa',
    themeColorSecondary: '#4a73ff',
  });
});

test('Founder claims normalize to lifetime MAXXER+ for profile gating', async () => {
  const { kv, env } = await seededEnvironment();
  await kv.put(`claim:${claimCode}`, JSON.stringify({
    hwid: 'a'.repeat(32), userId, tier: 3, founderNumber: 7, claimedAt: Date.now(),
  }));

  const reClaim = await worker.fetch(request('/claim', 'POST', {
    code: claimCode, hwid: 'a'.repeat(32), userId, product: 'dm',
  }), env, context());
  assert.equal(reClaim.status, 200);
  assert.equal((await jsonResponse(reClaim)).body.tier, 2);
  assert.equal(JSON.parse(await kv.get(`claim:${claimCode}`)).tier, 2);

  const profile = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode,
    profile: {
      themeColorPrimary: '#ff00aa',
      avatarAnimatedUrl: 'https://cdn.example.test/avatar.gif',
    },
  }), env, context());
  assert.equal(profile.status, 200);

  const roster = await worker.fetch(request('/roster'), env, context());
  const body = await jsonResponse(roster);
  assert.equal(body.body.users[userId].tier, 2);
  assert.equal(body.body.users[userId].founderNumber, 7);
});

test('profile writes use updatedAt to stop stale second-PC overwrites', async () => {
  const { env } = await seededEnvironment();
  const first = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#ff6ec7' },
  }), env, context());
  const firstJson = await jsonResponse(first);
  assert.equal(first.status, 200);
  const updatedAt = firstJson.body.profile.updatedAt;
  const conflict = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, ifUpdatedAt: updatedAt - 1, profile: { themeColorSecondary: '#4a73ff' },
  }), env, context());
  assert.equal(conflict.status, 409);
  assert.match((await jsonResponse(conflict)).body.error, /another PC/i);
});

test('roster migration builds an R2 snapshot and later reads avoid KV list scans', async () => {
  const { kv, media, env } = await seededEnvironment();
  const first = await worker.fetch(request('/roster'), env, context());
  const firstJson = await jsonResponse(first);
  assert.equal(first.status, 200);
  assert.equal(firstJson.body.version, 2);
  assert.equal(firstJson.body.users[userId].tier, 3);
  assert.equal(media.values.has('roster/v2.json'), true);

  // Profile writes invalidate the isolate memo and update the durable mirror.
  const profile = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#ff6ec7' },
  }), env, context());
  assert.equal(profile.status, 200);

  kv.list = async () => { throw new Error('KV list quota exhausted'); };
  const second = await worker.fetch(request('/roster'), env, context());
  const secondJson = await jsonResponse(second);
  assert.equal(second.status, 200);
  assert.equal(secondJson.body.users[userId].profile.themeColorPrimary, '#ff6ec7');
});

test('roster returns a retryable response when legacy migration hits KV quota', async () => {
  const { kv, env } = await seededEnvironment();
  // Invalidate the module memo left by the preceding test.
  const profile = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorSecondary: '#4a73ff' },
  }), env, context());
  assert.equal(profile.status, 200);
  kv.list = async () => { throw new Error('KV list() limit exceeded for the day.'); };
  const response = await worker.fetch(request('/roster'), env, context());
  const result = await jsonResponse(response);
  assert.equal(response.status, 503);
  assert.match(result.body.error, /temporarily unavailable/i);
  assert.equal(result.body.retryAfterSeconds, 300);
});
