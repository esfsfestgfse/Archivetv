const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
function relay(metadata = {}, mediaStatus = 206, redirectedUrl = '', fetchOverride) {
  const sandbox = { console, URL, URLSearchParams, Request, Response, Headers, AbortController, AbortSignal,
    TextEncoder, TextDecoder, Date, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    caches: { default: { match: async () => undefined, put: async () => {} } },
    fetch: async url => {
      if (fetchOverride) return fetchOverride(url);
      if (/archive\.org\/metadata\//.test(String(url))) return Response.json(metadata);
      assert.match(String(url), /archive\.org\/download\//);
      const response = new Response('x', { status: mediaStatus, headers: { 'content-type': 'video/mp4' } });
      if (redirectedUrl) Object.defineProperty(response, 'url', { value: redirectedUrl });
      return response;
    } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8').replace('export default', 'const worker =') +
    '\nglobalThis.contract={expandArchiveContainer,iaRuntimeAllowed, iaStationQualityGate, queuePlayable, iaPlayableIdentity, hydrateIaQueue, qualifyIaQueueResponse, verifyIaTransport,worker,holidaySeeds:IA_LONG_TAIL_EXPANSIONS["705"],recoverySeeds:orderedIaEmergencySeeds,collectionSeeds:iaRepairCollectionSeeds};', sandbox);
  return sandbox.contract;
}
const verified = { identifier: 'series::episode.mp4', sourceIdentifier: 'series', title: 'Family sitcom episode',
  language: 'eng', media: { type: 'video', url: 'https://archive.org/download/series/episode.mp4',
    runtime: 1320, width: 640, height: 480, verifiedAt: Date.now(), verification: 'transport' } };

test('reviewed editorial admission rejects the reproduced contamination in every IA surface',async()=>{
  const {iaReviewedFileAllowed,qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const checks=[
    ['209',{identifier:'powell-filmography::Peeping Tom 1960.mp4',title:'Powell and Pressburger: The Complete Filmography · Peeping Tom 1960',subject:'One of Our Aircraft Is Missing; aviation',genreVerified:true},false],
    ['209',{identifier:'powell-filmography::49th Parallel.mp4',title:'Powell and Pressburger: The Complete Filmography · 49th Parallel',subject:'One of Our Aircraft Is Missing',genreVerified:true},false],
    ['209',{identifier:'powell-filmography::One of Our Aircraft Is Missing.mp4',title:'Powell and Pressburger: The Complete Filmography · One of Our Aircraft Is Missing',subject:'filmography'},true],
    ['209',{identifier:'aviation-documentaries::Episode 2.mp4',title:'Aviation Documentary Collection · Episode 2',subject:'aviation'},true],
    ['209',{identifier:'aviation-documentaries::Peeping Tom.mp4',title:'Aviation Documentary Collection · Peeping Tom',subject:'aviation'},false],
    ['209',{identifier:'army-air-forces-newsreels::Reel 1.mp4',title:'US Army Air Forces Newsreels · Reel 1'},true],
    ['209',{identifier:'generic::clip.mp4',title:'Airport Commission Meeting - October 2026',subject:'aircraft aviation'},false],
    ['209',{identifier:'MIT6_832S09',title:'MIT 6.832 Underactuated Robotics, Spring 2009',subject:'aircraft; swimming; flapping flight'},false],
    ['209',{identifier:'cstmaah_000052::cstmaah_000052_access.mp4',title:'Winning His Wings'},true],
    ['209',{identifier:'200594_Hawaii_at_Your_Wingtip::200594_Hawaii_at_Your_Wingtip_master.intros.mp4',title:'Hawaii at Your Wingtip'},true],
    ['209',{identifier:'the-big-plane-trip-b-1-t-00::THE_BIG_PLANE_TRIP-B1_t00.ia.mp4',title:'The Big Plane Trip'},true],
    ['209',{identifier:'200594_Hawaii_at_Your_Wingtip::Unrelated Movie.mp4',title:'Unrelated Movie'},false],
    ['202',{identifier:'powell-filmography::Peeping Tom.mp4',title:'Peeping Tom 1960'},true],
    ['234',{identifier:'natural-disaster-survival',title:'The Incredibly Weird History of Natural Disaster Survival',subject:'Roblox History Video Essay'},false],
    ['234',{id:'generic-stream',title:'Natural Disaster Stream',meta:{subject:'TwitchVod;video;'}},false],
    ['234',{identifier:'real-rescue',title:'Flood Rescue Documentary',subject:'natural disaster',description:'Related links include a Minecraft game.'},true],
    ['234',{identifier:'nsd-roblox',title:'The Incredibly Weird History of Natural Disaster Survival',subject:'Roblox History Video Essay'},false],
    ['234',{identifier:'twitch-vod-v2263888410',title:'becoming monkey | STREAM NATURAL DISASTER | !gg',subject:'TwitchVod;video;'},false],
    ['234',{identifier:'game-footage',title:'Natural Disaster Minecraft Gameplay',subject:'disaster'},false],
    ['234',{identifier:'literacy',title:'Literacy Gap Problem Needs to Be Approached Like a Natural Disaster',subject:'natural disaster'},false],
    ['158',{identifier:'IndonesianPuppetShow',title:'Indonesian Shadow Puppet Show, 1994',subject:'puppet show',language:'eng'},false],
    ['158',{identifier:'09252011-puppet-show-gods-word-ccrs',title:'09252011 Puppet Show Gods Word CCRS',subject:'Word of God Bible Puppets'},false],
    ['158',{identifier:'community-hajj-show',title:'100 Silver Coins For One Dead Mouse: A Hajj Story (Eid al-Adha Childrens Puppet Show)',subject:'puppet show'},false],
    ['158',{identifier:'new-community-performance',title:'Community Puppet Show',subject:'puppets'},false],
    ['158',{identifier:'new-tv-program',title:'A New Puppet Show',subject:'childrens television series'},true],
    ['158',{identifier:'colby-1996',title:'Colbys Clubhouse Puppet Show 1996'},true],
    ['158',{identifier:'muppet-show',title:'The Muppet Show: Puppet Show Special'},true],
    ['158',{identifier:'sesame-street',title:'Sesame Street: Quiet Time',subject:'puppet show'},true],
    ['206',{identifier:'community-hajj-show',title:'100 Silver Coins For One Dead Mouse: A Hajj Story (Eid al-Adha Childrens Puppet Show)',subject:'puppet show'},true],
    ['206',{identifier:'IndonesianPuppetShow',title:'Indonesian Shadow Puppet Show, 1994',subject:'puppet show'},true],
    ['234',{identifier:'youtube-S9l3YWYYcSU',title:'GREENLAND | Gerard Butler "John Garrity" On-set Interview',subject:'disaster film natural disaster'},false],
    ['234',{identifier:'youtube-KuOu6XpafK4',title:'GREENLAND | Ric Roman Waugh "Director" On-set Interview',subject:'natural disaster'},false],
    ['234',{identifier:'youtube-qC1Y8Ekk168',title:'GREENLAND | Morena Baccarin "Allison" On-set Interview',subject:'natural disaster'},false],
    ['234',{identifier:'movie-promo',title:'Twister Movie Trailer',subject:'disaster'},false],
    ['234',{identifier:'greenland-science',title:'Greenland Ice Sheet Documentary',subject:'natural disaster climate'},true],
    ['234',{identifier:'katrina-interviews',title:'Hurricane Katrina Eyewitness Interviews',subject:'natural disaster'},true],
    ['234',{identifier:'northridge',title:'25th Anniversary of the Northridge Earthquake',subject:'disaster documentary'},true],
    ['202',{identifier:'movie-interview',title:'Movie Cast Interview'},true],
    ['10',{identifier:'13-american-tv-with-mitchell-hadley-mary-tyler-moore',title:'13 American TV With Mitchell Hadley Mary Tyler Moore',subject:'Mary Tyler Moore sitcom'},false],
    ['10',{identifier:'tv-discussion',title:'Mary Tyler Moore: Television History Discussion',subject:'classic television'},false],
    ['10',{identifier:'tv-essay',title:'Video Essay About Classic Television: The Addams Family',subject:'classic television'},false],
    ['10',{identifier:'mary-tyler-moore::S01E01.mp4',title:'The Mary Tyler Moore Show · Love Is All Around',subject:'sitcom'},true],
    ['10',{identifier:'benson::S01E01.mp4',title:'Benson · Change',description:'A discussion about politics in the governor office.',subject:'sitcom'},true],
    ['10',{identifier:'dick-van-dyke::The Interview.mp4',title:'The Dick Van Dyke Show · The Interview',subject:'sitcom'},true],
    ['202',{identifier:'tv-history-discussion',title:'Television History Discussion'},true],
    ['54',{identifier:'WBAL_20100213_230000_11_News',title:'11 News',subject:'NASCAR auto racing'},false],
    ['54',{identifier:'motor-view-01',title:'Motor-View 01 (UHD): Cool Cars & Guitar Grooves — 4K Slide Show',subject:'auto racing'},false],
    ['54',{identifier:'berrycrepe-2026',title:'BerryCrepe — I LOST MY VOICE HELP ME FIND IT | yap -> watching videos -> nascar or gamba idk',subject:'NASCAR'},false],
    ['54',{identifier:'halicki-trilogy',title:'Hi-Def Halicki: Gone In Sixty Seconds HD Trilogy (1974) (Restored 1080p)',subject:'car racing'},false],
    ['54',{identifier:'race-1990',title:'1990 Daytona 500 Full Race',subject:'NASCAR auto racing'},true],
    ['54',{identifier:'racing-magazine',title:'NASCAR Race Review',subject:'motorsport'},true],
    ['54',{identifier:'driven-2001',title:'Driven (2001) - 4K AI Upscale',subject:'Indycar racing movie'},false],
    ['54',{identifier:'driven-to-win',title:'Driven to Win — NASCAR Full Race Documentary',subject:'motorsport'},true],
    ['225',{identifier:'hyperbolic-matthew-broussard-full-comedy-special',title:'Matthew Broussard — Hyperbolic',subject:'stand-up comedy'},false],
    ['225',{identifier:'peter-kay-live',title:'Peter Kay Live',subject:'stand-up comedy'},false],
    ['225',{identifier:'black-baseball',title:'Black Baseball In Living Color The Story Of The Negro Leagues',subject:'Black comedy'},false],
    ['225',{identifier:'prince-tape',title:'Prince Tape All Full Shows Oprah Winfrey The Today Show The Chris Rock Show on HBO',subject:'Black comedy'},false],
    ['225',{identifier:'chris-rock-will-smith-commentary',title:'CHRIS Rock Will SMITH Who Wants To See PAST The BS Puppet Show',subject:'Black stand-up comedy'},false],
    ['225',{identifier:'2022-03-28_h3podcast_Will_Smith_Chris_Rock_Academy_Awards_H3TV_29',title:'Will Smith, Chris Rock & Academy Awards - H3TV #29',subject:'h3podcast'},false],
    ['225',{identifier:'howard-stern-show-on-e-1997-chris-rock',title:'Howard Stern Show on E! (1997) Chris Rock',subject:'Howard Stern Show,1997,Chris Rock'},false],
    ['225',{identifier:'img-2360_202109',title:'Chris Rock Meets Colt 40 Feinberg',subject:'Howard Stern,The Howard Stern Show,Chris Rock,Celebrity'},false],
    ['225',{identifier:'stored-interview',title:'Chris Rock Meets Colt 40 Feinberg',meta:{subject:'The Howard Stern Show'}},false],
    ['225',{identifier:'conan-damon-wayans-episode',title:"Late Night With Conan O' Brien With Damon Wayans, Gabrielle Reece, Kurt Anderson",subject:'Damon Wayans,comedy'},false],
    ['225',{identifier:'chris-rock-show-episode',title:'The Chris Rock Show — Full Episode',subject:'Black sketch comedy'},true],
    ['225',{identifier:'chris-rock-show-howard-guest',title:'The Chris Rock Show — Howard Stern Guest Appearance',subject:'Black sketch comedy'},true],
    ['225',{identifier:'in-living-color-season-2',title:'In Living Color — Full Episode',subject:'Black sketch comedy'},true],
    ['225',{identifier:'richard-pryor-live',title:'Richard Pryor Live',subject:'stand-up comedy'},true],
    ['225',{identifier:'sinbad_afrosbellbottoms',title:'Sinbad: Afros & Bellbottoms',subject:'stand-up comedy'},true],
    ['225',{identifier:'InLivingColor::Episode2',title:'Episode 2',media:{sourceTitle:'In Living Color'}},true],
    ['225',{identifier:'new-comedian-full-special',title:'New Comedian Full Special',subject:'Black stand-up comedy'},true],
    ['225',{id:'new-comedian-full-special',title:'New Comedian Full Special',meta:{subject:'Black stand-up comedy'}},true],
    ['905',{identifier:'477-Robert-Johnson-Kavsaktaki-Adam-17-Agustos-2026',title:'477- Robert Johnson Kavşaktaki Adam',type:'audio',language:'tur',description:'Rüzgara bırakılmış sesler...'},false],
    ['905',{identifier:'blues-podcast',title:'Robert Johnson Podcast',subject:'Delta Blues',type:'audio'},false],
    ['905',{identifier:'blues-podcasts',title:'Blues Podcasts',type:'audio'},false],
    ['905',{id:'hosted-program',title:'Robert Johnson Story',type:'audio',meta:{subject:'podcast'}},false],
    ['905',{identifier:'MuddyWaters-FolkSinger',title:'Muddy Waters — Folk Singer',type:'audio',subject:'blues'},true],
    ['905',{identifier:'instrumental-blues',title:'Instrumental Blues Guitar',type:'audio',language:'und',subject:'blues'},true],
    ['905',{identifier:'talking-blues',title:'Talking Blues',type:'audio',language:'fra',subject:'blues music'},true],
    ['905',{identifier:'PinkFloyd-LiveBootlegSampler::119TheFinalCut_RadioAdvert.mp3',title:'Pink Floyd - Live Bootleg Sampler · The Final Cut Radio Advert',type:'audio'},false],
    ['905',{identifier:'blues-radio-concert',title:'Muddy Waters — Radio Session Concert',type:'audio',subject:'blues music'},true],
    ['202',{identifier:'peter-kay-live',title:'Peter Kay Live',subject:'stand-up comedy'},true],
  ];
  const gates=[iaReviewedFileAllowed];
  for(const file of ['the_dial_desktop.html','the_dial_mobile.html','afterglow_ais_relay_worker.js']){
    const source=fs.readFileSync(path.join(root,file),'utf8'),scope={};vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function iaReviewedFileAllowed('),source.indexOf('function iaHuntingAllowed(')),scope);gates.push(scope.iaReviewedFileAllowed);
  }
  for(const [channel,item,allowed] of checks){
    for(const gate of gates)assert.equal(gate(item,channel),allowed,channel+' '+item.title);
    if(!allowed){assert.equal(catalogFallbackAllowed(item,{channel}),false,'stored '+item.title);const f=relay();assert.equal(f.iaStationQualityGate(channel,item),false,'relay '+item.title);}
  }
  const bad=checks.find(x=>x[0]==='905'&&!x[2])[1];
  assert.equal(qualifyIaFileRecord({...bad,media:{type:'audio',url:'https://archive.org/download/'+bad.identifier+'/episode.mp3'}},{channel:'905',mediaTypes:['audio']}).accepted,false,'audio qualification cannot bypass channel policy');
});

test('fresh mixed-filmography expansion admits the aviation sibling, not its inherited subjects',async()=>{
  const names=['Peeping Tom 1960.mp4','49th Parallel.mp4','One of Our Aircraft Is Missing.mp4'];
  const f=relay({metadata:{language:'eng'},files:names.map(name=>({name,format:'h.264',length:5400,width:1280,height:720}))});
  const expanded=await f.expandArchiveContainer({identifier:'powell-filmography',title:'Powell and Pressburger: The Complete Filmography',subject:'One of Our Aircraft Is Missing; aircraft'},'https://relay.invalid',null,20,0);
  assert.equal(expanded.length,3);
  assert.deepEqual(Array.from(expanded.filter(item=>f.iaStationQualityGate('209',item)),item=>item.identifier),['powell-filmography::One of Our Aircraft Is Missing.mp4']);
});

test('stale Blues audio is rejected before local playback or Cast publication',async()=>{
  for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
    const source=fs.readFileSync(path.join(root,file),'utf8');let cast=0;
    const scope={window:{__rsCastIsConnected:()=>true,__rsCastPublishMedia(){cast++;return true;}},token:1,curVideo:null,screenArea:{},audioScreen:{classList:{add(){}}},killMedia(){},hideOv(){},hideBuffer(){},clearStall(){},setSig(){},setCurItem(){},showNow(){},bug:{classList:{remove(){}}}};vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function iaReviewedFileAllowed('),source.indexOf('function iaHuntingAllowed(')),scope);
    vm.runInContext(source.slice(source.indexOf('function playFile('),source.indexOf('function showNow(')),scope);
    const bad={id:'477-Robert-Johnson-Kavsaktaki-Adam-17-Agustos-2026',title:'Robert Johnson Kavşaktaki Adam',type:'audio',url:'https://archive.org/download/blues/episode.mp3'};
    assert.equal(await scope.playFile(bad,{num:905,audio:true},{},1,false),false,file);assert.equal(cast,0);
    assert.equal(await scope.playFile({...bad,id:'MuddyWaters-FolkSinger',title:'Muddy Waters Folk Singer'},{num:905,audio:true},{},1,false),true,file);assert.equal(cast,1);
  }
});

test('transport admission preserves the resolved same-file Archive CDN, not its redirect', async () => {
  const url = 'https://ia800001.us.archive.org/12/items/series/episode.mp4';
  const media = { ...verified.media, sourceIdentifier: 'series', fileName: 'episode.mp4', verification: undefined, verifiedAt: 0 };
  const result = await relay({}, 206, url).verifyIaTransport(media);
  assert.equal(result.url, url);
  assert.ok(result.alts.includes(media.url));
  for (const redirected of ['https://evil.invalid/12/items/series/episode.mp4', 'https://ia800001.us.archive.org/12/items/series/other.mp4']) {
    assert.equal(await relay({}, 206, redirected).verifyIaTransport(media), null, 'a redirect cannot change provider or episode');
  }
});

test('a reviewed modern game-show bank reaches transport admission before any cold Archive search',async()=>{
  let searches=0;
  const f=relay({},206,'',async url=>{
    if(/advancedsearch|services\/search/.test(String(url))){searches++;return Response.json({response:{docs:[],numFound:0}});}
    if(/\/metadata\//.test(String(url)))return Response.json({metadata:{},files:[]});
    return new Response('x',{status:206,headers:{'content-type':'video/mp4'}});
  });
  const env={REALSIGNAL_QUEUE:{get:async()=>null,put:async()=>{}},IA_HARVEST_QUEUE:{send:async()=>{}}},pending=[];
  const response=await f.worker.fetch(new Request('https://relay.invalid/ia/queue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel:'22',iaRepair:true,count:3,queries:['mediatype:movies AND title:game'],themeTerms:['game show'],mediaTypes:['movies']})}),env,{waitUntil:p=>pending.push(p)});
  const payload=await response.json();
  assert.equal(payload.ready,3);
  assert.equal(searches,0,'existing file-level depth must not wait behind synchronous discovery');
  await Promise.all(pending);
});

test('the selected child runtime overrides the longer parent runtime', () => {
  assert.equal(relay().iaRuntimeAllowed({ runtime: 1800, media: { type: 'video', runtime: 120 } }, 900), false);
});
test('missing explicit episode must not silently substitute the first file', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: [{ name: 'other.mp4', format: 'h.264', length: 1320, width: 640, height: 480 }] });
  assert.equal(await f.queuePlayable('series::missing.mp4', 'https://relay.invalid', null, ['movies']), null);
});

// The browser resolver must obey the same selected-child contract as the relay.
// Otherwise a stale holiday filename plays the first cartoon with the wrong title.
for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  function clientResolver(files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const metadata = { metadata: { language: 'eng' }, dir: '/0/items/halloween',
      d1: 'ia800001.us.archive.org', files };
    const scope = { IOS: false, console, iaRelayMetadataURL: id => id,
      iaFastJSON: async () => metadata, iaFastProxy: async () => metadata,
      firstOk: jobs => jobs[0].run(), withTO: promise => promise, nlog() {} };
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function mArr('), source.indexOf('/* NASA video */')), scope);
    return scope.resolvePlayable;
  }
  test(file + ': a missing selected cartoon cannot become Skeleton Dance', async () => {
    const resolve = clientResolver([{ name: 'The Skeleton Dance.ia.mp4', format: 'h.264' }]);
    assert.equal(await resolve('halloween::The Haunted House.mp4', 'video'), null);
  });
  test(file + ': selected file alternates stay on that cartoon, not its siblings', async () => {
    const resolve = clientResolver([
      { name: 'The Skeleton Dance.ia.mp4', format: 'h.264' },
      { name: 'The Haunted House.mp4', format: 'h.264' },
    ]);
    const selected = await resolve('halloween::The Haunted House.mp4', 'video');
    assert.ok([selected.url, ...selected.alts].every(url => decodeURIComponent(url).endsWith('/The Haunted House.mp4')));
    assert.equal(await resolve('halloween::The Haunted House.mp4', 'audio'), null);
    assert.ok(await resolve('halloween', 'video'), 'unexpanded parent discovery still works');
  });
}

test('saved playback cannot pair one cartoon identity with a different Archive file', async () => {
  const { iaReviewedFileAllowed } = await import('../ia_file_contract.js');
  const bad = { id: 'halloween::The Haunted House.mp4', title: 'The Haunted House', type: 'video',
    url: 'https://ia800001.us.archive.org/0/items/halloween/The%20Skeleton%20Dance.ia.mp4' };
  assert.equal(iaReviewedFileAllowed(bad, '705'), false);
  assert.equal(iaReviewedFileAllowed({ ...bad, url: 'https://archive.org/download/halloween/The%20Haunted%20House.ia.mp4' }, '705'), true);
  assert.equal(iaReviewedFileAllowed({ ...bad, url: 'https://archive.org/download/different/The%20Haunted%20House.mp4' }, '705'), false);
  for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html', 'afterglow_ais_relay_worker.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8'), scope = {};
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function iaReviewedFileAllowed('), source.indexOf('function iaHuntingAllowed(')), scope);
    assert.equal(scope.iaReviewedFileAllowed(bad, '705'), false, file);
    assert.equal(scope.iaReviewedFileAllowed({ ...bad, url: 'https://archive.org/download/halloween/The%20Haunted%20House.mp4' }, '705'), true, file);
  }
});

test('selected-file validation respects legacy episode aliases and same-program encodings', async () => {
  const {iaReviewedFileAllowed}=await import('../ia_file_contract.js');
  for(const item of [
    {identifier:'series::S1E2',fileName:'Season 1/02.mp4',media:{url:'https://archive.org/download/series/Season%201/02.mp4'}},
    {identifier:'series::1995',media:{url:'https://archive.org/download/series/Live%20in%201995.mp4'}},
    {identifier:'series::Episode 1.mp4',media:{url:'https://archive.org/download/series/Episode%201_512kb.mp4'}},
    {identifier:'series::Episode%2fPart.mp4',fileName:'Episode%2fPart.mp4',media:{url:'https://archive.org/download/series/Episode%252fPart.mp4'}},
  ])assert.equal(iaReviewedFileAllowed(item,'705'),true,item.identifier);
  assert.equal(iaReviewedFileAllowed({identifier:'series::S1E2',fileName:'Season 1/02.mp4',media:{url:'https://archive.org/download/series/Season%201/01.mp4'}},'705'),false);
});

test('old Halloween playlist ordinals cannot re-enter through persisted catalogs', async () => {
  const {iaReviewedFileAllowed}=await import('../ia_file_contract.js');
  const parent='halloween-cartoon-collection_20231022';
  const row=name=>({identifier:parent+'::'+name,fileName:name,media:{url:'https://archive.org/download/'+parent+'/'+encodeURIComponent(name)}});
  assert.equal(iaReviewedFileAllowed(row('26-1953 - UPA - The Tell Tale Heart.mp4'),'705'),false);
  assert.equal(iaReviewedFileAllowed(row('1953 - UPA - The Tell Tale Heart.mp4'),'705'),true);
  assert.equal(iaReviewedFileAllowed(row('01-1929 - Disney -The Skeleton Dance.ia.mp4'),'705'),true,'an actually listed ordinal derivative remains valid');
  assert.equal(iaReviewedFileAllowed({identifier:'other::26-1953 - Cartoon.mp4',media:{url:'https://archive.org/download/other/26-1953%20-%20Cartoon.mp4'}},'705'),true,'no blanket filename ban');
});

test('closeout collection repairs retain the exact Mr. Rhodes and nested Colonial Naturalist files', () => {
  const f=relay(),rhodes=f.recoverySeeds('11',0).find(x=>x.identifier.includes('mr.-rhodes-s-1e-08')&&x.identifier.includes('s1e06'));
  assert.equal(rhodes.fileName,'Mr. Rhodes- s1e06 - Huge - Mr Rhodes - 1.06.ia.mp4');
  for(const reel of [1,2]){
    const row=f.recoverySeeds('217',0).find(x=>x.sourceIdentifier==='colonialnaturalist'&&x.title==='Colonial Naturalist · Reel '+reel);
    assert.equal(row.fileName,'colonialnaturalist/colonialnaturalistreel'+reel+'.mp4');
    assert.ok(decodeURIComponent(row.media.url).endsWith('/colonialnaturalist/colonialnaturalistreel'+reel+'.mp4'));
  }
});

test('missing collection paths cannot survive in a persisted queue while corrected siblings remain admitted', async () => {
  const {iaReviewedFileAllowed}=await import('../ia_file_contract.js');
  for(const [source,oldFile,newFile]of [
    ['mr.-rhodes-s-1e-08-looking-for-mrs.-goodbar-episode-8','Mr Rhodes- s1e06 - Huge - Mr Rhodes - 1.06.ia.mp4','Mr. Rhodes- s1e06 - Huge - Mr Rhodes - 1.06.ia.mp4'],
    ['colonialnaturalist','colonialnaturalistreel1.mp4','colonialnaturalist/colonialnaturalistreel1.mp4'],
    ['colonialnaturalist','colonialnaturalistreel2.mp4','colonialnaturalist/colonialnaturalistreel2.mp4'],
  ]){
    const item=file=>({identifier:source+'::'+file,fileName:file,media:{url:'https://archive.org/download/'+source+'/'+file.split('/').map(encodeURIComponent).join('/')}});
    assert.equal(iaReviewedFileAllowed(item(oldFile),'11'),false,oldFile);
    assert.equal(iaReviewedFileAllowed(item(newFile),'11'),true,newFile);
  }
});

test('Range and Field has complete long-form competition and field programs beyond its old eight-item window', () => {
  const f=relay(),rows=f.collectionSeeds('83').filter(x=>x.media);
  assert.ok(rows.length>=23,'add measured long-form depth instead of padding the existing shelf');
  const olympics=rows.filter(x=>x.sourceIdentifier==='2012_London_Olympics_Archery');
  assert.equal(olympics.length,13,'full sessions only; hold out the two split morning-session files');
  assert.ok(rows.some(x=>x.sourceIdentifier==='trap-and-skeet-shooting-full-vhs'));
  assert.ok(rows.every(x=>x.media.runtime>=900&&x.media.width>x.media.height&&f.iaStationQualityGate('83',x)));
  assert.equal(new Set(rows.map(x=>x.identifier)).size,rows.length,'alternate encodings do not inflate depth');
});

test('Halloween recovery records address the real cartoon files, not stale playlist ordinals', () => {
  const seeds = relay().holidaySeeds;
  for (const [title, expected] of [
    ['Mickey Mouse · The Haunted House', '1929 - Mickey Mouse -The Haunted House.mp4'],
    ['Disney · The Old Mill', '1937 - Disney - The Old Mill.mp4'],
    ['Pink Panther · Pink Panic', '1967 - Pink Panther - Pink Panic.mp4'],
  ]) {
    const row = seeds.find(item => item.title === title);
    assert.equal(row.fileName, expected, title);
    assert.equal(row.identifier, 'halloween-cartoon-collection_20231022::' + expected);
    assert.ok(decodeURIComponent(row.media.url).endsWith('/' + expected));
  }
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': Halloween cache repair preserves other shelves and watched history', () => {
  const source=fs.readFileSync(path.join(root,file),'utf8'), data={iaReadyShelves:{'705':{items:['stale']},'704':{items:['keep']}},iaSeen:['watched']};
  const scope={store:{get:(key,fallback)=>data[key]??fallback,set:(key,value)=>{data[key]=value;}},
    fastTuneCache:{'705':{pl:'wrong-cartoon'},'704':{pl:'keep'}},schedMap:{'Halloween Cartoons':{id:'stale'},'Classic TV':{id:'keep'}},iaReadyShelves:null};
  vm.createContext(scope);
  const start=source.indexOf('function iaMigrateHalloweenFiles('),end=source.indexOf('\niaMigrateHalloweenFiles();',start);
  if(start>=0&&end>start)vm.runInContext(source.slice(start,end),scope);
  if(scope.iaMigrateHalloweenFiles)scope.iaMigrateHalloweenFiles();
  assert.equal(scope.fastTuneCache['705'],undefined);assert.ok(scope.fastTuneCache['704']);
  assert.equal(data.iaReadyShelves['705'],undefined);assert.ok(data.iaReadyShelves['704']);
  assert.equal(scope.schedMap['Halloween Cartoons'],undefined);assert.ok(scope.schedMap['Classic TV']);
  assert.deepEqual(data.iaSeen,['watched']);
  scope.fastTuneCache['705']={pl:'new-correct-cartoon'};scope.iaMigrateHalloweenFiles();
  assert.equal(scope.fastTuneCache['705'].pl,'new-correct-cartoon','migration runs once, not every tune');
});
test('file hydration carries exact source, runtime, geometry, language and provenance', async () => {
  const f = relay({ metadata: { language: 'eng', licenseurl: 'https://creativecommons.org/licenses/by/4.0/' },
    files: [{ name: 'episode.mp4', format: 'h.264', length: 1320, width: 640, height: 480 }] });
  const media = await f.queuePlayable('series::episode.mp4', 'https://relay.invalid', null, ['movies']);
  assert.equal(media.runtime, 1320); assert.equal(media.fileName, 'episode.mp4');
  assert.equal(media.sourceIdentifier, 'series'); assert.equal(media.language, 'eng');
  assert.equal(media.sourceUrl, 'https://archive.org/details/series');
  assert.match(media.rights, /creativecommons/); assert.ok(media.metadataVerifiedAt > 0);
});
test('TV qualification rejects known portraits, unresolved metadata, shorts and stale/failed verification', async () => {
  const { catalogFallbackAllowed } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const rules = { iaRepair: true, channel: '10', minRuntimeSeconds: 900, mediaTypes: ['movies'] };
  assert.equal(catalogFallbackAllowed(verified, rules), true);
  for (const media of [
    { ...verified.media, width: 480, height: 640 },
    { ...verified.media, width: 0, height: 0 },
    { ...verified.media, runtime: 120 },
    { ...verified.media, runtime: 0 },
    { ...verified.media, verifiedAt: Date.now() - 2 * 86400_000 },
    { ...verified.media, verification: 'failed' },
  ]) assert.equal(catalogFallbackAllowed({ ...verified, runtime: 1800, media }, rules), false);
  assert.equal(catalogFallbackAllowed({ ...verified, language: 'jpn' }, rules), false);
  assert.equal(catalogFallbackAllowed({ ...verified, language: 'jpn', media: { ...verified.media, runtime: 4000 } }, { ...rules, channel: '106' }), true, 'international stations keep their language contract');
  assert.equal(catalogFallbackAllowed({ identifier: 'radio', media: { type: 'audio', url: 'https://archive.org/download/radio/program.mp3', verification: 'transport', verifiedAt: Date.now() } }, { ...rules, channel: '920', mediaTypes: ['audio'] }), true);
});
test('strict hot-shelf hydration performs transport validation and preserves enriched candidates', async () => {
  const metadata = { metadata: { language: 'eng' }, files: [{ name: 'episode.mp4', format: 'h.264', length: 1320, width: 640, height: 480 }] };
  const ctx = { iaRepair: true, waitUntil: promise => promise };
  const candidate = { identifier: 'series::episode.mp4', title: 'Full sitcom episode' };
  const good = await relay(metadata).hydrateIaQueue({ candidateItems: [candidate], minRuntimeSeconds: 900 }, 1, 'https://relay.invalid', ctx, ['movies']);
  assert.equal(good.ready, 1); assert.equal(good.items[0].media.verification, 'transport');
  assert.ok(good.items[0].media.verifiedAt > 0);
  assert.equal(good.candidateItems[0].media.runtime, 1320);
  const dead = await relay(metadata, 403).hydrateIaQueue({ candidateItems: [candidate], minRuntimeSeconds: 900 }, 1, 'https://relay.invalid', ctx, ['movies']);
  assert.equal(dead.ready, 0, 'metadata or a plausible URL does not prove a playable transport');
});

test('cached and emergency URL-only shelves are qualified at the relay response boundary', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: [{ name: 'episode.mp4', format: 'h.264', length: 1320, width: 640, height: 480 }] });
  const raw = { channel: '10', ready: 1, items: [{ identifier: 'series::episode.mp4', title: 'Full sitcom episode', media: { type: 'video', url: 'https://archive.org/download/series/episode.mp4' } }] };
  const result = await f.qualifyIaQueueResponse(Response.json(raw), { iaRepair: true, channel: '10', count: 1, mediaTypes: ['movies'], minRuntimeSeconds: 900 }, 'https://relay.invalid', { waitUntil() {} });
  const payload = await result.json();
  assert.equal(payload.ready, 1);
  assert.equal(payload.items[0].media.runtime, 1320);
  assert.equal(payload.items[0].media.verification, 'transport');
  const legacy = Response.json(raw);
  assert.equal(await f.qualifyIaQueueResponse(legacy, {}, 'https://relay.invalid', {}), legacy);
});

test('underfill recovery retains unresolved original candidates behind the playable shelf', async () => {
  const original = { identifier: 'temporarily-unresolved::episode.mp4', title: 'Full sitcom episode' };
  const f = relay({ metadata: { language: 'eng' }, files: [] });
  const response = await f.qualifyIaQueueResponse(Response.json({ candidateItems: [original], items: [], ready: 0 }),
    { iaRepair: true, channel: '10', count: 3, mediaTypes: ['movies'], minRuntimeSeconds: 900 },
    'https://relay.invalid', { waitUntil() {} });
  const payload = await response.json();
  assert.ok(payload.ready > 0, 'known recovery episodes should fill the shelf');
  assert.ok(payload.candidateItems.some(item => item.identifier === original.identifier),
    'a temporary metadata miss must not erase the original candidate from the deeper catalog');
});

test('a deep collection cannot monopolize foreground qualification ahead of other shows', async () => {
  const rows = ['Alpha', 'Alpha', 'Alpha', 'Beta', 'Gamma'].map((seriesId, i) => ({
    ...verified, identifier: seriesId + '::episode-' + i + '.mp4', seriesId,
    sourceIdentifier: seriesId, title: seriesId + ' · Complete Episode Collection · Episode ' + i,
    media: { ...verified.media, url: 'https://archive.org/download/' + seriesId + '/episode-' + i + '.mp4' },
  }));
  const raw = { candidateItems: rows, items: rows.slice(0, 3), ready: 3 };
  const response = await relay().qualifyIaQueueResponse(Response.json(raw),
    { iaRepair: true, channel: '10', count: 3, mediaTypes: ['movies'], diversity: { maxPerFamily: 1 } },
    'https://relay.invalid', { waitUntil() {} });
  const payload = await response.json();
  assert.equal(new Set(payload.items.map(item => item.seriesId)).size, 3,
    'qualify across shows before the ready-only rotation gate; later balancing cannot recover unseen families');
  assert.equal(payload.candidateItems.filter(item => item.seriesId === 'Alpha').length, 3,
    'balance the hot shelf, not the deeper inventory');
});

test('family qualification preserves explicit reservations and genuinely single-series shelves', async () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ ...verified, identifier: 'Alpha::episode-' + i + '.mp4',
    seriesId: 'Alpha', title: 'Alpha · Episode ' + i,
    media: { ...verified.media, url: 'https://archive.org/download/Alpha/episode-' + i + '.mp4' } }));
  const beta = { ...rows[0], identifier: 'Beta::episode.mp4', seriesId: 'Beta', title: 'Beta · Episode',
    media: { ...rows[0].media, url: 'https://archive.org/download/Beta/episode.mp4' } };
  const f = relay(), body = { iaRepair: true, channel: '10', count: 3, mediaTypes: ['movies'], diversity: { maxPerFamily: 1 } };
  for (const explicit of [false, true]) {
    const response = await f.qualifyIaQueueResponse(Response.json({ candidateItems: explicit ? rows.concat(beta) : rows, ready: 3 }),
      { ...body, ...(explicit ? { hydrationPreferredIds: rows.map(row => row.identifier) } : {}) },
      'https://relay.invalid', { waitUntil() {} });
    const payload = await response.json();
    assert.deepEqual(payload.items.map(item => item.identifier), rows.map(row => row.identifier),
      'do not displace reservations or turn a genuinely constrained series into an empty shelf');
  }
});

test('hydrating a parent cannot sneak a watched child back into the ready shelf', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: [{ name: 'episode.mp4', length: 1320, width: 640, height: 480 }] });
  const response = await f.qualifyIaQueueResponse(Response.json({ candidateItems: [{ identifier: 'series', title: 'Classic series collection' }], ready: 0 }),
    { iaRepair: true, channel: '77', count: 1, mediaTypes: ['movies'], hydrationExcludeIds: ['series::episode.mp4'] },
    'https://relay.invalid', { waitUntil() {} });
  const payload = await response.json();
  assert.equal(payload.ready, 0, 'recheck exclusion after resolving a parent to its actual selected file');
});

