#!/usr/bin/env node
/*
 * Checkpointed wrapper around soak-ia-queues.js.
 *
 * The normal runner intentionally keeps a single report in memory. That is
 * fine for a small probe but a long 171-lane run can be terminated by the
 * host before the report is written. This wrapper runs bounded channel batches,
 * preserves each JSON result immediately, and merges completed batches into a
 * final report even if a later batch fails.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const manifestPath = option('--manifest');
if (!manifestPath) {
  console.error('Usage: node scripts/soak-ia-batched.js --manifest <json> [--out <json>]');
  process.exit(2);
}

const root = path.join(__dirname, '..');
const soakScript = path.join(__dirname, 'soak-ia-queues.js');
const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
if (!Array.isArray(manifest) || manifest.some(row => !row || !row.channel || !Array.isArray(row.queries))) {
  console.error('Manifest must be an array of { channel, name, queries } records.');
  process.exit(2);
}

const batchSize = Math.max(1, Math.min(40, Number(option('--batch-size', '15')) || 15));
const outputPath = path.resolve(option('--out', path.join('tmp', 'ia-full-soak-160-batched.json')));
const batchDir = path.resolve(option('--batch-dir', path.join('tmp', 'ia-full-soak-160-batches')));
const commonArgs = [
  '--count', option('--count', '5'),
  '--require-ready', option('--require-ready', '1'),
  '--rotations', option('--rotations', '3'),
  '--concurrency', option('--concurrency', '2'),
  '--timeout-ms', option('--timeout-ms', '30000'),
  '--depth-timeout-ms', option('--depth-timeout-ms', '10000'),
  '--poll-ms', option('--poll-ms', '1250'),
];
const endpoint = option('--endpoint');
if (endpoint) commonArgs.push('--endpoint', endpoint);

fs.mkdirSync(batchDir, { recursive: true });
const batches = [];
for (let i = 0; i < manifest.length; i += batchSize) {
  batches.push(manifest.slice(i, i + batchSize));
}

const completed = [];
const failedBatches = [];
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  const batchName = `batch-${String(i + 1).padStart(2, '0')}-of-${String(batches.length).padStart(2, '0')}.json`;
  const batchOutput = path.join(batchDir, batchName);
  const channels = batch.map(row => String(row.channel)).join(',');
  console.log(`\nIA batch ${i + 1}/${batches.length}: channels ${batch[0].channel}-${batch[batch.length - 1].channel} (${batch.length})`);
  const args = [soakScript, '--manifest', path.resolve(manifestPath), '--channels', channels, '--out', batchOutput, ...commonArgs];
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (fs.existsSync(batchOutput)) {
    try {
      const report = JSON.parse(fs.readFileSync(batchOutput, 'utf8'));
      completed.push(report);
      console.log(`Checkpoint saved: ${batchOutput}`);
    } catch (error) {
      failedBatches.push({ batch: i + 1, channels, error: `invalid report: ${error.message}` });
    }
  } else {
    failedBatches.push({ batch: i + 1, channels, error: `runner exit ${result.status ?? 'unknown'}${result.signal ? ` signal ${result.signal}` : ''}` });
  }
}

const results = completed.flatMap(report => report.results || []);
const rotations = results.flatMap(result => result.rotations || []);
const failures = results.filter(result => !result.ok);
const playableLatencies = results.map(result => result.firstPlayLatencyMs).filter(value => Number.isFinite(value));
const sourceCounts = {};
const cacheCounts = {};
rotations.forEach(result => {
  if (result.source) sourceCounts[result.source] = (sourceCounts[result.source] || 0) + 1;
  if (result.cache) cacheCounts[result.cache] = (cacheCounts[result.cache] || 0) + 1;
});
const count = Number(option('--count', '5')) || 5;
const expectedRotations = manifest.length * (Number(option('--rotations', '3')) || 3);
const report = {
  generatedAt: new Date().toISOString(),
  manifest: path.resolve(manifestPath),
  endpoint: endpoint || 'https://ais-relay.tdy1990.workers.dev/ia/queue',
  batchSize,
  batches: batches.length,
  completedBatches: completed.length,
  failedBatches,
  incomplete: results.length !== manifest.length || rotations.length !== expectedRotations,
  count,
  requiredReady: Number(option('--require-ready', '1')) || 1,
  rotationsRequested: Number(option('--rotations', '3')) || 3,
  results,
  failures,
  totals: {
    channels: results.length,
    expectedChannels: manifest.length,
    ready: results.filter(result => result.ok).length,
    empty: failures.length,
    measuredRotations: rotations.length,
    expectedRotations,
    fiveItemDepth: results.reduce((sum, result) => sum + (result.fiveItemDepth || 0), 0),
    fullDepthChannels: results.filter(result => (result.fiveItemDepth || 0) >= (Number(option('--rotations', '3')) || 3)).length,
    depthUnderfilled: results.reduce((sum, result) => sum + (result.depthUnderfilled ? 1 : 0), 0),
    timeouts: results.reduce((sum, result) => sum + (result.timeoutCount || 0), 0),
    duplicateItems: results.reduce((sum, result) => sum + (result.duplicateItems || 0), 0),
    transportFailures: results.reduce((sum, result) => sum + (result.transportFailures || 0), 0),
    httpFailures: results.reduce((sum, result) => sum + (result.httpFailures || 0), 0),
    responseSources: sourceCounts,
    responseCaches: cacheCounts,
    firstPlayLatencyMs: playableLatencies.length ? {
      min: Math.min(...playableLatencies),
      max: Math.max(...playableLatencies),
      average: Math.round(playableLatencies.reduce((sum, value) => sum + value, 0) / playableLatencies.length),
    } : null,
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(`\nMerged IA soak: ${report.totals.ready}/${report.totals.expectedChannels} ready; ${report.totals.fullDepthChannels}/${report.totals.expectedChannels} full-depth; ${report.totals.duplicateItems} duplicates; ${report.totals.timeouts} timeouts`);
console.log(`Wrote ${outputPath}`);
if (report.incomplete) process.exitCode = 1;
