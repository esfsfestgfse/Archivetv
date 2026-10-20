const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const {execFileSync}=require('node:child_process');
function relay(options={}){
  const s={console,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,Date,setTimeout,clearTimeout,...options};
  vm.createContext(s);vm.runInContext(fs.readFileSync(path.join(root,'afterglow_ais_relay_worker.js'),'utf8').replace('export default','const worker=')+
    ';globalThis.f={iaRepairCollectionSeeds,orderedIaEmergencySeeds,queueTitleFamily,stationGate:iaStationQualityGate,archiveEpisodeKey,iaEffectiveVideoMinRuntimeSeconds,iaRepairPublicCatalog,strictRecoveryQueue,themeScore,matchesDeny,applyIaFreshness,expandSeedArchiveContainers,queuePlayable,getIaQueue,scheduleIaExpansion,qualifyIaQueueResponse,consume:(...args)=>worker.queue(...args),setHarvest:fn=>{expandAndCacheIaQueue=fn;},setHydrate:fn=>{hydrateIaQueue=fn;}};',s);return s.f;
}

test('Sporting Life cannot promote civic meetings or concert uploads through outdoor subject tags',async()=>{
  const f=relay(),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const rejected=['Oceanside City Council Meeting - December 7 2016 PART 1','A Conversation with Secretary Sally Jewell','Green Day - The Easter Show 1992 - FULL PERFORMANCE',
    'In-Fisherman - Building an Enterprise Level Drupal Site - Paul Chason and Josh Estep','Outdoor Life Network Commercial Breaks (February 2000)',
    'Ed Bassmaster','Easy Money S01E06 Bassmaster','Good Will Hunting full movie'];
  for(const title of rejected){const item={identifier:'unrelated::program.mp4',title,subject:'outdoor recreation hunting sport',media:{type:'video',url:'https://archive.org/download/unrelated/program.mp4'}};
    assert.equal(f.stationGate('65',item),false,title+' at relay');
    assert.equal(catalogFallbackAllowed(item,{channel:'65'}),false,title+' at catalog admission');
  }
  for(const title of ['Bill Dance Outdoors','Realtree Hunting Adventures','Upland Hunting: Pheasants and Labs','Long Lake Ice Fishing Derby']){
    const item={identifier:'outdoor::episode.mp4',title,media:{type:'video',url:'https://archive.org/download/outdoor/episode.mp4'}};
    assert.equal(f.stationGate('65',item),true,title);assert.equal(catalogFallbackAllowed(item,{channel:'65'}),true,title);
  }
  const scavengerFilm={identifier:'HuntingSeason::huntingonline_512kb.mp4',title:'Hunting Season',subject:'outdoors hunting sports',media:{type:'video',url:'https://archive.org/download/HuntingSeason/huntingonline_512kb.mp4'}};
  assert.equal(f.stationGate('65',scavengerFilm),false,'the observed scavenger-hunt film is not an outdoors show');
  assert.equal(catalogFallbackAllowed(scavengerFilm,{channel:'65'}),false);
});

test('Courtroom TV requires a judge-show identity rather than an incidental description mention',async()=>{
  const f=relay(),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const bad={identifier:'KPIX_20130622_020000_Washington_Week_With_Gwen_Ifill',title:'Washington Week With Gwen Ifill',
    description:'Broadcast schedule: Judge Judy, politics and news',subject:'Judge Judy small claims',media:{type:'video',url:'https://archive.org/download/news/full.mp4'}};
  assert.equal(f.stationGate('20',bad),false);assert.equal(catalogFallbackAllowed(bad,{channel:'20'}),false);
});

test('relay freshness unifies a single-program parent and its matching file without excluding siblings',()=>{
  const f=relay(),parent='WTTG_20010911_140000_Divorce_Court',make=(id,file)=>({identifier:id,sourceIdentifier:parent,fileName:file,
    title:'Divorce Court',media:{type:'video',url:'https://archive.org/download/'+parent+'/'+file}});
  const original=make(parent,parent+'.mp4'),alias=make(parent+'::'+parent+'.mp4',parent+'.mp4');
  const sibling=make(parent+'::Another Episode.mp4','Another Episode.mp4');
  const p=f.applyIaFreshness({channel:'20',rotation:1,items:[original,alias,sibling],candidateItems:[original,alias,sibling]},[{id:parent}],1).payload;
  assert.equal(p.items[0].identifier,sibling.identifier,'a newly expanded file cannot replay the just-watched single-program parent');
});

test('measured shallow lanes expose expanded file banks through the actual strict recovery and client contracts',async()=>{
  const f=relay(),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const manifest=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/export-ia-manifest.js')],{encoding:'utf8',maxBuffer:16e6}));
  for(const [channel,minimum] of [['20',96],['65',20],['204',24],['510',96]]){
    const rules=manifest.find(x=>x.channel===channel),bank=f.iaRepairCollectionSeeds(channel).filter(x=>x.media?.url);
    assert.ok(bank.length>=minimum,channel+' must hold a real expanded bank, not another starter shelf');
    assert.ok(bank.every(x=>x.media.runtime>=900&&x.media.width>x.media.height&&x.media.metadataVerifiedAt>0));
    const payload=f.strictRecoveryQueue(channel,0,96,rules.themeTerms,rules.denyTerms,rules.requiredTitleTerms,rules.mediaTypes,rules.minRuntimeSeconds);
    assert.ok(payload.candidateItems.length>=minimum,channel+' cannot lose the bank to the old station vocabulary');
    assert.ok(bank.every(item=>catalogFallbackAllowed(item,rules)),channel+' API admission retains the reviewed files');
    assert.ok(bank.every(item=>payload.candidateItems.some(candidate=>candidate.identifier===item.identifier)),channel+' retains file-level depth behind its shelf');
    if(['20','510'].includes(channel))assert.equal(new Set(payload.items.slice(0,3).map(x=>x.seriesId)).size,3,'opening shelf rotates television series, not just episode IDs');
  }
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': Sporting Life direct and cached playback enforce outdoor program identity',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,iaProgramFailed:()=>false,iaSkipBlocked:()=>false,iaThemeMatches:()=>true};
  vm.createContext(s);vm.runInContext(source.slice(source.indexOf('function iaKnownVideoPolicyViolation('),source.indexOf('function iaProgramDenyTerms('))+';f={cached:iaCachedProgramAllowed,queue:iaProgramAllowed};',s);
  for(const title of ['Oceanside City Council Meeting','A Conversation with Secretary Sally Jewell','Green Day - FULL PERFORMANCE',
    'Ed Bassmaster','Easy Money S01E06 Bassmaster','Good Will Hunting full movie']){
    assert.equal(s.f.queue({identifier:'bad',title,subject:'outdoor recreation'},{channel:65,program:{}}),false,title);
    assert.equal(s.f.cached({num:65,nm:'The Sporting Life'},{id:'bad',title,type:'video'}),false,title);
  }
  assert.equal(s.f.cached({num:65,nm:'The Sporting Life'},{id:'bill-dance::episode.mp4',title:'Bill Dance Outdoors',type:'video'}),true);
  assert.equal(s.f.cached({num:201,nm:'Documentary'},{id:'speech',title:'A Conversation with Secretary Sally Jewell',type:'video'}),true,'not a global ban on documentaries');
  const news={identifier:'news',id:'news',title:'Washington Week With Gwen Ifill',subject:'Judge Judy',type:'video'};
  assert.equal(s.f.queue(news,{channel:20,program:{}}),false);assert.equal(s.f.cached({num:20},news),false);
  assert.equal(s.f.cached({num:65},{id:'HuntingSeason::huntingonline_512kb.mp4',title:'Hunting Season',type:'video'}),false);
  for(const channel of [20,65]){
    assert.equal(s.f.queue(null,{channel,program:{}}),false,'empty queues stay a normal miss');
    assert.equal(s.f.cached({num:channel},null),false,'empty saved entries do not throw');
  }
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': all ordinary IA queues and old playback caches apply the global TV policy',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,
    iaProgramFailed:()=>false,iaSkipBlocked:()=>false,iaThemeMatches:()=>true};
  vm.createContext(s);const start=source.includes('function iaKnownVideoPolicyViolation(')?source.indexOf('function iaKnownVideoPolicyViolation('):source.indexOf('function iaModernGameShowAllowed(');
  vm.runInContext(source.slice(start,source.indexOf('function iaProgramDenyTerms('))+';f={cached:iaCachedProgramAllowed,queue:iaProgramAllowed};',s);
  for(const channel of [54,65,79,82,100,202,204,705])for(const title of ['Video Podcast','Fanmade Movie','Boxing #shorts']){
    assert.equal(s.f.queue({identifier:'bad',title},{channel,program:{}}),false,channel+': '+title);
    assert.equal(s.f.cached({num:channel,nm:'IA station'},{id:'bad',type:'video',title,url:'https://archive.org/download/bad/video.mp4'}),false);
  }
  assert.equal(s.f.cached({num:900,audio:true},{id:'radio',type:'audio',title:'Audio Podcast',url:'https://archive.org/download/radio/track.mp3'}),true,'radio retains its audio contract');
  assert.equal(s.f.queue({identifier:'original',title:'Original cartoon shorts',media:{type:'video',url:'https://archive.org/download/cartoon/full.mp4',runtime:420,width:640,height:480}},{channel:150,program:{}}),true);
});

