const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function fixture(audio = false) {
  const events = [], handlers = {}, frames = [];
  const node = { dataset: {}, tagName: audio ? 'AUDIO' : 'VIDEO', isConnected: true, videoWidth: 640, readyState: 4, paused: false,
    opacity: '1', getBoundingClientRect: () => ({ width: 640, height: 480 }), addEventListener: (type, handler) => { handlers[type] = handler; }, removeEventListener: (type, handler) => {if(handlers[type]===handler)delete handlers[type];}, requestVideoFrameCallback: fn => frames.push(fn) };
  const scope = { telemetryOn: true, activeTune: { seq: 1, channel: 10, at: 100 }, stamp: () => 200, currentTelemetryChannel: () => 10,
    document: { hidden: false }, currentChannel:()=>({num:10}), getComputedStyle: () => ({ opacity: node.opacity }), seenPrograms: [], currentProgramKey: () => 'episode', queueDepth: () => 3, push: e => events.push(e), requestAnimationFrame: fn => fn() };
  vm.createContext(scope);
  const source = fs.readFileSync(path.join(__dirname, '../assets/release2-runtime.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('  function observeMedia('), source.indexOf('  function formatMs(')), scope);
  return { scope, node, events, handlers, frames };
}

function programFixture(){
 const events=[],scope={activeTune:{seq:1,channel:10},seenPrograms:[],stamp:()=>100,
  report:{events},noteChannel(){},schedulePersist(){},queueRemote(){},document:{getElementById:()=>null},renderHealthView(){},syncLocalHealthPolicy(){}};
 vm.createContext(scope);const source=fs.readFileSync(path.join(__dirname,'../assets/release2-runtime.js'),'utf8');
 const tracker=source.indexOf('  function trackProgramStart(');
 if(tracker>=0)vm.runInContext(source.slice(tracker,source.indexOf('  function push(',tracker)),scope);
 vm.runInContext(source.slice(source.indexOf('  function push('),source.indexOf('  function boundedPush(')),scope);
 return {scope,events,start(key,channel=10,extra={}){scope.push({type:'first-visible-frame',channel,programKey:key,...extra});}};
}

test('confirmed A/B/A starts count a repeat without requiring another channel tune',()=>{
 const f=programFixture();for(const key of ['A','B','A'])f.start(key);
 assert.equal(f.events.filter(e=>e.type==='repeat').length,1);
 assert.equal(f.events.filter(e=>e.type==='repeat')[0].programKey,'A');
});

test('duplicate callbacks, empty identities and the same program on another channel are not repeats',()=>{
 const f=programFixture();f.start('A');f.start('A');f.start('');f.start('A',11);
 assert.equal(f.events.filter(e=>e.type==='repeat').length,0);
 f.scope.activeTune={seq:2,channel:10};f.start('A');assert.equal(f.events.filter(e=>e.type==='repeat').length,1);
});

test('verified YouTube clock starts join freshness history without fabricating visible frames',()=>{
 const f=programFixture();for(const key of ['A','B','A'])f.start(key,555,{type:'source-success',source:'YouTube-clock'});
 assert.equal(f.events.filter(e=>e.type==='repeat').length,1);
 assert.equal(f.events.filter(e=>e.type==='first-visible-frame').length,0);
 const empty=programFixture();empty.start('A',555,{type:'media-ready'});empty.start('A',555,{type:'source-success',source:'transport-probe'});
 assert.equal(empty.scope.seenPrograms.length,0,'load/probe readiness is not program playback');
});

test('confirmed program history is bounded',()=>{
 const f=programFixture();for(let i=0;i<300;i++)f.start('episode-'+i);
 assert.equal(f.scope.seenPrograms.length,250);
});

test('a pooled video changing files within one tune is re-armed and old frames stay stale',()=>{
 const f=fixture();f.node.src='https://media.example/A.mp4';f.scope.observeMedia(f.node);const stale=f.frames.shift();
 f.node.src='https://media.example/B.mp4';f.scope.currentProgramKey=()=> 'B';f.scope.observeMedia(f.node);
 assert.equal(f.frames.length,1);stale();assert.equal(f.events.length,0);
 f.frames.shift()();assert.equal(f.events.filter(e=>e.type==='first-visible-frame').length,1);
});

test('pooled native A/B/A frames reach the shared repeat counter',()=>{
 const media=fixture(),program=programFixture();media.scope.push=program.scope.push;
 for(const key of ['A','B','A']){media.node.src='https://media.example/'+key+'.mp4';media.scope.currentProgramKey=()=>key;media.scope.observeMedia(media.node);media.frames.shift()();}
 assert.equal(program.events.filter(e=>e.type==='first-visible-frame'||e.type==='source-success'&&e.source==='video-frame').length,3);
 assert.equal(program.events.filter(e=>e.type==='repeat').length,1);
});

test('automatic next program cannot reuse the original channel first-frame latency',()=>{
 const media=fixture(),program=programFixture();media.scope.push=program.scope.push;
 for(const key of ['A','B']){media.node.src='https://media.example/'+key+'.mp4';media.scope.currentProgramKey=()=>key;media.scope.observeMedia(media.node);media.frames.shift()();}
 assert.equal(program.events.filter(e=>e.type==='first-visible-frame').length,1);
 assert.equal(program.events.filter(e=>e.type==='source-success'&&e.source==='video-frame'&&e.programKey==='B').length,1);
});

test('long-running automatic progression tracks starts without inventing tune latency',()=>{
 const media=fixture(),program=programFixture();media.scope.push=program.scope.push;media.scope.stamp=()=>200000;
 for(const key of ['A','B','A']){media.node.src='https://media.example/'+key+'.mp4';media.scope.currentProgramKey=()=>key;media.scope.observeMedia(media.node);media.frames.shift()();}
 assert.equal(program.events.filter(e=>e.type==='first-visible-frame').length,0);
 assert.equal(program.events.filter(e=>e.type==='repeat').length,1);
 assert.ok(program.events.filter(e=>e.type==='source-success').every(e=>e.ms==null));
});
test('superseded media cannot report stalls or errors against a newer channel', () => {
  const f = fixture(); f.scope.observeMedia(f.node); f.scope.activeTune = { seq: 2, channel: 11, at: 150 };
  f.handlers.stalled(); f.handlers.error();
  assert.equal(f.events.length, 0);
});
test('audio start is not a visible video frame', () => {
  const f = fixture(true); f.scope.observeMedia(f.node); f.handlers.playing();
  assert.equal(f.events.filter(e => e.type === 'first-visible-frame').length, 0);
  assert.equal(f.events.filter(e => e.type === 'source-success').length, 1);
});
test('missing tune origin does not fabricate a first-frame latency', () => {
  const f = fixture(); f.scope.activeTune = null; f.scope.observeMedia(f.node); f.frames.shift()();
  assert.equal(f.events.filter(e => e.type === 'first-visible-frame').length, 0);
});
test('a staged first callback retries after promotion and records exactly one visible frame', () => {
  const f = fixture();f.node.opacity='0';f.scope.observeMedia(f.node);f.frames.shift()();
  assert.equal(f.events.length,0);assert.equal(f.frames.length,1,'wait for a real frame after the transparent staging callback');
  f.node.opacity='1';f.frames.shift()();f.handlers.playing();
  assert.equal(f.events.filter(e=>e.type==='first-visible-frame').length,1);assert.equal(f.frames.length,0);
});
test('staged retries stop when the media is disconnected or the tune is superseded', () => {
  for(const disconnect of [false,true]){
    const f=fixture();f.node.opacity='0';f.scope.observeMedia(f.node);f.frames.shift()();
    assert.equal(f.frames.length,1);
    if(disconnect)f.node.isConnected=false;else f.scope.activeTune={seq:2,channel:11,at:150};
    f.frames.shift()();assert.equal(f.frames.length,0);assert.equal(f.events.length,0);
  }
});
function metricScope(extra={}){
  const source=fs.readFileSync(path.join(__dirname,'../assets/release2-runtime.js'),'utf8'),scope={...extra};vm.createContext(scope);
  for(const [start,end]of [['  function queueDepth(','  function deviceStatus('],['  function percentile(','  function queueDepth('],['  function summary(','  function median('],['  function median(','  function remoteDepth(']]){
    vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),scope);
  }
  return scope;
}
test('promoted IA queue depth comes from its real owner, not a stale legacy shelf',()=>{
 const scope=metricScope({currentChannel:()=>({num:150}),curNum:150,iaProgramQueues:{150:[1,2,3,4,5]},iaRepairEnabled:()=>true,iaQueueKey:ch=>String(ch.num),window:{RealSignalIAShelf:{client:()=>({rows:key=>key==='150'?[{id:'next1'},{id:'next2'}]:[]})}}});
 assert.equal(scope.queueDepth(),2);
});
test('an empty promoted shelf is measured as zero instead of falling back to stale entries',()=>{
 const scope=metricScope({currentChannel:()=>({num:150}),curNum:150,iaProgramQueues:{150:[1,2,3]},iaRepairEnabled:()=>true,iaQueueKey:ch=>String(ch.num),window:{RealSignalIAShelf:{client:()=>({rows:()=>[]})}}});
 assert.equal(scope.queueDepth(),0);
});
test('current queue depth comes from the live owner rather than the historical maximum',()=>{
 const scope=metricScope({report:{events:[{type:'queue-sample',channel:150,depth:5},{type:'queue-sample',channel:150,depth:2}],sessions:1},seenPrograms:[],deviceStatus:()=>({}),currentChannel:()=>({num:150})});
 scope.queueDepth=()=>2;
 assert.equal(scope.summary().queueCurrent,2);assert.equal(scope.summary().queueMax,5);
});
test('unknown server measurements stay unknown, while measured zero remains valid',()=>{
 const scope=metricScope();
 assert.equal(scope.remoteMetric([{ms:null},{ms:2200}],'ms'),2200);
 assert.equal(scope.remoteMetric([{ms:null},{}],'ms'),null);
 assert.equal(scope.remoteMetric([{ms:0},{ms:2200}],'ms'),0);
});
test('current queue does not leak the latest sample from a different channel',()=>{
 const report={events:[{type:'queue-sample',channel:150,depth:5},{type:'queue-sample',channel:54,depth:2}],sessions:1};
 const scope=metricScope({report,seenPrograms:[],deviceStatus:()=>({}),currentChannel:()=>({num:905})});
 scope.queueDepth=()=>null;
 assert.equal(scope.summary().queueCurrent,null);
 scope.queueDepth=()=>2;assert.equal(scope.summary().queueCurrent,2);
});

test('Source Suite candidate catalogs are not misreported as ready media',()=>{
 const scope=metricScope({currentChannel:()=>({num:555,previewKey:'cartoon-time-machine'}),curNum:555,v2PreviewState:{555:{items:[1,2,3,4,5]}},window:{}});
 assert.equal(scope.queueDepth(),null);
});

test('unique programs counts identities rather than repeat-start records',()=>{
 const scope=metricScope({report:{events:[],sessions:1},seenPrograms:[{key:'A'},{key:'B'},{key:'A'}],deviceStatus:()=>({}),currentChannel:()=>({num:10})});scope.queueDepth=()=>null;
 assert.equal(scope.summary().uniquePrograms,2);
});

test('advertisements, signoff and missing identity cannot become channel-program freshness',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/release2-runtime.js'),'utf8'),scope={curItem:null};vm.createContext(scope);
 vm.runInContext(source.slice(source.indexOf('  function currentProgramKey('),source.indexOf('  function recoverSource(')),scope);
 assert.equal(scope.currentProgramKey(),'');scope.curItem={id:'spot',isAd:true};assert.equal(scope.currentProgramKey(),'');
 scope.curItem={id:'signoff',isSignoff:true};assert.equal(scope.currentProgramKey(),'');scope.curItem={id:'episode'};assert.equal(scope.currentProgramKey(),'episode');
});

test('explicit embed failures appear in summary and per-channel counters',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/release2-runtime.js'),'utf8'),report={events:[{type:'source-failure',channel:555,status:'start-timeout'}],sessions:1},row={channel:555,failures:0};
 const scope=metricScope({report,seenPrograms:[],deviceStatus:()=>({}),currentChannel:()=>({num:555}),channelRecord:()=>row});scope.queueDepth=()=>null;
 vm.runInContext(source.slice(source.indexOf('  function noteChannel('),source.indexOf('  function schedulePersist(')),scope);
 scope.noteChannel(report.events[0]);assert.equal(row.failures,1);assert.equal(scope.summary().sourceFailures,1);
});

