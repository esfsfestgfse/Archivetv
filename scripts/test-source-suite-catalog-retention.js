#!/usr/bin/env node
/* A fresh Source Suite pull must extend its verified catalog, not collapse it. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let failures = 0;

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const checks = [
    ['requalifies prior source caches during provider outages', /retainedItems=Array\.isArray\(cached&&cached\.items\)\?cached\.items[^\n]{0,250}\.filter/.test(source)],
    ['invalidates strict-catalog source caches for programming freshness', /V2_SOURCE_CACHE_VERSION=(?:4[1-9]|[5-9][0-9]|[1-9][0-9]{2,})(?:,|;)/.test(source)],
    ['requires a deeper source shelf before treating it as healthy', source.includes('V2_SOURCE_MIN_CATALOG=12')],
    ['retains cached verified catalog items', source.includes('prior=v2Unique(cachedItems.concat(state.items||[]))')],
    ['mixes retained and newly discovered items', source.includes('merged=v2MergeCatalog(profile,prior,discovered)') && source.includes('discovered.concat(prior):prior.concat(discovered)')],
    ['keeps a bounded 512-item working catalog behind the ready buffer', source.includes('V2_SOURCE_CATALOG_SIZE=512')],
    ['keeps the five-program ready buffer', source.includes('V2_SOURCE_READY_BUFFER=5')],
    ['IA skip history is enforced before queue selection, with exhaustion recovery', source.includes('bypassFreshness=!!(q[i]&&q[i]._freshnessFallback)') && source.includes('(!bypassFreshness&&id&&isTemporarilySkipped(id))') && /!freshnessFallback&&isTemporarilySkipped\(item\.identifier(?:,readOnly)?\)/.test(source) && source.includes('queue-recovery')],
    ['Source Suite refresh does not fall back to a played item', source.includes('function v2TuneRefreshed') && !source.includes('if(next<0)next=state.items.findIndex(function(item){return String(item&&item.id||"")!==currentId;});')],
    ['Source Suite Next does not replay a played item when the shelf is exhausted', source.includes('window.__v2PreviewNext=function') && !source.includes('if(next<0)next=state.items.findIndex(function(item){return String(item&&item.id||"")!==currentId;});')],
    ['manual Source Suite Next has an available-item recovery path', source.includes('window.__v2PreviewNext=function(manual)') && source.includes('SOURCE SUITE · NEXT AVAILABLE PROGRAM')],
    ['Source Suite tunes away from a retained recently played item', source.includes('function v2FreshCursor') && source.includes('v2FreshCursor(profile,state);')],
    ['PeerTube fallback includes the federated search index', source.includes('https://search.joinpeertube.org') && source.includes('instances=')],
    ['PeerTube verifier reads nested streaming playlist files', source.includes('(d.files||[]).concat((d.streamingPlaylists||[]).reduce')],
    ['PeerTube verifier derives aspect ratio from selected media', source.includes('v2AspectRatio(file),candidate=')],
    ['PeerTube can release the first verified item before full hydration completes', source.includes('fastStart:true') && source.includes('v2PeerTubeCold(profile,rotation,onFirst)')],
    ['Cartoon cold start has a long-form PeerTube emergency lane', source.includes('vod.newellijay.tv') && source.includes('Gulliver') && source.includes('Popeye')],
    ['cartoon era gate accepts explicit full episodes without printed years', source.includes('20\\d\\d') && source.includes('full|complete)\\s+(?:cartoon|episode)')],
  ];
  for (const [label, pass] of checks) {
    console.log(`${file}: ${label}: ${pass ? 'ok' : 'FAIL'}`);
    if (!pass) failures++;
  }
}
if (failures) process.exitCode = 1;


/* Runtime checks: the returned ready shelf must not hide the candidate catalog. */
const vm = require('node:vm');
const assert = require('node:assert/strict');
(async()=>{
  for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
    const source=fs.readFileSync(path.join(root,file),'utf8'),values=new Map();
    const candidates=Array.from({length:140},(_,i)=>({id:'youtube:depth-'+i,title:'Photography program '+i,provider:'YouTube',
      duration:1800,aspectRatio:16/9,genreVerified:true,recoveryVerified:true,type:'embed',url:'https://www.youtube-nocookie.com/embed/depth-'+i}));
    let sent;
    const scope={IA_API_BASE:'https://api.invalid',v2Recent:()=>Array.from({length:180},(_,i)=>'seen-'+i),v2RecentSeries:()=>[],
      fetch:async(_url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({items:candidates.slice(0,5),candidateItems:candidates})};},
      withTO:p=>p,v2Unique:items=>[...new Map(items.map(x=>[x.id,x])).values()],v2Text:x=>String(x||''),
      v2AspectRatio:x=>x.aspectRatio||0,v2ProfileRuntimeOkay:x=>x.duration>=900,v2Landscape:x=>x.aspectRatio>1,
      v2CandidateRelevant:()=>true,v2Verified:x=>x,window:{},store:{get:(key,fallback)=>values.get(key)||fallback,set:(key,value)=>values.set(key,value)}};
    vm.createContext(scope);
    const start=source.indexOf('async function v2ServerSourceCatalog('),end=source.indexOf('\nasync function v2YouTube',start);
    vm.runInContext(source.slice(start,end),scope);
    const result=await scope.v2ServerSourceCatalog({name:'The Darkroom',profileKey:'darkroom'},0,false);
    assert.equal(result.items.length,140,file+': consume the qualified catalog, not only five ready items');
    // Exercise the complete runtime composition: the late bridge wraps v2Provider.
    scope.window.v2Provider=async(name,profile,rotation)=>scope.v2ServerSourceCatalog(profile,rotation,false);
    scope.window.fetch=scope.fetch;scope.setTimeout=()=>0;scope.clearTimeout=()=>{};
    scope.localStorage={getItem:()=>null,setItem:()=>{}};
    vm.runInContext(fs.readFileSync(path.join(root,'assets/source-catalog-client.js'),'utf8'),scope);
    const wrapped=await scope.window.v2Provider('server',{name:'The Darkroom',profileKey:'darkroom',providers:['youtube','peertube']},0);
    assert.equal(wrapped.items.length,140,file+': the bridge must preserve the canonical server adapter and its entire admitted catalog');

    assert.equal(sent.recentIds.length,180,file+': send actual-play history beyond the old 24-item cap');
    assert.equal(values.size,0,'fetching candidates must not mark them played');
    const remember=source.slice(source.indexOf('function v2Remember('),source.indexOf('\nfunction v2Rejected('));
    scope.v2Recent=key=>values.get('v2recent:'+key)||[];
    vm.runInContext(remember,scope);
    for(let i=0;i<140;i++)scope.v2Remember('The Darkroom',{id:'youtube:watched-'+i});
    assert.equal(values.get('v2recent:The Darkroom').length,140,file+': retain real plays beyond 24');
    const nextStart=source.indexOf('function v2NextFreshIndex('),nextEnd=source.indexOf('\nfunction v2MergeCatalog(',nextStart);
    vm.runInContext(source.slice(nextStart,nextEnd),scope);
    const state={items:candidates.slice(0,30),cursor:0,catalogExhausted:false},profile={name:'The Darkroom',profileKey:'darkroom'};
    values.set('v2recent:The Darkroom',state.items.map(x=>x.id));
    assert.equal(scope.v2NextFreshIndex(profile,state,candidates[0].id),-1,'unconfirmed exhaustion must wait for a server catalog read');
    state.catalogExhausted=true;
    assert.equal(scope.v2NextFreshIndex(profile,state,candidates[0].id),29,'confirmed exhaustion rotates to the oldest watched program instead of stopping at EOF');
    state.items.push(candidates[30]);
    assert.equal(scope.v2NextFreshIndex(profile,state,candidates[0].id),30,'new unseen programs always outrank exhausted fallback');

  }
  console.log('Source Suite candidate handoff and long actual-play history: passed');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
