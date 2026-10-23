'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'assets/weather-networks.js');
function harness(){
 const api=fs.existsSync(file)?require(file):{};
 const buttons=['local','fox','twc'].map(id=>({dataset:{weatherView:id},attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.events[k]=fn;},removeEventListener(k){delete this.events[k];}}));
 const local={hidden:false},network={hidden:true},events=[];let alive=true;
 const owner={querySelectorAll:()=>buttons,querySelector:s=>s==='#wxScreen'?local:network};
 assert.equal(typeof api.mount,'function','Weather Watch needs a shared network selector');
 const controller=api.mount(owner,{isCurrent:()=>alive,onSelect:feed=>events.push(feed?feed.name:'local'),stop:()=>events.push('stop')});
 return {api,buttons,local,network,events,controller,leave(){alive=false;},click(id){buttons.find(b=>b.dataset.weatherView===id).events.click?.();}};
}
test('forecast is the default without starting a live video',()=>{
 const h=harness();assert.equal(h.controller.current(),'local');assert.equal(h.local.hidden,false);assert.equal(h.network.hidden,true);assert.equal(h.buttons[0].attrs['aria-pressed'],'true');assert.deepEqual(h.events,[]);
});
test('selecting FOX Weather stops old media and opens the exact requested network',()=>{
 const h=harness();h.click('fox');assert.deepEqual(h.events,['stop','FOX Weather']);assert.equal(h.local.hidden,true);assert.equal(h.network.hidden,false);assert.equal(h.buttons[1].attrs['aria-pressed'],'true');
 assert.equal(h.api.feeds.fox.url,'https://247wlive.foxweather.com/stream/index.m3u8');
});
test('The Weather Channel is the English network, not an unrelated weather substitute',()=>{
 const h=harness();h.click('twc');assert.deepEqual(h.events,['stop','The Weather Channel']);assert.equal(new URL(h.api.feeds.twc.url).hostname,'twcprod-live.twc-tv.com');assert.equal(h.controller.current(),'twc');
});
test('rapid switches keep the last selection and returning to forecast releases media',()=>{
 const h=harness();h.click('fox');h.click('twc');h.click('local');assert.deepEqual(h.events,['stop','FOX Weather','stop','The Weather Channel','stop','local']);assert.equal(h.local.hidden,false);assert.equal(h.network.hidden,true);
});
test('clicking an already active network does not restart its video',()=>{
 const h=harness();h.click('fox');h.click('fox');assert.deepEqual(h.events,['stop','FOX Weather']);
});
test('departure and dispose prevent stale controls from starting any media',()=>{
 const h=harness();h.click('fox');h.leave();h.click('twc');assert.equal(h.controller.current(),'fox');h.controller.dispose();h.controller.dispose();h.click('local');assert.deepEqual(h.events,['stop','FOX Weather','stop']);
});
for(const name of ['the_dial_desktop.html','the_dial_mobile.html'])test(name+': network and local selection use the real player, music and guide lifecycle',()=>{
 const html=fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n'),start=html.indexOf('function mountWeatherNetworks('),end=html.indexOf('\nasync function tuneWeather(',start);
 assert.ok(start>=0&&end>start,'Weather integration must exist');
 const events=[],selection={current:()=> 'local',dispose:()=>events.push('dispose')};let options;
 const scope={window:{RealSignalWeather:{mount:(owner,o)=>{options=o;return selection;}}},token:1,powered:true,$:id=>id==='wxApp'?{}:{textContent:id==='wxBugPlace'?'WACO, TX':'82°F'},
  chanRT:{teardowns:[]},curItem:null,stopAfdSpeech:()=>events.push('quiet-speech'),tvPlaybackProxies:()=>['https://tv-proxy.tdy1990.workers.dev'],proxiedVia:(p,u)=>p+'/?url='+encodeURIComponent(u),stopTVPlayback:()=>events.push('stop'),stopIAJazz:()=>events.push('quiet'),startIAJazz:()=>events.push('jazz'),
  playTV:(feed,my)=>events.push(['play',feed.name,my]),showNow:(ch,sl,title)=>events.push(['now',title]),setChanStatus:(num,title)=>events.push(['status',num,title])};
 vm.createContext(scope);vm.runInContext(html.slice(start,end),scope);scope.mountWeatherNetworks({num:950},{},1);
 options.onSelect({name:'FOX Weather',url:'https://247wlive.foxweather.com/stream/index.m3u8'});assert.ok(events.includes('quiet'));assert.ok(events.includes('quiet-speech'),'network selection must cancel a spoken recap');assert.ok(events.some(x=>Array.isArray(x)&&x[0]==='play'&&x[1]==='FOX Weather'&&x[2]===1));
 assert.ok(events.some(x=>Array.isArray(x)&&x[0]==='status'&&x[1]===950&&x[2]==='FOX Weather'),'dock must not retain CONNECTING after playback starts');
 let handoff;Object.assign(scope,{byNum:()=>({num:950}),curNum:950,publishReceiverMedia:item=>handoff=item});
 const sync=html.slice(html.indexOf('  function sync(){'),html.indexOf('  function bindEndMessages(',html.indexOf('  function sync(){')));
 vm.runInContext(sync,scope);scope.sync();assert.equal(handoff.title,'FOX Weather');assert.equal(new URL(handoff.url).searchParams.get('url'),'https://247wlive.foxweather.com/stream/index.m3u8');
 events.length=0;options.onSelect(null);assert.ok(events.includes('jazz'));assert.ok(events.some(x=>Array.isArray(x)&&x[0]==='now'&&x[1]==='Weather Watch'));
 assert.equal(scope.curItem,null,'forecast must clear the previous video handoff');
 scope.token=2;assert.equal(options.isCurrent(),false);scope.chanRT.teardowns[0]();assert.ok(events.includes('dispose'));
});
for(const name of ['the_dial_desktop.html','the_dial_mobile.html'])test(name+': forecast refresh cannot replace live-network status and departure releases both controllers',async()=>{
 const html=fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n'),start=html.indexOf('async function tuneWeather('),end=html.indexOf('\nupdateBanBtn();',start);
 let viewOptions,loaderOptions,active='fox',updates=0,disposed=0;const statuses=[],owner={};
 const scope={window:{RealSignalWeatherLocal:{markup:()=>'<div id="wxScreen"></div>',mount:(root,options)=>{viewOptions=options;return {update:()=>updates++,dispose:()=>disposed++,nextRadar(){}};},createLoader:options=>{loaderOptions=options;return {refresh:async()=>{},dispose:()=>disposed++};}}},
  token:1,powered:true,hideOv(){},setSig(){},showNow(){},screenArea:{innerHTML:''},mountWeatherNetworks:()=>({current:()=>active}),$:()=>owner,getWxLocation:async()=>({lat:31,lon:-97}),locMode:'zip',homeLoc:{city:'Waco',state:'TX'},ensureWxIconCSS(){},rtInterval(){},readWeatherJSON(){},fetchOpenMeteoWeather(){},store:{get(){},set(){}},chanRT:{teardowns:[]},
  wxIcon(){},wxPixelForecast(){},wxAlertKind(){},wxAlertChip(){},radarSector(){},wxC2F(){},wxKmh2Mph(){},wxPa2InHg(){},wxCompass(){},setChanStatus:(n,s)=>statuses.push(s),quickBanner(){},stopAfdSpeech(){},startIAJazz(){},startHazTicker(){}};
 vm.createContext(scope);vm.runInContext(html.slice(start,end),scope);await scope.tuneWeather({num:950},{},1);
 viewOptions.onStatus('82°F');assert.deepEqual(statuses,[],'background local updates must not overwrite FOX/TWC');
 active='local';viewOptions.onStatus('82°F');assert.deepEqual(statuses,['82°F']);loaderOptions.onUpdate({});assert.equal(updates,1);
 scope.token=2;viewOptions.onStatus('stale');assert.deepEqual(statuses,['82°F']);assert.equal(loaderOptions.isCurrent(),false);
 scope.chanRT.teardowns.forEach(fn=>fn());assert.equal(disposed,2,'both loader and view must release their resources');
});
