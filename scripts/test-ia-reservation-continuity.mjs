import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {SessionRotation} from '../realsignal_api_rotation.js';
const {rotationContext}=createRequire(import.meta.url)('./ia-storage-test-helper.js');
const item=(family,n)=>({identifier:family+'::episode-'+n+'.mp4',seriesTitle:family,title:family+' · Episode '+n,media:{url:'https://archive.org/download/'+family+'/episode-'+n+'.mp4'}});
const call=(rotation,body)=>rotation.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify(body)}));

test('played-only history excludes both hash-confirmed cached filenames while preserving unseen programs',async()=>{
 const parent='dvd-transfer-224',name='Super Bowl X (2023 NFL Network Rebroadcast).ia.mp4';
 const copy=file=>({identifier:parent+'::'+file,title:'Super Bowl X',media:{url:'https://archive.org/download/'+parent+'/'+encodeURIComponent(file)}});
 const a=copy(name),b=copy('Title 1 - '+name),unseen=item('other-football-program',1);
 const ctx=rotationContext({catalog:[a,b,unseen],seen:[],cursor:0}),r=new SessionRotation(ctx,{});
 const response=await call(r,{items:[a,b,unseen],requirePlayable:true,playedOnly:true,viewerRecentIds:[a.identifier],count:3});
 const body=await response.json();
 assert.deepEqual(body.items.map(x=>x.identifier),[unseen.identifier]);
 assert.equal(body.cycleReset,false);
 assert.equal(body.catalogSize,2,'cached duplicate records cannot count as separate unseen depth');
 assert.ok(ctx.snapshot().seen.includes(a.identifier),'existing viewing history is retained');
});

test('reserve/commit rotation does not reserve a second cached encoding after the first one plays',async()=>{
 const parent='dvd-transfer-224',name='Super Bowl X (2023 NFL Network Rebroadcast).ia.mp4';
 const copy=file=>({identifier:parent+'::'+file,title:'Super Bowl X',media:{url:'https://archive.org/download/'+parent+'/'+encodeURIComponent(file)}});
 const a=copy(name),b=copy('Title 1 - '+name),unseen=item('other-football-program',1);
 const ctx=rotationContext(),r=new SessionRotation(ctx,{});
 await call(r,{mode:'reserve',items:[a,b,unseen],count:1});
 assert.equal((await call(r,{mode:'commit',id:a.identifier,event:'started'})).status,200);
 await call(r,{mode:'commit',id:a.identifier,event:'completed'});
 const body=await (await call(r,{mode:'reserve',items:[a,b,unseen],count:3})).json();
 assert.deepEqual(body.items.map(x=>x.identifier),[unseen.identifier]);
 assert.equal(body.catalogSize,2);
 assert.equal(body.cycleReset,false);
});

test('an existing two-copy reservation collapses to one slot without discarding unseen programs',async()=>{
 const parent='dvd-transfer-224',name='Super Bowl X (2023 NFL Network Rebroadcast).ia.mp4';
 const copy=file=>({identifier:parent+'::'+file,title:'Super Bowl X',media:{url:'https://archive.org/download/'+parent+'/'+encodeURIComponent(file)}});
 const a=copy(name),b=copy('Title 1 - '+name),unseen=item('other-football-program',1);
 const ctx=rotationContext({catalog:[a,b,unseen],seen:[],reserved:[a.identifier,b.identifier],cursor:0}),r=new SessionRotation(ctx,{});
 const body=await (await call(r,{mode:'reserve',items:[],count:3})).json();
 assert.deepEqual(body.items.map(x=>x.identifier),[a.identifier,unseen.identifier]);
 assert.equal(body.reserved,2);
});

