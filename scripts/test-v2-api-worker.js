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
      return new Response(JSON.stringify({ ready: 5, items: [1, 2, 3, 4, 5].map(id => ({ identifier: `ia-${id}`, title: `Game Show Program ${id}`, media: { url: `https://archive.org/download/x/${id}.mp4`, type: 'video' } })) }), { headers: { 'Content-Type': 'application/json' } });
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
    if (url.includes('youtube/v3/channels?part=contentDetails&forHandle=')) {
      return new Response(JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'uploads-sports' } } }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('youtube/v3/playlistItems?part=snippet&playlistId=uploads-sports')) {
      return new Response(JSON.stringify({ items: [{ snippet: { title: 'Game Highlights', resourceId: { videoId: 'sports-1' } } }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://www.googleapis.com/youtube/v3/search')) {
      return new Response(JSON.stringify({ items: [{ id: { videoId: 'source-1' }, snippet: { title: 'Classic Television Game Show Archive 1975 Full Episode', description: 'A full classic television game show archive episode.', channelTitle: 'Archive TV', publishedAt: '1975-01-01T00:00:00Z' } }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://www.googleapis.com/youtube/v3/videos')) {
      return new Response(JSON.stringify({ items: [{ id: 'source-1', snippet: { title: 'Classic Television Game Show Archive 1975 Full Episode', description: 'A full classic television game show archive episode.', channelTitle: 'Archive TV', publishedAt: '1975-01-01T00:00:00Z' }, contentDetails: { duration: 'PT20M' }, status: { embeddable: true }, player: { embedWidth: 1280, embedHeight: 720 } }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/v1/search/videos')) {
      return new Response(JSON.stringify({ data: [{ uuid: 'pt-source-1', url: 'https://tube.example/videos/watch/pt-source-1', name: 'Classic Television Game Show Archive 1975 Full Episode', truncatedDescription: 'A public classic television game show archive episode.', category: { label: 'Entertainment' }, licence: { label: 'Attribution' }, duration: 1200 }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('tube.example/api/v1/videos/')) {
      return new Response(JSON.stringify({ duration: 1200, licence: { label: 'Attribution' }, files: [{ fileUrl: 'https://tube.example/static/game-show.mp4', hasVideo: true, mimetype: 'video/mp4', width: 1280, height: 720 }] }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected source test fetch ${url}`);
  };
  const unknownProfile = await worker.fetch(new Request('https://api.example/api/v2/source/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: 'caller-invented-channel', providers: ['youtube'], queries: ['anything'], match: ['anything'], deny: [], rotation: 0 }) }), { ...env, YOUTUBE_API_KEY: 'unit-test-key' }, ctx);
  assert.equal(unknownProfile.status, 404);
  const source = await worker.fetch(new Request('https://api.example/api/v2/source/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: 'game-show-archive', providers: ['youtube'], queries: ['caller cannot replace these'], match: ['caller cannot replace these'], deny: [''], rotation: 0 }) }), { ...env, YOUTUBE_API_KEY: 'unit-test-key' }, ctx);
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

  const staleSourceCatalogEnv = {
    ...env,
    realsignal_catalog: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: [
                  { id: 'stale-source-1', source_identifier: 'stale-source-1', title: 'Stale Short Cache Row', description: 'Missing hydrated playback metadata.', provider: 'YouTube', duration_seconds: 0, aspect_ratio: 0, media_type: 'embed', media_url: 'https://www.youtube-nocookie.com/embed/stale-source-1', source_url: 'https://youtube.com/watch?v=stale-source-1', rights: 'Standard YouTube license', year: '2026', metadata_json: '{}' },
                  { id: 'wrong-source-2', source_identifier: 'wrong-source-2', title: 'Unrelated Nature Documentary', description: 'A valid-length item from the wrong genre.', provider: 'YouTube', duration_seconds: 1800, aspect_ratio: 1.78, media_type: 'embed', media_url: 'https://www.youtube-nocookie.com/embed/wrong-source-2', source_url: 'https://youtube.com/watch?v=wrong-source-2', rights: 'Standard YouTube license', year: '2026', metadata_json: '{}' },
                ] };
              },
            };
          },
        };
      },
    },
  };
  const sourceFetch = global.fetch;
  global.fetch = async () => { throw new Error('source providers unavailable'); };
  const staleSourceCatalog = await worker.fetch(new Request('https://api.example/api/v2/source/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: 'game-show-archive', rotation: 0, minimumReady: 2 }) }), staleSourceCatalogEnv, ctx);
  global.fetch = sourceFetch;
  assert.equal(staleSourceCatalog.status, 503);

  const sportsHighlights = await worker.fetch(new Request('https://api.example/api/v2/youtube/uploads?handle=NBA'), { ...env, YOUTUBE_API_KEY: 'unit-test-key' }, ctx);
  assert.equal(sportsHighlights.status, 200);
  assert.equal((await sportsHighlights.json()).items[0].snippet.resourceId.videoId, 'sports-1');
  const unapprovedYouTube = await worker.fetch(new Request('https://api.example/api/v2/youtube/uploads?handle=unapproved'), { ...env, YOUTUBE_API_KEY: 'unit-test-key' }, ctx);
  assert.equal(unapprovedYouTube.status, 404);
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

  const fallbackEnv = {
    ...env,
    RELAY: { async fetch() { return new Response(JSON.stringify({ error: 'relay unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }); } },
    realsignal_catalog: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: [{ id: 'factory-1', source_identifier: 'factory-1', title: 'Factory Packaging Line', description: 'A verified production floor program.', provider: 'internet-archive', duration_seconds: 1800, aspect_ratio: 1.78, media_type: 'video', media_url: 'https://archive.org/download/factory-1/factory-1.mp4', source_url: 'https://archive.org/details/factory-1', rights: 'public domain', year: '1980', metadata_json: '{}' }] };
              },
            };
          },
        };
      },
    },
  };
  const recovered = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: '200', sessionId: 'fallback-viewer', rotation: 0, count: 1, themeTerms: ['factory'], requiredTitleTerms: ['factory'], denyTerms: ['cartoon'], mediaTypes: ['movies'], themeMinScore: 1 }) }), fallbackEnv, ctx);
  assert.equal(recovered.status, 200);
  assert.match(recovered.headers.get('X-RealSignal-Source'), /d1-catalog/);
  assert.equal((await recovered.json()).items[0].title, 'Factory Packaging Line');

  const shallowRecoveryEnv = {
    ...fallbackEnv,
    RELAY: { async fetch() { return new Response(JSON.stringify({ ready: 0, items: [] }), { status: 200, headers: { 'content-type': 'application/json' } }); } },
  };
  const shallowRecovered = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: '200', sessionId: 'shallow-fallback-viewer', rotation: 0, count: 1, themeTerms: ['factory'], requiredTitleTerms: ['factory'], denyTerms: ['cartoon'], mediaTypes: ['movies'], themeMinScore: 1 }) }), shallowRecoveryEnv, ctx);
  assert.equal(shallowRecovered.status, 200);
  assert.match(shallowRecovered.headers.get('X-RealSignal-Source'), /d1-catalog/);
  assert.equal((await shallowRecovered.json()).items[0].title, 'Factory Packaging Line');

  let fastLaneRelayCalls = 0;
  const fastLaneEnv = {
    ...fallbackEnv,
    RELAY: { async fetch() { fastLaneRelayCalls += 1; return new Response(JSON.stringify({ ready: 0, items: [] }), { status: 503, headers: { 'content-type': 'application/json' } }); } },
  };
  const fastLane = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: '64', sessionId: 'fast-lane-viewer', rotation: 0, count: 1, themeTerms: ['factory'], requiredTitleTerms: ['factory'], denyTerms: ['cartoon'], mediaTypes: ['movies'], themeMinScore: 1 }) }), fastLaneEnv, ctx);
  assert.equal(fastLane.status, 200);
  assert.match(fastLane.headers.get('X-RealSignal-Source'), /d1-catalog-fast-lane/);
  assert.equal(fastLaneRelayCalls, 0);
  assert.equal((await fastLane.json()).items[0].title, 'Factory Packaging Line');

  const shallowSourceRows = [
    { id: 'source-stale-1', source_identifier: 'source-stale-1', title: 'Game Show Archive Full Episode', description: 'A verified long-form game show.', provider: 'YouTube', duration_seconds: 1500, aspect_ratio: 1.78, media_type: 'embed', media_url: 'https://www.youtube-nocookie.com/embed/source-stale-1', source_url: 'https://youtube.com/watch?v=source-stale-1', rights: 'Standard YouTube license', year: '1978', metadata_json: '{"genreVerified":true}' },
    { id: 'source-stale-2', source_identifier: 'source-stale-2', title: 'Game Show Archive Special', description: 'A second verified long-form game show.', provider: 'YouTube', duration_seconds: 1800, aspect_ratio: 1.78, media_type: 'embed', media_url: 'https://www.youtube-nocookie.com/embed/source-stale-2', source_url: 'https://youtube.com/watch?v=source-stale-2', rights: 'Standard YouTube license', year: '1984', metadata_json: '{"genreVerified":true}' },
  ];
  const queuedSourceRefreshes = [];
  const shallowSourceEnv = {
    ...env,
    realsignal_catalog: { prepare() { return { bind() { return { async all() { return { results: shallowSourceRows }; } }; } }; } },
  };
  const shallowSourceCtx = { waitUntil(promise) { queuedSourceRefreshes.push(promise); } };
  const sourceFetchAfterStale = global.fetch;
  global.fetch = async () => { throw new Error('source providers unavailable'); };
  const shallowSource = await worker.fetch(new Request('https://api.example/api/v2/source/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: 'game-show-archive', rotation: 0, minimumReady: 12 }) }), shallowSourceEnv, shallowSourceCtx);
  global.fetch = sourceFetchAfterStale;
  assert.equal(shallowSource.status, 200);
  const shallowSourceBody = await shallowSource.json();
  assert.equal(shallowSourceBody.items.length, 2);
  assert.equal(shallowSourceBody.hydrating, true);
  assert.equal(shallowSourceBody.staleCatalog, true);
  assert.equal(queuedSourceRefreshes.length, 1);

  const collectionEpisodeRows = [
    ['metallica-collection::track-01', 'Kill Em All · 01 Hit the Lights'],
    ['black-sabbath-metal-collection::track-02', 'Paranoid · 02 War Pigs'],
    ['ozzy-metal-collection::track-03', 'Live Archive · 03 Crazy Train'],
    ['motorhead-metal-collection::track-04', '1916 · 04 Going to Brazil'],
    ['slayer-metal-collection::track-05', 'Reign in Blood · 05 Altar of Sacrifice'],
  ].map(([id, title]) => ({ id, source_identifier: id.split('::')[0], title, description: '', provider: 'internet-archive', duration_seconds: null, aspect_ratio: null, media_type: 'audio', media_url: `https://archive.org/download/metal/${encodeURIComponent(id)}.mp3`, metadata_json: '{}' }));
  const collectionFallbackEnv = {
    ...shallowRecoveryEnv,
    realsignal_catalog: {
      prepare() {
        return { bind() { return { async all() { return { results: collectionEpisodeRows }; } }; } };
      },
    },
  };
  const collectionRecovered = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: '917', sessionId: 'metal-collection-viewer', rotation: 0, count: 5, themeTerms: ['metal'], mediaTypes: ['audio'], themeMinScore: 2 }) }), collectionFallbackEnv, ctx);
  assert.equal(collectionRecovered.status, 200);
  assert.equal((await collectionRecovered.json()).items.length, 5);

  const aliasFallbackRows = [
    ['the-soul-of-black-charley-1080p', 'The Soul of Black Charley'],
    ['fight-for-your-life-1977', 'Fight for Your Life'],
    ['abby-1974_202605', 'Abby'],
    ['The_Brother_from_Another_Planet_1984', 'The Brother from Another Planet (1984)'],
    ['Fighting_Mad_MPEG', 'Fighting Mad (1978)'],
  ].map(([id, title]) => ({ id, source_identifier: id, title, description: '', provider: 'internet-archive', media_type: 'video', media_url: `https://archive.org/download/film/${encodeURIComponent(id)}.mp4`, metadata_json: '{}' }));
  const aliasFallbackEnv = {
    ...shallowRecoveryEnv,
    realsignal_catalog: {
      prepare() {
        return { bind() { return { async all() { return { results: aliasFallbackRows }; } }; } };
      },
    },
  };
  const aliasRecovered = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: '116', sessionId: 'blaxploitation-viewer', rotation: 0, count: 5, themeTerms: ['blaxploitation'], mediaTypes: ['movies'], themeMinScore: 2 }) }), aliasFallbackEnv, ctx);
  assert.equal(aliasRecovered.status, 200);
  assert.equal((await aliasRecovered.json()).items.length, 5);

  const search = await worker.fetch(new Request('https://api.example/api/v2/ia/search?q=cartoons'), env, ctx);
  assert.equal(search.status, 200);
  assert.equal(calls.at(-1).url, 'https://relay.internal/ia/search?q=cartoons');
  assert.equal(calls.at(-1).method, 'GET');

  const tooLarge = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', body: JSON.stringify({ channel: '12', padding: 'x'.repeat(140000) }) }), env, ctx);
  assert.equal(tooLarge.status, 413);
  const badJson = await worker.fetch(new Request('https://api.example/api/v2/ia/queue', { method: 'POST', body: '{' }), env, ctx);
  assert.equal(badJson.status, 400);

  let limited;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    limited = await worker.fetch(new Request('https://api.example/api/v2/source/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.7' },
      body: JSON.stringify({ profileKey: 'caller-invented-channel', rotation: attempt }),
    }), env, ctx);
  }
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) >= 1);

  console.log('V2 API contract passed: bounded input, relay forwarding, session isolation, rotation, and queue enqueue.');
})().catch(error => { console.error(error); process.exitCode = 1; });
