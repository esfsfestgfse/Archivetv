/* Real SQLite + Worker regression: discovery state and deep catalog retention. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
  assert.equal(helpers.okProgramName('Taxi Episode 12 DVDRip','tv'),'Taxi','two-digit episode labels must not pollute the show identity');
  const shows = [
    ...Array.from({ length: 24 }, (_, index) => ({ name: index ? `Indexed Show ${index + 1}` : 'Test Drama', language: 'English', type: 'Scripted', network: { country: { code: 'US' } } })),
    { name: 'Foreign Drama', language: 'French', type: 'Scripted', network: { country: { code: 'FR' } } },
    { name: 'Animation', language: 'English', type: 'Animation', network: { country: { code: 'US' } } },
  ];
  assert.equal(new Set(helpers.okTVIndexTitles(shows)).size, 10, 'each background pass must inspect ten distinct US television series');
  const indexedTitles = helpers.okTVIndexTitles(shows);
  const queries = helpers.okTitleSearchQueries({ profileKey: 'ok-tv-channel' }, 1, { seriesTitles: indexedTitles, deep: true });
  assert.ok(queries.some(q => q.includes('Indexed Show')));
  assert.equal(queries.length, 10, 'deep television discovery must not stop after six narrow searches');
  assert.deepEqual(queries.map(query => query.replace(/\s+(?:1080p|DVDRip|BDRip|BluRay)$/i, '')), indexedTitles, 'a full maintenance pass must search all ten indexed series instead of spending two slots on generic queries');
  assert.ok(queries.every(query => /\b(?:1080p|DVDRip|BDRip|BluRay)$/i.test(query)), 'indexed series searches must include an admissible release marker');
  const dvdRepairQueries = helpers.okTitleSearchQueries({ profileKey: 'ok-tv-channel' }, 1, { seriesTitles: indexedTitles, deep: true, indexedMarker: 'DVDRip' });
  assert.ok(dvdRepairQueries.every(query => /\sDVDRip$/i.test(query)), 'a targeted old-TV pass must be able to probe every title with the proven DVD release marker');
  const decadeShows = [
    ...Array.from({ length: 8 }, (_, index) => ({ name: `Eighties Show ${index + 1}`, premiered: `198${index}-01-01`, language: 'English', type: 'Scripted', network: { country: { code: 'US' } } })),
    ...Array.from({ length: 8 }, (_, index) => ({ name: `Nineties Show ${index + 1}`, premiered: `199${index}-01-01`, language: 'English', type: 'Scripted', network: { country: { code: 'US' } } })),
    ...Array.from({ length: 20 }, (_, index) => ({ name: `Modern Show ${index + 1}`, premiered: `20${String(index).padStart(2, '0')}-01-01`, language: 'English', type: 'Scripted', network: { country: { code: 'US' } } })),
    { name: 'Foreign Eighties', premiered: '1985-01-01', language: 'French', type: 'Scripted', network: { country: { code: 'FR' } } },
    { name: 'Animated Nineties', premiered: '1995-01-01', language: 'English', type: 'Animation', network: { country: { code: 'US' } } },
  ];
  const decadeTitles = helpers.okTVDecadeIndexTitles(decadeShows, 0, 10, [1980, 1990]);
  assert.equal(decadeTitles.length, 10, 'targeted discovery must spend all ten searches on underfilled decades');
  assert.equal(decadeTitles.filter(title => title.startsWith('Eighties')).length, 5, 'targeted discovery must balance 1980s series');
  assert.equal(decadeTitles.filter(title => title.startsWith('Nineties')).length, 5, 'targeted discovery must balance 1990s series');
  assert.notDeepEqual(helpers.okTVDecadeIndexTitles(decadeShows, 1, 10, [1980, 1990]), decadeTitles, 'the targeted decade window must rotate between maintenance passes');
  const targetedPlan = helpers.okTVIndexPagePlan(0);
  assert.equal(targetedPlan.targeted, true);
  assert.equal(targetedPlan.pages.length, 2);
  assert.ok(targetedPlan.pages.every(page => page >= 1 && page <= 7), 'targeted discovery must use the measured TVmaze pages containing older US series');
  assert.equal(new Set(targetedPlan.pages).size, 2, 'targeted discovery must inspect two different index pages');
  assert.equal(helpers.okTVIndexPagePlan(2).targeted, false, 'every third pass must retain broad all-era discovery');
  const cooled = helpers.okPreferUnseenSeries([
    { id: 'a2', seriesId: 'show:a' }, { id: 'b2', seriesId: 'show:b' },
    { id: 'c1', seriesId: 'show:c' }, { id: 'd1', seriesId: 'show:d' }, { id: 'e1', seriesId: 'show:e' },
  ], new Set(['show:a', 'show:b']), 3);
  assert.deepEqual(cooled.slice(0, 3).map(item => item.seriesId), ['show:c', 'show:d', 'show:e'], 'series cooldown must outrank alternate episodes of a recently played show');
  const runtime = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets', 'ok-embed-runtime.js'), 'utf8'), runtime);
  assert.equal(runtime.window.RealSignalOKEmbed.seriesKey({ seriesId: 'tvmaze:55', id: 'episode-1' }), 'tvmaze:55');
  for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const client = { v2Unique: items => [...new Map(items.map(item => [item.id, item])).values()] };
    vm.runInNewContext(html.match(/function v2MergeCatalog\(profile,prior,discovered\)\{[^\n]*\}/)[0], client);
    const prior = Array.from({ length: 512 }, (_, i) => ({ id: 'played-' + i }));
    const discoveries = Array.from({ length: 10 }, (_, i) => ({ id: 'new-' + i }));
    assert.ok(client.v2MergeCatalog({ profileKey: 'ok-tv-channel' }, prior, discoveries).slice(0, 5).every(item => item.id.startsWith('new-')), 'a full old catalog must not crowd out new programs');
    assert.equal(client.v2MergeCatalog({ profileKey: 'other-source-profile' }, prior, discoveries)[0].id, 'played-0', 'other source families retain their existing merge behavior');
    assert.ok(html.includes('merged=v2MergeCatalog(profile,prior,discovered)'));
    assert.ok(html.includes('v2recentSeries:'), `${file} must persist a show-level freshness ledger`);
    const saved = new Map([
      ['v2recent:OK TV Channel', ['a1', 'b1']],
      ['v2recentSeries:OK TV Channel', ['show:a', 'show:b']],
    ]);
    const selection = {
      store: { get: (key, fallback) => saved.has(key) ? saved.get(key) : fallback },
      window: runtime.window,
    };
    for (const name of ['v2Recent', 'v2OKSeriesKey', 'v2RecentSeries', 'v2NextFreshIndex']) vm.runInNewContext(html.split(/\r?\n/).find(line => line.startsWith(`function ${name}(`)), selection);
    const state = { items: [{ id: 'a2', seriesId: 'show:a' }, { id: 'b2', seriesId: 'show:b' }, { id: 'c1', seriesId: 'show:c' }] };
    assert.equal(selection.v2NextFreshIndex({ name: 'OK TV Channel', profileKey: 'ok-tv-channel' }, state, ''), 2, `${file} Next must choose a new show before another unseen episode of a recent show`);
    saved.set('v2recentSeries:OK TV Channel', ['show:a', 'show:c']);
    const exhaustedShows = { cursor: 0, items: [{ id: 'a3', seriesId: 'show:a' }, { id: 'c2', seriesId: 'show:c' }] };
    assert.equal(selection.v2NextFreshIndex({ name: 'OK TV Channel', profileKey: 'ok-tv-channel' }, exhaustedShows, ''), 1, `${file} must fall back to the least-recent show when every available series is cooled`);
    saved.set('v2recent:OK Movie Channel', []);
    saved.set('v2recentSeries:OK Movie Channel', []);
    const movies = { cursor: 0, items: [{ id: 'movie-a' }, { id: 'movie-b' }] };
    assert.equal(selection.v2NextFreshIndex({ name: 'OK Movie Channel', profileKey: 'ok-movie-channel' }, movies, ''), 0, `${file} tuning must preserve an explicitly selected unplayed movie`);
    assert.equal(selection.v2NextFreshIndex({ name: 'OK Movie Channel', profileKey: 'ok-movie-channel' }, movies, 'movie-a'), 1, `${file} Next must still advance from the current movie`);
    assert.ok(html.includes('recentSeries:v2RecentSeries(profile.name).slice(0,10)'), `${file} must send the same distinct-series cooldown window to the server`);
  }
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
    const series = Array.from({ length: 25 }, (_, index) => `Catalog Show ${index + 1}`);
    for (let i = 0; i < 250; i++) {
      const n = i % series.length, id = `ok:${800000 + i}`, title = `${series[n]}.S02E${String(Math.floor(i / 6) + 1).padStart(2, '0')}.DVDRip`;
      const item = { id, title, provider: 'OK.ru', duration: 1500, durationUnit: 'seconds', aspectRatio: 1.33, type: 'embed', embedAllowed: true, url: `https://ok.ru/videoembed/${800000+i}`, language: 'en', seriesTitle: series[n], seriesId: `tvmaze:${100+n}`, identityReference: `https://www.tvmaze.com/shows/${100+n}/test` };
      sql.prepare("INSERT INTO programs (id,provider,title,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')").run(id,'OK.ru',title,1500,1.33,'embed',item.url,JSON.stringify(item),1,1);
      sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,1)').run('ok-tv-channel',id);
    }
    const status = await (await worker.fetch(new Request('https://api.example/api/v3/source/status?profileKey=ok-tv-channel'), { realsignal_catalog: db }, ctx)).json();
    assert.ok(status.items.length > 150, 'saved episodes beyond 96 must remain reachable');
    const nearlyExhaustedIds = status.items.slice(0, -1).map(item => item.id);
    const nearlyExhausted = await (await worker.fetch(request({ profileKey: 'ok-tv-channel', count: 5, rotation: 0, recentIds: nearlyExhaustedIds }), { realsignal_catalog: db }, ctx)).json();
    assert.equal(nearlyExhausted.items.length, 5, 'a constrained catalog must keep a full shelf after freshness filtering');
    assert.equal(nearlyExhausted.items[0].id, status.items.at(-1).id, 'the last unseen program must remain first before cooled fallback rows');
    for (let index = 0; index < 10; index++) sql.prepare('UPDATE channel_programs SET last_seen_at=10 WHERE channel_key=? AND program_id=?').run('ok-tv-channel', `ok:${800025 + index}`);
    const recentShowIds = Array.from({ length: 10 }, (_, index) => `ok:${800000 + index}`);
    const recentShowShelf = await (await worker.fetch(request({ profileKey: 'ok-tv-channel', count: 5, rotation: 0, recentIds: recentShowIds }), { realsignal_catalog: db }, ctx)).json();
    const cooledSeries = new Set(Array.from({ length: 10 }, (_, index) => `tvmaze:${100 + index}`));
    assert.ok(recentShowShelf.items.every(item => !cooledSeries.has(item.seriesId)), 'alternate episodes from the previous ten shows must cool down when deeper series are available');
    const seen = [], playedSeries = [];
    for (let rotation = 0; rotation < 16; rotation++) {
      const res = await worker.fetch(request({ profileKey: 'ok-tv-channel', count: 5, rotation, recentIds: seen }), { realsignal_catalog: db }, ctx);
      const shelf = await res.json();
      assert.equal(shelf.items.length, 5);
      assert.ok(shelf.catalogDepth > 96);
      assert.ok(shelf.candidateItems.every(item => !seen.includes(item.id)), 'the OK background window must exclude recently served episodes too');
      assert.equal(new Set(shelf.items.map(item => item.seriesId)).size, 5, JSON.stringify(shelf.items.map(item => ({ title: item.title, series: item.seriesId }))));
      const recentlyPlayedSeries = new Set(playedSeries.slice(0, 10));
      assert.ok(shelf.items.every(item => !recentlyPlayedSeries.has(item.seriesId)), 'an unseen episode must not bring back one of the previous ten shows while alternatives exist');
      for (const item of shelf.items) {
        assert.ok(!seen.includes(item.id), 'recent episodes must not repeat');
        seen.unshift(item.id); playedSeries.unshift(item.seriesId);
      }
    }
    await Promise.all(tasks);
    const curated = await import(pathToFileURL(path.join(root, 'ok_curated_tv_catalog.js')));
    const blackProfile = { profileKey: 'ok-black-tv-channel' };
    const blackShows = ['Living Single', 'The Jamie Foxx Show', 'Moesha', 'The Parkers', 'A Different World', 'In Living Color'];
    for (let i = 0; i < 120; i++) {
      const id = `ok:${900000 + i}`, title = `${blackShows[i % 6]} Season:1 Episode:${Math.floor(i / 6) + 1}`;
      const item = { id, rawId: String(900000 + i), title, provider: 'OK.ru', duration: 1500, durationUnit: 'seconds', aspectRatio: 1.33, type: 'embed', embedAllowed: true, url: `https://ok.ru/videoembed/${900000 + i}`, embedUrl: `https://ok.ru/videoembed/${900000 + i}` };
      Object.assign(item, await curated.okCuratedIdentity(blackProfile, item));
      sql.prepare("INSERT INTO programs (id,provider,title,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')").run(id, 'OK.ru', title, 1500, 1.33, 'embed', item.url, JSON.stringify(item), 1, 1);
      sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,1)').run(blackProfile.profileKey, id);
    }
    const recent = [];
    for (let rotation = 0; rotation < 16; rotation++) {
      const shelf = await (await worker.fetch(request({ profileKey: blackProfile.profileKey, count: 5, rotation, recentIds: recent }), { realsignal_catalog: db }, ctx)).json();
      assert.equal(shelf.items.length, 5, 'curated profiles use the same full shelf as older OK profiles');
      assert.ok(shelf.candidateItems.every(item => !recent.includes(item.id)), 'new OK profiles cannot forget played items after 48 IDs');
      for (const item of shelf.items) { assert.ok(!recent.includes(item.id)); recent.unshift(item.id); }
    }
    await Promise.all(tasks);
    const watchedRow = sql.prepare('SELECT * FROM programs WHERE id=?').get('ok:900000');
    const alternateMetadata = { ...JSON.parse(watchedRow.metadata_json), id: 'ok:999000', url: 'https://ok.ru/videoembed/999000', embedUrl: 'https://ok.ru/videoembed/999000' };
    sql.prepare("INSERT INTO programs (id,provider,title,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')").run(alternateMetadata.id, 'OK.ru', watchedRow.title, 1500, 1.33, 'embed', alternateMetadata.url, JSON.stringify(alternateMetadata), 1, 1);
    sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,1)').run(blackProfile.profileKey, alternateMetadata.id);
    sql.prepare("UPDATE programs SET status='inactive' WHERE id=?").run(watchedRow.id);
    const outsideWindow = await (await worker.fetch(request({ profileKey: blackProfile.profileKey, count: 5, recentIds: [watchedRow.id] }), { realsignal_catalog: db }, ctx)).json();
    assert.ok(outsideWindow.candidateItems.every(item => item.id !== alternateMetadata.id), 'canonical history must reject alternate uploads even when the watched original is no longer in the playable window');
    await Promise.all(tasks);

  } finally { globalThis.fetch = oldFetch; sql.close(); }
  console.log('OK depth passed: persisted cursor, ten-series discovery passes, >96 retained episodes, balanced five-show shelves, ten-show cooldown, and sixteen unseen rotations (>48 recent IDs).');
})().catch(error => { console.error(error); process.exitCode = 1; });