test('a played item evicted by a deep catalog refresh still accepts its skip acknowledgement',async()=>{
 const ctx=rotationContext(),r=new SessionRotation(ctx,{}),first=item('cartoons',0);
 await call(r,{mode:'reserve',items:[first],count:1});
 assert.equal((await call(r,{mode:'commit',id:first.identifier,event:'started'})).status,200);
 await call(r,{mode:'reserve',items:Array.from({length:1024},(_,i)=>item('deep',i)),count:3});
 const response=await call(r,{mode:'commit',id:first.identifier,event:'skipped'});
 assert.equal(response.status,200,'Next must not poison the acknowledgement outbox after a bounded catalog evicts an already played record');
 assert.equal((await call(r,{mode:'commit',id:'unknown::forged.mp4',event:'started'})).status,400,'unknown identities remain rejected');
 assert.ok(ctx.snapshot().catalog.length<=1024);
});

test('a prior version may already have evicted the playing record; no history reset is needed',async()=>{
 const first=item('cartoons',0),ctx=rotationContext({catalog:[item('other',0)],seen:[first.identifier],playing:first.identifier,reserved:[],cursor:1}),r=new SessionRotation(ctx,{});
 assert.equal((await call(r,{mode:'commit',id:first.identifier,event:'skipped'})).status,200);
 assert.equal(ctx.snapshot().playing,'');
 assert.ok(ctx.snapshot().seen.includes(first.identifier));
});

test('a late completion for an evicted episode cannot clear a newer playing episode',async()=>{
 const first=item('cartoons',0),next=item('other',0),ctx=rotationContext({catalog:[next],seen:[first.identifier,next.identifier],playing:next.identifier,reserved:[],cursor:2}),r=new SessionRotation(ctx,{});
 assert.equal((await call(r,{mode:'commit',id:first.identifier,event:'completed'})).status,200);
 assert.equal(ctx.snapshot().playing,next.identifier);
 assert.equal((await call(r,{mode:'commit',id:first.identifier,event:'started'})).status,400,'past history is not permission to start an evicted record');
 assert.equal((await call(r,{mode:'commit',id:'unknown::forged.mp4',event:'skipped'})).status,400);
});

test('terminal events clear a legacy parent alias for the selected file',async()=>{
 const first={...item('cartoons',0),identifier:'legacy-parent',sourceIdentifier:'legacy-parent',fileName:'episode-0.mp4'},ctx=rotationContext({catalog:[first],seen:['legacy-parent::episode-0.mp4'],playing:'legacy-parent',reserved:[],cursor:1}),r=new SessionRotation(ctx,{});
 assert.equal((await call(r,{mode:'commit',id:'legacy-parent',event:'completed'})).status,200);
 assert.equal(ctx.snapshot().playing,'');
 assert.equal((await (await call(r,{mode:'reserve',items:[first],count:1})).json()).items.length,1,'an exhausted singleton can start a new cycle');
});

test('returning families alternate after each has played once while fresh episodes remain',async()=>{
 const ctx=rotationContext(),r=new SessionRotation(ctx,{}),families=['Benson','Beaver','Munsters'];
 const items=families.flatMap(f=>Array.from({length:15},(_,i)=>item(f,i))),starts=[];
 for(let i=0;i<15;i++){
  const p=await (await call(r,{mode:'reserve',items,count:3,diversity:{maxPerFamily:1}})).json(),next=p.items[0];
  assert.ok(next); starts.push(next);
  await call(r,{mode:'commit',id:next.identifier,event:'started'});
  await call(r,{mode:'commit',id:next.identifier,event:'skipped'});
 }
 assert.equal(new Set(starts.map(x=>x.identifier)).size,15);
 for(let i=3;i<starts.length;i++)assert.notEqual(starts[i].seriesTitle,starts[i-1].seriesTitle,'one series must not monopolize the shelf after the first family pass');
});


test('unseen-series priority cannot relax the family cap before other eligible series get a turn',async()=>{
 const known=[item('Beaver',0),item('Munsters',0)],rows=[...Array.from({length:8},(_,i)=>item('Benson',i)),...known,item('Beaver',1),item('Munsters',1)];
 const ctx=rotationContext({catalog:rows,seen:known.map(x=>x.identifier),reserved:[],playing:'',cursor:2}),r=new SessionRotation(ctx,{});
 const p=await(await call(r,{mode:'reserve',items:rows,count:3,diversity:{maxPerFamily:1}})).json();
 assert.equal(new Set(p.items.map(x=>x.seriesTitle)).size,3,'unwatched Benson must not fill all three reservations while fresh Beaver and Munsters episodes exist');
 assert.equal(p.diversityRelaxed,false);
 assert.deepEqual(ctx.snapshot().seen,known.map(x=>x.identifier),'preparation still does not consume viewing history');
});

