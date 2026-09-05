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
      return {response: {ok: entry.status === 200, status: entry.status, headers: {get: () => ''}},
        body: {ready: entry.ready, items: Array.from({length: entry.ready}, (_, i) => ({id: String(i)}))}};
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(0, source.lastIndexOf('main().catch')) + '\nrequestQueue=async()=>nextResponse();', sandbox);
  const result = await vm.runInContext('probeRotation({channel:12,name:"Test",queries:[]},0)', sandbox);
  return {result, calls};
}
(async () => {
  const late = await measure([{status:200,ready:1,ms:7000},{status:200,ready:5,ms:1000}]);
  assert.equal(late.result.ready, 5, 'a late first item must still get a refill observation window');
  assert.equal(late.result.firstPlayLatencyMs, 7000);
  const failed = await measure([{status:503,ready:5,ms:12000}]);
  assert.equal(failed.result.ok, false, 'error response bodies must never count as ready');
  assert.equal(failed.result.ready, 0);
  assert.equal(failed.result.httpFailure, true);
  const retained = await measure([{status:200,ready:1,ms:7000},{status:503,ready:5,ms:7000}]);
  assert.equal(retained.result.ready, 1, 'retain only successfully observed readiness');
  console.log('IA soak measurements: refill timing and HTTP readiness passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
