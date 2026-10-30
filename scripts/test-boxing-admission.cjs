const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('afterglow_ais_relay_worker.js','utf8'),relay={console,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,Date,setTimeout,clearTimeout};vm.createContext(relay);vm.runInContext(source.replace('export default','const worker=')+';globalThis.boxing={gate:iaStationQualityGate,seeds:orderedIaEmergencySeeds};',relay);
const row=(identifier,title,extra={})=>({identifier,title,subject:'boxing sports full fight',genreVerified:true,recoveryVerified:true,media:{type:'video',url:'https://archive.org/download/'+identifier.split('::')[0]+'/'+encodeURIComponent(identifier.split('::')[1]||'broadcast.mp4'),runtime:3600,width:640,height:480,verification:'transport',verifiedAt:Date.now()},...extra});
const bad=[
 row('KillersWife',"Killer's Wife",{description:'The Abbott and Costello Show. Bud Abbott, Lou Costello, Mary Beth Hughes, Max Baer and Lou Nova.',subject:'boxing; max baer; lou nova; bud abbott; lou costello',collection:['classic_tv_1950s','classic_tv','television']}),
 row('relabeled-sitcom::KillersWife.mp4','Boxing Night Full Broadcast'),
 row('youtube-CBTqANcodaI','The 10 Best Boxing Games of All Time'),
 row('youtube-5RBSntR6_os','70 Must Know Boxing Combinations & Mittwork Tutorials'),
 row('youtube-jxSwwdKOZjw','It’s Boring But Fixes 96% of Your Boxing Injuries'),
 row('763684-480x-320-400k','foxy boxing striptease'),
 row('pmca-Rose_City_Report','The Rose City Report: K-9 Officer Vests, Boxing Tournament, Friends of the PPL'),
 row('grtvco-Meet_the_Press','Evander Holyfield on Boxing, Kids & God on Meet the Press'),
 row('bctvme-Talk_of_the_Town','Talk of the Town: Inside Jass Boxing'),
 row('pugs_and_pals_golden_gloves','Golden Gloves',{subject:'boxing; animated cartoon',collection:['animationandcartoons']}),
 row('rocky-balboa-vs-apollo-creed','Rocky Balboa vs Apollo Creed Full Fight'),
 row('FightNightChampion::Ali_vs_Tyson.mp4','Muhammad Ali vs Mike Tyson Full Fight'),
 row('UFC100::Full_Event.mp4','UFC 100 Full Event'),
 row('tyson-recap','Mike Tyson vs Douglas Highlights'),
 row('boxing-short','Heavyweight Boxing Full Fight',{media:{type:'video',url:'https://archive.org/download/boxing-short/fight.mp4',runtime:100,width:640,height:480}}),
 row('braddock-training','James Braddock Boxing Training'),
 row('press-conference','Championship Boxing Press Conference'),
 row('unknown','A Comedy Program',{description:'A television program with a guest who once enjoyed boxing.'})
];
const good=[row('floyd-quarry','Floyd Patterson vs Jerry Quarry'),row('golden-gloves-2005','2005 Golden Gloves Boxing Tournament'),row('thai-event','Thai Boxing 12 Mar 2017'),row('full-card','Championship Boxing Full Card with Commercials',{description:'Intermission interviews, highlights and commercials are retained in the original complete broadcast.'}),row('boxing-history','Boxing Documentary: The History of the Heavyweight Championship'),row('mike-tyson-fallen-champ','Mike Tyson: Fallen Champ - 1993'),row('pacquiao-collection::Pacquiao_vs_Cotto.mp4','Pacquiao vs Cotto',{seriesTitle:'Manny Pacquiao Fights 1996-2014'})];
good.push(row('tyson-lewis-countdown-show::Lewis_vs_Tyson_FULL_EVENT.mp4','Lennox Lewis vs Mike Tyson Full Event',{seriesTitle:'Full PPV and Countdown Show'}),row('boxing-nonfiction','Boxing Documentary: Ringside History',{subject:'boxing; non-fiction documentary'}));
good.push(row('MuhammadAliVsFloydPatterson','Muhammad Ali vs Floyd Patterson'));
bad.push(row('tyson-lewis-full-ppv::Tyson_vs_Lewis_COUNTDOWN_SHOW.mp4','Mike Tyson vs Lennox Lewis Countdown Show'));
bad.push(row('SportsTalk_201507','Sports Talk - Boxing: Manny Pacquiao vs Floyd Mayweather'),row('youtube-HCdHbU5Y4Jo','Jake Paul vs Mike Tyson: Now SANCTIONED, still FIXED?'),row('vts-01-1_20250403_1959','Mike Tyson vs. Evander Holyfield Fights pt. 1'));
bad.push(row('watchalong','Mike Tyson vs Jake Paul Boxing Watchalong - Live Commentary (No Fight Footage)'),row('audio-stream','Mike Tyson vs Jake Paul Boxing Commentary Only'),row('analysis','Mike Tyson vs Jake Paul Boxing Analysis'));
bad.push(row('unhydrated-legacy','Sonny Liston vs Gerhard Zech',{media:{type:'video',url:'https://archive.org/download/SonnyListonVsGerhardZech/SonnyListonVsGerhardZech_512kb.mp4',width:320,height:240}}));
good.push(row('commentated-bout','Mike Tyson vs Douglas Full Fight with English Commentary'));
test('boxing subject tags and stale verified flags cannot admit fiction, games or unrelated formats',async()=>{
 const {iaKnownVideoPolicyViolation,qualifyIaFileRecord}=await import('../ia_file_contract.js'),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
 for(const item of bad){assert.equal(relay.boxing.gate('56',item),false,'relay: '+item.title);assert.equal(iaKnownVideoPolicyViolation(item,{channel:'56'}),true,'policy: '+item.title);assert.equal(catalogFallbackAllowed(item,{channel:'56',mediaTypes:['movies']}),false,'D1: '+item.title);assert.equal(qualifyIaFileRecord(item,{channel:'56',mediaTypes:['movies']}).accepted,false,'file: '+item.title);}
});
test('actual bouts, cards and substantial boxing documentaries survive without relying on search keywords',async()=>{
 const {iaKnownVideoPolicyViolation,qualifyIaFileRecord}=await import('../ia_file_contract.js'),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
 for(const item of good){assert.equal(relay.boxing.gate('56',item),true,'relay: '+item.title);assert.equal(iaKnownVideoPolicyViolation(item,{channel:'56'}),false,'policy: '+item.title);assert.equal(catalogFallbackAllowed(item,{channel:'56',mediaTypes:['movies'],denyTerms:['mma']}),true,'D1: '+item.title);assert.equal(qualifyIaFileRecord(item,{channel:'56',mediaTypes:['movies']}).accepted,true,'file: '+item.title);}
 const elsewhere=bad.find(x=>x.identifier==='KillersWife');assert.equal(iaKnownVideoPolicyViolation(elsewhere,{channel:'10'}),false,'the sitcom remains eligible for TV');assert.equal(iaKnownVideoPolicyViolation(bad.find(x=>x.identifier.startsWith('UFC100')),{channel:'52'}),false,'MMA retains its own lane');
 assert.equal(iaKnownVideoPolicyViolation({identifier:'new-boxing-index',title:'Championship Boxing Full Card',subject:'boxing'},{channel:'56'}),false,'unresolved catalog records may still be hydrated in the background');
});
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': saved boxing queues reapply the same genre contract',()=>{
 const s=fs.readFileSync(file,'utf8'),c={};vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function iaKnownVideoPolicyViolation('),s.indexOf('function iaProgramDenyTerms(')),c);
 for(const item of bad)assert.equal(c.iaCachedProgramAllowed({num:56},item),false,'saved: '+item.title);
 for(const item of good)assert.equal(c.iaCachedProgramAllowed({num:56},item),true,'saved: '+item.title);
});
test('boxing repair retains substantial landscape file-level depth behind the small playing shelf',()=>{
 const files=relay.boxing.seeds('56',0).filter(x=>Number(x.media?.runtime)>=900&&Number(x.media?.width)>Number(x.media?.height));
 assert.ok(new Set(files.map(x=>x.identifier)).size>=45);assert.ok(new Set(files.map(x=>x.sourceIdentifier)).size>=40);assert.ok(files.every(x=>relay.boxing.gate('56',x)));assert.ok(files.some(x=>x.year<1970));assert.ok(files.some(x=>x.year>=2020));
});
test('a stale full D1 boxing shelf cannot mask the repaired relay catalog',async()=>{
 const {default:api,compactCatalogItem}=await import('../realsignal_api_v2_worker.js?boxing-bank-test');
 const old=Array.from({length:25},(_,i)=>row('old-boxing-'+i,'Championship Boxing Full Card '+(1980+i)));
 const dbRows=old.map(compactCatalogItem).map(x=>({id:x.id,provider:x.provider,source_identifier:x.sourceIdentifier,title:x.title,description:x.description,duration_seconds:x.duration,aspect_ratio:x.aspectRatio,media_type:x.mediaType,media_url:x.mediaUrl,source_url:x.sourceUrl,rights:x.rights,year:x.year,metadata_json:JSON.stringify(x)}));
 const bank=relay.boxing.seeds('56',0).filter(x=>x.media?.metadataVerifiedAt&&x.media?.runtime>=900),pending=[];let calls=0;
 const env={realsignal_catalog:{prepare(sql){return{bind(){return this;},all:async()=>({results:/FROM programs p/.test(sql)?dbRows:[]}),first:async()=>null,run:async()=>({success:true})};},batch:async()=>[]},RELAY:{fetch:async()=>{calls++;return Response.json({channel:'56',items:bank.slice(0,5),candidateItems:bank,ready:5,candidates:bank.length,rotationApplied:true});}}};
 const r=await api.fetch(new Request('https://api.invalid/api/v3/ia/queue',{method:'POST',body:JSON.stringify({channel:'56',count:5,serverCatalog:true,queries:['boxing'],mediaTypes:['movies']})}),env,{waitUntil:p=>pending.push(p)});const d=await r.json();await Promise.allSettled(pending);assert.equal(r.status,200);assert.equal(d.ready,5);assert.equal(calls,1);assert.ok(d.candidateItems.length>=45);assert.ok(d.candidateItems.some(x=>x.sourceIdentifier==='manny-pacquiao-vs-mario-barrios-full-fight'));
});
