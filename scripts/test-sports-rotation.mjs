import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SessionRotation} from '../realsignal_api_rotation.js';
import Sports from '../assets/sports-programs.js';
const event=(id,n)=>({identifier:id,title:'UFC '+n+' Full Event',runtime:7200,media:{type:'video',url:'https://archive.org/download/'+id+'/broadcast.mp4',runtime:7200,width:640,height:480,verification:'transport',verifiedAt:Date.now()}});
function session(){const saved=new Map(),storage={get:async key=>Array.isArray(key)?new Map(key.map(k=>[k,structuredClone(saved.get(k))])):structuredClone(saved.get(key)),put:async(key,value)=>{if(typeof key==='object'){for(const [k,v] of Object.entries(key))saved.set(k,structuredClone(v));}else saved.set(key,structuredClone(value));},delete:async key=>{for(const k of [].concat(key))saved.delete(k);}};storage.transaction=async fn=>fn(storage);return new SessionRotation({storage},{});}
async function select(s,body){const r=await s.fetch(new Request('https://rotation.invalid/select',{method:'POST',body:JSON.stringify(body)}));assert.equal(r.status,200);return r.json();}
const items=[event('ufc100-a',100),event('ufc100-b',100),event('ufc101',101),event('ufc102',102)];
test('actual session rotation groups events but preserves alternate inventory and does not mark preloads watched',async()=>{
 const s=session(),body={items,count:3,requirePlayable:true,stationChannel:'56',playedOnly:true,viewerRecentIds:[]};
 const a=await select(s,body);assert.equal(a.items.length,3);assert.equal(new Set(a.items.map(i=>Sports.key(i,56))).size,3);assert.equal(a.catalog.length,4);
 assert.equal(a.seen,0);const b=await select(s,body);assert.equal(b.seen,0);assert.equal(b.cycleReset,false);
 const group=a.items.find(i=>Sports.describe(i,56).eventId==='sports:ufc:100');assert.ok(group);assert.equal(group.sportsCopies.length,1);
 const played=await select(s,{...body,viewerRecentIds:['ufc100-a']});assert.ok(played.items.every(i=>Sports.key(i,56)!==Sports.key(items[0],56)));
});
test('event freshness survives a changing upload window',async()=>{
 const s=session(),body={items,count:2,requirePlayable:true,stationChannel:'56',playedOnly:true,viewerRecentIds:[]};
 await select(s,body);await select(s,{...body,viewerRecentIds:['ufc100-a']});
 const later=await select(s,{...body,items:[event('new-ufc100-copy',100),event('new-ufc103',103)],viewerRecentIds:[]});
 assert.ok(later.items.every(i=>Sports.key(i,56)!==Sports.key(items[0],56)));
});
test('real API fallback keeps one program per event with full alternate records',async()=>{
 const {default:api}=await import('../realsignal_api_v2_worker.js');
 const pending=[];const r=await api.fetch(new Request('https://api.invalid/api/v3/ia/queue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel:'56',count:3,queries:['ufc'],mediaTypes:['movies'],recentIds:[]})}),{RELAY:{fetch:async()=>Response.json({items,candidateItems:items,ready:4,candidates:4})}},{waitUntil:p=>pending.push(p)});
 const d=await r.json();assert.equal(r.status,200);assert.equal(d.items.length,3);assert.equal(new Set(d.items.map(i=>Sports.key(i,56))).size,3);assert.ok(d.items.some(i=>i.sportsCopies?.length));await Promise.allSettled(pending);
});
test('reserved sports shelves retain backups and only committed events enter history',async()=>{
 const s=session(),body={mode:'reserve',items,count:3,rules:{channel:'56',mediaTypes:['movies'],minRuntimeSeconds:900}};
 const a=await select(s,body);assert.equal(a.seen,0);assert.equal(new Set(a.items.map(i=>Sports.key(i,56))).size,3);
 const again=await select(s,body);assert.equal(again.seen,0);
 const primary=a.items.find(i=>Sports.key(i,56)==='sports:ufc:100');assert.ok(primary.sportsCopies.length);
 await select(s,{mode:'commit',event:'started',id:primary.identifier});
 const next=await select(s,body);assert.ok(next.items.every(i=>Sports.key(i,56)!=='sports:ufc:100'));
});
test('persisted official catalog excludes another upload of a played race',async()=>{
 const {default:api,compactCatalogItem}=await import('../realsignal_api_v2_worker.js');
 const {NASCAR_VERIFIED_SEED}=await import('../nascar_verified_seed.js');
 const first=NASCAR_VERIFIED_SEED[0],alias={...first,id:'nascar:aliascopy',sourceUrl:'https://classics.nascar.com/video/aliascopy'};
 const records=[first,alias,...NASCAR_VERIFIED_SEED.slice(1,9)];
 const rows=records.map(compactCatalogItem).map(x=>({id:x.id,provider:x.provider,source_identifier:x.sourceIdentifier,title:x.title,description:x.description,duration_seconds:x.duration,aspect_ratio:x.aspectRatio,media_type:x.mediaType,media_url:x.mediaUrl,source_url:x.sourceUrl,rights:x.rights,year:x.year,metadata_json:JSON.stringify(x)}));
 const env={realsignal_catalog:{prepare(sql){return{bind(){return this;},all:async()=>({results:/FROM programs p/.test(sql)?rows:[]}),first:async()=>null,run:async()=>({success:true})};},batch:async()=>[]}},pending=[];
 const r=await api.fetch(new Request('https://api.invalid/api/v3/source/catalog',{method:'POST',body:JSON.stringify({profileKey:'nascar-classics',count:5,minimumReady:5,recentIds:[first.id]})}),env,{waitUntil:p=>pending.push(p)});
 const d=await r.json();assert.equal(r.status,200);assert.equal(d.source,'d1-source-catalog');assert.ok(d.items.every(i=>Sports.key(i,'nascar-classics')!==Sports.key(first,'nascar-classics')));assert.equal(d.uniqueEvents,9);
 await Promise.allSettled(pending);
});
