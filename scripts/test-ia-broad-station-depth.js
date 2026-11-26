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

const noirNonFeatures = [
  ['midnight-shock-theater-s-1-e-7-the-strange-love-of-martha-ivers::Midnight Shock Theater S1-E7 - The Strange Love of Martha Ivers.ia.mp4',
    'Midnight Shock Theater S1-E07 - The Strange Love Of Martha Ivers'],
  ['11th-hour', 'Eleventh Hour (2006) Complete'],
  ['11th-hour::Eleventh Hour S1 E-4 - Kryptos.mp4', 'Eleventh Hour (2006) Complete · Eleventh Hour S1 E-4 - Kryptos'],
  ['archive-crime-show::Series S01E02.mp4', 'A Case of Murder'],
  ['archive-mystery-show::Season 2 - Episode 17.mp4', 'The Long Night'],
  ['he-who-gets-slapped-1924-lon-chaney-scored-with-new-ai-music::He Who Gets Slapped (1924, Lon Chaney).mp4',
    'He Who Gets Slapped (1924, Lon Chaney) scored with new AI music'],
];

const noirFilms = [
  ['the-strange-love-of-martha-ivers::The Strange Love of Martha Ivers.mp4', 'The Strange Love of Martha Ivers (1946)'],
  ['11.14.2003::11.14.2003.mp4', '11:14 (2003)'],
  ['red.-rock.-west.-1992::Red.Rock.West.(1992).mp4', 'Red Rock West (1993)'],
];

test('Noir filters hosted shows, episodes and explicitly AI-scored editions from relay and stored catalogs', async () => {
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const gate=relay().stationGate;
  for(const [rows,expected] of [[noirNonFeatures,false],[noirFilms,true]]) {
    for(const [identifier,title] of rows) {
      const [archiveId,fileName='feature.mp4']=identifier.split('::');
      const item={identifier,title,subject:'film noir mystery crime thriller feature film',
        media:{type:'video',url:'https://archive.org/download/'+archiveId+'/'+encodeURIComponent(fileName),
          runtime:5400,width:720,height:480,verification:'transport',verifiedAt:Date.now()}};
      const rules={channel:'108',iaRepair:true,themeMinScore:0};
      assert.equal(gate('108',item),expected,title+' on relay');
      assert.equal(catalogFallbackAllowed(item,rules),expected,title+' in persisted catalog');
      assert.equal(qualifyIaFileRecord(item,rules).accepted,expected,title+' in prepared playback');
    }
  }
});

test('the reviewed Archive feature files survive specialist channel admission', async () => {
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const f=relay();
  for(const [channel,titles] of [['108', ['Animal Kingdom (2010)']], ['116', ['The Mack (1973)', 'Black Belt Jones (1974)', 'Cleopatra Jones (1973)',
    'Truck Turner (1974)', 'Cleopatra Jones and the Casino of Gold (1975)', 'The Black Godfather (1974)',
    'Dolemite (1975)', 'The Human Tornado (1976)']], ['124', ['The Woman in Black: Angel of Death (2014)']]]) {
    const seeds=f.orderedIaEmergencySeeds(channel,0);
    for(const title of titles) {
      const item=seeds.find(row=>row.title===title);
      assert.ok(item?.identifier.includes('::'), title);
      assert.ok(f.stationGate(channel,item), title);
      const rules={channel,iaRepair:true,themeMinScore:0};
      assert.equal(catalogFallbackAllowed(item,rules),false,'a seed still needs a current transport check');
      const checked={...item,media:{...item.media,verification:'transport',verifiedAt:Date.now()}};
      assert.ok(catalogFallbackAllowed(checked,rules),title);
    }
  }
});

test('116 permits reviewed revival files without opening the era gate to arbitrary newer movies', async () => {
  const {archiveMovieAllowed,archiveFilmKey}=await import('../ia_movie_programs.js');
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const rules={channel:'116',iaRepair:true,themeMinScore:0};
  const f=relay();
  const seeds=f.orderedIaEmergencySeeds('116',0);
  const wanted=['Jackie Brown (1997)','The Return of Dolemite (2002)','Super Fly (1972)',
    'Friday Foster (1975)','Black Caesar (1973)','The Guy from Harlem (1977)'];
  const observed=seeds.filter(item=>wanted.includes(item.title));
  assert.deepEqual(new Set(observed.map(item=>item.title)),new Set(wanted),'new archive files must be present on the normal relay path');
  for(const item of observed){
    assert.ok(f.stationGate('116',item),item.title+' relay');
    const checked={...item,media:{...item.media,verification:'transport',verifiedAt:Date.now()}};
    assert.ok(qualifyIaFileRecord(checked,rules).accepted,item.title+' play queue');
    assert.ok(catalogFallbackAllowed(checked,rules),item.title+' restored catalog');
    assert.ok(archiveFilmKey(checked),item.title+' canonical film identity');
    if(item.year>1985){
      const wrongFile='Unreviewed edition.mp4';
      const siblingUrl = item.media.url.replace(/\.ia\.mp4$/, '.mp4').replace(/2002\)\.mp4$/, '2002).ia.mp4');
      assert.notEqual(siblingUrl,item.media.url,'fixture points to a different file');
      assert.equal(catalogFallbackAllowed({...checked,media:{...checked.media,url:siblingUrl}},rules),false,
        'a stale playback URL cannot use reviewed metadata to admit a sibling');
      assert.equal(catalogFallbackAllowed({...checked,media:{...checked.media,alts:[siblingUrl]}},rules),false,
        'a fallback route must refer to the same reviewed file');
      assert.equal(archiveMovieAllowed({...item,fileName:wrongFile,media:{...item.media,fileName:wrongFile}},'116'),false,
        'the approved parent must not admit another file in its collection');
      assert.equal(archiveMovieAllowed({...item,identifier:'unreviewed::'+item.fileName,sourceIdentifier:'unreviewed'},'116'),false,
        'matching title and release year alone do not bypass the period');
    }
  }
  assert.equal(archiveMovieAllowed({title:'New crime drama (2018)',subject:'blaxploitation'},'116'),false);
  assert.equal(archiveMovieAllowed({title:'Dolemite (1975)',subject:'blaxploitation'},'116'),true);
});

test('the explicitly Spanish-labelled Animal Kingdom file stays out of Noir recovery', async () => {
  const {iaReviewedFileAllowed}=await import('../ia_file_contract.js');
  const source='animal-kingdom-david-michod-2010-spa';
  const item={identifier:source+'::Animal kingdom (David Michôd, 2010) SPA.ia.mp4', sourceIdentifier:source,
    title:'Animal Kingdom (2010)', language:'eng'};
  assert.equal(iaReviewedFileAllowed(item,'108'),false);
  assert.equal(relay().stationGate('108',item),false);
  assert.equal(iaReviewedFileAllowed(item,'106'),true);
});


test('confirmed hosted, off-studio, and soundtrack uploads stay out of Noir and Hammer House', async () => {
  const {iaReviewedFileAllowed}=await import('../ia_file_contract.js');
  const gate=relay().stationGate;
  const rejected=[['108','ccp-red-house','Classic Cinema Plus #3 (The Red House)'],
    ['108','homv-s-0-e-3-example','House of Master Vyle Presents Swamp Women'],
    ['108','charles.-laughton.-directs.-the-night-of-the-hunter','Charles Laughton Directs The Night Of The Hunter'],
    ['108','night-of-the-hunter-extras','Charles Laughton Directs “The Night of the Hunter”'],
    ['124','orwells-nightmare','Orwell’s Nightmare: 1984 · 1984 (1984)'],
    ['124','hammer-frankenstein-film-music','HAMMER FRANKENSTEIN FILM MUSIC'],
    ['124','alejandro-jodorowsky-el-ladron-del-arcoiris','Alejandro Jodorowsky - The Rainbow Thief']];
  for(const [channel,identifier,title] of rejected) {
    const row={identifier,title,media:{type:'video',runtime:5400,width:640,height:480}};
    assert.equal(iaReviewedFileAllowed(row,channel),false,title);
    assert.equal(gate(channel,row),false,title);
  }
  assert.ok(iaReviewedFileAllowed({identifier:'TheRedHouse',title:'The Red House (1947)'},'108'));
  assert.ok(iaReviewedFileAllowed({identifier:'night-of-the-hunter-1955',title:'The Night of the Hunter (1955)',creator:'Charles Laughton'},'108'));
  assert.ok(iaReviewedFileAllowed({identifier:'xtheunknown',title:'X The Unknown (1956)'},'124'));
});

