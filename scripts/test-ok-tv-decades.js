/* OK TV decade pilot: canonical TVmaze premiere metadata and D1 round-trip. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

function d1(sql) {
  return {
    prepare(query) {
      return {
        bind(...args) {
          return {
            query,
            args,
            async all() { return { results: sql.prepare(query).all(...args) }; },
            async first() { return sql.prepare(query).get(...args) || null; },
          };
        },
      };
    },
    async batch(statements) {
      return statements.map((statement) => ({ results: sql.prepare(statement.query).all(...statement.args) }));
    },
  };
}

(async () => {
  const search = await import(pathToFileURL(path.join(root, 'ok_public_search.js')));
  const source = await import(pathToFileURL(path.join(root, 'realsignal_source_catalog.js')));
  const workerModule = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));

  assert.equal(typeof search.okSeriesPremiere, 'function', 'TVmaze premiere classification must be exported');
  for (const [premiered, expectedYear, expectedDecade] of [
    ['1979-12-31', 1979, 1970], ['1980-01-01', 1980, 1980],
    ['1989-12-31', 1989, 1980], ['1990-01-01', 1990, 1990],
    ['1999-12-31', 1999, 1990], ['2000-01-01', 2000, 2000],
    ['2009-12-31', 2009, 2000], ['2010-01-01', 2010, 2010],
  ]) {
    assert.deepEqual(search.okSeriesPremiere({ premiered }), {
      seriesStartYear: expectedYear,
      seriesDecade: expectedDecade,
    }, `premiere ${premiered} must classify from the canonical show date`);
  }
  for (const premiered of [null, '', 'unknown', '94-01-01', '199x-01-01', '1994-13-40']) {
    assert.equal(search.okSeriesPremiere({ premiered }), null, `invalid premiere ${premiered} must remain unclassified`);
  }

  const identity = await search.okProgramIdentity(
    { title: 'Example Show S01E01 DVDRip' },
    'tv',
    async () => [{ show: { id: 44, name: 'Example Show', language: 'English', type: 'Scripted', url: 'https://www.tvmaze.com/shows/44/example-show', premiered: '1984-09-20' } }],
  );
  assert.equal(identity.seriesStartYear, 1984);
  assert.equal(identity.seriesDecade, 1980);

  const unknownIdentity = await search.okProgramIdentity(
    { title: 'Unknown Show 1994 S01E01 DVDRip' },
    'tv',
    async () => [{ show: { id: 45, name: 'Unknown Show', language: 'English', type: 'Scripted', url: 'https://www.tvmaze.com/shows/45/unknown-show', premiered: null } }],
  );
  assert.equal(unknownIdentity.seriesStartYear, undefined, 'a title year cannot replace missing TVmaze premiere evidence');
  assert.equal(unknownIdentity.seriesDecade, undefined, 'unknown premiere stays master-only');

  const profile = source.sourceProfile({ profileKey: 'ok-tv-channel' });
  const verified = source.qualifySourceItem(profile, {
    id: 'ok:1984001',
    title: 'Example Show S01E01 DVDRip',
    description: 'Full television episode',
    provider: 'OK.ru',
    duration: 1500,
    durationUnit: 'seconds',
    aspectRatio: 4 / 3,
    type: 'embed',
    url: 'https://ok.ru/videoembed/1984001',
    embedUrl: 'https://ok.ru/videoembed/1984001',
    embedAllowed: true,
    language: 'en',
    seriesTitle: 'Example Show',
    seriesId: 'tvmaze:44',
    identityProvider: 'TVmaze',
    identityReference: 'https://www.tvmaze.com/shows/44/example-show',
    seriesStartYear: 1984,
    seriesDecade: 1980,
  });
  assert.equal(verified.seriesStartYear, 1984, 'source normalization must retain the canonical premiere year');
  assert.equal(verified.seriesDecade, 1980, 'source normalization must retain the canonical decade');

  const decadeProfiles = [
    ['ok-tv-1980s', 1980],
    ['ok-tv-1990s', 1990],
    ['ok-tv-2000s', 2000],
  ];
  for (const [profileKey, seriesDecade] of decadeProfiles) {
    const decadeProfile = source.sourceProfile({ profileKey });
    assert.ok(decadeProfile, `${profileKey} must be registered`);
    assert.equal(decadeProfile.parentProfileKey, 'ok-tv-channel');
    assert.equal(decadeProfile.derivedCatalogOnly, true);
    assert.equal(decadeProfile.seriesDecade, seriesDecade);
    assert.equal(source.sourceCatalogKey(decadeProfile), 'ok-tv-channel');
    assert.ok(source.qualifySourceItem(decadeProfile, { ...verified, seriesDecade }), `${profileKey} must admit its own verified decade`);
    assert.equal(source.qualifySourceItem(decadeProfile, { ...verified, seriesDecade: seriesDecade + 10 }), null, `${profileKey} must reject another decade`);
    assert.equal(source.qualifySourceItem(decadeProfile, { ...verified, seriesDecade: 0 }), null, `${profileKey} must reject unknown premiere years`);
    assert.equal(source.sourceCatalogTasks({ profileKey }, {}, 0, { maintenance: true }).tasks.length, 0, `${profileKey} maintenance cannot create provider tasks`);
    assert.equal(source.sourceCatalogTasks({ profileKey }, {}, 0, { refresh: true }).tasks.length, 0, `${profileKey} refresh cannot create provider tasks`);
    assert.equal(source.sourceRefreshTasks({ profileKey }, {}, 0, { maintenance: true }).length, 0, `${profileKey} refill cannot create provider tasks`);
    const direct = await source.discoverSourceCatalog({ profileKey, maintenance: true }, {}, 0);
    assert.equal(direct.reason, 'derived-catalog-only', `${profileKey} direct discovery must be typed and inert`);
    assert.deepEqual(direct.items, []);
  }

  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, result: { videos: { items: [] } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    for (const profileKey of ['ok-tv-channel', 'ok-movie-channel', 'ok-kids-channel', 'ok-black-tv-channel', 'ok-soul-flow-channel']) {
      const plan = source.sourceCatalogTasks({ profileKey }, {}, 0, { firstLane: true });
      assert.ok(plan.tasks.length > 0, `${profileKey} must retain its existing discovery plan`);
      await Promise.allSettled(plan.tasks);
    }
  } finally {
    globalThis.fetch = oldFetch;
  }

  const compact = workerModule.compactCatalogItem(verified);
  assert.equal(compact.seriesStartYear, 1984, 'catalog compaction must retain the canonical premiere year');
  assert.equal(compact.seriesDecade, 1980, 'catalog compaction must retain the canonical decade');

  const sql = new DatabaseSync(':memory:');
  try {
    for (const file of ['0001_realsignal_catalog.sql', '0002_realsignal_v3_observability.sql', '0003_realsignal_v4_adaptive_catalog.sql']) {
      sql.exec(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
    }
    const now = Date.now();
    sql.prepare("INSERT INTO programs (id,provider,source_identifier,title,description,duration_seconds,aspect_ratio,media_type,media_url,source_url,rights,year,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')")
      .run(compact.id, compact.provider, compact.sourceIdentifier, compact.title, compact.description, compact.duration, compact.aspectRatio, compact.mediaType, compact.mediaUrl, compact.sourceUrl, compact.rights, compact.year, JSON.stringify(compact), now, now);
    sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,?)')
      .run('ok-tv-channel', compact.id, now);
    const response = await workerModule.default.fetch(new Request('https://api.example/api/v3/source/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileKey: 'ok-tv-channel', count: 1, minimumReady: 1, staleReady: 1 }),
    }), { realsignal_catalog: d1(sql) }, { waitUntil() {} });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.items[0].seriesStartYear, 1984, 'D1 playback reconstruction must retain the canonical premiere year');
    assert.equal(payload.items[0].seriesDecade, 1980, 'D1 playback reconstruction must retain the canonical decade');
  } finally {
    sql.close();
  }

  console.log('OK TV decade metadata passed: canonical TVmaze boundaries, no title-year guessing, and D1 round-trip preservation.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
