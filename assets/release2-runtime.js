/* RealSignal Release 2.1 runtime health guard.
 * The default path records a tiny, bounded, local-only health report so the in-app
 * diagnostics card can show real playback evidence. Nothing is transmitted. Add
 * ?r2Telemetry=0 only when comparing a completely telemetry-free page.
 */
(function(){
  'use strict';
  var telemetryOn=new URLSearchParams(location.search).get('r2Telemetry')!=='0';
  var report={version:3,startedAt:Date.now(),events:[],notes:['local-only','no network reporting','bounded 500-event ring']};
  var activeTune=null,recoveryTimer=0,tuneSeq=0,seenPrograms=[],pendingGuide=null;
  function stamp(){return Math.round(performance.now());}
  function push(event){
    report.events.push(Object.assign({at:stamp()},event||{}));
    if(report.events.length>500)report.events.shift();
    var node=document.getElementById('rs-release2-telemetry');
    if(node)node.textContent=JSON.stringify(report);
    renderHealthView();
  }
  function percentile(values,p){return values.length?values[Math.min(values.length-1,Math.floor((values.length-1)*p))]:null;}
  function queueDepth(){
    var depths=[];
    try{
      var channel=currentChannel(),num=channel&&channel.num!=null?String(channel.num):String(typeof curNum!=='undefined'?curNum:'');
      if(typeof iaProgramQueues!=='undefined'&&iaProgramQueues){
        var q=iaProgramQueues[num]||iaProgramQueues[Number(num)];
        if(Array.isArray(q))depths.push(q.length);
      }
    }catch(_){ }
    try{
      var preview=typeof v2PreviewState!=='undefined'&&v2PreviewState? v2PreviewState[String(typeof curNum!=='undefined'?curNum:'')]:null;
      if(preview&&Array.isArray(preview.items))depths.push(preview.items.length);
    }catch(_){ }
    return depths.length?Math.max.apply(Math,depths):null;
  }
  function deviceStatus(){
    var surface=document.documentElement&&document.documentElement.classList.contains('mob')?'mobile':'desktop',cast=false;
    try{cast=typeof window.__rsCastIsConnected==='function'&&!!window.__rsCastIsConnected();}catch(_){ }
    return {surface:surface,cast:cast,label:(cast?'CAST · ':'LOCAL · ')+surface.toUpperCase()};
  }
  function summary(){
    var tunes=report.events.filter(function(e){return e.type==='tune-complete'&&Number.isFinite(e.ms);}).map(function(e){return e.ms;}).sort(function(a,b){return a-b;}),
        frames=report.events.filter(function(e){return e.type==='first-visible-frame'&&Number.isFinite(e.ms);}).map(function(e){return e.ms;}).sort(function(a,b){return a-b;}),
        opens=report.events.filter(function(e){return e.type==='guide-open'&&Number.isFinite(e.ms);}).map(function(e){return e.ms;}).sort(function(a,b){return a-b;}),
        closes=report.events.filter(function(e){return e.type==='guide-close'&&Number.isFinite(e.ms);}).map(function(e){return e.ms;}).sort(function(a,b){return a-b;}),
        depths=report.events.filter(function(e){return e.type==='queue-sample'&&Number.isFinite(e.depth);}).map(function(e){return e.depth;}).sort(function(a,b){return a-b;}),
        failures=report.events.filter(function(e){return e.type==='media-error'||e.type==='tune-failed'||e.type==='source-recovery-failed';}).length,
        status=deviceStatus();
    return {version:3,events:report.events.length,tunes:tunes.length,frames:frames.length,uniquePrograms:seenPrograms.length,repeats:report.events.filter(function(e){return e.type==='repeat';}).length,skips:report.events.filter(function(e){return e.type==='control'&&e.action==='skip';}).length,tuneP50:percentile(tunes,.5),tuneP95:percentile(tunes,.95),frameP50:percentile(frames,.5),frameP95:percentile(frames,.95),guideOpenP50:percentile(opens,.5),guideOpenP95:percentile(opens,.95),guideCloseP50:percentile(closes,.5),guideCloseP95:percentile(closes,.95),queueSamples:depths.length,queueCurrent:depths.length?depths[depths.length-1]:null,queueMin:depths.length?depths[0]:null,queueMax:depths.length?depths[depths.length-1]:null,sourceFailures:failures,sourceRecoveries:report.events.filter(function(e){return e.type==='source-recovery';}).length,sourceRecoveryFailures:report.events.filter(function(e){return e.type==='source-recovery-failed';}).length,timeouts:report.events.filter(function(e){return e.type==='startup-timeout';}).length,stalls:report.events.filter(function(e){return e.type==='stall';}).length,errors:report.events.filter(function(e){return e.type==='media-error';}).length,surface:status.surface,castConnected:status.cast,statusLabel:status.label};
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
    function frame(){if(first)return;if(node.tagName==='VIDEO'&&(!node.videoWidth||node.readyState<2))return;first=true;var key=currentProgramKey(),prior=false,depth=queueDepth();if(key){prior=seenPrograms.some(function(entry){return entry.key===key&&entry.tune!==((activeTune&&activeTune.seq)||0);});if(!seenPrograms.some(function(entry){return entry.key===key&&entry.tune===((activeTune&&activeTune.seq)||0);}))seenPrograms.push({key:key,tune:(activeTune&&activeTune.seq)||0});if(seenPrograms.length>250)seenPrograms.shift();}push({type:'first-visible-frame',channel:activeTune&&activeTune.channel||0,media:node.tagName.toLowerCase(),ms:Math.max(0,stamp()-started),programKey:key,repeat:prior,queueDepth:depth});if(Number.isFinite(depth))push({type:'queue-sample',channel:activeTune&&activeTune.channel||0,depth:depth,reason:'first-frame'});if(prior)push({type:'repeat',channel:activeTune&&activeTune.channel||0,programKey:key});}
    ['playing','loadeddata','load'].forEach(function(type){node.addEventListener(type,frame,{passive:true});});
    node.addEventListener('stalled',function(){push({type:'stall',channel:activeTune&&activeTune.channel||0,media:node.tagName.toLowerCase()});},{passive:true});
    node.addEventListener('error',function(){push({type:'media-error',channel:activeTune&&activeTune.channel||0,media:node.tagName.toLowerCase()});},{passive:true});
    if(node.tagName==='VIDEO'&&node.readyState>=2)frame();
  }
  function formatMs(value){return Number.isFinite(value)?Math.round(value)+' ms':'—';}
  function renderHealthView(){
    if(!telemetryOn||!window.__rsRelease2Telemetry)return;
    var panel=document.getElementById('rsHealthPanel');if(!panel)return;
    var s=summary(),set=function(id,value){var el=document.getElementById(id);if(el)el.textContent=value;};
    set('rsHealthFrame',formatMs(s.frameP50));
    set('rsHealthSwitch',formatMs(s.tuneP50));
    set('rsHealthGuide',s.guideOpenP50==null&&s.guideCloseP50==null?'—':formatMs(s.guideOpenP50)+' / '+formatMs(s.guideCloseP50));
    set('rsHealthQueue',s.queueCurrent==null?'—':s.queueCurrent+' ready');
    set('rsHealthRepeats',String(s.repeats));
    set('rsHealthSkips',String(s.skips));
    set('rsHealthFailures',String(s.sourceFailures));
    set('rsHealthRecovery',String(s.sourceRecoveries));
    set('rsHealthSurface',s.statusLabel);
    set('rsHealthEvents',s.events+' local events · '+new Date(report.startedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
    set('rsHealthNote',s.frames?'P95 frame '+formatMs(s.frameP95)+' · queue samples '+s.queueSamples+' · stalls '+s.stalls+' · timeouts '+s.timeouts:'Use the app to collect playback measurements.');
  }
  function installHealthControls(){
    var refresh=document.getElementById('rsHealthRefresh'),clear=document.getElementById('rsHealthClear');
    if(refresh&&!refresh.dataset.wired){refresh.dataset.wired='1';refresh.addEventListener('click',function(){renderHealthView();});}
    if(clear&&!clear.dataset.wired){clear.dataset.wired='1';clear.addEventListener('click',function(){report.events.length=0;seenPrograms.length=0;activeTune=null;push({type:'health-reset'});});}
  }
  function installGuideObserver(){
    var guide=document.getElementById('gwrap');if(!guide||guide.dataset.release2Observed)return;
    guide.dataset.release2Observed='1';var wasOpen=guide.classList.contains('show');
    new MutationObserver(function(){var isOpen=guide.classList.contains('show');if(isOpen===wasOpen)return;var request=pendingGuide;pendingGuide=null;wasOpen=isOpen;push({type:isOpen?'guide-open':'guide-close',ms:Math.max(0,stamp()-(request&&request.at||stamp())),requested:!!request});}).observe(guide,{attributes:true,attributeFilter:['class']});
  }
  function installTelemetry(){
    var node=document.createElement('script');node.type='application/json';node.id='rs-release2-telemetry';node.hidden=true;document.body.appendChild(node);
    window.__rsRelease2Telemetry={report:report,summary:summary,status:deviceStatus,render:renderHealthView,clear:function(){report.events.length=0;seenPrograms.length=0;push({type:'cleared'});},json:function(){return JSON.stringify(report,null,2);}};
    installHealthControls();installGuideObserver();
    var baseOpen=window.openGuide,baseClose=window.closeGuide;
    if(typeof baseOpen==='function'&&!baseOpen.__release2Wrapped){window.openGuide=function(){pendingGuide={action:'open',at:stamp()};return baseOpen.apply(this,arguments);};window.openGuide.__release2Wrapped=true;}
    if(typeof baseClose==='function'&&!baseClose.__release2Wrapped){window.closeGuide=function(){pendingGuide={action:'close',at:stamp()};return baseClose.apply(this,arguments);};window.closeGuide.__release2Wrapped=true;}
    var baseSkip=window.skipOne;
    if(typeof baseSkip==='function'&&!baseSkip.__release2Wrapped){window.skipOne=function(){push({type:'control',action:'skip',channel:typeof curNum!=='undefined'?Number(curNum)||0:0});return baseSkip.apply(this,arguments);};window.skipOne.__release2Wrapped=true;}
    if(typeof window.tuneNum==='function'){
      var baseTune=window.tuneNum;
      window.tuneNum=function(channel){
        var row={channel:Number(channel)||0,at:stamp(),seq:++tuneSeq};activeTune=row;push({type:'tune-start',channel:row.channel,seq:row.seq});
        var result;try{result=baseTune.apply(this,arguments);}catch(error){push({type:'tune-error',channel:row.channel,error:String(error&&error.message||error)});throw error;}
        return Promise.resolve(result).then(function(value){row.ms=Math.max(0,stamp()-row.at);var depth=queueDepth();push({type:'tune-complete',channel:row.channel,ms:row.ms,queueDepth:depth});if(Number.isFinite(depth))push({type:'queue-sample',channel:row.channel,depth:depth,reason:'tune-complete'});return value;},function(error){row.ms=Math.max(0,stamp()-row.at);push({type:'tune-failed',channel:row.channel,ms:row.ms,error:String(error&&error.message||error)});throw error;});
      };
    }
    var observer=new MutationObserver(function(records){records.forEach(function(record){Array.prototype.forEach.call(record.addedNodes||[],function(n){if(n.nodeType!==1)return;if(n.matches&&n.matches('video,audio,iframe'))observeMedia(n);if(n.querySelectorAll)Array.prototype.forEach.call(n.querySelectorAll('video,audio,iframe'),observeMedia);});});});
    observer.observe(document.body,{childList:true,subtree:true});document.querySelectorAll('video,audio,iframe').forEach(observeMedia);push({type:'telemetry-ready',surface:deviceStatus().surface});
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