test('Sporting Life cannot promote civic meetings or concert uploads through outdoor subject tags',async()=>{
  const f=relay(),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const rejected=['Oceanside City Council Meeting - December 7 2016 PART 1','A Conversation with Secretary Sally Jewell','Green Day - The Easter Show 1992 - FULL PERFORMANCE',
    'In-Fisherman - Building an Enterprise Level Drupal Site - Paul Chason and Josh Estep','Outdoor Life Network Commercial Breaks (February 2000)',
    'Ed Bassmaster','Easy Money S01E06 Bassmaster','Good Will Hunting full movie'];
  for(const title of rejected){const item={identifier:'unrelated::program.mp4',title,subject:'outdoor recreation hunting sport',media:{type:'video',url:'https://archive.org/download/unrelated/program.mp4',runtime:1800,width:640,height:480}};
    assert.equal(f.stationGate('65',item),false,title+' at relay');
    assert.equal(catalogFallbackAllowed(item,{channel:'65'}),false,title+' at catalog admission');
  }
  for(const title of ['Bill Dance Outdoors','Realtree Hunting Adventures','Upland Hunting: Pheasants and Labs','Long Lake Ice Fishing Derby']){
    const item={identifier:'outdoor::episode.mp4',title,media:{type:'video',url:'https://archive.org/download/outdoor/episode.mp4',runtime:1800,width:640,height:480}};
    assert.equal(f.stationGate('65',item),true,title);assert.equal(catalogFallbackAllowed(item,{channel:'65'}),true,title);
  }
  const scavengerFilm={identifier:'HuntingSeason::huntingonline_512kb.mp4',title:'Hunting Season',subject:'outdoors hunting sports',media:{type:'video',url:'https://archive.org/download/HuntingSeason/huntingonline_512kb.mp4',runtime:1800,width:640,height:480}};
  assert.equal(f.stationGate('65',scavengerFilm),false,'the observed scavenger-hunt film is not an outdoors show');
  assert.equal(catalogFallbackAllowed(scavengerFilm,{channel:'65'}),false);
});

test('Courtroom TV requires a judge-show identity rather than an incidental description mention',async()=>{
  const f=relay(),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const bad={identifier:'KPIX_20130622_020000_Washington_Week_With_Gwen_Ifill',title:'Washington Week With Gwen Ifill',
    description:'Broadcast schedule: Judge Judy, politics and news',subject:'Judge Judy small claims',media:{type:'video',url:'https://archive.org/download/news/full.mp4'}};
  assert.equal(f.stationGate('20',bad),false);assert.equal(catalogFallbackAllowed(bad,{channel:'20'}),false);
});

test('ordinary relay shelves cannot resurrect known short or non-English media from old catalogs',()=>{
  const f=relay();
  const media={type:'video',url:'https://archive.org/download/movie/full.mp4',runtime:5400,width:640,height:480};
  assert.equal(f.stationGate('100',{identifier:'short',title:'A science fiction feature',media:{...media,runtime:300}}),false);
  assert.equal(f.stationGate('82',{identifier:'foreign',title:'Camping adventure',language:'dan',media}),false);
  assert.equal(f.stationGate('100',{identifier:'full',title:'A science fiction feature',language:'eng',media}),true);
  assert.equal(f.stationGate('106',{identifier:'world',title:'A world cinema feature',language:'fra',media}),true);
  assert.equal(f.stationGate('900',{identifier:'jazz-track',title:'Jazz performance',mediatype:'audio',runtime:240}),true);
});

test('The Hunt requires hunting programs, not films or commentary with hunting keywords',async()=>{
  const f=relay(),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const bad=[['imax.alaska.spirit.of.the.wild.720p.bluray.x264-hv','Alaska Spirit of the Wild'],
    ['the-adventures-of-frontier-fremont','The Adventures of Frontier Fremont (1975) a.k.a Spirit of The Wild'],
    ['HuntingSeason','Hunting Season'],['bsd','The Hunting Dogs: BSD’s Symbol Of Corrupt Justice || An Analysis On The Ensemble And Its Members'],
    ['deer-news','DNR Prepares For Deer Opener'],['oh-deer','Oh Deer! with Party Foul Steve | Ep 4'],
    ['nuge','Ted Nugent - The Nightly Nuge - Spirit of the Wild interview'],['oz','Ted Nugent talks to Dr. Oz about hunting'],
    ['036-ghetto-deer-hunting-036-lemonparty','036 Ghetto Deer Hunting 036 Lemonparty'],
    ['funny_or_die_video_3117','Funny or Die Video 3117: OH DEER! NickyNik goes hunting at Ted Nugents'],
    ['youtube-bFhxan4tdH0','Theo and Caleb Pressley Go Turkey Hunting'],['youtube-Nd250Ah5b0A','Theo Von on Deer Hunting'],
    ['youtube-agMgmMN8B28','JOY BEHAR SCREAMS ABOUT AR 15 AND DEER HUNTING'],
    ['youtube-eFJ0FqQIPqc','onX Hunt for Whitetail Deer Hunting'],
    ['hunting-wizardworks-promotional-dvd','Hunting Whitetails, Wild Turkeys, and Waterfowl WizardWorks (2000) Promotional DVD']];
  for(const [identifier,title]of bad){const item={identifier,title,subject:'hunting show deer hunting spirit of the wild',media:{type:'video',url:'https://archive.org/download/'+identifier+'/full.mp4'}};
    assert.equal(f.stationGate('80',item),false,title+' relay');assert.equal(catalogFallbackAllowed(item,{channel:'80'}),false,title+' API');}
  for(const title of ['Ted Nugent Spirit of the Wild S04E01','Ted Nugent Call of the Wild full episode',
    'Buckmasters Scrape Hunting for Pressurized Bucks','Mossy Oak: Turkey School 3, The Mind Game','Monster Bucks XII: Volume 1',
    "Bill Jordan's Realtree: Classic Hunts III",'Hunting Camp 1957-1958','Whitetail Madness 1']){
    const item={identifier:'program::full.mp4',title,media:{type:'video',url:'https://archive.org/download/program/full.mp4'}};
    assert.equal(f.stationGate('80',item),true,title+' relay');assert.equal(catalogFallbackAllowed(item,{channel:'80'}),true,title+' API');}
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': The Hunt rejects stale fiction and commentary without blocking real hunting shows',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,
    iaProgramFailed:()=>false,iaSkipBlocked:()=>false,iaThemeMatches:()=>true};
  vm.createContext(s);vm.runInContext(source.slice(source.indexOf('function iaKnownVideoPolicyViolation('),source.indexOf('function iaProgramDenyTerms('))+';f={cached:iaCachedProgramAllowed,queue:iaProgramAllowed};',s);
  for(const title of ['Alaska Spirit of the Wild','The Adventures of Frontier Fremont','The Hunting Dogs: BSD Analysis','Oh Deer! with Party Foul Steve',
    '036 Ghetto Deer Hunting 036 Lemonparty','Funny or Die Video 3117: OH DEER! NickyNik goes hunting at Ted Nugents',
    'Theo and Caleb Pressley Go Turkey Hunting','Theo Von on Deer Hunting','JOY BEHAR SCREAMS ABOUT AR 15 AND DEER HUNTING',
    'Hunting Whitetails, Wild Turkeys, and Waterfowl WizardWorks (2000) Promotional DVD']){
    const item={id:'old',identifier:'old',title,type:'video',subject:'hunting television'};
    assert.equal(s.f.queue(item,{channel:80,program:{}}),false,title);assert.equal(s.f.cached({num:80},item),false,title);}
  assert.equal(s.f.cached({num:80},{id:'buckmasters',title:'Buckmasters full program',type:'video'}),true);
  assert.equal(s.f.cached({num:80},{id:'youtube-eFJ0FqQIPqc',title:'onX Hunt for Whitetail Deer Hunting',type:'video'}),false,'the observed 30-second app advertisement');
  assert.equal(s.f.cached({num:80},null),false);
});

