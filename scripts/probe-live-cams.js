#!/usr/bin/env node
/* Check each static Live Cams/Highway endpoint without changing the app. */
const fs = require('node:fs');
const path = require('node:path');

const file = (process.argv[2] && !process.argv[2].startsWith('--'))
  ? process.argv[2] : path.join(__dirname, '..', 'the_dial_mobile.html');
const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function blockAfter(marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const begin = source.indexOf('[', start) + 1;
  let depth = 1, quote = null, escaped = false;
  for (let i = begin; i < source.length; i++) {
    const char = source[i];
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '[') depth++;
    if (char === ']' && --depth === 0) return source.slice(begin, i);
  }
  throw new Error(`Unclosed ${marker}`);
}
function decode(value) { try { return JSON.parse(`"${value}"`); } catch (_) { return value; } }
function parseStreams() {
  const block = blockAfter('var LIVECAMS_STREAMS=[');
  return [...block.matchAll(/\{type:"([^"]+)",\s*cat:"([^"]+)",\s*nm:"([^"]+)",\s*url:"([^"]+)"/g)]
    .map(match => ({ type: match[1], category: match[2], name: decode(match[3]), url: decode(match[4]) }));
}
async function mapWithConcurrency(values, limit, fn) {
  const results = Array(values.length); let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await fn(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}
async function sampleBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (length < 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); length += value.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
async function main() {
  const streams = parseStreams();
  const results = await mapWithConcurrency(streams, 3, async stream => {
    const started = Date.now();
    try {
      const response = await fetch(stream.url, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(15000) });
      const sample = await sampleBody(response);
      const contentType = response.headers.get('content-type') || '';
      const expected = stream.type === 'hls' ? /#EXTM3U/.test(sample) : /^image\//i.test(contentType);
      return { ...stream, ok: response.ok && expected, status: response.status, contentType, ms: Date.now() - started,
        error: response.ok && !expected ? 'unexpected response format' : undefined };
    } catch (error) { return { ...stream, ok: false, ms: Date.now() - started, error: String(error) }; }
  });
  const report = JSON.stringify({ file: path.basename(file), generatedAt: new Date().toISOString(), streams: results }, null, 2) + '\n';
  const outputIndex = process.argv.indexOf('--out');
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    const output = path.resolve(process.argv[outputIndex + 1]);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, report);
    console.log(`Wrote ${process.argv[outputIndex + 1]}`);
  } else console.log(report);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
