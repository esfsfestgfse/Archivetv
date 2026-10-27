import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import worker,{catalogFallbackAllowed} from '../realsignal_api_v2_worker.js';
import {sourceProfile,qualifySourceItem} from '../realsignal_source_catalog.js';
import {iaKnownVideoPolicyViolation,qualifyIaFileRecord} from '../ia_file_contract.js';
const require=createRequire(import.meta.url),policy=require('../assets/source-program-policy.js');
const observed=[
 ['restoration-row','The Godfather Restoration & Film Preservation with James Mockoski | The Films At Home Podcast'],
 ['public-works','The Public Works Podcast: Norman Woods, Jr Episode'],
 ['green-culture','NAPTIME Bioactive Podcast: Exploring Cannabis Science and Community'],
 ['christmas-cartoon-club','PKnJ Cartoon Podcast - Frosty & The Simpsons Christmas Spectacular!'],
];
const program=(title,extra={})=>({id:'yt:abcdefghijk',title,description:'A substantial original television program.',provider:'YouTube',type:'embed',url:'https://www.youtube-nocookie.com/embed/abcdefghijk',duration:1800,aspectRatio:16/9,language:'en',rights:'Standard YouTube license',...extra});
for(const [key,title] of observed)test(key+': observed podcast cannot enter fresh or cached playback',()=>{
 const item=program(title);assert.equal(policy.allow(key,item),false);
 assert.equal(qualifySourceItem(sourceProfile({profileKey:key}),item),null);
 assert.equal(catalogFallbackAllowed(item,{sourceCatalog:true,channel:key}),false);
});
test('companion-podcast footers and podcasting subjects do not veto real programs',()=>{
 for(const key of ['restoration-row','public-works','green-culture','christmas-cartoon-club']){
  assert.equal(policy.allow(key,program('A Complete Original Program',{description:'Full television program. Listen to our companion podcast below.'})),true);
  assert.equal(policy.allow(key,program('A Complete Original Program',{description:'This video contains no AI-generated footage.'})),true);
 }
 for(const title of ['A History of Podcasting | Full Documentary','A History of Podcasts | Full Documentary']){
  const item=program(title,{description:'A substantial history documentary.'});assert.equal(policy.allow('documentary-desk',item),true);
  assert.ok(qualifySourceItem(sourceProfile({profileKey:'documentary-desk'}),item));
  assert.equal(catalogFallbackAllowed(item,{sourceCatalog:true,channel:'documentary-desk'}),true);
 }
 for(const title of ['Weekly Infrastructure Podcasts','Infrastructure Vodcast'])assert.equal(policy.allow('public-works',program(title)),false);
});
const ia=(title,extra={})=>({id:'archive-program::program.mp4',title,type:'video',language:'eng',media:{type:'video',url:'https://archive.org/download/archive-program/program.mp4',runtime:1800,width:640,height:480,verification:'transport',verifiedAt:Date.now()},...extra});
test('IA plural podcast rejection preserves legitimate audio and original cartoon shorts',()=>{
 const bad=ia('My Own Bowling Videos (Podcasts)');assert.equal(iaKnownVideoPolicyViolation(bad,{channel:'79'}),true);
 assert.equal(qualifyIaFileRecord(bad,{channel:'79'}).accepted,false);
 const audio=ia('Weekly Gardening Podcasts',{type:'audio',media:{type:'audio',url:'https://archive.org/download/archive-program/podcast.mp3'}});
 assert.equal(iaKnownVideoPolicyViolation(audio,{channel:'203'}),false);
 assert.equal(qualifyIaFileRecord(audio,{channel:'203',mediaTypes:['audio'],requireTransport:false}).accepted,true);
 const cartoon=ia('Looney Tunes - Complete Original Cartoon',{id:'looney-tunes-complete::original.mp4',media:{type:'video',sourceIdentifier:'looney-tunes-complete',fileName:'original.mp4',url:'https://archive.org/download/looney-tunes-complete/original.mp4',runtime:420,width:640,height:480,verification:'transport',verifiedAt:Date.now()}});
 assert.equal(qualifyIaFileRecord(cartoon,{channel:'150'}).accepted,true);
 assert.equal(iaKnownVideoPolicyViolation(ia('An Original Television Satire'),{channel:'202'}),false);
});
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': cached IA video also rejects plural podcast labels',()=>{
 const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),start=html.indexOf('function iaKnownVideoPolicyViolation('),end=html.indexOf('function iaProgramDenyTerms(',start),scope={};
 vm.runInNewContext(html.slice(start,end),scope);
 assert.equal(scope.iaKnownVideoPolicyViolation(ia('Infrastructure Vodcasts'),{channel:204}),true);
 assert.equal(scope.iaKnownVideoPolicyViolation(ia('My Own Bowling Videos (Podcasts)'),{channel:79}),true);
});
function row(item){return {id:item.id,title:item.title,description:item.description,provider:item.provider,duration_seconds:item.duration,aspect_ratio:item.aspectRatio,media_type:item.type,media_url:item.url,rights:item.rights,metadata_json:JSON.stringify(item),catalog_depth:17,unseen_count:12,last_seen_at:Date.now()};}
function db(rows){return {prepare(sql){return {bind(...args){return {async all(){
 if(!/FROM programs/.test(sql))return {results:[]};
 const limit=Number(args[1])||rows.length,offset=Number(args[2])||0;
 return {results:rows.slice(offset,offset+limit).map(r=>{
  const out={...r,catalog_depth:rows.length,unseen_count:rows.filter(x=>x.last_served_at==null).length};
  if(!/SELECT\s+p\.\*|metadata_json/.test(sql))delete out.metadata_json;
  if(!/SELECT\s+p\.\*|aspect_ratio/.test(sql))delete out.aspect_ratio;
  return out;
 })};
},async first(){return null;}};}};}};}