test('Cooking & Food cannot inherit etiquette and community broadcasts through food subject tags',async()=>{
  const f=relay(),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  for(const title of ['Office Etiquette','Cindy Goes to a Party','Date With Your Family, A','A Better Minnesota 1937',
    'Christmas Trees, COVID-19 Vaccines, Holiday Etiquette, & More! - Full Megacast',
    '23. Building The Recipe View Part 2','21. Building The Recipe Model Part 2']){
    const item={identifier:'legacy::program.mp4',title,subject:'cooking food home economics',media:{type:'video',url:'https://archive.org/download/legacy/program.mp4'}};
    assert.equal(f.stationGate('201',item),false,title+' relay');assert.equal(catalogFallbackAllowed(item,{channel:'201'}),false,title+' API');
  }
  for(const title of ['The French Chef with Julia Child','Yan Can Cook','Great Chefs Of New Orleans','Good Eats: Season 2',"America's Test Kitchen",'How to Bake a Souffle']){
    const item={identifier:'program::episode.mp4',title,media:{type:'video',url:'https://archive.org/download/program/episode.mp4'}};
    assert.equal(f.stationGate('201',item),true,title);assert.equal(catalogFallbackAllowed(item,{channel:'201'}),true,title);
  }
});

test('the full reviewed cooking bank survives seed construction, including Test Kitchen files',()=>{
  const bank=relay().iaRepairCollectionSeeds('201').filter(x=>x.media?.url);
  assert.equal(bank.length,349,'the count is measured before admission, not after silently discarding files');
  assert.equal(bank.filter(x=>x.sourceIdentifier==='atk-season-eight-dvd').length,31);
  assert.equal(bank.filter(x=>x.sourceIdentifier==='americas-test-kitchen-season-7').length,7);
});

test('reviewed factory edits cannot be alternate encodes of the same program',()=>{
  const bank=relay().iaRepairCollectionSeeds('200').filter(x=>x.media?.url);
  for(const parent of ['SteelASy1936','MenSteel1960','ThisIsth1957'])
    assert.equal(bank.filter(x=>x.sourceIdentifier===parent).length,1,parent+' is one program, not two fresh plays');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': every reviewed depth file survives its actual client station profile',async()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={window:{},location:{search:''},URLSearchParams,console,sportsEra:'all',
    localStorage:{getItem:()=>null,setItem:()=>{}},banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,iaProgramFailed:()=>false,iaSkipBlocked:()=>false};
  vm.createContext(s);
  const marker=source.indexOf('window.__atvIAManifest=function()'),end=source.indexOf('\nif(new URLSearchParams(location.search)',marker);
  vm.runInContext(source.slice(source.indexOf('\nconst FNOT=')+1,end),s);
  vm.runInContext(source.slice(source.indexOf('function iaRuntimeSeconds('),source.indexOf('async function iaQueueRequest('))+';f={queue:iaProgramAllowed,cached:iaCachedProgramAllowed,slot:ch=>slotFor(CH.find(x=>x.num===ch),0,{preview:true})};',s);
  const monster={identifier:'monster-bucks-xii',title:'Monster Bucks XII: Volume 1',subject:'hunting television deer hunting',runtime:1800};
  assert.equal(s.f.queue(monster,s.f.slot(80)),true,'a reviewed hunting series must survive the actual title contract');
  for(const channel of [200,201,66,80,212,81,83,128]){
    const bank=relay().iaRepairCollectionSeeds(String(channel)).filter(x=>x.media?.url),slot=s.f.slot(channel);
    const rejected=bank.filter(item=>!s.f.queue(item,slot)||!s.f.cached({num:channel,nm:channel===200?'Manufacturing Marvels':'Home Economics'},
      {id:item.identifier,title:item.title,meta:{subject:item.subject}},slot));
    assert.deepEqual(Array.from(rejected,x=>x.title),[],String(channel)+' real client cannot lose approved programs');
  }
  const mural={identifier:'fc-fc-2701',title:'Diego Rivera Industrial Mural, Detroit Institute of Arts / Ford V-8 Exhibit, State Fair',subject:'industrial factory'},slot=s.f.slot(200);
  assert.equal(s.f.queue(mural,slot),false,'a filmed industrial mural is not a factory/process program');
  assert.equal(s.f.cached({num:200,nm:'Manufacturing Marvels'},{id:mural.identifier,title:mural.title,meta:{subject:mural.subject}},slot),false);
  const rules=s.window.__atvIAManifest().find(x=>String(x.channel)==='200'),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  assert.equal(catalogFallbackAllowed(mural,rules),false,'the real manifest also excludes it from D1/API admission');
  assert.equal(relay().matchesDeny(mural,rules.denyTerms),true,'the relay receives the same exclusion');
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
  for(const [channel,minimum] of [['20',96],['65',20],['204',24],['510',96],['200',20],['201',96],['66',96],['80',12],['212',400],['81',12],['83',3],['128',10]]){
    const rules=manifest.find(x=>x.channel===channel),bank=f.iaRepairCollectionSeeds(channel).filter(x=>x.media?.url);
    assert.ok(bank.length>=minimum,channel+' must hold a real expanded bank, not another starter shelf');
    assert.ok(bank.every(x=>x.media.runtime>=900&&x.media.width>x.media.height&&x.media.metadataVerifiedAt>0));
    const payload=f.strictRecoveryQueue(channel,0,96,rules.themeTerms,rules.denyTerms,rules.requiredTitleTerms,rules.mediaTypes,rules.minRuntimeSeconds);
    assert.ok(payload.candidateItems.length>=minimum,channel+' cannot lose the bank to the old station vocabulary');
    assert.ok(bank.every(item=>catalogFallbackAllowed(item,rules)),channel+' API admission retains the reviewed files');
    assert.ok(bank.every(item=>payload.candidateItems.some(candidate=>candidate.identifier===item.identifier)),channel+' retains file-level depth behind its shelf');
    if(['20','510','201'].includes(channel))assert.equal(new Set(payload.items.slice(0,3).map(x=>x.seriesId)).size,3,'opening shelf rotates television series, not just episode IDs');
  }
});

test('411 Video Magazine issues and alternate encodes cannot count as different fresh programs',()=>{
  const bank=relay().iaRepairCollectionSeeds('66').filter(x=>x.media?.url);
  assert.ok(bank.length>=96,'test a real expanded bank, not an empty array');
  const issue50=bank.filter(x=>/411/i.test(x.seriesTitle||'')&&/411vm\s*[-_ ]*(?:issue\s*)?50\b/i.test(x.fileName));
  assert.equal(issue50.length,1,'Issue 50 is one program across plain and Issue-labelled encodes');
  assert.equal(bank.filter(x=>/10 greatest chaos/i.test(x.fileName)).length,1,'the .ia re-encode is not a fresh program');
  assert.equal(bank.filter(x=>/411.*europe.*2001/i.test(x.fileName)).length,1,'duplicate-copy suffixes do not invent a new Europe program');
  assert.ok(bank.some(x=>/mack dawg/i.test(x.seriesTitle)),'snowboarding is not discarded behind skateboarding');
  assert.ok(bank.some(x=>/endless summer/i.test(x.seriesTitle)),'surfing is also represented');
  assert.equal(bank.filter(x=>x.sourceIdentifier==='the-september-sessions').length,1,'the alternate encode is the same surf film');
  assert.ok(bank.every(x=>x.sourceIdentifier!=='Skateboarding-Live_it_Breath_it_Love_it_Dig_it'),'the student mockumentary is not a sports program');
  assert.ok(bank.every(x=>x.fileName!=='WERE_PEOPLE_TOO8.mp4'),'an opaque DVD fragment is held out');
});

