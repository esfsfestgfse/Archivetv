#!/usr/bin/env node
/* Machine-enforced Version 5 release gate.
 *
 * This does not deploy or stamp a release. It only certifies a completed IA
 * report when availability, depth, latency, and freshness meet the published
 * bar. A failing gate is intentional: it keeps a pretty but stale/dead build
 * from being promoted as television.
 */
const fs = require('node:fs');
const path = require('node:path');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const reportPath = option('--report');
const minChannels = Math.max(1, Number(option('--min-channels', '179')) || 179);
const minFreshness = Math.max(0, Math.min(1, Number(option('--min-freshness', '0.813')) || 0.813));
const maxFirstPlayMs = Math.max(250, Number(option('--max-first-play-ms', '3000')) || 3000);

if (!reportPath) {
  console.error('Usage: node scripts/test-version5-gate.js --report <ia-report.json> [--min-channels 179] [--min-freshness 0.813] [--max-first-play-ms 3000]');
  process.exit(2);
}

const resolved = path.resolve(reportPath);
if (!fs.existsSync(resolved)) {
  console.error(`Version 5 gate report is missing: ${resolved}`);
  process.exit(1);
}

let report;
try { report = JSON.parse(fs.readFileSync(resolved, 'utf8')); }
catch (error) {
  console.error(`Version 5 gate report is invalid: ${error.message}`);
  process.exit(1);
}

const totals = report.totals || {};
const expected = Number(totals.expectedChannels || report.expectedChannels || totals.channels || 0);
const ready = Number(totals.ready || 0);
const timeouts = Number(totals.timeouts || 0);
const transportFailures = Number(totals.transportFailures || 0);
const httpFailures = Number(totals.httpFailures || 0);
const underfilled = Number(totals.depthUnderfilled || 0);
const freshness = totals.freshness || report.freshness || {};
const uniqueCoverage = Number(freshness.uniqueCoverage);
const firstPlay = totals.firstPlayLatencyMs || report.firstPlayLatencyMs || {};
const maxObserved = Number(firstPlay.max);

const checks = [
  { name: 'channel coverage', ok: expected >= minChannels && ready >= expected, detail: `${ready}/${expected} ready; minimum ${minChannels}` },
  { name: 'zero timeouts', ok: timeouts === 0, detail: `${timeouts} timeouts` },
  { name: 'zero transport failures', ok: transportFailures === 0, detail: `${transportFailures} transport failures` },
  { name: 'zero HTTP failures', ok: httpFailures === 0, detail: `${httpFailures} HTTP failures` },
  { name: 'zero underfilled lanes', ok: underfilled === 0, detail: `${underfilled} underfilled lanes` },
  { name: 'freshness baseline', ok: Number.isFinite(uniqueCoverage) && uniqueCoverage >= minFreshness, detail: `${Number.isFinite(uniqueCoverage) ? uniqueCoverage : 'missing'}; minimum ${minFreshness}` },
  { name: 'first-play latency', ok: Number.isFinite(maxObserved) && maxObserved <= maxFirstPlayMs, detail: `${Number.isFinite(maxObserved) ? `${maxObserved}ms max` : 'missing'}; maximum ${maxFirstPlayMs}ms` },
];

const failed = checks.filter(check => !check.ok);
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
console.log(failed.length ? `Version 5 gate: BLOCKED (${failed.length} check${failed.length === 1 ? '' : 's'} failed)` : 'Version 5 gate: PASSED');
if (failed.length) process.exitCode = 1;