test('strict parent hydration returns the selected file identity, not an ambiguous collection identity', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: [{ name: 'episode.mp4', length: 1320, width: 640, height: 480 }] });
  const response = await f.qualifyIaQueueResponse(Response.json({ candidateItems: [{ identifier: 'series', title: 'Classic series collection' }], ready: 0 }),
    { iaRepair: true, channel: '77', count: 1, mediaTypes: ['movies'] },
    'https://relay.invalid', { waitUntil() {} });
  const payload = await response.json();
  assert.equal(payload.items[0].identifier, 'series::episode.mp4');
  assert.equal(payload.items[0].fileName, 'episode.mp4');
});

test('a full verified shelf returns without waiting for unrelated slow metadata', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const waits = [], f = relay({}, 206, '', async () => { await delayed; return Response.json({ files: [] }); });
  const rows = [{ identifier: 'slow-one' }, { identifier: 'slow-two' },
    ...['Alpha', 'Beta', 'Gamma'].map(name => ({ ...verified, identifier: name + '::episode.mp4',
      title: name + ' full television episode', seriesId: name, sourceIdentifier: name,
      media: { ...verified.media, url: 'https://archive.org/download/' + name + '/episode.mp4',
        sourceIdentifier: name, fileName: 'episode.mp4' } }))];
  const hydration = f.hydrateIaQueue({ candidateItems: rows, minRuntimeSeconds: 900 }, 3,
    'https://relay.invalid', { iaRepair: true, waitUntil: p => waits.push(p) }, ['movies']);
  const first = await Promise.race([hydration, new Promise(resolve => setTimeout(() => resolve(null), 500))]);
  release();
  await hydration;
  await Promise.all(waits);
  assert.ok(first, 'a complete shelf must resolve while unrelated metadata is still pending');
  assert.equal(first.ready, 3);
  assert.ok(waits.length, 'remaining requests must be tracked in the request lifetime');
});

