import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {sourceProfile,qualifySourceItem,discoverSourceCatalog} from '../realsignal_source_catalog.js';
import worker,{catalogFallbackAllowed,compactCatalogItem} from '../realsignal_api_v2_worker.js';
const require=createRequire(import.meta.url),key='cartoon-time-machine';
const policyPath=new URL('../assets/source-program-policy.js',import.meta.url);
const policy=fs.existsSync(policyPath)?require(fileURLToPath(policyPath)):{allow:()=>true};
const bad="15 Dark & Amazing Facts About Thundercats (1980's) Animated Series - Explored";
const item=(title,id='yt:fixture')=>({id,title,provider:'YouTube',type:'embed',url:'https://www.youtube.com/embed/abcdefghijk',duration:1800,aspectRatio:16/9,language:'en',description:'Classic animated series full episode.',account:'Cartoon Television',embedAllowed:true,query:'classic cartoons full episodes'});

const synthetic=[
 {...item('Classic Cartoon Full Episode'),containsSyntheticMedia:true},
 {...item('Classic Cartoon Full Episode'),status:{containsSyntheticMedia:true}},
 item('Classic Cartoon Full Episode | AI-generated'),
 {...item('Classic Cartoon Full Episode'),description:'This video was created entirely using AI.'},
 {...item('Classic Cartoon Full Episode'),description:'All visuals were generated with Sora.'},
 {...item('Classic Cartoon Full Episode'),description:'This is an AI-generated video for entertainment purposes.'},
 {...item('Classic Cartoon Full Episode'),description:'Created using AI.'},
 {...item('Classic Cartoon Full Episode'),account:'EyeBible'},
 {...item('Classic Cartoon Full Episode'),channelId:'UCEKndy_m0UI1TALDsivTDUg'},
 {...item('The Most FEARLESS Woman in the BIBLE (2026): Full Movie of Judith | Animated Bible Story','youtube:0yGHkKFFvE0'),url:'https://www.youtube-nocookie.com/embed/0yGHkKFFvE0'}
];
test('all Source Suite profiles reject disclosed synthetic media and the confirmed AI uploader',()=>{
 for(const profileKey of [key,'gearhead-garage','documentary-desk','modern-movie-channel'])for(const row of synthetic){
  assert.equal(policy.allow(profileKey,row),false,profileKey+': '+JSON.stringify(row));
  assert.equal(catalogFallbackAllowed(row,{channel:profileKey,sourceCatalog:true}),false,'stored '+profileKey);
 }
});
test('AI subjects, original animation and negated disclosures are not synthetic-production evidence',()=>{
 for(const row of [item('Looney Tunes Full Episode'),item('A.I. Artificial Intelligence (2001) Full Movie'),item('Artificial Intelligence: A History | Documentary'),{...item('Classic Cartoon Full Episode'),description:'No AI-generated content. Original hand-drawn animation.'},{...item('Classic Cartoon Full Episode'),description:'This video was not created using AI.'},{...item('A History of Computer Art | Documentary'),description:'This film examines AI-generated images and their impact on working artists.'},{...item('Classic Cartoon Full Episode'),containsSyntheticMedia:false}]){
  assert.equal(policy.allow('documentary-desk',row),true,row.title);
 }
});
test('synthetic disclosure and uploader identity survive storage compaction',()=>{
 const row=compactCatalogItem({...item('Classic Cartoon Full Episode'),channelId:'channel-fixture',containsSyntheticMedia:true});
 assert.equal(row.channelId,'channel-fixture');assert.equal(row.containsSyntheticMedia,true);
 assert.equal(catalogFallbackAllowed(row,{channel:'gearhead-garage',sourceCatalog:true}),false);
});
test('D1 source responses recheck synthetic metadata after row deserialization',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({data:[],items:[]}),{headers:{'content-type':'application/json'}});
 const rows=Array.from({length:15},(_,i)=>({id:'stored-'+i,source_identifier:'stored-'+i,title:'Field Biology Study Full Episode',description:'A long-form ecology field study.',provider:'YouTube',duration_seconds:1800,aspect_ratio:16/9,media_type:'embed',media_url:'https://www.youtube-nocookie.com/embed/abcdefghijk',rights:'Standard YouTube license',metadata_json:JSON.stringify({genreVerified:true,account:i===1?'EyeBible':'Field Studies',channelId:i===2?'UCEKndy_m0UI1TALDsivTDUg':'original-'+i,containsSyntheticMedia:i===0})}));
 const pending=[],env={realsignal_catalog:{prepare(sql){return {bind(){return {async all(){return {results:sql.includes('FROM programs')?rows:[]};}};}};}}};
 try{
  const response=await worker.fetch(new Request('https://api.example/api/v2/source/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:'field-notes',minimumReady:5,rotation:0})}),env,{waitUntil(p){pending.push(p);}});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.source,'d1-source-catalog');
  assert.ok(body.items.length);assert.ok([...body.items,...body.candidateItems||[]].every(x=>!['stored-0','stored-1','stored-2'].includes(x.id)));
  assert.ok(body.items.every(x=>/^original-/.test(x.channelId)&&x.containsSyntheticMedia===false));
  await Promise.allSettled(pending);
 }finally{globalThis.fetch=original;}
});
test('canonical cartoon admission rejects the observed commentary, not actual television',()=>{
 const p=sourceProfile({profileKey:key});
 assert.equal(qualifySourceItem(p,item(bad)),null);
 assert.ok(qualifySourceItem(p,item('Thundercats Saturday Morning MARATHON | GenerationWB')));
 assert.ok(qualifySourceItem(p,item('Looney Tunes | Wile E. Coyote vs Road Runner Full Episodes | Warner Classics')));
});
test('stored cartoon rows use the same approved program gate',()=>{
 assert.equal(catalogFallbackAllowed(item(bad),{channel:key,sourceCatalog:true}),false);
 assert.equal(catalogFallbackAllowed(item('Classic Cartoon Full Episode'),{channel:key,sourceCatalog:true}),true);
});

