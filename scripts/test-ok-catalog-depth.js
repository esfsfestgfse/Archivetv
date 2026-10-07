/* Real SQLite + Worker regression: discovery state and deep catalog retention. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
(async () => {
  const helpers = await import(pathToFileURL(path.join(root, 'ok_public_search.js')));
  const { default: worker } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0001_realsignal_catalog.sql', '0002_realsignal_v3_observability.sql', '0003_realsignal_v4_adaptive_catalog.sql']) sql.exec(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
  const db = {
    prepare(query) { return { bind(...args) { return { query, args, async all() { return { results: sql.prepare(query).all(...args) }; } }; } }; },
    async batch(statements) { return statements.map(s => sql.prepare(s.query).all(...s.args)); }
  };
  assert.equal(await helpers.okDiscoveryCursor(db, 'ok-tv-channel'), 0);
  assert.equal(await helpers.okDiscoveryCursor(db, 'ok-tv-channel'), 1);
  assert.equal(await helpers.okDiscoveryCursor(db, 'ok-tv-channel'), 2);
  assert.equal(await helpers.okQueryOffset(db, 'ok-tv-channel', '$.okQueryOffsets.test'), 0);
  assert.equal(await helpers.okQueryOffset(db, 'ok-tv-channel', '$.okQueryOffsets.test'), 20);
  await helpers.okQueryOffset(db, 'ok-tv-channel', '$.okQueryOffsets.test', true);
  assert.equal(await helpers.okQueryOffset(db, 'ok-tv-channel', '$.okQueryOffsets.test'), 0);
  assert.equal(JSON.parse(helpers.okSearchPageRequest('Taxi DVDRip', 40).options.body).parameters.videosOffset, 40);
  assert.equal(helpers.okProgramName('[site] The.Flash.2014.S01E03.1080p', 'tv'), 'The Flash');
  const shows = [
    { name: 'Test Drama', language: 'English', type: 'Scripted', network: { country: { code: 'US' } } },
    { name: 'Foreign Drama', language: 'French', type: 'Scripted', network: { country: { code: 'FR' } } },
    { name: 'Animation', language: 'English', type: 'Animation', network: { country: { code: 'US' } } },
  ];
  assert.deepEqual(helpers.okTVIndexTitles(shows), ['Test Drama']);
  const queries = helpers.okTitleSearchQueries({ profileKey: 'ok-tv-channel' }, 1, { seriesTitles: ['Test Drama', 'New Show', 'Another Show'], deep: true });
  assert.ok(queries.some(q => q.includes('New Show')));
  assert.equal(queries.length, 6);
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('unavailable', { status: 429 });
    const tasks = [];
    const ctx = { waitUntil(promise) { tasks.push(promise); } };
    const request = body => new Request('https://api.example/api/v3/source/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await worker.fetch(request({ profileKey: 'ok-tv-channel', maintenance: true }), { realsignal_catalog: db }, ctx);
    await Promise.all(tasks.splice(0));
    // Maintenance increments once, and subsequent catalog writes preserve it.
    assert.equal(await helpers.okDiscoveryCursor(db, 'ok-tv-channel'), 4);
    const series = ['Taxi', 'Friends', 'Columbo', 'Cheers', 'The Wire', 'Seinfeld'];
    for (let i = 0; i < 150; i++) {
      const n = i % series.length, id = `ok:${800000 + i}`, title = `${series[n]}.S02E${String(Math.floor(i / 6) + 1).padStart(2, '0')}.DVDRip`;
      const item = { id, title, provider: 'OK.ru', duration: 1500, durationUnit: 'seconds', aspectRatio: 1.33, type: 'embed', embedAllowed: true, url: `https://ok.ru/videoembed/${800000+i}`, language: 'en', seriesTitle: series[n], seriesId: `tvmaze:${100+n}`, identityReference: `https://www.tvmaze.com/shows/${100+n}/test` };
      sql.prepare("INSERT INTO programs (id,provider,title,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')").run(id,'OK.ru',title,1500,1.33,'embed',item.url,JSON.stringify(item),1,1);
      sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,1)').run('ok-tv-channel',id);
    }
    const status = await (await worker.fetch(new Request('https://api.example/api/v3/source/status?profileKey=ok-tv-channel'), { realsignal_catalog: db }, ctx)).json();
    assert.ok(status.items.length > 150, 'saved episodes beyond 96 must remain reachable');
    const seen = [];
    for (let rotation = 0; rotation < 16; rotation++) {
      const res = await worker.fetch(request({ profileKey: 'ok-tv-channel', count: 5, rotation, recentIds: seen }), { realsignal_catalog: db }, ctx);
      const shelf = await res.json();
      assert.equal(shelf.items.length, 5);
      assert.ok(shelf.catalogDepth > 96);
      assert.equal(new Set(shelf.items.map(item => item.seriesId)).size, 5, JSON.stringify(shelf.items.map(item => ({ title: item.title, series: item.seriesId }))));
      for (const item of shelf.items) { assert.ok(!seen.includes(item.id), 'recent episodes must not repeat'); seen.push(item.id); }
    }
    await Promise.all(tasks);
  } finally { globalThis.fetch = oldFetch; sql.close(); }
  console.log('OK depth passed: persisted cursor, dynamic US series index, >96 retained episodes, balanced five-show shelves, and sixteen unseen rotations (>48 recent IDs).');
})().catch(error => { console.error(error); process.exitCode = 1; });