test('a collection parent and its selected episode cannot occupy two ready slots', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: [{ name: 'episode.mp4', length: 1320, width: 640, height: 480 }] });
  const response = await f.qualifyIaQueueResponse(Response.json({ candidateItems: [
    { identifier: 'series', title: 'Classic series collection' },
    { identifier: 'series::episode.mp4', title: 'Classic series episode' },
  ] }), { iaRepair: true, channel: '77', count: 2, mediaTypes: ['movies'] },
  'https://relay.invalid', { waitUntil() {} });
  const payload = await response.json();
  assert.equal(payload.ready, 1, 'deduplicate the selected file after resolving parent metadata');
});

test('seed recovery preserves the learned collection metadata of an excluded child', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: Array.from({ length: 4 }, (_, i) => ({
    name: 'episode-' + i + '.mp4', length: 1320, width: 640, height: 480,
  })) });
  const response = await f.qualifyIaQueueResponse(Response.json({ candidateItems: [{ identifier: 'series', title: 'Classic series collection' }] }),
    { iaRepair: true, channel: '10', count: 3, mediaTypes: ['movies'], hydrationExcludeIds: ['series::episode-0.mp4'] },
    'https://relay.invalid', { waitUntil() {} });
  const payload = await response.json(), parent = payload.candidateItems.find(item => item.identifier === 'series');
  assert.equal(payload.ready, 3);
  assert.equal(parent?.media?.sourceProgramCount, 4, 'fallback cannot erase the complete-series discovery hint');
});

