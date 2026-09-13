#!/usr/bin/env node
/* Retry only IA lanes that failed first-play or depth in the primary soak.
 * A successful serial retry classifies a cold burst as transient; a second
 * failure remains blocking so the nightly guard cannot hide a real regression.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const manifestPath = option('--manifest');
const reportPath = option('--report');
const outPath = option('--out');
const backoffMs = Math.max(0, Math.min(15000, Number(option('--backoff-ms', '2000')) || 2000));
const count = Math.max(1, Math.min(5, Number(option('--count', '5')) || 5));
const timeoutMs = Math.max(5000, Number(option('--timeout-ms', '30000')) || 30000);
const depthTimeoutMs = Math.max(1000, Math.min(timeoutMs, Number(option('--depth-timeout-ms', '8000')) || 8000));
const pollMs = Math.max(250, Number(option('--poll-ms', '1000')) || 1000);
const rotationBase = Math.max(0, Math.min(127, Number(option('--rotation-base', '0')) || 0));

if (!manifestPath || !reportPath || !outPath) {
  console.error('Usage: node scripts/retry-ia-failures.js --manifest <json> --report <json> --out <json>');
  process.exit(2);
}

const resolvedReport = path.resolve(reportPath);
if (!fs.existsSync(resolvedReport)) {
  console.error(`Primary IA soak report is missing: ${resolvedReport}`);
  process.exit(1);
}

let primary;
try { primary = JSON.parse(fs.readFileSync(resolvedReport, 'utf8')); }
catch (error) {
  console.error(`Primary IA soak report is invalid: ${error.message}`);
  process.exit(1);
}

const candidates = [...new Set((primary.results || [])
  .filter(result => result && (!result.ok || result.depthUnderfilled))
  .map(result => String(result.channel || '').trim())
  .filter(Boolean))];

if (!candidates.length) {
  const clean = {
    generatedAt: new Date().toISOString(),
    source: 'selective-retry',
    primaryReport: path.basename(reportPath),
    candidates: [],
    retried: false,
    recovered: [],
    failures: [],
  };
  fs.writeFileSync(path.resolve(outPath), JSON.stringify(clean, null, 2) + '\n');
  console.log('Selective IA retry: no failed or underfilled lanes');
  process.exit(0);
}

console.log(`Selective IA retry: ${candidates.length} lane${candidates.length === 1 ? '' : 's'} after ${backoffMs}ms backoff: ${candidates.join(',')}`);

(async () => {
  if (backoffMs) await new Promise(resolve => setTimeout(resolve, backoffMs));
  const retryOut = path.resolve(outPath);
  const args = [
    path.join(__dirname, 'soak-ia-queues.js'),
    '--manifest', path.resolve(manifestPath),
    '--channels', candidates.join(','),
    '--count', String(count),
    '--require-ready', '1',
    '--concurrency', '1',
    '--rotations', '1',
    '--rotation-base', String(rotationBase),
    '--timeout-ms', String(timeoutMs),
    '--depth-timeout-ms', String(depthTimeoutMs),
    '--poll-ms', String(pollMs),
    '--strict',
    '--out', retryOut,
  ];
  const child = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (child.error) {
    console.error(`Selective IA retry could not start: ${child.error.message}`);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(retryOut)) {
    console.error(`Selective IA retry report is missing: ${retryOut}`);
    process.exitCode = 1;
    return;
  }
  let retry;
  try { retry = JSON.parse(fs.readFileSync(retryOut, 'utf8')); }
  catch (error) {
    console.error(`Selective IA retry report is invalid: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const failures = (retry.results || []).filter(result => result && (!result.ok || result.depthUnderfilled));
  if (failures.length) {
    console.error(`Selective IA retry: ${failures.length} lane${failures.length === 1 ? '' : 's'} still failed`);
    process.exitCode = 1;
    return;
  }
  console.log(`Selective IA retry: all ${candidates.length} flagged lane${candidates.length === 1 ? '' : 's'} recovered`);
  process.exitCode = 0;
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