test('reviewed collection exclusions apply before relay, API and file qualification, not just in the generated bank',async()=>{
  const f=relay(),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js'),{qualifyIaFileRecord}=await import('../ia_file_contract.js');
  for(const [channel,parent,file]of [['66','Skateboarding-Live_it_Breath_it_Love_it_Dig_it','Skateboarding-Live_it_Breath_it_Love_it_Dig_it_large_512kb.mp4'],
    ['66','were-people-too','WERE_PEOPLE_TOO8.mp4'],...Array.from({length:5},(_,i)=>['212','the_blue_planet','the_blue_planet_'+String(i+9).padStart(2,'0')+'_extra.mp4'])]){
    const item={identifier:parent+'::'+file,sourceIdentifier:parent,fileName:file,title:'Reviewed sports or wildlife program',
      subject:'wildlife documentary skateboarding',media:{type:'video',url:'https://archive.org/download/'+parent+'/'+file,runtime:1800,width:640,height:480}};
    assert.equal(f.stationGate(channel,item),false,parent+' relay');
    assert.equal(catalogFallbackAllowed(item,{channel}),false,parent+' API');
    assert.equal(qualifyIaFileRecord(item,{channel,requireTransport:false}).accepted,false,parent+' qualification');
  }
  assert.ok(f.stationGate('212',{identifier:'the_blue_planet::the_blue_planet_08_coasts.mp4',title:'The Blue Planet Coasts'}),'ordinary episodes stay eligible');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': stale reviewed-collection extras and mockumentaries cannot play from local caches',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,
    iaProgramFailed:()=>false,iaSkipBlocked:()=>false,iaThemeMatches:()=>true};
  vm.createContext(s);vm.runInContext(source.slice(source.indexOf('function iaKnownVideoPolicyViolation('),source.indexOf('function iaProgramDenyTerms('))+';f={cached:iaCachedProgramAllowed,queue:iaProgramAllowed};',s);
  for(const [channel,id]of [[66,'Skateboarding-Live_it_Breath_it_Love_it_Dig_it::film.mp4'],[66,'were-people-too::WERE_PEOPLE_TOO8.mp4'],
    [212,'the_blue_planet::the_blue_planet_09_deep_trouble.mp4']]){
    const item={identifier:id,id,title:'Old queued program',type:'video'};
    assert.equal(s.f.queue(item,{channel,program:{}}),false);assert.equal(s.f.cached({num:channel},item),false);
  }
  for(const [rows,expected] of [[noirNonFeatures,false],[noirFilms,true]]) {
    for(const [id,title] of rows) {
      const item={identifier:id,id,title,type:'video'};
      assert.equal(s.f.queue(item,{channel:108,program:{}}),expected,title+' in direct queue');
      assert.equal(s.f.cached({num:108},item),expected,title+' from cache');
    }
  }
});

test('background 411 expansion does not restore aliases as new episodes',async()=>{
  const fixture=collectionFixture({metadataFor:()=>({metadata:{title:'411 VM Skateboarding Complete Collection',language:'eng'},files:
    ['411VM   50.mp4','411VM-Issue 50 (2002).mp4','411VM Issue 51 (2002).mp4'].map(name=>({name,format:'h.264',length:3600,width:640,height:480}))})});
  const starter={identifier:'411-vm-skateboarding-videos',title:'411 VM Skateboarding Complete Collection',subject:'skateboarding'};
  const rows=await fixture.f.expandSeedArchiveContainers({items:[starter],candidateItems:[starter]},'https://relay.invalid',
    {isIaBackground:true,waitUntil:()=>{}},'66',['skateboarding'],[],[],['movies'],1,0,96);
  assert.equal(rows.filter(x=>x.media?.url).length,2,'two genuine issues, not three uploads');
});

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': Cooking & Food rechecks stale direct and saved playback identities',()=>{
  const source=fs.readFileSync(path.join(root,file),'utf8'),s={banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,iaProgramFailed:()=>false,iaSkipBlocked:()=>false,iaThemeMatches:()=>true};
  vm.createContext(s);vm.runInContext(source.slice(source.indexOf('function iaKnownVideoPolicyViolation('),source.indexOf('function iaProgramDenyTerms('))+';f={cached:iaCachedProgramAllowed,queue:iaProgramAllowed};',s);
  for(const title of ['Office Etiquette','Cindy Goes to a Party','Date With Your Family, A','23. Building The Recipe View Part 2','21. Building The Recipe Model Part 2']){
    const item={id:'old',identifier:'old',title,subject:'cooking food home economics',type:'video'};
    assert.equal(s.f.queue(item,{channel:201,program:{}}),false);assert.equal(s.f.cached({num:201},item),false);
  }
  assert.equal(s.f.cached({num:201},{id:'chef',title:'The French Chef with Julia Child',type:'video'}),true);
  assert.equal(s.f.cached({num:201},{id:'atk-season-eight-dvd',title:"America's Test Kitchen",type:'video'}),true);
  assert.equal(s.f.cached({num:201},null),false);
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
  assert.equal(s.f.cached({num:204,nm:'Prelinger Vault'},{id:'speech',title:'A Conversation with Secretary Sally Jewell',type:'video'}),true,'not a global ban on documentaries outside Cooking & Food');
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
  let stored;const kv={get:async()=>null,put:async(key,value)=>{stored=JSON.parse(value);}};
  await f.qualifyIaQueueResponse(Response.json({items:rows.slice(0,3),candidateItems:rows,ready:3}),
    {channel:'22',iaRepair:true,count:3,mediaTypes:['movies'],hydrationPreferredIds:rows.slice(0,3).map(x=>x.identifier)},'https://relay.invalid',
    {waitUntil:p=>pending.push(p)},{REALSIGNAL_QUEUE:kv});
  await Promise.all(pending);
  assert.ok(calls.length>=2,'the test exercises real background scheduling');
  assert.equal(new Set(calls[1].candidateItems.slice(0,3).map(item=>item.seriesId)).size,3,'Wheel and Jeopardy cannot wait behind forty Price episodes');
  assert.ok(calls[1].candidateItems.length<=8,'verification must remain a bounded batch');
  assert.ok(rows.every(row=>stored.candidateItems.some(item=>item.identifier===row.identifier)),'batch verification must retain the full persisted catalog');
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
    media:{type:'video',url:'https://dn720001.ca.archive.org/0/items/keeping-up/episode.mp4',runtime:1800,width:640,height:480}};
  const s={iaProgramQueues:{'118':[item]},iaQueueKey:ch=>String(ch.num),iaExpectedMedia:()=> 'video',iaProgramFailed:()=>false,
    iaProgramMedia:{},iaInterstitialMedia:()=>false,fastTuneGet:()=>null,fastTunePut:(channel,media)=>cached.push(media),warmIAQueueHead:()=>{}};
  vm.createContext(s);
  vm.runInContext(source.split('\n').find(line=>line.startsWith('function iaRuntimeSeconds(')),s);
  vm.runInContext(source.slice(source.indexOf('function iaArchiveDirectURL('),source.indexOf('function adoptIAResolvedMedia('))+
    source.slice(source.indexOf('function warmIAQueue(ch,'),source.indexOf('function iaQueueHasReadyProgram('))+';warmIAQueue({num:118,nm:"Blighty"},{},false,1);',s);
  const expected=generic?'Keeping Up Appearances S04 E03':'Keeping Up Appearances · Series 4 Episode 3';
  assert.equal(s.iaProgramMedia[id].title,expected,'the actual playable record needs its label before the first frame');
  assert.equal(s.iaProgramMedia[id].year,1993);assert.equal(cached[0].title,expected);
  assert.equal(cached[0].runtime,1800);assert.equal(cached[0].width,640);assert.equal(cached[0].height,480);
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
    title:'Keeping Up Appearances · Episode '+i,subject:'british television british sitcom',media:{type:'video',url:'https://archive.org/download/old-keeping-up/Episode%20'+i+'.mp4',runtime:1740,width:640,height:480}}));
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
  const s={console,Response,Date,Promise,window:{RealSignalIAShelf:{identityPilot:channel=>channel===502}},iaSessionId:()=> 'viewer-test',IA_API_BASE:'https://api.invalid/api/v3',IA_RELAY_BASE:'https://relay.invalid/ia',
    store:{get:(key,fallback)=>structuredClone(values.has(key)?values.get(key):fallback),set:(key,value)=>values.set(key,structuredClone(value))},
    fetch:async(url,options)=>{const body=JSON.parse(options.body);packets.push({url,body});if(url.endsWith('/played'))throw Error('temporary report outage');return Response.json({items:[{identifier:'queued-not-watched',media:{url:'https://archive.org/download/q/1.mp4'}}]});}};
  vm.createContext(s);vm.runInContext(source.slice(source.indexOf('async function iaQueueFetch('),source.indexOf('function iaRelaySearchURL(')),s);
  s.iaReportPlayed({num:11},{id:'old-parent-id',meta:{identifier:'series::Episode 1.mp4'}},'visible');
  s.iaReportPlayed({num:11},{id:'series::Episode 2.mp4'},'skipped');
  s.iaReportPlayed({num:118},{id:'other-station::Episode.mp4'},'visible');
  s.iaReportPlayed({num:11},{id:'advertisement',isAd:true},'visible');
  s.iaReportPlayed({num:502},{id:'pilot-tape::Episode.mp4'},'visible');
  assert.equal(values.has('iaViewerRecent:502'),false,'pilot recovery uses a separate viewer history');
  assert.equal(packets.some(packet=>packet.body.channel==='502'),false,'pilot recovery does not report to the shared relay ledger');
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