test('a genuinely single-series catalog can still fill the shelf and reports constrained diversity',async()=>{
 const r=new SessionRotation(rotationContext(),{}),rows=Array.from({length:8},(_,i)=>item('Benson',i));
 const p=await(await call(r,{mode:'reserve',items:rows,count:3,diversity:{maxPerFamily:1}})).json();
 assert.equal(p.items.length,3);assert.equal(new Set(p.items.map(x=>x.identifier)).size,3);assert.equal(p.diversityRelaxed,true);
});


test('legacy and refreshed labels of one complete-series parent cannot take two family slots',async()=>{
 const parent='benson-complete-series-1979-1986',forms=['Benson · Complete Episode Collection · Season 4/Benson_S04E04_Thy Brother Keeper','Benson Complete Series (1979-1986) · Benson S04E21 A View From The Roof'];
 const benson=forms.map((title,i)=>({...item('Benson',i),identifier:parent+'::episode-'+i+'.mp4',sourceIdentifier:parent,seriesId:parent,seriesTitle:'',title}));
 const known=[item('Beaver',0),item('Munsters',0)],rows=[...benson,...known,item('Beaver',1),item('Munsters',1)];
 const r=new SessionRotation(rotationContext({catalog:rows,seen:known.map(x=>x.identifier),reserved:[],playing:'',cursor:0}),{});
 const p=await(await call(r,{mode:'reserve',items:rows,count:3,diversity:{maxPerFamily:1}})).json();
 assert.equal(p.items.filter(x=>x.identifier.startsWith(parent+'::')).length,1,'display-title refreshes must not split Benson into independent series');
 assert.equal(p.items.length,3);assert.ok(p.items.some(x=>x.seriesTitle==='Beaver'));assert.ok(p.items.some(x=>x.seriesTitle==='Munsters'));
});


for(const [parent,forms] of [
 ['pokemon-indigo-league-season-1-1998',['Pokémon · I Choose You','Pokémon: Indigo League - The Complete Collection (1997-99, English dub) · Haunter Versus Kadabra']],
 ['american-experience-episodes',['American Experience — Radio Bikini','American Experience Collection · My Lai']],
 ['blackadder-remastered',['Blackadder · Series 1 Episode 1','Blackadder II · Episode 1']],
 ['ghost-stories-for-christmas-2000',['Ghost Stories for Christmas with Christopher Lee (2000) Complete Series · Number 13','Ghost Stories for Christmas with Christopher Lee (2000) Complete Series']],
 ['TheQuatermassConclusion1979',['Quatermass IV(The Quatermass Conclusion)TV Series 1979 · Chapter 4','Quatermass IV — The Quatermass Conclusion']],
 ['freakylinks-complete-series-2000',['FreakyLinks · Subject Fearsum','FreakyLinks (2000) · Complete TV Series']],
])for(const mode of ['reserve','standard'])test(parent+': '+mode+' rotation treats audited collection labels as one series',async()=>{
 const aliases=forms.map((title,i)=>({...item(parent,i),seriesTitle:'',seriesId:parent,sourceIdentifier:parent,title}));
 const rows=[...aliases,item('Other A',0),item('Other B',0)],r=new SessionRotation(rotationContext(),{});
 const body={items:rows,count:3,requirePlayable:true,diversity:{maxPerFamily:1},...(mode==='reserve'?{mode}:{} )};
 const p=await(await call(r,body)).json();
 assert.equal(p.items.filter(x=>x.identifier.startsWith(parent+'::')).length,1,'label variants must not buy extra slots');
 assert.equal(p.items.length,3);assert.ok(p.items.some(x=>x.seriesTitle==='Other A'));assert.ok(p.items.some(x=>x.seriesTitle==='Other B'));
});