test('background game-show verification reaches different shows before a large single-series block',async()=>{
  const f=relay(),pending=[],calls=[];
  const make=(show,n)=>({identifier:show+'::'+n+'.mp4',sourceIdentifier:show,fileName:n+'.mp4',title:show+' full episode 1995',seriesId:show,year:1995,
    media:{type:'video',url:'https://archive.org/download/'+show+'/'+n+'.mp4',runtime:1320,width:640,height:480}});
  const rows=[...Array.from({length:40},(_,i)=>make('The Price Is Right',i)),make('Wheel of Fortune',0),make('Jeopardy!',0)];
  f.setHydrate(async payload=>{calls.push(payload);return {...payload,items:rows.slice(0,3),ready:3,lastGoodKey:'game-show-background-test'};});
  const kv={get:async()=>null,put:async()=>{}};
  await f.qualifyIaQueueResponse(Response.json({items:rows.slice(0,3),candidateItems:rows,ready:3}),
    {channel:'22',iaRepair:true,count:3,mediaTypes:['movies'],hydrationPreferredIds:rows.slice(0,3).map(x=>x.identifier)},'https://relay.invalid',
    {waitUntil:p=>pending.push(p)},{REALSIGNAL_QUEUE:kv});
  await Promise.all(pending);
  assert.ok(calls.length>=2,'the test exercises real background scheduling');
  assert.equal(new Set(calls[1].candidateItems.slice(0,3).map(item=>item.seriesId)).size,3,'Wheel and Jeopardy cannot wait behind forty Price episodes');
  assert.ok(rows.every(row=>calls[1].candidateItems.some(item=>item.identifier===row.identifier)),'balancing cannot discard catalog depth');
});

function collectionFixture(options={}){
  const payload={metadata:{title:'Cartoon Complete Series',language:'eng'},files:[
    ...Array.from({length:4},(_,i)=>({name:'Episode '+(i+1)+'.mp4',format:'h.264',length:1320,width:640,height:480})),
    {name:'Episode 1.ia.mp4',format:'h.264',length:1320,width:640,height:480},
    {name:'Fan-made parody movie.mp4',format:'h.264',length:1320,width:640,height:480},
    {name:'Portrait.mp4',format:'h.264',length:1320,width:360,height:640},
  ]};
  const reads=[];
  const f=relay({crypto:require('node:crypto').webcrypto,fetch:async(url,init={})=>{
    reads.push(String(url));
    if(options.delayMs)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,options.delayMs);
      init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal.reason);},{once:true});});
    return Response.json(options.metadataFor?options.metadataFor(String(url),payload):payload);
  },
    caches:{default:{match:async()=>undefined,put:async()=>{},delete:async()=>true}}});
  const expand=(item)=>f.expandSeedArchiveContainers({items:[item],candidateItems:[item]},'https://relay.invalid',
    {isIaBackground:true,waitUntil:()=>{}},'153',['cartoon'],['parody'],[],['movies'],1,0,96);
  return {f,reads,expand,payload};
}

test('Modern Game Shows rejects children show identities at relay and API admission while retaining adult staples',async()=>{
  const f=relay(),{iaGameShowEraAllowed}=await import('../ia_file_contract.js');
  const kids=['Nickelodeon GUTS','Figure It Out','Double Dare','Legends of the Hidden Temple','Family Game Night','Nick Arcade','Finders Keepers','Get the Picture','Make the Grade','Wild and Crazy Kids','BrainSurge','Fun House','Jeopardy! Kids Week','Jeopardy! Teen Tournament'];
  for(const title of kids){const item={identifier:title.toLowerCase().replaceAll(' ','_')+'::episode.mp4',title,year:1995,media:{type:'video',url:'https://cdn.invalid/episode.mp4'}};
    assert.equal(f.stationGate('22',item),false,title+' relay');assert.equal(iaGameShowEraAllowed(item,'22'),false,title+' API');}
  for(const title of ['The Price Is Right','Wheel of Fortune','Jeopardy!','Family Feud','Who Wants to Be a Millionaire','Deal or No Deal','Press Your Luck','Jeopardy! College Championship']){
    const item={identifier:'adult::episode.mp4',title,year:2005,media:{type:'video',url:'https://cdn.invalid/episode.mp4'}};
    assert.equal(f.stationGate('22',item),true,title+' relay');assert.equal(iaGameShowEraAllowed(item,'22'),true,title+' API');}
  assert.equal(iaGameShowEraAllowed({title:'The Price Is Right',year:1978},'22'),false);
  assert.equal(iaGameShowEraAllowed({title:'The Price Is Right',year:1978},'12'),true);
});

test('modern game-show admission rejects unrelated keyword matches and non-English editions',async()=>{
  const f=relay(),{iaModernGameShowAllowed}=await import('../ia_file_contract.js');
  for(const title of ['Bergen-Belsen Concentration Camp','Sidekicks 1986 Ep 6: Thrill Of The Chase',
    'LA! KEN PAXTON DEFEATS CORNYN IN TX IRANIAN DEAL OR NO DEAL?',
    'Family Feud Philippines Premiere [2022] | TV RECORDING','It\'s Showtime on Family Feud PH | TV RECORDING',
    '1991 Soaps, Family Feud','Who Wants to Be a Millionaire- Major Fraud(2003)']){
    const item={identifier:'unrelated-upload::episode.mp4',title,year:2022};
    assert.equal(iaModernGameShowAllowed(item),false,title);assert.equal(f.stationGate('22',item),false,title);
    for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
      const source=fs.readFileSync(path.join(root,file),'utf8'),s={};vm.createContext(s);
      vm.runInContext(source.slice(source.indexOf('function iaModernGameShowAllowed('),source.indexOf('function iaEnglishRerunAllowed('))+';f=iaModernGameShowAllowed;',s);
      assert.equal(s.f(item),false,file+': '+title);
    }
  }
});

test('modern game-show kids editions cannot hide in subject fields or possessive labels',async()=>{
  const f=relay(),{iaModernGameShowAllowed}=await import('../ia_file_contract.js');
  const variants=[{title:"Jeopardy! Kids' Week full episode 1995"},{title:'Jeopardy! Kids’ Week full episode 1995'},
    {subject:['Teen Tournament']},{subjects:['Kids Edition']},{meta:{subjects:['Junior Jeopardy']}}];
  for(const variant of variants){
    const item={identifier:'jeopardy::episode.mp4',title:'Jeopardy! full episode 1995',year:1995,...variant};
    assert.equal(iaModernGameShowAllowed(item),false,JSON.stringify(variant));assert.equal(f.stationGate('22',item),false);
    for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
      const source=fs.readFileSync(path.join(root,file),'utf8'),s={};vm.createContext(s);
      vm.runInContext(source.slice(source.indexOf('function iaModernGameShowAllowed('),source.indexOf('function iaEnglishRerunAllowed('))+';f=iaModernGameShowAllowed;',s);
      assert.equal(s.f(item),false,file+': '+JSON.stringify(variant));
    }
  }
});

