#!/usr/bin/env node
/* Probe every IA PROGRAM provider tier without changing the app. */
const fs = require('node:fs');
const path = require('node:path');

const file = (process.argv[2] && !process.argv[2].startsWith('--'))
  ? process.argv[2] : path.join(__dirname, '..', 'the_dial_mobile.html');
const source = fs.readFileSync(file, 'utf8');

function blockAfter(marker, open, close) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const bodyStart = source.indexOf(open, start) + open.length;
  let depth = 1, quote = null, escaped = false;
  for (let i = bodyStart; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    if (c === close && --depth === 0) return source.slice(bodyStart, i);
  }
  throw new Error(`Unclosed ${marker}`);
}

function strings(text) {
  return [...text.matchAll(/"([^"]*)"/g)].map(match => {
    try { return JSON.parse(`"${match[1]}"`); }
    catch (_) { return match[1]; }
  });
}
function list(body, key) {
  const match = body.match(new RegExp(`["']?${key}["']?\\s*:\\s*\\[([^\\]]*)\\]`));
  return match ? strings(match[1]) : [];
}
function era(body) {
  const match = body.match(/era\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/);
  return match ? [Number(match[1]), Number(match[2])] : [1930, new Date().getFullYear()];
}
function parseChannels() {
  const block = blockAfter('const CH=[', '[', ']');
  return new Map([...block.matchAll(/\{nm:"([^"]+)",\s*num:(\d+)([^}]*)\}/g)]
    .map(m => [m[1], { number: Number(m[2]), audio: /audio:true/.test(m[3]) }]));
}
function parsePrograms() {
  const block = blockAfter('\nconst PROGRAM =', '{', '}');
  return [...block.matchAll(/^\s*"([^"]+)":\s*\{([\s\S]*?)(?=^\s*"[^"]+":\s*\{|\n\};)/gm)]
    .map(m => ({ name: m[1], body: m[2] }));
}
function providers(body) {
  return [...body.matchAll(/\{\s*["']?collections["']?\s*:\s*\[([^\]]*)\]([\s\S]*?)\}/g)]
    .map(m => ({ collections: strings(m[1]), subjects: list(m[2], 'require_subj') }))
    .filter(provider => provider.collections.length);
}
function queryFor(provider, mediaType, years) {
  const clauses = [`collection:${provider.collections[0]}`, `mediatype:${mediaType}`, `year:[${years[0]} TO ${years[1]}]`];
  const sample = provider.subjects.slice(0, 5);
  if (sample.length) clauses.push(`subject:(${sample.map(value => `"${value}"`).join(' OR ')})`);
  return clauses.join(' AND ');
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

async function main() {
  const channels = parseChannels();
  const rails = parsePrograms().flatMap(program => {
    const channel = channels.get(program.name);
    if (!channel) return [];
    return providers(program.body).flatMap((provider, index) => provider.collections.map(collection => ({
      channel: program.name, number: channel.number, tier: index + 1, collection,
      query: queryFor({ ...provider, collections: [collection] }, channel.audio ? 'audio' : 'movies', era(program.body))
    })));
  });
  const results = await mapWithConcurrency(rails, 3, async rail => {
    const url = 'https://archive.org/advancedsearch.php?' + new URLSearchParams({
      q: rail.query, 'fl[]': 'identifier,title,year,mediatype', rows: '3', page: '1', output: 'json'
    });
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = await res.json(), docs = data?.response?.docs || [];
      return { ...rail, status: res.status, total: data?.response?.numFound || 0,
        samples: docs.map(doc => ({ id: doc.identifier, title: doc.title, year: doc.year, mediatype: doc.mediatype })) };
    } catch (error) { return { ...rail, error: String(error) }; }
  });
  const report = JSON.stringify({ file: path.basename(file), generatedAt: new Date().toISOString(), rails: results }, null, 2) + '\n';
  const outputIndex = process.argv.indexOf('--out');
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    const output = path.resolve(process.argv[outputIndex + 1]);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, report);
    console.log(`Wrote ${process.argv[outputIndex + 1]}`);
  } else console.log(report);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
