/* Transport/admission and reservation checks, NOT decoded-device certification.
   Reuses the full audit inventory; serial requests avoid Archive burst noise. */
const fs = require('node:fs'), path = require('node:path');
const option = (name, fallback) => { const at = process.argv.indexOf(name); return at < 0 ? fallback : process.argv[at + 1]; };
async function checkCanaryReadiness(endpoint, request = fetch) {
  const local = await request(new URL('/__ia-canary', endpoint), { signal: AbortSignal.timeout(8000) });
  if (!local.ok) throw Error('local canary unavailable: HTTP ' + local.status);
  await local.body?.cancel();
  const archive = await request('https://archive.org/metadata/the-flintstones-season-2-d-3', { signal: AbortSignal.timeout(8000) });
  if (!archive.ok) throw Error('Archive metadata unavailable: HTTP ' + archive.status);
  const metadata = await archive.json();
  if (!Array.isArray(metadata.files) || !metadata.files.length) throw Error('Archive readiness metadata is incomplete');
  return { local: true, archiveMetadata: true };
}
async function main() {
  const endpoint = option('--endpoint', 'http://127.0.0.1:4188/api/v3');
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/api\/v3$/.test(endpoint)) throw Error('isolated loopback canary required');
  const inventory = JSON.parse(fs.readFileSync(option('--inventory', 'C:/Users/tdy19/Documents/Codex/2026-08-14/can/artifacts/ia-audit-2026-10-09/inventory-desktop.json'), 'utf8'));
  const channels = new Set(String(option('--channels', '')).split(',').filter(Boolean));
  const lanes = inventory.filter(row => !row.hiddenAlias && (!channels.size || channels.has(String(row.channel))));
  const output = path.resolve(option('--out', 'artifacts/ia-repair-canary-admission.json'));
  const rotations = Math.max(1, Math.min(3, Number(option('--rotations', '1')) || 1));
  const { qualifyIaFileRecord } = await import(require('node:url').pathToFileURL(path.join(__dirname, '../ia_file_contract.js')));
  const report = { measurement: 'live transport qualification and reservation order; not visible frames', endpoint, startedAt: new Date().toISOString(), rotations, results: [] };
  const post = async (route, body) => {
    const response = await fetch(endpoint + '/ia/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const payload = await response.json(); if (!response.ok) throw Error('HTTP ' + response.status + ': ' + payload.error); return payload;
  };
  function save() { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)); }
  try { report.readiness = await checkCanaryReadiness(endpoint); }
  catch (error) {
    report.aborted = true; report.abortReason = 'Preflight availability check failed: ' + error.message;
    report.finishedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ tested: 0, aborted: true, reason: report.abortReason, output }));
    process.exitCode = 1; return;
  }
  for (const lane of lanes) {
    const body = { ...lane, iaRepair: true, serverCatalog: true, count: 3, sessionId: 'ia-cert-' + Date.now() + '-' + lane.channel };
    const result = { channel: lane.channel, name: lane.name, audio: lane.audio, rotations: [], passed: true };
    const seen = new Set();
    for (let round = 0; round < rotations; round++) {
      const start = performance.now();
      try {
        const payload = await post('queue', body), items = payload.items || [], checks = items.map(item => qualifyIaFileRecord(item, body));
        const repeats = checks.filter(check => seen.has(check.item.logicalId)).length;
        const row = { queueMs: Math.round(performance.now() - start), ready: items.length, catalog: Number(payload.v2?.catalogSize || payload.candidates || 0), rejected: checks.filter(check => !check.accepted).map(check => check.reason), repeats, exhausted: payload.v2?.cycleReset === true, programs: checks.map(check => ({ id: check.item.identifier, title: check.item.title, runtime: check.item.runtimeSeconds, ratio: check.item.aspectRatio })) };
        result.rotations.push(row);
        if (row.ready < 3 || row.rejected.length || repeats && !row.exhausted) result.passed = false;
        if (rotations > 1) {
          for (const check of checks) { seen.add(check.item.logicalId); await post('playback', { channel: lane.channel, sessionId: body.sessionId, id: check.item.identifier, event: 'skipped' }); }
        }
      } catch (error) { result.passed = false; result.rotations.push({ queueMs: Math.round(performance.now() - start), error: String(error.message) }); break; }
    }
    report.results.push(result); save();
    if (report.results.length % 10 === 0 || channels.size) console.log(JSON.stringify({ done: report.results.length, total: lanes.length, passed: report.results.filter(r => r.passed).length, last: lane.channel, ready: result.rotations[0]?.ready || 0 }));
  }
  report.finishedAt = new Date().toISOString(); report.passed = report.results.filter(row => row.passed).length; report.failed = report.results.length - report.passed; save();
  console.log(JSON.stringify({ total: report.results.length, passed: report.passed, failed: report.failed, output }));
  process.exitCode = report.failed ? 1 : 0;
}
module.exports = { checkCanaryReadiness };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
