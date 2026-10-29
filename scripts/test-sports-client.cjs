const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
const Sports=require('../assets/sports-programs.js');
for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
 test(file+': native sports recovery uses the backup identity and private playback controls',async()=>{
  const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');
  const start=s.indexOf('function playFile('),end=s.indexOf('function playFileOnce(');assert.ok(end>start,'shared sports playback facade must exist');
  const calls=[],c={window:{RealSignalSports:Sports},token:7,powered:true,curNum:54,iaCachedProgramAllowed:()=>true,nlog(){},refreshGuideData(){},
   playFileOnce:async(item,ch,sl,my,fallback,control)=>{calls.push({item,control});return item.id==='backup';}};
  vm.createContext(c);vm.runInContext(s.slice(start,end),c);
  const row={id:'primary',title:'Daytona 500 1990 Full Race',type:'video',url:'https://archive.org/download/primary/race.mp4',runtime:7200,
   sportsCopies:[{identifier:'backup',title:'Daytona 500 — Full Broadcast (1990)',runtime:7200,recoveryVerified:true,subject:'NASCAR',media:{type:'video',url:'https://archive.org/download/backup/race.mp4',runtime:7200,width:640,height:480}}]};
  assert.equal(await c.playFile(row,{num:54},{},7,0),true);assert.deepEqual(calls.map(x=>x.item.id),['primary','backup']);
  assert.equal(calls[1].item.url,row.url);assert.equal(row.id,'backup');assert.equal(row.title,'Daytona 500 — Full Broadcast (1990)');
  assert.equal(calls[1].item.meta.recoveryVerified,true);assert.equal(typeof calls[1].control.onFailure,'function');
 });
 test(file+': Cast handoff bypasses local sports recovery',async()=>{
  const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),start=s.indexOf('function playFile('),end=s.indexOf('function playFileOnce(');assert.ok(end>start);
  let calls=0;const c={window:{RealSignalSports:Sports,__rsCastIsConnected:()=>true},playFileOnce:async()=>{calls++;return true;}};
  vm.createContext(c);vm.runInContext(s.slice(start,end),c);assert.equal(await c.playFile({id:'one',url:'https://archive.org/one'}, {num:54},{},7,0),true);assert.equal(calls,1);
 });
 test(file+': receiver playback remains owned by its existing Cast transport',async()=>{
  const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),start=s.indexOf('function playFile('),end=s.indexOf('function playFileOnce(');assert.ok(end>start);
  let control;const c={window:{RealSignalSports:Sports},document:{body:{classList:{contains:()=>true}}},token:7,powered:true,curNum:54,iaCachedProgramAllowed:()=>true,
   playFileOnce:async(item,ch,sl,my,fallback,options)=>{control=options;return true;}};
  vm.createContext(c);vm.runInContext(s.slice(start,end),c);assert.equal(await c.playFile({id:'one',title:'Daytona 500 1990 Full Race',type:'video',url:'https://archive.org/download/one/race.mp4'}, {num:54},{},7,0),true);assert.equal(control,undefined);
 });
 test(file+': a stalled sports file hands failure to its event recovery owner',()=>{
  const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),handlers={};let timer,recovered=0,retries=0;
  const video={currentTime:120,duration:7200,load(){this.currentTime=0;},addEventListener:(type,fn)=>{(handlers[type]||=[]).push(fn);},removeEventListener(){}};
  const control={onFailure:at=>{assert.equal(at,120);recovered++;}};
  const c={token:7,powered:true,curVideo:video,curNum:54,clearStall(){},showBuffer(){},byNum:()=>({num:54}),iaRetry(){retries++;},setTimeout:fn=>{timer=fn;return 1;},v:video,sig:{},done:true,it:{},my:7,nlog(){},tryAlternate:()=>false,sportsControl:control};
  vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function armStall('),s.indexOf('function clearStall(')),c);
  const start=s.indexOf('v.addEventListener("error",()=>',s.indexOf('function playFileOnce(')),end=s.indexOf('},{signal:sig});',start)+17;
  vm.runInContext(s.slice(start,end),c);
  c.armStall(7,control);timer();handlers.error.forEach(fn=>fn());assert.equal(recovered,1);assert.equal(retries,0);
 });
}