test('paint fallback retries staging and stops when paused',()=>{
 const f=fixture(),paints=[];delete f.node.requestVideoFrameCallback;f.scope.requestAnimationFrame=fn=>paints.push(fn);f.node.opacity='0';f.scope.observeMedia(f.node);
 paints.shift()();paints.shift()();assert.equal(paints.length,1);
 f.node.paused=true;paints.shift()();paints.shift()();assert.equal(paints.length,0);assert.equal(f.events.length,0);
 f.node.opacity='1';f.node.paused=false;f.handlers.playing();paints.shift()();paints.shift()();
 assert.equal(f.events.filter(e=>e.type==='first-visible-frame').length,1);
});

test('a reused video is observed for its new tune without accepting stale callbacks',()=>{
 const f=fixture();f.scope.observeMedia(f.node);const stale=f.frames.shift();
 f.scope.activeTune={seq:2,channel:11,at:150};f.scope.observeMedia(f.node);
 assert.equal(f.frames.length,1,'the same DOM video must be re-armed for a new tune');stale();assert.equal(f.events.length,0);
 f.frames.shift()();assert.equal(f.events.filter(e=>e.type==='first-visible-frame').length,1);assert.equal(f.events[0].channel,11);
 f.scope.observeMedia(f.node);assert.equal(f.frames.length,0,'same-tune mutations do not create duplicate listeners');
});

