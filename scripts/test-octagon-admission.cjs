const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={console,URL,Request,Response,Headers,AbortController,TextEncoder,Date,setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(fs.readFileSync('afterglow_ais_relay_worker.js','utf8').replace('export default','const worker=')+';globalThis.octagon={gate:iaStationQualityGate,seeds:orderedIaEmergencySeeds};',c);
const row=(id,title,extra={})=>({identifier:id,title,subject:'mixed martial arts MMA kickboxing',genreVerified:true,recoveryVerified:true,media:{type:'video',url:'https://archive.org/download/'+id.split('::')[0]+'/'+encodeURIComponent(id.split('::')[1]||'event.mp4'),runtime:7200,width:640,height:480,verification:'transport',verifiedAt:Date.now()},...extra});
const bad=[
 row('MuhammadAliVsSonnyListon','Muhammad Ali vs Sonny Liston',{subject:'boxing championship'}),
 row('espn-boxing-card','ESPN Top Rank Boxing Full Card',{subject:'boxing sports'}),
 row('best-of-ufc::06.Top UFC Trilogies.mp4','Best of UFC'),
 row('ufc-undisputed-3::UFC_100.mp4','UFC 100 Full Event'),
 row('ufc-3-game-free-download-pc','UFC 3 Game Free Download PC'),
 row('kung-fu-monk','The Last Kungfu Monk Full HD Movie #films #UFC #MMA'),
 row('octagon-1980','The Octagon (1980) Chuck Norris Full Movie'),
 row('pride-cartoon','Pride FC 1',{collection:['animationandcartoons'],subject:'anime cartoon'}),
 row('interview','UFC 135 Josh Koscheck Interview'),
 row('watchalong','UFC 229 Khabib vs McGregor Watchalong - No Fight Footage'),
 row('tutorial','UFC MMA Ground and Pound Tutorial'),
 row('workout','MMA Workout and Training Demo'),
 row('weigh-ins','UFC 100 Weigh In Full Show'),
 row('countdown','UFC 229 Countdown Show'),
 row('news','UFC 229 Fight Predictions and News Analysis'),
 row('short','UFC 229 Full Event',{media:{type:'video',url:'https://archive.org/download/short/event.mp4',runtime:80,width:640,height:480}}),
 row('unknown-runtime','UFC 229 Full Event',{media:{type:'video',url:'https://archive.org/download/unknown/event.mp4',width:640,height:480}}),
 row('wrestling','WWE WrestleMania Full Event'),
 row('anonymous','Community Meeting',{description:'A guest likes UFC and mixed martial arts.'})
];
bad.push(row('latino-child','UFC FN Rodriguez vs Lemos Main Card ESPN 720p Latino'),row('japanese-broadcast','PRIDE Shockwave 2004 Japanese Broadcast'),row('CSPAN_2026','Sec. Rubio & UFC CEO Dana White Sign Agreement on Sports Diplomacy 2026'));
bad.push(row('2002-08-28-dynamite-summer-night-fever-in-kunitachi::1997_10_11_Pride_1.mp4','PRIDE FC 1 Full Event'));
bad.push(row('gb-2300-11035-IDZ07GL','Quick Look: EA Sports UFC 2'),row('weighin','UFC 229 Weighin Full Show'),row('seminar','UFC 100 MMA Seminar and Panel Discussion'));
bad.push(row('mpmc-MC_Sports_-_Palo_Alto_Little_League-Healthy_Pets_vs_Strikeforce_May_4_2019','MC Sports: Palo Alto Little League-Healthy Pets vs Strikeforce, May 4 2019',{subject:'baseball youth sports little league'}));
bad.push(row('BigFight_Bellator-237-plus-BONUS-FIGHTS-12.28.19::Bellator 237 + RIZIN Postlims (Dec. 28th, 2019)/12 - Haruo Ochi Vs. Jarred Brooks-2.mp4','RIZIN — Haruo Ochi vs Jarred Brooks Full Fight'));
const good=[row('ufc1-10::UFC.005.The.Return.of.the.Beast.1995.mp4','UFC 5 — The Return of the Beast Full Event'),row('pride13','PRIDE FC 13 Collision Course Full Event'),row('bellator237','Bellator 237 Full Event'),row('one2016','ONE Championship 27 Aug 2016'),row('k1','K-1 World Grand Prix 2005 Final'),row('pancrase','King of Pancrase Tournament 1994'),row('iafc','IAFC Absolute World Championship Tournament 1995'),row('documentary','UFC Documentary: The Early Years'),row('full-commentary','UFC 100 Full Event with English Commentary',{description:'Retains interviews, intermission highlights and original commercials during the complete card.'})];
good.push(row('bellator-main','Bellator MMA 142 x GLORY Kickboxing 23.5 Dynamite Part 2 Main Card'),row('bellator-prelims','Bellator MMA 142 Prelims'));
good.push(row('strikeforce','Strikeforce Challengers Full Event'),row('BigFight_Bellator-237-plus-BONUS-FIGHTS-12.28.19::Bellator 237 + RIZIN Postlims (Dec. 28th, 2019)/12 - Haruo Ochi Vs. Jarred Brooks-2.ia.mp4','RIZIN — Haruo Ochi vs Jarred Brooks Full Fight'));
test('Octagon excludes boxing, compilations and non-program formats across relay/API/file admission',async()=>{
 const {iaKnownVideoPolicyViolation,qualifyIaFileRecord}=await import('../ia_file_contract.js'),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
 for(const item of bad){assert.equal(c.octagon.gate('52',item),false,'relay: '+item.title);assert.equal(iaKnownVideoPolicyViolation(item,{channel:'52'}),true,'policy: '+item.title);assert.equal(catalogFallbackAllowed(item,{channel:'52',mediaTypes:['movies']}),false,'D1: '+item.title);assert.equal(qualifyIaFileRecord(item,{channel:'52',mediaTypes:['movies']}).accepted,false,'file: '+item.title);}
});
test('full MMA/kickboxing cards, bouts and substantial documentaries remain eligible',async()=>{
 const {iaKnownVideoPolicyViolation,qualifyIaFileRecord}=await import('../ia_file_contract.js'),{catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
 for(const item of good){assert.equal(c.octagon.gate('52',item),true,'relay: '+item.title);assert.equal(iaKnownVideoPolicyViolation(item,{channel:'52'}),false,'policy: '+item.title);assert.equal(catalogFallbackAllowed(item,{channel:'52',mediaTypes:['movies']}),true,'D1: '+item.title);assert.equal(qualifyIaFileRecord(item,{channel:'52',mediaTypes:['movies']}).accepted,true,'file: '+item.title);}
 assert.equal(iaKnownVideoPolicyViolation(bad[0],{channel:'56'}),false,'boxing remains on56');assert.equal(iaKnownVideoPolicyViolation({identifier:'ufc-index',title:'UFC 200 Full Event'},{channel:'52'}),false,'unresolved discovery indexes remain candidates');
});
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': stale Octagon shelves cannot bypass current genre policy',()=>{
 const s=fs.readFileSync(file,'utf8'),ctx={};vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('function iaKnownVideoPolicyViolation('),s.indexOf('function iaProgramDenyTerms(')),ctx);
 for(const item of bad)assert.equal(ctx.iaCachedProgramAllowed({num:52},item),false,'saved: '+item.title);
 for(const item of good)assert.equal(ctx.iaCachedProgramAllowed({num:52},item),true,'saved: '+item.title);
});
test('Octagon exposes the real collection files with individual event names and substantial runtimes',()=>{
 const rows=c.octagon.seeds('52',0).filter(x=>x.media?.metadataVerifiedAt&&x.media?.runtime>=900);assert.ok(rows.length>=35);assert.ok(rows.every(x=>c.octagon.gate('52',x)));assert.ok(new Set(rows.map(x=>x.sourceIdentifier)).size>=20);
 const ufc=rows.filter(x=>x.sourceIdentifier==='ufc.1-10.-webrip.-h-264-wiz');assert.equal(ufc.length,6,'the advertised 1–10 parent actually contains six playable files');assert.equal(new Set(ufc.map(x=>x.title)).size,6);assert.ok(ufc.some(x=>/UFC 3 /.test(x.title)));assert.ok(rows.some(x=>x.sourceIdentifier==='ufc.-324.-hdtv.-h-264-rbb'));assert.ok(rows.some(x=>/PRIDE|Pride/.test(x.title)));assert.ok(rows.some(x=>/Bellator/.test(x.title)));assert.ok(rows.some(x=>/K-1/.test(x.title)));
 const bonus=rows.filter(x=>x.sourceIdentifier==='BigFight_Bellator-237-plus-BONUS-FIGHTS-12.28.19'&&/\/(?:9|10|12|13|14) -/.test(x.fileName));assert.equal(bonus.length,5);assert.ok(bonus.every(x=>/\.ia\.mp4$/i.test(x.fileName)),'audio-only originals must not replace the decoded H.264 versions');
 assert.ok(rows.every(x=>x.media.alts?.length>=1),'working same-file origins must survive the bank handoff');
 for(const x of rows)for(const url of x.media.alts)assert.ok(decodeURIComponent(new URL(url).pathname).endsWith('/'+x.sourceIdentifier+'/'+x.fileName),'recovery must retain the exact selected child file');
});
test('an older full D1 catalog cannot mask the repaired Octagon file bank',async()=>{
 const {default:api,compactCatalogItem}=await import('../realsignal_api_v2_worker.js?octagon-depth-test');const old=Array.from({length:25},(_,i)=>row('old-ufc-'+i,'UFC '+(150+i)+' Full Event'));
 const dbRows=old.map(compactCatalogItem).map(x=>({id:x.id,provider:x.provider,source_identifier:x.sourceIdentifier,title:x.title,description:x.description,duration_seconds:x.duration,aspect_ratio:x.aspectRatio,media_type:x.mediaType,media_url:x.mediaUrl,source_url:x.sourceUrl,rights:x.rights,year:x.year,metadata_json:JSON.stringify(x)}));
 const bank=c.octagon.seeds('52',0).filter(x=>x.media?.metadataVerifiedAt&&x.media?.runtime>=900),pending=[];let calls=0;const env={realsignal_catalog:{prepare(sql){return{bind(){return this;},all:async()=>({results:/FROM programs p/.test(sql)?dbRows:[]}),first:async()=>null,run:async()=>({success:true})};},batch:async()=>[]},RELAY:{fetch:async()=>{calls++;return Response.json({channel:'52',items:bank.slice(0,5),candidateItems:bank,ready:5,candidates:bank.length,rotationApplied:true});}}};
 const r=await api.fetch(new Request('https://api.invalid/api/v3/ia/queue',{method:'POST',body:JSON.stringify({channel:'52',count:5,serverCatalog:true,queries:['mixed martial arts'],mediaTypes:['movies']})}),env,{waitUntil:p=>pending.push(p)});const d=await r.json();await Promise.allSettled(pending);assert.equal(r.status,200);assert.equal(d.ready,5);assert.equal(calls,1);assert.ok(d.candidateItems.length>=35);
});