test('Modern Game Shows indexes full dated Price Is Right, Wheel and Jeopardy episodes rather than relying on keyword discovery',()=>{
  const f=relay(),rows=f.iaRepairCollectionSeeds('22').filter(item=>item.media?.url);
  for(const [show,minimum] of [['The Price Is Right',100],['Wheel of Fortune',20],['Jeopardy!',30]])
    assert.ok(rows.filter(item=>item.seriesTitle===show).length>=minimum,show+' needs a real file-level catalog');
  assert.ok(rows.every(item=>item.year>=1980&&item.year<=2026));
  assert.ok(rows.every(item=>item.media.runtime>=900&&item.media.width>item.media.height));
  assert.ok(rows.every(item=>! /nickelodeon|figure it out|family game night|double dare|hidden temple/i.test(item.title)));
  assert.ok(rows.some(item=>item.seriesTitle==='The Price Is Right'&&item.year<2000));
  assert.ok(rows.some(item=>item.seriesTitle==='Wheel of Fortune'&&item.year<2000));
  assert.ok(rows.some(item=>item.seriesTitle==='Jeopardy!'&&item.year>=2020));
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': Modern Game Shows excludes kids from saved/direct playback without banning Family Feud',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,iaProgramFailed:()=>false,iaSkipBlocked:()=>false,iaThemeMatches:()=>true};
  vm.createContext(s);const begin=source.indexOf('function iaKnownVideoPolicyViolation(');
  vm.runInContext(source.slice(begin,source.indexOf('function iaProgramDenyTerms('))+';f={cached:iaCachedProgramAllowed,queue:iaProgramAllowed};',s);
  const sl={channel:22,program:{}},ch={num:22,nm:'Modern Game Shows'};
  assert.equal(s.f.cached(ch,{id:'nickelodeon-guts-season-1::Episode.mp4',title:'Episode 1'},sl),false);
  assert.equal(s.f.queue({identifier:'figure_it_out::Episode.mp4',title:'Episode 1'},sl),false);
  assert.equal(s.f.cached(ch,{id:'family-feud::Episode.mp4',title:'Family Feud'},sl),true);
  assert.equal(s.f.queue({identifier:'wheel::1985.mp4',title:'Wheel of Fortune'},sl),true);
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])for(const generic of [false,true])test(file+': first-tune inline media retains '+(generic?'file-derived':'editorial')+' episode labels',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),cached=[];
  const id='keeping-up::Keeping_Up_Appearances_S04_E03.mp4',item={identifier:id,title:generic?'Blighty':'Keeping Up Appearances · Series 4 Episode 3',year:1993,
    media:{type:'video',url:'https://dn720001.ca.archive.org/0/items/keeping-up/episode.mp4'}};
  const s={iaProgramQueues:{'118':[item]},iaQueueKey:ch=>String(ch.num),iaExpectedMedia:()=> 'video',iaProgramFailed:()=>false,
    iaProgramMedia:{},iaInterstitialMedia:()=>false,fastTuneGet:()=>null,fastTunePut:(channel,media)=>cached.push(media),warmIAQueueHead:()=>{}};
  vm.createContext(s);
  vm.runInContext(source.slice(source.indexOf('function iaArchiveDirectURL('),source.indexOf('function adoptIAResolvedMedia('))+
    source.slice(source.indexOf('function warmIAQueue(ch,'),source.indexOf('function iaQueueHasReadyProgram('))+';warmIAQueue({num:118,nm:"Blighty"},{},false,1);',s);
  const expected=generic?'Keeping Up Appearances S04 E03':'Keeping Up Appearances · Series 4 Episode 3';
  assert.equal(s.iaProgramMedia[id].title,expected,'the actual playable record needs its label before the first frame');
  assert.equal(s.iaProgramMedia[id].year,1993);assert.equal(cached[0].title,expected);
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': a legacy titleless fast-tune entry recovers its episode label without losing the playable cache',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={fastTuneCache:{'118':{at:Date.now(),pl:{id:'keeping-up::Keeping_Up_Appearances_S04_E03.mp4',type:'video',url:'https://cdn.invalid/episode.mp4'}}},
    byNum:()=>({num:118,nm:'Blighty'}),iaExpectedMedia:()=> 'video',iaCachedProgramAllowed:()=>true,FAST_TUNE_TTL:3600000,
    isTemporarilySkipped:()=>false,iaProgramFailed:()=>false,blockedId:()=>false,banned:[]};
  vm.createContext(s);vm.runInContext(source.slice(source.indexOf('function iaDisplayTitle('),source.indexOf('function adoptIAResolvedMedia('))+
    source.slice(source.indexOf('function fastTuneGet('),source.indexOf('function fastTunePut('))+';result=fastTuneGet(118);',s);
  assert.equal(s.result.title,'Keeping Up Appearances S04 E03');assert.equal(s.result.url,'https://cdn.invalid/episode.mp4');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': Modern Rerun cached and direct recovery cannot bypass its English-language identity',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,
    iaProgramFailed:()=>false,iaSkipBlocked:()=>false,iaThemeMatches:()=>true};vm.createContext(s);
  const start=source.indexOf('function iaKnownVideoPolicyViolation(');
  vm.runInContext(source.slice(start,source.indexOf('function iaProgramDenyTerms('))+';f={cached:iaCachedProgramAllowed,queue:iaProgramAllowed};',s);
  const ch={num:11,nm:'Modern Rerun TV'},sl={channel:11,program:{}},id='mahabharat-1988-tv-series::01 Raja Bharat.mp4';
  assert.equal(s.f.cached(ch,{id,title:'Mahabharat 1988 TV series (94 episodes)'},sl),false,'old fast-tune/schedule/preload entries must obey the existing server identity gate');
  assert.equal(s.f.queue({identifier:id,title:'Mahabharat · Episode 1'},sl),false,'direct recovery must not reintroduce a rejected source');
  assert.equal(s.f.cached(ch,{id:'benson::S01E01.mp4',title:'Benson',meta:{language:'eng'}},sl),true);
  assert.equal(s.f.queue({identifier:'benson::S01E01.mp4',title:'Benson',language:'eng'},sl),true);
  assert.equal(s.f.queue({identifier:'benson::S01E01.mp4',title:'Benson',language:'fra'},sl),false);
  assert.equal(s.f.cached({num:118,nm:'Blighty'},{id,title:'Mahabharat'},null),true,'this targeted parity repair cannot redefine other stations');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': consuming a pending queue record cannot erase its editorial episode title or year',async()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),id='red-dwarf::VTS_01_3.mp4',item={identifier:id,title:'Red Dwarf · The End',year:1988},cached=[];
  let complete;const resolution=new Promise(resolve=>complete=resolve);
  const s={iaProgramQueues:{'118':[item]},iaQueueKey:ch=>String(ch.num),iaExpectedMedia:()=> 'video',iaProgramFailed:()=>false,
    iaProgramMedia:{},iaProgramPendingAt:{},iaInterstitialMedia:()=>false,fastTuneGet:()=>null,fastTunePut:(channel,media)=>cached.push(media),
    warmIAQueueHead:()=>{},iaReadyShelfSave:()=>{},resolvePlayable:()=>resolution};
  const code=source.slice(source.indexOf('function iaArchiveDirectURL('),source.indexOf('function iaQueueHasReadyProgram('));
  vm.createContext(s);vm.runInContext(code+';warmIAQueue({num:118,nm:"Blighty"},{},false,1);',s);
  const pending=s.iaProgramMedia[id];s.iaProgramQueues['118']=[];
  complete({id,type:'video',url:'https://cdn.invalid/program.mp4'});await pending;
  assert.equal(s.iaProgramMedia[id].title,'Red Dwarf · The End');assert.equal(s.iaProgramMedia[id].year,1988);
  assert.equal(cached[0].title,'Red Dwarf · The End');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': merged Auto Archive keeps both motoring shows and manufacturing identities',async()=>{
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const manifest=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/export-ia-manifest.js'),path.join(root,file)],{encoding:'utf8',maxBuffer:16e6}));
  const rules=manifest.find(x=>x.channel==='227');
  const program=(title,subject)=>({identifier:title,provider:'Internet Archive',title,subject,media:{type:'video',url:'https://archive.org/download/auto/program.mp4',runtime:1800,width:640,height:480}});
  assert.equal(catalogFallbackAllowed(program('Top Gear Series 15','top gear automotive television'),rules),true,'the merger cannot erase the original motoring-program identity');
  assert.equal(catalogFallbackAllowed(program('Inside automobile manufacturing','automobile industry assembly line'),rules),true);
  assert.equal(catalogFallbackAllowed(program('The Tonight Show Jay Leno monologue','late night television talk show'),rules),false);
});

test('a reviewed ready collection file still opens its sibling episodes in standard IA background work',async()=>{
  const f=collectionFixture(),id='cartoon-complete-series';
  const rows=await f.expand({identifier:id+'::Episode 1.mp4',sourceIdentifier:id,fileName:'Episode 1.mp4',title:'Cartoon Complete Series',recoveryVerified:true,
    media:{type:'video',url:'https://archive.org/download/'+id+'/Episode%201.mp4'}});
  assert.equal(rows.length,4,'a starter file is not the whole collection');
  assert.equal(new Set(rows.map(x=>x.identifier)).size,4,'alternate encodes are not extra episodes');
  assert.ok(rows.every(x=>x.media.width>x.media.height&&!/parody/i.test(x.title)));
});

test('metadata-proven unlabelled collections expand outside the four guarded IA lanes',async()=>{
  const f=collectionFixture();
  const rows=await f.expand({identifier:'unlabelled',title:'Cartoon Archive',recoveryVerified:true,
    media:{type:'video',url:'https://archive.org/download/unlabelled/Episode%201.mp4',sourceProgramCount:4}});
  assert.equal(rows.length,4);
});

test('re-expanding a collection sibling uses canonical series identity instead of accumulating the previous episode title',async()=>{
  const f=collectionFixture();f.payload.metadata.title='The Powerpuff Girls';
  f.payload.files=[{name:'Powerpuff Girls - 03,02 - Town and Out - Child Fearing.mp4',format:'h.264',length:1320,width:640,height:480},
    {name:'Powerpuff Girls - 03,06 - Jewel of the Aisle - Super Zeroes.mp4',format:'h.264',length:1320,width:640,height:480},
    {name:'Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff.mp4',format:'h.264',length:1320,width:640,height:480}];
  const old={identifier:'powerpuff-girls-complete-series::old.mp4',sourceIdentifier:'powerpuff-girls-complete-series',fileName:'old.mp4',
    title:'The Powerpuff Girls — Insect Inside / Powerpuff Bluff · Old Episode · Old Episode',subject:'cartoon animation',media:{type:'video',url:'https://archive.org/download/powerpuff/old.mp4',sourceProgramCount:3}};
  const first=await f.expand(old),target=first.find(row=>row.fileName.includes('03,02'));
  assert.ok(target,'the valid sibling file must be expanded');
  assert.equal(target.title,'Powerpuff Girls - 03,02 - Town and Out - Child Fearing');
  const second=await f.expand(target);
  assert.equal(second.find(row=>row.fileName===target.fileName).title,target.title,'expansion is idempotent and cannot append another filename');
  assert.ok(second.every(row=>!row.title.includes('Old Episode')));
});

