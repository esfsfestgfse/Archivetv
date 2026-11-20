const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'soak-ia-queues.js'), 'utf8');
async function measure(responses) {
  let now = 0, calls = 0;
  const sandbox = {
    require(name) {return name === 'node:fs' ? {readFileSync: () => '[{"channel":12,"queries":[]}]'} : require(name);},
    process: {argv: ['node', 'soak', '--manifest', 'unused', '--count', '5', '--timeout-ms', '22000', '--depth-timeout-ms', '6000']},
    console, Date: {now: () => now},
    setTimeout(fn, ms) {now += ms; fn();},
    nextResponse() {
      const entry = responses[Math.min(calls++, responses.length - 1)]; now += entry.ms;
      return {response: {ok: entry.status === 200, status: entry.status, headers: {get: key => key === 'x-afterglow-queue-fallback' && entry.fallback ? '1' : ''}},
        body: {ready: entry.ready, stale: Boolean(entry.fallback), items: Array.from({length: entry.items ?? entry.ready}, (_, i) => ({id: String(i)}))}};
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(0, source.lastIndexOf('main().catch')) + '\nrequestQueue=async()=>nextResponse();', sandbox);
  const result = await vm.runInContext('probeRotation({channel:12,name:"Test",queries:[]},0)', sandbox);
  return {result, calls};
}
async function verifyViewerHistory() {
  const sent = [];
  const sandbox = {
    require(name) { return name === 'node:fs' ? { readFileSync: () => '[{"channel":12,"queries":[]}]' } : require(name); },
    process: { argv: ['node','soak','--manifest','unused','--viewer-history','--count','1','--rotations','3'] },
    console, Date, AbortController, setTimeout, clearTimeout,
    async fetch(url, options) {
      sent.push({url, body: JSON.parse(options.body)});
      return {ok:true, status:200, headers:{get:()=>''}, json:async()=>({
        ready:1, items:[{identifier:'program-'+sent.length, media:{url:'https://archive.org/download/example/show.mp4'}}]
      })};
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(0, source.lastIndexOf('main().catch')), sandbox);
  await vm.runInContext('probe({channel:12,name:"Test",queries:[]})', sandbox);
  assert.ok(sent.every(row => row.url.endsWith('/api/v3/ia/queue') && row.body.serverCatalog));
  assert.deepEqual(sent.map(row => row.body.viewerRecentIds), [[], ['program-1'], ['program-1','program-2']]);
  assert.deepEqual(sent.map(row => row.body.recentIds), sent.map(row => row.body.viewerRecentIds));
  assert.ok(sent.every(row => row.body.sessionId === sent[0].body.sessionId));
}

(async () => {
  await verifyViewerHistory();
  const late = await measure([{status:200,ready:1,ms:7000},{status:200,ready:5,ms:1000}]);
  assert.equal(late.result.ready, 5, 'a late first item must still get a refill observation window');
  assert.equal(late.result.firstPlayLatencyMs, 7000);
  const pending = await measure([{status:200,ready:0,items:5,ms:12000}]);
  assert.equal(pending.result.ready, 0, 'unresolved candidates are not playback-ready');
  const failed = await measure([{status:503,ready:5,ms:12000}]);
  assert.equal(failed.result.ok, false, 'error response bodies must never count as ready');
  assert.equal(failed.result.ready, 0);
  assert.equal(failed.result.httpFailure, true);
  const retained = await measure([{status:200,ready:1,ms:7000},{status:503,ready:5,ms:7000}]);
  assert.equal(retained.result.ready, 1, 'retain only successfully observed readiness');
  const handoff = await measure([{status:200,ready:5,ms:100,fallback:true},{status:200,ready:5,ms:100,fallback:false}]);
  assert.equal(handoff.calls, 2, 'a full warm fallback must be rechecked before it passes the soak');
  assert.equal(handoff.result.warmHandoff, true, 'the soak must record a warm handoff even after it refreshes');
  console.log('IA soak measurements: refill timing and HTTP readiness passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
