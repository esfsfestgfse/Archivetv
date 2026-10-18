const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const {execFileSync}=require('node:child_process');
function relay(){
  const s={console,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,Date,setTimeout,clearTimeout};
  vm.createContext(s);vm.runInContext(fs.readFileSync(path.join(root,'afterglow_ais_relay_worker.js'),'utf8').replace('export default','const worker=')+
    ';globalThis.f={iaRepairCollectionSeeds,orderedIaEmergencySeeds,queueTitleFamily,stationGate:iaStationQualityGate,archiveEpisodeKey};',s);return s.f;
}
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
  assert.ok(files.every(row=>row.media.runtime>=900&&row.media.width>row.media.height));
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