test('Blighty fallback returns ready media while scheduling collection growth without foreground discovery',async()=>{
  const f=collectionFixture(),pending=[],jobs=[];
  const env={REALSIGNAL_QUEUE:{get:async()=>null,put:async()=>{}},IA_HARVEST_QUEUE:{send:async body=>jobs.push(body)}};
  const request=new Request('https://relay.invalid/ia/queue',{method:'POST',body:JSON.stringify({channel:'118',count:3,rotation:0,queries:['mediatype:movies AND british'],
    themeTerms:['british television'],denyTerms:['podcast','fan made'],mediaTypes:['movies'],minRuntimeSeconds:900})});
  const payload=await(await f.f.getIaQueue(request,new URL(request.url),env,{waitUntil:p=>pending.push(p)})).json();await Promise.all(pending);
  assert.equal(payload.items.length,3);assert.ok(payload.items.every(row=>row.media?.url));
  assert.equal(f.reads.length,0,'metadata discovery stays off the ready playback request');
  assert.equal(jobs.length,1,'returning a fallback cannot permanently disable its background collection harvest');
  assert.ok(jobs[0].seed.lastGoodKey,'background growth must publish back to this editorial family');
});

test('Blighty indexes real episode files across British series rather than only its small starter bank',()=>{
  const f=relay(),rows=f.iaRepairCollectionSeeds('118').filter(row=>row.media);
  assert.ok(rows.length>=250,'the reviewed multi-series manifests must reach playback, not just an audit file');
  for(const show of ['Only Fools and Horses',"Dad's Army",'Yes Minister','The Young Ones','One Foot in the Grave','Red Dwarf','Sherlock'])
    assert.ok(rows.some(row=>row.title.includes(show)),show+' must have actual indexed episodes');
  assert.ok(rows.some(row=>row.fileName==='S1E1 Big brother.mp4'));
  assert.ok(rows.some(row=>row.fileName==='Space 1999 S01E24 The Last Enemy.mp4'||/S01E24/.test(row.fileName)),'later episodes must not disappear');
  assert.ok(rows.every(row=>row.media.runtime>=900&&row.media.width>row.media.height));
  assert.ok(rows.every(row=>!row.media.verifiedAt),'metadata is not live transport evidence');
  assert.ok(rows.every(row=>! /\b(?:bonus|interview|extra|extras|commentary)\b/i.test(row.fileName)));
  assert.equal(new Set(rows.map(row=>row.identifier)).size,rows.length);
});

test('Blighty cannot hide newly indexed British episodes behind an older shallow durable catalog',async()=>{
  const f=collectionFixture(),pending=[],rows=Array.from({length:12},(_,i)=>({identifier:'old-keeping-up::Episode '+i+'.mp4',sourceIdentifier:'old-keeping-up',fileName:'Episode '+i+'.mp4',
    title:'Keeping Up Appearances · Episode '+i,subject:'british television british sitcom',media:{type:'video',url:'https://archive.org/download/old/'+i+'.mp4',runtime:1740,width:640,height:480}}));
  const bonus={...rows[0],identifier:'bbc-red-dwarf::Red Dwarf VI Disc 2 (Bonus Material)8.mp4',sourceIdentifier:'bbc-red-dwarf',fileName:'Red Dwarf VI Disc 2 (Bonus Material)8.mp4',title:'Red Dwarf · Bonus Material'};
  const family={channel:'118',items:rows.slice(0,3),candidateItems:rows.concat(bonus),candidates:13,ready:3};
  const env={REALSIGNAL_QUEUE:{get:async key=>key.includes(':last-good:')?family:null,put:async()=>{}},IA_HARVEST_QUEUE:{send:async()=>{}}};
  const request=new Request('https://relay.invalid/ia/queue',{method:'POST',body:JSON.stringify({channel:'118',count:3,rotation:1,queries:['mediatype:movies AND british'],
    themeTerms:['british television'],denyTerms:['podcast'],mediaTypes:['movies'],minRuntimeSeconds:900})});
  const payload=await(await f.f.getIaQueue(request,new URL(request.url),env,{waitUntil:p=>pending.push(p)})).json();await Promise.all(pending);
  assert.ok(payload.candidateItems.some(row=>row.sourceIdentifier==='Onlyfoolsandhorsesseries'),'a healthy old cache cannot erase new reviewed episodes');
  assert.ok(payload.candidateItems.some(row=>row.identifier===rows[0].identifier),'previous approved programs are retained');
  assert.ok(!payload.candidateItems.some(row=>row.identifier===bonus.identifier),'old shared DVD extras cannot bypass the corrected background admission');
  assert.equal(new Set(payload.items.map(row=>f.f.queueTitleFamily(row))).size,3,'one series cannot occupy the entire ready shelf');
  assert.equal(family.candidateItems.length,13,'the shared input is not mutated');
  assert.equal(f.reads.length,0,'merged metadata is already indexed, not fetched during the tune');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': cached recursive episode titles display the actual descriptive filename without changing editorial labels',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={};vm.createContext(s);
  vm.runInContext(source.slice(source.indexOf('function iaDisplayTitle('),source.indexOf('function adoptIAResolvedMedia(')),s);
  const id='powerpuff-girls-complete-series::Powerpuff Girls - 03,02 - Town and Out - Child Fearing.mp4';
  const old='The Powerpuff Girls — Insect Inside / Powerpuff Bluff · Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff · Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff · Powerpuff Girls - 03,02 - Town and Out - Child Fearing';
  assert.equal(s.iaDisplayTitle({identifier:id,title:old},{nm:'Modern Cartoons'}),'Powerpuff Girls - 03,02 - Town and Out - Child Fearing');
  const different='Powerpuff Girls · Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff · Powerpuff Girls - 03,02 - Town and Out - Child Fearing';
  assert.equal(s.iaDisplayTitle({identifier:id,title:different},{nm:'Modern Cartoons'}),'Powerpuff Girls - 03,02 - Town and Out - Child Fearing','different accumulated fragments are still a recursive filename chain');
  assert.equal(s.iaDisplayTitle({identifier:'bbc-red-dwarf::VTS_01_3.mp4',title:'Red Dwarf · The End'},{nm:'Blighty'}),'Red Dwarf · The End');
  assert.equal(s.iaDisplayTitle({identifier:'something',title:'Arena · David Bowie · Five Years'},{nm:'Blighty'}),'Arena · David Bowie · Five Years');
  assert.equal(s.iaDisplayTitle({identifier:'bbc-arena::BBC Arena.mp4',title:'Arena · David Bowie · Five Years'},{nm:'Blighty'}),'Arena · David Bowie · Five Years','a generic filename is not permission to erase editorial subtitles');
});

test('Blighty collection growth rejects DVD extras but retains an actual British interview documentary',async()=>{
  const f=collectionFixture();f.payload.metadata.title='British Television Collection';
  f.payload.files=[{name:'Red Dwarf VI Disc 1 (Main Feature)5.mp4',format:'h.264',length:1800,width:640,height:480},
    {name:'Red Dwarf VI Disc 2 (Bonus Material)8.mp4',format:'h.264',length:1753,width:640,height:480},
    {name:'BBC Omnibus - Interview with a Playwright.mp4',format:'h.264',length:2700,width:640,height:480}];
  const item={identifier:'british-collection',title:'British Television Complete Collection',subject:'british television',media:{type:'video',url:'https://archive.org/download/british/start.mp4',sourceProgramCount:3}};
  const rows=await f.f.expandSeedArchiveContainers({items:[item],candidateItems:[item]},'https://relay.invalid',{isIaBackground:true,waitUntil:()=>{}},'118',['british television'],[],[],['movies'],1,0,96);
  assert.ok(rows.some(row=>row.fileName==='Red Dwarf VI Disc 1 (Main Feature)5.mp4'));
  assert.ok(rows.some(row=>row.fileName==='BBC Omnibus - Interview with a Playwright.mp4'),'do not blanket-ban editorial documentaries');
  assert.ok(!rows.some(row=>row.fileName.includes('Bonus Material')),'background expansion must apply the reviewed DVD-extra exclusion');
});

test('a healthy background collection manifest is not aborted by the old 2.8-second tune-sized deadline',async()=>{
  const f=collectionFixture({delayMs:3100});
  const rows=await f.expand({identifier:'cartoon-complete-series',title:'Cartoon Complete Series',recoveryVerified:true,
    media:{type:'video',url:'https://archive.org/download/cartoons/1.mp4',sourceProgramCount:4}});
  assert.equal(rows.length,4,'slow metadata must complete off the foreground path rather than repeating an abort forever');
});

test('ordinary ready single-program recovery does not trigger background metadata scans',async()=>{
  const f=collectionFixture();
  assert.equal((await f.expand({identifier:'single-program',title:'Cartoon Special',recoveryVerified:true,
    media:{type:'video',url:'https://archive.org/download/single/program.mp4'}})).length,0);
  assert.equal(f.reads.length,0);
});

test('new standard collection children cannot smuggle foreign audio or unknown geometry through parent tags',async()=>{
  const f=collectionFixture();
  f.payload.files.push({name:'Episode 5.mp4',format:'h.264',length:1320,width:640,height:480,language:'hin'},
    {name:'Episode 6.mp4',format:'h.264',length:1320});
  const rows=await f.expand({identifier:'cartoon-complete-series',title:'Cartoon Complete Series',recoveryVerified:true,
    media:{type:'video',url:'https://archive.org/download/cartoons/1.mp4',sourceProgramCount:6}});
  assert.equal(rows.length,4,'only landscape English original programs reach the expanded catalog');
});

