/* Playback lifecycle regression: real SDK events, not an elapsed-runtime guess. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
(async () => {
  const players=[],frames=[],timers=new Map();let seq=0;
  class Player {
    constructor(frame){this.frame=frame;this.events={};this.paused=false;players.push(this)}
    on(event,fn){this.events[event]=fn} off(event){delete this.events[event]}
    ready(){return Promise.resolve()} play(){this.paused=false;return Promise.resolve()}
    pause(){this.paused=true;return Promise.resolve()} getPaused(){return Promise.resolve(this.paused)}
    setVolume(value){this.volume=value;return Promise.resolve(value)} destroy(){this.destroyed=true;return Promise.resolve()}
    emit(event,data){if(this.events[event])this.events[event](data)}
  }
  const window={Vimeo:{Player}},context={window,URL,document:{createElement:()=>({dataset:{},remove(){this.removed=true}})},setTimeout:fn=>{timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/vimeo-embed-runtime.js'),'utf8'),context);
  let started=0,ended=0,failed=0,ready=0;
  const options={item:{title:'Full feature film',embedUrl:'https://player.vimeo.com/video/1234?app_id=1'},container:{appendChild:f=>frames.push(f)},isCurrent:()=>true,onReady:()=>ready++,onStarted:()=>started++,onEnded:()=>ended++,onError:()=>failed++};
  assert.equal(await window.RealSignalVimeoEmbed.play(options),true);
  assert.equal(ready,1); assert.equal(started,0,'ready is not a visible frame');
  assert.equal(frames[0].dataset.playbackState,'ready');
  players[0].emit('play');assert.equal(started,0,'play event is not decoded advancing media');players[0].emit('timeupdate',{seconds:1});assert.equal(started,1);
  const tv={intent:'television'};
  assert.equal(window.RealSignalVimeoEmbed.qualify(tv,{title:'Shark Monster Pilot Episode',description:'Full episode'}),false);
  assert.equal(window.RealSignalVimeoEmbed.qualify(tv,{title:'Episode 3',description:'Full episode'}),false);
  assert.equal(window.RealSignalVimeoEmbed.qualify(tv,{title:'MATTADORE Episode 6',description:'Growth mindset keynote'}),false);
  assert.equal(window.RealSignalVimeoEmbed.qualify(tv,{title:'Full Out Episode 1',description:'An original comedy series written by the creator'}),true);
  assert.equal(window.RealSignalVimeoEmbed.qualify(tv,{title:'Tripping Over Episode 1',seriesId:'tvmaze:123'}),true);
  for(const timer of [...timers.values()])timer();assert.equal(ended,0,'wall-clock duration must never trigger Next');
  window.RealSignalVimeoEmbed.volume(0.5,false);assert.equal(players[0].volume,0.5);
  window.RealSignalVimeoEmbed.volume(0.5,true);assert.equal(players[0].volume,0);
  window.RealSignalVimeoEmbed.toggle();await Promise.resolve();assert.equal(players[0].paused,true);
  players[0].emit('ended');players[0].emit('ended');assert.equal(ended,1);
  const stale=players[0].events.timeupdate;
  window.RealSignalVimeoEmbed.stop();assert.equal(players[0].destroyed,true);assert.equal(frames[0].removed,true);assert.equal(timers.size,0);stale({seconds:2});assert.equal(started,1);
  await window.RealSignalVimeoEmbed.play(options);players[1].emit('error',new Error('Privacy restriction'));assert.equal(failed,1);assert.equal(players[1].destroyed,true);
  assert.equal(await window.RealSignalVimeoEmbed.play({...options,item:{embedUrl:'https://evil.example/video/1234'}}),false);
  for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.ok(source.includes('function playVimeoEmbed'));
    assert.ok(source.includes('if(item.provider==="Vimeo")return playVimeoEmbed'));
    assert.ok(source.includes('window.RealSignalVimeoEmbed.stop()'));
    const data=new Map(),client={store:{get:(key,value)=>data.has(key)?data.get(key):value,set:(key,value)=>data.set(key,value)},V2_SOURCE_READY_BUFFER:5};
    for(const name of ['v2Shuffle','v2Recent','v2Rejected','v2Shelf','v2CatalogOrder'])vm.runInNewContext(source.match(new RegExp('^function '+name+'\\(.*$','m'))[0],client);
    const key='Vimeo TV Channel',items=Array.from({length:16},(_,i)=>({id:String(i)}));
    data.set('v2recent:'+key,items.slice(0,14).map(i=>i.id));data.set('v2shelf:'+key,['14','15']);
    for(let i=0;i<30;i++)assert.deepEqual(Array.from(client.v2CatalogOrder(key,items).slice(0,2),i=>i.id).sort(),['14','15'],'small unseen remainder must precede old programs');
  }
  console.log('Vimeo playback passed: readiness vs actual start, SDK EOF exactly once, volume/pause, privacy recovery, stale-event cleanup, and unseen-first desktop/mobile rotation.');
})().catch(error=>{console.error(error);process.exitCode=1});
