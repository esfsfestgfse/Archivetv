import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for(const file of ['the_dial_desktop.html','the_dial_mobile.html']) {
 const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const start=html.indexOf('function playFile('),end=html.indexOf('  const av=acquireVideo(',start);
 assert.ok(start>=0&&end>start);
 // Exercise the real dispatch/cleanup boundary, stopping before native-player
 // acquisition. Decoder/network behavior is covered by the browser fixture.
 const prefix=html.slice(start,end)+'res("native-stage");});}';
 function run(kind){
  let stops=0,suspends=0,published=0;
  const stage={children:[],querySelectorAll(){return this.children.filter(n=>n.tagName==='VIDEO');}};
  Object.defineProperty(stage,'innerHTML',{set(){for(const n of stage.children)n.parentNode=null;stage.children=[];}});
  function node(tag){const n={tagName:tag,parentNode:stage,pause(){},removeAttribute(){},load(){},remove(){stage.children=stage.children.filter(x=>x!==n);n.parentNode=null;}};stage.children.push(n);return n;}
  const frame=node('IFRAME');node('VIDEO');
  const yt={stop(){stops++;frame.remove();},suspend(){suspends++;return frame;}};
  const context={window:{RealSignalYouTubeEmbed:yt,__rsCastIsConnected:()=>kind==='cast',__rsCastPublishMedia(){published++;return true;}},screenArea:stage,
   v2CanPrepareYouTube:()=>kind!=='ok',V2_PREVIEW_PROFILES:{fixture:{providers:['youtube','peertube']}},
   powered:true,token:7,curVideo:null,takeIAMediaWarmer:()=>null,soundBlocked:false,
   iaReviewedFileAllowed:()=>true,iaCachedProgramAllowed:()=>true,
   stopTVPlayback(){},hideOv(){},hideBuffer(){},clearStall(){},setSig(){},setCurItem(){},showNow(){},
   audioScreen:{classList:{add(){}}},bug:{classList:{remove(){}}}};
  const killStart=html.indexOf('function killMedia('),killEnd=html.indexOf('/* FIX (structural',killStart);
  vm.runInNewContext(html.slice(killStart,killEnd)+prefix,context);
  const ch={num:516,source:kind==='ia'?undefined:'v2preview',previewKey:'fixture'};
  return Promise.resolve(context.playFile({id:'direct',type:'video',url:'https://media.example/program.mp4'},ch,{},7,false))
   .then(()=>({stops,suspends,published,retained:stage.children.includes(frame)}));
 }
 test(file+': direct Source Suite playback retains its prepared YouTube transport',async()=>{
  const r=await run('source');assert.equal(r.stops,0);assert.equal(r.suspends,1);assert.equal(r.retained,true);
 });
 test(file+': Cast, IA and non-YouTube profiles still fully release the local iframe',async()=>{
  for(const kind of ['cast','ia','ok']){
   const r=await run(kind);assert.equal(r.stops,1,kind);assert.equal(r.suspends,0,kind);assert.equal(r.retained,false,kind);
   assert.equal(r.published,kind==='cast'?1:0,kind);
  }
 });
}