for(const [channel,season] of [['704','Christmas'],['705','Halloween'],['706','Thanksgiving'],['707','Christmas'],['708','Halloween'],['709','Thanksgiving']])test(channel+': holiday sibling discovery requires real seasonal identity, not the starter label',async()=>{
  const f=collectionFixture();f.payload.metadata.title='Sitcom Complete Series';
  f.payload.files.push({name:season+' Special.mp4',format:'h.264',length:1320,width:640,height:480});
  const starter={identifier:'sitcom::Episode 1.mp4',sourceIdentifier:'sitcom',fileName:'Episode 1.mp4',title:season+(Number(channel)<=706?' Cartoon':' TV')+' Episode Collection',
    recoveryVerified:true,media:{type:'video',url:'https://archive.org/download/sitcom/1.mp4',sourceProgramCount:5}};
  const rows=await f.f.expandSeedArchiveContainers({items:[starter],candidateItems:[starter]},'https://relay.invalid',
    {isIaBackground:true,waitUntil:()=>{}},channel,[season.toLowerCase()],[],[],['movies'],1,0,96);
  assert.equal(rows.length,1,'one seasonal episode cannot relabel the entire series');
  assert.equal(rows[0].fileName,season+' Special.mp4');
});

test('a metadata-proven singleton cannot starve a real collection of the parent budget',async()=>{
  const f=collectionFixture({metadataFor:(url,payload)=>url.endsWith('/one-episode')?{...payload,files:payload.files.slice(0,1)}:payload});
  const item=(id,title,count)=>({identifier:id,title,recoveryVerified:true,media:{type:'video',url:'https://archive.org/download/'+id+'/1.mp4',sourceProgramCount:count}});
  const items=[item('one-episode','Cartoon Episode One',1),item('unlabelled','Cartoon Archive',4)];
  const rows=await f.f.expandSeedArchiveContainers({items,candidateItems:items},'https://relay.invalid',
    {isIaBackground:true,waitUntil:()=>{}},'153',['cartoon'],['parody'],[],['movies'],1,0,96);
  assert.equal(rows.length,4,'the proven collection gets the bounded parent read');
  assert.ok(f.reads.every(url=>!url.endsWith('/one-episode')),'known single programs do not spend the collection budget');
});

test('a complete short-cartoon collection is not a singleton just because only one file exceeds fifteen minutes',async()=>{
  const f=collectionFixture();f.payload.files.slice(1,4).forEach(file=>{file.length=420;});
  const starter={identifier:'looney-tunes-complete',title:'Looney Tunes Complete Collection',subject:'classic cartoons theatrical cartoon golden age animation',recoveryVerified:true,
    media:{type:'video',url:'https://archive.org/download/cartoons/1.mp4',sourceProgramCount:1}};
  const rows=await f.f.expandSeedArchiveContainers({items:[starter],candidateItems:[starter]},'https://relay.invalid',
    {isIaBackground:true,waitUntil:()=>{}},'150',['cartoon'],['parody'],[],['movies'],1,0,96);
  assert.equal(rows.length,4,'the existing program-count evidence counts long files, not complete short cartoons');
});

test('standard video metadata preserves distinct program-count evidence for later sibling discovery',async()=>{
  const f=collectionFixture();
  const media=await f.f.queuePlayable('unlabelled','https://relay.invalid',{isIaBackground:true,waitUntil:()=>{}},['movies']);
  assert.equal(media.sourceProgramCount,4,'count landscape originals, not derivatives, portraits, or fan movies');
});

test('a standard cold tune uses its deeper genre-clean family without awaiting Archive discovery',async()=>{
  const f=collectionFixture(),pending=[],jobs=[];
  const rows=Array.from({length:600},(_,i)=>({identifier:'family-'+i,title:'Cartoon television episode '+i,subject:'cartoon animation',
    media:{type:'video',url:'https://archive.org/download/family/'+i+'.mp4',runtime:1320,width:640,height:480}}));
  const contaminated={...rows[0],identifier:'wrong',title:'Cartoon drawing podcast tutorial',subject:'cartoon animation'};
  const foreign={...rows[0],identifier:'foreign',media:{...rows[0].media,language:'dan'}};
  const unknownGeometry={...rows[0],identifier:'unknown-geometry',media:{...rows[0].media,width:0,height:0}};
  const env={REALSIGNAL_QUEUE:{get:async key=>key.includes(':last-good:')?{items:rows.slice(0,3),candidateItems:[contaminated,foreign,unknownGeometry,...rows]}:null,put:async()=>{}},
    IA_HARVEST_QUEUE:{send:async job=>{jobs.push(job);}}};
  const request=new Request('https://relay.invalid/ia/queue',{method:'POST',body:JSON.stringify({channel:'153',count:3,rotation:0,
    queries:['mediatype:movies AND cartoon'],themeTerms:['cartoon'],denyTerms:['podcast','tutorial'],mediaTypes:['movies'],minRuntimeSeconds:900})});
  const response=await f.f.getIaQueue(request,new URL(request.url),env,{waitUntil:p=>pending.push(p)});
  const payload=await response.json();await Promise.all(pending);
  assert.ok(payload.candidateItems.some(x=>x.identifier==='family-17'),'a deep family must not be replaced by the emergency opening');
  assert.ok(payload.candidateItems.every(x=>x.identifier!=='wrong'),'stale cached genre contamination stays excluded');
  assert.ok(payload.candidateItems.every(x=>!['foreign','unknown-geometry'].includes(x.identifier)),'cold cached families pass file-level language and geometry admission');
  assert.ok(payload.candidateItems.length<=512,'deep family recovery must not serialize its entire catalog on a tune');
  assert.ok(payload.catalogDepth>=600,'retain the full family; approved recovery programs may add further depth');
  assert.equal(rows.length,600,'the private family remains deep');
  assert.equal(payload.items.length,3);assert.equal(f.reads.length,0,'Archive discovery cannot block a cold tune');
  assert.ok(jobs.length>0,'deepening continues off the playback path');
});

for(const [channel,show] of [['11','Benson'],['118','Keeping Up Appearances']])test(channel+': cached openings respect viewer history before a shared played write arrives',async()=>{
  const f=collectionFixture(),pending=[],writes=[];
  const rows=Array.from({length:24},(_,i)=>({identifier:'series-'+channel+'::Episode '+i+'.mp4',sourceIdentifier:'series-'+channel,fileName:'Episode '+i+'.mp4',
    title:show+' · Episode '+i,subject:'television sitcom british television',media:{type:'video',url:'https://archive.org/download/series/'+i+'.mp4',runtime:1320,width:640,height:480}}));
  const family={channel,items:rows.slice(0,3),candidateItems:rows,candidates:rows.length,ready:3};
  const env={REALSIGNAL_QUEUE:{get:async key=>key.includes(':last-good:')?family:null,put:async(key,value)=>writes.push({key,value})},IA_HARVEST_QUEUE:{send:async()=>{}}};
  const rules={channel,count:3,rotation:1,queries:['mediatype:movies AND television'],themeTerms:[show.toLowerCase()],denyTerms:['podcast'],mediaTypes:['movies'],minRuntimeSeconds:900};
  const get=async recent=>{const request=new Request('https://relay.invalid/ia/queue',{method:'POST',body:JSON.stringify({...rules,viewerRecentIds:recent})});
    return(await f.f.getIaQueue(request,new URL(request.url),env,{waitUntil:p=>pending.push(p)})).json();};
  const heard=[],selected=new Set();
  for(let i=0;i<12;i++){const payload=await get(heard),first=payload.items[0];assert.ok(first?.media?.url);assert.ok(!selected.has(first.identifier),'a rapid repeat cannot be excused by a stale shared ledger: '+JSON.stringify({round:i,id:first.identifier,depth:payload.candidates,freshness:payload.freshness}));heard.push(first.identifier);selected.add(first.identifier);}
  const other=await get([]);assert.equal(other.items[0].identifier,[...selected][0],'another viewer is not suppressed by private request history');
  await Promise.all(pending);assert.equal(f.reads.length,0,'cached rotation does not discover Archive on the tune path');
  assert.ok(writes.every(row=>!row.key.includes('freshness')),'queue selections do not become globally watched records');
  assert.equal(family.candidateItems.length,24,'viewer suppression never deletes collection depth');
});

