const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
function relay(extra = {}) {
  const scope = { console, URL, URLSearchParams, Request, Response, Headers, AbortController, AbortSignal,
    TextEncoder, TextDecoder, Date, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    caches: { default: { match: async () => undefined, put: async () => {} } }, ...extra };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8').replace('export default', 'const worker =') +
    '\nglobalThis.f={harvestIaBackgroundPages,buildIaQueue,expandSeedArchiveContainers,expandArchiveContainer,scheduleIaReplenishment,expandAndCacheIaQueue,checkpointIaDiscovery};', scope);
  return scope;
}
const rules = { maxPerLane: 1, maxPerEra: 1, maxPerCreator: 1, maxPerCollection: 1, maxPerFamily: 1 };
const queries = Array.from({ length: 12 }, (_, i) => 'rail-' + i);
async function harvest(scope, seed, ctx) {
  return scope.f.harvestIaBackgroundPages(seed, queries, [], '10', [], [], [], ['movies'], 0, rules, 3, 256, 'https://relay.invalid', ctx, 0, 900, true);
}

test('all twelve rails progress independently past page one across restarts', async () => {
  let seed = { items: [], candidateItems: [] };
  const visited = [];
  for (let pass = 0; pass < 25; pass++) {
    const scope = relay({ record: (q, rows, page, sort) => { visited.push({ q, rows, page, sort }); return { numFound: 600, docs: [] }; } });
    vm.runInContext('cachedSearchArchive=async (_origin,q,rows,page,sort)=>record(q,rows,page,sort);', scope);
    seed = JSON.parse(JSON.stringify(await harvest(scope, seed, { isIaBackground: true, iaRepair: true, waitUntil: () => {} })));
  }
  for (const q of queries) {
    const rail = visited.filter(x => x.q === q);
    assert.equal(rail[0]?.page, 1, q + ' must start with page one');
    assert.equal(rail[1]?.page, 2, q + ' must resume at page two');
    assert.ok(rail[0].rows >= 48, 'background depth is independent of hot shelf count');
    assert.equal(rail[0].sort, rail[1].sort, 'pagination retains a stable ordering');
  }
});

test('transient search failure does not skip the failed page', async () => {
  const visited = [], scope = relay({ record: (q, page) => { visited.push({ q, page }); if (visited.length === 1) throw Error('temporary'); return { numFound: 120, docs: [] }; } });
  vm.runInContext('cachedSearchArchive=async (_origin,q,_rows,page)=>record(q,page);', scope);
  const first = await harvest(scope, { items: [], candidateItems: [] }, { iaRepair: true, isIaBackground: true, waitUntil: () => {} });
  const rail = first.discoveryState?.rails?.['rail-0'];
  assert.equal(rail?.page, 1); assert.equal(rail?.failures, 1);
});

test('background catalog admission retains a whole family; balancing belongs to reservation', async () => {
  const docs = Array.from({ length: 20 }, (_, i) => ({ identifier: 'beaver-' + i, title: 'Leave It to Beaver Episode ' + i, mediatype: 'movies', runtime: 1320 }));
  const scope = relay({ data: { numFound: 20, docs } });
  vm.runInContext('cachedSearchArchive=async()=>data;', scope);
  const result = await scope.f.buildIaQueue('10', ['tv'], [], [], [], ['movies'], 0, rules, 3, 256, 'https://relay.invalid', { iaRepair: true, isIaBackground: true, discoveryPage: 1, waitUntil: () => {} }, 0, 100, true, false, null, 900);
  assert.equal(result.candidateItems.length, 20);
});

test('file batches walk all parents and deduplicate derivatives rather than sampling the same manifest', async () => {
  const scope = relay();
  vm.runInContext('cachedArchiveJson=async (_key,_ttl,loader)=>loader(); archiveFetch=async url=>Response.json({metadata:{language:"eng"},files:Array.from({length:25},(_,i)=>[{name:"Episode "+i+".mp4",format:"h.264",length:1320,width:640,height:480},{name:"Episode "+i+"_512kb.mp4",format:"h.264",length:1320,width:640,height:480}]).flat()});', scope);
  const ctx = { iaRepair: true, isIaBackground: true, iaDiscovery: { version: 1, parentCursor: 0, parents: {}, rails: {} }, waitUntil: () => {} };
  const seed = { candidateItems: ['beaver', 'lucy', 'benny'].map(id => ({ identifier: id, title: id + ' complete series', runtime: 1800 })) };
  const found = new Set();
  for (let pass = 0; pass < 12; pass++) {
    const rows = await scope.f.expandSeedArchiveContainers(seed, 'https://relay.invalid', ctx, '999', [], [], [], ['movies'], 0, 0, 256);
    rows.forEach(row => { found.add(row.identifier); assert.equal(row.media.runtime, 1320); assert.equal(row.media.height, 480); });
    ctx.iaDiscovery = JSON.parse(JSON.stringify(ctx.iaDiscovery));
  }
  assert.equal(found.size, 75);
  assert.equal(Object.values(ctx.iaDiscovery.parents).filter(x => x.complete).length, 3);
});

