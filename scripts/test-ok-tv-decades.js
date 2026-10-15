/* OK TV decade pilot: canonical TVmaze premiere metadata and D1 round-trip. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

function d1(sql, metrics = {}) {
  return {
    prepare(query) {
      metrics.queries = (metrics.queries || 0) + 1;
      if (/\b(?:INSERT|UPDATE)\s+(?:INTO\s+)?channel_rules\b/i.test(query)) metrics.discoveryWrites = (metrics.discoveryWrites || 0) + 1;
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

function migrate(sql) {
  for (const file of ['0001_realsignal_catalog.sql', '0002_realsignal_v3_observability.sql', '0003_realsignal_v4_adaptive_catalog.sql']) {
    sql.exec(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
  }
}

function insertEpisode(sql, { id, series, seriesIndex, decade, episode, seenAt }) {
  const metadata = {
    id,
    sourceIdentifier: id,
    title: `${series} S01E${String(episode).padStart(2, '0')} DVDRip`,
    description: 'Full television episode',
    provider: 'OK.ru',
    duration: 1500,
    durationUnit: 'seconds',
    aspectRatio: 4 / 3,
    mediaType: 'embed',
    mediaUrl: `https://ok.ru/videoembed/${id.replace(/\D/g, '')}`,
    sourceUrl: `https://ok.ru/video/${id.replace(/\D/g, '')}`,
    embedAllowed: true,
    language: 'en',
    seriesTitle: series,
    seriesId: `tvmaze:${decade + seriesIndex + 1}`,
    identityProvider: 'TVmaze',
    identityReference: `https://www.tvmaze.com/shows/${decade + seriesIndex + 1}/${series.toLowerCase().replace(/\s+/g, '-')}`,
    seriesStartYear: decade + (seriesIndex % 10),
    seriesDecade: decade,
  };
  sql.prepare("INSERT INTO programs (id,provider,source_identifier,title,description,duration_seconds,aspect_ratio,media_type,media_url,source_url,rights,year,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')")
    .run(id, metadata.provider, id, metadata.title, metadata.description, metadata.duration, metadata.aspectRatio, metadata.mediaType, metadata.mediaUrl, metadata.sourceUrl, '', String(metadata.seriesStartYear), JSON.stringify(metadata), seenAt, seenAt);
  sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,?)')
    .run('ok-tv-channel', id, seenAt);
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
    migrate(sql);
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

  const catalogSql = new DatabaseSync(':memory:');
  try {
    migrate(catalogSql);
    const now = Date.now();
    for (let seriesIndex = 0; seriesIndex < 15; seriesIndex += 1) {
      for (let episode = 1; episode <= 5; episode += 1) {
        for (const decade of [2000, 1990, 1980]) {
          insertEpisode(catalogSql, {
            id: `${decade}${String(seriesIndex).padStart(2, '0')}${episode}`,
            series: `Verified ${decade}s Series ${String(seriesIndex + 1).padStart(2, '0')}`,
            seriesIndex,
            decade,
            episode,
            seenAt: now + ((seriesIndex * 5 + episode) * 10) + decade,
          });
        }
      }
    }
    insertEpisode(catalogSql, { id: '1979001', series: 'Boundary 1979', seriesIndex: 20, decade: 1970, episode: 1, seenAt: now + 99999 });
    insertEpisode(catalogSql, { id: '2010001', series: 'Boundary 2010', seriesIndex: 21, decade: 2010, episode: 1, seenAt: now + 99998 });
    const unknown = {
      id: '0000001', provider: 'OK.ru', sourceIdentifier: '0000001', title: 'Unknown Series S01E01 DVDRip',
      description: 'Full television episode', duration: 1500, durationUnit: 'seconds', aspectRatio: 4 / 3,
      mediaType: 'embed', mediaUrl: 'https://ok.ru/videoembed/0000001', sourceUrl: 'https://ok.ru/video/0000001',
      embedAllowed: true, language: 'en', seriesTitle: 'Unknown Series', seriesId: 'tvmaze:99999',
      identityProvider: 'TVmaze', identityReference: 'https://www.tvmaze.com/shows/99999/unknown-series',
    };
    catalogSql.prepare("INSERT INTO programs (id,provider,source_identifier,title,description,duration_seconds,aspect_ratio,media_type,media_url,source_url,rights,year,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')")
      .run(unknown.id, unknown.provider, unknown.sourceIdentifier, unknown.title, unknown.description, unknown.duration, unknown.aspectRatio, unknown.mediaType, unknown.mediaUrl, unknown.sourceUrl, '', '', JSON.stringify(unknown), now, now);
    catalogSql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,?)').run('ok-tv-channel', unknown.id, now);

    const metrics = {};
    const waits = [];
    const env = { realsignal_catalog: d1(catalogSql, metrics) };
    const ctx = { waitUntil(promise) { waits.push(Promise.resolve(promise)); } };
    const fetchCount = { value: 0 };
    const providerFetch = globalThis.fetch;
    globalThis.fetch = async () => { fetchCount.value += 1; throw new Error('provider outage'); };
    const post = async (profileKey, extra = {}) => {
      const response = await workerModule.default.fetch(new Request('https://api.example/api/v3/source/catalog', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileKey, count: 5, minimumReady: 5, staleReady: 2, ...extra }),
      }), env, ctx);
      const payload = await response.json();
      return { response, payload };
    };
    try {
      for (const [profileKey, decade] of decadeProfiles) {
        const { response, payload } = await post(profileKey, { refresh: true });
        assert.equal(response.status, 200, `${profileKey} must serve from the parent D1 catalog`);
        assert.equal(payload.items.length, 5, `${profileKey} must return a full ready shelf`);
        assert.ok(payload.items.every((item) => item.seriesDecade === decade), `${profileKey} cannot leak another decade`);
        assert.equal(new Set(payload.items.map((item) => item.seriesId)).size, 5, `${profileKey} must balance five different series`);
        assert.equal(payload.catalogDepth, 75, `${profileKey} must expose all 75 verified decade episodes`);
        assert.equal(payload.source, 'd1-derived-source-catalog');
      }

      const first1980 = (await post('ok-tv-1980s')).payload.items[0];
      await post('ok-tv-1980s', { playedIds: [first1980.id] });
      await Promise.all(waits.splice(0));
      const freshnessRows = catalogSql.prepare('SELECT channel_key FROM channel_freshness WHERE program_id=? ORDER BY channel_key').all(first1980.id);
      assert.deepEqual(freshnessRows.map((row) => row.channel_key), ['ok-tv-1980s'], 'derived playback history must not contaminate its parent or sibling ledgers');
      assert.ok(!(await post('ok-tv-1980s')).payload.items.some((item) => item.id === first1980.id), 'played item must be excluded from its own derived lane');

      const cooledAt = now + 500000;
      const cooledIds = [];
      for (let seriesIndex = 0; seriesIndex < 10; seriesIndex += 1) {
        for (let episode = 1; episode <= 5; episode += 1) {
          const id = `1980${String(seriesIndex).padStart(2, '0')}${episode}`;
          cooledIds.push(id);
          catalogSql.prepare('INSERT INTO channel_freshness (channel_key,program_id,last_served_at,play_count) VALUES (?,?,?,1) ON CONFLICT(channel_key,program_id) DO UPDATE SET last_served_at=excluded.last_served_at').run('ok-tv-1980s', id, cooledAt);
        }
      }
      const unseen = (await post('ok-tv-1980s', { recentIds: cooledIds })).payload;
      assert.ok(unseen.items.every((item) => Number(item.seriesTitle.match(/(\d+)$/)?.[1]) > 10), 'ten cooled series must yield unseen series before cooled fallback');

      const guideResponse = await workerModule.default.fetch(new Request('https://api.example/api/v3/guide?channel=ok-tv-1990s&limit=5'), env, ctx);
      const guide = await guideResponse.json();
      const playback = (await post('ok-tv-1990s')).payload;
      assert.equal(guideResponse.status, 200);
      assert.deepEqual(guide.items.map((item) => item.id), playback.items.map((item) => item.id), 'guide and playback must use the same derived manifest and freshness ordering');
      assert.ok(guide.items.every((item) => item.seriesDecade === 1990));

      const exhaustedIds = [];
      for (const row of catalogSql.prepare("SELECT program_id FROM channel_programs WHERE channel_key='ok-tv-channel' AND program_id LIKE '1980%'").all()) {
        exhaustedIds.push(row.program_id);
        catalogSql.prepare('INSERT INTO channel_freshness (channel_key,program_id,last_served_at,play_count) VALUES (?,?,?,1) ON CONFLICT(channel_key,program_id) DO UPDATE SET last_served_at=excluded.last_served_at').run('ok-tv-1980s', row.program_id, cooledAt + 1);
      }
      const exhausted = (await post('ok-tv-1980s', { maintenance: true, recentIds: exhaustedIds })).payload;
      assert.equal(exhausted.catalogExhausted, true, 'a truly exhausted lane must be explicit');
      assert.equal(exhausted.repeatAllowed, true, 'a truly exhausted lane may repeat instead of returning No Signal');
      assert.ok(exhausted.items.every((item) => item.seriesDecade === 1980), 'wrong-decade rows can never pad an exhausted shelf');
      assert.equal(fetchCount.value, 0, 'derived playback, refresh, maintenance, Next, and guide must never call a provider');
      assert.equal(metrics.discoveryWrites || 0, 0, 'derived requests must never advance discovery offsets');
    } finally {
      globalThis.fetch = providerFetch;
      await Promise.all(waits.splice(0));
    }
  } finally {
    catalogSql.close();
  }

  console.log('OK TV decade pilot passed: metadata, filtered parent manifests, isolated freshness, guide parity, and zero provider discovery.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
