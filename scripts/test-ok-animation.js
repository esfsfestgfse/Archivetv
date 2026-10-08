const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
(async () => {
  const root = path.resolve(__dirname,'..');
  const helper = await import(pathToFileURL(path.join(root,'ok_animation_catalog.js')));
  const source = await import(pathToFileURL(path.join(root,'realsignal_source_catalog.js')));
  const profiles = ['kids','adult','anime'].map(family=>source.sourceProfile({profileKey:`ok-${family}-channel`}));
  const shows = [
    {id:1,name:'The Flintstones',type:'Animation',language:'English',url:'https://www.tvmaze.com/shows/1/flintstones',network:{country:{code:'US'}}},
    {id:2,name:'The Simpsons',type:'Animation',language:'English',url:'https://www.tvmaze.com/shows/2/simpsons',network:{country:{code:'US'}}},
    {id:3,name:'Cowboy Bebop',type:'Animation',language:'Japanese',url:'https://www.tvmaze.com/shows/3/bebop',network:{country:{code:'JP'}}}
  ];
  const titles = ['The Flintstones S01E01 DVDRip','The Simpsons S01E01 1080p','Cowboy Bebop S01E01 English Dub'];
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/ok-embed-runtime.js'),'utf8'),{window,URL});
  for (let lane=0;lane<3;lane++) {
    const profile=profiles[lane];
    assert.deepEqual(profile.providers,['ok-search','ok-manifest']);
    assert.notDeepEqual(helper.okAnimationQueries(profile,0),helper.okAnimationQueries(profile,1),'search windows must rotate through different show families');
    const item={id:`ok:${lane+10}`,provider:'OK.ru',title:titles[lane],duration:1500,aspectRatio:1.33,type:'embed',embedAllowed:true,embedUrl:`https://ok.ru/videoembed/${lane+10}`,url:`https://ok.ru/videoembed/${lane+10}`};
    const identity=await helper.okAnimationIdentity(profile,item,async()=>shows.map(show=>({show})));
    assert.ok(identity,`${profile.profileKey} identity`);
    const verified={...item,...identity};
    assert.ok(source.qualifySourceItem(profile,verified));
    assert.equal(window.RealSignalOKEmbed.qualify(profile,verified),true);
    for (const other of profiles.filter(p=>p!==profile)) {
      assert.equal(source.qualifySourceItem(other,verified),null,'no cross-lane animation bleed');
      assert.equal(window.RealSignalOKEmbed.qualify(other,verified),false);
    }
    for (const bad of [{duration:899},{aspectRatio:.6},{animationVerified:false},{title:item.title+' fan made'},{title:item.title+' parody'},{title:item.title+' podcast'},{title:item.title+'.Hindi.5.1-English.5.1'}]) {
      assert.equal(source.qualifySourceItem(profile,{...verified,...bad}),null);
      assert.equal(window.RealSignalOKEmbed.qualify(profile,{...verified,...bad}),false);
    }
    for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes(`previewKey:"${profile.profileKey}"`));
  }
  assert.equal(helper.okAnimationPrecheck(profiles[2],{id:'ok:99',title:'Cowboy Bebop S01E01 English Sub',duration:1500,aspectRatio:1.33}),false);
  assert.ok(await helper.okAnimationIdentity(profiles[2],{id:'ok:98',title:'Anime Sabikui Bisco English-DUB - Ep_11',duration:1500,aspectRatio:1.33},async()=>[{show:{id:98,name:'Sabikui Bisco',type:'Animation',language:'Japanese',url:'https://www.tvmaze.com/shows/98/sabikui',network:{country:{code:'JP'}}}}]));
  const avatar={id:'ok:97',title:'Avatar The Last Airbender - Season 2 Episode 4',duration:3700,aspectRatio:1.77};
  const ambiguous=async()=>[{show:{id:97,name:'Avatar: The Last Airbender',type:'Animation',language:'English',runtime:24,network:{country:{code:'US'}}}},{show:{id:96,name:'Avatar: The Last Airbender',type:'Scripted',language:'English',runtime:60}}];
  assert.equal(await helper.okAnimationIdentity(profiles[0],avatar,ambiguous),null,'live-action duration must not borrow a cartoon identity');
  assert.equal(await helper.okAnimationIdentity(profiles[0],{...avatar,duration:2820},async()=>[{show:{id:97,name:'Avatar: The Last Airbender',type:'Animation',language:'English',runtime:30,network:{country:{code:'US'}}}}]),null,'47-minute live-action uploads must not pass a nominal 30-minute cartoon identity');
  assert.ok(await helper.okAnimationIdentity(profiles[0],{...avatar,title:'Avatar The Last Airbender complete season compilation',duration:14400},ambiguous),'explicit complete-season blocks may exceed one hour');
  const base={id:'ok:a',title:'The Simpsons S01E01 1080p',seriesId:'tvmaze:2'};
  const ordered=window.RealSignalOKEmbed.order(profiles[1],[base,{...base,id:'ok:b',title:'The Simpsons S01E02 1080p'},{...base,id:'ok:duplicate'},{...base,id:'ok:c',seriesId:'tvmaze:4',title:'Futurama S01E01 1080p'}]);
  assert.equal(ordered.length,3);
  assert.equal(ordered[1].id,'ok:c');
  const savedFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('temporary outage',{status:429});
    for(const profile of profiles){
      const lanes=await Promise.all(source.sourceCatalogTasks({profileKey:profile.profileKey},{},0,{firstLane:true}).tasks);
      assert.ok(lanes.flatMap(lane=>lane.items).length>=5,'verified bootstrap must survive a discovery outage');
      assert.ok(lanes.flatMap(lane=>lane.items).every(item=>source.qualifySourceItem(profile,item)));
    }
  } finally {globalThis.fetch=savedFetch}
  console.log('OK animation passed: separated families, exact show identity, landscape/runtime/English-dub gates, rotating title searches, and episode deduplication.');
})().catch(error=>{console.error(error);process.exitCode=1});
