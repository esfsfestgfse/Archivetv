/* Real SQLite round-trip: animation identity survives D1 and deep rotation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('node:url');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const {default:worker}=await import(pathToFileURL(path.join(root,'realsignal_api_v2_worker.js')));
  const sql=new DatabaseSync(':memory:');
  for(const f of ['0001_realsignal_catalog.sql','0002_realsignal_v3_observability.sql','0003_realsignal_v4_adaptive_catalog.sql'])sql.exec(fs.readFileSync(path.join(root,'migrations',f),'utf8'));
  const db={prepare(query){return{bind(...args){return{query,args,async all(){return{results:sql.prepare(query).all(...args)}}}}}},async batch(statements){return statements.map(s=>sql.prepare(s.query).all(...s.args))}};
  const pending=[],ctx={waitUntil(promise){pending.push(promise)}};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response('temporary provider outage',{status:429});
  const apiSource=fs.readFileSync(path.join(root,'realsignal_api_v2_worker.js'),'utf8');
  const compactScope={};vm.runInNewContext(apiSource.slice(apiSource.indexOf('function compactCatalogItem('),apiSource.indexOf('\nfunction queueItemKey(')),compactScope);
  for(const family of ['kids','adult','anime']){
    const key=`ok-${family}-channel`;
    for(let i=0;i<150;i++){
      const n=i%6,id=`ok:${{kids:10000,adult:20000,anime:30000}[family]+i}`,title=`Show ${n} S01E${String(Math.floor(i/6)+1).padStart(2,'0')}${family==='anime'?' English Dub':' DVDRip'}`;
      const item={id,title,provider:'OK.ru',duration:1500,durationUnit:'seconds',aspectRatio:1.33,type:'embed',url:`https://ok.ru/videoembed/${id.slice(3)}`,embedAllowed:true,language:'en',seriesId:`tvmaze:${n+1}`,seriesTitle:`Show ${n}`,identityReference:`https://www.tvmaze.com/shows/${n+1}/show`,animationFamily:family,animationVerified:true,animationVerificationVersion:2,animationEpisodeRuntime:1500};
      const compact=compactScope.compactCatalogItem(item);
      assert.equal(compact.animationFamily,family);assert.equal(compact.animationVerified,true);
      sql.prepare("INSERT INTO programs (id,provider,title,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')").run(id,'OK.ru',title,1500,1.33,'embed',item.url,JSON.stringify(compact),1,1);
      sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,1)').run(key,id);
    }
    const seen=[];
    for(let rotation=0;rotation<16;rotation++){
      const response=await worker.fetch(new Request('https://api.example/api/v3/source/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:key,count:5,rotation,recentIds:seen})}),{realsignal_catalog:db},ctx);
      const shelf=await response.json();assert.equal(response.status,200);assert.equal(shelf.items.length,5);assert.ok(shelf.catalogDepth>=150,'background discovery may grow, never shrink, the retained catalog');
      assert.equal(new Set(shelf.items.map(item=>item.seriesId)).size,5);
      assert.ok(shelf.candidateItems.every(item=>!seen.includes(item.id)));
      for(const item of shelf.items){assert.equal(item.animationFamily,family);assert.equal(item.animationVerified,true);assert.ok(!seen.includes(item.id));seen.push(item.id)}
    }
  }
  await Promise.all(pending);globalThis.fetch=originalFetch;sql.close();console.log('OK animation depth passed: D1 identity round-trip, 150 retained episodes per lane, five different series per shelf, and sixteen unseen rotations.');
})().catch(error=>{console.error(error);process.exitCode=1});
