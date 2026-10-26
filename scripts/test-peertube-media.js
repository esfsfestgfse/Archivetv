const {test}=require('node:test'),assert=require('node:assert/strict');
test('PeerTube HLS video uses its declared playlist, never its fragmented component or audio-only file',async()=>{
 const media=require('../assets/peertube-media.js');
 const detail={files:[{fileUrl:'https://pt.example/audio.mp4',hasVideo:false,resolution:{id:0}}],streamingPlaylists:[{playlistUrl:'https://pt.example/hls/show/master.m3u8',files:[{fileUrl:'https://pt.example/hls/show/480-fragmented.mp4',hasVideo:true,resolution:{id:480},width:640,height:480}]}]};
 assert.equal(media.select(detail).fileUrl,detail.streamingPlaylists[0].playlistUrl);
 const direct={fileUrl:'https://pt.example/full.mp4',hasVideo:true,resolution:{id:720}};
 assert.equal(media.select({...detail,files:[direct]}).fileUrl,direct.fileUrl);
 const item={id:'pt:pt.example/acc3624f-e61f-47a7-a284-88b709fbce8c',title:'History Documentary',provider:'PeerTube',url:'https://pt.example/static/streaming-playlists/hls/acc3624f-e61f-47a7-a284-88b709fbce8c/480-fragmented.mp4'};
 let requested;const fixed=await media.resolve(item,async url=>{requested=url;return detail;});
 assert.match(requested,/\/api\/v1\/videos\/acc3624f-e61f-47a7-a284-88b709fbce8c$/);assert.equal(fixed.url,detail.streamingPlaylists[0].playlistUrl);assert.equal(fixed.id,item.id);
 let called=false;assert.equal((await media.resolve({...item,url:direct.fileUrl},()=>{called=true;})).url,direct.fileUrl);assert.equal(called,false);
});
test('PeerTube HLS ownership attaches the manifest and cleans up when a tune is superseded',async()=>{
 const media=require('../assets/peertube-media.js');let instance,source,attached,ready=0,destroyed=0;
 class Hls{static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};static isSupported(){return true;}constructor(){instance=this;this.handlers={};}on(k,fn){this.handlers[k]=fn;}loadSource(url){source=url;}attachMedia(v){attached=v;}destroy(){destroyed++;}}
 const ctl=new AbortController(),v={canPlayType:()=>''};
 media.attach(v,'https://pt.example/master.m3u8',{signal:ctl.signal,isCurrent:()=>true,loadHls:async()=>Hls,onReady:()=>ready++,onError:()=>assert.fail('unexpected HLS error')});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(source,'https://pt.example/master.m3u8');assert.equal(attached,v);instance.handlers.manifest();assert.equal(ready,1);ctl.abort();assert.equal(destroyed,1);instance.handlers.manifest();assert.equal(ready,1);
});
const fs=require('fs'),vm=require('vm');
test('PeerTube ownership stops removed players and forwards fatal errors after startup',async()=>{
 const media=require('../assets/peertube-media.js');let destroys=0,ready=0,errors=0,instance;
 class Hls{static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};static isSupported(){return true;}constructor(){instance=this;this.handlers={};}on(k,f){this.handlers[k]=f;}loadSource(){}attachMedia(){}destroy(){destroys++;}}
 const opts={isCurrent:()=>true,loadHls:async()=>Hls,onReady:()=>ready++,onError:()=>errors++};
 media.attach({canPlayType:()=>''},'https://pt.example/master.m3u8',opts);await new Promise(r=>setImmediate(r));instance.handlers.manifest();instance.handlers.error(null,{fatal:true});assert.equal(ready,1);assert.equal(errors,1);assert.equal(destroys,1);
 media.attach({canPlayType:()=>''},'https://pt.example/master.m3u8',opts);await new Promise(r=>setImmediate(r));media.stopAll();assert.equal(destroys,2);
 for(const name of ['the_dial_desktop.html','the_dial_mobile.html']){
  const html=fs.readFileSync(require('path').join(__dirname,'..',name),'utf8'),match=html.match(/RealSignalPeerTubeMedia.attach\(v,it.url,(\{signal:sig[^\n]+\})\);/);assert.ok(match,name);
  let advances=0,failures=0;const ctx={sig:undefined,my:3,token:3,powered:true,done:true,loadHlsLib:()=>{},tryPlay:()=>{},fin:()=>failures++,v2RejectEmbed:()=>advances++,it:{id:'pt:proof'},ch:{num:539}};
  const options=vm.runInNewContext('('+match[1]+')',ctx);options.onError();assert.equal(advances,1,name+': post-start fatal error must advance');assert.equal(failures,0);
  ctx.done=false;options.onError();assert.equal(failures,1,name+': pre-start failure falls through to next candidate');
  assert.match(html.slice(html.indexOf('function killMedia('),html.indexOf('function killMedia(')+1000),/RealSignalPeerTubeMedia.stopAll\(\)/,name+': teardown owns the HLS loader');
 }
});
test('PeerTube uses Hls.js when Chrome advertises native HLS but cannot decode the playlist',async()=>{
 const media=require('../assets/peertube-media.js');let attached=0,source='';
 class Hls{static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};static isSupported(){return true;}on(){}loadSource(u){source=u;}attachMedia(){attached++;}destroy(){}}
 const v={canPlayType:()=> 'maybe'};media.attach(v,'https://pt.example/master.m3u8',{isCurrent:()=>true,loadHls:async()=>Hls,onReady:()=>{},onError:()=>assert.fail('unexpected error')});await new Promise(r=>setImmediate(r));assert.equal(attached,1);assert.equal(source,'https://pt.example/master.m3u8');assert.equal(v.src,undefined);media.stopAll();
 const native={canPlayType:()=> 'probably'};let ready=0;media.attach(native,'https://pt.example/master.m3u8',{isCurrent:()=>true,loadHls:async()=>null,onReady:()=>ready++,onError:()=>assert.fail('native fallback missing')});await new Promise(r=>setImmediate(r));assert.equal(native.src,'https://pt.example/master.m3u8');assert.equal(ready,1);media.stopAll();
});
