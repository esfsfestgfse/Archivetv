/* Shared PeerTube media selection. HLS components are not standalone MP4s. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RealSignalPeerTubeMedia=api;})(typeof window!=='undefined'?window:this,function(){
 'use strict';
 var active=new Set();
 function safe(value){try{var u=new URL(String(value||''));return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
 function fragment(value){return /\/streaming-playlists\/hls\/[^/]+\/[^/?]+-fragmented\.mp4(?:[?#]|$)/i.test(String(value||''));}
 function video(file){return file&&file.hasVideo!==false&&!/audio only/i.test(String(file.resolution&&file.resolution.label||''))&&safe(file.fileUrl);}
 function best(files){return files.filter(video).sort(function(a,b){return Math.abs(Number(a.resolution&&a.resolution.id||720)-720)-Math.abs(Number(b.resolution&&b.resolution.id||720)-720);})[0];}
 function select(detail){
  var direct=best((detail&&detail.files||[]).filter(function(f){return !fragment(f.fileUrl);}));if(direct)return direct;
  for(var p of detail&&detail.streamingPlaylists||[]){var file=best(p.files||[]),url=safe(p.playlistUrl);if(file&&/\.m3u8(?:[?#]|$)/i.test(url))return Object.assign({},file,{fileUrl:url});}
  return null;
 }
 async function resolve(item,fetchDetail){
  if(!fragment(item&&item.url))return item;
  var u=new URL(item.url),match=u.pathname.match(/\/streaming-playlists\/hls\/([a-f0-9-]{36})\//i);
  if(!match||!safe(u.href)||/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?$)/i.test(u.hostname))throw Error('Invalid PeerTube media identity');
  var detail=await fetchDetail(u.origin+'/api/v1/videos/'+match[1]),file=select(detail);
  if(!file)throw Error('No complete PeerTube video rendition');
  return Object.assign({},item,{url:file.fileUrl});
 }
 function attach(video,url,options){
  var engine=null,stopped=false;
  function current(){return !stopped&&!(options.signal&&options.signal.aborted)&&options.isCurrent();}
  function stop(){if(stopped)return;stopped=true;active.delete(stop);if(engine){engine.destroy();engine=null;}}
  active.add(stop);
  if(options.signal)options.signal.addEventListener('abort',stop,{once:true});
  Promise.resolve().then(function(){
   if(!current())return;
   return options.loadHls().catch(function(){return null;}).then(function(Hls){
    if(!current())return;
    if(!Hls||!Hls.isSupported()){if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=url;options.onReady();return;}throw Error('HLS video unsupported');}
    engine=new Hls({maxBufferLength:20,maxMaxBufferLength:60});
    engine.on(Hls.Events.MANIFEST_PARSED,function(){if(current())options.onReady();});
    engine.on(Hls.Events.ERROR,function(_,data){if(current()&&data&&data.fatal){stop();options.onError();}});
    engine.loadSource(url);engine.attachMedia(video);
   });
  }).catch(function(){if(current())options.onError();stop();});
  return stop;
 }
 return {select:select,fragment:fragment,resolve:resolve,attach:attach,stopAll:function(){Array.from(active).forEach(function(stop){stop();});}};
});
