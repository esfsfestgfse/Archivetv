#!/usr/bin/env node
/* Verify the file-level Archive derivatives admitted by the v4.1.150
 * underfill bank without downloading media. The worker is evaluated with a
 * harmless recorder for iaDirectRecovery, then each URL is range-probed. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
let source = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8');
const fnStart = source.indexOf('function iaDirectRecovery(');
const fnEnd = source.indexOf('\nconst IA_LONG_TAIL_EXPANSIONS', fnStart);
if (fnStart < 0 || fnEnd < 0) throw new Error('iaDirectRecovery function boundary not found');
const recorder = `function iaDirectRecovery(identifier, sourceIdentifier, fileName, title, subject, year, type = "video", runtime = 0, width = 0, height = 0) {
  const url = "https://archive.org/download/" + encodeURIComponent(sourceIdentifier) + "/" + String(fileName).split("/").map(encodeURIComponent).join("/");
  return { identifier, sourceIdentifier, fileName, title, subject, year, type, runtime, width, height, media: { type, url } };
}`;
source = source.slice(0, fnStart) + recorder + source.slice(fnEnd);
source = source.slice(0, source.indexOf('export default {')) + '\nglobalThis.__underfill = IA_UNDERFILL_DEPTH_BANKS;\n';
const context = { URL, encodeURIComponent, console };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'afterglow_ais_relay_worker.js' });

const bank = context.__underfill;
const failures = [];
const summary = [];
const unique = new Map();
for (const [channel, items] of Object.entries(bank || {})) {
  for (const item of items) {
    const key = String(item.media && item.media.url || '');
    if (key && !unique.has(key)) unique.set(key, { channel, item });
  }
}

async function probe(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Range: 'bytes=0-1', Accept: '*/*', 'User-Agent': 'RealSignal IA derivative verifier' },
    redirect: 'follow',
    signal: controller.signal,
  });
  clearTimeout(timeout);
  return { status: response.status, contentType: response.headers.get('content-type') || '' };
}

(async () => {
  const entries = [...unique];
  const concurrency = 8;
  for (let index = 0; index < entries.length; index += concurrency) {
    await Promise.all(entries.slice(index, index + concurrency).map(async ([url, { channel, item }]) => {
      try {
        const result = await probe(url);
        if (![200, 206].includes(result.status) || /text\/html/i.test(result.contentType)) {
          failures.push(`${channel} ${item.identifier}: HTTP ${result.status} ${result.contentType}`);
        }
        summary.push({ channel, status: result.status });
      } catch (error) {
        failures.push(`${channel} ${item.identifier}: ${error.name === 'AbortError' ? 'timeout' : error.message}`);
      }
    }));
  }
  const channels = Object.fromEntries(Object.keys(bank).map(channel => [channel, bank[channel].length]));
  console.log(JSON.stringify({ totalUniqueUrls: unique.size, channels, failures, checked: summary.length }, null, 2));
  if (failures.length) process.exitCode = 1;
})();