test('failed alternative families do not strand playable unseen episodes', async () => {
  const f = relay({}, 206, '', async url => {
    if (String(url).includes('/metadata/')) return Response.json({ files: [] });
    return new Response('x', { status: String(url).includes('/Alpha/') ? 206 : 403,
      headers: { 'content-type': 'video/mp4' } });
  });
  const rows = ['Alpha', 'Alpha', 'Alpha', 'Beta', 'Gamma'].map((seriesId, i) => ({
    ...verified, identifier: seriesId + '::episode-' + i + '.mp4', seriesId, sourceIdentifier: seriesId,
    title: seriesId + ' full television episode', media: { ...verified.media,
      url: 'https://archive.org/download/' + seriesId + '/episode-' + i + '.mp4',
      sourceIdentifier: seriesId, fileName: 'episode-' + i + '.mp4', verifiedAt: 0, verification: undefined },
  }));
  const response = await f.qualifyIaQueueResponse(Response.json({ candidateItems: rows }),
    { iaRepair: true, channel: '10', count: 3, mediaTypes: ['movies'], diversity: { maxPerFamily: 1 } },
    'https://relay.invalid', { waitUntil() {} });
  const payload = await response.json();
  assert.equal(payload.ready, 3, 'try distinct shows first, then admit unseen episodes when other families fail');
  assert.equal(new Set(payload.items.map(item => item.identifier)).size, 3);
});

