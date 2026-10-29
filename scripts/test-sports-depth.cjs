const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('afterglow_ais_relay_worker.js','utf8'),relay={console,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,Date,setTimeout,clearTimeout};vm.createContext(relay);vm.runInContext(source.replace('export default','const worker=')+';globalThis.sports={gate:iaStationQualityGate,seeds:orderedIaEmergencySeeds};',relay);
const row=(identifier,title,runtime=7200)=>({identifier,title,subject:'ice hockey tennis golf sports tournament',genreVerified:true,recoveryVerified:true,media:{type:'video',url:'https://archive.org/download/test/game.mp4',runtime,width:640,height:480,verification:'transport',verifiedAt:Date.now()}});
const bad=[
 [60,row('Stillwater_at_Park_1_7_17_Girls_Hockey_Highlights::full.mp4','Stillwater vs Park Hockey')],
 [60,row('pickup','Pickup Hockey Winter Friday')],
 [60,row('field','Girls Field Hockey Full Game')],
 [60,row('short','NHL 1988 Full Game',600)],
 [60,row('youtube-u1NI-1-R9X4','NHL Full Game Broadcast',1815.76)],
 [60,row('every-ea-sports-nhl-stanley-cup-finals-championship-celebration-nhl-hockey-nhl-19','NHL Full Game Broadcast')],
 [60,row('20020617-2336-channel-5-nhl-stanley-cup-finals-and-more','NHL Stanley Cup Finals Broadcast')],
 [71,row('asg-golf-atg-open-championship-round-2','Golf ATG Open Championship Round 2')],
 [71,row('short','Masters Final Round Broadcast',1200)],
 [72,row('andre-agassi-tennis-sega-mega-drive-pal-gameplay-full-game-longplay-single-match','Andre Agassi Tennis Full Match')],
 [72,row('tweakers004852','Grand Slam Tennis 2')],
 [72,row('post','CMSportsNet Post Match Interview')],
 [72,row('ytp-tennis','Federer vs Nadal Full Match')],
 [72,row('fragment','Wimbledon Full Match (incomplete)')],
 [72,row('wimbledon-wilandermcenroe-19890705','Wimbledon Wilander vs McEnroe Full Match')],
 [72,row('short','2012 Wimbledon Federer v Djokovic',1152)]
];
test('sports broadcast policy rejects misleading source IDs and fragments at relay and API admission',async()=>{
 const {iaKnownVideoPolicyViolation,qualifyIaFileRecord}=await import('../ia_file_contract.js'),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
 for(const[ch,item]of bad){assert.equal(relay.sports.gate(ch,item),false,ch+' '+item.title+' relay');assert.equal(iaKnownVideoPolicyViolation(item,{channel:ch}),true);assert.equal(catalogFallbackAllowed(item,{channel:ch}),false,'D1 '+item.title);assert.equal(qualifyIaFileRecord(item,{channel:ch,mediaTypes:['movies']}).accepted,false,'reservation '+item.title);}
});
test('full programs survive incidental highlights in their description and unrelated sports formats remain valid',async()=>{
 const {iaKnownVideoPolicyViolation,qualifyIaFileRecord}=await import('../ia_file_contract.js');
 for(const[ch,title]of [[60,'NHL Chicago Blackhawks vs Pittsburgh Penguins 1988'],[60,'NHL Chicago Blackhawks vs Pittsburgh Penguins 1988 Full Game with Commercials'],[72,'2013 Wimbledon Full Match without Commercials'],[71,'1999 Masters Tournament Final Round Broadcast'],[72,'2013 Roland Garros Djokovic vs Nadal ENG Full Match'],[69,'Sports Newsreel - Tennis Highlights'],[68,'Golf Coaching Clinic']]){
 const item={...row('broadcast',title),description:'Includes intermission highlights and interviews during the complete broadcast'};assert.equal(relay.sports.gate(ch,item),true,title);assert.equal(iaKnownVideoPolicyViolation(item,{channel:ch}),false,title);assert.equal(qualifyIaFileRecord(item,{channel:ch,mediaTypes:['movies']}).accepted,true,title);
 }
});
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': saved sports shelves cannot resurrect rejected recordings',()=>{
 const s=fs.readFileSync(file,'utf8'),c={banned:[],curItem:null,blockedId:()=>false,isTemporarilySkipped:()=>false,iaProgramFailed:()=>false,iaSkipBlocked:()=>false,iaThemeMatches:()=>true};vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function iaKnownVideoPolicyViolation('),s.indexOf('function iaProgramDenyTerms(')),c);
 for(const[ch,item]of bad)assert.equal(c.iaCachedProgramAllowed({num:ch},{...item,id:item.identifier,type:'video',url:item.media.url}),false,ch+' '+item.title);
});
test('expanded sports shelves expose real collection children without losing the large candidate bank',()=>{
 for(const[ch,min]of [[60,15],[71,30],[72,12]]){const rows=relay.sports.seeds(ch,0).filter(x=>x.media?.url&&Number(x.media?.runtime)>=1800);assert.ok(new Set(rows.map(x=>x.identifier)).size>=min,ch+' needs a deeper file-level rail');assert.ok(rows.every(x=>relay.sports.gate(ch,x)));}
});
test('expanded golf rail is not hidden behind an older full D1 shelf',async()=>{
 const {default:api,compactCatalogItem}=await import('../realsignal_api_v2_worker.js');
 const old=Array.from({length:20},(_,i)=>row('old-golf-'+i,'US Open Golf '+(1980+i)+' Full Round Broadcast'));
 const dbRows=old.map(compactCatalogItem).map(x=>({id:x.id,provider:x.provider,source_identifier:x.sourceIdentifier,title:x.title,description:x.description,duration_seconds:x.duration,aspect_ratio:x.aspectRatio,media_type:x.mediaType,media_url:x.mediaUrl,source_url:x.sourceUrl,rights:x.rights,year:x.year,metadata_json:JSON.stringify(x)}));
 const bank=relay.sports.seeds('71',0).filter(x=>x.media?.url&&x.sourceIdentifier==='golf_20201004'),pending=[];let relayCalls=0;
 const env={realsignal_catalog:{prepare(sql){return{bind(){return this;},all:async()=>({results:/FROM programs p/.test(sql)?dbRows:[]}),first:async()=>null,run:async()=>({success:true})};},batch:async()=>[]},RELAY:{fetch:async()=>{relayCalls++;return Response.json({items:bank.slice(0,3),candidateItems:bank,ready:3,candidates:bank.length});}}};
 const r=await api.fetch(new Request('https://api.invalid/api/v3/ia/queue',{method:'POST',body:JSON.stringify({channel:'71',serverCatalog:true,count:3,queries:['golf'],mediaTypes:['movies'],minRuntimeSeconds:900})}),env,{waitUntil:p=>pending.push(p)});
 const d=await r.json();assert.equal(r.status,200);assert.equal(relayCalls,1,'the new relay bank must be reached');assert.ok(d.candidateItems.some(x=>x.sourceIdentifier==='golf_20201004'));await Promise.allSettled(pending);
});
test('relay-owned sports rotation honors this viewer rather than excluding another viewer\'s played programs',async()=>{
 const {default:api}=await import('../realsignal_api_v2_worker.js?viewer-rotation-test');
 const bank=relay.sports.seeds('60',0).filter(x=>x.media?.url&&Number(x.media.runtime)>=3600).slice(0,12);
 assert.ok(bank.length>=11);
 const otherViewer=bank.slice(0,4).map(x=>x.identifier),personal=[bank[10].identifier],pending=[],forwarded=[];
 const env={realsignal_catalog:{prepare(sql){return{bind(){return this;},all:async()=>({results:/SELECT program_id FROM channel_freshness/.test(sql)?otherViewer.map(program_id=>({program_id})):[]}),first:async()=>null,run:async()=>({success:true})};},batch:async()=>[]},RELAY:{fetch:async request=>{
  forwarded.push(await request.json());
  return Response.json({channel:'60',items:bank.slice(0,5),candidateItems:bank,ready:5,candidates:bank.length,rotationApplied:true});
 }}};
 const r=await api.fetch(new Request('https://api.invalid/api/v3/ia/queue',{method:'POST',body:JSON.stringify({channel:'60',count:5,serverCatalog:true,rotation:1,recentIds:personal,viewerRecentIds:personal,queries:['ice hockey'],mediaTypes:['movies']})}),env,{waitUntil:p=>pending.push(p)});
 const d=await r.json();await Promise.allSettled(pending);assert.ok(forwarded[0].recentIds.includes(otherViewer[0]),'shared opening preference is still forwarded');assert.equal(r.status,200);assert.equal(d.ready,5);assert.equal(d.items.length,5);assert.deepEqual(new Set(d.items.map(x=>x.identifier)),new Set(bank.slice(0,5).map(x=>x.identifier)));assert.ok(d.items.every(x=>!personal.includes(x.identifier)));
 const played=personal.concat(bank[0].identifier);
 const next=await api.fetch(new Request('https://api.invalid/api/v3/ia/queue',{method:'POST',body:JSON.stringify({channel:'60',count:5,serverCatalog:true,rotation:2,recentIds:played,viewerRecentIds:played,queries:['ice hockey'],mediaTypes:['movies']})}),env,{waitUntil:p=>pending.push(p)});
 const nextShelf=await next.json();await Promise.allSettled(pending);assert.equal(nextShelf.ready,5);assert.equal(nextShelf.items.length,5);assert.ok(nextShelf.items.every(x=>!played.includes(x.identifier)),'the viewer\'s own watched programs remain excluded');
});
