/* Controlled real-provider probe. Saves public metadata, never signed media. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const root = path.resolve(__dirname, '..');
  const { sourceProfile, okTitleSearch } = await import(pathToFileURL(path.join(root, 'realsignal_source_catalog.js')));
  const catalogs = {};
  const count = Number(process.env.OK_PROBE_ROTATIONS || 4);
  for (const key of ['ok-movie-channel', 'ok-tv-channel']) {
    const union = new Map(); const samples = [];
    for (let rotation = 0; rotation < count; rotation++) {
      const start = Date.now(); const lane = await okTitleSearch(sourceProfile({ profileKey: key }), rotation, {}, {});
      lane.items.forEach(item => union.set(item.id, item));
      const sample = { rotation, ms: Date.now() - start, admitted: lane.items.length, errors: lane.health.errors, queries: lane.health.queries };
      samples.push(sample); console.log(JSON.stringify({ key, ...sample }));
    }
    catalogs[key] = { items: [...union.values()], samples };
    console.log(JSON.stringify({ key, catalogDepth: union.size, series: [...new Set([...union.values()].map(item => item.seriesTitle).filter(Boolean))] }));
    if (union.size < 5) throw new Error(`${key}: fewer than five verified embeds`);
  }
  const out = path.join(root, 'artifacts', 'ok-title-playback-canary.json');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), catalogs }, null, 2));
  console.log(`Public-metadata canary: ${out}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
