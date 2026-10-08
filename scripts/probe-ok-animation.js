/* Isolated live title-search probe. Output contains public metadata only. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const endpoint = process.env.OK_ANIMATION_CANARY_ENDPOINT || 'https://realsignal-vimeo-canary.tdy1990.workers.dev';
(async () => {
  const { okBalancedCandidates } = await import(pathToFileURL(path.resolve(__dirname, '../ok_public_search.js')));
  const target = path.resolve(__dirname,'../artifacts/ok-animation-public-canary.json');
  const catalogs = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target,'utf8')).catalogs || {} : {}, measurements = [];
  const windows = Math.min(16, Math.max(1, Number(process.env.OK_ANIMATION_WINDOWS || 8)));
  for (const profileKey of (process.env.OK_ANIMATION_PROFILES || 'ok-kids-channel,ok-adult-channel,ok-anime-channel').split(',')) {
    const byId = new Map((catalogs[profileKey]?.items || []).map(item=>[item.id,item]));
    for (let rotation = 0; rotation < windows; rotation++) {
      const start = Date.now();
      const response = await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey,rotation}),signal:AbortSignal.timeout(45000)});
      const body = await response.json();
      if (!response.ok) throw new Error(`${profileKey}: HTTP ${response.status}`);
      for (const lane of body.lanes || []) for (const item of lane.items || []) byId.set(item.id,item);
      const measure = {profileKey,rotation,ms:Date.now()-start,depth:byId.size,lanes:(body.lanes||[]).map(lane=>({verified:lane.items?.length||0,candidates:lane.health?.candidates,queries:lane.health?.queries,misses:lane.health?.animationMisses,errors:lane.health?.errors||[],error:lane.health?.error||null}))};
      measurements.push(measure); console.log(JSON.stringify(measure));
    }
    catalogs[profileKey] = {items:okBalancedCandidates([[...byId.values()]],'tv',512)};
    console.log(JSON.stringify({profileKey,depth:byId.size,series:[...new Set([...byId.values()].map(item=>item.seriesTitle))]}));
  }
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify({at:new Date().toISOString(),catalogs,measurements},null,2));
  if (Object.values(catalogs).some(catalog=>catalog.items.length<5)) throw new Error('Animation canary remains below five qualifying programs');
})().catch(error=>{console.error(error.message);process.exitCode=1});
