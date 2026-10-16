#!/usr/bin/env node
/* Guarded pilot contract: the verified Classic TV manifest can serve queue and
 * guide data only when the explicit flag is on, without touching the relay. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const { default: worker } = await import(pathToFileURL(path.join(__dirname, '..', 'realsignal_api_v2_worker.js')));
  const batches = [];
  let fetchCalls = 0;
  const env = {
    IA_CANONICAL_PILOT: 'on',
    IA_CANONICAL_PILOT_CHANNELS: '10',
    realsignal_catalog: {
      prepare(sql) {
        return {
          bind() {
            return {
              async all() { return { results: /channel_freshness/.test(sql) ? [] : [] }; },
              async first() { return null; },
            };
          },
        };
      },
      async batch(statements) { batches.push(statements); },
    },
    RELAY: 'https://relay.invalid',
  };
  const ctx = { waitUntil(promise) { return promise; } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('relay should not be called by canonical pilot'); };
  try {
    const queue = await worker.fetch(new Request('https://api.example/api/v3/ia/queue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 10, count: 2, rotation: 1, recentIds: [] }),
    }), env, ctx);
    assert.equal(queue.status, 200);
    const queueBody = await queue.json();
    assert.equal(queueBody.canonicalPilot, true);
    assert.equal(queueBody.canonicalProfileKey, 'classic-tv');
    assert.ok(queueBody.items.length >= 1 && queueBody.items.length <= 2);
    assert.ok(queueBody.catalogDepth >= 12);
    assert.equal(queue.headers.get('X-RealSignal-Source'), 'ia-canonical-pilot');

    const guide = await worker.fetch(new Request('https://api.example/api/v3/guide?channel=10&limit=4'), env, ctx);
    assert.equal(guide.status, 200);
    const guideBody = await guide.json();
    assert.equal(guideBody.canonicalPilot, true);
    assert.equal(guideBody.source, 'ia-canonical-manifest');
    assert.equal(guideBody.current.provider, 'Internet Archive');
    assert.ok(guideBody.next);
    assert.ok(guideBody.catalogDepth >= 12);
    assert.equal(fetchCalls, 0);
    assert.ok(batches.length >= 1, 'verified manifest should persist in the background');
    console.log('IA canonical pilot passed: feature flag, relay bypass, queue, guide, and background catalog persistence.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  /* Shadow reporting must be allowed for an underfilled manifest so it can
     prove why promotion is blocked. This flag cannot alter normal playback. */
  let shadowFetchCalls = 0;
  const shadowEnv = {
    IA_CANONICAL_SHADOW: 'on',
    IA_CANONICAL_SHADOW_CHANNELS: '150',
    RELAY: 'https://relay.example',
    realsignal_catalog: env.realsignal_catalog,
  };
  shadowEnv.RELAY = {
    async fetch() {
      shadowFetchCalls += 1;
      return new Response(JSON.stringify({
        source: 'relay', ready: 5, candidates: 20, catalogDepth: 20,
        items: [{ id: 'live-1', title: 'Public fallback item', url: 'https://archive.org/download/live-1/live-1.mp4' }],
        candidateItems: [{ id: 'live-1', title: 'Public fallback item', url: 'https://archive.org/download/live-1/live-1.mp4' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
  try {
    const normalQueue = await worker.fetch(new Request('https://api.example/api/v3/ia/queue', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 150, count: 2 }),
    }), shadowEnv, ctx);
    assert.equal(normalQueue.status, 200, 'shadow flag must not reroute the normal queue');

    const shadow = await worker.fetch(new Request('https://api.example/api/v3/ia/canonical/shadow', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 150, count: 5, recentIds: [] }),
    }), shadowEnv, ctx);
    assert.equal(shadow.status, 200);
    const shadowBody = await shadow.json();
    assert.equal(shadowBody.promotion.eligible, false, 'an underfilled/unbalanced shadow manifest must stay blocked');
    assert.ok(shadowBody.promotion.reasons.length > 0);
    assert.equal(shadowBody.comparison.promotionDecision, 'hold');
    assert.ok(shadowFetchCalls >= 2, 'both public queue and shadow comparison must call the live fallback independently');
    console.log('IA canonical shadow passed: underfilled gate is reported and normal playback remains on the relay.');
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