test('response qualification persists newly learned collection metadata for background workers', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: Array.from({ length: 4 }, (_, i) => ({ name: 'Race ' + i + '.mp4', length: 2400, width: 640, height: 480 })) });
  const data = new Map(), waits = [], puts = [];
  const env = { REALSIGNAL_QUEUE: { get: async key => JSON.parse(data.get(key) || 'null'), put: async (key, value) => { puts.push(key); data.set(key, value); } } };
  const raw = { channel: '77', lastGoodKey: 'family', candidateItems: [{ identifier: 'races', title: 'Grand Prix', media: { type: 'video', url: 'https://archive.org/download/races/Race%200.mp4' } }] };
  await f.qualifyIaQueueResponse(Response.json(raw), { iaRepair: true, channel: '77', count: 1, mediaTypes: ['movies'] }, 'https://relay.invalid', { waitUntil: p => waits.push(p) }, env);
  await Promise.all(waits);
  const stored = JSON.parse(data.get('family') || 'null');
  assert.equal(stored?.candidateItems[0].media.sourceProgramCount, 4);
  assert.equal(stored?.candidateItems[0].media.verification, 'transport');
  assert.equal(puts.filter(key => key === 'family').length, 1, 'qualification must not double-write the same KV key');
});

test('broad repaired stations deepen verified collection files behind the hot shelf', async () => {
  const f = relay();
  const data = new Map(), waits = [];
  const env = { REALSIGNAL_QUEUE: {
    get: async key => JSON.parse(data.get(key) || 'null'),
    put: async (key, value) => data.set(key, value),
  } };
  const ctx = { waitUntil: promise => waits.push(Promise.resolve(promise)) };
  const response = await f.qualifyIaQueueResponse(Response.json({
    channel: '10', lastGoodKey: 'family', candidateItems: [], items: [], ready: 0,
  }), {
    iaRepair: true, channel: '10', count: 3, mediaTypes: ['movies'], minRuntimeSeconds: 900,
    diversity: { maxPerFamily: 1 },
  }, 'https://relay.invalid', ctx, env);
  const payload = await response.json();
  assert.equal(payload.ready, 3, 'the foreground response remains a three-program hot shelf');
  for (let cursor = 0; cursor < waits.length; cursor++) await waits[cursor];
  const stored = JSON.parse(data.get('family') || 'null');
  const verifiedDepth = (stored && stored.candidateItems || []).filter(item =>
    item && item.media && item.media.verification === 'transport' && item.media.verifiedAt > 0).length;
  assert.ok(verifiedDepth >= 11,
    `one tune should verify the hot shelf plus a bounded eight-item background batch, got ${verifiedDepth}`);
  assert.equal(payload.items.length, 3, 'deepening must not enlarge or delay the public shelf');
});