test('reviewed single-series identities preserve conflicting editorial labels and mixed-show cartoon collections',async()=>{
 const parent='pokemon-indigo-league-season-1-1998',rows=[{...item(parent,0),sourceIdentifier:parent,seriesTitle:'Another Show',seriesId:'Another Show',title:'Pokémon mentioned in an unrelated editorial title'},item('Pokémon',1),item('Other',0)];
 const r=new SessionRotation(rotationContext(),{}),p=await(await call(r,{mode:'reserve',items:rows,count:3,diversity:{maxPerFamily:1}})).json();assert.equal(p.items.length,3);assert.equal(p.diversityRelaxed,false,'an explicitly different editorial series stays distinct');
 const mixed=['Mickey Mouse','Tom and Jerry','Popeye'].map((series,i)=>({...item('halloween-cartoon-collection_20231022',i),seriesTitle:'',seriesId:'halloween-cartoon-collection_20231022',sourceIdentifier:'halloween-cartoon-collection_20231022',title:series+' · Halloween episode'}));
 const q=await(await call(new SessionRotation(rotationContext(),{}),{mode:'reserve',items:mixed,count:3,diversity:{maxPerFamily:1}})).json();assert.equal(q.items.length,3);assert.equal(q.diversityRelaxed,false,'mixed-show collections remain distinct series');
});


test('an unreviewed Archive parent cannot inherit a canonical series from object prototype names',async()=>{
 const rows=['Alpha','Beta','Gamma'].map((name,i)=>({...item('constructor',i),sourceIdentifier:'constructor',seriesTitle:'',seriesId:'constructor',title:name+' · Episode 1'}));
 const p=await(await call(new SessionRotation(rotationContext(),{}),{mode:'reserve',items:rows,count:3,diversity:{maxPerFamily:1}})).json();
 assert.equal(p.items.length,3);assert.equal(p.diversityRelaxed,false,'unreviewed mixed collections retain their separate editorial series');
});


function archiveCopy(source, file, title, extras = {}) {
 return {identifier:source+'::'+file,sourceIdentifier:source,fileName:file,title,...extras,
   media:{type:extras.type||'video',url:'https://archive.org/download/'+source+'/'+encodeURIComponent(file),verifiedAt:extras.verifiedAt||1}};
}

test('VHS pilot reserves a work once while keeping the exact alternate file ready for recovery',async()=>{
 const channel='502';
 const original=archiveCopy('01-sidekicks-1986-are-these-your-kicks','01 - Sidekicks 1986 - Are These Your Kicks).mp4','01 Sidekicks 1986 Are These Your Kicks)');
 const alternate=archiveCopy('01-la-theorie-de-la-relativite-aka.-are-these-your-kicks-french-tv-english','01 - La Théorie De La Relativité (aka. Are These Your Kicks) [French TV, English].mp4','Sidekicks 1986 Ep 1 - Are These Your Kicks',{verifiedAt:10});
 const other=archiveCopy('sidekicks-1986-open-house','open-house.mp4',"Disney's Sidekicks 1986 - Open House");
 const dumbo=archiveCopy('001-40-winks-for-dink-tdc','40 Winks For Dink.mp4','Dumbo Circus Episode 40 Winks For Dink - Disney Channel');
 const sonic=archiveCopy('sonic-satam-offair','episode.mp4','Sonic the Hedgehog SatAM (WOC)');
 const ctx=rotationContext(), r=new SessionRotation(ctx,{}), select=async body=>(await call(r,{stationChannel:channel,archiveProgramIdentity:true,...body})).json();
 const first=await select({mode:'reserve',items:[original,other,dumbo,sonic],count:3,diversity:{maxPerFamily:1}});
 assert.deepEqual(first.items.map(x=>x.identifier),[original.identifier,dumbo.identifier,sonic.identifier]);
 const refreshed=await select({mode:'reserve',items:[alternate],count:3});
 assert.equal(refreshed.items[0].identifier,original.identifier,'a new transfer cannot replace a file already shown in the guide');
 assert.equal(refreshed.catalogSize,4,'different tapes of the same episode count as one program');
 assert.equal(refreshed.fileCatalogSize,5);
 assert.equal((await call(r,{mode:'release',stationChannel:channel,archiveProgramIdentity:true,id:original.identifier,event:'failed'})).status,200);
 const recovered=await select({mode:'reserve',items:[],count:3});
 assert.equal(recovered.items[0].identifier,alternate.identifier);
 assert.equal(recovered.items[0].media.url,alternate.media.url,'the identity must travel with its actual file');
 await select({mode:'commit',id:alternate.identifier,event:'started'});
 await select({mode:'commit',id:alternate.identifier,event:'skipped'});
 const revisit=new SessionRotation(ctx,{});
 const next=await(await call(revisit,{mode:'reserve',stationChannel:channel,archiveProgramIdentity:true,items:[original],count:5})).json();
 assert.ok(next.items.some(x=>x.identifier===other.identifier),'a different episode of the same show stays eligible');
 assert.ok(!next.items.some(x=>x.identifier===original.identifier||x.identifier===alternate.identifier));
 assert.equal(next.cycleReset,false);
});

