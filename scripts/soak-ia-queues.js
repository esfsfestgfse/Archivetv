#!/usr/bin/env node
/*
 * Exercise every IA channel queue through the production relay.
 *
 * The manifest is exported by window.__atvIAManifest() in either app build.
 * This script intentionally polls queues that are still hydrating so a cold
 * cache is measured as cold-cache latency instead of being reported as empty.
 * The probe records first play immediately, then keeps polling briefly so the
 * report also measures whether the background shelf reaches its five-item
 * target.
 */
const fs = require('node:fs');
const path = require('node:path');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const manifestPath = option('--manifest');
if (!manifestPath) {
  console.error('Usage: node scripts/soak-ia-queues.js --manifest <json> [--rotations 2] [--strict]');
  process.exit(2);
}

const endpoint = option('--endpoint', 'https://ais-relay.tdy1990.workers.dev/ia/queue');
const count = Math.max(1, Math.min(5, Number(option('--count', '3')) || 3));
const requiredReady = Math.max(1, Math.min(count, Number(option('--require-ready', '1')) || 1));
const concurrency = Math.max(1, Math.min(12, Number(option('--concurrency', '6')) || 6));
const timeoutMs = Math.max(5000, Number(option('--timeout-ms', '35000')) || 35000);
const depthTimeoutMs = Math.max(1000, Math.min(timeoutMs, Number(option('--depth-timeout-ms', '8000')) || 8000));
const pollMs = Math.max(250, Number(option('--poll-ms', '1250')) || 1250);
const rotationBase = Math.max(0, Math.min(127, Number(option('--rotation-base', '0')) || 0));
const rotations = Math.max(1, Math.min(3, Number(option('--rotations', '1')) || 1));
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

async function requestQueue(row, remainingMs, rotationOffset) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(18000, remainingMs)));
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: String(row.channel), count, rotation: (rotationBase + (Number(row.channel) || 0) + rotationOffset) % 128, queries: row.queries, themeTerms: row.themeTerms || [], denyTerms: row.denyTerms || [], diversity: row.diversity || {}, mediaTypes: row.mediaTypes || ['movies'], themeMinScore: row.themeMinScore || 1 }),
      signal: controller.signal,
    });
    const body = await response.json();
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function probeRotation(row, rotationOffset) {
  const started = Date.now();
  let attempts = 0, lastStatus = 0, lastBody = null, lastError = null;
  let firstReadyLatencyMs = null, bestReady = 0, bestItems = [];
  while (Date.now() - started < timeoutMs) {
    attempts++;
    try {
      const { response, body } = await requestQueue(row, timeoutMs - (Date.now() - started), rotationOffset);
      lastStatus = response.status;
      lastBody = body;
      const items = Array.isArray(body.items) ? body.items : [];
      const readyCount = Number(body.ready) || items.length;
      if (readyCount > bestReady || (readyCount === bestReady && items.length > bestItems.length)) {
        bestReady = readyCount;
        bestItems = items;
      }
      if (firstReadyLatencyMs == null && response.ok && readyCount > 0) {
        firstReadyLatencyMs = Date.now() - started;
      }
      if (response.ok && readyCount >= count) {
        return {
          channel: Number(row.channel), name: row.name, ok: true, status: response.status,
          ready: readyCount, items: items.length, attempts,
          elapsedMs: Date.now() - started, firstPlayLatencyMs: firstReadyLatencyMs,
          timedOut: false,
          depthTimedOut: false,
          itemIds: items.map(item => String(item && (item.identifier || item.id || item.title || '')).trim()).filter(Boolean),
          samples: items.slice(0, 3).map(item => item.title || item.identifier || item.id).filter(Boolean),
        };
      }
      /* Once first play exists, give the edge background hydrator a short,
         bounded window to fill the remaining slots. Do not let a partial
         shelf consume the full no-signal timeout. */
      const budget = firstReadyLatencyMs == null ? timeoutMs : depthTimeoutMs;
      if (Date.now() - started >= budget) break;
    } catch (error) {
      lastError = String(error && error.message || error);
      if (firstReadyLatencyMs != null && Date.now() - started >= depthTimeoutMs) break;
    }
    await sleep(pollMs);
  }
  const items = bestItems.length ? bestItems : (Array.isArray(lastBody && lastBody.items) ? lastBody.items : []);
  const ready = bestReady || Number(lastBody && lastBody.ready) || items.length;
  const hasRequiredReady = ready >= requiredReady;
  return {
    channel: Number(row.channel), name: row.name, ok: hasRequiredReady, status: lastStatus,
    ready, items: items.length, attempts,
    elapsedMs: Date.now() - started,
    firstPlayLatencyMs: firstReadyLatencyMs,
    timedOut: !hasRequiredReady && Date.now() - started >= timeoutMs,
    depthTimedOut: ready < count,
    itemIds: items.map(item => String(item && (item.identifier || item.id || item.title || '')).trim()).filter(Boolean),
    hydrating: Boolean(lastBody && lastBody.hydrating),
    error: hasRequiredReady
      ? `queue depth ${ready}/${count}`
      : lastError || (lastBody && lastBody.error) || `queue ready ${ready}/${requiredReady}`,
  };
}

