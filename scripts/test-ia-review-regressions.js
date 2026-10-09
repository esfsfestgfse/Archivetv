const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const root = path.join(__dirname, '..');
const { rotationContext } = require('./ia-storage-test-helper');
const modules = Promise.all(['realsignal_api_v2_worker.js', 'ia_file_contract.js'].map(file => import(pathToFileURL(path.join(root, file)))));
const row = (file, extra = {}) => ({ identifier: 'benson::' + file, title: 'Benson television sitcom full episode', language: 'eng',
  media: { type: 'video', url: 'https://archive.org/download/benson/' + file, runtime: 1514, width: 640, height: 480, verification: 'transport', verifiedAt: Date.now() }, ...extra });
async function fixture() {
  const [{ default: api, SessionRotation }] = await modules, objects = new Map(), pending = [], forwarded = [], queueBodies = [];
  let incoming = [row('A.mp4'), row('B.mp4'), row('C.mp4')];
  const env = { RELAY: { fetch: async request => {
    forwarded.push(new URL(request.url).pathname);
    if (new URL(request.url).pathname === '/ia/queue') queueBodies.push(await request.clone().json());
    return Response.json({ ready: incoming.length, items: incoming, candidateItems: incoming });
  } }, ROTATION: { getByName(name) {
    if (!objects.has(name)) objects.set(name, new SessionRotation(rotationContext(), {}));
    return objects.get(name);
  } } };
  const request = (route, body) => api.fetch(new Request('https://api.invalid/api/v3/ia/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { waitUntil: promise => pending.push(promise) });
  return { request, env, incoming: rows => { incoming = rows; }, objects, pending, forwarded, queueBodies };
}

test('relay-family channels also reserve identities in the IA repair canary', async () => {
  const f = await fixture(), body = { channel: '11', iaRepair: true, serverCatalog: true, sessionId: 'review', count: 3 };
  const queue = await (await f.request('queue', body)).json();
  assert.equal(queue.items.length, 3);
  const start = await f.request('playback', { ...body, id: queue.items[0].identifier, event: 'started' });
  assert.equal(start.status, 202);
  await Promise.all(f.pending);
});

test('committed items are excluded before the relay spends its next hydration budget', async () => {
  const f = await fixture(), body = { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'hydrate', count: 3 };
  const first = await (await f.request('queue', body)).json();
  await f.request('playback', { ...body, id: first.items[0].identifier, event: 'skipped' });
  await f.request('queue', body);
  assert.ok(f.queueBodies.at(-1).hydrationExcludeIds.includes(first.items[0].identifier));
});

test('movie hydration uses the feature floor before filling the small shelf', async () => {
  const f = await fixture();
  await f.request('queue', { channel: '702', iaRepair: true, serverCatalog: true, sessionId: 'feature', count: 3 });
  assert.equal(f.queueBodies.at(-1).minRuntimeSeconds, 3600);
  await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'tv', count: 3 });
  assert.equal(f.queueBodies.at(-1).minRuntimeSeconds, 900);
  await f.request('queue', { channel: '920', iaRepair: true, mediaTypes: ['audio'], sessionId: 'radio', count: 3 });
  assert.equal(f.queueBodies.at(-1).minRuntimeSeconds, 0);
});

test('repair queue never returns unreserved media when rotation is unavailable', async () => {
  const f = await fixture(); delete f.env.ROTATION;
  const response = await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'offline', count: 3 });
  assert.equal(response.status, 503);
});

test('new encoding cannot invalidate the original outstanding acknowledgement', async () => {
  const [{ SessionRotation }] = await modules;
  const object = new SessionRotation(rotationContext(), {});
  const send = body => object.fetch(new Request('https://rotation.internal/select', { method: 'POST', body: JSON.stringify(body) }));
  await send({ mode: 'reserve', items: [row('episode.mp4')], count: 1 });
  await send({ mode: 'reserve', items: [row('episode_512kb.mp4', { media: { ...row('episode_512kb.mp4').media, verifiedAt: Date.now() + 1 } })], count: 1 });
  assert.equal((await send({ mode: 'commit', id: 'benson::episode.mp4', event: 'started' })).status, 200);
});

test('watched derivative cannot replay while another episode is unseen', async () => {
  const [{ SessionRotation }] = await modules;
  const object = new SessionRotation(rotationContext(), {});
  const select = async body => (await object.fetch(new Request('https://rotation.internal/select', { method: 'POST', body: JSON.stringify(body) }))).json();
  await select({ mode: 'reserve', items: [row('episode.mp4')], count: 1 });
  await select({ mode: 'commit', id: 'benson::episode.mp4', event: 'started' });
  const next = await select({ mode: 'reserve', items: [row('fresh.mp4'), row('episode_512kb.mp4')], count: 1 });
  assert.equal(next.items[0].identifier, 'benson::fresh.mp4');
  assert.equal(next.catalogSize, 2);
});

test('stored canary reservations cannot resurrect explicit failed media', async () => {
  const f = await fixture(), body = { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'failed', count: 3 };
  const before = await (await f.request('queue', body)).json(); assert.equal(before.items.length, 3);
  f.incoming(before.items.map(item => ({ ...item, media: { ...item.media, verification: 'failed' } })));
  const after = await (await f.request('queue', body)).json();
  assert.equal(after.items.length, 0);
});

test('provider-less relay compaction uses the canonical IA provider identity', async () => {
  const [{ compactCatalogItem }] = await modules;
  assert.equal(compactCatalogItem(row('episode.mp4')).provider, 'Internet Archive');
});

test('audio runtime and geometry exemptions do not admit a failed transport', async () => {
  const [, { qualifyIaFileRecord }] = await modules;
  assert.equal(qualifyIaFileRecord({ identifier: 'radio', media: { type: 'audio', url: 'https://archive.org/download/radio/program.mp3', verification: 'failed', verifiedAt: 1 } }, { iaRepair: true, channel: '920', mediaTypes: ['audio'] }).accepted, false);
});

test('strict audio still requires recent successful transport verification', async () => {
  const [, { qualifyIaFileRecord }] = await modules;
  const item = { identifier: 'radio', media: { type: 'audio', url: 'https://archive.org/download/radio/program.mp3' } };
  const rules = { iaRepair: true, channel: '920', mediaTypes: ['audio'] };
  assert.equal(qualifyIaFileRecord(item, rules).accepted, false);
  assert.equal(qualifyIaFileRecord({ ...item, media: { ...item.media, verification: 'transport', verifiedAt: Date.now() } }, rules).accepted, true);
});

test('repeated start acknowledgements do not double-write watched telemetry', async () => {
  const f = await fixture(), body = { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'ack', count: 3 };
  const queue = await (await f.request('queue', body)).json(), started = { ...body, id: queue.items[0].identifier, event: 'started' };
  await f.request('playback', started); await f.request('playback', started); await Promise.all(f.pending);
  assert.equal(f.forwarded.filter(path => path === '/ia/played').length, 1);
});
