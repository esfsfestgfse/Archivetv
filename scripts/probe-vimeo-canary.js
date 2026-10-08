/* Isolated public-metadata probe; never accepts or writes a provider token. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const endpoint = process.env.VIMEO_CANARY_ENDPOINT || 'https://realsignal-vimeo-canary.tdy1990.workers.dev';
(async () => {
  const { vimeoBalancedItems } = await import(pathToFileURL(path.resolve(__dirname, '../vimeo_catalog.js')));
  const catalogs = {}, measurements = [];
  for (const profileKey of ['vimeo-movie-channel', 'vimeo-tv-channel']) {
    const byId = new Map();
    for (let rotation = 0; rotation < 6; rotation++) {
      const start = Date.now();
      const response = await fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({profileKey,rotation}), signal:AbortSignal.timeout(45000) });
      const body = await response.json();
      if (!response.ok) throw new Error(`${profileKey}: HTTP ${response.status}`);
      for (const lane of body.lanes || []) for (const item of lane.items || []) byId.set(item.id,item);
      const measure = {profileKey,rotation,ms:Date.now()-start,depth:byId.size,lanes:(body.lanes || []).map(lane=>({verified:lane.items?.length||0,queries:lane.health?.queryPages,errors:lane.health?.errors||[],error:lane.health?.error||null}))};
      measurements.push(measure); console.log(JSON.stringify(measure));
    }
    catalogs[profileKey] = {items:vimeoBalancedItems([...byId.values()])};
    console.log(JSON.stringify({profileKey,titles:catalogs[profileKey].items.map(item=>item.title)}));
  }
  const target = path.resolve(__dirname,'../artifacts/vimeo-public-playback-canary.json');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify({at:new Date().toISOString(),catalogs,measurements},null,2));
  if (Object.values(catalogs).some(catalog=>catalog.items.length<5)) throw new Error('Vimeo canary remains constrained below five qualifying programs');
})().catch(error=>{console.error(error.message);process.exitCode=1});
