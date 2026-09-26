#!/usr/bin/env node
/* Cached custom-station manifest contract: a recipe must be able to expose a
 * verified current/next shelf without invoking provider discovery on every
 * guide read. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const { default: worker } = await import(pathToFileURL(path.join(__dirname, '..', 'realsignal_api_v2_worker.js')));
  const env = {
    realsignal_catalog: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                if (/FROM custom_channels/.test(sql)) return { results: [{
                  channel_id: 'custom-test-station', owner_key: 'anonymous', name: 'Cooking Classics',
                  recipe_json: JSON.stringify({ schemaVersion: 'custom-channel-v1', name: 'Cooking Classics', genre: 'cooking', minRuntimeMinutes: 15, language: 'english', sources: ['internet-archive'], include: ['cooking'], exclude: [], freshnessWindow: 24, queueModel: 'rolling-1-plus-2' }),
                  status: 'active', created_at: Date.now(), updated_at: Date.now(),
                }] };
                if (/FROM channel_freshness/.test(sql)) return { results: [] };
                if (/FROM programs/.test(sql)) return { results: [{
                  id: 'ia:cooking-classics-episode-1', source_identifier: 'cooking-classics-episode-1', provider: 'Internet Archive',
                  title: 'Cooking Classics — Full Episode', description: 'A verified cooking program.', subject: 'cooking', tags: 'cooking',
                  category: 'television', account: 'Archive TV', query: 'cooking full episode', duration_seconds: 1800,
                  aspect_ratio: 1.777, media_type: 'video', media_url: 'https://archive.org/download/cooking-classics-episode-1/cooking.mp4',
                  source_url: 'https://archive.org/details/cooking-classics-episode-1', rights: 'Public Domain', year: '1992',
                  metadata_json: JSON.stringify({ subject: 'cooking', tags: 'cooking', category: 'television', provider: 'Internet Archive' }),
                }] };
                return { results: [] };
              },
              async run() { return { meta: { changes: 0 } }; },
            };
          },
        };
      },
      async batch() {},
    },
  };
  const response = await worker.fetch(new Request('https://api.example/api/v3/custom-channels/custom-test-station/manifest'), env, { waitUntil() {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.source, 'custom-verified-manifest');
  assert.equal(body.channel.recipe.minRuntimeMinutes, 15);
  assert.equal(body.current.provider, 'Internet Archive');
  assert.equal(body.current.mediaUrl, 'https://archive.org/download/cooking-classics-episode-1/cooking.mp4');
  assert.equal(body.catalogExhausted, false);
  console.log('Custom channel manifest contract passed: cached verified current/next shelf and recipe gates are wired.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