test('Classic Cartoons keeps the established episode identity and can recover through a second upload',async()=>{
 const seriesTitle='Looney Tunes', channel='150';
 const a=archiveCopy('looney-tunes-complete','Looney Tunes - S1950E01 - Home Tweet Home.mp4','Looney Tunes · Home Tweet Home',{seriesTitle});
 const b=archiveCopy('remastered-cartoon-edition','Looney Tunes S1950E01 Home Tweet Home.ia.mp4','Looney Tunes · Home Tweet Home',{seriesTitle});
 const c=archiveCopy('looney-tunes-complete','Looney Tunes - S1950E03 - Boobs in the Woods.mp4','Looney Tunes · Boobs in the Woods',{seriesTitle});
 const r=new SessionRotation(rotationContext(),{}), select=async body=>(await call(r,{stationChannel:channel,archiveProgramIdentity:true,...body})).json();
 const opened=await select({mode:'reserve',items:[a,b,c],count:2});
 assert.deepEqual(opened.items.map(x=>x.identifier),[a.identifier,c.identifier]);
 assert.equal(opened.fileCatalogSize,3);
 await select({mode:'release',id:a.identifier,event:'failed'});
 const recovered=await select({mode:'reserve',items:[],count:2});
 assert.deepEqual(recovered.items.map(x=>x.identifier),[b.identifier,c.identifier]);
 const openedCopy=await select({mode:'commit',id:b.identifier,event:'started'});
 assert.ok(openedCopy.committed);
});

test('Wax Museum balances performers, groups confirmed record transfers, and preserves other sides and takes',async()=>{
 const channel='929', audio=(source,file,title)=>archiveCopy(source,file,title,{type:'audio'});
 const a=audio('victor-17826-a-first','Victor 17826A - If War Is What Sherman Said It Was.mp3','Billy Murray · If War Is What Sherman Said It Was');
 const duplicate=audio('shellac-victor-17826-transfer','Victor 17826A - If War Is What Sherman Said It Was.flac','Billy Murray · If War Is What Sherman Said It Was');
 const take=audio('victor-17826-alternate-take','Victor 17826A - If War Is What Sherman Said It Was - take 2.mp3','Billy Murray · If War Is What Sherman Said It Was (Take 2)');
 const sideB=audio('victor-17826-b-other-side','Victor 17826B - Some Little Bug Is Going to Find You.mp3','Billy Murray · Some Little Bug Is Going to Find You');
 const ada=audio('Experience_957','2 Experience.mp3','Ada Jones · Experience');
 const caruso=audio('victor-88376-dreams-of-long-ago','Victor 88376 - Dreams of Long Ago.mp3','Enrico Caruso · Dreams of Long Ago');
 const ctx=rotationContext(), r=new SessionRotation(ctx,{}), select=async body=>(await call(r,{stationChannel:channel,archiveProgramIdentity:true,...body})).json();
 const p=await select({mode:'reserve',items:[a,duplicate,take,sideB,ada,caruso],count:3,diversity:{maxPerFamily:1}});
 assert.deepEqual(p.items.map(x=>x.identifier),[a.identifier,ada.identifier,caruso.identifier]);
 assert.equal(p.catalogSize,5);
 assert.equal(p.fileCatalogSize,6);
 assert.equal(p.diversityRelaxed,false);
 await select({mode:'commit',id:a.identifier,event:'started'});
 await select({mode:'commit',id:a.identifier,event:'completed'});
 const next=await select({mode:'reserve',items:[duplicate],count:5});
 assert.ok(!next.items.some(x=>x.identifier===duplicate.identifier));
 assert.ok(next.items.some(x=>x.identifier===sideB.identifier));
 assert.ok(next.items.some(x=>x.identifier===take.identifier));
});

