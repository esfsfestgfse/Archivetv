'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.join(__dirname,'../assets/weather-local.js');
const api=fs.existsSync(file)?require(file):{};
const now=Date.parse('2026-10-23T18:15:00Z'),loc={lat:31.5785,lon:-97.1289,label:'Waco, TX'};
function method(key){assert.equal(typeof api[key],'function','Local weather needs '+key);return api[key];}
const fc={properties:{updated:'2026-10-23T17:00:00Z',periods:[{name:'Today',startTime:'2026-10-23T12:00:00-05:00',endTime:'2026-10-23T18:00:00-05:00',isDaytime:true,temperature:85,shortForecast:'Sunny'},
 {name:'Tonight',startTime:'2026-10-23T18:00:00-05:00',endTime:'2026-10-24T06:00:00-05:00',isDaytime:false,temperature:56,shortForecast:'Clear'},
 {name:'Saturday',startTime:'2026-10-24T06:00:00-05:00',endTime:'2026-10-24T18:00:00-05:00',isDaytime:true,temperature:83,shortForecast:'Rain',probabilityOfPrecipitation:{value:50}}]}};
const point={properties:{forecast:'https://api.weather.gov/test/forecast',forecastHourly:'https://api.weather.gov/test/hourly',observationStations:'https://api.weather.gov/test/stations',timeZone:'America/Chicago',radarStation:'KGRK',relativeLocation:{properties:{city:'Waco',state:'TX'}}}};
function fixture(overrides={}){return Object.assign({
 points:point,forecast:fc,hourly:{properties:{periods:[]}},stations:{features:[{properties:{stationIdentifier:'KACT'}}]},latest:{properties:{timestamp:'2026-10-23T18:00:00Z',temperature:{value:27},textDescription:'Clear'}},alerts:{features:[]}
},overrides);}
function loader(data,extra={}){
 const updates=[],reads=[];const create=method('createLoader');
 const load=create(Object.assign({now:()=>now,isCurrent:()=>true,onUpdate:s=>updates.push(s),read:async url=>{reads.push(url);const key=url.includes('/points/')?'points':url.includes('/alerts/')?'alerts':url.split('/').pop();const value=data[key];if(value instanceof Error)throw value;return await value;},fallback:async()=>{throw Error('fallback unavailable');}},extra));
 return {load,updates,reads};
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
test('hourly forecast drops ended periods, retains the current hour, and sorts future hours',()=>{
 const rows=method('hourly')([{startTime:'2026-10-23T12:00:00-05:00',endTime:'2026-10-23T13:00:00-05:00',temperature:70},
  {startTime:'2026-10-23T15:00:00-05:00',endTime:'2026-10-23T16:00:00-05:00',temperature:83},
  {startTime:'2026-10-23T13:00:00-05:00',endTime:'2026-10-23T14:00:00-05:00',temperature:81}],now);
 assert.deepEqual(rows.map(x=>x.temperature),[81,83]);
});
test('day/night forecast periods become calendar days with independent highs and lows',()=>{
 const days=method('daily')(fc.properties.periods,'America/Chicago',now);
 assert.equal(days.length,2);assert.equal(days[0].high,85);assert.equal(days[0].low,56);assert.equal(days[1].high,83);assert.equal(days[1].low,null);assert.equal(days[1].rain,50);
});
test('night-only first day is a low, not an invented daytime high',()=>{
 const days=method('daily')([fc.properties.periods[1]],'America/Chicago',now);assert.equal(days[0].high,null);assert.equal(days[0].low,56);
});
test('daily grouping follows forecast location timezone, not the PC timezone',()=>{
 const days=method('daily')([{startTime:'2026-10-24T02:00:00Z',endTime:'2026-10-24T10:00:00Z',isDaytime:false,temperature:50}],'America/Los_Angeles',now);
 assert.equal(days[0].key,'2026-10-23');
});
test('all seven forecast days survive normalization, including fallback lows',()=>{
 const rows=Array.from({length:7},(_,i)=>({startTime:'2026-10-'+(23+i)+'T12:00:00-05:00',isDaytime:true,temperature:80-i,lowTemperature:50-i,shortForecast:'Clear'}));
 const days=method('daily')(rows,'America/Chicago',now);assert.equal(days.length,7);assert.equal(days[6].high,74);assert.equal(days[6].low,44);
});
test('alert failure and successful empty alerts are distinct states',()=>{
 const alerts=method('alerts');assert.equal(alerts(null,now).status,'unavailable');assert.equal(alerts({features:[]},now).status,'clear');assert.equal(alerts({},now).status,'unavailable');
});
test('expired/duplicate local alerts cannot flood the page',()=>{
 const good={id:'a',properties:{event:'Flash Flood Warning',expires:'2026-10-23T20:00:00Z',areaDesc:'McLennan, TX'}};
 const result=method('alerts')({features:[good,good,{id:'old',properties:{event:'Tornado Warning',expires:'2026-10-23T17:00:00Z'}}]},now);
 assert.equal(result.status,'active');assert.equal(result.items.length,1);assert.equal(result.items[0].properties.areaDesc,'McLennan, TX');
});
test('forecast paints before a slow station lookup completes',async()=>{
 const station=deferred(),h=loader(fixture({stations:station.promise})),pending=h.load.refresh(loc);await new Promise(r=>setImmediate(r));
 assert.ok(h.updates.some(x=>x.fc&&x.fc.properties.periods.length),'forecast must not wait for observations');
 station.resolve({features:[]});await pending;
});
test('a failed alerts request never becomes a false all-clear during forecast fallback',async()=>{
 const h=loader(fixture({points:Error('NWS unavailable'),alerts:Error('alerts unavailable')}),{fallback:async()=>({fc,hr:{properties:{periods:[]}},obs:{sid:'OPEN-METEO',p:{temperature:{value:25}}},source:'OPEN-METEO'})});
 await h.load.refresh(loc);const last=h.updates.at(-1);assert.ok(last.fc);assert.equal(last.alertStatus,'unavailable');assert.equal(last.al,null);
});
test('valid local alerts remain available even when forecast service fails',async()=>{
 const h=loader(fixture({points:Error('offline'),alerts:{features:[{id:'alert',properties:{event:'Flood Warning',expires:'2026-10-23T22:00:00Z'}}]}}));await h.load.refresh(loc);
 const last=h.updates.at(-1);assert.equal(last.alertStatus,'ready');assert.equal(last.al.features[0].id,'alert');
});
test('a fresh same-location cache appears immediately and refresh still runs',async()=>{
 const p=deferred(),h=loader(fixture({points:p.promise}),{readCache:()=>({key:'31.579,-97.129',savedAt:now-60000,data:{fc,loc,li:{city:'Waco'},al:{features:[]}}})});
 const pending=h.load.refresh(loc);assert.ok(h.updates.some(x=>x.cached&&x.fc));p.resolve(point);await pending;assert.ok(h.reads.some(x=>x.includes('/points/')));
});
test('a different-location or expired cache cannot leak into the local forecast',async()=>{
 for(const cached of [{key:'40.000,-74.000',savedAt:now,data:{fc}},{key:'31.579,-97.129',savedAt:now-3*3600000,data:{fc}}]){
  const p=deferred(),h=loader(fixture({points:p.promise}),{readCache:()=>cached});const pending=h.load.refresh(loc);assert.ok(!h.updates.some(x=>x.fc));p.resolve(point);await pending;
 }
});
test('repeated refresh requests share in-flight work and disposal blocks late painting',async()=>{
 const p=deferred();let live=true;const h=loader(fixture({points:p.promise}),{isCurrent:()=>live});const a=h.load.refresh(loc),b=h.load.refresh(loc);assert.equal(a,b);
 const before=h.updates.length;live=false;h.load.dispose();p.resolve(point);await a;assert.equal(h.updates.length,before);
});
test('a late older location cannot overwrite a newer location or its saved cache',async()=>{
 const p=deferred(),saved=[];let count=0;const h=loader(fixture(),{writeCache:x=>saved.push(x),read:async u=>{if(u.includes('/points/'))return ++count===1?p.promise:point;return u.includes('/alerts/')?{features:[]}:u.endsWith('/forecast')?fc:u.endsWith('/hourly')?{properties:{periods:[]}}:{features:[]};}});
 const old=h.load.refresh(loc);await new Promise(r=>setImmediate(r));await h.load.refresh({lat:40,lon:-74,label:'New York'});const at=h.updates.length;p.resolve(point);await old;
 assert.equal(h.updates.length,at);assert.equal(saved.at(-1).key,'40.000,-74.000');
});
test('leaving the channel aborts pending weather network requests',async()=>{
 const p=deferred(),signals=[];const h=loader(fixture(),{read:async(u,signal)=>{signals.push(signal);return p.promise;}});const pending=h.load.refresh(loc);await new Promise(r=>setImmediate(r));h.load.dispose();assert.ok(signals.length);assert.ok(signals.every(s=>s&&s.aborted));p.resolve({});await pending;
});
test('fresh fallback replaces saved conditions when NWS is down',async()=>{
 const fresh={properties:{periods:[{temperature:72,startTime:'2026-10-23T12:00:00-05:00',isDaytime:true}]}};
 const h=loader(fixture({points:Error('offline')}),{readCache:()=>({key:'31.579,-97.129',savedAt:now-60000,data:{fc,obs:{sid:'KACT',p:{temperature:{value:27}}}}}),fallback:async()=>({fc:fresh,obs:{sid:'OPEN-METEO',p:{temperature:{value:22}}}})});
 await h.load.refresh(loc);assert.equal(h.updates.at(-1).fc.properties.periods[0].temperature,72);assert.equal(h.updates.at(-1).obs.sid,'OPEN-METEO');
});
test('an alerts-only response cannot renew the age of stale weather cache',async()=>{
 const saved=[],h=loader(fixture({points:Error('offline')}),{readCache:()=>({key:'31.579,-97.129',savedAt:now-60000,data:{fc}}),writeCache:x=>saved.push(x)});
 await h.load.refresh(loc);assert.equal(saved.length,0);assert.equal(h.updates.at(-1).cached,true);
});
for(const kind of ['forecast','observation'])test('fresh '+kind+' cannot renew or disguise older independent weather fields',async()=>{
 let clock=now,cache={key:'31.579,-97.129',savedAt:now-115*60000,data:{fc,obs:{sid:'KACT',p:{temperature:{value:10}}}}};
 const h=loader(fixture(kind==='observation'?{forecast:Error('forecast offline')}:{latest:Error('observation offline')}),{now:()=>clock,readCache:()=>cache,writeCache:value=>{cache=value;}});
 await h.load.refresh(loc);const first=h.updates.at(-1),oldField=kind==='observation'?'fc':'obs';
 assert.ok(first.cachedFields.includes(oldField),'still-used old data must retain its own saved-data label');
 assert.equal(cache.fieldTimes[oldField],now-115*60000,'partial success must not renew another field');
 clock+=10*60000;await h.load.refresh(loc);assert.equal(h.updates.at(-1)[oldField],null,'field must expire independently after two hours');
});
for(const name of ['the_dial_desktop.html','the_dial_mobile.html'])test(name+': Open-Meteo fallback uses absolute timestamps and preserves actual lows without inventing alerts',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8'),start=html.indexOf('async function fetchOpenMeteoWeather('),end=html.indexOf('/* 1.5.5:',start);let requested='';
 const payload={timezone:'America/Chicago',utc_offset_seconds:-18000,current:{time:1792778400,temperature_2m:25,weather_code:0},hourly:{time:[Math.floor(now/1000)],temperature_2m:[25],weather_code:[0]},daily:{time:[Math.floor(now/1000)],temperature_2m_max:[30],temperature_2m_min:[15],weather_code:[0]}};
 const read=async u=>{requested=u;return payload;},scope={window:{RealSignalWeatherLocal:api},fetchJSONResilient:read,wxWmoText:()=> 'Clear',wxC2F:v=>v==null?null:Math.round(v*9/5+32),wxKmh2Mph:v=>Math.round(v*0.621371),wxCompass:()=> 'S',Date:class extends Date{static now(){return now;}}};
 vm.createContext(scope);vm.runInContext(html.slice(start,end),scope);const result=await scope.fetchOpenMeteoWeather(loc,read);
 assert.ok(requested.includes('timeformat=unixtime'));assert.equal(result.fc.properties.timeZone,'America/Chicago');assert.equal(result.fc.properties.periods[0].lowTemperature,59);assert.equal(result.al,null);assert.ok(/Z$/.test(result.obs.p.timestamp));
});
for(const name of ['the_dial_desktop.html','the_dial_mobile.html'])test(name+': warning summaries do not combine unrelated hazards or lose state/type',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8'),scope={esch:String};vm.createContext(scope);vm.runInContext(html.slice(html.indexOf('function wxAlertKind('),html.indexOf('function wxPixelForecast(')),scope);
 const result=scope.wxNationalAlertHTML([{properties:{event:'Freeze Warning',areaDesc:'Morris',geocode:{UGC:['NJZ001']}}},{properties:{event:'Special Marine Warning',areaDesc:'Coastal waters'}}]);
 assert.ok(result.includes('1 FREEZE WARNING'));assert.ok(result.includes('1 SPECIAL MARINE WARNING'));assert.ok(result.includes('NJ'));
 assert.ok(scope.wxAlertChip({event:'Flash Flood Watch',areaDesc:'McLennan',geocode:{UGC:['TXZ118']}}).includes('FLASH FLOOD WATCH'));
 const local=scope.wxAlertChip({event:'Flood Warning',expires:'2026-10-23T18:00:00Z'},'America/Chicago');
 assert.ok(local.includes('1:00 PM CDT'),'alert expiry must use the forecast location timezone and identify it');
});
