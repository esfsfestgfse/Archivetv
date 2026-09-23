/* RealSignal Release 2.2 runtime health dashboard.
 * The default path records a tiny, bounded local report and, when enabled, sends
 * an allowlisted batch of playback timings to the production v3 telemetry endpoint.
 * Add ?r2Telemetry=0 to disable both local and remote telemetry for comparison.
 */
(function(){
  'use strict';
  var params=new URLSearchParams(location.search);
  var telemetryOn=params.get('r2Telemetry')!=='0';
  var remoteTelemetryOn=telemetryOn&&params.get('remoteTelemetry')!=='0';
  var REMOTE_ENDPOINT=String(window.__RS_REMOTE_TELEMETRY_ENDPOINT||'https://realsignal-api.tdy1990.workers.dev/api/v3/telemetry');
  var REMOTE_TYPES={"tune-complete":1,"first-visible-frame":1,"guide-open":1,"guide-close":1,"queue-sample":1,"repeat":1,"control":1,"stall":1,"media-error":1,"tune-failed":1,"startup-timeout":1,"source-recovery":1,"source-recovery-failed":1,"source-success":1,"source-failure":1};
  var remoteQueue=[],remoteTimer=0,remoteInFlight=false;
  var STORAGE_KEY='realsignal:health:v2',persistTimer=0,stored={};
  try{stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{};}catch(_){stored={};}
  var report={version:4,startedAt:Date.now(),events:Array.isArray(stored.events)?stored.events.slice(-500):[],channelStats:stored.channelStats&&typeof stored.channelStats==='object'?stored.channelStats:{},sessions:Number(stored.sessions||0)+1,notes:['bounded local report','optional remote v3 telemetry','bounded 500-event ring','bounded per-channel history']};
  var activeTune=null,recoveryTimer=0,tuneSeq=0,seenPrograms=[],pendingGuide=null;
  function stamp(){return Math.round(performance.now());}
  function remoteSurface(){var surface=document.documentElement&&document.documentElement.classList.contains('mob')?'mobile':'desktop',cast=false;try{cast=typeof window.__rsCastIsConnected==='function'&&!!window.__rsCastIsConnected();}catch(_){ }return {surface:surface,castConnected:cast};}
  function flushRemote(){
    if(!remoteTelemetryOn||remoteInFlight||!remoteQueue.length)return;
    var batch=remoteQueue.splice(0,40),status=remoteSurface();
    remoteInFlight=true;
    fetch(REMOTE_ENDPOINT,{method:'POST',mode:'cors',cache:'no-store',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({events:batch.map(function(event){return Object.assign({},event,status,{sourceKey:event.sourceKey||event.source||''});})})})
      .catch(function(){})
      .finally(function(){remoteInFlight=false;if(remoteQueue.length){clearTimeout(remoteTimer);remoteTimer=setTimeout(function(){remoteTimer=0;flushRemote();},1000);}});
  }
  function currentTelemetryChannel(){try{var number=typeof curNum!=='undefined'?Number(curNum)||0:0;return number?String(number):'guide';}catch(_){return 'guide';}}
  function queueRemote(event){
    if(!remoteTelemetryOn||!event||!REMOTE_TYPES[event.type])return;
    var remoteEvent=Object.assign({},event);if(!remoteEvent.channel)remoteEvent.channel=currentTelemetryChannel();
    remoteQueue.push(remoteEvent);
    if(remoteQueue.length>=8){flushRemote();return;}
    if(!remoteTimer)remoteTimer=setTimeout(function(){remoteTimer=0;flushRemote();},2500);
  }
  function push(event){
    event=Object.assign({at:stamp()},event||{});
    noteChannel(event);
    report.events.push(event);
    if(report.events.length>500)report.events.shift();
    schedulePersist();
    queueRemote(event);
    var node=document.getElementById('rs-release2-telemetry');
    if(node)node.textContent=JSON.stringify(report);
    renderHealthView();
  }
  function boundedPush(list,value,max){if(!Array.isArray(list)||!Number.isFinite(value))return;list.push(value);if(list.length>max)list.splice(0,list.length-max);}
  function channelMeta(num){try{var row=typeof byNum==='function'?byNum(Number(num)):null;return {name:row&&row.nm||('CHANNEL '+num),cat:row&&row.cat||'',source:row&&row.source||row&&row.gl||''};}catch(_){return {name:'CHANNEL '+num,cat:'',source:''};}}
  function channelRecord(num){var key=String(Number(num)||0);if(!key||key==='0')return null;var row=report.channelStats[key];if(!row)row=report.channelStats[key]={channel:Number(num)||0,name:'',cat:'',source:'',tunes:0,frames:0,switchMs:[],frameMs:[],queueDepths:[],repeats:0,skips:0,stalls:0,errors:0,failures:0,recoveries:0,recoveryFailures:0,timeouts:0,lastAt:0,lastProgram:'',lastStatus:''};var meta=channelMeta(num);if(!row.name||/^CHANNEL /.test(row.name)){row.name=meta.name;}if(!row.cat)row.cat=meta.cat;if(!row.source)row.source=meta.source;return row;}
  function noteChannel(event){var row=channelRecord(event&&event.channel);if(!row)return;row.lastAt=Date.now();if(event.programKey)row.lastProgram=String(event.programKey).slice(0,180);if(event.type==='tune-start')row.tunes++;if(event.type==='tune-complete')boundedPush(row.switchMs,Number(event.ms),32);if(event.type==='first-visible-frame'){row.frames++;boundedPush(row.frameMs,Number(event.ms),32);}if(event.type==='queue-sample')boundedPush(row.queueDepths,Number(event.depth),32);if(event.type==='repeat')row.repeats++;if(event.type==='control'&&event.action==='skip')row.skips++;if(event.type==='stall')row.stalls++;if(event.type==='media-error') {row.errors++;row.failures++;}if(event.type==='tune-failed'){row.failures++;}if(event.type==='source-recovery-failed'){row.recoveryFailures++;row.failures++;}if(event.type==='source-recovery')row.recoveries++;if(event.type==='startup-timeout'){row.timeouts++;row.failures++;}if(event.status)row.lastStatus=String(event.status).slice(0,80);}
  function schedulePersist(){if(!telemetryOn||persistTimer)return;persistTimer=setTimeout(function(){persistTimer=0;try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:4,events:report.events.slice(-500),channelStats:report.channelStats,sessions:report.sessions}));}catch(_){ }},250);}
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
    return {version:4,events:report.events.length,sessions:report.sessions,tunes:tunes.length,frames:frames.length,uniquePrograms:seenPrograms.length,repeats:report.events.filter(function(e){return e.type==='repeat';}).length,skips:report.events.filter(function(e){return e.type==='control'&&e.action==='skip';}).length,tuneP50:percentile(tunes,.5),tuneP95:percentile(tunes,.95),frameP50:percentile(frames,.5),frameP95:percentile(frames,.95),guideOpenP50:percentile(opens,.5),guideOpenP95:percentile(opens,.95),guideCloseP50:percentile(closes,.5),guideCloseP95:percentile(closes,.95),queueSamples:depths.length,queueCurrent:depths.length?depths[depths.length-1]:null,queueMin:depths.length?depths[0]:null,queueMax:depths.length?depths[depths.length-1]:null,sourceFailures:failures,sourceRecoveries:report.events.filter(function(e){return e.type==='source-recovery';}).length,sourceRecoveryFailures:report.events.filter(function(e){return e.type==='source-recovery-failed';}).length,timeouts:report.events.filter(function(e){return e.type==='startup-timeout';}).length,stalls:report.events.filter(function(e){return e.type==='stall';}).length,errors:report.events.filter(function(e){return e.type==='media-error';}).length,surface:status.surface,castConnected:status.cast,statusLabel:status.label};
  }
  function median(values){var copy=(values||[]).filter(Number.isFinite).slice().sort(function(a,b){return a-b;});return copy.length?copy[Math.floor((copy.length-1)/2)]:null;}
  function laneRows(){return Object.keys(report.channelStats).map(function(key){var row=report.channelStats[key]||{},attempts=Number(row.tunes||0),frames=Number(row.frames||0),failures=Number(row.failures||0),stalls=Number(row.stalls||0),repeats=Number(row.repeats||0),timeouts=Number(row.timeouts||0),frameP50=median(row.frameMs),switchP50=median(row.switchMs),depths=(row.queueDepths||[]).filter(Number.isFinite),cat=String(row.cat||''),source=String(row.source||''),visualLane=source==='v2preview'||/^(NET|TOON|MOV|TV|DOC|SOURCE|RETRO|HOL|BRIT|SPORTS)$/.test(cat),unframed=visualLane?Math.max(0,attempts-frames):0,score=100-(failures*18)-(timeouts*20)-(stalls*8)-(repeats*5)-(unframed*12)+(frames?Math.min(8,frames):0);return {channel:Number(row.channel||key)||0,name:String(row.name||('CHANNEL '+key)),cat:cat,source:source,visualLane:visualLane,attempts:attempts,frames:frames,unframed:unframed,failures:failures,stalls:stalls,repeats:repeats,timeouts:timeouts,recoveries:Number(row.recoveries||0),frameP50:frameP50,switchP50:switchP50,queue:depths.length?depths[depths.length-1]:null,score:Math.max(0,Math.min(100,score)),lastAt:Number(row.lastAt||0)};}).filter(function(row){return row.attempts||row.frames||row.failures||row.repeats||row.stalls;}).sort(function(a,b){return a.score-b.score||b.failures-a.failures||b.lastAt-a.lastAt;});}
  function htmlSafe(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
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
    set('rsHealthEvents',s.events+' local events · '+s.sessions+' sessions · '+new Date(report.startedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
    set('rsHealthNote',s.frames?'P95 frame '+formatMs(s.frameP95)+' · queue samples '+s.queueSamples+' · stalls '+s.stalls+' · timeouts '+s.timeouts:'Use the app to collect playback measurements.');
    var lanes=document.getElementById('rsHealthLanes'),laneMeta=document.getElementById('rsHealthLaneMeta'),rows=laneRows();
    if(laneMeta)laneMeta.textContent=rows.length?rows.length+' measured lanes · lowest score first':'No measured lanes yet';
    if(lanes)lanes.innerHTML=rows.length?rows.slice(0,6).map(function(row){var tone=row.score<60?'bad':row.score<85?'warn':'good',frameLabel=row.unframed?'UF '+row.unframed:(row.frames?row.frames+' frames':'no frame yet');return '<button type="button" class="rs-health-lane '+tone+'" data-rs-channel="'+row.channel+'" aria-label="Tune channel '+row.channel+' '+htmlSafe(row.name)+'"><span class="rs-health-lane-id">'+String(row.channel).padStart(3,'0')+'</span><span class="rs-health-lane-name"><b>'+htmlSafe(row.name)+'</b><small>'+htmlSafe(row.cat||'LOCAL')+' · '+frameLabel+'</small></span><span class="rs-health-lane-metrics"><b>'+row.score+'</b><small>'+[row.frameP50!=null?'F '+formatMs(row.frameP50):'F —',row.switchP50!=null?'S '+formatMs(row.switchP50):'S —','Q '+(row.queue==null?'—':row.queue),row.failures?'ERR '+row.failures:(row.unframed?'UNFRAMED '+row.unframed:'OK')].join(' · ')+'</small></span></button>';}).join(''):'<div class="rs-health-empty">Tune channels to build a local scorecard. Weak lanes will appear here automatically.</div>';
  }
  function installHealthControls(){
    var refresh=document.getElementById('rsHealthRefresh'),clear=document.getElementById('rsHealthClear'),exporter=document.getElementById('rsHealthExport'),lanes=document.getElementById('rsHealthLanes');
    if(refresh&&!refresh.dataset.wired){refresh.dataset.wired='1';refresh.addEventListener('click',function(){renderHealthView();});}
    if(clear&&!clear.dataset.wired){clear.dataset.wired='1';clear.addEventListener('click',function(){report.events.length=0;report.channelStats={};seenPrograms.length=0;activeTune=null;try{localStorage.removeItem(STORAGE_KEY);}catch(_){ }push({type:'health-reset'});});}
    if(exporter&&!exporter.dataset.wired){exporter.dataset.wired='1';exporter.addEventListener('click',function(){try{var blob=new Blob([JSON.stringify({report:report,summary:summary(),weakest:laneRows()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='realsignal-health-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}catch(_){ }});}
    if(lanes&&!lanes.dataset.wired){lanes.dataset.wired='1';lanes.addEventListener('click',function(event){var button=event.target.closest&&event.target.closest('[data-rs-channel]');if(!button)return;var number=Number(button.getAttribute('data-rs-channel'));if(typeof window.tuneNum==='function')window.tuneNum(number);});}
  }
  function installGuideObserver(){
    var guide=document.getElementById('gwrap');if(!guide||guide.dataset.release2Observed)return;
    guide.dataset.release2Observed='1';var wasOpen=guide.classList.contains('show');
    new MutationObserver(function(){var isOpen=guide.classList.contains('show');if(isOpen===wasOpen)return;var request=pendingGuide;pendingGuide=null;wasOpen=isOpen;push({type:isOpen?'guide-open':'guide-close',ms:Math.max(0,stamp()-(request&&request.at||stamp())),requested:!!request});}).observe(guide,{attributes:true,attributeFilter:['class']});
  }
  function installTelemetry(){
    var node=document.createElement('script');node.type='application/json';node.id='rs-release2-telemetry';node.hidden=true;document.body.appendChild(node);
    window.__rsRelease2Telemetry={report:report,summary:summary,status:deviceStatus,lanes:laneRows,render:renderHealthView,clear:function(){report.events.length=0;report.channelStats={};seenPrograms.length=0;try{localStorage.removeItem(STORAGE_KEY);}catch(_){ }push({type:'cleared'});},json:function(){return JSON.stringify({report:report,summary:summary(),weakest:laneRows()},null,2);}};
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
