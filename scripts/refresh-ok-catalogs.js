/* Bounded serial background ingestion. Official embeds + public metadata only. */
const endpoint = process.env.OK_CATALOG_ENDPOINT || 'https://realsignal-api.tdy1990.workers.dev/api/v3/source/catalog';
const tvWindows = Math.min(40, Math.max(0, Number(process.env.OK_TV_WINDOWS || 12)));
const movieWindows = Math.min(20, Math.max(0, Number(process.env.OK_MOVIE_WINDOWS || 6)));
(async () => {
  for (const [profileKey, windows] of [['ok-tv-channel', tvWindows], ['ok-movie-channel', movieWindows]]) {
    for (let window = 0; window < windows; window++) {
      const start = Date.now();
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey, maintenance: true }), signal: AbortSignal.timeout(45000) });
      const result = await response.json();
      if (!response.ok || !result.items?.length) throw new Error(`${profileKey}: refresh ${response.status}`);
      console.log(JSON.stringify({ profileKey, window, ms: Date.now() - start, verified: result.items.length, discovery: result.lanes?.filter(l => l.health?.titleSearch).map(l => ({ cursor: l.health.discoveryCursor, admitted: l.items.length, queryPages: l.health.queryPages })) }));
    }
    const statusUrl = endpoint.replace(/\/catalog$/, '/status') + '?profileKey=' + profileKey;
    const response = await fetch(statusUrl, { signal: AbortSignal.timeout(15000) });
    const status = await response.json();
    if (!response.ok) throw new Error(`${profileKey}: status ${response.status}`);
    console.log(JSON.stringify({ profileKey, catalogDepth: status.items.length, distinctPrograms: new Set(status.items.map(i => i.seriesId || i.identityReference || i.id)).size, sampledCatalog: true }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