test('Blues MP3 playback in the shared VIDEO element is measured as audio, not missing video',()=>{
 const f=fixture();f.node.videoWidth=0;f.scope.currentChannel=()=>({num:905,audio:true});f.scope.activeTune={seq:1,channel:905,at:100};f.scope.observeMedia(f.node);f.handlers.playing();
 assert.equal(f.events.filter(e=>e.type==='source-success'&&e.media==='audio'&&e.channel===905).length,1);
 assert.equal(f.events.filter(e=>e.type==='first-visible-frame').length,0);assert.equal(f.frames.length,0);
});

test('a failed destination tune cannot re-label retained outgoing media as its success',async()=>{
 const f=fixture(),source=fs.readFileSync(path.join(__dirname,'../assets/release2-runtime.js'),'utf8');f.scope.observeMedia(f.node);
 Object.assign(f.scope,{window:{tuneNum:async()=>false},tuneSeq:1,document:{...f.scope.document,querySelectorAll:()=>[f.node]}});
 const start=source.indexOf("    if(typeof window.tuneNum==='function'){");vm.runInContext(source.slice(start,source.indexOf('    var observer=new MutationObserver',start)),f.scope);
 await f.scope.window.tuneNum(54);while(f.frames.length)f.frames.shift()();
 assert.equal(f.events.filter(e=>e.type==='first-visible-frame'&&e.channel===54).length,0);
});

test('legacy depth counts resolved media, not pending or failed catalog entries',()=>{
 const scope=metricScope({currentChannel:()=>({num:54}),curNum:54,iaProgramQueues:{54:[{identifier:'ready'},{identifier:'pending'},{identifier:'failed'},{identifier:'metadata-only'}]},iaProgramMedia:{ready:{type:'video',url:'https://archive.org/download/ready/file.mp4'},pending:Promise.resolve({url:'later'}),failed:{type:'video',url:'https://archive.org/download/failed/file.mp4'}},iaProgramFailed:id=>id==='failed'});
 assert.equal(scope.queueDepth(),1);
});