test('editorial description boilerplate does not turn a full cartoon into commentary',()=>{
 const p=sourceProfile({profileKey:key});
 for(const description of ['Subscribe for behind the scenes.','Our channel discusses the history of animation.','Watch a recap on our other channel.']){
  assert.ok(qualifySourceItem(p,{...item('Classic Cartoon Full Episode'),description}),description);
 }
});

test('existing animated movie and feature-film forms remain eligible',()=>{
 const p=sourceProfile({profileKey:key});
 for(const description of ['A complete animated movie.','A complete animated feature film.']){
  assert.ok(qualifySourceItem(p,{...item('Joseph: Beloved Son, Rejected Slave, Exalted Ruler | Full Movie'),account:'Vision Video',description}),description);
 }
});
test('fresh YouTube discovery cannot publish commentary before it reaches stored-row qualification',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{const u=new URL(String(input));let body={data:[],total:0};
  if(u.hostname==='www.googleapis.com'&&u.pathname.endsWith('/search'))body={items:[{id:{videoId:'abcdefghijk'},snippet:{title:bad}}]};
  if(u.hostname==='www.googleapis.com'&&u.pathname.endsWith('/videos'))body={items:[{id:'abcdefghijk',snippet:{title:bad,description:'Classic animated series full episode.',channelTitle:'Cartoon Television',defaultAudioLanguage:'en',thumbnails:{maxres:{width:1280,height:720}}},contentDetails:{duration:'PT30M'},status:{embeddable:true,uploadStatus:'processed'}}]};
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 };
 try{const result=await discoverSourceCatalog({profileKey:key},{YOUTUBE_API_KEY:'test-only'},0);assert.ok(result.lanes.length);assert.equal(result.items.some(x=>x.title===bad),false);}finally{globalThis.fetch=original;}
});

