/* Boundary tests for RealSignal's lifecycle; the external SDK is controlled. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let completed = false;
process.once('beforeExit', () => { if (!completed) { console.error('YouTube lifecycle test did not complete (unsettled startup promise).'); process.exitCode = 1; } });
const source = fs.existsSync(path.join(__dirname, '../assets/youtube-embed-runtime.js'))
  ? fs.readFileSync(path.join(__dirname, '../assets/youtube-embed-runtime.js'), 'utf8') : '';
function harness(withSDK = true) {
  const players = [], nodes = [], timeouts = new Map(), intervals = new Map(), delays = new Map(); let seq = 0;
  class Player {
    constructor(frame, options) { this.frame = frame; this.events = options.events;this.listeners=new Map(); this.state = -1; this.time = 0;this.videoId=''; players.push(this); }
    addEventListener(name,fn){this.listeners.set(name,fn);}
    removeEventListener(name,fn){if(this.listeners.get(name)===fn)this.listeners.delete(name);}
    loadVideoById(id) {this.videoId=id;this.time=0;this.state=-1;this.loads=(this.loads||[]).concat(id);}
    getVideoData() {return {video_id:this.videoId};}
    stopVideo() {this.state=-1;this.stopped=true;}
    playVideo() { this.playRequests = (this.playRequests || 0) + 1; }
    pauseVideo() { this.state = 2; }
    getPlayerState() { return this.state; }
    getCurrentTime() { return this.time; }
    setVolume(n) { this.volume = n; }
    mute() { this.muted = true; } unMute() { this.muted = false; }
    destroy() { this.destroyed = true; }
    emit(name, data) { if (name === 'onStateChange') this.state = data; this.events[name]?.({target:this, data});this.listeners.get(name)?.({target:this,data}); }
  }
  const window = {location:{origin:'http://localhost:4190'}};
  if (withSDK) window.YT = {Player};
  const document = {head:{appendChild(node){nodes.push(node);}},createElement(tag){return {tagName:tag.toUpperCase(),dataset:{},style:{},remove(){this.removed=true;this.parentNode=null;}};}};
  vm.runInNewContext(source, {window, document, URL, setTimeout(fn,ms){timeouts.set(++seq,fn);delays.set(seq,ms);return seq;},clearTimeout(id){timeouts.delete(id);delays.delete(id);},setInterval(fn){intervals.set(++seq,fn);return seq;},clearInterval(id){intervals.delete(id);}});
  const api = window.RealSignalYouTubeEmbed;
  assert.ok(api, 'shared YouTube lifecycle is installed');
  let ready=0, started=0, ended=0, pending=0, failures=[];
  const options = {item:{id:'youtube:RQinquBq338',url:'https://www.youtube-nocookie.com/embed/RQinquBq338',title:'Full program',duration:1200},container:{children:[],appendChild(node){nodes.push(node);this.children.push(node);node.parentNode=this;}},isCurrent:()=>true,volume:0.6,muted:false,onReady(){ready++;},onStarted(){started++;},onEnded(){ended++;},onPending(){pending++;},onError(error){failures.push(error);}};
  return {api,options,players,nodes,window,timeouts,intervals,tick(){[...intervals.values()].forEach(fn=>fn());},expire(){[...timeouts.values()].forEach(fn=>fn());},expireAt(ms){[...timeouts].forEach(([id,fn])=>{if(delays.get(id)===ms){timeouts.delete(id);delays.delete(id);fn();}});},counts:()=>({ready,started,ended,pending,failures})};
}
async function flush(){for(let i=0;i<5;i++)await Promise.resolve();}
function handler(player,name){return player.listeners&&player.listeners.get(name)||player.events[name];}
(async()=>{
  let h=harness(),result;
  let late=h.api.play(h.options);await flush();let latePlayer=h.players[0];h.expireAt(12000);await late;latePlayer.emit('onReady');latePlayer.emit('onStateChange',1);latePlayer.time=1;h.tick();latePlayer.time=1.4;h.tick();h.api.prepare(h.options);await flush();assert.equal(h.players.length,1,'late readiness must clear failure so Next retains the recovered transport');h.api.stop();
  h=harness();let queued=h.api.play(h.options);await flush();let queuedPlayer=h.players[0];queuedPlayer.emit('onReady');queuedPlayer.emit('onStateChange',1);queuedPlayer.time=1;h.tick();queuedPlayer.time=1.4;h.tick();await queued;
  const oldState=handler(queuedPlayer,'onStateChange'),oldError=handler(queuedPlayer,'onError');
  queued=h.api.play({...h.options,item:{...h.options.item,url:'https://www.youtube-nocookie.com/embed/bgidrPhmpCA'}});await flush();
  queuedPlayer.videoId='RQinquBq338';oldError({target:queuedPlayer,data:150});assert.equal(h.counts().pending,0,'queued old error before metadata switches cannot settle the replacement');
  queuedPlayer.videoId='bgidrPhmpCA';queuedPlayer.emit('onStateChange',1);queuedPlayer.time=1;h.tick();queuedPlayer.time=1.4;h.tick();await queued;
  oldState({target:queuedPlayer,data:0});oldError({target:queuedPlayer,data:150});assert.equal(h.counts().ended,0,'queued old EOF cannot advance a different program');assert.equal(h.counts().failures.length,0,'queued old permanent error cannot reject a different program');h.api.stop();
  h=harness();
  assert.equal(typeof h.api.prepare,'function','prepare must create the player before discovery awaits');
  h.api.prepare(h.options);const prepared=h.nodes.find(n=>n.tagName==='IFRAME');await flush();let preparedPlayer=h.players[0];preparedPlayer.emit('onReady');
  assert.equal(h.counts().started,0,'preparing transport cannot count an unselected video as played');
  let preparedPlay=h.api.play(h.options);await flush();assert.equal(h.players.length,1,'catalog completion must reuse the prepared player');
  assert.equal(h.nodes.filter(n=>n.tagName==='IFRAME').length,1,'delayed selection cannot navigate a replacement iframe');
  assert.equal(preparedPlayer.loads[0],'RQinquBq338');preparedPlayer.emit('onStateChange',1);preparedPlayer.time=1;h.tick();preparedPlayer.time=1.4;h.tick();assert.equal((await preparedPlay).status,'playing');
  h.api.prepare(h.options);assert.equal(preparedPlayer.destroyed,undefined,'Next retains its working transport');
  const next={...h.options,item:{...h.options.item,url:'https://www.youtube-nocookie.com/embed/bgidrPhmpCA'}};preparedPlay=h.api.play(next);await flush();
  preparedPlayer.videoId='RQinquBq338';preparedPlayer.state=1;preparedPlayer.time=5;h.tick();preparedPlayer.time=6;h.tick();assert.equal(h.counts().started,1,'old video cannot promote the new program');
  preparedPlayer.emit('onStateChange',0);assert.equal(h.counts().ended,0,'old EOF cannot advance a replacement program');
  preparedPlayer.videoId='bgidrPhmpCA';preparedPlayer.emit('onStateChange',1);preparedPlayer.time=1;h.tick();preparedPlayer.time=1.4;h.tick();assert.equal((await preparedPlay).status,'playing');assert.equal(h.players.length,1);h.api.stop();assert.equal(prepared.removed,true);
  const replacement=h.api.play(h.options);await flush();let replacementPlayer=h.players[1];replacementPlayer.emit('onReady');replacementPlayer.emit('onStateChange',1);replacementPlayer.time=1;h.tick();replacementPlayer.time=1.4;h.tick();await replacement;
  preparedPlayer.emit('onStateChange',0);assert.equal(h.counts().ended,0,'destroyed transport EOF cannot advance the new transport');
  preparedPlayer.emit('onError',150);assert.equal(h.counts().failures.length,0,'destroyed transport cannot reject the new program');h.api.stop();
  h=harness();
  let promise=h.api.play(h.options).then(value=>{result=value;});await flush();
  let p=h.players[0];p.emit('onReady');h.tick();await flush();
  assert.equal(h.counts().ready,1);assert.equal(h.counts().started,0);assert.equal(result,undefined,'SDK ready is not playback');
  p.emit('onStateChange',1);p.time=0.016;h.tick();h.tick();await flush();
  assert.equal(result,undefined,'one stalled frame is not advancing playback');
  p.time=0.6;h.tick();await promise;assert.equal(result.status,'playing');assert.equal(h.counts().started,1);
  assert.equal(h.nodes[0].dataset.playbackState,'playing');
  h.api.volume(0.4,false);assert.equal(p.volume,40);assert.equal(p.muted,false);
  h.api.volume(0.4,true);assert.equal(p.muted,true);
  h.api.toggle();assert.equal(p.state,2);h.api.toggle();assert.ok(p.playRequests>=1);
  p.emit('onStateChange',0);p.emit('onStateChange',0);assert.equal(h.counts().ended,1,'EOF advances once');
  const old=handler(p,'onStateChange');h.api.stop();old({target:p,data:0});assert.equal(h.counts().ended,1);assert.equal(p.destroyed,true);assert.equal(h.intervals.size,0);assert.equal(h.timeouts.size,0);

  h=harness();promise=h.api.play(h.options);h.api.volume(0.1,true);await flush();p=h.players[0];p.emit('onReady');
  assert.equal(p.volume,10,'volume chosen during startup must win over the initial snapshot');assert.equal(p.muted,true);h.api.stop();await promise;

  h=harness();promise=h.api.play(h.options);await flush();p=h.players[0];p.emit('onReady');p.emit('onAutoplayBlocked');assert.equal(p.muted,true);assert.ok(p.playRequests>=1);assert.equal(h.counts().failures.length,0);
  h.expire();result=await promise;assert.equal(result.status,'pending','autoplay/startup timeout preserves the program');assert.equal(h.counts().ended,0,'duration/timeout must never advance');
  p.emit('onStateChange',1);p.time=1;h.tick();p.time=1.4;h.tick();assert.equal(h.counts().started,1,'late user Play can recover the same program');
  h.api.stop();

  h=harness();promise=h.api.play(h.options);await flush();p=h.players[0];p.emit('onReady');h.expire();assert.equal((await promise).status,'pending');
  p.emit('onError',150);assert.equal(h.counts().failures.length,1,'a permanent error after pending still notifies the client');

  for(const code of [100,101,150,5,153]){
    h=harness();promise=h.api.play(h.options);await flush();h.players[0].emit('onReady');h.players[0].emit('onError',code);result=await promise;
    assert.equal(result.status,[100,101,150].includes(code)?'unavailable':'pending',`error ${code} classification`);assert.equal(h.counts().ended,0);
    h.api.stop();
  }
  h=harness();promise=h.api.play(h.options);await flush();p=h.players[0];h.api.stop();assert.equal((await promise).status,'cancelled');p.emit('onReady');assert.equal(h.counts().ready,0);
  h=harness();promise=h.api.play(h.options);await flush();p=h.players[0];h.expireAt(4000);await flush();
  assert.equal(h.players.length,1,'startup cannot schedule the asynchronous iframe replacement that reproduced the blank-player failure');
  assert.equal(p.destroyed,undefined);p.emit('onReady');p.emit('onStateChange',1);p.time=1;h.tick();p.time=1.4;h.tick();assert.equal((await promise).status,'playing');h.api.stop();
  h=harness(false);promise=h.api.play(h.options);await flush();h.nodes.find(n=>n.tagName==='SCRIPT').onerror();assert.equal((await promise).status,'pending');assert.equal(h.counts().failures.length,0);h.api.stop();
  assert.equal((await h.api.play({...h.options,item:{url:'https://evil.example/embed/RQinquBq338'}})).status,'unavailable');
  console.log('YouTube lifecycle: ready/clock distinction, late Play, EOF once, controls, cancellation, provider-vs-transient errors and SDK failure passed.');
  completed = true;
})().catch(error=>{console.error(error);process.exitCode=1;});
