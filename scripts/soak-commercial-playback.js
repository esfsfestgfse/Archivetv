#!/usr/bin/env node
/*
 * Exercise the production commercial path without touching the player UI.
 * Each fixture uses the exact adQueries() runtime from the app, asks the
 * production relay for candidates, resolves Archive metadata, and verifies
 * that a matching media file accepts a byte-range request. That proves a
 * break has a real transport-ready fallback instead of a search-only hit.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const endpoint = 'https://ais-relay.tdy1990.workers.dev/ia';
const fixtures = [
  { lane: 'cartoons', channel: { cat: 'TOON', nm: 'Modern Cartoons', audio: false }, type: 'video' },
  { lane: 'sports', channel: { cat: 'SPORTS', nm: 'Sports Vault', audio: false }, type: 'video' },
  { lane: 'outdoor', channel: { cat: 'TV', nm: 'Tight Lines', audio: false }, type: 'video' },
  { lane: 'television', channel: { cat: 'TV', nm: 'Classic Rerun TV', audio: false }, type: 'video' },
  { lane: 'radio', channel: { cat: 'MUS', nm: 'RealSignal Radio', audio: true }, type: 'audio' },
];

function block(source, file) {
  const start = source.indexOf('/* ===== commercial breaks:');
  const end = start < 0 ? -1 : source.indexOf('/* Station Bumpers', start);
  assert(start >= 0 && end > start, `${file}: commercial block missing`);
  return source.slice(start, end);
}

function runtimeQueries(source, file, fixture) {
  const saved = new Map();
  const context = vm.createContext({
    store: { get: (key, fallback) => saved.has(key) ? saved.get(key) : fallback, set: (key, value) => saved.set(key, value) },
    programPhrase: value => `"${String(value)}"`,
    Date, Math, Promise, console,
  });
  vm.runInContext(block(source, file), context, { timeout: 1000 });
  const rotations = [
    vm.runInContext(`adQueries(${JSON.stringify(fixture.channel)})`, context, { timeout: 1000 }),
    vm.runInContext(`adQueries(${JSON.stringify(fixture.channel)})`, context, { timeout: 1000 }),
  ];
  return { context, rotations };
}

function timeoutFetch(url, options, ms) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
}

async function search(query) {
  const url = `${endpoint}/search?${new URLSearchParams({ q: query, rows: '4', page: '1', sort: 'downloads desc' })}`;
  const response = await timeoutFetch(url, {}, 6500);
  if (!response.ok) throw new Error(`search HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload && (payload.response || payload);
  return Array.isArray(result && result.docs) ? result.docs : [];
}

function mediaFile(metadata, wanted) {
  const files = Array.isArray(metadata && metadata.files) ? metadata.files : [];
  const isVideo = file => /\.(mp4|m4v|webm|ogv)$/i.test(String(file && file.name || ''));
  const isAudio = file => /\.(mp3|ogg|m4a|flac)$/i.test(String(file && file.name || ''));
  const matcher = wanted === 'audio' ? isAudio : isVideo;
  return files.find(file => matcher(file) && file.name);
}

function fileUrl(id, file) {
  return `https://archive.org/download/${encodeURIComponent(id)}/${String(file.name).split('/').map(encodeURIComponent).join('/')}`;
}

async function verifyCandidate(item, wanted) {
  const id = String(item && item.identifier || '');
  if (!id) return null;
  const metaResponse = await timeoutFetch(`${endpoint}/metadata/${encodeURIComponent(id)}`, {}, 6500);
  if (!metaResponse.ok) return null;
  const metadata = await metaResponse.json();
  const file = mediaFile(metadata, wanted);
  if (!file) return null;
  const url = fileUrl(id, file);
  const response = await timeoutFetch(url, { headers: { Range: 'bytes=0-8191' } }, 8500);
  try { if (response.body) await response.body.cancel(); } catch (_) {}
  if (![200, 206].includes(response.status)) return null;
  return { id, title: String(item.title || id), file: file.name, status: response.status };
}

async function runFixture(source, file, fixture) {
  const started = Date.now();
  const runtime = runtimeQueries(source, file, fixture);
  const rotations = runtime.rotations;
  /* Video queries begin with a stable undated contextual rail; the first
     rotating era query is the second entry. Audio has no evergreen video rail. */
  const firstQueries = rotations.map(set => set[fixture.type === 'video' ? 1 : 0]);
  assert.notEqual(firstQueries[0], firstQueries[1], `${file}: ${fixture.lane} commercial rotation did not advance`);
  const queries = [...new Set(rotations.flat().slice(0, 12))];
  const searched = await Promise.all(queries.map(async query => {
    try { return await search(query); } catch (_) { return []; }
  }));
  const candidates = [], seen = new Set();
  searched.flat().forEach(item => {
    const id = String(item && item.identifier || '');
    if (id && !seen.has(id)) { seen.add(id); candidates.push(item); }
  });
  const scored = candidates.map(item => {
    runtime.context.__commercialItem = item;
    runtime.context.__commercialChannel = fixture.channel;
    const score = vm.runInContext('adItemContextScore(__commercialItem,__commercialChannel)', runtime.context, { timeout: 1000 });
    return { item, score };
  }).sort((a, b) => b.score - a.score);
  let verified = null;
  for (const candidate of scored.slice(0, 12)) {
    try {
      verified = await verifyCandidate(candidate.item, fixture.type);
      if (verified) { verified.contextScore = candidate.score; break; }
    } catch (_) {}
  }
  return {
    lane: fixture.lane,
    mediaType: fixture.type,
    queryCount: queries.length,
    candidateCount: candidates.length,
    contextualCandidates: scored.filter(candidate => candidate.score > 0).length,
    rotationAdvanced: firstQueries[0] !== firstQueries[1],
    verified,
    elapsedMs: Date.now() - started,
    ok: Boolean(verified),
  };
}

async function main() {
  const file = process.argv[2] || 'the_dial_desktop.html';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const report = [];
  for (const fixture of fixtures) {
    const result = await runFixture(source, file, fixture);
    report.push(result);
    console.log(`${result.ok ? 'READY' : 'FAILED'} ${result.lane}: ${result.candidateCount} candidates / ${result.contextualCandidates} contextual; ${result.verified ? `${result.verified.status} ${result.verified.title} (score ${result.verified.contextScore})` : 'no transport-ready media'}; ${result.elapsedMs}ms`);
  }
  const failures = report.filter(result => !result.ok);
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (failures.length) process.exitCode = 1;
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
