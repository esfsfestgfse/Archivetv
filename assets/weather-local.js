/* Shared Local Forecast: independent feeds, explicit uncertainty, and readable manual views. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RealSignalWeatherLocal=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function number(value){return value!=null&&value!==''&&Number.isFinite(Number(value))?Number(value):null;}
  function date(value){return new Date(value).getTime();}
  function format(value,zone,options){try{return new Intl.DateTimeFormat('en-US',Object.assign({},options,zone?{timeZone:zone}:{})).format(new Date(value));}catch(_){return new Date(value).toLocaleString('en-US',options);}}
  function dayKey(value,zone){return format(value,zone,{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$1-$2');}
  function hourly(rows,now){return (rows||[]).filter(function(p){var start=date(p.startTime),end=p.endTime?date(p.endTime):start+3600000;return Number.isFinite(start)&&end>now;}).slice().sort(function(a,b){return date(a.startTime)-date(b.startTime);}).slice(0,24);}
  function daily(rows,zone,now){
    var groups={},today=dayKey(now,zone);
    (rows||[]).forEach(function(p){var at=date(p.startTime);if(!Number.isFinite(at)||p.endTime&&date(p.endTime)<=now)return;var key=dayKey(at,zone);if(key<today)return;
      var g=groups[key]||(groups[key]={key:key,at:at,high:null,low:null,rain:null,short:'',detail:[],daytime:false,wind:''});
      var temp=number(p.temperature),low=number(p.lowTemperature),rain=number(p.probabilityOfPrecipitation&&p.probabilityOfPrecipitation.value);
      if(p.isDaytime!==false){g.high=temp;if(low!=null)g.low=low;g.short=p.shortForecast||g.short;g.daytime=true;g.wind=[p.windSpeed,p.windDirection].filter(Boolean).join(' ');}
      else{g.low=temp;if(!g.short){g.short=p.shortForecast||'';g.wind=[p.windSpeed,p.windDirection].filter(Boolean).join(' ');}}
      if(rain!=null)g.rain=g.rain==null?rain:Math.max(g.rain,rain);
      if(p.detailedForecast)g.detail.push((p.name||'Forecast')+': '+p.detailedForecast);
    });
    return Object.keys(groups).sort().slice(0,7).map(function(k){var g=groups[k];g.label=k===today?'Today':format(g.at,zone,{weekday:'long'});return g;});
  }
  function alerts(value,now){
    if(!value||!Array.isArray(value.features))return {status:'unavailable',items:[]};
    var seen={};var items=value.features.filter(function(f){var p=f&&f.properties;if(!p||p.expires&&date(p.expires)<=now)return false;var key=f.id||[p.event,p.areaDesc,p.expires].join('|');if(seen[key])return false;seen[key]=true;return true;});
    var rank={Extreme:0,Severe:1,Moderate:2,Minor:3};items.sort(function(a,b){return (rank[a.properties.severity]==null?4:rank[a.properties.severity])-(rank[b.properties.severity]==null?4:rank[b.properties.severity]);});
    return {status:items.length?'active':'clear',items:items};
  }
  function locationKey(loc){return (Math.round(Number(loc.lat)*1000)/1000).toFixed(3)+','+(Math.round(Number(loc.lon)*1000)/1000).toFixed(3);}
  function createLoader(options){
    var seq=0,disposed=false,pending=null,pendingKey='',controller=null,clock=options.now||Date.now;
    function live(run){return !disposed&&run===seq&&options.isCurrent();}
    function refresh(loc){
      var key=locationKey(loc);if(pending&&pendingKey===key)return pending;
      if(controller)controller.abort();controller=typeof AbortController!=='undefined'?new AbortController():null;
      var run=++seq,signal=controller&&controller.signal,at=clock(),cached=null,freshForecast=false,freshHourly=false,freshObservation=false;
      try{cached=options.readCache&&options.readCache();}catch(_){}
      var valid=cached&&cached.key===key&&at-cached.savedAt>=0&&at-cached.savedAt<2*3600000&&cached.data;
      var s=Object.assign({fc:null,hr:null,al:null,obs:null,li:{},forecastSource:'NWS'},valid?cached.data:{});
      var fieldTimes=Object.assign({},valid?cached.fieldTimes||{fc:cached.savedAt,hr:cached.savedAt,obs:cached.savedAt,al:cached.savedAt}:{}),freshFields={};
      s.loc=loc;s.alertStatus='loading';s.loading=true;s.error='';s.observationStatus='loading';
      function mark(field){fieldTimes[field]=clock();freshFields[field]=true;}
      function freshness(){s.cachedFields=[];['fc','hr','obs','al'].forEach(function(field){var stamp=number(fieldTimes[field]);if(s[field]&&(stamp==null||clock()-stamp<0||clock()-stamp>=2*3600000)){s[field]=null;delete fieldTimes[field];}if(s[field]&&!freshFields[field]&&field!=='al')s.cachedFields.push(field);});s.cached=s.cachedFields.length>0;s.fieldTimes=Object.assign({},fieldTimes);}
      function emit(){if(!live(run))return;freshness();options.onUpdate(Object.assign({},s));}
      function save(){if(!live(run)||!freshForecast&&!freshObservation||!options.writeCache)return;freshness();try{options.writeCache({key:key,savedAt:Math.max.apply(null,Object.values(fieldTimes)),fieldTimes:Object.assign({},fieldTimes),data:{fc:s.fc,hr:s.hr,al:s.al,obs:s.obs,li:s.li,forecastSource:s.forecastSource}});}catch(_){} }
      function read(url){if(!/^https:\/\/api\.weather\.gov\//.test(String(url||'')))return Promise.reject(Error('Missing NWS endpoint'));return Promise.resolve().then(function(){if(!live(run))throw Error('Departed weather view');return options.read(url,signal);});}
      emit();var fallbackJob=null;
      function fallback(){if(!live(run))return Promise.resolve();if(fallbackJob)return fallbackJob;fallbackJob=Promise.resolve().then(function(){return options.fallback(loc,signal);}).then(function(data){
        if(!live(run))return;if(!freshForecast&&data.fc&&data.fc.properties&&data.fc.properties.periods&&data.fc.properties.periods.length){s.fc=data.fc;s.forecastSource='OPEN-METEO';freshForecast=true;mark('fc');}if(!freshHourly&&data.hr){s.hr=data.hr;freshHourly=true;mark('hr');}if(!freshObservation&&data.obs&&number(data.obs.p&&data.obs.p.temperature&&data.obs.p.temperature.value)!=null){s.obs=data.obs;s.observationStatus='ready';freshObservation=true;mark('obs');}if(data.fc&&data.fc.properties&&data.fc.properties.timeZone&&!s.li.timeZone)s.li=Object.assign({},s.li,{timeZone:data.fc.properties.timeZone});emit();save();
      }).catch(function(){if(live(run)){s.error='Weather services are delayed. Refresh to retry.';emit();}});return fallbackJob;}
      var alertJob=read('https://api.weather.gov/alerts/active?point='+loc.lat+','+loc.lon).then(function(value){if(!live(run))return;if(!value||!Array.isArray(value.features))throw Error('Invalid alerts');s.al=value;s.alertStatus='ready';mark('al');emit();save();}).catch(function(){if(live(run)){s.alertStatus='unavailable';emit();}});
      var forecastJob=read('https://api.weather.gov/points/'+loc.lat+','+loc.lon).then(async function(value){
        if(!live(run))return;var p=value&&value.properties||{},near=p.relativeLocation&&p.relativeLocation.properties||{};
        s.li={city:loc.city||near.city||'',state:loc.state||near.state||'',timeZone:p.timeZone||'',radar:p.radarStation||''};emit();
        var forecast=read(p.forecast).then(function(value){if(!value||!value.properties||!Array.isArray(value.properties.periods)||!value.properties.periods.length)throw Error('Empty forecast');if(live(run)){s.fc=value;s.forecastSource='NWS';freshForecast=true;mark('fc');emit();save();}}).catch(fallback);
        var hour=read(p.forecastHourly).then(function(value){if(!value||!value.properties||!Array.isArray(value.properties.periods)||!value.properties.periods.length)throw Error('Empty hourly');if(live(run)){s.hr=value;freshHourly=true;mark('hr');emit();save();}}).catch(function(){return fallback();});
        var observation=read(p.observationStations).then(function(value){var first=value&&value.features&&value.features[0],sid=first&&first.properties&&first.properties.stationIdentifier;if(!/^[A-Z0-9]{3,8}$/.test(String(sid||'')))throw Error('No station');return read('https://api.weather.gov/stations/'+sid+'/observations/latest').then(function(value){var obs=value&&value.properties;if(number(obs&&obs.temperature&&obs.temperature.value)==null)throw Error('No observation');if(live(run)){s.obs={sid:sid,p:obs};freshObservation=true;s.observationStatus='ready';mark('obs');emit();save();}});}).catch(function(){if(live(run))s.observationStatus='unavailable';return fallback();});
        await Promise.all([forecast,hour,observation]);
      }).catch(fallback);
      pendingKey=key;pending=Promise.all([forecastJob,alertJob]).then(function(){if(live(run)){s.loading=false;emit();save();}}).finally(function(){if(run===seq){pending=null;pendingKey='';}});
      return pending;
    }
    return {refresh:refresh,dispose:function(){disposed=true;seq++;if(controller)controller.abort();}};
  }
  function markup(){return '<div class="wx-screen wx6-local" id="wxScreen" data-panel="now">'+
    '<header class="wx-top"><div><h2 class="wx-loc">LOCAL FORECAST</h2><p class="wx-upd" id="wxUpd">Getting your weather…</p></div><button type="button" id="wxRefresh">↻ Refresh</button></header>'+
    '<nav class="wxl-tabs" aria-label="Local weather sections">'+['now|Now','hourly|Hourly','week|7-Day','radar|Radar','alerts|Alerts'].map(function(s){var x=s.split('|');return '<button type="button" data-wx-panel="'+x[0]+'" aria-pressed="'+(x[0]==='now')+'">'+x[1]+(x[0]==='alerts'?'<span id="wxAlertCount"></span>':'')+'</button>';}).join('')+'</nav>'+
    '<div class="wxl-scroll" id="wxBody">'+
      '<div class="wx-main" id="wxMain"><section class="wx-left" aria-label="Current conditions"><div class="wx-now-main"><p class="wxl-eyebrow">CURRENT CONDITIONS</p><div class="wx-temp">--°</div><div class="wx-fx">Getting current conditions…</div><p id="wxObservation" class="wxl-note">Observation pending</p></div><div class="wx-stats" id="wxStats"></div><p id="wxSummary" class="wxl-summary">Forecast pending</p></section>'+
      '<section class="wx-right" aria-label="Weather radar"><div class="wxl-radar-head"><h3 class="wx-section-label" id="wxRadarLbl">NWS RADAR</h3><div class="wxl-layers" aria-label="Radar layer"><button type="button" data-wx-radar="local" disabled>Local</button><button type="button" data-wx-radar="regional">Regional</button><button type="button" data-wx-radar="national">National</button></div></div><div class="wx-radar-wrap" id="wxRadarWrap"><img class="wx-radar" id="wxRadar" alt="National Weather Service radar map"><p id="wxRadarStatus" class="wxl-radar-status" role="status">Loading radar…</p></div><p class="wxl-note">NWS animated radar · full map · Next switches layers</p></section></div>'+
      '<section class="wxl-hourly" aria-label="Hourly forecast"><h3>Next 24 hours</h3><p class="wxl-note">Times are local to the forecast location.</p><div id="wxHourly" class="wxl-hour-grid"><p class="wxl-empty">Hourly forecast is loading…</p></div></section>'+
      '<section class="wxl-week" aria-label="Seven-day forecast"><h3>Seven-day outlook</h3><p class="wxl-note">Daytime highs and nighttime lows; missing values are not guessed.</p><div id="wxDaily" class="wxl-day-grid"><p class="wxl-empty">Seven-day forecast is loading…</p></div></section>'+
      '<section class="wxl-alerts" aria-label="Local weather alerts"><h3>Alerts for your location</h3><div id="wxAlerts"><p class="wxl-empty">Checking National Weather Service alerts…</p></div><p class="wxl-note">National summaries below are separate from local alerts. For official safety guidance, follow the National Weather Service and local authorities.</p></section>'+
    '</div><div id="wxTicker" class="wxl-local-status" role="status">Checking local alerts…</div>'+
    '<div class="haz-ticker" id="hazTicker"><span id="hazTickerInner">NATIONAL WARNINGS · CHECKING…</span></div>'+
    '<div class="wx-bug" id="wxBug"><div class="wx-bug-id"><span class="wx-bug-dot"></span><span>REALSIGNAL WX</span></div><div class="wx-bug-mid"><span class="wx-bug-temp" id="wxBugTemp">--°</span><span class="wx-bug-place" id="wxBugPlace">LOCAL WEATHER</span><span class="wx-bug-alert" id="wxBugAlert"></span></div><div class="wx-bug-clock" id="wxBugClock">--:--</div></div></div>';}
  function mount(root,options){
    var state=null,disposed=false,bindings=[],radarSeq=0,radarImage=null,radarTimer=null,selectedLayer='local',manualLayer=false,radarURL='',shownLayer='',lastLoading=false,helpers=options.helpers;
    function live(){return !disposed&&options.isCurrent();}function el(id){return root.querySelector('#'+id);}function E(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function text(id,value){var n=el(id);if(n)n.textContent=value;}
    function html(id,value){var n=el(id);if(n&&n._weatherHTML!==value){n.innerHTML=value;n._weatherHTML=value;}}
    function bind(node,type,fn){node.addEventListener(type,fn);bindings.push([node,type,fn]);}
    function panel(id){if(!live()||!['now','hourly','week','radar','alerts'].includes(id))return;root.dataset.panel=id;root.querySelectorAll('[data-wx-panel]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.wxPanel===id));});el('wxBody').scrollTop=0;}
    root.querySelectorAll('[data-wx-panel]').forEach(function(b){bind(b,'click',function(){panel(b.dataset.wxPanel);});});
    function choices(){var loc=state&&state.loc||{},li=state&&state.li||{},list=[];if(/^[A-Z0-9]{4}$/.test(li.radar||''))list.push({key:'local',label:'LOCAL '+li.radar,station:li.radar});
      if(number(loc.lat)!=null&&number(loc.lon)!=null)list.push({key:'regional',label:'REGIONAL '+helpers.radarSector(loc.lat,loc.lon),station:helpers.radarSector(loc.lat,loc.lon)});
      list.push({key:'national',label:'NATIONAL',station:'CONUS'});return list;}
    function paintRadar(force){
      if(!live()||!state)return;var list=choices(),choice=list.find(function(x){return x.key===selectedLayer;});if(!choice){choice=list[0];selectedLayer=choice.key;}
      root.querySelectorAll('[data-wx-radar]').forEach(function(b){b.disabled=!list.some(function(c){return c.key===b.dataset.wxRadar;});b.setAttribute('aria-pressed',String(b.dataset.wxRadar===selectedLayer));});
      var url='https://ais-relay.tdy1990.workers.dev/live/radar?station='+encodeURIComponent(choice.station)+'&frame='+Math.floor(Date.now()/120000);
      if(!force&&radarURL===url)return;radarURL=url;var run=++radarSeq;if(radarImage){radarImage.onload=null;radarImage.onerror=null;}if(radarTimer)clearTimeout(radarTimer);
      text('wxRadarLbl','NWS RADAR / '+choice.label);text('wxRadarStatus','Loading '+choice.label.toLowerCase()+' radar…');
      var image=new Image();radarImage=image;
      function failed(){if(!live()||run!==radarSeq)return;clearTimeout(radarTimer);text('wxRadarStatus',shownLayer?'Radar delayed · keeping last '+shownLayer.toLowerCase()+' image':'Radar unavailable · use Refresh to retry');}
      image.onload=function(){if(!live()||run!==radarSeq)return;clearTimeout(radarTimer);var target=el('wxRadar');target.src=image.src;target.alt='NWS '+choice.label.toLowerCase()+' radar map';shownLayer=choice.label;text('wxRadarStatus',choice.label+' · image loaded '+format(Date.now(),state.li&&state.li.timeZone,{hour:'numeric',minute:'2-digit'}));};
      image.onerror=failed;radarTimer=setTimeout(failed,9000);image.src=url;
    }
    root.querySelectorAll('[data-wx-radar]').forEach(function(b){bind(b,'click',function(){if(!live())return;manualLayer=true;selectedLayer=b.dataset.wxRadar;paintRadar(true);});});
    bind(el('wxRefresh'),'click',function(){if(live()){paintRadar(true);options.onRefresh();}});
    function deg(value){return number(value)==null?'—':Math.round(Number(value))+'°';}
    function age(iso){var at=date(iso);if(!Number.isFinite(at))return 'time unavailable';var minutes=Math.max(0,Math.floor((Date.now()-at)/60000));return minutes<2?'just now':minutes<60?minutes+' min ago':Math.floor(minutes/60)+' hr ago';}
    function update(next){
      if(!live())return;state=Object.assign({},next);if(state.fieldTimes)['fc','hr','obs','al'].forEach(function(field){if(state[field]&&Date.now()-state.fieldTimes[field]>=2*3600000)state[field]=null;});var saved=state.cachedFields||[];var li=state.li||{},zone=li.timeZone||state.fc&&state.fc.properties&&state.fc.properties.timeZone,loc=state.loc||{},place=[li.city,li.state].filter(Boolean).join(', ')||loc.label||'Local weather';
      root.querySelector('.wx-loc').textContent=place;el('wxRefresh').disabled=!!state.loading;
      var periods=state.fc&&state.fc.properties&&state.fc.properties.periods||[],hours=hourly(state.hr&&state.hr.properties&&state.hr.properties.periods||[],Date.now()),days=daily(periods,zone,Date.now()),op=state.obs&&state.obs.p;
      var temp=number(op&&op.temperature&&op.temperature.value),fahrenheit=temp==null?null:helpers.c2f(temp),desc=op&&op.textDescription||'Current observation unavailable';
      root.querySelector('.wx-temp').textContent=fahrenheit==null?'--°':fahrenheit+'°F';
      root.querySelector('.wx-fx').innerHTML=helpers.icon(desc,Number(format(Date.now(),zone,{hour:'numeric',hourCycle:'h23'}))>=6&&Number(format(Date.now(),zone,{hour:'numeric',hourCycle:'h23'}))<19)+'<span>'+E(desc)+'</span>';
      var obsAge=op&&op.timestamp?age(op.timestamp):'time unavailable';text('wxObservation',op?(saved.includes('obs')?'SAVED · ':'')+(state.obs.sid==='OPEN-METEO'?'Open-Meteo model conditions':'Station '+state.obs.sid+' observation')+' · '+obsAge:'Current observation '+(state.loading?'loading…':'unavailable; forecast below remains separate'));
      var forecastAt=state.fc&&state.fc.properties&&(state.fc.properties.updated||state.fc.properties.generatedAt);
      text('wxUpd',(state.cached?'SAVED '+saved.map(function(f){return {fc:'FORECAST',hr:'HOURLY',obs:'OBSERVATION'}[f];}).join('/')+' · ':'')+(state.forecastSource||'NWS')+(forecastAt?' forecast '+age(forecastAt):' forecast')+(state.loading?' · updating…':state.error?' · partial service':' · updated'));
      var stats=[];function stat(label,value){stats.push('<div class="wx-stat"><b>'+E(label)+'</b><span>'+E(value)+'</span></div>');}
      stat('Feels like',op?deg(helpers.c2f(number(op.heatIndex&&op.heatIndex.value)!=null?op.heatIndex.value:number(op.windChill&&op.windChill.value))):'—');
      stat('Humidity',number(op&&op.relativeHumidity&&op.relativeHumidity.value)==null?'—':Math.round(op.relativeHumidity.value)+'%');
      stat('Wind',number(op&&op.windSpeed&&op.windSpeed.value)==null?'—':helpers.kmh2mph(op.windSpeed.value)+' mph '+helpers.compass(op.windDirection&&op.windDirection.value));
      stat('Pressure',number(op&&op.barometricPressure&&op.barometricPressure.value)==null?'—':helpers.pa2inhg(op.barometricPressure.value)+' inHg');
      stat('Dew point',op?deg(helpers.c2f(number(op.dewpoint&&op.dewpoint.value))):'—');
      stat('Visibility',number(op&&op.visibility&&op.visibility.value)==null?'—':(op.visibility.value*0.000621371).toFixed(0)+' mi');html('wxStats',stats.join(''));
      text('wxSummary',days.length?days[0].label+': '+days[0].short+' · High '+deg(days[0].high)+' / Low '+deg(days[0].low):state.loading?'Forecast loading…':'Forecast unavailable · Refresh to retry');
      html('wxHourly',hours.length?hours.map(function(h){return '<article class="wxl-hour"><h4>'+E(format(h.startTime,zone,{hour:'numeric'}))+'</h4><strong>'+deg(h.temperature)+'</strong>'+helpers.pixel(h.shortForecast,h.isDaytime)+'<p>'+E(h.shortForecast||'Forecast')+'</p><p class="wxl-note">'+(number(h.probabilityOfPrecipitation&&h.probabilityOfPrecipitation.value)==null?'Rain chance —':Math.round(h.probabilityOfPrecipitation.value)+'% precipitation')+'</p><p class="wxl-note">'+E([h.windSpeed,h.windDirection].filter(Boolean).join(' '))+'</p></article>';}).join(''):'<p class="wxl-empty">Hourly forecast '+(state.loading?'is loading…':'unavailable. Refresh to retry.')+'</p>');
      html('wxDaily',days.length?days.map(function(d){return '<article class="wxl-day"><h4>'+E(d.label)+'</h4>'+helpers.pixel(d.short,d.daytime)+'<p class="wxl-highlow"><b>High '+deg(d.high)+'</b><span>Low '+deg(d.low)+'</span></p><p>'+E(d.short||'Forecast unavailable')+'</p><p class="wxl-note">'+(d.rain==null?'Precipitation chance unavailable':d.rain+'% precipitation')+'</p><p class="wxl-note">'+E(d.wind)+'</p>'+(d.detail.length?'<details><summary>Forecast details</summary><p>'+E(d.detail.join('\n\n'))+'</p></details>':'')+'</article>';}).join(''):'<p class="wxl-empty">Seven-day forecast '+(state.loading?'is loading…':'unavailable. Refresh to retry.')+'</p>');
      var alert=alerts(state.al,Date.now()),confirmed=state.alertStatus==='ready',message=confirmed?(alert.items.length?alert.items.length+' active local alert'+(alert.items.length===1?'':'s'):'No active NWS alerts for this location'):state.alertStatus==='loading'?'Checking local NWS alerts…':'Local alert service unavailable · not an all-clear';
      text('wxTicker',message);text('wxAlertCount',alert.items.length?' '+alert.items.length:'');text('wxBugAlert',alert.items.length?alert.items.length+' ALERTS':'');el('wxBugAlert').classList.toggle('on',!!alert.items.length);
      html('wxAlerts',(!confirmed?'<p class="wxl-warning">'+E(message)+(alert.items.length?' · Last received alerts follow; their status may have changed.':'')+'</p>':'')+(alert.items.length?alert.items.map(function(f){var p=f.properties,kind=helpers.alertKind(p.event);return '<article class="wxl-alert" style="--alert-color:'+kind.color+'">'+helpers.alertChip(p,zone)+'<p>'+E(p.headline||p.event||'Weather alert')+'</p><p>'+E(p.description||'')+'</p>'+(p.instruction?'<p><b>What to do:</b> '+E(p.instruction)+'</p>':'')+'</article>';}).join(''):confirmed?'<p class="wxl-clear">No active NWS alerts for '+E(place)+'.</p>':''));
      text('wxBugTemp',deg(fahrenheit));text('wxBugPlace',place.toUpperCase());
      if(options.onStatus)options.onStatus(fahrenheit==null?'Local forecast · '+place:fahrenheit+'°F · '+desc);
      if(!manualLayer&&li.radar)selectedLayer='local';paintRadar(!lastLoading&&state.loading);lastLoading=state.loading;tick();
    }
    function tick(){if(live())text('wxBugClock',format(Date.now(),state&&state.li&&state.li.timeZone,{hour:'numeric',minute:'2-digit'}));}
    tick();var timer=(options.interval||setInterval)(tick,1000),hourTimer=(options.interval||setInterval)(function(){if(state)update(state);},60000);
    return {update:update,panel:panel,nextRadar:function(){if(!live())return;var list=choices(),i=list.findIndex(function(c){return c.key===selectedLayer;});manualLayer=true;selectedLayer=list[(i+1)%list.length].key;paintRadar(true);},dispose:function(){disposed=true;radarSeq++;clearInterval(timer);clearInterval(hourTimer);if(radarTimer)clearTimeout(radarTimer);if(radarImage){radarImage.onload=null;radarImage.onerror=null;}bindings.forEach(function(b){b[0].removeEventListener(b[1],b[2]);});}};
  }
  return {hourly:hourly,daily:daily,alerts:alerts,createLoader:createLoader,format:format,number:number,markup:markup,mount:mount};
});
