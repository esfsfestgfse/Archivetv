#!/usr/bin/env node
/*
 * Exercise every IA channel queue through the production relay.
 *
 * The manifest is exported by window.__atvIAManifest() in either app build.
 * This script intentionally polls queues that are still hydrating so a cold
 * cache is measured as cold-cache latency instead of being reported as empty.
 */
const fs = require('node:fs');
const path = require('node:path');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const manifestPath = option('--manifest');
if (!manifestPath) {
  console.error('Usage: node scripts/soak-ia-queues.js --manifest <json> [--strict]');
  process.exit(2);
}

const endpoint = option('--endpoint', 'https://ais-relay.tdy1990.workers.dev/ia/queue');
const count = Math.max(1, Math.min(5, Number(option('--count', '3')) || 3));
const requiredReady = Math.max(1, Math.min(count, Number(option('--require-ready', '1')) || 1));
const concurrency = Math.max(1, Math.min(12, Number(option('--concurrency', '6')) || 6));
const timeoutMs = Math.max(5000, Number(option('--timeout-ms', '35000')) || 35000);
const pollMs = Math.max(250, Number(option('--poll-ms', '1250')) || 1250);
const outputPath = option('--out');
const requestedChannels = new Set(String(option('--channels', '')).split(',').map(value => value.trim()).filter(Boolean));
const completeManifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
const manifest = requestedChannels.size
  ? completeManifest.filter(row => requestedChannels.has(String(row.channel)))
  : completeManifest;

if (!Array.isArray(manifest) || manifest.some(row => !row || !row.channel || !Array.isArray(row.queries))) {
  console.error('Manifest must be an array of { channel, name, queries } records.');
  process.exit(2);
}
if (requestedChannels.size && manifest.length !== requestedChannels.size) {
  console.error('One or more requested --channels were not present in the manifest.');
  process.exit(2);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestQueue(row, remainingMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(18000, remainingMs)));
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: String(row.channel), count, queries: row.queries, themeTerms: row.themeTerms || [], denyTerms: row.denyTerms || [], themeMinScore: row.themeMinScore || 1 }),
      signal: controller.signal,
    });
    const body = await response.json();
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(row) {
  const started = Date.now();
  let attempts = 0, lastStatus = 0, lastBody = null, lastError = null;
  while (Date.now() - started < timeoutMs) {
    attempts++;
    try {
      const { response, body } = await requestQueue(row, timeoutMs - (Date.now() - started));
      lastStatus = response.status;
      lastBody = body;
      const items = Array.isArray(body.items) ? body.items : [];
      const readyCount = Number(body.ready) || items.length;
      if (response.ok && readyCount >= requiredReady) {
        return {
          channel: Number(row.channel), name: row.name, ok: true, status: response.status,
          ready: readyCount, items: items.length, attempts,
          elapsedMs: Date.now() - started,
          samples: items.slice(0, 3).map(item => item.title || item.identifier || item.id).filter(Boolean),
        };
      }
      if (response.ok && !body.hydrating && readyCount > 0) break;
      if (!response.ok && !body.hydrating) break;
    } catch (error) {
      lastError = String(error && error.message || error);
    }
    await sleep(pollMs);
  }
  const items = Array.isArray(lastBody && lastBody.items) ? lastBody.items : [];
  return {
    channel: Number(row.channel), name: row.name, ok: false, status: lastStatus,
    ready: Number(lastBody && lastBody.ready) || 0, items: items.length, attempts,
    elapsedMs: Date.now() - started,
    hydrating: Boolean(lastBody && lastBody.hydrating),
    error: lastError || (lastBody && lastBody.error) || `queue ready ${Number(lastBody && lastBody.ready) || items.length}/${requiredReady}`,
  };
}

async function mapConcurrent(rows, limit, fn) {
  const results = Array(rows.length);
  let cursor = 0, finished = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= rows.length) return;
      results[index] = await fn(rows[index]);
      finished++;
      if (finished % 20 === 0 || finished === rows.length) {
        console.log(`Checked ${finished}/${rows.length} IA channels`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, worker));
  return results;
}

async function main() {
  const started = Date.now();
  const results = await mapConcurrent(manifest, concurrency, probe);
  const failures = results.filter(result => !result.ok);
  const slowest = results.slice().sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 10);
  const report = {
    generatedAt: new Date().toISOString(), endpoint, count, requiredReady, concurrency,
    elapsedMs: Date.now() - started,
    totals: { channels: results.length, ready: results.length - failures.length, empty: failures.length },
    failures, slowest, results,
  };
  console.log(`IA queue health: ${report.totals.ready}/${report.totals.channels} ready; ${failures.length} empty`);
  for (const failure of failures) {
    console.log(`EMPTY CH ${failure.channel} ${failure.name}: ${failure.error} (${failure.elapsedMs}ms)`);
  }
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(report, null, 2) + '\n');
    console.log(`Wrote ${resolved}`);
  }
  if (process.argv.includes('--strict') && failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