test('Source guide cannot advertise stale podcast or synthetic rows as verified current/next',async()=>{
 const rows=[row(program(observed[0][1],{id:'podcast'})),row(program('Car Restoration Full Documentary',{id:'synthetic',containsSyntheticMedia:true})),...Array.from({length:12},(_,i)=>row(program('Furniture Restoration Full Documentary '+i,{id:'good-'+i,description:'Original furniture restoration program.'})))];
 const response=await worker.fetch(new Request('https://api.example/api/v3/guide?channel=restoration-row&limit=8'),{realsignal_catalog:db(rows)},{waitUntil(){}});
 assert.equal(response.status,200);const guide=await response.json();assert.ok(guide.items.length>=2);
 assert.ok(guide.items.every(x=>/^good-/.test(x.id)));assert.equal(guide.current.id,'good-0');assert.equal(guide.next.id,'good-1');
 assert.equal(guide.catalogDepth,12,'eligible depth must exclude rejected programs');
});
test('Source guide retains uploader identity and language for generic gardening-show titles',async()=>{
 const rows=[row(program('Hydrangea Trial Gardens',{id:'valid-garden',account:'Growing a Greener World'})),row(program('GardenSMART Full Program',{id:'french',account:'GardenSMARTTV',language:'fr'}))];
 const response=await worker.fetch(new Request('https://api.example/api/v3/guide?channel=garden-ledger'),{realsignal_catalog:db(rows)},{waitUntil(){}});
 assert.equal(response.status,200);const guide=await response.json();assert.equal(guide.current.id,'valid-garden');assert.deepEqual(guide.items.map(x=>x.id),['valid-garden']);
});
test('IA guide excludes known bad formats while keeping ordinary episodes',async()=>{
 const rows=[row(program('Fan-made Space Movie',{id:'fan',provider:'Internet Archive',type:'video'})),row(program('Weekly Television Podcasts',{id:'podcasts',provider:'Internet Archive',type:'video'})),row(program('Complete Original Television Episode',{id:'episode',provider:'Internet Archive',type:'video'}))];
 const response=await worker.fetch(new Request('https://api.example/api/v3/guide?channel=10'),{realsignal_catalog:db(rows)},{waitUntil(){}});
 assert.equal(response.status,200);const guide=await response.json();assert.deepEqual(guide.items.map(x=>x.id),['episode']);
});