test('124 admits selected Hammer features and rejects audit contaminants from relay, API and browser seats', async () => {
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const f=relay(), rules={channel:'124',iaRepair:true,themeMinScore:0};
  const subject='hammer horror British horror feature film';
  const rows=[
    ['Superintendent Interview — School Committee', 'School Committee Superintendent Interview.mp4', false],
    ['Everyman: Frankenstein', 'BBC Everyman Frankenstein.mp4', false],
    ['Sherlock Holmes: The Masks of Death (1984)', 'The Masks of Death.mp4', false],
    ['The Brides of Dracula (1960)', 'The Brides of Dracula (1960).ia.mp4', true],
    ['Dracula Hammer Horror Film Anthology · #2 The Brides of Dracula (1960)', '02 - The Brides of Dracula (1960).mp4', true],
    ['Dr Jekyll (2023)', 'Doctor Jekyll (2023).mp4', true],
    ['The Brides of Dracula (1960)', 'School Committee Superintendent Interview.mp4', false],
    ['The Brides of Dracula (1960)', 'extras.mp4', false],
    ['The Hammer House of Horror Episode 1 (1980)', 'The Hammer House of Horror Episode 1 (1980).mp4', false],
    ['The Long Night (1947)', 'The Long Night (1947).mp4', false, 'British film'],
    ['The House That Dripped Blood (1971)', 'The.House.That.Dripped.Blood.1971.mp4', true, 'Amicus Productions'],
    ['Interview with the Vampire (1994)', 'Interview with the Vampire (1994).mp4', true, 'Gothic horror'],
  ];
  const gates=browserArchiveGates();
  for(const [title,fileName,expected,tags=subject] of rows){
    const source='mixed-archive-upload', identifier=source+'::'+fileName;
    const media={type:'video',url:'https://archive.org/download/'+source+'/'+encodeURIComponent(fileName),
      runtime:5400,width:720,height:480,verification:'transport',verifiedAt:Date.now()};
    const item={identifier,title,subject:tags,media};
    assert.equal(f.stationGate('124',item),expected,title+' / '+fileName+' relay');
    assert.equal(catalogFallbackAllowed(item,rules),expected,title+' / '+fileName+' persisted API');
    assert.equal(qualifyIaFileRecord(item,rules).accepted,expected,title+' / '+fileName+' prepared API');
    for(const gate of gates){
      assert.equal(gate({num:124},{id:identifier,title,url:media.url,meta:{subject:tags}},{}),expected,title+' browser');
    }
  }
  const bank=f.orderedIaEmergencySeeds('124',0).filter(item=>item.media?.url);
  assert.ok(bank.filter(item=>f.stationGate('124',item)).length>=15,'keep the existing reviewed depth');
});

function browserArchiveGates(){
  return ['the_dial_desktop.html','the_dial_mobile.html'].map(name=>{
    const html=fs.readFileSync(path.join(root,name),'utf8');
    const scope={URL,iaKnownVideoPolicyViolation:()=>false};
    for(const prefix of ['function iaReviewedFileAllowed(', 'function iaCachedProgramAllowed(']){
      const start=html.indexOf(prefix);
      vm.runInNewContext(html.slice(start,html.indexOf('\n}',start)+2),scope);
    }
    return scope.iaCachedProgramAllowed;
  });
}

