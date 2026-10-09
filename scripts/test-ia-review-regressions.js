const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');
const { rotationContext } = require('./ia-storage-test-helper');
const modules = Promise.all(['realsignal_api_v2_worker.js', 'ia_file_contract.js'].map(file => import(pathToFileURL(path.join(root, file)))));
let fixtureId = 0;
const row = (file, extra = {}) => ({ identifier: 'benson::' + file, title: 'Benson television sitcom full episode', language: 'eng',
  media: { type: 'video', url: 'https://archive.org/download/benson/' + file, runtime: 1514, width: 640, height: 480, verification: 'transport', verifiedAt: Date.now() }, ...extra });
async function fixture() {
  const { default: api, SessionRotation } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')) + '?fixture=' + fixtureId++);
  const objects = new Map(), pending = [], forwarded = [], queueBodies = [];
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

async function catalogFixture(rows) {
  const f = await fixture(), [{ compactCatalogItem }] = await modules;
  const records = rows.map(compactCatalogItem).map(item => ({
    id: item.id, provider: item.provider, source_identifier: item.sourceIdentifier,
    title: item.title, description: item.description, duration_seconds: item.duration,
    aspect_ratio: item.aspectRatio, media_type: item.mediaType, media_url: item.mediaUrl,
    metadata_json: JSON.stringify(item), year: item.year,
  }));
  f.batches = [];
  f.env.realsignal_catalog = {
    prepare(sql) { return { bind(...args) { return {
      sql, args, all: async () => ({ results: /FROM programs p/.test(sql) ? records : [] }),
      first: async () => null, run: async () => ({ success: true }),
    }; } }; },
    async batch(statements) { f.batches.push(statements); },
  };
  return f;
}

// Run the emitted SQL against SQLite, not a fake returning every database row.
// A newest-first LIMIT before qualification must fail the older-episode tests.
async function sqliteCatalogFixture(rows, channel = '10') {
  const f = await fixture(), [{ compactCatalogItem }] = await modules;
  const db = new DatabaseSync(':memory:');
  for (const migration of ['0001_realsignal_catalog.sql', '0003_realsignal_v4_adaptive_catalog.sql']) {
    db.exec(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
  }
  const insert = db.prepare('INSERT INTO programs (id,provider,source_identifier,title,description,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const link = db.prepare('INSERT INTO channel_programs (channel_key,program_id,last_seen_at) VALUES (?,?,?)');
  rows.forEach((raw, i) => {
    const item = compactCatalogItem(raw), at = rows.length - i;
    insert.run(item.id, item.provider, item.sourceIdentifier, item.title, item.description, item.duration,
      item.aspectRatio, item.mediaType, raw.metadataOnlyUrl ? null : item.mediaUrl, JSON.stringify(item), at, at);
    link.run(channel, item.id, at);
  });
  f.db = db; f.batches = [];
  f.env.realsignal_catalog = {
    prepare(sql) { return { bind(...args) { return {
      sql, args,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      first: async () => db.prepare(sql).get(...args) || null,
      run: async () => db.prepare(sql).run(...args),
    }; } }; },
    async batch(statements) {
      f.batches.push(statements);
      return statements.map(statement => db.prepare(statement.sql).run(...statement.args));
    },
  };
  return f;
}

test('older qualified shows survive hundreds of newer incomplete catalog rows', async () => {
  const pending = Array.from({ length: 600 }, (_, i) => row('incomplete-' + i + '.mp4', {
    media: { ...row('incomplete-' + i + '.mp4').media, verification: 'metadata-only', verifiedAt: 0 },
  }));
  const healthy = ['Beaver', 'Benson', 'Lucy', 'Dragnet'].map(seriesId => row(seriesId + '.mp4', { seriesId }));
  const f = await sqliteCatalogFixture(pending.concat(healthy));
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'older-healthy', count: 3, diversity: { maxPerFamily: 1 } })).json();
    assert.equal(payload.ready, 3);
    assert.ok(payload.items.every(item => healthy.some(record => record.identifier === item.identifier)),
      'use older qualified programs, not the unrelated emergency relay shelf');
    assert.equal(new Set(payload.items.map(item => item.seriesId)).size, 3);
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('repaired IA session rotation receives more than the old ninety-six-record window', async () => {
  const records = Array.from({ length: 140 }, (_, i) => row('deep-' + i + '.mp4', { seriesId: 'show-' + i % 10 }));
  const f = await sqliteCatalogFixture(records, '150');
  try {
    const payload = await (await f.request('queue', { channel: '150', iaRepair: true, serverCatalog: true, sessionId: 'wide-window', count: 3 })).json();
    assert.equal(payload.v2.catalogSize, 140);
    assert.equal(payload.items.length, 3, 'widen the catalog, not the public playing shelf');
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('verified older metadata URLs remain available when the normalized URL column is empty', async () => {
  const records = ['A', 'B', 'C'].map(file => row('old-' + file + '.mp4', { metadataOnlyUrl: true }));
  const f = await sqliteCatalogFixture(records);
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'legacy-url', count: 3 })).json();
    assert.deepEqual(new Set(payload.items.map(item => item.identifier)), new Set(records.map(item => item.identifier)));
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('background repaired catalog imports keep qualified episodes beyond ninety-six', async () => {
  const f = await catalogFixture([row('cached-A.mp4'), row('cached-B.mp4'), row('cached-C.mp4')]);
  const discovered = Array.from({ length: 140 }, (_, i) => row('discovered-' + i + '.mp4'));
  f.incoming(discovered);
  await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'wide-import', count: 3 });
  await Promise.all(f.pending);
  const inserted = new Set(f.batches.flat().filter(statement => /INSERT INTO programs/.test(statement.sql)).map(statement => statement.args[0]));
  assert.ok(inserted.has('benson::discovered-139.mp4'), 'qualified tail episodes must not vanish at persistence');
  assert.ok(f.batches.every(batch => batch.length <= 32), 'deeper imports stay in bounded write batches');
});

test('a dominant series does not crowd older healthy series out of the database window', async () => {
  const dominant = Array.from({ length: 600 }, (_, i) => row('dominant-' + i + '.mp4', { seriesId: 'Bonanza' }));
  const others = ['Beaver', 'Lucy', 'Dragnet'].map(seriesId => row(seriesId + '.mp4', { seriesId }));
  const f = await sqliteCatalogFixture(dominant.concat(others));
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'show-breadth', count: 3, diversity: { maxPerFamily: 1 } })).json();
    assert.equal(new Set(payload.items.map(item => item.seriesId)).size, 3);
    assert.ok(payload.candidateItems.some(item => item.seriesId === 'Lucy'));
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('incomplete members do not consume a healthy episode family position', async () => {
  const incomplete = Array.from({ length: 600 }, (_, i) => row('incomplete-lucy-' + i + '.mp4', {
    seriesId: 'Lucy', media: { ...row('incomplete.mp4').media, verification: 'metadata-only', verifiedAt: 0 },
  }));
  const dominant = Array.from({ length: 600 }, (_, i) => row('bonanza-' + i + '.mp4', { seriesId: 'Bonanza' }));
  const healthy = ['Lucy', 'Beaver', 'Dragnet'].map(seriesId => row(seriesId + '.mp4', { seriesId }));
  const f = await sqliteCatalogFixture(incomplete.concat(dominant, healthy));
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'family-rank', count: 3 })).json();
    assert.ok(payload.candidateItems.some(item => item.seriesId === 'Lucy'), 'unverified siblings cannot bury the verified Lucy episode');
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('policy rejects trigger bounded database refill instead of erasing healthy older shows', async () => {
  const blocked = Array.from({ length: 600 }, (_, i) => row('blocked-' + i + '.mp4', {
    title: 'Unrelated television full episode', seriesId: 'blocked-' + i,
  }));
  const healthy = ['Beaver', 'Lucy', 'Dragnet'].map(seriesId => row(seriesId + '.mp4', { seriesId }));
  const f = await sqliteCatalogFixture(blocked.concat(healthy));
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'policy-refill', denyTerms: ['unrelated'], count: 3 })).json();
    assert.deepEqual(new Set(payload.items.map(item => item.identifier)), new Set(healthy.map(item => item.identifier)),
      'keep the strict deny rule and find the older healthy shows, not emergency relay items');
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('repaired relay catalogs retain qualified tail episodes on their way to session rotation', async () => {
  const f = await fixture();
  f.incoming(Array.from({ length: 140 }, (_, i) => row('relay-depth-' + i + '.mp4')));
  const payload = await (await f.request('queue', { channel: '11', iaRepair: true, serverCatalog: true, sessionId: 'relay-window', count: 3 })).json();
  assert.equal(payload.v2.catalogSize, 140);
  assert.equal(payload.items.length, 3);
  await Promise.all(f.pending);
});

