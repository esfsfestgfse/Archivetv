#!/usr/bin/env node
/* V3 contract test: the release gate must expose versioned health, bounded
 * telemetry ingestion, verified guide data, and never make telemetry a hard
 * dependency of playback. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const { default: worker } = await import(pathToFileURL(path.join(__dirname, '..', 'realsignal_api_v2_worker.js')));
  const batches = [];
  const env = {
    realsignal_catalog: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                if (/FROM channel_health/.test(sql)) return { results: [{ channel_key: '12', failures: 0, first_frame_avg_ms: 420, queue_avg_depth: 8 }] };
                if (/FROM programs/.test(sql)) return { results: [{ id: 'p1', title: 'Verified Program', provider: 'Internet Archive', media_url: 'https://archive.org/download/p1/p1.mp4', last_seen_at: Date.now(), channel_key: args[0], catalog_depth: 17, unseen_count: 12 }] };
                return { results: [] };
              },
              async first() { return null; },
            };
          },
        };
      },
      async batch(statements) { batches.push(statements); },
    },
  };
  const ctx = { waitUntil(promise) { return promise; } };

  const health = await worker.fetch(new Request('https://api.example/api/v3/health'), env, ctx);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.apiVersion, 'v3');
  assert.equal(healthBody.release, '4.0.13-source-deep-lane-admission');
  assert.ok(healthBody.capabilities.includes('server-telemetry'));
  assert.ok(healthBody.capabilities.includes('verified-guide'));

  const telemetry = await worker.fetch(new Request('https://api.example/api/v3/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.10' },
    body: JSON.stringify({ surface: 'desktop', events: [
      { type: 'first-visible-frame', channel: 12, ms: 420, depth: 8 },
      { type: 'source-failure', channel: 12, source: 'internet-archive', status: 'timeout' },
    ] }),
  }), env, ctx);
  assert.equal(telemetry.status, 202);
  assert.equal((await telemetry.json()).accepted, 2);
  assert.equal(batches.length, 1);
  assert.ok(batches[0].length >= 4);

  const guide = await worker.fetch(new Request('https://api.example/api/v3/guide?channel=12'), env, ctx);
  assert.equal(guide.status, 200);
  const guideBody = await guide.json();
  assert.equal(guideBody.verified, true);
  assert.equal(guideBody.current.title, 'Verified Program');
  assert.equal(guideBody.current.provider, 'Internet Archive');
  assert.equal(guideBody.catalogDepth, 17);
  assert.equal(guideBody.unseenCount, 12);
  assert.equal(guideBody.seenCount, 5);
  assert.equal(guideBody.catalogExhausted, false);

  const scorecard = await worker.fetch(new Request('https://api.example/api/v3/health/channels?limit=10'), env, ctx);
  assert.equal(scorecard.status, 200);
  assert.equal((await scorecard.json()).channels[0].channel_key, '12');

  const summary = await worker.fetch(new Request('https://api.example/api/v3/health/summary?hours=24&limit=10'), env, ctx);
  assert.equal(summary.status, 200);
  const summaryBody = await summary.json();
  assert.equal(summaryBody.apiVersion, 'v3');
  assert.equal(summaryBody.channels[0].score, 100);
  assert.ok(Array.isArray(summaryBody.sources));
  assert.ok(Array.isArray(summaryBody.surfaces));

  const tooLarge = await worker.fetch(new Request('https://api.example/api/v3/telemetry', { method: 'POST', body: JSON.stringify({ events: [{ type: 'stall', channel: 12, padding: 'x'.repeat(140000) }] }) }), env, ctx);
  assert.equal(tooLarge.status, 413);
  console.log('V3 API contract passed: health, bounded telemetry, verified guide, scorecard, and non-blocking writes.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