test('IA current/next omits confirmed keyword collisions while preserving real performances',async()=>{
 const cases=[
  ['54',['Driven (2001) - 4K AI Upscale'],'1990 Daytona 500 Full Race'],
  ['225',['Will Smith, Chris Rock & Academy Awards - H3TV #29','Howard Stern Show on E! (1997) Chris Rock',"Late Night With Conan O' Brien With Damon Wayans, Gabrielle Reece, Kurt Anderson"],'The Chris Rock Show — Full Episode'],
  ['905',['Pink Floyd — The Final Cut Radio Advert'],'Muddy Waters — Radio Session Concert'],
 ];
 for(const [channel,badTitles,goodTitle] of cases){
  const mediaType=channel==='905'?'audio':'video';
  const entry=(title,id)=>row(program(title,{id,provider:'Internet Archive',type:mediaType,url:'https://archive.org/download/fixture/'+id+(mediaType==='audio'?'.mp3':'.mp4')}));
  const rows=[...badTitles.map((title,i)=>entry(title,'bad-'+i)),entry(goodTitle,'good')];
  const response=await worker.fetch(new Request('https://api.example/api/v3/guide?channel='+channel),{realsignal_catalog:db(rows)},{waitUntil(){throw new Error('guide must not initiate discovery');}});
  assert.equal(response.status,200);const guide=await response.json();
  assert.deepEqual(guide.items.map(x=>x.id),['good'],channel);assert.equal(guide.current.title,goodTitle);assert.equal(guide.next,null);
 }
});

test('guides refill past rejected D1 pages without discovery or consuming freshness',async()=>{
 for(const [channel,badCount] of [['10',8],['public-works',96]]){
  const rows=[...Array.from({length:badCount},(_,i)=>row(program('Weekly Infrastructure Podcasts',{id:'pod-'+i}))),...Array.from({length:12},(_,i)=>row(program('Public Works Infrastructure Full Documentary '+i,{id:'valid-'+i})))];
  const response=await worker.fetch(new Request('https://api.example/api/v3/guide?channel='+channel+'&limit=8'),{realsignal_catalog:db(rows)},{waitUntil(){throw new Error('guide must not schedule work');}});
  const guide=await response.json();assert.equal(guide.items.length,8);assert.equal(guide.verified,true);
  assert.equal(guide.catalogDepth,12);assert.equal(guide.qualifiedCatalogDepth,12);
  assert.ok(guide.items.every(x=>x.id.startsWith('valid-')));
  assert.ok(guide.items.every(x=>!('metadata_json' in x)));
 }
});
test('Source guide preserves requested listing count and deep stored catalog totals',async()=>{
 const rows=Array.from({length:120},(_,i)=>row(program('Furniture Restoration Full Documentary '+i,{id:'valid-'+i})));
 const response=await worker.fetch(new Request('https://api.example/api/v3/guide?channel=restoration-row&limit=8'),{realsignal_catalog:db(rows)},{waitUntil(){}});
 const guide=await response.json();assert.equal(guide.items.length,8);assert.equal(guide.catalogDepth,120);
 assert.equal(guide.storedCatalogDepth,120);assert.equal(guide.qualifiedCatalogDepth,null);assert.equal(guide.catalogDepthVerified,false);
});
test('an all-rejected bounded guide is pending, not verified or exhausted',async()=>{
 const rows=Array.from({length:140},(_,i)=>row(program('Weekly Infrastructure Podcasts',{id:'bad-'+i})));
 const response=await worker.fetch(new Request('https://api.example/api/v3/guide?channel=public-works'),{realsignal_catalog:db(rows)},{waitUntil(){}});
 const guide=await response.json();assert.equal(guide.items.length,0);assert.equal(guide.verified,false);
 assert.equal(guide.catalogExhausted,false);assert.equal(guide.guideReadTruncated,true);assert.equal(guide.qualifiedCatalogDepth,null);
});