test('YouTube hydration rejects synthetic status and retains uploader/disclosure facts on accepted programs',async()=>{
 const original=globalThis.fetch,ids=['abcdefghijk','klmnopqrstu','uvwxyzABCDE'];
 globalThis.fetch=async input=>{const u=new URL(String(input));let body={data:[],total:0};
  if(u.hostname==='www.googleapis.com'&&u.pathname.endsWith('/search'))body={items:ids.map(videoId=>({id:{videoId},snippet:{title:'Looney Tunes Full Episodes'}}))};
  if(u.hostname==='www.googleapis.com'&&u.pathname.endsWith('/videos'))body={items:ids.map((id,i)=>({id,snippet:{title:'Looney Tunes Full Episodes',description:'Original classic cartoons full episodes.',channelTitle:i===1?'EyeBible':'WB Kids',channelId:i===1?'UCEKndy_m0UI1TALDsivTDUg':'verified-originals',defaultAudioLanguage:'en'},contentDetails:{duration:'PT30M'},status:{embeddable:true,containsSyntheticMedia:i===0}}))};
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 };
 try{const result=await discoverSourceCatalog({profileKey:key},{YOUTUBE_API_KEY:'test-only'},0),rows=result.items.filter(x=>x.provider==='YouTube');
  assert.equal(rows.length,1);assert.match(rows[0].url,/uvwxyzABCDE/);assert.equal(rows[0].channelId,'verified-originals');assert.equal(rows[0].containsSyntheticMedia,false);
 }finally{globalThis.fetch=original;}
});
test('YouTube admission examines the full description before storage truncation',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{const u=new URL(String(input));let body={data:[],total:0};
  if(u.hostname==='www.googleapis.com'&&u.pathname.endsWith('/search'))body={items:[{id:{videoId:'abcdefghijk'},snippet:{title:'Looney Tunes Full Episodes'}}]};
  if(u.hostname==='www.googleapis.com'&&u.pathname.endsWith('/videos'))body={items:[{id:'abcdefghijk',snippet:{title:'Looney Tunes Full Episodes',description:'Original cartoons. '.repeat(150)+'This video was created using AI.',channelTitle:'Cartoon Television',defaultAudioLanguage:'en'},contentDetails:{duration:'PT30M'},status:{embeddable:true}}]};
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 };
 try{const result=await discoverSourceCatalog({profileKey:key},{YOUTUBE_API_KEY:'test-only'},0);assert.equal(result.items.length,0);}finally{globalThis.fetch=original;}
});
test('PeerTube detail disclosures also prevent publishing generated programs',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{const u=new URL(String(input));let body={data:[],items:[]};
  if(u.pathname==='/api/v1/search/videos')body={data:[{uuid:'cartoon-fixture',name:'Looney Tunes Full Episodes',description:'Original classic cartoon full episodes.',duration:1800,aspectRatio:16/9,licence:{label:'Creative Commons Attribution'}}]};
  if(u.pathname==='/api/v1/videos/cartoon-fixture')body={description:'Created using AI.',duration:1800,licence:{label:'Creative Commons Attribution'},files:[{fileUrl:'https://video.example/cartoon.mp4',width:1280,height:720}]};
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 };
 try{const result=await discoverSourceCatalog({profileKey:key},{},0);assert.equal(result.items.length,0);}finally{globalThis.fetch=original;}
});
test('cartoon-only policy rejects explainers without poisoning unrelated documentary or actual episode descriptions',()=>{
 assert.equal(policy.allow(key,item(bad)),false);
 assert.equal(policy.allow(key,item('What Happened To Thundercats? Animated Series Explained')),false);
 assert.equal(policy.allow(key,item('Giu dal Nido - A new animated series made in Blender combined')),false);
 assert.equal(policy.allow(key,item('Classic Cartoon Full Episode')),true);
 assert.equal(policy.allow('documentary-desk',item('The History of Animation - Facts About Thundercats')),true);
 assert.equal(policy.allow(key,{...item('Classic Cartoon Full Episode'),description:'Our channel also discusses facts about animation.'}),true);
});
function legacyRelevance(source,scope,profile){
 scope.V2_PREVIEW_PROFILES={[key]:profile};scope.V2_SOURCE_TOPIC_OVERRIDES={};scope.V2_SOURCE_QUERY_SUFFIXES={};scope.V2_SOURCE_COMMON_DENY=[];scope.v2DiscoveryQueries=()=>[];
 for(const name of ['v2Text','v2TextUnique','v2SourceTokens','v2QueryTokens','v2TermHit','v2ProgramTopics','v2ProgramDeny','v2ProgramTitleDeny','v2ProgramCategoryOkay','v2ProgramFormats','v2StrictProgramFallback','v2Relevant','v2SourceProgramAllowed','v2CandidateRelevant']){
  const line=source.match(new RegExp('^ ?function '+name+'\\([^\\n]+','m'));
  if(line)vm.runInContext(line[0],scope);
 }
 for(const marker of ['/* SOURCE SUITE PLAYBACK RECOVERY:','/* CARTOON TIME MACHINE ERA PROGRAMMING:']){
  const start=source.indexOf(marker),end=source.indexOf('</script>',start);vm.runInContext(source.slice(start,end),scope);
 }
 const final=source.indexOf('var baseDiscovery=v2DiscoveryQueries,baseRelevant=v2Relevant;'),start=source.lastIndexOf('(function(){',final),end=source.indexOf('</script>',final);
 vm.runInContext(source.slice(start,end),scope);
}
function client(file,programs,options={}){
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n'),start=source.indexOf('async function v2LoadProfile('),end=source.indexOf('\nfunction v2RejectEmbed(',start),saved=[];
 let lane;
 const profile={...sourceProfile({profileKey:key}),name:'Cartoon Time Machine',intent:'animation',providers:['youtube'],serverOnly:true,...options.profile},state={items:options.active||[],cursor:0};
 const scope={window:{RealSignalSourcePrograms:policy},v2PreviewState:{555:state},v2PreviewInflight:{},v2PreviewFirstReady:{},V2_SOURCE_CACHE_VERSION:50,V2_SOURCE_MIN_CATALOG:12,V2_SOURCE_CACHE_TTL:60000,V2_SOURCE_CATALOG_SIZE:96,
 store:{get:k=>k==='v2source:'+profile.name?options.cached||null:null,set:(_key,value)=>saved.push(value)},v2NextRotation:()=>0,v2Provider:async(_n,_p,_r,onFirst)=>{onFirst(lane);return lane;},
 v2RoundRobin:rows=>rows.flat(),v2Unique:xs=>[...new Map(xs.map(x=>[x.id,x])).values()],v2MergeCatalog:(_p,a,b)=>[...new Map(a.concat(b).map(x=>[x.id,x])).values()],v2CatalogOrder:(_k,x)=>x,v2Landscape:()=>true,v2ProfileRuntimeOkay:()=>true,v2SourceHealth:()=>({}),refreshGuideData(){},nlog(){},setTimeout:()=>0,Date,Promise};
 vm.createContext(scope);legacyRelevance(source,scope,profile);const prune=source.match(/^function v2PruneSourcePrograms\([^\n]+/m);if(prune)vm.runInContext(prune[0],scope);vm.runInContext(source.slice(start,end),scope);
 return {state,saved,async load(){lane={provider:'Server Catalog',items:programs||[item(bad,'bad'),item('Classic Cartoon Full Episode','good')]};await scope.v2LoadProfile({num:555},profile,1);await new Promise(r=>setImmediate(r));}};
}
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': AI rows are removed from fresh server replies, saved caches and active shelves',async()=>{
 const good=item('Classic Cartoon Full Episode','good'),badRow={...synthetic[5],id:'ai'};
 const fresh=client(file,[badRow,good],{profile:{profileKey:'documentary-desk'}});await fresh.load();
 assert.deepEqual(Array.from(fresh.state.items,x=>x.id),['good']);
 const cached={version:50,at:Date.now(),items:[badRow,...Array.from({length:12},(_,i)=>({...good,id:'good-'+i}))]};
 const retained=client(file,[],{cached,active:[badRow,good]});await retained.load();
 assert.ok(retained.state.items.length);assert.ok(retained.state.items.every(x=>x.id!=='ai'));
 assert.ok(retained.saved.length);assert.ok(retained.saved.every(x=>x.items.every(i=>i.id!=='ai')));
 assert.equal(retained.saved[0].at,cached.at,'pruning must not reset cache age');
});
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': both early and final server shelves are requalified before cache/guide publication',async()=>{
 const h=client(file);await h.load();assert.deepEqual(Array.from(h.state.items,x=>x.id),['good']);assert.ok(h.saved.length);assert.ok(h.saved.every(x=>x.items.every(i=>i.id==='good')));
});
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': fresh server-approved episodes survive the actual stricter legacy relevance wrappers',async()=>{
 const programs=[{...item('Recess First Full Episode | The Break In / The New Kid | S1 E1','recess'),description:'Full episode of Recess.',account:'Disney Channel Animation'},item('Looney Tunes | Wile E. Coyote vs Road Runner Full Episodes | Warner Classics','looney')];
 const h=client(file,programs);await h.load();assert.deepEqual(Array.from(h.state.items,x=>x.id),['recess','looney']);
});
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': permissive legacy relevance cannot bypass the cartoon gate; a missing policy asset does not break other profiles',()=>{
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),gate=(source.match(/function v2SourceProgramAllowed\(profile,item\)\{[^\n]+/)||[''])[0]+'\n'+source.match(/function v2CandidateRelevant\(profile,item\)\{[^\n]+/)[0];
 const scope={window:{RealSignalSourcePrograms:policy},v2Text:v=>String(v||''),v2Relevant:()=>true};vm.createContext(scope);vm.runInContext(gate,scope);
 assert.equal(scope.v2CandidateRelevant({profileKey:key,intent:'animation'},item(bad)),false);
 delete scope.window.RealSignalSourcePrograms;
 assert.equal(scope.v2CandidateRelevant({profileKey:'documentary-desk'},item('Facts About Cartoons')),true);
 assert.equal(scope.v2CandidateRelevant({profileKey:key},item('Full Cartoon Episode')),false);
});
