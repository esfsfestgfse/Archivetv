const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
async function fixture() {
  const { SessionRotation } = await import(pathToFileURL(path.join(__dirname, '../realsignal_api_rotation.js')));
  const data = new Map(); let tail = Promise.resolve();
  const storage = { get: async key => { if (Array.isArray(key)) { assert.ok(key.length <= 128, 'storage read batch limit'); return new Map(key.map(k => [k, structuredClone(data.get(k))])); } return structuredClone(data.get(key)); }, put: async (key, value) => {
    const entries = typeof key === 'object' ? Object.entries(key) : [[key, value]];
    assert.ok(entries.length <= 128, 'storage write batch limit');
    for (const [k, v] of entries) { assert.ok(Buffer.byteLength(JSON.stringify(v)) < 128 * 1024, 'storage per-value limit'); data.set(k, structuredClone(v)); }
  }, delete: async keys => { assert.ok(!Array.isArray(keys) || keys.length <= 128, 'storage delete batch limit'); (Array.isArray(keys) ? keys : [keys]).forEach(k => data.delete(k)); }, transaction: async fn => fn(storage) };
  const object = new SessionRotation({ storage, blockConcurrencyWhile(fn) { const work = tail.then(fn); tail = work.catch(() => {}); return work; } }, {});
  const send = async body => (await object.fetch(new Request('https://state.internal', { method: 'POST', body: JSON.stringify({ mode: 'ia-state', ...body }) }))).json();
  return { send, data, object };
}

test('deep session reservations survive the storage value limit and a restart', async () => {
  const f = await fixture();
  const items = Array.from({ length: 500 }, (_, i) => ({ identifier: 'series::episode-' + i + '.mp4', title: 'Television full episode ' + i,
    description: 'Archive editorial metadata '.repeat(30), language: 'eng',
    media: { type: 'video', url: 'https://archive.org/download/series/episode-' + i + '.mp4', runtime: 1320, width: 640, height: 480, verification: 'transport', verifiedAt: Date.now() } }));
  const send = async body => (await f.object.fetch(new Request('https://state.internal', { method: 'POST', body: JSON.stringify(body) }))).json();
  const first = await send({ mode: 'reserve', items, count: 3, rules: { channel: '10', iaRepair: true } });
  assert.equal(first.catalogSize, 500);
  await send({ mode: 'commit', id: first.items[0].identifier, event: 'skipped' });
  const { SessionRotation } = await import(pathToFileURL(path.join(__dirname, '../realsignal_api_rotation.js')));
  f.object = new SessionRotation(f.object.ctx, {});
  const next = await send({ mode: 'reserve', count: 3, rules: { channel: '10', iaRepair: true } });
  assert.equal(next.catalogSize, 500);
  assert.equal(next.seen, 1);
  assert.equal(next.items.some(x => x.identifier === first.items[0].identifier), false);
  assert.equal(next.items[0].identifier, first.items[1].identifier);
});
test('concurrent catalog updates preserve both discoveries, not last-writer wins', async () => {
  const f = await fixture(), row = id => ({ identifier: id, title: 'Episode ' + id, media: { url: 'https://archive.org/download/' + id + '/episode.mp4' } });
  await f.send({ kind: 'catalog', payload: { items: [row('base')], candidateItems: [row('base')] } });
  await Promise.all(['a', 'b'].map(id => f.send({ kind: 'catalog', payload: { items: [row(id)], candidateItems: [row(id)] } })));
  const state = await f.send({ kind: 'catalog', read: true });
  assert.deepEqual(state.candidateItems.map(x => x.identifier), ['base', 'a', 'b']);
});

test('two cold relay isolates use the durable owner for a three-item shelf', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), owner = await fixture(), pending = [];
  const key = 'ia:last-good:file-1%3Afamily', kv = new Map();
  const env = { IA_STATE_OWNER: { getByName: () => owner.object }, REALSIGNAL_QUEUE: { get: async k => kv.get(k), put: async (k, value) => kv.set(k, JSON.parse(value)) } };
  const ctx = { iaRepair: true, waitUntil: work => pending.push(work) };
  for (const lane of ['A', 'B']) {
    const scope = { console, URL, URLSearchParams, Request, Response, Headers, AbortController, AbortSignal, TextEncoder, TextDecoder, Date, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto };
    vm.createContext(scope);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../afterglow_ais_relay_worker.js'), 'utf8').replace('export default', 'const worker =') + '\nglobalThis.f={sharedQueuePut,sharedQueueGet};', scope);
    const items = Array.from({ length: 3 }, (_, i) => ({ identifier: lane + i, media: { url: 'https://archive.org/download/' + lane + i + '/episode.mp4' } }));
    scope.f.sharedQueuePut(env, 'exact-' + lane, { ready: 3, channel: '10', items, candidateItems: items, lastGoodKey: key }, 3600, ctx);
    if (lane === 'B') {
      await Promise.all(pending);
      assert.equal((await scope.f.sharedQueueGet(env, key)).candidateItems.length, 6);
    }
  }
});
test('concurrent played ledgers merge and keep the newest acknowledgement', async () => {
  const f = await fixture();
  await Promise.all([['a', 1], ['b', 2], ['a', 3]].map(([id, issuedAt]) => f.send({ kind: 'ledger', payload: { items: [{ id, issuedAt }] } })));
  const state = await f.send({ kind: 'ledger', read: true });
  assert.deepEqual(state.items.map(x => [x.id, x.issuedAt]), [['b', 2], ['a', 3]]);
});
test('large durable catalogs are stored below the per-value storage limit', async () => {
  const f = await fixture();
  const items = Array.from({ length: 1800 }, (_, i) => ({ identifier: 'item-' + i, description: 'x'.repeat(1000) }));
  await f.send({ kind: 'catalog', payload: { items: items.slice(0, 3), candidateItems: items } });
  assert.equal((await f.send({ kind: 'catalog', read: true })).candidateItems.length, 1800);
  for (const value of f.data.values()) assert.ok(Buffer.byteLength(JSON.stringify(value)) < 128 * 1024);
});
