#!/usr/bin/env node
/* Proves the browser bridge prefers the server catalog and does not fall back
   to direct YouTube calls when the Worker reports no YouTube secret. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'source-catalog-client.js'), 'utf8');
const calls = [];
const original = async name => ({ provider: name, items: [{ id: 'client-fallback' }] });
const context = {
  window: { v2Provider: original },
  IA_API_BASE: 'https://api.example/api/v2',
  setTimeout: () => 0,
  clearTimeout: () => {},
  fetch: async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, async json() { return { source: 'server-source-catalog', items: [{ id: 'server-item', type: 'video', duration: 1200 }], providerAvailability: { youtube: false, peertube: true } }; } };
  },
};
context.window.fetch = context.fetch;
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const profile = { profileKey: 'game-show-archive', name: 'Game Show Archive', providers: ['peertube', 'youtube'], queries: ['full episode'], match: ['episode'], deny: [] };
  const serverLane = await context.window.v2Provider('peertube', profile, 0, null);
  assert.equal(serverLane.items[0].id, 'server-item');
  const youtubeLane = await context.window.v2Provider('youtube', profile, 0, null);
  assert.equal(youtubeLane.items.length, 0);
  assert.equal(youtubeLane.health.skipped, 'youtube-provider-unconfigured');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { profileKey: 'game-show-archive', rotation: 0, minimumReady: 2 });
  console.log('Source catalog bridge passed: server preference and server-only YouTube handling.');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