test('a rotation-zero edge hit returns the viewer-adjusted order without mutating the shared cached shelf',async()=>{
  const pending=[],rows=Array.from({length:3},(_,i)=>({identifier:'benson::Episode '+i+'.mp4',sourceIdentifier:'benson',fileName:'Episode '+i+'.mp4',title:'Benson · Episode '+i,
    media:{type:'video',url:'https://archive.org/download/benson/'+i+'.mp4',runtime:1320,width:640,height:480}}));
  const original={channel:'11',items:rows,candidateItems:rows,candidates:3,ready:3};
  const f=relay({crypto:require('node:crypto').webcrypto,fetch:async()=>{throw Error('foreground discovery must not run');},
    caches:{default:{match:async()=>Response.json(original),put:async()=>{},delete:async()=>true}}});
  const env={REALSIGNAL_QUEUE:{get:async()=>null,put:async()=>{}},IA_HARVEST_QUEUE:{send:async()=>{}}};
  const get=async history=>{const request=new Request('https://relay.invalid/ia/queue',{method:'POST',body:JSON.stringify({channel:'11',count:3,rotation:0,viewerRecentIds:history,
      queries:['mediatype:movies AND benson'],themeTerms:['benson'],mediaTypes:['movies'],minRuntimeSeconds:900})});
    return(await f.getIaQueue(request,new URL(request.url),env,{waitUntil:p=>pending.push(p)})).json();};
  const payload=await get([rows[0].identifier]);
  assert.equal(payload.items[0].identifier,rows[1].identifier,'the raw cached response cannot restore a watched opening');
  assert.equal(payload.items.length,3,'all programs remain available after exhaustion');
  assert.equal((await get([])).items[0].identifier,rows[0].identifier,'personal ordering does not overwrite the shared cache');
  await Promise.all(pending);
});

for(const channel of ['11','118'])test(channel+': other viewers cannot exhaust this viewer\'s unseen collection catalog',async()=>{
  const f=collectionFixture(),pending=[],rows=Array.from({length:24},(_,i)=>({identifier:'benson::Episode '+i+'.mp4',sourceIdentifier:'benson',fileName:'Episode '+i+'.mp4',title:'Benson · Episode '+i,
    media:{type:'video',url:'https://archive.org/download/benson/'+i+'.mp4',runtime:1320,width:640,height:480}}));
  const family={channel,items:rows.slice(0,3),candidateItems:rows,candidates:24,ready:3};
  const globalHistory={items:rows.map(row=>({id:row.identifier}))};
  const env={REALSIGNAL_QUEUE:{get:async key=>key.includes(':last-good:')?family:key.includes('freshness')?globalHistory:null,put:async()=>{}},IA_HARVEST_QUEUE:{send:async()=>{}}};
  const heard=[];
  for(let i=0;i<12;i++){
    const request=new Request('https://relay.invalid/ia/queue',{method:'POST',body:JSON.stringify({channel,count:3,rotation:1,viewerRecentIds:heard,
      queries:['mediatype:movies AND benson'],themeTerms:['benson'],mediaTypes:['movies'],minRuntimeSeconds:900})});
    const payload=await(await f.f.getIaQueue(request,new URL(request.url),env,{waitUntil:p=>pending.push(p)})).json();
    assert.ok(!heard.includes(payload.items[0].identifier),'shared full-catalog history is not personal exhaustion at rotation '+i);
    heard.push(payload.items[0].identifier);
  }
  await Promise.all(pending);assert.equal(family.candidateItems.length,24);
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': only played/skipped programs enter the persistent viewer history sent on queue requests',async()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),values=new Map(),packets=[];
  const s={console,Response,Date,Promise,iaSessionId:()=> 'viewer-test',IA_API_BASE:'https://api.invalid/api/v3',IA_RELAY_BASE:'https://relay.invalid/ia',
    store:{get:(key,fallback)=>structuredClone(values.has(key)?values.get(key):fallback),set:(key,value)=>values.set(key,structuredClone(value))},
    fetch:async(url,options)=>{const body=JSON.parse(options.body);packets.push({url,body});if(url.endsWith('/played'))throw Error('temporary report outage');return Response.json({items:[{identifier:'queued-not-watched',media:{url:'https://archive.org/download/q/1.mp4'}}]});}};
  vm.createContext(s);vm.runInContext(source.slice(source.indexOf('async function iaQueueFetch('),source.indexOf('function iaRelaySearchURL(')),s);
  s.iaReportPlayed({num:11},{id:'old-parent-id',meta:{identifier:'series::Episode 1.mp4'}},'visible');
  s.iaReportPlayed({num:11},{id:'series::Episode 2.mp4'},'skipped');
  s.iaReportPlayed({num:118},{id:'other-station::Episode.mp4'},'visible');
  s.iaReportPlayed({num:11},{id:'advertisement',isAd:true},'visible');
  await s.iaQueueFetch({channel:'11',count:3});await s.iaQueueFetch({channel:'11',count:3});
  const sent=packets.filter(x=>x.url.endsWith('/queue'));
  assert.deepEqual(Array.from(sent[0].body.viewerRecentIds||[]),['series::Episode 1.mp4','series::Episode 2.mp4'],'network-report failure cannot erase local viewing history');
  assert.deepEqual(sent[1].body.viewerRecentIds,sent[0].body.viewerRecentIds,'preload/queue preparation is not watching');
  assert.deepEqual(sent[1].body.recentIds,sent[0].body.viewerRecentIds,'D1 fallback also receives viewer exclusions');
  const legacyAt=Date.now();values.set('iaSkipLedger',{'11':[{id:'legacy-skip',at:legacyAt},{id:'expired-skip',at:legacyAt-7*3600e3}]});
  await s.iaQueueFetch({channel:'11'});
  const legacy=packets.at(-1).body.viewerRecentIds;assert.ok(legacy.includes('legacy-skip'));assert.ok(!legacy.includes('expired-skip'));
  for(let i=0;i<260;i++)s.iaReportPlayed({num:11},{id:'watched-'+i},'visible');
  await s.iaQueueFetch({channel:'11'});const bounded=packets.at(-1).body.viewerRecentIds;
  assert.equal(bounded.length,256);assert.equal(bounded[0],'watched-4');assert.equal(bounded.at(-1),'watched-259');
});

test('freshness preserves a full accepted long file identity without banning its episode siblings',()=>{
  const f=relay(),prefix='collection-'+ 'a'.repeat(230);
  const item=(name)=>({identifier:prefix+'::'+name,title:'Benson · '+name,media:{type:'video',url:'https://archive.org/download/series/'+name}});
  const a=item('Episode 1.mp4'),b=item('Episode 2.mp4');
  const result=f.applyIaFreshness({channel:'11',items:[a],candidateItems:[a,b],ready:1},[{id:a.identifier}],1);
  assert.equal(result.payload.items[0].identifier,b.identifier,'a long filename must stay excluded while the sibling remains unseen');
});

test('a constrained rotated fallback plays its last unseen program before permitting repeats',()=>{
  const f=relay(),a={identifier:'a',media:{type:'video',url:'https://archive.org/download/a/a.mp4'}},b={identifier:'b',media:{type:'video',url:'https://archive.org/download/b/b.mp4'}};
  const result=f.applyIaFreshness({channel:'11',items:[a,b],candidateItems:[a,b],ready:2,fallback:true},['a'],2);
  assert.equal(result.payload.items[0].identifier,'b');assert.equal(result.payload.items.length,2,'exhaustion cannot manufacture No Signal');
});

test('deep family harvest jobs stay within queue limits without deleting the durable catalog',async()=>{
  const f=collectionFixture(),pending=[],jobs=[];
  const rows=Array.from({length:180},(_,i)=>({identifier:'episode-'+i,title:'Cartoon episode '+i,description:'é'.repeat(1000),
    media:{type:'video',url:'https://archive.org/download/family/'+i+'.mp4',runtime:1320,width:640,height:480}}));
  const seed={lastGoodKey:'existing-durable-family',items:rows.slice(0,3),candidateItems:rows,candidates:rows.length,minRuntimeSeconds:900};
  const env={IA_HARVEST_QUEUE:{send:async job=>{assert.ok(Buffer.byteLength(JSON.stringify(job))<=120000,'queue envelope must fit the platform limit');jobs.push(job);}}};
  f.f.scheduleIaExpansion(seed,['mediatype:movies AND cartoon'],[],'153',['cartoon'],[],[],['movies'],1,{},3,3072,
    'https://relay.invalid',new Request('https://relay.invalid/cache/key'),'shared-cache-key',env,{waitUntil:p=>pending.push(p)},0,true);
  await Promise.all(pending);assert.equal(jobs.length,1,'oversized seeds cannot silently disable background discovery');
  assert.equal(jobs[0].seed.lastGoodKey,seed.lastGoodKey,'consumer reloads the complete existing family');
  assert.equal(seed.candidateItems.length,180,'the original catalog is not truncated');
});

test('a cold cached family cannot substitute declared non-English or unproven video for recovery',async()=>{
  const f=collectionFixture(),pending=[];
  const rows=Array.from({length:12},(_,i)=>({identifier:'foreign-'+i,title:'Cartoon television episode '+i,subject:'cartoon animation',
    media:{type:'video',url:'https://archive.org/download/foreign/'+i+'.mp4',runtime:1320,width:640,height:480,language:'dan'}}));
  const env={REALSIGNAL_QUEUE:{get:async key=>key.includes(':last-good:')?{items:rows.slice(0,3),candidateItems:rows}:null,put:async()=>{}},
    IA_HARVEST_QUEUE:{send:async()=>{}}};
  const request=new Request('https://relay.invalid/ia/queue',{method:'POST',body:JSON.stringify({channel:'153',count:3,rotation:0,
    queries:['mediatype:movies AND cartoon'],themeTerms:['cartoon'],denyTerms:['podcast','tutorial'],mediaTypes:['movies'],minRuntimeSeconds:900})});
  const payload=await(await f.f.getIaQueue(request,new URL(request.url),env,{waitUntil:p=>pending.push(p)})).json();
  await Promise.all(pending);assert.equal(payload.items.length,3,'approved recovery remains available');
  assert.ok(payload.items.every(x=>!x.identifier.startsWith('foreign-')),'cached depth is not permission for foreign audio');
});

