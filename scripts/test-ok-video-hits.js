const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
(async () => {
  const root = path.resolve(__dirname, '..');
  const source = await import(pathToFileURL(path.join(root, 'realsignal_source_catalog.js')));
  const music = await import(pathToFileURL(path.join(root, 'ok_music_catalog.js')));
  const profile = source.sourceProfile({profileKey:'ok-video-hits-channel'});
  assert.ok(profile, 'Video Hits is registered on the shared OK engine');
  const queries = music.okMusicQueries(profile,0);
  assert.ok(queries.includes('Madonna music video'));
  assert.notDeepEqual(queries,music.okMusicQueries(profile,1),'discovery advances to different artist rails');
  assert.ok(!queries.some(x=>/George Strait|Janet Jackson/.test(x)),'new channel is not a country/soul clone');
  const item = {id:'ok:987',title:'Nirvana - Come As You Are (Official Music Video)',duration:225,aspectRatio:4/3,embedAllowed:true,embedUrl:'https://ok.ru/videoembed/987',provider:'OK.ru'};
  const recording = {id:'11111111-1111-4111-8111-111111111111',title:'Come As You Are','first-release-date':'1991-09-24','artist-credit':[{name:'Nirvana',artist:{id:'22222222-2222-4222-8222-222222222222',name:'Nirvana'}}]};
  const identity=music.okMusicIdentityFromResults(item,{recordings:[recording]});
  assert.equal(identity.musicFamily,'video-hits');
  const verified={...item,...identity};
  assert.ok(source.qualifySourceItem(profile,verified));
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/ok-embed-runtime.js'),'utf8'),{window,URL});
  assert.ok(window.RealSignalOKEmbed.qualify(profile,verified));
  assert.equal(window.RealSignalOKEmbed.musicProfile({profileKey:'ok-tv-channel',intent:'music'}),false);
  for(const key of ['ok-soul-flow-channel','ok-country-video-channel']){
    const other=source.sourceProfile({profileKey:key});
    assert.equal(source.qualifySourceItem(other,verified),null,'music families stay separate');
    assert.equal(window.RealSignalOKEmbed.qualify(other,verified),false);
  }
  for(const bad of [{musicFamily:'country'},{musicVerified:false},{duration:40},{duration:3600},{aspectRatio:.56},{musicReleaseYear:1979},{musicReleaseYear:2010},...['live concert','lyrics','fan film','reaction','audio only','official audio','audio version','podcast','music city tonight'].map(x=>({title:item.title+' '+x}))]){
    assert.equal(source.qualifySourceItem(profile,{...verified,...bad}),null);
    assert.equal(window.RealSignalOKEmbed.qualify(profile,{...verified,...bad}),false);
  }
  const {OK_VERIFIED_SEARCH_SEED}=await import(pathToFileURL(path.join(root,'ok_verified_search_seed.js')));
  const seed=OK_VERIFIED_SEARCH_SEED[profile.profileKey]||[];
  assert.ok(new Set(seed.map(x=>x.identityReference)).size>=80,'launch has a deep canonical catalog, not five videos');
  assert.ok(new Set(seed.map(x=>x.musicArtistId)).size>=30,'artist diversity survives admission');
  assert.deepEqual([...new Set(seed.map(x=>Math.floor(x.musicReleaseYear/10)*10))].sort(),[1980,1990,2000]);
  for(const row of seed){assert.ok(source.qualifySourceItem(profile,row),row.title);assert.ok(window.RealSignalOKEmbed.qualify(profile,row),row.title);}
  const worker=await import(pathToFileURL(path.join(root,'realsignal_api_v2_worker.js')));
  assert.equal(worker.compactCatalogItem(verified).musicFamily,'video-hits');
  const cold=await(await worker.default.fetch(new Request('https://api.example/api/v3/source/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:profile.profileKey,count:5})}),{},{waitUntil(){}})).json();
  assert.ok(cold.items.length>=5,'empty durable catalog still starts without foreground provider discovery');
  assert.equal(new Set(cold.items.map(x=>x.identityReference)).size,cold.items.length,'alternate uploads are one song in playback');
  const heardIds=[],heardSongs=new Set();
  for(let rotation=0;rotation<12;rotation++){
    const response=await worker.default.fetch(new Request('https://api.example/api/v3/source/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:profile.profileKey,count:5,rotation,recentIds:heardIds})}),{},{waitUntil(){}});
    assert.equal(response.status,200);
    const selected=(await response.json()).items.slice(0,5);
    assert.equal(selected.length,5);
    for(const row of selected){assert.ok(!heardSongs.has(row.identityReference),'cold rotations cannot reopen alternate uploads: '+row.title);heardSongs.add(row.identityReference);}
    heardIds.unshift(...selected.map(row=>row.id));
  }
  assert.equal(heardSongs.size,60,'twelve cold shelves have sixty distinct songs without D1');
  const {DatabaseSync}=require('node:sqlite'),sql=new DatabaseSync(':memory:');
  for(const file of ['0001_realsignal_catalog.sql','0002_realsignal_v3_observability.sql','0003_realsignal_v4_adaptive_catalog.sql'])sql.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  sql.prepare("INSERT INTO programs (id,provider,title,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')").run(verified.id,'OK.ru',verified.title,225,4/3,'embed',verified.embedUrl,JSON.stringify({...worker.compactCatalogItem(verified),durationUnit:'seconds'}),1,1);
  sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,1)').run(profile.profileKey,verified.id);
  const db={prepare(query){return{bind(...args){return{async all(){return{results:sql.prepare(query).all(...args)}}}}}}};
  const status=await(await worker.default.fetch(new Request('https://api.example/api/v3/source/status?profileKey='+profile.profileKey),{realsignal_catalog:db},{waitUntil(){}})).json();
  assert.equal(status.items[0].musicFamily,'video-hits','identity survives durable storage and guide readback');
  sql.close();
  for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(html,/num:599[^\n]*ok-video-hits-channel/,'channel is exposed in both lineups');
    const saved=new Map(),context={window,store:{get:(key,fallback)=>saved.get(key)||fallback,set:(key,value)=>saved.set(key,value)},V2_SOURCE_MIN_RUNTIME:900};
    Object.assign(context,{v2Text:value=>String(value||''),v2RightsOkay:()=>true,v2Landscape:()=>true,v2ProgramRuntimeOkay:item=>Number(item.duration)>=900});
    for(const name of ['v2Recent','v2Remember','v2FreshCursor','v2ProfileRuntimeOkay','v2Verified'])vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),context);
    assert.ok(context.v2Verified({...verified,url:verified.embedUrl},'OK.ru','music video','server-verified',profile),'final client gate accepts approved music below the TV floor');
    assert.equal(context.v2Verified({...verified,musicVerified:false,url:verified.embedUrl},'OK.ru','music video','server-verified',profile),null);
    context.verified=context.v2Verified;
    vm.runInNewContext(html.match(/window\.v2Verified=v2Verified=function\(item,provider,query,level(?:,profile)?\)\{[\s\S]*?return verified\([\s\S]*?\};/)[0],context);
    assert.ok(context.v2Verified({...verified,url:verified.embedUrl},'OK.ru','music video','server-verified',profile),'legacy wrapper forwards the music station profile');
    assert.ok(context.v2ProfileRuntimeOkay(verified,profile));
    context.v2Remember(profile.name,verified);
    assert.equal(context.v2FreshCursor(profile,{items:[verified,{...verified,id:'ok:988',musicArtistId:'new-artist',identityReference:'new-song'}],cursor:0}),1,'Next advances past the seen canonical song');
    for(const key of ['ok-soul-flow-channel','ok-country-video-channel'])assert.equal(context.v2Recent(source.sourceProfile({profileKey:key}).name).length,0,'histories are independent');
    // The guide must use the same artist/canonical-song policy as the player,
    // rather than naming the first upload that differs from the current ID.
    const blocked={...verified,id:'ok:madonna',title:'Madonna - Frozen',musicArtistId:'recent-artist',identityReference:'madonna-song'};
    const alternate={...verified,id:'ok:alternate',title:'A heard song, another upload',musicArtistId:'other-artist',identityReference:'already-heard-song'};
    const fresh={...verified,id:'ok:journey',title:'Journey - When You Love a Woman',musicArtistId:'fresh-artist',identityReference:'journey-song'};
    const shelf={items:[blocked,verified,alternate,fresh],cursor:1,currentId:verified.id,currentTitle:verified.title,provider:'OK.ru'};
    context.curNum=599;context.curItem=verified;context.V2_PREVIEW_PROFILES={[profile.profileKey]:profile};
    context.window.__v2PreviewState={599:shelf};
    saved.set('v2recentArtists:'+profile.name,[verified.musicArtistId,blocked.musicArtistId]);
    saved.set('v2recentPrograms:'+profile.name,[window.RealSignalOKEmbed.programKey(verified),window.RealSignalOKEmbed.programKey(alternate)]);
    context.window.__rsVerifiedGuide={[profile.profileKey]:{verified:true,current:verified,next:blocked,items:shelf.items,catalogDepth:4,unseenCount:4}};
    for(const name of ['guideDurationLabel','guideItemTitle','guideItemRuntime'])vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),context);
    const guideSource=html.slice(html.indexOf('function guideVerifiedListing('),html.indexOf('/* Viewer-facing status pass:'));
    vm.runInNewContext(guideSource,context);
    const ch={num:599,source:'v2preview',previewKey:profile.profileKey},snapshot=JSON.stringify(shelf),history=JSON.stringify([...saved]);
    const actualNext={items:shelf.items.filter(row=>row.id!==verified.id),cursor:0};
    const nextIndex=context.v2FreshCursor(profile,actualNext);
    const expected=actualNext.items[nextIndex];assert.equal(expected.id,fresh.id);
    for(const hasManifest of [true,false]){
      if(!hasManifest)delete context.window.__rsVerifiedGuide[profile.profileKey];
      const listing=context.guideListing(ch);
      assert.equal(listing.next,'NEXT · Journey - When You Love a Woman · 4M',file+': guide follows actual music freshness selection');
      assert.equal(JSON.stringify(shelf),snapshot,'guide browsing cannot advance or mutate playback');
      assert.equal(JSON.stringify([...saved]),history,'guide browsing cannot mark a song heard');
    }
    assert.equal(context.guideOKMusicListing({...ch,source:'livetv'},null),null,'live TV guide remains on its existing path');
    assert.equal(context.guideOKMusicListing({...ch,previewKey:'ok-tv-channel'},null),null,'nonmusic source guide remains on its existing path');
    saved.set('v2recent:'+profile.name,[verified.id,fresh.id,alternate.id,blocked.id]);
    saved.set('v2recentArtists:'+profile.name,shelf.items.map(row=>row.musicArtistId));
    saved.set('v2recentPrograms:'+profile.name,shelf.items.map(row=>window.RealSignalOKEmbed.programKey(row)));
    const exhaustedSnapshot=JSON.stringify(shelf),exhaustedHistory=JSON.stringify([...saved]);
    assert.equal(context.guideListing(ch).next,'NEXT · Madonna - Frozen · 4M',file+': exhausted guide names the oldest replay selected by Next');
    assert.equal(JSON.stringify(shelf),exhaustedSnapshot,'exhaustion preview cannot advance playback');
    assert.equal(JSON.stringify([...saved]),exhaustedHistory,'exhaustion preview cannot record playback');
  }
  console.log('Video Hits passed: shared engine, separate family, deep canonical bootstrap, stored identity and independent Next.');
})().catch(error=>{console.error(error);process.exitCode=1;});
