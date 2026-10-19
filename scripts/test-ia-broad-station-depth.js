const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const {execFileSync}=require('node:child_process');
function relay(){
  const s={console,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,Date,setTimeout,clearTimeout};
  vm.createContext(s);vm.runInContext(fs.readFileSync(path.join(root,'afterglow_ais_relay_worker.js'),'utf8').replace('export default','const worker=')+
    ';globalThis.f={iaRepairCollectionSeeds,orderedIaEmergencySeeds,queueTitleFamily,stationGate:iaStationQualityGate,archiveEpisodeKey,iaEffectiveVideoMinRuntimeSeconds,iaRepairPublicCatalog,strictRecoveryQueue,themeScore,matchesDeny};',s);return s.f;
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