test('a complete but shallow hot shelf still schedules a bounded asynchronous refill', () => {
  const queued = [], waits = [], scope = relay();
  const items = Array.from({ length: 3 }, (_, i) => ({ identifier: 'tv-' + i, media: { type: 'video', url: 'https://archive.org/download/tv/e' + i + '.mp4' } }));
  scope.f.scheduleIaReplenishment({ ready: 3, items, candidateItems: items, lastGoodKey: 'family' }, queries, [], '10', [], [], [], ['movies'], 0, rules, 3, 256, 'https://relay.invalid', new Request('https://relay.invalid/queue'), 'shared', { IA_HARVEST_QUEUE: { send: async msg => queued.push(msg) } }, { iaRepair: true, waitUntil: p => waits.push(p) }, 0);
  assert.equal(queued.length, 1); assert.equal(queued[0].iaRepair, true); assert.equal(waits.length, 1);
});

test('empty catalog harvest persists progress and an older checkpoint cannot undo it', async () => {
  const stored = new Map(), pages = [];
  const env = { REALSIGNAL_QUEUE: { get: async key => JSON.parse(stored.get(key) || 'null'), put: async (key, value) => stored.set(key, value) } };
  for (let pass = 0; pass < 2; pass++) {
    const scope = relay({ record: page => { pages.push(page); return { numFound: 600, docs: [] }; } });
    vm.runInContext('cachedSearchArchive=async (_origin,_q,_rows,page)=>record(page);', scope);
    await scope.f.expandAndCacheIaQueue({ items: [], candidateItems: [], lastGoodKey: 'strict-family' }, ['tv'], [], '999', [], [], [], ['movies'], 0, rules, 3, 256, 'https://relay.invalid', new Request('https://relay.invalid/queue'), 'shared', env, { iaRepair: true, isIaBackground: true, waitUntil: () => {} }, 0, true);
  }
  assert.deepEqual(pages, [1, 2]);
  const key = [...stored.keys()].find(x => x.startsWith('ia:discovery:v1:'));
  await relay().f.checkpointIaDiscovery(env, key, { steps: 0, rails: { tv: { page: 1, updatedAt: 1 } } });
  assert.equal(JSON.parse(stored.get(key)).rails.tv.page, 3);
});

test('real catalog upsert preserves richer IA qualification after shallow discovery', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const { default: worker, compactCatalogItem } = await import(require('node:url').pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'migrations/0001_realsignal_catalog.sql'), 'utf8'));
  const env = { realsignal_catalog: { prepare: sql => ({ bind: (...args) => ({ sql, args }) }), batch: async list => list.map(item => db.prepare(item.sql).run(...item.args)) } };
  const send = async item => worker.queue({ messages: [{ body: { channelKey: '10', items: [compactCatalogItem(item)] }, ack: () => {}, retry: () => assert.fail('upsert failed') }] }, env);
  await send({ identifier: 'show::episode.mp4', provider: 'Internet Archive', title: 'Leave It to Beaver', media: { type: 'video', url: 'https://archive.org/download/show/episode.mp4', runtime: 1320, width: 640, height: 480, verifiedAt: Date.now(), verification: 'transport' } });
  await send({ identifier: 'show::episode.mp4', provider: 'Internet Archive', title: 'Leave It to Beaver' });
  const row = db.prepare('SELECT * FROM programs').get();
  assert.equal(row.duration_seconds, 1320); assert.equal(row.aspect_ratio, 640 / 480);
  assert.match(row.media_url, /episode.mp4/);
  const md = JSON.parse(row.metadata_json);
  assert.equal(md.width, 640); assert.equal(md.verification, 'transport');
  db.close();
});
