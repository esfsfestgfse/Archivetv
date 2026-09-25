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
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
