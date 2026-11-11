import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { broadcastProofMs, buildBroadcastWindow, firstRejectedBroadcastSlot } from '../broadcast_schedule.mjs';
import { normalizeIaFileRecord, qualifyIaFileRecord } from '../ia_file_contract.js';

const directory = path.resolve(process.argv[2] || 'output/broadcast-pilot-preview');
const api = 'https://realsignal-api.tdy1990.workers.dev/api/v3/ia/queue';
const stations = new Map([
  ['10', { name: 'Classic Reruns', category: 'TV & Game Shows' }],
  ['12', { name: 'Classic Game Shows', category: 'TV & Game Shows' }],
  ['150', { name: 'Classic Cartoons', category: 'Animation' }]
]);
// Single-series Archive parents with file names that identify full episodes.
const episodeCollections = {
  '10': [
    ['the-dick-van-dyke-show-the-complete-series-1961-1966', 'The Dick Van Dyke Show', 1961, /\bs\d+e\d+/i],
    ['munsters_the', 'The Munsters', 1964, /^The Munsters \d+/i],
    ['the-addams-family__season-1', 'The Addams Family', 1964, /\b\d+x\d+\b/i]
  ],
  '12': [
    ['totellthetruth1969-bmp', 'To Tell the Truth', 1969, /^s\d+e\d+/i],
    ['letsmakeadeal1971-bmp', "Let's Make a Deal", 1971, /^s\d+e\d+/i],
    ['passwordabc-bmp', 'Password', 1971, /^s\d+e\d+/i],
    ['wheelnbc-7581-bmp', 'Wheel of Fortune', 1975, /^s\d+e\d+/i],
    ['the-hollywood-squares-1972', 'The Hollywood Squares', 1972, /^The Hollywood Squares \(1972\)/i],
    ['WML-1791-122172-01', "What's My Line?", 1972, /^BUZZR-WML-1791-/i]
  ]
};
const registry = JSON.parse(execFileSync(process.execPath,
  ['scripts/export-ia-manifest.js', 'the_dial_desktop.html'],
  { encoding: 'utf8', maxBuffer: 16e6 }));
const output = path.join(directory, 'schedule.json');
const previous = await fs.readFile(output, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return { stations: [] };
  throw error;
});

async function readCatalog(rules, rotation, sessionId) {
  const response = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...rules, iaRepair: true, serverCatalog: true, count: 3, rotation, sessionId }),
    signal: AbortSignal.timeout(18_000)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const catalog = await response.json();
  return [...(catalog.items || []), ...(catalog.candidateItems || [])];
}

async function checkSpot(id, fileName, title) {
  const url = 'https://archive.org/download/' + encodeURIComponent(id) + '/' + encodeURIComponent(fileName);
  const metadata = await fetch('https://archive.org/metadata/' + encodeURIComponent(id),
    { signal: AbortSignal.timeout(8000) });
  if (!metadata.ok) return null;
  const record = (await metadata.json()).files.find(file => file.name === fileName);
  const durationMs = Math.round(Number(record?.length) * 1000);
  if (!(record?.width > 0 && Number(record.width) >= Number(record.height) && Number(record.height) > 0 &&
      durationMs >= 10_000 && durationMs <= 61_000)) return null;
  const response = await fetch(url, { headers: { Range: 'bytes=0-8191' }, signal: AbortSignal.timeout(8000) });
  if (response.body) await response.body.cancel();
  return response.status === 206 ? { id, url, title, durationMs } : null;
}

async function renewProgram(item) {
  let url = new URL(item.media.url);
  const signal = AbortSignal.timeout(7000);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (url.protocol !== 'https:' || !/(^|\.)archive\.org$/.test(url.hostname)) return null;
    const response = await fetch(url, { headers: { Range: 'bytes=0-8191' }, redirect: 'manual', signal });
    if (response.body) await response.body.cancel();
    if (response.status === 206 && /^bytes 0-\d+\/\d+$/.test(response.headers.get('content-range') || '')) {
      const verifiedAt = Date.now();
      return { ...item, verifiedAt, media: { ...item.media, verification: 'transport', verifiedAt } };
    }
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return null;
    url = new URL(location, url);
  }
  return null;
}

async function probePrograms(items) {
  const verified = [];
  for (let index = 0; index < items.length; index += 4) {
    const batch = await Promise.allSettled(items.slice(index, index + 4).map(renewProgram));
    for (const result of batch) if (result.status === 'fulfilled' && result.value) verified.push(result.value);
  }
  return verified;
}

