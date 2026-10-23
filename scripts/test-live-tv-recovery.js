const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function catalog(file){
 const text=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),scope={console,URL,URLSearchParams,Date,store:{get:(k,v)=>v,set(){}},window:{},v2Hash:x=>x};
 vm.createContext(scope);
 if(fs.existsSync(path.join(root,'assets/fast-catalog.js')))vm.runInContext(fs.readFileSync(path.join(root,'assets/fast-catalog.js'),'utf8'),scope);
 vm.runInContext(text.slice(text.indexOf('function streamProxyList('),text.indexOf('function ensureTVCSS(')),scope);
 return {scope,text};
}
function playback(file){
 const h=catalog(file),instances=[],timers=[],health=[];
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.style={};this.children=[];this.events={};this.classList={add(){},remove(){}};this.currentTime=0;this.readyState=0;this.videoWidth=0;this.paused=false;}
  set innerHTML(x){this.children=[];this.html=x;}get innerHTML(){return this.html;}
  appendChild(x){this.children.push(x);return x;}setAttribute(){}addEventListener(name,fn){this.events[name]=fn;}
  pause(){this.paused=true;}play(){return Promise.resolve();}canPlayType(){return 'maybe';}
  querySelector(selector){return selector==='video'?this.children.find(x=>x.tagName==='VIDEO'):null;}querySelectorAll(){return [];}
 }
 class Hls{
  static isSupported(){return true;}static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};static ErrorTypes={NETWORK_ERROR:'network',MEDIA_ERROR:'media'};
  constructor(){this.events={};this.reloads=0;this.destroyed=false;instances.push(this);}on(name,fn){this.events[name]=fn;}
  loadSource(url){this.url=url;}attachMedia(v){this.video=v;}destroy(){this.destroyed=true;}startLoad(){this.reloads++;}recoverMediaError(){this.recovered=true;}
  fire(name,data){this.events[name]?.(null,data);}
 }
 const pane=new Element('section'),elements={tvPane:pane};
 Object.assign(h.scope,{token:1,powered:true,tvPlaybackRun:0,$:id=>elements[id],document:{createElement:tag=>new Element(tag)},
  nlog(){},esch:String,noteLiveStreamGuide(){},markTvOk:(c)=>health.push(c.name),markTvFail(){},
  looksRadio:c=>/radio/i.test(c.name),isRedirectorUrl:u=>/jmp2\.uk/.test(u),loadHlsLib:async()=>Hls,
  tvHealthAll:()=>({}),tvHealthKey:c=>String(c.url||c.name).slice(0,180),
  setTimeout:(fn,ms)=>{const t={fn,ms,active:true};timers.push(t);return t;},clearTimeout:t=>{if(t)t.active=false;}});
 h.scope.window.__tvNoAdvance=true;
 vm.runInContext(h.text.slice(h.text.indexOf('async function playTV('),h.text.indexOf('async function tuneLiveTV(')),h.scope);
 return {...h,instances,timers,health,pane,elements,Hls};
}
for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
 test(file+': a recently working same-channel provider starts before a recently failed one',async()=>{
  const h=playback(file),at=Date.now();h.scope.tvHealthAll=()=>({'https://a/live.m3u8':{f:1,lastFail:at},'https://b/live.m3u8':{f:0,lastOk:at}});
  await h.scope.playTV({name:'One',src:'Tubi',url:'https://a/live.m3u8',alternates:[{name:'One',src:'Tablo',url:'https://b/live.m3u8'}]},1);
  assert.match(h.instances[0].url,/b%2Flive\.m3u8/);
 });
 test(file+': recording a provider failure cannot reorder recovery back onto the failed URL',async()=>{
  const h=playback(file),health={};h.scope.tvHealthAll=()=>health;
  h.scope.markTvFail=c=>{health[c.url]={f:1,lastFail:Date.now()};};
  await h.scope.playTV({name:'One',src:'Tubi',url:'https://a/live.m3u8',alternates:[{name:'One',src:'Tablo',url:'https://b/live.m3u8'}]},1);
  h.instances[0].fire('error',{fatal:true,type:'other'});h.timers.find(t=>t.ms===400).fn();await new Promise(r=>setImmediate(r));
  assert.equal(h.instances.length,2);assert.match(h.instances[1].url,/b%2Flive\.m3u8/);
 });
 test(file+': a healthy provider alternative prevents hiding the whole channel',()=>{
  const {scope,text}=catalog(file),now=Date.now();
  scope.store.get=(key,fallback)=>key==='tvHealth'?{'https://a/live':{f:2,t:now}}:fallback;
  scope.nlog=()=>{};
  vm.runInContext(text.slice(text.indexOf('var TVH_KEY='),text.indexOf('async function playTV(')),scope);
  const row={name:'One',url:'https://a/live',alternates:[{name:'One',url:'https://b/live'}]};
  assert.equal(scope.cullDead([row]).list.length,1);
 });
 test(file+': Sports uses the already-warmed shared directory without repeating provider discovery',async()=>{
  const {scope}=catalog(file);scope.fetchIPTV=async()=>[{name:'Tennis',cat:'Sports',src:'Tablo',url:'https://a/live'},
   {name:'Drama',cat:'General',url:'https://b/live'},{name:'Deportes',cat:'Sports',url:'https://c/live'}];
  scope.fetch=()=>{throw Error('Sports must not restart network discovery');};
  assert.deepEqual(JSON.parse(JSON.stringify(await scope.fetchSportsIPTV())).map(x=>x.name),['Tennis']);
 });
 test(file+': shared Free-TV ingestion retains English-region direct streams without treating watch pages as TV',async()=>{
  const {scope}=catalog(file);assert.ok(scope.FAST_FEEDS.some(f=>f[0]==='Free-TV'));
  scope.nlog=()=>{};scope.fetchM3UTextBounded=async()=> '#EXTM3U\n#EXTINF:-1 group-title="USA",Sports USA\nhttps://example.org/a.m3u8\n#EXTINF:-1 group-title="UK",UK Sport\nhttps://example.org/b.m3u8\n#EXTINF:-1 group-title="France",France\nhttps://example.org/c.m3u8\n#EXTINF:-1 group-title="USA",Watch page\nhttps://www.youtube.com/watch?v=example\n';
  assert.deepEqual(JSON.parse(JSON.stringify(await scope.fetchM3USource('Free-TV','https://example.org/feed'))).map(x=>x.name),['Sports USA','UK Sport']);
 });
 test(file+': Sports retains same-channel recovery when an alternate lacks a sport category',async()=>{
  const {scope}=catalog(file);scope.fetchIPTV=async()=>[{name:'Willow',cat:'Sports',src:'Tubi',url:'https://a/live',alternates:[{name:'Willow',cat:'General',src:'Tablo',url:'https://b/live'}]}];
  const rows=await scope.fetchSportsIPTV();assert.equal(rows[0].alternates.length,1);assert.equal(rows[0].alternates[0].src,'Tablo');
 });
 test(file+': a completed shared catalog fills Sports without replacing its playing video',()=>{
  const {scope,text}=catalog(file),list={},pane={unchanged:true};let rendered=0;
  const start=text.indexOf('      function updateSportsCatalog(items){'),end=text.indexOf('      window.__tvRefreshSources=updateSportsCatalog;',start);
  assert.ok(start>=0&&end>start,'Sports subscribes to the completed catalog');
  Object.assign(scope,{my:1,token:1,sportsSubView:'livetv',sportsListEl:list,sportsSearch:{value:''},sportsCount:null,sportsEpgById:{},
   $:id=>id==='sportsLiveList'?list:pane,epgFor:()=>null,chans:[],cullDead:rows=>({list:rows,hidden:0}),sortByHealthThenName:rows=>rows,renderSportsCards:()=>rendered++});
  vm.runInContext(text.slice(start,end),scope);
  scope.updateSportsCatalog([{name:'Tennis',cat:'Sports',url:'https://a/live',src:'Tubi'}]);
  assert.equal(scope.chans.length,1);assert.equal(rendered,1);assert.equal(pane.unchanged,true);
 });
 test(file+': native HLS gets a source even if the optional player library never loads',async()=>{
  const h=playback(file);h.scope.loadHlsLib=()=>new Promise(()=>{});
  const pending=h.scope.playTV({name:'A',src:'Tubi',url:'https://tubi.io/a.m3u8'},1);
  const library=h.timers.find(t=>t.ms===2500);assert.ok(library,'bounded library fallback before the startup deadline');
  library.fn();await pending;assert.match(h.pane.querySelector('video').src,/a\.m3u8/);
 });
 test(file+': HP-style comma-separated attributes do not leak into the title',()=>{
  const {scope}=catalog(file);
  const row=scope.parseM3U('#EXTM3U\n#EXTINF:-1,tvg-id="USA Today News",tvg-logo="https://example.org/logo.png",USA Today News\nhttps://example.org/live.m3u8\n')[0];
  assert.equal(row.name,'USA Today News');assert.equal(row.tvgId,'USA Today News');
 });
 test(file+': a Roku redirect uses the HLS-aware relay enabled for its final CDN',()=>{
  const {scope}=catalog(file);
  assert.equal(scope.tvPlaybackProxies({name:'Sports',src:'Roku',url:'https://jmp2.uk/roku/test.m3u8'})[0],'https://hls-proxy.tdy1990.workers.dev');
 });
 test(file+': catalog relay wrappers are unwrapped before building playback routes',()=>{
  const {scope}=catalog(file),url='https://amc.example.org/live.m3u8';
  const row=scope.parseM3U('#EXTM3U\n#EXTINF:-1,Channel\nhttps://tv-proxy.tdy1990.workers.dev/?url='+encodeURIComponent(url)+'\n')[0];
  assert.equal(row.url,url);
 });
 test(file+': the persisted directory keeps every provider represented within its size limit',()=>{
  const {scope}=catalog(file);let saved;
  scope.store.set=(key,row)=>{if(key==='fastCatalog')saved=row;};
  const rows=Array.from({length:20},(_,i)=>({name:'IPTV '+i,src:'IPTV-org',url:'https://a/'+i}));
  rows.push({name:'Tablo One',src:'Tablo',url:'https://b/live'},{name:'Fire One',src:'Fire TV',url:'https://c/live'});
  scope.FAST_CATALOG_MAX_ITEMS=6;scope.saveIptvCatalog(rows);
  assert.ok(saved.items.length<=6);
  assert.deepEqual([...new Set(saved.items.flatMap(c=>scope.tvChannelVariants(c).map(v=>v.src)))].sort(),['Fire TV','IPTV-org','Tablo']);
 });
 test(file+': ending or failing a picked feed never jumps to an unrelated channel',async()=>{
  const h=playback(file);h.scope.window.__tvNoAdvance=false;
  h.scope.store.get=()=> 'https://tv-proxy.tdy1990.workers.dev';
  const a={name:'A',src:'Tubi',url:'https://tubi.io/a.m3u8'},b={name:'B',src:'Tubi',url:'https://tubi.io/b.m3u8'};
  await h.scope.playTV(a,1,[a,b],0,1);
  h.instances[0].fire('error',{fatal:true,type:'other'});
  for(const t of h.timers.filter(t=>t.active))t.fn();
  await new Promise(r=>setImmediate(r));assert.equal(h.instances.length,1);
 });
 test(file+': stopping playback cancels a pending retry and releases the current player',async()=>{
  const h=playback(file);
  await h.scope.playTV({name:'A',src:'Pluto TV',url:'https://jmp2.uk/pluto/a.m3u8'},1);
  h.instances[0].fire('error',{fatal:true,type:'other'});const retry=h.timers.find(t=>t.ms===400);
  h.scope.stopTVPlayback();retry.fn();await new Promise(r=>setImmediate(r));
  assert.equal(h.instances.length,1);assert.equal(h.instances[0].destroyed,true);assert.equal(h.scope.tvHls,null);
 });
 test(file+': a delayed old library load cannot create a second player after a newer selection',async()=>{
  const h=playback(file);let resolve;
  h.scope.loadHlsLib=()=>new Promise(r=>{resolve=r;});
  const old=h.scope.playTV({name:'A',src:'Tubi',url:'https://tubi.io/a.m3u8'},1);
  h.scope.loadHlsLib=async()=>h.Hls;
  await h.scope.playTV({name:'B',src:'Tubi',url:'https://tubi.io/b.m3u8'},1);
  resolve(h.Hls);await old;
  assert.equal(h.instances.length,1);assert.match(h.instances[0].url,/b\.m3u8/);
 });
 test(file+': a stale fatal callback cannot reload or destroy the newer selection',async()=>{
  const h=playback(file);
  await h.scope.playTV({name:'A',src:'Tubi',url:'https://tubi.io/a.m3u8'},1);const old=h.instances[0];
  await h.scope.playTV({name:'B',src:'Tubi',url:'https://tubi.io/b.m3u8'},1);const current=h.instances[1];
  old.fire('error',{fatal:true,type:'network',response:{code:403}});
  assert.equal(current.reloads,0);assert.equal(current.destroyed,false);assert.equal(h.scope.tvHls,current);
 });
 test(file+': startup is bounded even when no manifest ever arrives',async()=>{
  const h=playback(file);
  await h.scope.playTV({name:'A',src:'Tubi',url:'https://tubi.io/a.m3u8'},1);
  assert.ok(h.timers.some(t=>t.active&&t.ms<=10000),'deadline must not depend on MANIFEST_PARSED');
 });
 test(file+': an audio-only decoder cannot mark a television feed healthy',async()=>{
  const h=playback(file);
  await h.scope.playTV({name:'Sport One',src:'Tubi',url:'https://tubi.io/a.m3u8'},1);
  const video=h.instances[0].video;video.currentTime=1;video.readyState=4;video.events.timeupdate();
  assert.deepEqual(h.health,[]);
 });
 test(file+': terminal HTTP errors skip futile network reloads',async()=>{
  const h=playback(file);
  await h.scope.playTV({name:'A',src:'Pluto TV',url:'https://jmp2.uk/pluto/a.m3u8'},1);
  h.instances[0].fire('error',{fatal:true,type:'network',response:{code:403}});
  assert.equal(h.instances[0].reloads,0);
 });
 test(file+': an old scheduled route retry cannot replace a later manual selection',async()=>{
  const h=playback(file);
  await h.scope.playTV({name:'A',src:'Pluto TV',url:'https://jmp2.uk/pluto/a.m3u8'},1);
  h.instances[0].fire('error',{fatal:true,type:'other'});
  const retry=h.timers.find(t=>t.ms===400);assert.ok(retry);
  await h.scope.playTV({name:'B',src:'Tubi',url:'https://tubi.io/b.m3u8'},1);
  retry.fn();await new Promise(r=>setImmediate(r));
  assert.equal(h.instances.length,2);assert.match(h.scope.tvHls.url,/b\.m3u8/);
 });
 test(file+': a saved Sports auto-rotate preference cannot switch the selected sport',async()=>{
  const {text,scope}=catalog(file),selected=[];let interval,clock=100000;
  const start=text.indexOf('  (function(){\n    var cats=[];',text.indexOf('async function tuneSports('));
  const end=text.indexOf('\n}\n/* Public WebSDR',start);assert.ok(start>0&&end>start);
  const picker={value:'a',addEventListener(){}},a={k:'a',label:'A',cat:'ball',espn:'a'},b={k:'b',label:'B',cat:'ball',espn:'b'};
  Object.assign(scope,{SPORTS_LIST:[a,b],curSport:a,curEvents:[{status:{type:{state:'in'}}}],sportsSubView:'scores',
   my:1,token:1,powered:true,pickerEl:picker,sportsRefreshEl:null,esch:String,window:{},
   store:{get:()=>true},renderSubPicker(){},loadSport:sp=>selected.push(sp.k),
   fetchSportsData:async()=>({events:[{status:{type:{state:'in'}}}]}),nlog(){},$:()=>picker,
   Date:{now:()=>clock},rtInterval:fn=>{interval=fn;}});
  vm.runInContext(text.slice(start,end),scope);clock+=60000;interval();await new Promise(r=>setImmediate(r));
  assert.ok(!selected.includes('b'),'only manual input may select B');assert.equal(picker.value,'a');
 });
 test(file+': quoted attribute commas cannot become a channel title',()=>{
  const {scope}=catalog(file);
  const rows=scope.parseM3U('#EXTM3U\n#EXTINF:-1 http-user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0" group-title="Sports",FTF Sports\n#EXTVLCOPT:http-referrer=https://example.org/\nhttps://media.example.org/live.m3u8\n');
  assert.equal(rows[0].name,'FTF Sports');assert.equal(rows[0].cat,'Sports');
  assert.equal(rows[0].ref,'https://example.org/');assert.match(rows[0].ua,/KHTML, like Gecko/);
 });
 test(file+': promoting a stronger provider keeps flat serializable alternatives',()=>{
  const {scope}=catalog(file);assert.equal(typeof scope.mergeTVChannels,'function');
  const rows=scope.mergeTVChannels([{name:'Sport One',url:'https://a/live.m3u8',src:'IPTV-org'},{name:'Sport One',url:'https://b/live.m3u8',src:'Tubi',checked:true}]);
  assert.equal(rows.length,1);assert.equal(rows[0].src,'Tubi');
  assert.deepEqual(JSON.parse(JSON.stringify(rows))[0].alternates.map(x=>x.src),['IPTV-org']);
 });
 test(file+': quality suffix duplicates become fallback variants, not separate dead guide entries',()=>{
  const {scope}=catalog(file);
  const rows=scope.mergeTVChannels([{name:'Sports (1080p)',url:'https://a/live',src:'IPTV-org'},
   {name:'Sports',url:'https://b/live',src:'Xumo'},{name:'Sports Extra',url:'https://c/live',src:'Xumo'}]);
  assert.equal(rows.length,2);assert.equal(rows.find(x=>x.name==='Sports').alternates[0].url,'https://a/live');
 });
 test(file+': a provider-specific guide view selects its alternate without losing fallback',()=>{
  const {scope}=catalog(file);assert.equal(typeof scope.tvChannelForSource,'function');
  const row={name:'Sports',src:'Tubi',url:'https://a/live.m3u8',alternates:[{name:'Sports',src:'Tablo',url:'https://b/live.m3u8'}]};
  const selected=scope.tvChannelForSource(row,/^Tablo$/);
  assert.equal(selected.src,'Tablo');assert.equal(selected.url,'https://b/live.m3u8');
  assert.equal(selected.alternates[0].src,'Tubi');assert.equal(row.src,'Tubi');
 });
 test(file+': unsupported built-in relay is not retried before a compatible route',()=>{
  const {scope}=catalog(file);assert.equal(typeof scope.tvPlaybackProxies,'function');
  for(const row of [{src:'Tubi',url:'https://live-manifest.production-public.tubi.io/live.m3u8'},{src:'Plex',url:'https://epg.provider.plex.tv/live.m3u8'},{src:'FreeLiveSports',url:'https://test.playouts.now.amagi.tv/live.m3u8'}]){
   assert.equal(scope.tvPlaybackProxies(row)[0],'https://tv-proxy.tdy1990.workers.dev');
  }
  assert.equal(scope.tvPlaybackProxies({src:'Pluto TV',url:'https://jmp2.uk/pluto/test.m3u8'})[0],'https://hls-proxy.tdy1990.workers.dev');
 });
 test(file+': an explicit custom proxy remains first',()=>{
  const {scope}=catalog(file);assert.equal(typeof scope.tvPlaybackProxies,'function');
  scope.store.get=()=> 'https://custom.example.org,https://tv-proxy.tdy1990.workers.dev';
  assert.equal(scope.tvPlaybackProxies({src:'Tubi',url:'https://tubi.io/live.m3u8'})[0],'https://custom.example.org');
 });
}
