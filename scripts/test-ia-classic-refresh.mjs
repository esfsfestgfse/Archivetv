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

test('a prepared start keeps the foreground off D1 and the relay and retains viewer reservations', async () => {
  const oldCaches = globalThis.caches;
  const cache = new Map(), objects = new Map(), rotationModes = [];
  let catalogReads = 0, relayReads = 0, phase = 'warm';
  const families = ['Dragnet', 'Benson', 'Jack Benny', 'Get Smart', 'Bonanza', 'Green Acres', 'I Love Lucy', 'The Munsters'];
  const programs = families.flatMap((family, series) => Array.from({ length: 4 }, (_, episode) => {
    const source = 'series-' + series, file = 'episode-' + episode + '.mp4', id = source + '::' + file;
    const url = 'https://archive.org/download/' + source + '/' + file;
    return {
      id, source_identifier: source, provider: 'Internet Archive', title: family + ' · Episode ' + episode,
      media_type: 'video', media_url: url, aspect_ratio: 4/3, duration_seconds: 1320, year: '1965',
      metadata_json: JSON.stringify({ seriesTitle: family, fileName: file, media: { type: 'video', url, runtime: 1320 },
        subject: 'classic television', runtimeSeconds: 1320, width: 640, height: 480, verification: 'transport', verifiedAt: Date.now() })
    };
  }));
  globalThis.caches = { default: {
    async match(key) { return cache.get(key.url)?.clone(); },
    async put(key, response) { cache.set(key.url, response.clone()); }
  }};
  const env = {
    ROTATION: { getByName(name) {
      if(!objects.has(name))objects.set(name,new SessionRotation(rotationContext(),{}));
      return { async fetch(request) {
        rotationModes.push((await request.clone().json()).mode);
        return objects.get(name).fetch(request);
      }};
    }},
    realsignal_catalog: {
      prepare(sql) { return { bind() { return {
        async all() { if (phase==='hit') throw Error('foreground queried catalog'); catalogReads++; return {results:/FROM programs/.test(sql)?programs:[]}; },
        async first() { return null; }
      }; }}; },
      async batch() {}
    },
    RELAY: { async fetch() { if(phase==='hit')throw Error('foreground queried relay'); relayReads++; return Response.json({ items:[], candidateItems:[] }); } }
  };
  const background = [], ctx = { waitUntil: p => background.push(Promise.resolve(p)) };
  const tune = (sessionId, options={}) => worker.fetch(new Request('https://api.example/api/v3/ia/queue', {
    method: 'POST',
    body: JSON.stringify({ channel:'10', count:3, sessionId, serverCatalog:true, iaRepair:true, preparedStart:true, mediaTypes:['movies'], ...options })
  }), env, ctx);
  try {
    const warm = await tune('warm-station');
    assert.equal(warm.status,200);
    await Promise.all(background.splice(0));
    assert.equal(cache.size,1,'background preparation persists one shared station snapshot');
    const reads=[catalogReads,relayReads];
    phase='hit'; rotationModes.length=0;
    const opening=await tune('viewer');
    assert.equal(opening.headers.get('x-realsignal-source'),'edge-prepared-archive+session-rotation');
    assert.match(opening.headers.get('cache-control'),/private, no-store/);
    const shelf=await opening.json();
    assert.equal(shelf.ready,3);
    assert.equal(new Set(shelf.items.map(i=>i.seriesTitle)).size,3);
    assert.deepEqual(rotationModes,['reserve'],'the opening avoids a separate history peek');
    const picked=shelf.items[0].identifier;
    const commit=await worker.fetch(new Request('https://api.example/api/v3/ia/playback',{method:'POST',
      body:JSON.stringify({sessionId:'viewer',channel:'10',id:picked,event:'started'})}),{ROTATION:env.ROTATION,RELAY:{fetch:async()=>new Response(null,{status:204})}},ctx);
    assert.equal(commit.status,202);
    const returnShelf=await(await tune('viewer')).json();
    assert.ok(returnShelf.items.every(i=>i.identifier!==picked),'the same viewer cannot reopen a watched episode');
    assert.deepEqual([catalogReads,relayReads],reads);
  } finally {
    await Promise.allSettled(background);
    if(oldCaches===undefined)delete globalThis.caches; else globalThis.caches=oldCaches;
  }
});
