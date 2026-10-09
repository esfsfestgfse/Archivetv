/* Bounded serial background ingestion. Official embeds + public metadata only. */
const endpoint = process.env.OK_CATALOG_ENDPOINT || 'https://realsignal-api.tdy1990.workers.dev/api/v3/source/catalog';
const tvWindows = Math.min(40, Math.max(0, Number(process.env.OK_TV_WINDOWS || 12)));
const movieWindows = Math.min(20, Math.max(0, Number(process.env.OK_MOVIE_WINDOWS || 6)));
const animationWindows = Math.min(16, Math.max(0, Number(process.env.OK_ANIMATION_WINDOWS || 10)));
const curatedWindows = Math.min(16, Math.max(0, Number(process.env.OK_CURATED_WINDOWS || 6)));
const musicWindows = Math.min(12, Math.max(0, Number(process.env.OK_MUSIC_WINDOWS || 4)));
const curatedProfiles = ['ok-britannia-channel', 'ok-history-vault-channel', 'ok-factory-floor-channel', 'ok-black-tv-channel'];
const musicProfiles = ['ok-soul-flow-channel', 'ok-country-video-channel', 'ok-video-hits-channel'];
(async () => {
  const failures = [];
  for (const [profileKey, windows] of [['ok-tv-channel', tvWindows], ['ok-movie-channel', movieWindows], ['ok-kids-channel', animationWindows], ['ok-adult-channel', animationWindows], ['ok-anime-channel', animationWindows], ...curatedProfiles.map(profile => [profile, curatedWindows]), ...musicProfiles.map(profile => [profile,musicWindows])]) {
    const curated = curatedProfiles.includes(profileKey) || musicProfiles.includes(profileKey);
    for (let window = 0; window < windows; window++) {
      const start = Date.now();
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileKey, maintenance: true }), signal: AbortSignal.timeout(45000) });
      const result = await response.json();
      if (!response.ok && !(curated && response.status === 503)) throw new Error(`${profileKey}: refresh ${response.status}`);
      console.log(JSON.stringify({ profileKey, window, ms: Date.now() - start, verified: result.items?.length || 0, discovery: result.lanes?.filter(l => l.health?.titleSearch).map(l => ({ cursor: l.health.discoveryCursor, admitted: l.items.length, queryPages: l.health.queryPages })) }));
    }
    const statusUrl = endpoint.replace(/\/catalog$/, '/status') + '?profileKey=' + profileKey + '&fresh=' + Date.now();
    const response = await fetch(statusUrl, { signal: AbortSignal.timeout(15000) });
    const status = await response.json();
    if (!response.ok) throw new Error(`${profileKey}: status ${response.status}`);
    const distinctPrograms = new Set(status.items.map(i => i.seriesId || i.identityReference || i.id)).size;
    console.log(JSON.stringify({ profileKey, catalogDepth: status.items.length, distinctPrograms, sampledCatalog: true }));
    if (curated && (status.items.length < 5 || distinctPrograms < 2)) failures.push(`${profileKey}: underfilled catalog (${status.items.length} items, ${distinctPrograms} programs)`);
  }
  if (failures.length) throw new Error(failures.join('; '));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
