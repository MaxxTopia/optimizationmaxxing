import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? this.values.get(key) : null; }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix = '', limit = 1000 } = {}) {
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
    const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
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

test('free claims can publish gradients while media fields remain tier-gated', async () => {
  const { kv, env } = await seededEnvironment();
  await kv.put(`claim:${claimCode}`, JSON.stringify({
    hwid: 'a'.repeat(32), userId, tier: 0, scope: 'dm', claimedAt: Date.now(),
  }));
  const accepted = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode,
    profile: { themeColorPrimary: '#ff6ec7', themeColorSecondary: '#4a73ff' },
  }), env, context());
  assert.equal(accepted.status, 200);

  const acceptedAgain = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { themeColorPrimary: '#ff6ec7' },
  }), env, context());
  assert.equal(acceptedAgain.status, 200);

  const mediaRejected = await worker.fetch(request('/profile', 'POST', {
    userId, claimCode, profile: { bannerUrl: 'https://cdn.example.test/banner.png' },
  }), env, context());
  assert.equal(mediaRejected.status, 403);
  assert.match((await jsonResponse(mediaRejected)).body.error, /requires tier 1/i);
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