test('queued harvest continuations use the same bounded family-reference envelope',async()=>{
  const f=collectionFixture(),jobs=[];let acknowledged=false,retried=false;
  const rows=Array.from({length:180},(_,i)=>({identifier:'episode-'+i,title:'Cartoon episode '+i,description:'é'.repeat(1000),
    media:{type:'video',url:'https://archive.org/download/family/'+i+'.mp4',runtime:1320,width:640,height:480}}));
  const seed={lastGoodKey:'existing-durable-family',items:rows.slice(0,3),candidateItems:rows,candidates:rows.length,minRuntimeSeconds:900};
  let persisted=false;
  f.f.setHarvest(async(...args)=>{args[16].waitUntil(new Promise(resolve=>setTimeout(()=>{persisted=true;resolve();},5)));return {...seed,backgroundHarvestCursor:1};});
  const env={IA_HARVEST_QUEUE:{send:async job=>{assert.equal(persisted,true,'persist the standard family before sending a compact continuation');assert.ok(Buffer.byteLength(JSON.stringify(job))<=120000);jobs.push(job);}}};
  await f.f.consume({messages:[{body:{type:'ia-catalog-harvest',version:1,seed,channel:'153',count:3,candidateCount:3072,forceDiscovery:true},
    ack(){acknowledged=true;},retry(){retried=true;}}]},env,{waitUntil:()=>{}});
  assert.equal(retried,false,'an oversized continuation must not turn successful background work into a retry loop');
  assert.equal(acknowledged,true);assert.equal(jobs.length,1);assert.equal(jobs[0].seed.lastGoodKey,seed.lastGoodKey);
  assert.equal(jobs[0].seed.backgroundHarvestCursor,1,'compaction must retain the page cursor');
  assert.equal(seed.candidateItems.length,180,'bounded transport does not shrink the private catalog');
});
test('broad stations retain deep, interleaved file-level recovery without waiting for collection discovery',()=>{
  const f=relay();
  for(const channel of ['10','150']){
    const rows=f.orderedIaEmergencySeeds(channel,0).filter(row=>row.media?.fileName);
    assert.ok(rows.length>=96,channel+' must expose a deep reviewed file bank on cold recovery');
    assert.ok(new Set(rows.map(row=>row.sourceIdentifier)).size>=6,'multiple series must remain available');
    assert.ok(new Set(rows.slice(0,6).map(row=>row.sourceIdentifier)).size>=4,'recovery must interleave shows');
  }
});
test('a guest appearance does not change the episode series identity',()=>{
  const f=relay();
  assert.equal(f.queueTitleFamily({title:'56 10 07 The Jack Benny Program S07E02 George Burns Spike Jones Show'}),'jack benny');
  assert.equal(f.queueTitleFamily({title:'Burns and Allen · Jack Benny visits'}),'burns and allen');
});
test('reviewed collection files retain metadata-provided direct Archive delivery and the canonical fallback',()=>{
  const f=relay();
  for(const channel of ['10','150'])for(const row of f.iaRepairCollectionSeeds(channel).filter(item=>item.media)){
    const url=new URL(row.media.url);
    assert.match(url.hostname,/^(?:ia|dn)[a-z0-9-]+\.(?:us\.)?archive\.org$/i);
    assert.ok(decodeURIComponent(url.pathname).endsWith('/'+row.sourceIdentifier+'/'+row.fileName));
    assert.ok(row.media.alts.some(alt=>alt.startsWith('https://archive.org/download/')));
  }
});
test('a Danish-labelled cartoon is rejected even if its language metadata incorrectly says English',async()=>{
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const raw={identifier:'spider-man::episode.mp4',title:'Spider-Man The Animated Series S01E01 Night Of The Lizard - Dansk tale',language:'eng',
    media:{type:'video',url:'https://archive.org/download/spider-man/episode.mp4',runtime:1320,width:640,height:480,verification:'transport',verifiedAt:Date.now()}};
  assert.equal(qualifyIaFileRecord(raw,{channel:'150',iaRepair:true}).accepted,false);
  assert.equal(qualifyIaFileRecord({...raw,title:'Cartoon Network Noods bumper compilation'},{channel:'150',iaRepair:true}).accepted,false);
});

test('cartoon discovery cannot turn stock animation loops or explicitly dubbed editions into television',async()=>{
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const f=relay();
  for(const title of ['002 Purple Neon Light Hearts Flying Heart Background Video Loop Animated Background','Merrie Melodies I Wanna Be a Sailor 1937 HD PT-BR']){
    const row={identifier:'cartoon-loop::feature.mp4',title,language:'eng',media:{type:'video',url:'https://archive.org/download/cartoon-loop/feature.mp4',runtime:1320,width:640,height:480,verification:'transport',verifiedAt:Date.now()}};
    assert.equal(qualifyIaFileRecord(row,{channel:'150',iaRepair:true}).accepted,false,title);
    assert.equal(f.stationGate('150',row),false,title+' relay discovery gate');
  }
});

test('alternate cartoon cuts cannot be rediscovered as fresh episodes',async()=>{
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js'),f=relay();
  for(const edition of ['ALTERNATE VERSION','ATTENTION STUDY','1984 VERSION','BANNED AND UNCENSORED VERSION']){
    const row={identifier:'fat-albert-72::episode.mp4',sourceIdentifier:'fat-albert-72',title:'Fat Albert · Shuttered Window ('+edition+')',language:'eng',media:{type:'video',url:'https://archive.org/download/fat-albert-72/episode.mp4',runtime:1320,width:640,height:480,verification:'transport',verifiedAt:Date.now()}};
    assert.equal(qualifyIaFileRecord(row,{channel:'150',iaRepair:true}).accepted,false,edition);
    assert.equal(f.stationGate('150',row),false,edition+' discovery');
  }
});

test('a redundant file index does not make the same cartoon episode fresh again',async()=>{
  const {normalizeIaFileRecord}=await import('../ia_file_contract.js'),f=relay();
  for(const [a,b] of [['02 Episode 2, Make Way For The Multi-Men.mp4','Episode 2, Make Way For The Multi-Men.ia.mp4'],['07 Episode, 7 The Mini-Man Menace.mp4','Episode, 7 The Mini-Man Menace.ia.mp4']]){
    assert.equal(f.archiveEpisodeKey({name:a}),f.archiveEpisodeKey({name:b}));
    const row=fileName=>normalizeIaFileRecord({sourceIdentifier:'josie_and_the_pussycats_in_outer_space',media:{fileName}});
    assert.equal(row(a).logicalId,row(b).logicalId);
    assert.equal(row(a).fileName,a,'deduplication must not rewrite the actual media filename');
  }
  assert.notEqual(f.archiveEpisodeKey({name:'02 Episode 1, The Pilot.mp4'}),f.archiveEpisodeKey({name:'Episode 1, The Pilot.mp4'}),'different numbering is not evidence of one file');
});

