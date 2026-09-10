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
    ['invalidates prior short-form source caches for freshness', source.includes('V2_SOURCE_CACHE_VERSION=18')],
    ['retains cached verified catalog items', source.includes('prior=v2Unique(cachedItems.concat(state.items||[]))')],
    ['mixes retained and newly discovered items', source.includes('merged=v2Unique(prior.concat(discovered))')],
    ['keeps the 96-item catalog ceiling', source.includes('V2_SOURCE_CATALOG_SIZE=96')],
    ['keeps the five-program ready buffer', source.includes('V2_SOURCE_READY_BUFFER=5')],
    ['IA skip history is enforced before queue selection', source.includes('iaProgramMedia[id]===null||iaPendingTooLong(id)||(id&&isTemporarilySkipped(id))')],
    ['Source Suite refresh does not fall back to a played item', source.includes('function v2TuneRefreshed') && !source.includes('if(next<0)next=state.items.findIndex(function(item){return String(item&&item.id||"")!==currentId;});')],
    ['Source Suite Next does not replay a played item when the shelf is exhausted', source.includes('window.__v2PreviewNext=function') && !source.includes('if(next<0)next=state.items.findIndex(function(item){return String(item&&item.id||"")!==currentId;});')],
  ];
  for (const [label, pass] of checks) {
    console.log(`${file}: ${label}: ${pass ? 'ok' : 'FAIL'}`);
    if (!pass) failures++;
  }
}
if (failures) process.exitCode = 1;
