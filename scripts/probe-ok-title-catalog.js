/* Controlled real-provider probe. Saves public metadata, never signed media. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
(async () => {
  const root = path.resolve(__dirname, '..');
  const { sourceProfile, okTitleSearch } = await import(pathToFileURL(path.join(root, 'realsignal_source_catalog.js')));
  const { OK_VERIFIED_SEARCH_SEED } = await import(pathToFileURL(path.join(root, 'ok_verified_search_seed.js')));
  const out = path.join(root, 'artifacts', 'ok-title-playback-canary.json');
  let catalogs = {};
  try { catalogs = JSON.parse(fs.readFileSync(out, 'utf8')).catalogs || {}; } catch (_) { /* first probe */ }
  const count = Number(process.env.OK_PROBE_ROTATIONS || 4);
  const keys = (process.env.OK_PROBE_PROFILES || 'ok-movie-channel,ok-tv-channel').split(',');
  for (const key of keys) {
    const union = new Map((OK_VERIFIED_SEARCH_SEED[key] || []).map(item => [item.id, item])); const samples = [];
    const sql = new DatabaseSync(':memory:');
    sql.exec('CREATE TABLE channel_rules (channel_key TEXT PRIMARY KEY, rules_json TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    const db = { prepare(query) { return { bind(...values) { return { async all() { return { results: sql.prepare(query).all(...values) }; } }; } }; } };
    for (let rotation = 0; rotation < count; rotation++) {
      const start = Date.now(); const lane = await okTitleSearch(sourceProfile({ profileKey: key }), rotation + Number(process.env.OK_PROBE_START || 0), { realsignal_catalog: db }, { maintenance: true });
      lane.items.forEach(item => union.set(item.id, item));
      const sample = { rotation, ms: Date.now() - start, admitted: lane.items.length, errors: lane.health.errors, queries: lane.health.queries };
      samples.push(sample); console.log(JSON.stringify({ key, ...sample }));
    }
    catalogs[key] = { items: [...union.values()], samples };
    sql.close();
    console.log(JSON.stringify({ key, catalogDepth: union.size, series: [...new Set([...union.values()].map(item => item.seriesTitle).filter(Boolean))] }));
    if (union.size < 5) throw new Error(`${key}: fewer than five verified embeds`);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), catalogs }, null, 2));
  console.log(`Public-metadata canary: ${out}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
