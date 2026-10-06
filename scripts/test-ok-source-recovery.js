/* Regression tests for the two reported OK.ru failures; no network or secrets. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');

(async () => {
  const source = await import(pathToFileURL(path.join(root, 'realsignal_source_catalog.js')));
  const helpers = await import(pathToFileURL(path.join(root, 'ok_public_search.js')));
  const movie = source.sourceProfile({ profileKey: 'ok-movie-channel' });
  const tv = source.sourceProfile({ profileKey: 'ok-tv-channel' });
  const item = { id: 'ok:123', provider: 'OK.ru', title: 'Tombstone.1993.1080p.BluRay', duration: 7777, aspectRatio: 2.4, type: 'video', url: 'https://ok.ru/videoembed/123', embedAllowed: true };
  assert.equal(source.qualifySourceItem(movie, item).type, 'embed', 'old HTML-as-video rows must be repaired');
  assert.equal(source.qualifySourceItem(movie, { ...item, duration: 3599 }), null);
  assert.equal(source.qualifySourceItem(movie, { ...item, aspectRatio: .6 }), null);
  assert.equal(source.qualifySourceItem(movie, { ...item, title: 'Mandala Full Set Movie 4K' }), null);
  assert.equal(source.qualifySourceItem(movie, { ...item, title: 'Tombstone.1993.1080p.TRUEFRENCH' }), null);
  assert.equal(source.qualifySourceItem(movie, { ...item, title: 'Rambo.III.1988.BDRip.1080p.UKR.DVO' }), null);
  assert.equal(source.qualifySourceItem(movie, { ...item, title: 'Terminator.1984.1080p.AUDIO COMMENTARY ONLY' }), null);
  assert.equal(source.qualifySourceItem(tv, { ...item, title: 'BTTH S01E01 1080p', duration: 1600 }), null);
  const episode = { ...item, title: 'Taxi.S01E01.DVDRip.x264', duration: 1481, language: 'en', seriesTitle: 'Taxi' };
  assert.ok(source.qualifySourceItem(tv, episode), 'episode filenames must be admitted without literal full-episode wording');
  assert.equal(source.qualifySourceItem(tv, { ...episode, duration: 899 }), null);
  assert.ok(tv.deny.includes('donghua'), 'the full deny list must survive profile normalization');
  const attr = value => JSON.stringify(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const rows = helpers.okSearchRows(`<div data-props="${attr({ searchQuery: '1080p', videos: { list: [{ movie: { id: '123', title: episode.title, duration: 1481000, width: 640, height: 480 } }] } })}"></div>`);
  assert.equal(rows[0].duration_seconds, 1481);
  const meta = helpers.okEmbedMetadata(`<div data-options="${attr({ isIframePlayer: false, flashvars: { metadata: JSON.stringify({ movie: { id: '123', status: 'OK', title: item.title, duration: 7777, width: 1920, height: 800 }, videos: [{ url: 'signed-private-link' }] }) } })}"></div>`, '123');
  assert.equal(meta.duration, 7777);
  assert.equal(meta.url, item.url);
  assert.ok(!JSON.stringify(meta).includes('signed-private-link'));
  assert.equal(helpers.okEmbedMetadata(`<div data-options="${attr({ flashvars: { metadata: { movie: { id: '123', status: 'BLOCKED', width: 1920, height: 800 } } } })}"></div>`, '123'), null);
  const balanced = helpers.okBalancedCandidates([[...Array(8)].map((_, i) => ({ id: `a${i}`, title: `Taxi S01E0${i} DVDRip` })), [{ id: 'b1', title: 'Friends S01E01 1080p' }]], 'tv', 3);
  assert.equal(balanced[1].id, 'b1', 'one page/series cannot consume the hydration budget');
  let identityCalls = 0;
  const identities = await helpers.okMovieIdentities([item], async url => {
    identityCalls++;
    return url.includes('en.wikipedia') ? { query: { pages: { 1: { title: 'Tombstone (film)', pageprops: { wikibase_item: 'Q1420651', 'wikibase-shortdesc': '1993 film' } } } } }
      : { entities: { Q1420651: { claims: { P364: [{ mainsnak: { datavalue: { value: { id: 'Q1860' } } } }] } } } };
  });
  assert.equal(identityCalls, 2, 'film identities must be batched');
  assert.equal(identities.get(item.id).language, 'en');

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('provider temporarily unavailable', { status: 429 });
    const { default: worker } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
    for (const profile of [movie, tv]) {
      const plan = source.sourceCatalogTasks({ profileKey: profile.profileKey }, {}, 0, { firstLane: true });
      const lanes = await Promise.all(plan.tasks);
      const shelf = lanes.flatMap(lane => lane.items);
      assert.ok(shelf.length >= 5, `${profile.profileKey}: provider outage must not empty the verified shelf`);
      assert.ok(shelf.every(row => row.type === 'embed' && row.duration >= profile.minRuntimeSeconds));
      assert.ok(shelf.every(row => source.qualifySourceItem(profile, row)));
      const inserted = [];
      const db = {
        prepare(sql) { return { bind(...values) { return { sql, values, async all() { return { results: [] }; } }; } }; },
        async batch(statements) { inserted.push(...statements.filter(s => s.sql.startsWith('INSERT INTO programs'))); return []; }
      };
      const response = await worker.fetch(new Request('https://api.example/api/v3/source/catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: profile.profileKey, maintenance: true }) }), { realsignal_catalog: db }, { waitUntil() {} });
      const result = await response.json();
      assert.equal(response.status, 200);
      assert.equal(inserted.length, result.items.length, 'every admitted program must survive the database write gate');
      assert.ok(inserted.length >= 20, 'release filenames must not collapse a deep catalog to five rows');
      assert.ok(inserted.every(row => row.values[7] === 'embed'));
    }
  } finally { globalThis.fetch = originalFetch; }

  const listeners = new Set(), timers = new Map(); let seq = 0;
  const window = { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const frames = [];
  const context = { window, URL, document: { createElement: () => ({ dataset: {}, contentWindow: {}, remove() { this.removed = true; } }) }, setTimeout: fn => { timers.set(++seq, fn); return seq; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/ok-embed-runtime.js'), 'utf8'), context);
  assert.equal(window.RealSignalOKEmbed.qualify(movie, item), true);
  assert.equal(window.RealSignalOKEmbed.normalize(item).type, 'embed');
  const ordered = window.RealSignalOKEmbed.order(tv, [{ ...episode, id: '1', seriesId: 'taxi' }, { ...episode, id: '2', title: 'Taxi S01E02 DVDRip', seriesId: 'taxi' }, { ...episode, id: '3', title: 'Friends S01E01 1080p', seriesId: 'friends' }]);
  assert.equal(ordered[1].id, '3');
  let started = 0, ended = 0, failed = 0;
  const options = { item, container: { appendChild: frame => frames.push(frame) }, isCurrent: () => true, onReady() {}, onStarted: () => started++, onEnded: () => ended++, onError: () => failed++ };
  const ready = window.RealSignalOKEmbed.play(options);
  const frame = frames[0]; frame.onload(); assert.equal(await ready, true);
  const send = (event, origin = 'https://ok.ru', owner = frame.contentWindow) => { for (const fn of [...listeners]) fn({ origin, source: owner, data: { event } }); };
  send('started', 'https://wrong.example'); assert.equal(started, 0);
  send('started'); assert.equal(started, 1);
  send('paused'); for (const fn of [...timers.values()]) fn(); assert.equal(ended, 0); assert.equal(failed, 0);
  send('ended'); send('ended'); assert.equal(ended, 1, 'real EOF advances exactly once');
  window.RealSignalOKEmbed.stop(); assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
  const nextReady = window.RealSignalOKEmbed.play(options); const nextFrame = frames[1]; nextFrame.onload(); await nextReady;
  send('error', 'https://ok.ru', nextFrame.contentWindow); assert.equal(failed, 1);
  assert.equal(listeners.size, 0);
  const api = fs.readFileSync(path.join(root, 'realsignal_api_v2_worker.js'), 'utf8');
  assert.ok(api.includes('metadata_json=excluded.metadata_json'), 'catalog repairs must replace stale metadata');
  for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(html.includes('assets/ok-embed-runtime.js?v=5.5.73'));
    assert.ok(html.includes('function playOKEmbed'));
    assert.ok(html.includes('window.RealSignalOKEmbed.qualify(profile,item)'));
    assert.ok(html.includes('V2_SOURCE_CACHE_VERSION=60'));
  }
  console.log('OK source recovery passed: title metadata, runtime/genre/cache gates, fair hydration, official iframe, actual EOF, spoof rejection and cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
