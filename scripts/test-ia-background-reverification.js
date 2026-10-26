const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test');
const sourcePath=process.env.REALSIGNAL_RELAY_TEST_SOURCE||path.join(__dirname,'..','afterglow_ais_relay_worker.js');
const now=Date.now();
const item=(family,n,verifiedAt=now)=>({identifier:family+'::episode-'+n+'.mp4',sourceIdentifier:family,seriesId:family,title:family+' full episode',
 media:{type:'video',url:'https://archive.org/download/'+family+'/episode-'+n+'.mp4',runtime:1320,width:640,height:480,verification:'transport',verifiedAt}});
function fixture(rows,delay=false,failures=[]){
 const calls=[],pending=[],data=new Map([['family',JSON.stringify({candidateItems:rows})]]),s={console,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,Date,setTimeout,clearTimeout};
 vm.createContext(s);vm.runInContext(fs.readFileSync(sourcePath,'utf8').replace('export default','const worker=')+
  ';globalThis.f={qualifyIaQueueResponse,setHydrate:fn=>{hydrateIaQueue=fn;},setSeeds:fn=>{iaRepairCollectionSeeds=fn;}};',s);
 s.f.setSeeds(()=>[rows[0]]); vm.runInContext('iaStationQualityGate=()=>true;',s);let release;
 s.f.setHydrate(async(payload,count,origin,ctx)=>{
  calls.push({items:payload.candidateItems,count,background:ctx.isIaBackground===true});
  if(calls.length>1&&delay)await new Promise(resolve=>{release=resolve;});
  const selected=payload.candidateItems.slice(0,count).filter(row=>!failures.includes(row.identifier)).map(row=>({...row,media:{...row.media,verifiedAt:now,verification:'transport'}}));
  const byId=new Map(selected.map(row=>[row.identifier,row]));
  return {...payload,items:selected,candidateItems:payload.candidateItems.map(row=>byId.get(row.identifier)||row),ready:selected.length,lastGoodKey:'family'};
 });
 const ctx={waitUntil:p=>pending.push(p)},env={REALSIGNAL_QUEUE:{get:async key=>JSON.parse(data.get(key)||'null'),put:async(key,value)=>data.set(key,value)}};
 return {calls,pending,data,release:()=>release(),run:()=>s.f.qualifyIaQueueResponse(Response.json({items:rows.slice(0,3),candidateItems:rows,ready:3,lastGoodKey:'family'}),
  {channel:'10',iaRepair:true,count:3,mediaTypes:['movies'],diversity:{maxPerFamily:1}},'https://relay.invalid',ctx,env),drain:async()=>{for(let i=0;i<pending.length;i++)await pending[i];}};
}

test('expired checks reopen a bounded balanced background batch while the hot shelf remains immediate',async()=>{
 const stale=now-49*3600000,rows=[...Array.from({length:17},(_,i)=>item('Benson',i)),...Array.from({length:40},(_,i)=>item('Benson',i+17,stale)),
  ...Array.from({length:20},(_,i)=>item('Beaver',i,stale)),...Array.from({length:20},(_,i)=>item('Dick Van Dyke',i,stale))];
 const f=fixture(rows,true),response=await f.run(),payload=await response.json();
 assert.equal(payload.ready,3,'network maintenance cannot block the foreground shelf');
 assert.equal(f.calls.length,2,'transport timestamps older than 24h must not suppress re-verification');
 const batch=f.calls[1];assert.equal(batch.background,true);assert.equal(batch.count,8);assert.equal(batch.items.length,8,'only eight pending records are sent to the hydrator');
 assert.ok(batch.items.every(row=>row.media.verifiedAt<now-86400000),'valid hot records must not consume the repair budget');
 assert.equal(new Set(batch.items.map(row=>row.seriesId)).size,2,'both depleted series receive repairs');
 assert.ok(batch.items.every(row=>row.seriesId!=='Benson'),'the dominant healthy show must not consume the whole repair batch');
 f.release();await f.drain();const stored=JSON.parse(f.data.get('family'));
 assert.equal(stored.candidateItems.length,rows.length,'bounded verification preserves the entire catalog');
 assert.equal(stored.candidateItems.filter(row=>row.media.verifiedAt===now).length,payload.candidateItems.filter(row=>row.media.verifiedAt===now).length+8,'the foreground checks plus exactly eight background refreshes');
});

test('a fully fresh catalog schedules no redundant probes',async()=>{
 const f=fixture(Array.from({length:12},(_,i)=>item('Fresh Show',i)));await f.run();await f.drain();assert.equal(f.calls.length,1);
});

test('future-dated and missing transport facts are pending rather than counted as healthy depth',async()=>{
 const rows=[item('Healthy',0),item('Healthy',1),item('Healthy',2),item('Future',0,now+120000),item('Missing',0,0),item('Future',1,now+120000),item('Missing',1,0)];
 const f=fixture(rows);await f.run();await f.drain();assert.equal(f.calls.length,2);assert.deepEqual(new Set(f.calls[1].items.map(row=>row.seriesId)),new Set(['Future','Missing']));
});

test('a one-record repair does not shrink a three-record persisted ready shelf',async()=>{
 const rows=[item('Same Show',0),item('Same Show',1),item('Same Show',2),item('Same Show',3,now-49*3600000)];
 const f=fixture(rows);await f.run();await f.drain();const saved=JSON.parse(f.data.get('family'));
 assert.equal(saved.ready,3);assert.equal(saved.items.length,3);assert.equal(saved.partial,false);
});

test('unavailable records cool temporarily so later episodes can be verified on the next pass',async()=>{
 const stale=now-49*3600000,hot=[item('Same Show',0),item('Same Show',1),item('Same Show',2)];
 const failed=Array.from({length:8},(_,i)=>item('Same Show',i+3,stale)),later=Array.from({length:8},(_,i)=>item('Same Show',i+11,stale));
 const rows=hot.concat(failed,later),f=fixture(rows,false,failed.map(row=>row.identifier));
 await f.run();await f.drain();assert.ok(f.calls[1].items.every(row=>failed.some(x=>x.identifier===row.identifier)));
 await f.run();await f.drain();assert.ok(f.calls[3].items.every(row=>later.some(x=>x.identifier===row.identifier)),'a dead prefix cannot own every maintenance pass');
 const saved=JSON.parse(f.data.get('family'));assert.equal(saved.candidateItems.length,rows.length,'cooldown retains inventory');
});

test('current transport alone cannot clear cooldown after failed runtime or geometry hydration',async()=>{
 const hot=[item('Same Show',0),item('Same Show',1),item('Same Show',2)];
 const incomplete=Array.from({length:8},(_,i)=>{const row=item('Same Show',i+3);return {...row,media:{...row.media,runtime:0,width:0,height:0}};});
 const later=Array.from({length:8},(_,i)=>item('Same Show',i+11,now-49*3600000)),f=fixture(hot.concat(incomplete,later),false,incomplete.map(row=>row.identifier));
 await f.run();await f.drain();await f.run();await f.drain();
 assert.ok(f.calls[3].items.every(row=>later.some(x=>x.identifier===row.identifier)),'failed metadata must not monopolize subsequent repair batches');
 const stored=JSON.parse(f.data.get('family'));stored.candidateItems=stored.candidateItems.map(row=>({...row,transportRetryAt:Date.now()-1}));f.data.set('family',JSON.stringify(stored));
 await f.run();await f.drain();assert.ok(f.calls[5].items.some(row=>incomplete.some(x=>x.identifier===row.identifier)),'cooldown is temporary, not a permanent ban');
});