test('canary underfill lanes schedule discovery instead of returning an isolated emergency bank', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: Array.from({ length: 4 }, (_, i) => ({ name: 'Race ' + i + '.mp4', length: 2400, width: 640, height: 480 })) });
  const data = new Map(), waits = [], jobs = [];
  const env = { REALSIGNAL_QUEUE: { get: async key => JSON.parse(data.get(key) || 'null'), put: async (key, value) => data.set(key, value) }, IA_HARVEST_QUEUE: { send: async job => jobs.push(job) } };
  const response = await f.worker.fetch(new Request('https://relay.invalid/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: '77', queries: ['mediatype:movies AND title:grandprix'], themeTerms: [], themeMinScore: 0, mediaTypes: ['movies'], count: 3, iaRepair: true }) }), env, { waitUntil: p => waits.push(p) });
  const payload = await response.json();
  await Promise.all(waits);
  assert.equal(response.status, 200);
  assert.match(payload.lastGoodKey || '', /file-1/, JSON.stringify({ source: response.headers.get('X-Afterglow-Source'), jobs: jobs.length }));
  assert.ok(jobs.some(job => job.iaRepair === true && job.channel === '77'));
});

test('a real queued recovery harvest promotes distinct sibling files into the family catalog', async () => {
  const names = ['S1983E01 - 1983 Austrian Grand Prix - Highlights.ia.mp4', ...Array.from({ length: 11 }, (_, i) => 'S1983E' + (i + 2) + ' - Grand Prix.mp4')];
  const f = relay({ metadata: { language: 'eng' }, files: names.map(name => ({ name, length: 2400, width: 640, height: 480 })) });
  const data = new Map(), waits = [], jobs = [];
  const env = { REALSIGNAL_QUEUE: { get: async key => JSON.parse(data.get(key) || 'null'), put: async (key, value) => data.set(key, value) }, IA_HARVEST_QUEUE: { send: async job => jobs.push(job) } };
  const ctx = { waitUntil: p => waits.push(p) };
  const response = await f.worker.fetch(new Request('https://relay.invalid/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: '77', queries: ['mediatype:movies AND title:grandprix'], themeTerms: ['formula one'], themeMinScore: 2, mediaTypes: ['movies'], count: 3, iaRepair: true }) }), env, ctx);
  const payload = await response.json();
  await Promise.all(waits);
  await f.worker.queue({ messages: [{ body: jobs.shift(), ack() {}, retry() { assert.fail('harvest should not fail'); } }] }, env, ctx);
  await Promise.all(waits);
  const stored = JSON.parse(data.get(payload.lastGoodKey) || 'null');
  assert.equal(stored.candidateItems.filter(row => row.fileName && row.sourceIdentifier === 'f1-1983-highlights-reviews-grand-prix').length, 12);
  const nextResponse = await f.worker.fetch(new Request('https://relay.invalid/ia/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: '77', queries: ['mediatype:movies AND title:grandprix'], themeTerms: ['formula one'], themeMinScore: 2, mediaTypes: ['movies'], count: 3, iaRepair: true }) }), env, ctx);
  const next = await nextResponse.json();
  assert.equal(next.ready, 3, 'a cold tune must use the deeper verified family, not the small emergency bank');
  assert.ok(next.candidateItems.some(row => row.fileName && row.sourceIdentifier === 'f1-1983-highlights-reviews-grand-prix'), 'the expanded family must reach the cold response too');
});
test('confirmed editorial contamination is rejected without blocking genuine cooking or court TV', () => {
  const f = relay();
  for (const [channel, title, subject] of [
    ['201', 'Office Etiquette', 'secretarial office relations'],
    ['20', 'Judge Roy Bean: Letty Leaves Home', '1956 fictional television western'],
    ['707', 'Christmas Night (1933)', 'Little King cartoon animation'],
    ['19', '6 characters read to Happy Days', 'fan made character reading'],
  ]) assert.equal(f.iaStationQualityGate(channel, { title, subject }), false, channel + ': ' + title);
  assert.equal(f.iaStationQualityGate('201', { title: 'The French Chef with Julia Child', subject: 'cooking food' }), true);
  assert.equal(f.iaStationQualityGate('20', { title: 'Judge Judy episode', subject: 'small claims courtroom television' }), true);
});
test('D1 compaction preserves selected-file qualification instead of erasing duration and geometry', async () => {
  const { compactCatalogItem } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const record = compactCatalogItem(verified);
  assert.equal(record.duration, 1320); assert.equal(record.aspectRatio, 640 / 480);
  assert.equal(record.width, 640); assert.equal(record.height, 480);
  assert.equal(record.fileName, 'episode.mp4'); assert.equal(record.sourceIdentifier, 'series');
  assert.equal(record.sourceUrl, 'https://archive.org/details/series'); assert.equal(record.language, 'eng');
});
test('canonical manifest does not label portrait or failed media verified', async () => {
  const { normalizeCanonicalItem, canonicalItemAccepted, IA_CANONICAL_PILOT_PROFILES } = await import(pathToFileURL(path.join(root, 'ia_canonical_station.mjs')));
  const profile = IA_CANONICAL_PILOT_PROFILES['classic-tv'];
  const base = { archiveId: 'tv', file: 'episode.mp4', title: 'Leave It to Beaver Full Episode', year: 1960,
    runtimeSeconds: 1320, subject: 'television sitcom episode', mediaUrl: 'https://archive.org/download/tv/episode.mp4' };
  assert.equal(canonicalItemAccepted(normalizeCanonicalItem(base, profile), profile), true);
  assert.equal(normalizeCanonicalItem(base, profile).playability, 'metadata-only');
  const selected = normalizeCanonicalItem({ ...base, file: undefined, mediaUrl: undefined, ...verified, year: 1960 }, profile);
  assert.equal(selected.file, 'episode.mp4');
  assert.equal(selected.media.width, 640);
  assert.equal(selected.media.verification, 'transport');
  assert.equal(canonicalItemAccepted(normalizeCanonicalItem({ ...base, width: 480, height: 640 }, profile), profile), false);
  assert.equal(canonicalItemAccepted(normalizeCanonicalItem({ ...base, playability: 'failed' }, profile), profile), false);
});
test('alternate encodings do not inflate canonical episode depth', async () => {
  const { buildCanonicalManifest, IA_CANONICAL_PILOT_PROFILES } = await import(pathToFileURL(path.join(root, 'ia_canonical_station.mjs')));
  const base = { archiveId: 'beaver', title: 'Leave It to Beaver television sitcom episode', year: 1960, runtimeSeconds: 1320 };
  const manifest = buildCanonicalManifest(IA_CANONICAL_PILOT_PROFILES['classic-tv'], [
    { ...base, file: 'episode.mp4', mediaUrl: 'https://archive.org/download/beaver/episode.mp4' },
    { ...base, file: 'episode_512kb.mp4', mediaUrl: 'https://archive.org/download/beaver/episode_512kb.mp4' },
  ]);
  assert.equal(manifest.catalogDepth, 1);
});

test('IA and H.264 derivatives have the same logical episode identity', async () => {
  const { normalizeIaFileRecord } = await import(pathToFileURL(path.join(root, 'ia_file_contract.js')));
  const key = file => normalizeIaFileRecord({ identifier: 'series::' + file }).logicalId;
  assert.equal(key('Episode 1.ia.mp4'), key('Episode 1.mp4'));
  assert.equal(key('Episode 1_h264.mp4'), key('Episode 1.mp4'));
  assert.notEqual(key('Episode 2.mp4'), key('Episode 1.mp4'));
});

test('strict file shelves are isolated without invalidating legacy cache identities', () => {
  const source = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8');
  const section = source.slice(source.indexOf('  const fileContract ='), source.indexOf('  const digest = await stableKey(fingerprint);'));
  const policy = source.slice(source.indexOf('const IA_MEASURED_DEPTH_CHANNELS ='), source.indexOf('function iaStrictRecoveryEnabled('));
  const args = { channel: '10', queries: ['tv'], themeTerms: [], denyTerms: [], requiredTitleTerms: [], mediaTypes: ['movies'], themeMinScore: 1, minRuntimeSeconds: 900, diversity: {}, count: 3, rotation: 0, IA_GLOBAL_VIDEO_POLICY_VERSION: 'policy', IA_CATALOG_BUDGET_VERSION: 'budget', stableKey: async value => value };
  const run = (body,channel=args.channel) => vm.runInNewContext(policy+'\n(async()=>{' + section + ';return {familyFingerprint,fingerprint};})()', { ...args, channel, body });
  return Promise.all([run({}), run({ iaRepair: true }),run({},'65'),run({},'12')]).then(([legacy, strict, measured, unchanged]) => {
    assert.equal(Object.hasOwn(JSON.parse(legacy.familyFingerprint), 'fileContract'), false);
    assert.equal(Object.hasOwn(JSON.parse(legacy.fingerprint), 'fileContract'), false);
    assert.equal(JSON.parse(strict.familyFingerprint).fileContract, 'ia-file-1');
    assert.notEqual(strict.fingerprint, legacy.fingerprint);
    assert.ok(Object.hasOwn(JSON.parse(measured.familyFingerprint),'stationDepthPolicy'),'only the repaired lane gets the targeted cache revision');
    assert.equal(Object.hasOwn(JSON.parse(unchanged.familyFingerprint),'stationDepthPolicy'),false,'other lane cache identities are unchanged');
  });
});
