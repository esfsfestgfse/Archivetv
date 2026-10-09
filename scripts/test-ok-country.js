const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
(async () => {
  const root = path.resolve(__dirname, '..');
  const source = await import(pathToFileURL(path.join(root, 'realsignal_source_catalog.js')));
  const music = await import(pathToFileURL(path.join(root, 'ok_music_catalog.js')));
  const country = source.sourceProfile({profileKey:'ok-country-video-channel'});
  const soul = source.sourceProfile({profileKey:'ok-soul-flow-channel'});
  assert.ok(country, 'Country Video is registered on the shared OK engine');
  assert.equal(country.minRuntimeSeconds,120);
  assert.ok(music.okMusicQueries(country,0).every(query=>!query.includes('Janet')));
  assert.notDeepEqual(music.okMusicQueries(country,0),music.okMusicQueries(country,1),'discovery rotates artist windows');
  const item = {id:'ok:987',title:'Alan Jackson - Chattahoochee (Official Music Video)',duration:241,aspectRatio:4/3,embedAllowed:true,embedUrl:'https://ok.ru/videoembed/987',provider:'OK.ru'};
  const recording = {id:'11111111-1111-4111-8111-111111111111',title:'Chattahoochee','first-release-date':'1992-10-06','artist-credit':[{name:'Alan Jackson',artist:{id:'22222222-2222-4222-8222-222222222222',name:'Alan Jackson'}}]};
  const identity = music.okMusicIdentityFromResults(item,{recordings:[recording]});
  assert.equal(identity.musicFamily,'country');
  const verified = {...item,...identity};
  assert.ok(source.qualifySourceItem(country,verified));
  assert.equal(source.qualifySourceItem(soul,verified),null,'country must not bleed into Soul & Flow');
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/ok-embed-runtime.js'),'utf8'),{window,URL});
  assert.equal(window.RealSignalOKEmbed.musicProfile({profileKey:'ok-tv-channel',intent:'music'}),false,'unregistered profiles cannot claim the music runtime exception');
  assert.ok(window.RealSignalOKEmbed.qualify(country,verified));
  assert.equal(window.RealSignalOKEmbed.qualify(soul,verified),false);
  for (const bad of [{musicFamily:'soul'},{musicVerified:false},{duration:40},{duration:3600},{aspectRatio:.56},...['live concert','lyrics','fan edit','fan film','reaction','audio only','podcast','(Music City Tonight 1994)','Austin City Limits','Grand Ole Opry','CMT Crossroads','Nashville Now'].map(x=>({title:item.title+' '+x}))]) {
    assert.equal(source.qualifySourceItem(country,{...verified,...bad}),null);
    assert.equal(window.RealSignalOKEmbed.qualify(country,{...verified,...bad}),false);
  }
  const worker = await import(pathToFileURL(path.join(root,'realsignal_api_v2_worker.js')));
  assert.equal(worker.compactCatalogItem(verified).musicFamily,'country');
  const {OK_VERIFIED_SEARCH_SEED}=await import(pathToFileURL(path.join(root,'ok_verified_search_seed.js')));
  const seed=OK_VERIFIED_SEARCH_SEED[country.profileKey];
  assert.ok(new Set(seed.map(x=>x.identityReference)).size>=80,'country launches with depth behind its ready shelf');
  assert.ok(new Set(seed.map(x=>x.musicArtistId)).size>=30,'country launches with artist variety');
  assert.deepEqual([...new Set(seed.map(x=>Math.floor(x.musicReleaseYear/10)*10))].sort(),[1980,1990,2000]);
  for(const row of seed){assert.ok(source.qualifySourceItem(country,row),row.title);assert.ok(window.RealSignalOKEmbed.qualify(country,row),row.title);}
  const cold=await (await worker.default.fetch(new Request('https://api.example/api/v3/source/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:country.profileKey,count:5})}),{},{waitUntil(){}})).json();
  assert.ok(cold.items.length>=5,'empty D1 starts without foreground discovery');
  assert.equal(new Set(cold.items.map(x=>x.identityReference)).size,cold.items.length,'cold shelf is canonical');
  const {DatabaseSync}=require('node:sqlite'),sql=new DatabaseSync(':memory:');
  for(const file of ['0001_realsignal_catalog.sql','0002_realsignal_v3_observability.sql','0003_realsignal_v4_adaptive_catalog.sql'])sql.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  sql.prepare("INSERT INTO programs (id,provider,title,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')").run(verified.id,'OK.ru',verified.title,241,4/3,'embed',verified.embedUrl,JSON.stringify({...worker.compactCatalogItem(verified),durationUnit:'seconds'}),1,1);
  sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,1)').run(country.profileKey,verified.id);
  const db={prepare(query){return {bind(...args){return {async all(){return {results:sql.prepare(query).all(...args)}}}}}}};
  const status=await (await worker.default.fetch(new Request('https://api.example/api/v3/source/status?profileKey='+country.profileKey),{realsignal_catalog:db},{waitUntil(){}})).json();
  assert.equal(status.items[0].musicFamily,'country','country identity survives durable storage and guide readback');
  sql.close();
  for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) {
    const html=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(html,/num:598[^\n]*ok-country-video-channel/);
    const saved=new Map(), context={window,store:{get:(key,fallback)=>saved.get(key)||fallback,set:(key,value)=>saved.set(key,value)},V2_SOURCE_MIN_RUNTIME:900};
    for (const name of ['v2Recent','v2Remember','v2FreshCursor','v2ProfileRuntimeOkay']) vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),context);
    assert.ok(context.v2ProfileRuntimeOkay(verified,country));
    assert.equal(context.v2ProfileRuntimeOkay(verified,{profileKey:'ok-tv-channel'}),false);
    context.v2Remember(country.name,verified);
    const next={...verified,id:'ok:988',musicArtistId:'new-artist',identityReference:'new-song'};
    assert.equal(context.v2FreshCursor(country,{items:[verified,next],cursor:0}),1,'Next uses the independent country history');
    assert.equal(context.v2Recent(soul.name).length,0,'country listening does not mutate soul history');
  }
  console.log('Country Video gates passed: shared engine, separate family, rotated discovery, desktop/mobile Next and genre rejection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