test('deep repaired catalog imports fit queue message limits without losing episodes', async () => {
  const f = await fixture(), queued = [];
  f.incoming(Array.from({ length: 140 }, (_, i) => row('large-' + i + '.mp4', {
    description: 'Classic television full episode. ' + 'é'.repeat(1900),
  })));
  f.env.realsignal_catalog_refresh = { send: async job => {
    assert.ok(Buffer.byteLength(JSON.stringify(job)) <= 120000, 'leave room under the 128 KB queue limit');
    queued.push(job);
  } };
  await f.request('queue', { channel: '11', iaRepair: true, serverCatalog: true, sessionId: 'large-import', count: 3 });
  await Promise.all(f.pending);
  assert.ok(queued.length > 1, 'split the large union into bounded messages');
  assert.equal(new Set(queued.flatMap(job => job.items.map(item => item.id))).size, 140);
  assert.ok(queued.every(job => job.iaRepair === true && job.channelKey === '11'));
});

test('a playable fast catalog above fifteen keeps discovering in background without blocking tunes', async () => {
  const old = Array.from({ length: 30 }, (_, i) => row('old-' + i + '.mp4'));
  const f = await catalogFixture(old), refreshed = old.concat(row('new.mp4'));
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  f.env.RELAY.fetch = async request => {
    f.queueBodies.push(await request.json());
    await delayed;
    return Response.json({ items: refreshed.slice(0, 3), candidateItems: refreshed });
  };
  const body = { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'deep-fast', count: 3, recentIds: ['watched'] };
  const response = await f.request('queue', body), payload = await response.json();
  await f.request('queue', body);
  const callsBeforeRelease = f.queueBodies.length;
  release();
  await Promise.all(f.pending);
  assert.equal(payload.ready, 3, 'a tune uses the verified database shelf while discovery is pending');
  assert.equal(callsBeforeRelease, 1, 'coalesce foreground-triggered background discovery');
  assert.deepEqual(f.queueBodies[0].recentIds, []);
  assert.ok(f.batches.flat().some(statement => /INSERT INTO programs/.test(statement.sql) && statement.args[0] === 'benson::new.mp4'));
});

test('same-sized qualified refreshes can add new episodes rather than preserving an old snapshot', async () => {
  const old = Array.from({ length: 24 }, (_, i) => row('old-' + i + '.mp4'));
  const f = await catalogFixture(old), replacement = Array.from({ length: 24 }, (_, i) => row('new-' + i + '.mp4'));
  f.incoming(replacement);
  const response = await f.request('queue', { channel: '150', iaRepair: true, serverCatalog: true, sessionId: 'same-depth', count: 3 });
  await Promise.all(f.pending);
  assert.equal((await response.json()).ready, 3);
  assert.ok(f.batches.flat().some(statement => /INSERT INTO programs/.test(statement.sql) && statement.args[0] === 'benson::new-0.mp4'),
    'equal depth does not mean equal catalog identities; preserve the durable union');
});

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