test('108 rejects gameplay livestreams while keeping classic, neo-noir and true-crime feature titles', async () => {
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const f=relay(), gates=browserArchiveGates();
  for(const [title,file,expected] of [
    ['True Crime Gaming Livestream', 'True Crime Gameplay Livestream.mp4', false],
    ['An Evening With Detectives', 'True Crime Streets of LA longplay.mp4', false],
    ['True Crime (1999)', 'True Crime 1999.mp4', true],
    ['The Red House (1947)', 'The Red House (1947).mp4', true],
    ['Red Rock West (1993)', 'Red Rock West (1993).mp4', true],
  ]){
    const identifier='noir-upload::'+file, media={url:'https://archive.org/download/noir-upload/'+encodeURIComponent(file),
      type:'video',runtime:5400,width:720,height:480,verification:'transport',verifiedAt:Date.now()};
    const item={identifier,title,subject:'film noir crime thriller feature film',media};
    const rules={channel:'108',iaRepair:true,themeMinScore:0};
    assert.equal(f.stationGate('108',item),expected,title+' relay');
    assert.equal(catalogFallbackAllowed(item,rules),expected,title+' persisted API');
    assert.equal(qualifyIaFileRecord(item,rules).accepted,expected,title+' prepared API');
    for(const gate of gates)assert.equal(gate({num:108},{id:identifier,title,url:media.url},{}),expected,title+' browser');
  }
  for(const name of ['channel_registry.js','the_dial_desktop.html','the_dial_mobile.html']){
    const source=fs.readFileSync(path.join(root,name),'utf8');
    assert.match(source,/"Noir & Mystery":\{desc:"[^"]*classic[^"]*neo-noir/i,name);
    assert.doesNotMatch(source,/num:108,[^\n]*1940,1965/,name);
  }
});


test('108 keeps a long true-crime episode out of fresh and cached film queues', async () => {
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const {SessionRotation}=await import('../realsignal_api_rotation.js');
  const {rotationContext}=require('./ia-storage-test-helper.js');
  const {stationGate}=relay(), gates=browserArchiveGates();
  const rules={channel:'108',iaRepair:true,themeMinScore:0};
  const source='1-ganandose-la-confianza-del-monstruo';
  const selected='2 - Puedo tomarte una foto.mp4';
  const title='Conversaciones con un Asesino Serial:Las Cintas de Jeffrey Dahmer';
  const details=(parent,file,documentTitle,subject,runtime)=>({
    identifier:parent+'::'+file,title:documentTitle,subject,
    media:{url:'https://archive.org/download/'+parent+'/'+encodeURIComponent(file),fileName:file,
      runtime,width:1920,height:802,type:'video',verification:'transport',verifiedAt:Date.now()},
  });
  const episode=details(source,selected,title+' · 2 - Puedo tomarte una foto',['true crime','documental'],3726.74);
  const chapterThree=details(source,'3 - Maligno o Loco.mp4','Chapter 3',[],3630.36);
  const masked={...episode,title:'Old cached title',subject:[]};
  const alias=details('mystery-collection','chapter-2.mp4','The Investigation',['crime','documentary series'],4100);
  const nonfiction=details('another-crime-upload','feature-length.mp4','Inside a Case',['true crime documentaries','film noir'],3900);
  const translated=details('another-upload','second-film.mp4','Conversations with a Killer: The Jeffrey Dahmer Tapes',[],3900);
  const classic=details('pursued-1947','Pursued (1947).ia.mp4','Pursued',['film noir','western'],6050);
  const modern=details('the-last-seduction-1994_202608','The Last Seduction (1994).ia.mp4','The Last Seduction',['neo-noir','crime'],6600);
  const dramatization=details('true-crime-1999','True Crime (1999).mp4','True Crime (1999)',['true crime','crime drama'],7600);
  const mixedParentFeature={...modern,subject:['documentary','film noir','crime drama']};
  assert.equal(stationGate('108',{identifier:source,title,subject:episode.subject}),false,'Archive parent discovery');
  assert.equal(stationGate('108',{identifier:'different-documentary',title:'Case Files',subject:['true crime','documental']}),false,'foreign-language documentary classification');
  for(const [record,allowed] of [[episode,false],[chapterThree,false],[masked,false],[alias,false],[nonfiction,false],[translated,false],[classic,true],[modern,true],[mixedParentFeature,true],[dramatization,true]]){
    assert.equal(stationGate('108',record),allowed,record.title+' relay');
    assert.equal(catalogFallbackAllowed(record,rules),allowed,record.title+' saved API catalog');
    assert.equal(qualifyIaFileRecord(record,rules).accepted,allowed,record.title+' prepared API');
    for(const gate of gates)assert.equal(gate({num:108},record,{}),allowed,record.title+' browser');
  }
  for(const gate of gates){
    assert.equal(gate({num:108},{id:episode.identifier,title:'Cached crime film'},{}),false,'cache retained identity alone');
    assert.equal(gate({num:108},{title:'Old cached title',url:'https://ia801001.us.archive.org/34/items/'+source+'/'+encodeURIComponent(selected)},{}),false,'cache retained Archive transport alone');
  }
  const ctx=rotationContext({catalog:[masked,chapterThree,classic,modern],reserved:[masked.identifier,chapterThree.identifier],cursor:0});
  const rotation=new SessionRotation(ctx,{});
  const response=await rotation.fetch(new Request('https://rotation.internal/select',{
    method:'POST',body:JSON.stringify({mode:'reserve',count:2,stationChannel:'108',rules,items:[],requirePlayable:true}),
  }));
  assert.equal(response.status,200);
  const saved=await response.json();
  assert.deepEqual(new Set(saved.items.map(row=>row.identifier)),new Set([classic.identifier,modern.identifier]),
    'a previously reserved episode does not survive its next reservation');
});

test('564 admits whole noir features, with one ready seat per work and alternate routes retained', async () => {
  const {default:worker,catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const {sourceProfile,qualifySourceItem}=await import('../realsignal_source_catalog.js');
  const profile=sourceProfile({profileKey:'film-noir-desk'});
  const titles=[
    ['Film Noir Documentary',false], ['Film Noir: Bringing Darkness to Light',false],
    ['A Personal Journey Through Film Noir',false], ['The History of Film Noir',false],
    ['Top 10 Film Noir Movies Ranked',false], ['The Big Combo (1955) | Full Movie',true],
    ['Big Combo - 1955 - Classic Film Noir',true], ['The Big Combo | Full Film',true],
    ['D.O.A. (1950) | Full Movie',true], ['D.O.A. (1988) | Full Movie',true],
  ];
  const candidates=titles.map(([title],index)=>({id:'youtube:noir-'+index,provider:'YouTube',title,
    description:'Film noir',duration:5400,aspectRatio:16/9,language:'en',year:'2025',type:'embed',
    rights:'Standard YouTube license',url:'https://www.youtube-nocookie.com/embed/noir-'+index}));
  Object.assign(candidates[7],{id:'pt:noir-7',provider:'PeerTube',rights:'Creative Commons Attribution',type:'video',url:'https://example.com/full-film.mp4'});
  for(const [index,[title,expected]] of titles.entries()){
    assert.equal(!!qualifySourceItem(profile,candidates[index]),expected,title+' provider');
    assert.equal(catalogFallbackAllowed(candidates[index],{channel:profile.profileKey,sourceCatalog:true}),expected,title+' persisted');
  }
  assert.match(profile.queries.join(' '),/full movie/);
  assert.doesNotMatch(profile.queries.join(' '),/documentary|history/);
  const rows=candidates.map(item=>({id:item.id,title:item.title,provider:item.provider,media_type:item.type,
    media_url:item.url,source_url:item.url,duration_seconds:item.duration,description:item.description,
    aspect_ratio:item.aspectRatio,rights:item.rights,year:item.year,metadata_json:JSON.stringify({language:item.language})}));
  const env={realsignal_catalog:{prepare(sql){return{bind(){return{
    async all(){return {results:/FROM programs p JOIN channel_programs/i.test(sql)?rows:[]};},
  };}};}}};
  const request=recentIds=>new Request('https://api.example/api/v2/source/catalog',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({profileKey:profile.profileKey,minimumReady:1,count:5,recentIds})});
  const response=await worker.fetch(request([]),env,{waitUntil(){}});
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.items.length,3,'one Big Combo seat and both release years of D.O.A.');
  assert.equal(payload.candidateItems.length,5,'keep all valid delivery routes');
  assert.equal(payload.playableCatalogDepth,3,'depth measures distinct features');
  const nextResponse=await worker.fetch(request([candidates[5].id]),env,{waitUntil(){}});
  assert.equal(nextResponse.status,200);
  assert.deepEqual((await nextResponse.json()).items.map(item=>item.id),[candidates[8].id,candidates[9].id],
    'the API serves the two unseen works before replaying any Big Combo route');
  const guide=await worker.fetch(new Request('https://api.example/api/v3/guide?channel=564'),env,{waitUntil(){}});
  assert.equal(guide.status,200);
  assert.equal((await guide.json()).items.length,3,'the guide also exposes one seat per feature');

  for(const name of ['the_dial_desktop.html','the_dial_mobile.html']){
    const html=fs.readFileSync(path.join(root,name),'utf8');
    const store=new Map(), scope={window:{RealSignalSourcePrograms:require('../assets/source-program-policy.js')},
      V2_SOURCE_READY_BUFFER:5,v2Rejected:()=>[],v2Recent:key=>store.get('v2recent:'+key)||[],store:{get:(key,fallback)=>store.get(key)||fallback,set:(key,value)=>store.set(key,value)}};
    for(const prefix of ['function v2SourceProgramAllowed(', 'function v2PruneSourcePrograms(', 'function v2Remember(', 'function v2NoirNext(', 'function v2NextFreshIndex(', 'function v2NoirCatalogOrder(', 'function v2CatalogOrder(']){
      const start=html.indexOf(prefix);
      const end=prefix.startsWith('function v2Noir')?html.indexOf('\n}',start)+2:html.indexOf('\n',start);
      vm.runInNewContext(html.slice(start,end),scope);
    }
    const state={items:candidates.slice(),cursor:5};
    scope.v2PruneSourcePrograms(profile,state);
    assert.equal(state.items.length,5,name+' purges retained documentaries and lists');
    const ordered=scope.v2CatalogOrder(profile.name,state.items,profile.profileKey);
    assert.deepEqual(Array.from(ordered,item=>item.id),[5,8,9,6,7].map(i=>candidates[i].id),name+' orders distinct seats before alternate routes');
    scope.v2Remember(profile.name,candidates[5]);
    const next=scope.v2NextFreshIndex(profile,state,candidates[5].id);
    assert.equal(state.items[next]?.id,candidates[8].id,name+' skips other routes to the feature just watched');
    const retry={items:state.items.slice(1),cursor:0};
    store.clear();
    assert.equal(scope.v2NextFreshIndex(profile,retry,''),0,name+' alternate remains available after a failed first route');
  }
});

test('108 exact Arcade gameplay identity is blocked without subject on both cached dials',async()=>{
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const archiveId='razor-fist-arcade-fallen-aces';
  const url='https://archive.org/download/'+archiveId+'/recording.mp4';
  const item={identifier:archiveId+'::recording.mp4',title:'Fallen Aces',media:{url,type:'video',runtime:5400,width:720,height:480}};
  assert.equal(relay().stationGate('108',item),false);
  assert.equal(catalogFallbackAllowed(item,{channel:'108',themeMinScore:0}),false);
  for(const gate of browserArchiveGates()){
    assert.equal(gate({num:108},{id:archiveId,title:item.title},{}),false,'legacy parent without subject or media');
    assert.equal(gate({num:108},{id:item.identifier,title:item.title,url},{}),false,'legacy selected file without subject');
  }
});

// Selected public rows from the coordinator’s Film Noir Desk capture.
const noirCapture = [
  {"id":"pt:vod.newellijay.tv/377d9c33-3f18-407b-aa21-383a1d814df4","provider":"PeerTube","title":"The Man with the Golden Arm (1955)","description":"Directed by Otto Preminger. CW for drug use and additiction. The Man with the Golden Arm is a groundbreaking 1955 film noir directed by Otto Preminger, based on Nelson Algren’s novel of the same name. Starring Frank Sinatra as Frankie Machine,...","duration":7146,"aspectRatio":1.725,"type":"video","url":"https://vod.newellijay.tv/static/web-videos/9ab9c33f-1d4e-4af4-afbc-18f4e06d5b12-720.mp4","rights":"Public Domain Dedication"},
  {"id":"yt:13pfHpU2iEE","provider":"YouTube","title":"Film Noir documentary - Bringing Darkness Into Light","description":"Copyright Disclaimer under Section 107 of the copyright act 1976, allowance is made for fair use for purposes such as criticism, comment, news reporting, scholarship, and research. Fair use is a use permitted by copyright statute that might otherwise be infringing. Non-profit, ed","duration":4057,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/13pfHpU2iEE","embedUrl":"https://www.youtube-nocookie.com/embed/13pfHpU2iEE","rights":"Standard YouTube license","year":"2026"},
  {"id":"yt:5r4H3CAMeJg","provider":"YouTube","title":"The Big Combo (1955) | Classic Film Noir Crime Thriller | Full Movie HD","description":"Step into the shadowy world of classic American film noir with The Big Combo (1955) — a gripping crime thriller packed with suspense, corruption, obsession, and unforgettable black-and-white cinematography. Directed by Joseph H. Lewis, this iconic noir follows police lieutenant L","duration":5251,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/5r4H3CAMeJg","embedUrl":"https://www.youtube-nocookie.com/embed/5r4H3CAMeJg","rights":"Standard YouTube license","year":"2026"},
  {"id":"yt:5s-sSHplXRc","provider":"YouTube","title":"Undertow (1949) Film noir","description":"Undertow 1949 full movie. Scott Brady stars in this film noir crime drama as an ex gangster from Chicago who has gone straight but ends up framed for the hit on a powerful mob boss. this crime film has a great chase scene involving a LONG corridor which should not be missed. the ","duration":4232,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/5s-sSHplXRc","embedUrl":"https://www.youtube-nocookie.com/embed/5s-sSHplXRc","rights":"Standard YouTube license","year":"2018"},
  {"id":"yt:75dFETIc6qw","provider":"YouTube","title":"The Rules of Film Noir (BBC)","description":"BBC documentary. Bogey, Bacall and Mitchum play it tough as Matthew Sweet celebrates the hardboiled world of noir movies. *Had to edit out clips from 'The Killers'.","duration":3316,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/75dFETIc6qw","embedUrl":"https://www.youtube-nocookie.com/embed/75dFETIc6qw","rights":"Standard YouTube license","year":"2025"},
  {"id":"yt:iIkCXF9Y4ow","provider":"YouTube","title":"The Big Combo (1955) [Film Noir] [Crime]","description":"If you like this movie and our channel, please subscribe: https://goo.gl/0qDmXe | Police Lt. Leonard Diamond is on a personal crusade to bring down sadistic gangster Mr. Brown. He's also dangerously obsessed with Brown's girlfriend, the suicidal Susan Lowell. His main objective a","duration":5013,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/iIkCXF9Y4ow","embedUrl":"https://www.youtube-nocookie.com/embed/iIkCXF9Y4ow","rights":"Standard YouTube license","year":"2013"},
  {"id":"yt:NSHdpRsjYqk","provider":"YouTube","title":"The Rules of Film Noir (BBC 2009)","description":"BBC documentary showing the characteristic traits of Film Noir and their historical context. Featuring interviews with Paul Schrader, George Pelecanos, Sarah Churchwell, Roger Deakins, Neil Brand and presented by Matthew Sweet.","duration":3304,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/NSHdpRsjYqk","embedUrl":"https://www.youtube-nocookie.com/embed/NSHdpRsjYqk","rights":"Standard YouTube license","year":"2025"},
  {"id":"yt:PKNXaoVfQhI","provider":"YouTube","title":"Lee Van Cleef's Unforgettable Noir Classic | The Big Combo (1955) | Crime Thriller Full Movie 4K","description":"Welcome to the ultimate presentation of The Big Combo (1955) full movie, a true masterpiece of classic film noir. Experience this definitive 1950s crime thriller exactly as it was meant to be seen, showcasing some of the most striking chiaroscuro lighting and realistic cinematogr","duration":5246,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/PKNXaoVfQhI","embedUrl":"https://www.youtube-nocookie.com/embed/PKNXaoVfQhI","rights":"Standard YouTube license","year":"2026"},
  {"id":"yt:s7tfQVsxC3Y","provider":"YouTube","title":"\"Farewell My Lovely\" Robert Mitchum*Film Noir","description":"Detective Philip Marlowe [Robert Mitchum] trying to solve a murder he has stumbled on, involved with the California Gambling scene and three potentially dangerous women... Farewell, My Lovely is a 1975 American neo noir film, directed by Dick Richards and featuring Robert Mitchum","duration":5474,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/s7tfQVsxC3Y","embedUrl":"https://www.youtube-nocookie.com/embed/s7tfQVsxC3Y","rights":"Standard YouTube license","year":"2015"},
  {"id":"yt:VJz4QOBhrCY","provider":"YouTube","title":"The Rules of Film Noir (BBC Documentary, 2009)","description":"Film noir is a cinematic term used primarily to describe stylish Hollywood crime dramas, particularly those that emphasize cynical attitudes and motivations. The 1940s and 1950s are generally regarded as the \"classic period\" of American film noir. Film noir of this era is associa","duration":4022,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/VJz4QOBhrCY","embedUrl":"https://www.youtube-nocookie.com/embed/VJz4QOBhrCY","rights":"Standard YouTube license","year":"2023"},
  {"id":"yt:zaa6lFN0KaY","provider":"YouTube","title":"Murder & Drug Smuggling: Yul Brynner's Screen Debut - Port of New York (1949) 🎬 - Refurbished Movie","description":"Port of New York (1949) Directed by: László Benedek Writers: Eugene Ling, Leo Townsend, Arthur A. Ross Starring: Scott Brady, Richard Rober, K.T. Stevens, Yul Brynner Runtime: 1h 22m Genre: Film Noir, Crime, Drama, Thriller IMDb Rating: 6.0/10 Plot Summary: New York Harbor become","duration":4891,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/zaa6lFN0KaY","embedUrl":"https://www.youtube-nocookie.com/embed/zaa6lFN0KaY","rights":"Standard YouTube license","year":"2026"},
  {"id":"yt:ZB0JzHWFP4s","provider":"YouTube","title":"50 Greatest Film Noir Movies of All Time Ranked","description":"Step into a world of shadowy detectives, dangerous criminals, femme fatales, double-crosses, and unforgettable mysteries with 50 Greatest Film Noir Movies of All Time Ranked! From smoky back rooms and rain-soaked city streets to hard-boiled investigations and morally complicated ","duration":3153,"aspectRatio":1.7777777777777777,"type":"embed","url":"https://www.youtube-nocookie.com/embed/ZB0JzHWFP4s","embedUrl":"https://www.youtube-nocookie.com/embed/ZB0JzHWFP4s","rights":"Standard YouTube license","year":"2026"}
];
const noirComboIds=['yt:5r4H3CAMeJg','yt:PKNXaoVfQhI','yt:iIkCXF9Y4ow'];
const noirYears={
  'pt:vod.newellijay.tv/377d9c33-3f18-407b-aa21-383a1d814df4':1955,
  'yt:zaa6lFN0KaY':1949,
  'yt:s7tfQVsxC3Y':1975,
  'yt:5s-sSHplXRc':1949,
};

test('564 captured features retain release years and three reviewed Big Combo routes share a seat', async()=>{
  const {sourceProfile,qualifySourceItem}=await import('../realsignal_source_catalog.js');
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const policy=require('../assets/source-program-policy.js'), profile=sourceProfile({profileKey:'film-noir-desk'});
  const selected=noirCapture.filter(row=>noirComboIds.includes(row.id));
  assert.equal(policy.noirFilmSeats(selected).length,1,'the promotional prefix still identifies the same feature');
  const years={...noirYears,...Object.fromEntries(noirComboIds.map(id=>[id,1955]))};
  for(const row of noirCapture){
    const accepted=qualifySourceItem(profile,row);
    assert.equal(!!accepted,row.id in years,row.title);
    assert.equal(catalogFallbackAllowed(row,{sourceCatalog:true,channel:profile.profileKey}),row.id in years,row.title);
    if(accepted)assert.equal(Number(accepted.year),years[row.id],row.title+' displays the film release year');
  }
  for(const name of ['the_dial_desktop.html','the_dial_mobile.html']){
    const html=fs.readFileSync(path.join(root,name),'utf8'),scope={window:{RealSignalSourcePrograms:policy}};
    for(const fn of ['v2SourceProgramAllowed','v2PruneSourcePrograms']){
      const start=html.indexOf('function '+fn+'(');
      vm.runInNewContext(html.slice(start,html.indexOf('\n',start)),scope);
    }
    const state={items:noirCapture.slice(),cursor:0};
    scope.v2PruneSourcePrograms(profile,state);
    assert.deepEqual(Object.fromEntries(state.items.map(row=>[row.id,Number(row.year)])),years,
      name+' drops the captured contaminants and relabels cached films with their release years');
  }
});

test('564 browser writes only provider IDs from legacy mixed history',async()=>{
  const profile={profileKey:'film-noir-desk',name:'Film Noir Desk'}, [played]=noirComboIds;
  const comboWork='noir:1955:bigcombo', doaOriginal='yt:doa1950-old';
  let report;
  for(const name of ['the_dial_desktop.html','the_dial_mobile.html']){
    const html=fs.readFileSync(path.join(root,name),'utf8'), start=html.indexOf('async function v2ServerSourceCatalog(');
    const scope={IA_API_BASE:'https://local.example/api/v3',v2Recent:()=>[played,comboWork,doaOriginal],v2RecentSeries:()=>[],
      withTO:promise=>promise,v2Unique:items=>items,fetch:async(_url,opts)=>{
        report=JSON.parse(opts.body);
        return {ok:true,json:async()=>({items:[]})};
      }};
    vm.runInNewContext(html.slice(start,html.indexOf('\nasync function v2LoadProfile(',start)),scope);
    await scope.v2ServerSourceCatalog(profile,0,false);
    assert.deepEqual(report.playedIds,[played,doaOriginal],name+' sends only provider IDs to the ledger');
  }
});

test('564 Worker SQLite writes real IDs and suppresses inactive editions on return',async()=>{
  const {DatabaseSync}=require('node:sqlite'), sql=new DatabaseSync(':memory:');
  const {default:worker}=await import('../realsignal_api_v2_worker.js');
  const profile={profileKey:'film-noir-desk'},[played]=noirComboIds;
  const comboWork='noir:1955:bigcombo',doaOriginal='yt:doa1950-old';
  try{
    sql.exec('PRAGMA foreign_keys = ON');
    for(const file of ['0001_realsignal_catalog.sql','0002_realsignal_v3_observability.sql','0003_realsignal_v4_adaptive_catalog.sql']){
      sql.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
    }
    const add=sql.prepare('INSERT INTO programs(id,provider,source_identifier,title,description,duration_seconds,aspect_ratio,media_type,media_url,rights,year,metadata_json,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const link=sql.prepare('INSERT INTO channel_programs(channel_key,program_id,last_seen_at) VALUES(?,?,1)');
    const doa=(id,year)=>({id,year:'2026',title:'D.O.A. ('+year+') | Film Noir Full Movie',provider:'YouTube',
      type:'embed',url:'https://www.youtube-nocookie.com/embed/'+id.slice(3),rights:'Standard YouTube license',duration:5300,aspectRatio:1.7,language:'en'});
    const rows=[...noirCapture,doa(doaOriginal,1950),doa('yt:doa1950-alt',1950),doa('yt:doa1988',1988)];
    for(const row of rows){
      add.run(row.id,row.provider,row.id,row.title,row.description||'',row.duration,row.aspectRatio,row.type,row.embedUrl||row.url,row.rights,String(row.year||''),JSON.stringify(row),1,1);
      link.run(profile.profileKey,row.id);
    }
    const db={
      prepare(query){return {bind(...params){return {query,params,async all(){return {results:sql.prepare(query).all(...params)};},
        async first(){return sql.prepare(query).get(...params)||null;}};}};},
      async batch(statements){
        sql.exec('BEGIN');
        try{
          const rows=statements.map(({query,params})=>sql.prepare(query).run(...params));
          sql.exec('COMMIT');
          return rows;
        }catch(error){sql.exec('ROLLBACK');throw error;}
      },
    };
    const pending=[],ctx={waitUntil(promise){pending.push(promise);}};
    async function open(body={}){
      const response=await worker.fetch(new Request('https://local.example/api/v3/source/catalog',{method:'POST',
        headers:{'content-type':'application/json'},body:JSON.stringify({profileKey:profile.profileKey,count:5,minimumReady:1,...body})}),
        {realsignal_catalog:db},ctx);
      assert.equal(response.status,200);
      await Promise.all(pending.splice(0));
      return response.json();
    }
    const initial=await open();
    // Replay an older dial's mixed payload. An unknown provider ID must not
    // roll back the real program IDs in the transactional batch either.
    await open({playedIds:[played,comboWork,'yt:missing-foreign-key',doaOriginal]});
    assert.deepEqual(sql.prepare('SELECT program_id FROM channel_freshness ORDER BY program_id').all().map(row=>row.program_id),
      [played,doaOriginal].sort(),'only real provider IDs reach the freshness table');
    assert.equal(initial.catalogDepth,7,'four reviewed features, Big Combo and two distinct D.O.A. works');
    assert.deepEqual(initial.candidateItems.filter(row=>noirComboIds.includes(row.id)).map(row=>row.id).sort(),noirComboIds.slice().sort());
    for(const row of initial.candidateItems.filter(row=>row.id in noirYears))assert.equal(Number(row.year),noirYears[row.id]);

    for(const id of [played,doaOriginal]){
      sql.prepare("UPDATE programs SET status='inactive' WHERE id=?").run(id);
      sql.prepare('DELETE FROM channel_programs WHERE program_id=?').run(id);
    }
    const returning=await open();
    const forbidden=new Set([...noirComboIds,doaOriginal,'yt:doa1950-alt']);
    assert.ok(returning.items.some(row=>row.id==='yt:doa1988'&&Number(row.year)===1988),'separate remake remains fresh');
    assert.ok(returning.items.length>0);
    for(const row of [...returning.items,...returning.candidateItems]){
      assert.ok(!forbidden.has(row.id),'inactive originals suppress '+row.id+' from a fresh dial');
    }
    assert.equal(returning.candidateItems.length,5,'only the five unseen works are available to the fresh dial');
  }finally{sql.close();}
});
