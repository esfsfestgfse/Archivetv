import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import worker, {SessionRotation} from '../realsignal_api_v2_worker.js';
const {rotationContext}=createRequire(import.meta.url)('./ia-storage-test-helper.js');

// D1 and the relay are external boundaries; routing, admission, catalog writes
// and durable reservation code are the real production implementations.
test('a shallow Classic TV catalog imports repairs promptly without blocking playback or probing on every skip',async()=>{
  const originalNow=Date.now, epoch=originalNow();let elapsed=0, depth=30, calls=0, finish;
  Date.now=()=>epoch+elapsed;
  const program=(family,n)=>({identifier:family+'::episode-'+n+'.mp4',sourceIdentifier:family,seriesId:family,title:family+' · Episode '+n,
    subject:'classic television sitcom',year:1965,provider:'Internet Archive',media:{type:'video',url:'https://archive.org/download/'+family+'/episode-'+n+'.mp4',runtime:1320,width:640,height:480,verification:'transport',verifiedAt:epoch}});
  const row=p=>({id:p.identifier,source_identifier:p.sourceIdentifier,title:p.title,provider:p.provider,year:1965,duration_seconds:1320,
    aspect_ratio:4/3,media_type:'video',media_url:p.media.url,metadata_json:JSON.stringify({...p,verification:'transport',verifiedAt:epoch,width:640,height:480,runtimeSeconds:1320})});
  const stored=new Map(Array.from({length:30},(_,n)=>{const p=program(n<17?'Benson':'Other Show '+n,n);return [p.identifier,row(p)];}));
  const sessions=new Map(),pending=[];
  const env={ROTATION:{getByName(name){if(!sessions.has(name))sessions.set(name,new SessionRotation(rotationContext(),{}));return sessions.get(name);}},
    realsignal_catalog:{prepare(sql){return{bind(...args){return{sql,args,async all(){return{results:/FROM programs/.test(sql)?[...stored.values()].slice(0,depth):[]};},async first(){return null;}};}};},
      async batch(statements){for(const s of statements)if(s.sql.startsWith('INSERT INTO programs')){
        const columns=s.sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(x=>x.trim()),r=Object.fromEntries(columns.map((k,i)=>[k,s.args[i]]));stored.set(r.id,r);
      }}},
    RELAY:{async fetch(request){assert.equal(new URL(request.url).pathname,'/ia/queue');calls++;
      if(calls===1)await new Promise(resolve=>{finish=resolve;});
      const item=program('New Verified Series '+calls,1);return Response.json({items:[item],candidateItems:[item],ready:1});}},
  };
  const ctx={waitUntil:p=>pending.push(Promise.resolve(p))};
  const drain=async()=>{for(let i=0;i<pending.length;i++)await pending[i];pending.length=0;};
  const tune=()=>worker.fetch(new Request('https://api.example/api/v3/ia/queue',{method:'POST',body:JSON.stringify({channel:'10',iaRepair:true,serverCatalog:true,sessionId:'classic-refresh-fixture',count:3,themeTerms:['classic television','sitcom'],themeMinScore:1,mediaTypes:['movies'],diversity:{maxPerFamily:1}})}),env,ctx);
  try{
    const first=await tune();assert.equal(first.status,200);assert.equal((await first.json()).ready,3,'a pending relay repair cannot block visible playback');
    finish();await drain();assert.ok(stored.has('New Verified Series 1::episode-1.mp4'),'verified repair reaches the durable catalog');
    elapsed=1000;await tune();await drain();assert.equal(calls,1,'rapid skips share the ongoing repair cadence');
    elapsed=31000;await tune();await drain();assert.ok(stored.has('New Verified Series 2::episode-1.mp4'),'a still-shallow station must not wait five minutes to import the next repaired series');
    depth=120;for(let n=30;n<120;n++){const p=program('Deep Series '+n,n);stored.set(p.identifier,row(p));}
    elapsed=62000;await tune();await drain();assert.equal(calls,2,'a deep healthy catalog returns to the conservative refresh cadence');
  }finally{Date.now=originalNow;}
});