async function expandCollection([sourceIdentifier, seriesTitle, firstYear, episodeName], rules, known, round) {
  const response = await fetch('https://archive.org/metadata/' + encodeURIComponent(sourceIdentifier), {
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return [];
  const { files, metadata } = await response.json();
  const episodes = new Map();
  for (const file of files || []) {
    const fileName = String(file.name || '');
    const leaf = fileName.split('/').at(-1);
    if (!/\.mp4$/i.test(leaf) || file.private || !episodeName.test(leaf) ||
      /\b(?:clips?|promo|trailer|preview|bonus|credits only|opening only)\b/i.test(leaf.replace(/_/g, ' '))) continue;
    const episodeYear = Number(leaf.match(/(?:^|\D)(19\d{2})(?=\D|$)/)?.[1]);
    if (seriesTitle === 'Wheel of Fortune' && !episodeYear) continue;
    const item = normalizeIaFileRecord({
      identifier: sourceIdentifier + '::' + fileName, sourceIdentifier, fileName, seriesTitle,
      title: seriesTitle + ' · ' + leaf.replace(/(?:\.ia)?\.mp4$/i, '').replace(/_/g, ' '),
      year: episodeYear || firstYear, provider: 'Internet Archive',
      media: { type: 'video', runtime: file.length, width: file.width, height: file.height,
        language: metadata?.language, metadataVerifiedAt: Date.now(),
        url: 'https://archive.org/download/' + encodeURIComponent(sourceIdentifier) + '/' + fileName.split('/').map(encodeURIComponent).join('/') }
    });
    if (known.has(item.logicalId) || !qualifyIaFileRecord(item, { ...rules, requireTransport: false }).accepted) continue;
    if (!episodes.has(item.logicalId)) episodes.set(item.logicalId, item);
  }
  const rows = [...episodes.values()];
  const start = rows.length ? round % rows.length : 0;
  return rows.slice(start).concat(rows.slice(0, start)).slice(0, 6);
}

async function collectNewEpisodes(rules, earlier, incoming, round) {
  const collections = episodeCollections[rules.channel] || [];
  const known = new Set([...(earlier?.catalog || []), ...incoming].map(item => normalizeIaFileRecord(item).logicalId));
  const selected = await Promise.allSettled(collections.map(collection => expandCollection(collection, rules, known, round)));
  return probePrograms(selected.flatMap(result => result.status === 'fulfilled' ? result.value : []));
}

async function renewUnseen(previous, incoming, rotation) {
  if (!previous?.catalog?.length) return [];
  const refreshBefore = Date.now() + 6 * 60 * 60_000 - broadcastProofMs;
  const fresh = new Set(incoming.filter(row => (row.media?.verifiedAt || row.verifiedAt) > refreshBefore)
    .map(row => row.logicalId).filter(Boolean));
  const used = new Set(previous.used);
  const unseen = previous.catalog.filter(row => !used.has(row.logicalId));
  const due = (unseen.length ? unseen : previous.catalog).filter(row => row.verifiedAt <= refreshBefore && !fresh.has(row.logicalId));
  const familyOrder = new Map(previous.familyOrder);
  const grouped = new Map();
  for (const row of due) {
    if (!grouped.has(row.broadcastFamily)) grouped.set(row.broadcastFamily, []);
    grouped.get(row.broadcastFamily).push(row);
  }
  const families = [...grouped.keys()].sort((a, b) => (familyOrder.get(a) ?? -1) - (familyOrder.get(b) ?? -1));
  const selected = [];
  const budget = 24;
  for (let offset = 0; offset < budget && selected.length < budget; offset++) {
    for (const family of families) {
      const rows = grouped.get(family);
      if (offset < rows.length) selected.push(rows[(rotation + offset) % rows.length]);
      if (selected.length === budget) break;
    }
  }
  return probePrograms(selected);
}

const [toySpot, carSpot] = await Promise.all([
  checkSpot('swing_wing', 'swing_wing.mp4', 'Swing Wing Toy Commercial').catch(() => null),
  checkSpot('youtube-PChUnynU31c', 'PChUnynU31c.mp4', '1977 Dodge Truck Commercial').catch(() => null)
]);
const published = [];
for (const [channel, station] of stations) {
  const rules = { ...registry.find(row => row.channel === channel), channel, name: station.name };
  const earlier = previous.stations.find(row => row.channel === channel);
  const sessionId = 'broadcast-preview-' + channel + '-' + crypto.randomUUID();
  let rotation = earlier?.nextRotation || 0;
  const candidates = [];
  let schedule;
  let reason;
  let renewed = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      candidates.push(...await readCatalog(rules, rotation, sessionId));
    } catch (error) {
      reason = error.message;
    }
    rotation += 6;
    // A full current window is no reason to skip the next discovery page.
    if (attempt === 0) continue;
    try {
      if (attempt === 1) {
        renewed = await renewUnseen(earlier, candidates, rotation / 6);
        candidates.push(...renewed);
        candidates.push(...await collectNewEpisodes(rules, earlier, candidates, rotation / 6));
      }
      const spots = (channel === '150' ? [toySpot] : [carSpot]).filter(Boolean);
      schedule = buildBroadcastWindow({ rules, candidates, spots, previous: earlier });
      break;
    } catch (error) {
      reason = error.message;
    }
  }
  if (schedule) {
    published.push({ ...schedule, nextRotation: rotation, category: station.category });
    const depth = schedule.depth;
    const programs = schedule.slots.filter(slot => slot.kind === 'program');
    const earlierIds = new Set(earlier?.catalog.map(item => item.logicalId));
    const added = schedule.catalog.filter(item => !earlierIds.has(item.logicalId)).length;
    console.log(channel + ' READY: ' + depth.episodes + ' verified episodes, ' + depth.families + ' families, ' +
      depth.hours.toFixed(1) + ' catalog hours, ' + new Set(programs.map(slot => slot.logicalId)).size + '/' +
      programs.length + ' distinct programs in the window, ' + added + ' new files, ' + renewed.length + ' rechecked');
  } else {
    if (earlier && firstRejectedBroadcastSlot(earlier, Date.now()) < 0) published.push({ ...earlier, nextRotation: rotation });
    console.error(channel + ' HELD: ' + reason);
    process.exitCode = 1;
  }
}
if (published.length) {
  await fs.mkdir(directory, { recursive: true });
  const temporary = output + '.' + process.pid + '.tmp';
  await fs.writeFile(temporary, JSON.stringify({ schema: 1, stations: published }));
  await fs.rename(temporary, output);
  const publicSchedule = path.join(directory, 'preview.json');
  await fs.writeFile(temporary, JSON.stringify({ stations: published.map(({ channel, name, category, depth, slots, generatedAt }) =>
    ({ channel, name, category, depth, slots, generatedAt })) }));
  await fs.rename(temporary, publicSchedule);
  console.log(output);
}