test('classic cartoons has a broad full-program bank, not eight familiar series in different encodes',()=>{
  const rows=relay().iaRepairCollectionSeeds('150'), files=rows.filter(row=>row.media);
  assert.ok(files.length>=600,'at least 600 metadata-qualified full programs behind the small ready shelf');
  assert.ok(new Set(files.map(row=>row.seriesId)).size>=28,'at least 28 distinct cartoon families');
  for(const show of ['Underdog','George of the Jungle','Wacky Races','Space Ghost and Dino Boy','Hong Kong Phooey','Jabberjaw','Fat Albert','The Archie Show','Super Friends','Aquaman']){
    assert.ok(files.some(row=>row.title.startsWith(show+' ·')),show+' must reach the file bank');
  }
  assert.ok(files.some(row=>/Fat Albert/.test(row.title)&&/S[3-9]E/i.test(row.fileName)),'later seasons must be indexed too');
  assert.ok(files.every(row=>row.media.runtime>=120&&row.media.width>row.media.height));
  assert.ok(files.every(row=>!/alex.toth|simplicity|s00e|bonus|featurette/i.test(row.fileName)),'extras are not cartoons');
  const josie=files.filter(row=>row.sourceIdentifier==='josie_and_the_pussycats_in_outer_space');
  assert.equal(josie.length,16,'alternate encodes/renamed derivatives cannot inflate episode depth');
  const tom=files.filter(row=>/Tom and Jerry/.test(row.title));
  assert.ok(tom.length>=2);assert.equal(new Set(tom.map(row=>row.seriesId)).size,1,'editions of one show share a family');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': broad cartoon discovery actually reaches new collection and series rails',()=>{
  const manifest=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/export-ia-manifest.js'),path.join(root,file)],{encoding:'utf8',maxBuffer:16e6}));
  const rules=manifest.find(row=>row.channel==='150');
  assert.match(rules.queries[0],/identifier:/,'exact collections must not depend on a misleading recent upload year');
  for(const term of ['underdog','wacky races','fat albert','hong kong phooey','jabberjaw','super friends']){
    assert.ok(rules.themeTerms.includes(term),term+' must be discoverable, not merely a static starter');
    assert.ok(rules.requiredTitleTerms.includes(term));
  }
  assert.match(rules.queries[0],/theres-no-need-to-fear-underdog-is-here/);
  assert.match(rules.queries[0],/fat-albert-72/);
  assert.equal(rules.diversity.maxPerFamily,1);
});

test('every reviewed cartoon file survives the exact client/API genre contract after transport admission',async()=>{
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const manifest=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/export-ia-manifest.js')],{encoding:'utf8',maxBuffer:16e6}));
  const rules={...manifest.find(row=>row.channel==='150'),iaRepair:true};
  for(const row of relay().iaRepairCollectionSeeds('150').filter(row=>row.media)){
    assert.equal(catalogFallbackAllowed({...row,media:{...row.media,verifiedAt:Date.now(),verification:'transport'}},rules),true,row.title);
  }
});

test('complete theatrical cartoons are programs, while clips and unreviewed short uploads are not',async()=>{
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js'),f=relay();
  const program={identifier:'looney-tunes-complete::Duck Amuck.mp4',sourceIdentifier:'looney-tunes-complete',title:'Looney Tunes · Duck Amuck',language:'eng',
    media:{type:'video',url:'https://archive.org/download/looney-tunes-complete/Duck%20Amuck.mp4',fileName:'Duck Amuck.mp4',runtime:420,width:640,height:480,verification:'transport',verifiedAt:Date.now()}};
  assert.equal(qualifyIaFileRecord(program,{channel:'150',minRuntimeSeconds:120}).accepted,true,'a whole seven-minute theatrical cartoon belongs on television');
  assert.equal(f.iaEffectiveVideoMinRuntimeSeconds('150',['movies'],120),120);
  assert.equal(qualifyIaFileRecord(program,{channel:'10',minRuntimeSeconds:120}).accepted,false,'regular TV keeps its long-form floor');
  for(const raw of [
    {...program,title:'Looney Tunes · fan-made parody'},
    {...program,title:'Looney Tunes · episode trailer'},
    {...program,media:{...program.media,width:480,height:640}},
    {...program,sourceIdentifier:'random-cartoon-upload',identifier:'random-cartoon-upload::clip.mp4'},
    {...program,media:{...program.media,runtime:20}},
  ])assert.equal(qualifyIaFileRecord(raw,{channel:'150',minRuntimeSeconds:120}).accepted,false,raw.title+' / '+raw.identifier);
});

test('a reviewed landscape theatrical-shorts collection is not mistaken for a vertical Shorts upload',async()=>{
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const row={identifier:'looney-tunes-complete::episode.mp4',sourceIdentifier:'looney-tunes-complete',title:'Looney Tunes · Complete Theatrical Shorts · Duck Amuck',language:'eng',
    media:{type:'video',url:'https://archive.org/download/looney-tunes-complete/episode.mp4',runtime:420,width:640,height:480,verification:'transport',verifiedAt:Date.now()}};
  assert.equal(qualifyIaFileRecord(row,{channel:'150',minRuntimeSeconds:120}).accepted,true);
  assert.equal(qualifyIaFileRecord({...row,title:'Looney Tunes #shorts TikTok clip'},{channel:'150',minRuntimeSeconds:120}).accepted,false);
});

test('Goofy original How To cartoons are not instructional-video contamination',async()=>{
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const manifest=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/export-ia-manifest.js')],{encoding:'utf8',maxBuffer:16e6}));
  const rules={...manifest.find(row=>row.channel==='150'),iaRepair:true};
  const row={identifier:'WDTWaveTwo_TheCompleteGoofy::How to Swim.mp4',sourceIdentifier:'WDTWaveTwo_TheCompleteGoofy',title:'Goofy · How to Swim (1942)',language:'eng',
    media:{type:'video',url:'https://archive.org/download/WDTWaveTwo_TheCompleteGoofy/How%20to%20Swim.mp4',runtime:420,width:640,height:480,verification:'transport',verifiedAt:Date.now()}};
  assert.equal(catalogFallbackAllowed(row,rules),true,'a verified original cartoon title is not a tutorial');
  assert.equal(catalogFallbackAllowed({...row,title:'Goofy drawing tutorial lecture',media:{...row.media,runtime:1800}},rules),false,'actual instructional contamination stays out');
});

test('the expanded cartoon bank includes short originals and many full-length series without dropping prior depth',()=>{
  const files=relay().iaRepairCollectionSeeds('150').filter(row=>row.media);
  assert.ok(files.length>=2500,'thousands of indexed programs behind the small ready shelf');
  assert.ok(files.filter(row=>row.media.runtime<900).length>=1000,'complete shorts must really be indexed');
  for(const show of ['Sabrina','Jonny Quest','Secret Squirrel','The Beatles','Rocky and Bullwinkle','Looney Tunes','Popeye','Felix the Cat'])
    assert.ok(files.some(row=>row.title.includes(show)),show+' must reach the actual file bank');
  assert.ok(files.every(row=>row.media.runtime>=120&&row.media.width>row.media.height));
});

test('reviewed DVD introductions are extras, not complete short cartoons',async()=>{
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js'),f=relay();
  const row={identifier:'WDTWaveTwo_TheCompleteGoofy::01. Introduction with Leonard Maltin (Disk 1).mp4',sourceIdentifier:'WDTWaveTwo_TheCompleteGoofy',title:'Goofy · Introduction with Leonard Maltin',language:'eng',
    media:{type:'video',url:'https://archive.org/download/WDTWaveTwo_TheCompleteGoofy/01.mp4',runtime:137.05,width:640,height:480,verification:'transport',verifiedAt:Date.now()}};
  assert.equal(f.stationGate('150',row),false);
  assert.equal(qualifyIaFileRecord(row,{channel:'150',minRuntimeSeconds:120}).accepted,false);
  assert.ok(!f.iaRepairCollectionSeeds('150').some(item=>/introduction with leonard maltin/i.test(item.fileName||'')));
});

test('commercial-edition suffixes do not manufacture fresh cartoon episodes',async()=>{
  const {normalizeIaFileRecord}=await import('../ia_file_contract.js'),f=relay();
  const a='70. samantha.mp4',b='70. samantha [comm].ia.mp4';
  assert.equal(f.archiveEpisodeKey({name:a}),f.archiveEpisodeKey({name:b}));
  const row=fileName=>normalizeIaFileRecord({sourceIdentifier:'tennessee-tuxedo-season-3',media:{fileName}});
  assert.equal(row(a).logicalId,row(b).logicalId);
  assert.equal(row(b).fileName,b,'the real delivery filename remains untouched');
});

test('static metadata derivation is reused across tunes without claiming live transport verification',()=>{
  const f=relay(),first=f.iaRepairCollectionSeeds('150');
  assert.equal(f.iaRepairCollectionSeeds('150'),first,'derive the large reviewed catalog once per isolate');
  assert.ok(first.filter(item=>item.media).every(item=>!item.media.verifiedAt));
});

test('reusing normalized editorial terms preserves scores and notices policy edits',()=>{
  const f=relay(),terms=['Looney-Tunes','animation'],doc={title:'Looney Tunes',subject:'animation'};
  assert.equal(f.themeScore(doc,terms),6);
  terms[0]='Popeye';assert.equal(f.themeScore(doc,terms),2);
  terms.push('looney tunes');assert.equal(f.themeScore(doc,terms),6);
  const deny=['tutorial'];assert.equal(f.matchesDeny(doc,deny),false);
  deny.push('looney tunes');assert.equal(f.matchesDeny(doc,deny),true);
});

test('the deep repair catalog stays behind a bounded, moving wire window, not a multi-megabyte tune response',()=>{
  const f=relay(),rows=f.iaRepairCollectionSeeds('150').filter(item=>item.media);
  const chosen=rows.at(-1),payload={items:[chosen],candidateItems:rows,ready:1,candidates:rows.length};
  const a=f.iaRepairPublicCatalog(payload,{rotation:0,count:3}),b=f.iaRepairPublicCatalog(payload,{rotation:40,count:3});
  assert.equal(payload.candidateItems.length,rows.length,'the durable catalog is not truncated');
  assert.ok(a.candidateItems.length<=512&&b.candidateItems.length<=512);
  assert.ok(a.candidateItems.some(row=>row.identifier===chosen.identifier),'a late ready item must survive');
  assert.equal(a.catalogDepth,rows.length);
  assert.ok(b.candidateItems.some(row=>!a.candidateItems.some(old=>old.identifier===row.identifier)),'later tunes expose unseen regions');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': deeper exact-parent rails remain bounded and cover the reviewed collections',()=>{
  const manifest=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/export-ia-manifest.js'),path.join(root,file)],{encoding:'utf8',maxBuffer:16e6}));
  const rules=manifest.find(row=>row.channel==='150'),queries=rules.queries;
  assert.ok(queries.length<=8&&queries.every(query=>query.length<=3600),'larger catalogs cannot produce rejected queue requests');
  for(const id of ['looney-tunes-complete','roger-ramjet','show-1_20260614','clue.club','sabrina-the-teenage-witch-1970'])
    assert.ok(queries.some(query=>query.includes('"'+id+'"')),id+' must be reached through exact-parent discovery');
});
