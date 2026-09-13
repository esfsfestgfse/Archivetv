/* RealSignal Release 2 runtime guard.
 * Default path is inert except for connectivity recovery. Add ?r2Telemetry=1
 * to expose local-only startup/media/control timings. Nothing is transmitted.
 */
(function(){
  'use strict';
  var telemetryOn=new URLSearchParams(location.search).get('r2Telemetry')==='1';
  var report={version:2,startedAt:Date.now(),events:[],notes:['local-only','no network reporting']};
  var activeTune=null,recoveryTimer=0,tuneSeq=0,seenPrograms=[];
  function stamp(){return Math.round(performance.now());}
  function push(event){
    report.events.push(Object.assign({at:stamp()},event||{}));
    if(report.events.length>500)report.events.shift();
    var node=document.getElementById('rs-release2-telemetry');
    if(node)node.textContent=JSON.stringify(report);
  }
  function percentile(values,p){return values.length?values[Math.min(values.length-1,Math.floor((values.length-1)*p))]:null;}
  function summary(){
    var tunes=report.events.filter(function(e){return e.type==='tune-complete'&&Number.isFinite(e.ms);}).map(function(e){return e.ms;}).sort(function(a,b){return a-b;}),
        frames=report.events.filter(function(e){return e.type==='first-visible-frame'&&Number.isFinite(e.ms);}).map(function(e){return e.ms;}).sort(function(a,b){return a-b;});
    return {version:2,events:report.events.length,tunes:tunes.length,frames:frames.length,uniquePrograms:seenPrograms.length,repeats:report.events.filter(function(e){return e.type==='repeat';}).length,tuneP50:percentile(tunes,.5),tuneP95:percentile(tunes,.95),frameP50:percentile(frames,.5),frameP95:percentile(frames,.95),timeouts:report.events.filter(function(e){return e.type==='startup-timeout';}).length,stalls:report.events.filter(function(e){return e.type==='stall';}).length,errors:report.events.filter(function(e){return e.type==='media-error';}).length};
  }
  function currentChannel(){try{if(typeof curNum!=='undefined'&&typeof byNum==='function')return byNum(curNum);}catch(_){ }return null;}
  function currentProgramKey(){try{var item=typeof curItem!=='undefined'?curItem:null,ch=currentChannel(),key=item&&(item.id||item.url||item.src||item.title);return String(key||(ch&&((ch.num||0)+'|'+(ch.nm||'')))||'');}catch(_){return '';}}
  function recoverSource(reason){
    try{
      var ch=currentChannel();
      if(!ch||ch.source!=='v2preview'||typeof v2LoadProfile!=='function'||typeof V2_PREVIEW_PROFILES==='undefined'||typeof token==='undefined')return;
      var profile=V2_PREVIEW_PROFILES[ch.previewKey],state=typeof v2PreviewState!=='undefined'?v2PreviewState[ch.num]:null;
      if(!profile||(state&&state.release2RecoveryAt&&Date.now()-state.release2RecoveryAt<8000))return;
      if(state)state.release2RecoveryAt=Date.now();
      if(telemetryOn)push({type:'source-recovery',reason:reason||'online',channel:Number(ch.num)||0,queue:state&&state.items?state.items.length:0});
      Promise.resolve(v2LoadProfile(ch,profile,token,true)).catch(function(error){if(telemetryOn)push({type:'source-recovery-failed',channel:Number(ch.num)||0,error:String(error&&error.message||error)});});
    }catch(error){if(telemetryOn)push({type:'source-recovery-error',error:String(error&&error.message||error)});}
  }
  function observeMedia(node){
    if(!telemetryOn||!node||node.dataset.release2Observed)return;
    node.dataset.release2Observed='1';var started=activeTune?activeTune.at:stamp(),first=false;
    function frame(){if(first)return;if(node.tagName==='VIDEO'&&(!node.videoWidth||node.readyState<2))return;first=true;var key=currentProgramKey(),prior=false;if(key){prior=seenPrograms.some(function(entry){return entry.key===key&&entry.tune!==((activeTune&&activeTune.seq)||0);});if(!seenPrograms.some(function(entry){return entry.key===key&&entry.tune===((activeTune&&activeTune.seq)||0);}))seenPrograms.push({key:key,tune:(activeTune&&activeTune.seq)||0});if(seenPrograms.length>250)seenPrograms.shift();}push({type:'first-visible-frame',channel:activeTune&&activeTune.channel||0,media:node.tagName.toLowerCase(),ms:Math.max(0,stamp()-started),programKey:key,repeat:prior});if(prior)push({type:'repeat',channel:activeTune&&activeTune.channel||0,programKey:key});}
    ['playing','loadeddata','load'].forEach(function(type){node.addEventListener(type,frame,{passive:true});});
    node.addEventListener('stalled',function(){push({type:'stall',channel:activeTune&&activeTune.channel||0,media:node.tagName.toLowerCase()});},{passive:true});
    node.addEventListener('error',function(){push({type:'media-error',channel:activeTune&&activeTune.channel||0,media:node.tagName.toLowerCase()});},{passive:true});
    if(node.tagName==='VIDEO'&&node.readyState>=2)frame();
  }
  function installTelemetry(){
    var node=document.createElement('script');node.type='application/json';node.id='rs-release2-telemetry';node.hidden=true;document.body.appendChild(node);
    window.__rsRelease2Telemetry={report:report,summary:summary,clear:function(){report.events.length=0;push({type:'cleared'});},json:function(){return JSON.stringify(report,null,2);}};
    if(typeof window.tuneNum==='function'){
      var baseTune=window.tuneNum;
      window.tuneNum=function(channel){
        var row={channel:Number(channel)||0,at:stamp(),seq:++tuneSeq};activeTune=row;push({type:'tune-start',channel:row.channel,seq:row.seq});
        var result;try{result=baseTune.apply(this,arguments);}catch(error){push({type:'tune-error',channel:row.channel,error:String(error&&error.message||error)});throw error;}
        return Promise.resolve(result).then(function(value){row.ms=Math.max(0,stamp()-row.at);push({type:'tune-complete',channel:row.channel,ms:row.ms});return value;},function(error){row.ms=Math.max(0,stamp()-row.at);push({type:'tune-failed',channel:row.channel,ms:row.ms,error:String(error&&error.message||error)});throw error;});
      };
    }
    var observer=new MutationObserver(function(records){records.forEach(function(record){Array.prototype.forEach.call(record.addedNodes||[],function(n){if(n.nodeType!==1)return;if(n.matches&&n.matches('video,audio,iframe'))observeMedia(n);if(n.querySelectorAll)Array.prototype.forEach.call(n.querySelectorAll('video,audio,iframe'),observeMedia);});});});
    observer.observe(document.body,{childList:true,subtree:true});document.querySelectorAll('video,audio,iframe').forEach(observeMedia);push({type:'telemetry-ready'});
  }
  window.addEventListener('online',function(){clearTimeout(recoveryTimer);recoveryTimer=setTimeout(function(){recoverSource('online');},250);});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)recoverSource('visibility');});
  function bootTelemetry(){
    if(!telemetryOn||window.__rsRelease2Telemetry||!document.body)return;
    installTelemetry();
  }
  /* The asset is normally loaded at the end of the document, but Cast and some
     embedded browsers can evaluate it while the body is still being assembled.
     Shadow mode must not silently disappear in that race. */
  if(telemetryOn){
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',bootTelemetry,{once:true});
      window.addEventListener('load',bootTelemetry,{once:true});
    } else bootTelemetry();
  }
})();
