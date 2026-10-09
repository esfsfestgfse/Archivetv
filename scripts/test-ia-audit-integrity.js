/* Behavioral regressions from the October 9 IA audit. Network/storage edges
   are doubled; the production relay and rotation implementation run unchanged. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');

function relayFixture(initial = []) {
  const storage = new Map(initial), writes = [], pending = [];
  const sandbox = { console, URL, URLSearchParams, Request, Response, Headers,
    AbortController, AbortSignal, TextEncoder, TextDecoder, Date, setTimeout,
    clearTimeout, crypto: require('node:crypto').webcrypto,
    fetch: () => { throw new Error('unexpected network call in integrity test'); } };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8').replace('export default', 'const worker =');
  vm.runInContext(source + '\nglobalThis.contract = {recordIaPlayed, rememberIaFreshness, loadIaFreshnessLedger, iaFreshnessLedgerKey, mergeIaCatalogCandidates, sharedQueuePut};', sandbox);
  return { ...sandbox.contract, storage, writes,
    env: { REALSIGNAL_QUEUE: {
      get: async key => storage.get(key) || null,
      put: async (key, value) => { writes.push(key); storage.set(key, JSON.parse(value)); },
    } }, ctx: { waitUntil: promise => pending.push(promise) },
    flush: () => Promise.all(pending),
  };
}
function item(id, family = 'A') {
  return { identifier: `audit-${family}::${id}.mp4`, title: `${family} ${id}`, seriesId: family,
    media: { type: 'video', url: `https://archive.org/download/audit-${family}/${id}.mp4` } };
}
async function rotationFixture(seed) {
  const { SessionRotation } = await import(pathToFileURL(path.join(root, 'realsignal_api_rotation.js')));
  let saved = seed;
  const rotation = new SessionRotation({ storage: {
    get: async () => saved, put: async (_key, value) => { saved = structuredClone(value); },
  } }, {});
  return { saved: () => saved, select: async body => {
    const response = await rotation.fetch(new Request('https://rotation.internal/select', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal(response.status, 200); return response.json();
  } };
}

test('decoded played event survives a relay restart; queued rows do not become watched', async () => {
  const f = relayFixture(), played = item('episode-1');
  const response = await f.recordIaPlayed(new Request('https://relay.invalid/ia/played', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: '10', id: played.identifier, title: played.title, year: '1965', seriesId: 'A' }),
  }), f.env, f.ctx);
  assert.equal(response.status, 202); await f.flush();
  const restarted = relayFixture([...f.storage]);
  const ledger = await restarted.loadIaFreshnessLedger(restarted.env, '10');
  assert.equal(ledger.length, 1, 'a successful played acknowledgement must persist history');
  assert.equal(ledger[0].id, 'audit-a::episode-1'); assert.ok(ledger[0].issuedAt > 0);
  assert.equal(ledger[0].era, '1960');
  const before = restarted.writes.length;
  await restarted.rememberIaFreshness(restarted.env, '10', [item('queued-only')], restarted.ctx);
  await restarted.flush(); assert.equal(restarted.writes.length, before, 'preparation is not viewing');
});
test('preserve-order catalog merge enriches an unresolved record without moving it', () => {
  const f = relayFixture(), first = item('episode-1'), second = item('episode-2');
  const merged = f.mergeIaCatalogCandidates({ candidateItems: [{ identifier: first.identifier }, second] },
    { candidateItems: [{ ...first, runtimeSeconds: 1320, width: 1920, height: 1080 }] }, { preserveOrder: true });
  assert.equal(merged[0].identifier, first.identifier); assert.equal(merged[0].media?.url, first.media.url);
  assert.equal(merged[0].runtimeSeconds, 1320); assert.equal(merged[1].identifier, second.identifier);
  const shallow = f.mergeIaCatalogCandidates({ candidateItems: merged }, { candidateItems: [{ identifier: first.identifier }] }, { preserveOrder: true });
  assert.equal(shallow[0].media.url, first.media.url, 'unknown incoming fields must not erase valid media');
});
test('cold five-item update preserves the durable 30-item candidate bank', async () => {
  const key = 'audit-last-good-bank', items = Array.from({ length: 30 }, (_, i) => item(String(i)));
  const f = relayFixture([[key, { items: items.slice(0, 5), candidateItems: items }]]);
  f.sharedQueuePut(f.env, 'audit-exact', { channel: '10', lastGoodKey: key,
    ready: 5, items: items.slice(0, 5), candidateItems: items.slice(0, 5) }, 3600, f.ctx);
  await f.flush(); assert.equal(f.storage.get(key).candidateItems.length, 30);
});
test('IA reservation is stable across preloads, survives restart, and does not consume watched inventory', async () => {
  const f = await rotationFixture(), items = Array.from({ length: 5 }, (_, i) => item(String(i)));
  const first = await f.select({ mode: 'reserve', items, count: 3 });
  const second = await f.select({ mode: 'reserve', items, count: 3 });
  assert.deepEqual(second.items.map(x => x.identifier), first.items.map(x => x.identifier));
  assert.equal(f.saved().seen.length, 0); assert.equal(second.cycleReset, false);
  const restarted = await rotationFixture(f.saved());
  const third = await restarted.select({ mode: 'reserve', items, count: 3 });
  assert.deepEqual(third.items.map(x => x.identifier), first.items.map(x => x.identifier));
});
test('commit consumes only the actual item, refills reservations, and is idempotent', async () => {
  const f = await rotationFixture(), items = Array.from({ length: 8 }, (_, i) => item(String(i)));
  const first = await f.select({ mode: 'reserve', items, count: 3 });
  const id = first.items[0].identifier;
  await f.select({ mode: 'commit', id, event: 'started' });
  await f.select({ mode: 'commit', id, event: 'completed' });
  assert.deepEqual(f.saved().seen, [id]);
  const next = await f.select({ mode: 'reserve', items, count: 3 });
  assert.equal(next.items[0].identifier, first.items[1].identifier);
  assert.equal(next.items.length, 3); assert.equal(next.items.some(x => x.identifier === id), false);
});
test('recent A cannot beat genuinely unseen B/C after cursor rotation', async () => {
  const items = [item('A'), item('B'), item('C')];
  const f = await rotationFixture({ version: 2, catalog: [], seen: [], cursor: 1 });
  const result = await f.select({ items, count: 2, recentIds: [items[0].identifier] });
  assert.deepEqual(result.items.map(x => x.identifier).sort(), [items[1].identifier, items[2].identifier].sort());
});
test('family-limited reservation balances the shelf without dropping the deeper episode inventory', async () => {
  const items = ['A', 'B', 'C'].flatMap(family => [item('1', family), item('2', family), item('3', family)]);
  const f = await rotationFixture();
  const result = await f.select({ mode: 'reserve', items, count: 3, diversity: { maxPerFamily: 1 } });
  assert.deepEqual(result.items.map(x => x.seriesId).sort(), ['A', 'B', 'C']);
  assert.equal(result.catalogSize, 9);
});
test('IA API canary reserves without watching and commits the actual start to D1 and the relay', async () => {
  const { default: worker, SessionRotation } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const objects = new Map(), calls = [], batches = [], pending = [];
  const items = ['A', 'B', 'C'].flatMap(family => [item('1', family), item('2', family)]).map(row => ({ ...row, title: 'Game Show Program ' + row.title,
    media: { ...row.media, runtime: 1320, width: 640, height: 480, verifiedAt: Date.now(), verification: 'transport' } }));
  const env = { RELAY: { fetch: async request => {
    const body = await request.json(); calls.push({ path: new URL(request.url).pathname, body });
    return Response.json({ ready: 5, items: items.slice(0, 5), candidateItems: items });
  } }, ROTATION: { getByName: name => {
    if (!objects.has(name)) {
      let state;
      objects.set(name, new SessionRotation({ storage: { get: async () => state, put: async (_key, value) => { state = structuredClone(value); } } }, {}));
    }
    return objects.get(name);
  } }, realsignal_catalog: { prepare: sql => ({ bind: (...args) => ({ sql, args,
    all: async () => ({ results: [] }) }) }), batch: async rows => batches.push(...rows) } };
  const ctx = { waitUntil: promise => pending.push(promise) };
  const request = (route, body) => worker.fetch(new Request('https://api.invalid/api/v3/ia/' + route, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env, ctx);
  const body = { channel: '12', iaRepair: true, sessionId: 'audit-api', serverCatalog: true,
    count: 3, diversity: { maxPerFamily: 1 } };
  const first = await (await request('queue', body)).json();
  const second = await (await request('queue', body)).json();
  assert.deepEqual(second.items.map(x => x.identifier), first.items.map(x => x.identifier));
  assert.deepEqual(first.items.map(x => x.seriesId).sort(), ['A', 'B', 'C']);
  const start = await request('playback', { ...body, id: first.items[0].identifier, event: 'started', title: first.items[0].title });
  assert.equal(start.status, 202);
  await Promise.all(pending);
  assert.ok(batches.some(row => /INSERT INTO channel_freshness/.test(row.sql) && row.args[1] === first.items[0].identifier));
  assert.ok(calls.some(call => call.path === '/ia/played' && call.body.id === first.items[0].identifier));
  const next = await (await request('queue', body)).json();
  assert.equal(next.items[0].identifier, first.items[1].identifier);
});
