import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
const root=new URL('../',import.meta.url);
const catalog=await import('../nascar_catalog.js').catch(()=>({}));

test('NASCAR accepts only official, long, landscape public race replays',()=>{
 assert.equal(typeof catalog.nascarReplayAllowed,'function');
 const good={id:'nascar:raceA',provider:'NASCAR Classics',title:'Daytona 500 1990 — Full Race Broadcast',duration:9193,aspectRatio:16/9,language:'en',officialReplay:true,verification:'hls-vod-segment',url:'https://va.aws.nascar.com/1990_01_DAYTONA/Default/HLS/race.m3u8',sourceUrl:'https://classics.nascar.com/video/raceA~section~page'};
 assert.equal(catalog.nascarReplayAllowed(good),true);
 for(const extra of [{duration:120},{aspectRatio:9/16},{url:'https://example.org/race.m3u8'},{sourceUrl:'https://example.org/video/raceA'},{title:'Daytona Highlights 1990'},{officialReplay:false},{verification:''},{id:'nascar:another'},{language:'fr'}]) assert.equal(catalog.nascarReplayAllowed({...good,...extra}),false,JSON.stringify(extra));
});
test('completed HLS proof uses actual duration/geometry and rejects live/encrypted/short media',async()=>{
 assert.equal(typeof catalog.nascarMediaProof,'function');
 const url='https://va.aws.nascar.com/race/Default/HLS/race.m3u8';
 const master='#EXTM3U\n#EXT-X-STREAM-INF:CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720\n720.m3u8\n';
 const vod='#EXTM3U\n#EXTINF:2000,\n1.ts\n#EXTINF:2000,\n2.ts\n#EXT-X-ENDLIST\n';
 const network=body=>async u=>new Response(String(u)===url?master:String(u).endsWith('.m3u8')?body:'segment',{status:String(u).endsWith('.ts')?206:200});
 const proof=await catalog.nascarMediaProof(url,network(vod));assert.equal(proof.duration,4000);assert.equal(proof.width,1280);
 for(const body of [vod.replace('#EXT-X-ENDLIST',''),vod.replace('#EXTINF:2000,','#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:2000,'),vod.replaceAll('2000','20')]) assert.equal(await catalog.nascarMediaProof(url,network(body)),null);
});
test('verified seed and registry give immediate depth without cold discovery',async()=>{
 const {SOURCE_PROFILE_REGISTRY}=await import('../source_suite_profile_registry.js');
 const {sourceCatalogTasks,qualifySourceItem}=await import('../realsignal_source_catalog.js');
 const p=SOURCE_PROFILE_REGISTRY['nascar-classics'];assert.ok(p);assert.deepEqual(p.providers,['nascar']);
 const plan=sourceCatalogTasks({profileKey:'nascar-classics'}, {},0,{firstLane:true});
 const lane=await plan.tasks[0];assert.ok(lane.items.length>=20);assert.ok(new Set(lane.items.map(x=>x.year)).size>=6);
 assert.ok(lane.items.every(x=>catalog.nascarReplayAllowed(x)&&qualifySourceItem(plan.profile,x)));
 const {catalogFallbackAllowed,compactCatalogItem}=await import('../realsignal_api_v2_worker.js');
 const body={channel:'nascar-classics',sourceCatalog:true};
 assert.equal(catalogFallbackAllowed(lane.items[0],body),true);
 assert.equal(catalogFallbackAllowed({...lane.items[0],officialReplay:false},body),false);
 const persisted=compactCatalogItem(lane.items[0]);
 assert.equal(catalog.nascarReplayAllowed({...persisted,url:persisted.mediaUrl}),true,'D1 compaction must retain the verified official playback proof');
});
test('both clients have a separate sports channel and route NASCAR HLS through the existing decoder',()=>{
 for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
  const s=fs.readFileSync(new URL(file,root),'utf8');
  assert.match(s,/nm:"NASCAR Classics",\s*num:84,\s*cat:"SPORTS",\s*source:"v2preview"/);
  assert.match(s,/"nascar-classics":\{name:"NASCAR Classics",providers:\["nascar"\]/);
  assert.ok(s.includes('/peertube|nascar classics/i.test(String(it.provider||""))'));
 }
});

test('the real API cold-start route returns verified NASCAR inventory without browser discovery',async()=>{
 const {default:api}=await import('../realsignal_api_v2_worker.js');
 const original=globalThis.fetch,pending=[];
 globalThis.fetch=async()=>Response.json({data:[],paging:{total_pages:1}});
 try{
  const response=await api.fetch(new Request('https://api.invalid/api/v3/source/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:'nascar-classics',count:5,rotation:1,minimumReady:12,recentIds:[]})}),{}, {waitUntil:p=>pending.push(p)});
  const body=await response.json();assert.equal(response.status,200);assert.ok(body.items.length>=5);
  assert.ok(body.items.every(catalog.nascarReplayAllowed));
  assert.equal(body.providerAvailability.nascar,true);
  await Promise.allSettled(pending);
 }finally{globalThis.fetch=original;}
});

test('persisted NASCAR records are served from D1 rather than falling back to the starter seed',async()=>{
 const {default:api,compactCatalogItem}=await import('../realsignal_api_v2_worker.js');
 const {NASCAR_VERIFIED_SEED}=await import('../nascar_verified_seed.js');
 const rows=NASCAR_VERIFIED_SEED.slice(0,8).map(compactCatalogItem).map(x=>({id:x.id,provider:x.provider,source_identifier:x.sourceIdentifier,title:x.title,description:x.description,duration_seconds:x.duration,aspect_ratio:x.aspectRatio,media_type:x.mediaType,media_url:x.mediaUrl,source_url:x.sourceUrl,rights:x.rights,year:x.year,metadata_json:JSON.stringify(x)}));
 const pending=[],original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({data:[],paging:{total_pages:1}});
 const env={realsignal_catalog:{prepare(sql){return{bind(){return this;},all:async()=>({results:/FROM programs p/.test(sql)?rows:[]}),first:async()=>null,run:async()=>({success:true})};},batch:async()=>[]}};
 try{
  const r=await api.fetch(new Request('https://api.invalid/api/v3/source/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:'nascar-classics',count:5,rotation:9,minimumReady:5})}),env,{waitUntil:p=>pending.push(p)});
  const body=await r.json();assert.equal(r.status,200);assert.equal(body.source,'d1-source-catalog');assert.equal(body.ready,5);
  assert.ok(body.items.every(catalog.nascarReplayAllowed));await Promise.allSettled(pending);
 }finally{globalThis.fetch=original;}
});
