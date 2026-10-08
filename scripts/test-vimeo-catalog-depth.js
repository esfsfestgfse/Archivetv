const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
(async () => {
  const helpers = await import(pathToFileURL(path.join(root, 'vimeo_catalog.js')));
  const { sourceProfile, qualifySourceItem, sourceCatalogTasks } = await import(pathToFileURL(path.join(root, 'realsignal_source_catalog.js')));
  const { default: worker } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0001_realsignal_catalog.sql','0002_realsignal_v3_observability.sql','0003_realsignal_v4_adaptive_catalog.sql']) sql.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  const db = { prepare(query) { return { bind(...args) { return { query,args,async all(){return {results:sql.prepare(query).all(...args)}} } } } }, async batch(statements){return statements.map(s=>sql.prepare(s.query).all(...s.args))} };
  assert.equal(await helpers.vimeoDiscoveryCursor(db,'vimeo-tv-channel'),0);
  assert.equal(await helpers.vimeoDiscoveryCursor(db,'vimeo-tv-channel'),1);
  await helpers.vimeoSearchPage(db,'vimeo-tv-channel','episode','relevant',3);
  assert.equal(await helpers.vimeoSearchPage(db,'vimeo-tv-channel','episode','relevant'),3);
  assert.equal(await helpers.vimeoSearchPage(db,'vimeo-tv-channel','episode','date'),1);
  assert.equal(JSON.parse(sql.prepare('SELECT rules_json FROM channel_rules').get().rules_json).vimeoDiscoveryCursor,2,'page writes must preserve other discovery state');
  const row = {uri:'/videos/1234',name:'Test Drama Episode 1',description:'An English television drama series written by its original creator',duration:1500,width:1440,height:1080,language:'en',privacy:{view:'anybody',embed:'public'},is_playable:true,status:'available'};
  const candidate = helpers.vimeoItem(row,'episode');
  const embed = {type:'video',video_id:1234,title:row.name,duration:1500,width:640,height:480,html:'<iframe src="https://player.vimeo.com/video/1234?app_id=1"></iframe>'};
  const verified = helpers.vimeoOEmbedVerified(candidate,embed);
  assert.ok(verified);
  assert.equal(helpers.vimeoItem({...row,privacy:{view:'password',embed:'public'}},'episode').publicEmbed,false);
  assert.equal(helpers.vimeoItem({...row,privacy:{view:'anybody',embed:'whitelist'}},'episode').publicEmbed,false);
  assert.equal(helpers.vimeoOEmbedVerified(candidate,{...embed,video_id:555}),null);
  assert.equal(helpers.vimeoOEmbedVerified(candidate,{...embed,html:'<iframe src="https://example.com/video/1234"></iframe>'}),null);
  const tv = sourceProfile({profileKey:'vimeo-tv-channel'}), movie=sourceProfile({profileKey:'vimeo-movie-channel'});
  assert.equal(movie.minRuntimeSeconds,3600);
  assert.ok(qualifySourceItem(tv,{...verified,provider:'Vimeo'}));
  for (const changes of [{duration:899},{aspectRatio:0.56},{title:'Parody fan-made TV episode'},{title:'TV podcast episode'},{language:'fr'},{embedVerified:false}]) assert.equal(qualifySourceItem(tv,{...verified,provider:'Vimeo',...changes}),null);
  assert.equal(qualifySourceItem(movie,{...verified,title:'Full feature film',provider:'Vimeo',duration:3599}),null);
  for (const title of ['My wedding feature film','Papaji satsang full film','Full episode sample','Watamote Ep1 (Full Episode)']) assert.equal(helpers.vimeoProgramOkay({title},'tv'),false);
  for (const title of ['Shark Monster Pilot Episode','Turbo Ranger Episode 3','Episode 3']) assert.equal(qualifySourceItem(tv,{...verified,provider:'Vimeo',title,description:'Full episode'}),null,'English labels alone are not program evidence');
  assert.equal(qualifySourceItem(tv,{...verified,provider:'Vimeo',title:'MATTADORE Episode 6',description:'Growth mindset keynote and business presentation'}),null);
  assert.deepEqual(helpers.vimeoBalancedItems([{id:'a',title:'RSVP (Feature Film)'},{id:'b',title:'RSVP Full Film'}]).map(i=>i.id),['a']);
  const filmMetadata=async url => String(url).includes('wbsearchentities') ? {search:[{id:'Q1',label:'Painful Secrets',description:'2000 television film'}]} : {entities:{Q1:{claims:{P364:[{mainsnak:{datavalue:{value:{id:'Q1860'}}}}],P577:[{mainsnak:{datavalue:{value:{time:'+2000-01-01T00:00:00Z'}}}}]}}}};
  assert.equal((await helpers.vimeoProgramIdentity({title:'Painful Secrets Full Movie'},'movie',filmMetadata)).year,2000);
  assert.equal(await helpers.vimeoProgramIdentity({title:'Random Secrets Full Movie'},'movie',filmMetadata),null,'a fuzzy film search is not exact identity evidence');
  assert.equal(await helpers.vimeoProgramIdentity({title:'Painful Secrets Full Movie 1990'},'movie',filmMetadata),null,'release year mismatch must fail closed');
  assert.equal((await helpers.vimeoProgramIdentity({title:'Drama Episode 1'},'tv',async()=>[{show:{name:'Drama',language:'English',type:'Animation'}}])).rejectedIdentity,true);
  const oldFetch=globalThis.fetch, tasks=[];
  try {
    globalThis.fetch=async(url, options)=>{
      if(String(url).startsWith('https://api.vimeo.com/videos?')) {
        assert.ok(options.headers.Authorization.startsWith('bearer '));
        assert.ok(!String(url).includes('test-public-token'));
        return Response.json({data:[row]});
      }
      if(String(url).startsWith('https://vimeo.com/api/oembed.json?')) return Response.json(embed);
      return new Response('unavailable',{status:503});
    };
    const lane=(await Promise.all(sourceCatalogTasks({profileKey:tv.profileKey},{VIMEO_ACCESS_TOKEN:'test-public-token',realsignal_catalog:db},0,{maintenance:true}).tasks))[0];
    assert.equal(lane.items.length,1);
    assert.equal(lane.items[0].embedVerified,true);
    for(let i=0;i<150;i++){
      const n=i%6,id=`vimeo:${9000+i}`,title=`Drama ${n} Episode ${Math.floor(i/6)+1}`;
      const item={...verified,id,title,provider:'Vimeo',description:'English television drama series written by its original creator',url:`https://player.vimeo.com/video/${9000+i}`,embedUrl:`https://player.vimeo.com/video/${9000+i}`};
      sql.prepare("INSERT INTO programs (id,provider,title,description,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active')").run(id,'Vimeo',title,item.description,1500,1.33,'embed',item.url,JSON.stringify(item),1,1);
      sql.prepare('INSERT INTO channel_programs (channel_key,program_id,score,last_seen_at) VALUES (?,?,0,1)').run(tv.profileKey,id);
    }
    const ctx={waitUntil(p){tasks.push(p)}};
    const status=await(await worker.fetch(new Request(`https://api.example/api/v3/source/status?profileKey=${tv.profileKey}`),{realsignal_catalog:db},ctx)).json();
    assert.equal(status.items.length,150,'D1 must retain verified embeds beyond 96');
    const seen=[];
    for(let rotation=0;rotation<16;rotation++){
      const response=await worker.fetch(new Request('https://api.example/api/v3/source/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:tv.profileKey,count:5,rotation,recentIds:seen})}),{realsignal_catalog:db},ctx);
      const shelf=await response.json();
      assert.equal(shelf.items.length,5);
      assert.equal(new Set(shelf.items.map(item=>item.title.split(' Episode ')[0])).size,5);
      assert.ok(shelf.candidateItems.every(item=>!seen.includes(item.id)));
      shelf.items.forEach(item=>{assert.ok(!seen.includes(item.id));seen.push(item.id)});
    }
    await Promise.all(tasks);
  } finally {globalThis.fetch=oldFetch;sql.close()}
  console.log('Vimeo catalog passed: public-only permission, official oEmbed identity, runtime/portrait/fan/podcast gates, persisted paging, D1 embed preservation, and sixteen balanced unseen rotations.');
})().catch(error=>{console.error(error);process.exitCode=1});