test('previously served rejected rows cannot grant repeat permission',async()=>{
 const rows=Array.from({length:140},(_,i)=>({...row(program('Weekly Infrastructure Podcasts',{id:'bad-'+i})),last_served_at:Date.now()}));
 const response=await worker.fetch(new Request('https://api.example/api/v3/guide?channel=public-works'),{realsignal_catalog:db(rows)},{waitUntil(){}});
 const guide=await response.json();assert.equal(guide.verified,false);assert.equal(guide.catalogExhausted,false);assert.equal(guide.repeatAllowed,false);
});

// A live 6.0.32 session reached this six-hour black-screen upload at EOF.
// A moving HTML video clock is not sufficient evidence of television content.
test('explicit black-screen/audio-only formats never enter Source Suite discovery or retained rows',()=>{
 for(const title of ['Black Screen Bob Ross The Joy of Painting Season 3','The Joy of Painting - BLACK-SCREEN Edition','Bob Ross - Blank Screen','The Joy of Painting (audio only)','Bob Ross - Screen Off','Bob Ross - No Video']){
  const x=program(title,{id:'yt:rH0pfX6gXFc',duration:20994.041,description:'Bob Ross paints landscapes.'});
  assert.equal(policy.allow('comfort-television',x),false,title);
  assert.equal(qualifySourceItem(sourceProfile({profileKey:'comfort-television'}),x),null,title);
  assert.equal(catalogFallbackAllowed(x,{sourceCatalog:true,channel:'comfort-television'}),false,title);
 }
});

