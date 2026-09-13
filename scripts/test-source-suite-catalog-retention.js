#!/usr/bin/env node
/* A fresh Source Suite pull must extend its verified catalog, not collapse it. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let failures = 0;

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const checks = [
    ['requalifies prior source caches during provider outages', source.includes('retainedItems=Array.isArray(cached&&cached.items)?cached.items.filter')],
    ['invalidates prior short-form source caches for freshness', source.includes('V2_SOURCE_CACHE_VERSION=21')],
    ['retains cached verified catalog items', source.includes('prior=v2Unique(cachedItems.concat(state.items||[]))')],
    ['mixes retained and newly discovered items', source.includes('merged=v2Unique(prior.concat(discovered))')],
    ['keeps the 96-item catalog ceiling', source.includes('V2_SOURCE_CATALOG_SIZE=96')],
    ['keeps the five-program ready buffer', source.includes('V2_SOURCE_READY_BUFFER=5')],
    ['IA skip history is enforced before queue selection', source.includes('iaProgramMedia[id]===null||iaPendingTooLong(id)||(id&&isTemporarilySkipped(id))')],
    ['Source Suite refresh does not fall back to a played item', source.includes('function v2TuneRefreshed') && !source.includes('if(next<0)next=state.items.findIndex(function(item){return String(item&&item.id||"")!==currentId;});')],
    ['Source Suite Next does not replay a played item when the shelf is exhausted', source.includes('window.__v2PreviewNext=function') && !source.includes('if(next<0)next=state.items.findIndex(function(item){return String(item&&item.id||"")!==currentId;});')],
    ['manual Source Suite Next has an available-item recovery path', source.includes('window.__v2PreviewNext=function(manual)') && source.includes('SOURCE SUITE · NEXT AVAILABLE PROGRAM')],
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