test('VHS uses a repeatedly stalled tape only after faster unseen programs',async()=>{
 const slow=archiveCopy('vintage-commercials-v25a-wttw-newshour-chicago-tonight-mystery-jan-1999-part-1','tape.mp4','WTTW Chicago · NewsHour VHS recording');
 const fast=[item('good-a',0),item('good-b',0),item('good-c',0)];
 const r=new SessionRotation(rotationContext(),{}), select=async body=>(await call(r,{stationChannel:'502',archiveProgramIdentity:true,...body})).json();
 const start=await select({mode:'reserve',items:[slow,...fast],count:3});
 assert.equal(start.catalogSize,4);
 assert.deepEqual(start.items.map(x=>x.identifier),fast.map(x=>x.identifier));
 for(const row of fast)await select({mode:'commit',id:row.identifier,event:'started'});
 const last=await select({mode:'reserve',items:[],count:1});
 assert.equal(last.items[0].identifier,slow.identifier);
 assert.equal(last.cycleReset,false);
});

test('the hosted preview separates its reservations and failure reports from the same viewer’s regular queue',async()=>{
 const {default:api}=await import('../realsignal_api_v2_worker.js');
 const a=archiveCopy('01-sidekicks-1986-are-these-your-kicks','01 - Sidekicks 1986 - Are These Your Kicks).mp4','Sidekicks 1986 · Are These Your Kicks');
 const b=archiveCopy('01-la-theorie-de-la-relativite-aka.-are-these-your-kicks-french-tv-english','01 - La Théorie De La Relativité (aka. Are These Your Kicks) [French TV, English].mp4','Sidekicks 1986 Ep 1 - Are These Your Kicks');
 const rows=[a,b].map(row=>({...row,subject:'off-air VHS recording',media:{...row.media,runtime:1380,width:640,height:480,verification:'transport',verifiedAt:Date.now()}}));
 const objects=new Map(),env={
  ROTATION:{getByName(name){if(!objects.has(name))objects.set(name,new SessionRotation(rotationContext(),{}));return objects.get(name);}},
  RELAY:{fetch:async()=>Response.json({items:rows,candidateItems:rows,ready:rows.length})}
 };
 const send=async(route,body)=>api.fetch(new Request('https://api.example/api/v3/ia/'+route,{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel:'502',sessionId:'same-viewer-ia-preview',...body})
 }),env,{waitUntil(p){Promise.resolve(p).catch(()=>{});}});
 const base={count:1,iaRepair:true,serverCatalog:true,mediaTypes:['movies']};
 const normal=await(await send('queue',base)).json();
 const trial=await(await send('queue',{...base,archiveProgramIdentity:true})).json();
 assert.equal(normal.v2.catalogSize,2);
 assert.equal(trial.v2.catalogSize,1);
 assert.equal(trial.v2.fileCatalogSize,2);
 assert.equal(trial.items[0].identifier,normal.items[0].identifier);
 const failed=await send('playback',{archiveProgramIdentity:true,id:trial.items[0].identifier,event:'failed'});
 assert.equal(failed.status,202);
 const repaired=await(await send('queue',{...base,archiveProgramIdentity:true,sessionRefill:true})).json();
 assert.notEqual(repaired.items[0].identifier,trial.items[0].identifier);
 const unchanged=await(await send('queue',base)).json();
 assert.equal(unchanged.items[0].identifier,normal.items[0].identifier);
});