test('the no-picture format guard is shared by all ordinary Source Suite profiles',async()=>{
 const {SOURCE_PROFILE_REGISTRY}=await import('../source_suite_profile_registry.js');
 for(const key of Object.keys(SOURCE_PROFILE_REGISTRY).filter(key=>! /^(?:ok|vimeo)-/.test(key))){
  assert.equal(policy.allow(key,program('Original Full Program - Black Screen')),false,key);
 }
 // Neither a promotional footer nor a documentary subject is a format label.
 for(const x of [program('Bob Ross - Covered Bridge (Season 3 Episode 6)',{description:'Bob Ross paints a landscape. A black screen audio edition is linked below.'}),program('Why Television Screens Go Black | Full Documentary')])assert.equal(policy.allow('comfort-television',x),true,x.title);
 assert.ok(qualifySourceItem(sourceProfile({profileKey:'comfort-television'}),program('Bob Ross - Covered Bridge (Season 3 Episode 6)',{description:'The Joy of Painting. Bob Ross paints a landscape.'})));
 for(const key of ['ok-tv-channel','vimeo-tv-channel'])assert.equal(policy.allow(key,program('Black Screen Bob Ross The Joy of Painting Season 3')),true,'unrelated provider contracts stay unchanged');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': a retained no-picture program is pruned before playback/Next without clearing the good catalog',()=>{
 const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const names=['v2SourceProgramAllowed','v2PruneSourcePrograms'];
 const scope={window:{RealSignalSourcePrograms:policy}};
 vm.createContext(scope);
 vm.runInContext(names.map(name=>html.split('\n').find(line=>line.startsWith('function '+name+'('))).join('\n'),scope);
 const good=program('Bob Ross - Covered Bridge (Season 3 Episode 6)',{id:'yt:good'}),bad=program('Black Screen Bob Ross The Joy of Painting Season 3',{id:'yt:rH0pfX6gXFc'});
 const state={items:[good,bad],cursor:1,currentId:bad.id,pendingId:bad.id,currentTitle:bad.title,currentDuration:20994};
 scope.v2PruneSourcePrograms({profileKey:'comfort-television'},state);
 assert.equal(state.items.length,1);assert.equal(state.items[0].id,good.id);assert.equal(state.cursor,0);assert.equal(state.currentId,'');assert.equal(state.pendingId,'');
});

test('source guide excludes retained black-screen rows while keeping actual painting television',async()=>{
 const bad=program('Black Screen Bob Ross The Joy of Painting Season 3',{id:'yt:rH0pfX6gXFc',duration:20994.041}),good=program('Bob Ross - Covered Bridge (Season 3 Episode 6)',{id:'yt:good',description:'The Joy of Painting full episode.'});
 const tasks=[],response=await worker.fetch(new Request('https://api.test/api/v3/guide?channel=comfort-television'),{realsignal_catalog:db([row(bad),row(good)])},{waitUntil:p=>tasks.push(p)});
 const body=await response.json();await Promise.all(tasks);
 assert.equal(response.status,200);
 assert.ok(!JSON.stringify(body).includes(bad.id),'guide must not advertise a retained no-picture program');
 assert.ok(JSON.stringify(body).includes(good.id),'the good program must remain available');
});

test('exact no-picture phrases used as a documentary subject or negated label are not formats',()=>{
 for(const title of ['Why TVs Show a Black Screen | Full Documentary','Bob Ross - Covered Bridge (No Black Screen)','Bob Ross - Covered Bridge (without a blank screen)','Bob Ross - Covered Bridge - Not Audio Only'])assert.equal(policy.allow('comfort-television',program(title)),true,title);
});

test('documentary subjects cannot exempt a separate affirmative no-picture edition label',()=>{
 for(const title of ['How Earth Was Made | Full Documentary (Audio Only)','The History of Rome | Documentary - Black Screen','Why TVs Show a Black Screen | Full Documentary - Black Screen Edition'])assert.equal(policy.allow('documentary-desk',program(title)),false,title);
});

test('Comfort Television rejects cast retrospectives without rejecting real craft programming',async()=>{
 const profile=sourceProfile({profileKey:'comfort-television'});
 const bad=program('Home Improvement Then and Now 2026 | Who’s Still Alive After 35 Years?',{id:'yt:kBiuwdqHyvA'});
 for(const title of [bad.title,'Home Improvement Cast Then & Now','The Joy of Painting Cast: Where Are They Now?']){
  const item={...bad,title};assert.equal(policy.allow(profile.profileKey,item),false,title);
  assert.equal(qualifySourceItem(profile,item),null,title);
  assert.equal(catalogFallbackAllowed(item,{sourceCatalog:true,channel:profile.profileKey}),false,title);
 }
 for(const title of ['The Joy of Painting - Covered Bridge - Full Episode','The Woodwrights Shop - Case of the Corner Cupboard','This Old House - Restoring a Victorian Porch','Gardening Then and Now: Restoring a Historic Garden'])assert.ok(qualifySourceItem(profile,program(title,{description:'A complete craft and gardening television program.'})),title);
 const good=program('The Joy of Painting - Covered Bridge - Full Episode',{id:'yt:good',description:'Bob Ross paints a landscape.'});
 const response=await worker.fetch(new Request('https://api.test/api/v3/guide?channel=comfort-television'),{realsignal_catalog:db([row(bad),row(good)])},{waitUntil(){}}),body=await response.json();
 assert.equal(response.status,200);assert.ok(!JSON.stringify(body).includes(bad.id));assert.ok(JSON.stringify(body).includes(good.id));
 for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
  const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),scope={window:{RealSignalSourcePrograms:policy}};vm.createContext(scope);
  vm.runInContext(['v2SourceProgramAllowed','v2PruneSourcePrograms'].map(name=>html.split('\n').find(line=>line.startsWith('function '+name+'('))).join('\n'),scope);
  const state={items:[good,bad],cursor:1,currentId:bad.id,pendingId:bad.id};scope.v2PruneSourcePrograms(profile,state);
  assert.equal(state.items.length,1,file);assert.equal(state.items[0].id,good.id,file);assert.equal(state.currentId,'',file);
 }
 assert.equal(policy.allow('documentary-desk',bad),true,'Comfort-only subject rules do not restrict general documentaries');
});
