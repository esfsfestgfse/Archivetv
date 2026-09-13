#!/usr/bin/env node
/* Fast Node contract test for the V2 API. This exercises routing, bounded
 * input, session isolation, repeat suppression, and relay fallback seams. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const { default: worker, SessionRotation } = await import(pathToFileURL(path.join(__dirname, '..', 'realsignal_api_v2_worker.js')));
  const rotations = new Map();
  const calls = [];
  const queueMessages = [];
  const env = {
    RELAY: { async fetch(request) {
      calls.push({ url: request.url, method: request.method, body: request.method === 'POST' ? await request.text() : '' });
      return new Response(JSON.stringify({ ready: 5, items: [1, 2, 3, 4, 5].map(id => ({ identifier: `ia-${id}`, title: `Program ${id}`, media: { url: `https://archive.org/download/x/${id}.mp4`, type: 'video' } })) }), { headers: { 'Content-Type': 'application/json' } });
    } },
    ROTATION: { getByName(name) {
      if (!rotations.has(name)) {
        const values = new Map();
        const ctx = { storage: { async get(key) { return values.get(key); }, async put(key, value) { values.set(key, value); } } };
        rotations.set(name, new SessionRotation(ctx, {}));
      }
      return { fetch: request => rotations.get(name).fetch(request) };
    } },
    realsignal_catalog_refresh: { async send(body) { queueMessages.push(body); } },
  };
  const ctx = { waitUntil(promise) { return promise; } };

  const health = await worker.fetch(new Request('https://api.example/api/v2/health'), env, ctx);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.apiVersion, 'v2');
  assert.equal(healthBody.bindings.rotation, true);
  assert.ok(healthBody.capabilities.includes('source-catalog'));

  const nativeFetch = global.fetch;
  global.fetch = async request => {
    const url = String(request);
    if (url.startsWith('https://www.googleapis.com/youtube/v3/search')) {
      return new Response(JSON.stringify({ items: [{ id: { videoId: 'source-1' }, snippet: { title: 'The Game Show 1975 Full Episode', description: 'A full television game show episode.', channelTitle: 'Archive TV', publishedAt: '1975-01-01T00:00:00Z' } }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://www.googleapis.com/youtube/v3/videos')) {
      return new Response(JSON.stringify({ items: [{ id: 'source-1', snippet: { title: 'The Game Show 1975 Full Episode', description: 'A full television game show episode.', channelTitle: 'Archive TV', publishedAt: '1975-01-01T00:00:00Z' }, contentDetails: { duration: 'PT20M' }, status: { embeddable: true }, player: { embedWidth: 1280, embedHeight: 720 } }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/v1/search/videos')) {
      return new Response(JSON.stringify({ data: [{ uuid: 'pt-source-1', url: 'https://tube.example/videos/watch/pt-source-1', name: 'The Game Show 1975 Full Episode', truncatedDescription: 'A public game show episode.', category: { label: 'Entertainment' }, licence: { label: 'Attribution' }, duration: 1200 }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('tube.example/api/v1/videos/')) {
      return new Response(JSON.stringify({ duration: 1200, licence: { label: 'Attribution' }, files: [{ fileUrl: 'https://tube.example/static/game-show.mp4', hasVideo: true, mimetype: 'video/mp4', width: 1280, height: 720 }] }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected source test fetch ${url}`);
  };
  const source = await worker.fetch(new Request('https://api.example/api/v2/source/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: 'game-show-archive', providers: ['youtube'], queries: ['game show full episode'], match: ['game show'], deny: [], rotation: 0 }) }), { ...env, YOUTUBE_API_KEY: 'unit-test-key' }, ctx);
  assert.equal(source.status, 200);
  const sourceBody = await source.json();
  assert.equal(sourceBody.source, 'server-source-catalog');
  assert.equal(sourceBody.items[0].type, 'embed');
  assert.equal(sourceBody.items[0].duration, 1200);
  const peerTube = await worker.fetch(new Request('https://api.example/api/v2/source/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: 'game-show-archive', providers: ['peertube'], queries: ['game show full episode'], match: ['game show'], deny: [], rotation: 0 }) }), env, ctx);
  assert.equal(peerTube.status, 200);
  const peerTubeBody = await peerTube.json();
  assert.equal(peerTubeBody.items[0].provider, 'PeerTube');
  assert.equal(peerTubeBody.items[0].url, 'https://tube.example/static/game-show.mp4');
  global.fetch = nativeFetch;
  assert.equal(queueMessages.length, 2);

  const payload = { channel: '12', sessionId: 'viewer-a', rotation: 0, count: 3, themeTerms: ['game show'], items: [] };
  const first = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }), env, ctx);
  assert.equal(first.status, 200);
  assert.deepEqual((await first.clone().json()).items.map(item => item.identifier), ['ia-1', 'ia-2', 'ia-3']);
  assert.match(first.headers.get('X-RealSignal-Source'), /session-rotation/);
  assert.equal(queueMessages.length, 3);

  const second = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }), env, ctx);
  assert.deepEqual((await second.json()).items.map(item => item.identifier), ['ia-4', 'ia-5']);

  const otherViewer = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, sessionId: 'viewer-b' }) }), env, ctx);
  assert.deepEqual((await otherViewer.json()).items.map(item => item.identifier), ['ia-1', 'ia-2', 'ia-3']);

  const search = await worker.fetch(new Request('https://api.example/api/v2/ia/search?q=cartoons'), env, ctx);
  assert.equal(search.status, 200);
  assert.equal(calls.at(-1).url, 'https://relay.internal/ia/search?q=cartoons');
  assert.equal(calls.at(-1).method, 'GET');

  const tooLarge = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', body: JSON.stringify({ channel: '12', padding: 'x'.repeat(140000) }) }), env, ctx);
  assert.equal(tooLarge.status, 413);
  const badJson = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', body: '{' }), env, ctx);
  assert.equal(badJson.status, 400);

  console.log('V2 API contract passed: bounded input, relay forwarding, session isolation, rotation, and queue enqueue.');
})().catch(error => { console.error(error); process.exitCode = 1; });
