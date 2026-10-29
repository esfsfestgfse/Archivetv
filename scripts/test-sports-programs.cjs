const assert=require('node:assert/strict');
const {test}=require('node:test');
let sports={};try{sports=require('../assets/sports-programs.js');}catch{}
const race=(id,title,extra={})=>({identifier:id,id,title,runtime:7200,media:{type:'video',url:'https://archive.org/download/'+id+'/race.mp4',runtime:7200},...extra});
const game=(id,day,teams,extra={})=>race(id,'NBA '+day+' '+teams+' Full Game',extra);

test('sports behavior stays limited to the existing sports profiles',()=>{
 assert.equal(typeof sports.describe,'function');
 assert.equal(sports.enabled(50),false);assert.equal(sports.enabled(12),false);
 for(const channel of [51,52,56,60,70,78,83,84,'nascar-classics'])assert.equal(sports.enabled(channel),true);
 assert.equal(sports.describe(race('film','Daytona 500 1990'),12).eventId,'');
});
test('Archive and official NASCAR copies identify the same race',()=>{
 assert.equal(typeof sports.describe,'function');
 const a=sports.describe(race('ia-a','Daytona 500 — Full Broadcast (1990)'),54);
 const b=sports.describe(race('nascar:b','Daytona 500 1990 — Full Race Broadcast',{provider:'NASCAR Classics',officialReplay:true}),'nascar-classics');
 assert.ok(a.eventId);assert.equal(a.eventId,b.eventId);
 assert.notEqual(a.eventId,sports.describe(race('other','Daytona 500 1991 Full Race'),54).eventId);
});
test('selected episodes, dates, parts and formats retain distinct identities',()=>{
 assert.equal(typeof sports.describe,'function');
 const child=race('season::1991 Daytona 500 Full Race.mp4','NASCAR 1990-1992 complete collection',{fileName:'1991 Daytona 500 Full Race.mp4'});
 assert.equal(sports.describe(child,54).year,1991);
 const a=game('a','1998-06-14','Chicago Bulls vs Utah Jazz'),b=game('b','1998-06-14','Utah Jazz vs Chicago Bulls');
 assert.equal(sports.describe(a,58).eventId,sports.describe(b,58).eventId);
 assert.notEqual(sports.describe(a,58).eventId,sports.describe(game('c','1998-06-12','Chicago Bulls vs Utah Jazz'),58).eventId);
 assert.equal(sports.describe(game('year-only','1998','Chicago Bulls vs Utah Jazz'),58).eventId,'','a season cannot identify one matchup');
 assert.notEqual(sports.describe(race('p1','1990 Daytona 500 Full Race Part 1'),54).eventId,sports.describe(race('p2','1990 Daytona 500 Full Race Part 2'),54).eventId);
 assert.equal(sports.describe(race('doc','Daytona 500 1990 Documentary'),54).eventId,'');
 const card=sports.describe(race('ufc','UFC 100 Full Event'),56),bout=sports.describe(race('fight','UFC 100 Brock Lesnar vs Frank Mir Full Fight'),56);
 assert.ok(card.eventId);assert.notEqual(card.eventId,bout.eventId);
 const genericFile=race('tape::broadcast.mp4','Daytona 500 1990 Full Race',{fileName:'broadcast.mp4'});
 assert.equal(sports.describe(genericFile,54).eventId,sports.describe(race('other-copy','Daytona 500 1990 Full Race'),54).eventId);
});
test('upload dates and broad collections do not manufacture event identities',()=>{
 assert.equal(typeof sports.describe,'function');
 for(const item of [race('a','NBA complete games',{uploadDate:'1998-06-14'}),race('b','NFL 1990 games and recordings'),race('c','UFC compilation and highlights')])assert.equal(sports.describe(item,53).eventId,'');
});
test('generic split filenames and Formula series remain distinct events',()=>{
 const part=n=>race('race::Part '+n+'.mp4','Daytona 500 1990 Full Race');
 assert.notEqual(sports.key(part(1),54),sports.key(part(2),54));
 const formula=n=>race('formula'+n,'2023 Formula '+n+' British Grand Prix Full Race');
 assert.notEqual(sports.key(formula(1),54),sports.key(formula(2),54));
});
test('reselecting a cached sports shelf preserves verified recovery inventory',()=>{
 const a=race('a','Daytona 500 1990 Full Race'),b=race('b','Daytona 500 1990 Full Race');
 const shelf=sports.select([a,b],{channel:54,count:5});
 const restored=sports.select(shelf,{channel:54,count:5});
 assert.equal(restored[0].sportsCopies.length,1);
 assert.equal(restored[0].sportsCopies[0].identifier,'b');
});
test('race sessions remain separate and Super Bowl numbering has one identity',()=>{
 const full=sports.describe(race('r','2023 Canadian Grand Prix Full Race'),54);
 const qualifying=sports.describe(race('q','2023 Canadian Grand Prix Qualifying Full Broadcast'),54);
 const sprint=sports.describe(race('s','2023 Canadian Grand Prix Sprint Race Full Broadcast'),54);
 assert.notEqual(full.eventId,qualifying.eventId);assert.notEqual(full.eventId,sprint.eventId);
 const roman=sports.describe(race('sb-a','Super Bowl XX Full Game'),51),numeric=sports.describe(race('sb-b','Super Bowl 20 Complete Game'),51);
 assert.ok(roman.eventId);assert.equal(roman.eventId,numeric.eventId);
 assert.equal(sports.describe(game('invalid','1998-02-31','Chicago Bulls vs Utah Jazz'),58).eventId,'');
});
test('shelves group duplicate events while preserving full recovery records and inventory',()=>{
 assert.equal(typeof sports.select,'function');
 const a=race('a','Daytona 500 1990 Full Race'),b=race('b','Daytona 500 1990 Full Race'),c=race('c','1991 Indianapolis 500 Full Race');
 const inventory=[a,b,c],before=JSON.stringify(inventory),shelf=sports.select(inventory,{channel:54,count:5});
 assert.equal(shelf.length,2);assert.equal(JSON.stringify(inventory),before);
 const daytona=shelf.find(i=>sports.describe(i,54).eventId===sports.describe(a,54).eventId);
 assert.equal(daytona.sportsCopies.length,1);assert.equal(daytona.sportsCopies[0].identifier,'b');
 assert.equal(daytona.sportsCopies[0].media.url,b.media.url);
 assert.equal(sports.select([race('x','Unknown basketball game'),race('y','Unknown basketball game')],{channel:58,count:5}).length,2);
});
test('rotation spreads competitions, participants and eras without hiding sparse inventory',()=>{
 assert.equal(typeof sports.select,'function');
 const rows=[game('a','1998-01-01','Chicago Bulls vs Utah Jazz'),game('b','1998-01-02','Chicago Bulls vs Detroit Pistons'),game('c','2016-01-01','Golden State Warriors vs Cleveland Cavaliers'),race('d','UFC 100 Full Event')];
 const first=sports.select(rows,{channel:53,count:3,history:[rows[0]]});
 assert.notEqual(first[0].id,'a');assert.notEqual(first[0].id,'b');assert.ok(first.some(i=>i.id==='d'));assert.ok(first.some(i=>i.id==='c'));
 assert.equal(sports.select([rows[0],rows[1]],{channel:58,count:5}).length,2);
 assert.deepEqual(sports.select(rows,{channel:12,count:3}),rows.slice(0,3));
});
test('recovery retries a complete matching record, is bounded and cancels on another tune',async()=>{
 assert.equal(typeof sports.recovery,'function');
 const a=race('a','Daytona 500 1990 Full Race'),b=race('b','Daytona 500 1990 Full Race'),bad=race('bad','Daytona 500 1991 Full Race');a.sportsCopies=[bad,b];
 const calls=[],r=sports.recovery(a,{channel:54,isCurrent:()=>true,play:async item=>{calls.push(item);return item.id==='b';}});
 assert.equal(await r.start(),true);assert.deepEqual(calls.map(x=>x.id),['a','b']);assert.equal(calls[1].media.url,b.media.url);
 let active=true;const calls2=[],old=sports.recovery(a,{channel:54,isCurrent:()=>active,play:async item=>{calls2.push(item.id);active=false;return false;}});
 assert.equal(await old.start(),false);assert.deepEqual(calls2,['a']);
 const many=race('many','Daytona 500 1990 Full Race');many.alts=Array.from({length:9},(_,i)=>'https://ia80000'+i+'.us.archive.org/0/items/many/race.mp4');
 let attempts=0;assert.equal(await sports.recovery(many,{channel:54,isCurrent:()=>true,play:async()=>{attempts++;return false;}}).start(),false);assert.equal(attempts,3);
});
test('midstream recovery requires matching file timelines and ignores stale callbacks',async()=>{
 assert.equal(typeof sports.recovery,'function');
 const hash='a'.repeat(32),a=race('a','Daytona 500 1990 Full Race'),b=race('b','Daytona 500 1990 Full Race');
 a.media.md5=hash;b.media.md5=hash;
 const edited=race('edited','Daytona 500 1990 Full Race',{runtime:6000,media:{type:'video',url:'https://archive.org/download/edited/race.mp4',runtime:6000}});a.sportsCopies=[edited,b];
 const plays=[];let failed=0;const r=sports.recovery(a,{channel:54,isCurrent:()=>true,play:async(item,control)=>{plays.push({item,control});return true;},onExhausted:()=>{failed++;}});
 assert.equal(await r.start(),true);await plays[0].control.onFailure(120,7200);
 assert.equal(plays.length,2);assert.equal(plays[1].item.id,'b');assert.equal(plays[1].control.seekSeconds,120);
 await plays[0].control.onFailure(121,7200);assert.equal(plays.length,2);
 await plays[1].control.onFailure(123,7200);assert.equal(failed,1);
});
