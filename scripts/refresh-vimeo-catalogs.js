/* Serial background discovery through the API. Provider credentials stay at
 * Cloudflare; empty search windows do not erase the last verified catalog. */
const endpoint = process.env.VIMEO_CATALOG_ENDPOINT || 'https://realsignal-api.tdy1990.workers.dev/api/v3/source/catalog';
const windows = Math.min(24, Math.max(1, Number(process.env.VIMEO_CATALOG_WINDOWS || 12)));
(async () => {
  for (const profileKey of ['vimeo-movie-channel','vimeo-tv-channel']) {
    let failures = 0;
    for (let window = 0; window < windows; window++) {
      const start = Date.now();
      try {
        const response = await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey,maintenance:true}),signal:AbortSignal.timeout(45000)});
        const body = await response.json();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log(JSON.stringify({profileKey,window,ms:Date.now()-start,shelf:body.items?.length||0,discovery:body.lanes?.filter(lane=>lane.provider==='Vimeo').map(lane=>({admitted:lane.items?.length||0,queries:lane.health?.queryPages,error:lane.health?.error||null}))}));
      } catch (error) { failures++; console.warn(`${profileKey}: refresh window ${window}: ${error.message}`); }
    }
    const response = await fetch(endpoint.replace(/\/catalog$/,'/status')+'?profileKey='+profileKey,{signal:AbortSignal.timeout(15000)});
    const status = await response.json();
    if (!response.ok || (status.items?.length||0)<5) throw new Error(`${profileKey}: fewer than five verified programs after discovery`);
    console.log(JSON.stringify({profileKey,catalogDepth:status.items.length,distinctSeries:new Set(status.items.map(item=>item.seriesId||item.seriesTitle||item.title)).size,failures,sampledCatalog:true}));
    if (failures === windows) throw new Error(`${profileKey}: all refresh requests failed`);
  }
})().catch(error=>{console.error(error.message);process.exitCode=1});