/* A single queue response is not enough to prove a channel feels like TV.
 * Run adjacent persisted rotations and retain the measurements that matter to
 * the player: time to first ready item, depth, repeated identifiers, and
 * timeout/underfill events. */
async function probe(row) {
  const rotationResults = [];
  let elapsedMs = 0;
  let firstPlayLatencyMs = null;
  for (let rotation = 0; rotation < rotations; rotation++) {
    const result = await probeRotation(row, rotation);
    rotationResults.push(result);
    elapsedMs += result.elapsedMs;
    if (firstPlayLatencyMs == null && result.ok) firstPlayLatencyMs = elapsedMs - result.elapsedMs + result.firstPlayLatencyMs;
  }

  const ids = rotationResults.flatMap(result => result.itemIds || []);
  const seen = new Set();
  let duplicateItems = 0;
  for (const id of ids) {
    if (seen.has(id)) duplicateItems++;
    else seen.add(id);
  }
  const timeouts = rotationResults.filter(result => result.timedOut).length;
  const last = rotationResults[rotationResults.length - 1] || {};
  return {
    channel: Number(row.channel), name: row.name,
    ok: rotationResults.length === rotations && rotationResults.every(result => result.ok),
    status: last.status || 0,
    ready: last.ready || 0,
    items: last.items || 0,
    attempts: rotationResults.reduce((sum, result) => sum + (result.attempts || 0), 0),
    elapsedMs, firstPlayLatencyMs,
    readyDepths: rotationResults.map(result => result.ready || 0),
    itemDepths: rotationResults.map(result => result.items || 0),
    fiveItemDepth: rotationResults.filter(result => (result.ready || 0) >= count).length,
    depthUnderfilled: rotationResults.some(result => result.depthTimedOut),
    uniqueItems: seen.size,
    duplicateItems,
    timeoutCount: timeouts,
    timedOut: timeouts > 0,
    hydrating: rotationResults.some(result => result.hydrating),
    error: rotationResults.find(result => !result.ok)?.error,
    samples: [...new Set(rotationResults.flatMap(result => result.samples || []))].slice(0, 6),
    rotations: rotationResults.map((result, index) => ({
      rotation: index,
      ok: result.ok, status: result.status, ready: result.ready, items: result.items,
      attempts: result.attempts, elapsedMs: result.elapsedMs,
      firstPlayLatencyMs: result.firstPlayLatencyMs, timedOut: result.timedOut,
      itemIds: result.itemIds || [], samples: result.samples || [], error: result.error,
    })),
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
  const measuredRotations = results.reduce((sum, result) => sum + (result.rotations?.length || 0), 0);
  const timeoutCount = results.reduce((sum, result) => sum + (result.timeoutCount || 0), 0);
  const duplicateItems = results.reduce((sum, result) => sum + (result.duplicateItems || 0), 0);
  const depthUnderfilled = results.reduce((sum, result) => sum + (result.depthUnderfilled ? 1 : 0), 0);
  const fullDepthChannels = results.filter(result => (result.fiveItemDepth || 0) >= rotations).length;
  const playableLatencies = results.map(result => result.firstPlayLatencyMs).filter(value => Number.isFinite(value));
  const slowest = results.slice().sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 10);
  const report = {
    generatedAt: new Date().toISOString(), endpoint, count, requiredReady, concurrency, rotationBase, rotations,
    elapsedMs: Date.now() - started,
    totals: {
      channels: results.length, ready: results.length - failures.length, empty: failures.length,
      measuredRotations, fiveItemDepth: results.reduce((sum, result) => sum + (result.fiveItemDepth || 0), 0),
      fullDepthChannels, depthUnderfilled,
      timeouts: timeoutCount, duplicateItems,
      firstPlayLatencyMs: playableLatencies.length ? {
        min: Math.min(...playableLatencies), max: Math.max(...playableLatencies),
        average: Math.round(playableLatencies.reduce((sum, value) => sum + value, 0) / playableLatencies.length),
      } : null,
    },
    failures, slowest, results,
  };
  console.log(`IA queue health: ${report.totals.ready}/${report.totals.channels} first-play ready; ${failures.length} no-signal lanes; ${report.totals.fullDepthChannels}/${report.totals.channels} full-depth; ${report.totals.duplicateItems} duplicate items; ${timeoutCount} timeouts`);
  console.log(`Five-item depth: ${report.totals.fiveItemDepth}/${report.totals.measuredRotations} rotations; ${report.totals.depthUnderfilled} channels still underfilled after ${depthTimeoutMs}ms depth window`);
  if (report.totals.firstPlayLatencyMs) console.log(`First-play latency: ${report.totals.firstPlayLatencyMs.average}ms average (${report.totals.firstPlayLatencyMs.min}-${report.totals.firstPlayLatencyMs.max}ms)`);
  for (const failure of failures) {
    console.log(`UNDERFILLED CH ${failure.channel} ${failure.name}: ${failure.error || 'rotation did not reach the required depth'}; depths=${failure.readyDepths.join('/')} (${failure.elapsedMs}ms)`);
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
