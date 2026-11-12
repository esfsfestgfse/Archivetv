import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { broadcastProofMs, buildBroadcastWindow, collectBroadcastCatalog, firstRejectedBroadcastSlot } from '../broadcast_schedule.mjs';
import { normalizeIaFileRecord, qualifyIaFileRecord } from '../ia_file_contract.js';
import { familyId } from '../realsignal_api_rotation.js';
import { isMusicVideoProfile, readSourceBroadcastInventory, verifyBroadcastSource } from '../broadcast_source_catalog.mjs';

const directory = path.resolve(process.argv[2] || 'output/broadcast-pilot-preview');
const api = 'https://realsignal-api.tdy1990.workers.dev/api/v3/ia/queue';
const pilotStations = new Map([
  ['10', { name: 'Classic Reruns', category: 'TV & Game Shows' }],
  ['12', { name: 'Classic Game Shows', category: 'TV & Game Shows' }],
  ['150', { name: 'Classic Cartoons', category: 'Animation' }]
]);
// Single-series Archive parents with file names that identify full episodes.
const originalRadioDate = /(?:19)?([456]\d)-(\d{2})-(\d{2})/;
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
  ],
  '921': [
    ['OTRR_X_Minus_One_Singles', 'X Minus One', 1955, originalRadioDate],
    ['OTRR_Dimension_X_Singles', 'Dimension X', 1950, originalRadioDate],
    ['OTRR_CBS_Radio_Workshop_Singles', 'CBS Radio Workshop', 1956, originalRadioDate],
    ['OTRR_Escape_Singles', 'Escape', 1947, originalRadioDate],
    ['OTRR_2000_Plus_Singles', '2000 Plus', 1950, originalRadioDate],
    ['OTRR_Inner_Sanctum_Mysteries_Singles', 'Inner Sanctum', 1941, originalRadioDate]
  ]
};
const reviewedVideo = {
  '508': [
    ['the-fantom-furytm-story-vacuum-cleaner-infomercial-1996', 'The FANTOM FURYTM Story - Vacuum Cleaner Infomercial (1996).mp4', 'The Fantom Fury Story — Infomercial', 1996],
    ['vhs_Commercials_Infomercial_Discover-The_Helsinki_Formula', 'Commercials_Infomercial_Discover-The_Helsinki_Formula.ia.mp4', 'Discover the Helsinki Formula — Infomercial', 1990],
    ['y-2mate.com-cmt-08132003-07-ab-swing-infomercial-480p', 'y2mate.com - CMT 08132003  07 AbSwing Infomercial_480p.ia.mp4', 'Ab Swing — Infomercial', 2003],
    ['vegas-after-dark-infomercial-2002', 'Vegas After Dark - Infomercial - 2002.ia.mp4', 'Vegas After Dark — Infomercial', 2002],
    ['ultimate-rock-ballads-collection', 'ultimate rock ballads collection.ia.mp4', 'Ultimate Rock Ballads — Infomercial', 2000],
    ['sharper-image-ionic-breeze-infomercial-february-2004', 'Sharper Image Ionic Breeze Infomercial (February 2004).ia.mp4', 'Sharper Image Ionic Breeze — Infomercial', 2004],
    ['billy-mays_202505', '2000 Orange Glo (30-minute Infomercial).ia.mp4', 'Billy Mays — Orange Glo Infomercial', 2000]
  ],
  '224': [
    ['aapb-cpb-aacip-45d7e6841d7', 'cpb-aacip-45d7e6841d7_Eyes on the Prize II.mp4', 'Eyes on the Prize II · Interview with Ossie Davis', 1989],
    ['aapb-cpb-aacip-b93947ebbb8', 'cpb-aacip-b93947ebbb8_Eyes on the Prize II.mp4', 'Eyes on the Prize II · Interview with Ben Chavis', 1989],
    ['aapb-cpb-aacip-55296e0bf55', 'cpb-aacip-55296e0bf55_Eyes on the Prize II.mp4', 'Eyes on the Prize II · Interview with Stokely Carmichael', 1988],
    ['aapb-cpb-aacip-151-fn10p0xm13', 'cpb-aacip-151-fn10p0xm13_Eyes on the Prize.mp4', 'Eyes on the Prize · Interview with Tom Hayden', 1985],
    ['aapb-cpb-aacip-677a7b88fd6', 'cpb-aacip-677a7b88fd6_Eyes on the Prize II.mp4', 'Eyes on the Prize II · Interview with Linda Bryant Hall', 1989],
    ['aapb-cpb-aacip-151-8k74t6fv60', 'cpb-aacip-151-8k74t6fv60_Eyes on the Prize.mp4', 'Eyes on the Prize · Interview with John Lewis', 1985],
    ['aapb-cpb-aacip-36ce9d09241', 'cpb-aacip-36ce9d09241_Eyes on the Prize II.mp4', 'Eyes on the Prize II · Interview with Betty Shabazz', 1988],
    ['aapb-cpb-aacip-19d114174e1', 'cpb-aacip-19d114174e1_Eyes on the Prize II.mp4', 'Eyes on the Prize II · Interview with Ralph Abernathy', 1988],
    ['aapb-cpb-aacip-6136e70bc0f', 'cpb-aacip-6136e70bc0f_Eyes on the Prize II.mp4', 'Eyes on the Prize II · Interview with Marian Wright Edelman', 1988],
    ['aapb-cpb-aacip-d86edbd54d7', 'cpb-aacip-d86edbd54d7_Eyes on the Prize II.mp4', 'Eyes on the Prize II · Interview with Emory Douglas', 1988],
    ['aapb-cpb-aacip-151-p55db7wm4v', 'cpb-aacip-151-p55db7wm4v_Eyes on the Prize.mp4', 'Eyes on the Prize · Interview with Curtis Jones', 1985]
  ],
  '501': [
    ['MovieTrailerCollection', 'MovieTrailer-Collection.mp4', 'Parker 16mm Movie Trailer Collection', 1960],
    ['hhv-glv-trailer-reel', 'HHV-GLV-TrailerReel.mp4', 'Hollywood House Video Trailer Reel', 1982]
  ]
};
const exportRegistry = (...flags) => JSON.parse(execFileSync(process.execPath,
  ['scripts/export-ia-manifest.js', 'the_dial_desktop.html', ...flags],
  { encoding: 'utf8', maxBuffer: 16e6 }));
const registry = new Map(exportRegistry().map(row => [row.channel, row]));
const output = path.join(directory, 'schedule.json');
const previous = await fs.readFile(output, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return { stations: [] };
  throw error;
});
const selected = process.argv.find(arg => arg.startsWith('--channels='))?.slice(11).split(',');
const all = !selected && (process.argv.includes('--all') || previous.fullLineup === true);
const sourceLineup = process.argv.includes('--sources') || previous.sourceLineup === true;
const lineup = all || selected ? exportRegistry('--lineup') : [];
const stations = lineup.length
  ? new Map(lineup.filter(row => (row.source === 'archive' || (row.source === 'v2preview' && (sourceLineup || selected))) &&
      (!selected || selected.includes(row.channel)))
    .map(row => [row.channel, { ...row, ...pilotStations.get(row.channel) }]))
  : pilotStations;

async function readCatalog(rules, rotation, sessionId) {
  const response = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...rules, iaRepair: true, serverCatalog: true, count: 3, rotation, sessionId }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const catalog = await response.json();
  return [...(catalog.items || []), ...(catalog.candidateItems || [])];
}

async function readArchiveInventory(rules) {
  const response = await fetch('https://realsignal-api.tdy1990.workers.dev/api/v3/catalog?limit=96&channel=' +
    encodeURIComponent(rules.channel), { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
  const { items } = await response.json();
  const candidates = [];
  for (const row of items || []) {
    let metadata;
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch { continue; }
    if (!metadata.genreVerified && !metadata.recoveryVerified) continue;
    const proof = qualifyIaFileRecord({
      ...metadata, identifier: row.id, sourceIdentifier: row.source_identifier || metadata.sourceIdentifier,
      title: row.title, description: row.description, year: row.year, rights: row.rights,
      media: { type: row.media_type, url: row.media_url || metadata.mediaUrl || metadata.media_url,
        runtime: row.duration_seconds || metadata.runtimeSeconds || metadata.duration,
        width: metadata.width, height: metadata.height, aspectRatio: row.aspect_ratio || metadata.aspectRatio,
        verification: metadata.verification, verifiedAt: metadata.verifiedAt }
    }, { ...rules, requireTransport: false });
    if (proof.accepted && proof.item.runtimeSeconds && proof.item.fileName) {
      candidates.push({ ...proof.item, broadcastFamily: familyId(proof.item) });
    }
  }
  return candidates;
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
  if (['YouTube', 'PeerTube', 'NASCAR Classics', 'OK.ru', 'Vimeo'].includes(item.provider)) return verifyBroadcastSource(item);
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

async function archiveMetadata(sourceIdentifier) {
  const response = await fetch('https://archive.org/metadata/' + encodeURIComponent(sourceIdentifier), {
    signal: AbortSignal.timeout(8000)
  });
  return response.ok ? response.json() : {};
}

function archiveFileRecord(sourceIdentifier, file, metadata, { title, year, seriesTitle, type = 'video' }) {
  const fileName = file.name;
  return normalizeIaFileRecord({
    identifier: sourceIdentifier + '::' + fileName, sourceIdentifier, fileName, seriesTitle,
    title, year, provider: 'Internet Archive', rights: metadata?.licenseurl || metadata?.rights,
    media: { type, runtime: file.length, width: file.width, height: file.height,
      language: metadata?.language, metadataVerifiedAt: Date.now(),
      url: 'https://archive.org/download/' + encodeURIComponent(sourceIdentifier) + '/' + fileName.split('/').map(encodeURIComponent).join('/') }
  });
}

async function expandCollection([sourceIdentifier, seriesTitle, firstYear, episodeName], rules, known, round) {
  const { files, metadata } = await archiveMetadata(sourceIdentifier);
  const audio = rules.mediaTypes?.[0] === 'audio';
  const episodes = new Map();
  for (const file of files || []) {
    const fileName = String(file.name || '');
    const leaf = fileName.split('/').at(-1);
    const episode = leaf.match(episodeName);
    if (!(audio ? /\.mp3$/i.test(leaf) && file.source === 'original' : /\.mp4$/i.test(leaf)) ||
      file.private || !episode ||
      /\b(?:clips?|promo|trailer|preview|bonus|credits only|opening only)\b/i.test(leaf.replace(/_/g, ' '))) continue;
    const episodeYear = audio ? 1900 + Number(episode[1]) : Number(leaf.match(/(?:^|\D)(19\d{2})(?=\D|$)/)?.[1]);
    if (seriesTitle === 'Wheel of Fortune' && !episodeYear) continue;
    const episodeTitle = audio
      ? leaf.slice(episode.index + episode[0].length).replace(/\.mp3$/i, '')
        .replace(/^[-_ (]*(?:ep)?\d*[-_ )]*/i, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
      : leaf.replace(/(?:\.ia)?\.mp4$/i, '').replace(/_/g, ' ');
    const item = archiveFileRecord(sourceIdentifier, file, metadata, { seriesTitle,
      title: seriesTitle + ' · ' + episodeTitle, year: episodeYear || firstYear, type: audio ? 'audio' : 'video' });
    if ((audio && (item.runtimeSeconds < 720 || !episodeTitle ||
      /\b(?:afrs|audition|excerpt|incomplete|fragment)\b/i.test(episodeTitle))) ||
      !qualifyIaFileRecord(item, { ...rules, requireTransport: false }).accepted) continue;
    const episodeKey = audio ? [episodeYear, episode[2], episode[3]].join('-') : item.logicalId;
    if (!episodes.has(episodeKey)) episodes.set(episodeKey, item);
  }
  const rows = [...episodes.values()].filter(item => !known.has(item.logicalId));
  const start = rows.length ? round % rows.length : 0;
  return rows.slice(start).concat(rows.slice(0, start)).slice(0, 6);
}

async function collectNewEpisodes(rules, earlier, incoming, round) {
  const collections = episodeCollections[rules.channel] || [];
  const known = new Set([...(earlier?.catalog || []), ...incoming].map(item => normalizeIaFileRecord(item).logicalId));
  const selected = await Promise.allSettled(collections.map(collection => expandCollection(collection, rules, known, round)));
  return probePrograms(selected.flatMap(result => result.status === 'fulfilled' ? result.value : []));
}

async function collectReviewedVideo(rules, earlier, round) {
  const known = new Set((earlier?.catalog || []).map(item => item.identifier));
  const pending = (reviewedVideo[rules.channel] || []).filter(([id, name]) => !known.has(id + '::' + name));
  const reviewed = await Promise.allSettled(pending.map(async ([id, name, title, year]) => {
    const { files, metadata } = await archiveMetadata(id);
    const file = files?.find(row => row.name === name && !row.private);
    return file ? archiveFileRecord(id, file, metadata, { title, year }) : null;
  }));
  const candidates = reviewed.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
  if (rules.channel === '501') {
    const id = 'Vintage-Movie-Trailers';
    const { files, metadata } = await archiveMetadata(id).catch(() => ({}));
    const trailers = (files || []).flatMap(file => {
      const title = String(file.name || '').match(/^Trailers\/([^/]+\(((?:19|20)\d{2})\))\.mp4$/i);
      if (!title || file.private || file.source !== 'original' || known.has(id + '::' + file.name)) return [];
      return [archiveFileRecord(id, file, metadata, {
        title: title[1] + ' — Theatrical Trailer', year: Number(title[2]), seriesTitle: title[1]
      })];
    });
    const limit = earlier?.status === 'ready' ? 16 : 64;
    const start = trailers.length ? round % trailers.length : 0;
    candidates.push(...trailers.slice(start).concat(trailers.slice(0, start)).slice(0, limit));
  }
  return probePrograms(candidates.filter(item => qualifyIaFileRecord(item, { ...rules, requireTransport: false }).accepted));
}

async function renewUnseen(previous, incoming, rotation, budget) {
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
    const family = row.broadcastFamily || familyId(row);
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family).push(row);
  }
  const families = [...grouped.keys()].sort((a, b) => (familyOrder.get(a) ?? -1) - (familyOrder.get(b) ?? -1));
  const selected = [];
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
async function refreshStation([channel, station]) {
  const sourceCatalog = station.source === 'v2preview';
  const rules = { ...registry.get(channel), channel, name: station.name, sourceCatalog, profileKey: station.profileKey };
  const earlier = previous.stations.find(row => row.channel === channel);
  const pilot = pilotStations.has(channel);
  const sessionId = 'broadcast-publisher-' + channel;
  let rotation = earlier?.nextRotation || 0;
  const candidates = [];
  let schedule;
  let reason;
  let renewed = [];
  for (let attempt = 0; attempt < (pilot ? 4 : 1); attempt++) {
    try {
      if (sourceCatalog) {
        const inventory = await readSourceBroadcastInventory(station.profileKey);
        rules.cooledProviders = inventory.cooledProviders;
        candidates.push(...inventory.candidates);
      } else {
        candidates.push(...await (pilot ? readCatalog(rules, rotation, sessionId) : readArchiveInventory(rules)));
      }
    } catch (error) {
      reason = error.message;
    }
    rotation += 6;
    // A full current window is no reason to skip the next discovery page.
    if (pilot && attempt === 0) continue;
    try {
      if (reviewedVideo[channel]) candidates.push(...await collectReviewedVideo(rules, earlier, rotation / 6));
      if (channel === '921' && (earlier?.catalog?.length || 0) < 180) {
        candidates.push(...await collectNewEpisodes(rules, earlier, candidates, rotation / 6));
      }
      if (pilot && attempt === 1) {
        renewed = await renewUnseen(earlier, candidates, rotation / 6, 24);
        candidates.push(...renewed);
        candidates.push(...await collectNewEpisodes(rules, earlier, candidates, rotation / 6));
      } else if (earlier?.status === 'ready') {
        const known = new Set(earlier.catalog.map(item => item.logicalId));
        const newFiles = candidates.filter(item => !known.has(item.logicalId));
        renewed = await renewUnseen({ ...earlier, catalog: newFiles }, candidates, rotation / 6,
          station.profileKey?.startsWith('ok-') ? 12 : 4);
        candidates.push(...renewed);
      }
      const spots = (channel === '150' ? [toySpot] : pilot ? [carSpot] : []).filter(Boolean);
      try {
        schedule = buildBroadcastWindow({ rules, candidates, spots, previous: earlier });
      } catch (error) {
        if (pilot) throw error;
        if (!sourceCatalog && earlier?.status !== 'ready') {
          const queue = await readCatalog(rules, rotation, sessionId).catch(() => []);
          candidates.push(...queue);
        }
        const saved = collectBroadcastCatalog({ rules, candidates, previous: earlier }).catalog;
        const available = new Map([...candidates, ...saved].map(item => [item.logicalId, item]));
        const verifiedDepth = earlier?.catalog?.length || 0;
        const budget = isMusicVideoProfile(station.profileKey) ? 72 : station.profileKey?.startsWith('ok-') ? 32 :
          channel === '501' ? 48 : selected || station.profileKey === 'nascar-classics' ? 24 : earlier?.status === 'held' && verifiedDepth >= 8
          ? Math.min(24, Math.max(12, 30 - verifiedDepth)) : 12;
        const checked = await renewUnseen({ ...earlier, catalog: [...available.values()] }, candidates, rotation / 6, budget);
        renewed.push(...checked);
        candidates.push(...checked);
        const input = { rules, candidates, spots, previous: earlier };
        try {
          schedule = buildBroadcastWindow(input);
        } catch (error) {
          if ((earlier?.slots?.length && !earlier.limited) || channel === '500') throw error;
          schedule = buildBroadcastWindow({ ...input, limited: true });
        }
      }
      break;
    } catch (error) {
      reason = error.message;
    }
  }
  if (schedule) {
    const depth = schedule.depth;
    const programs = schedule.slots.filter(slot => slot.kind === 'program');
    const earlierIds = new Set(earlier?.catalog.map(item => item.logicalId));
    const added = schedule.catalog.filter(item => !earlierIds.has(item.logicalId)).length;
    console.log(channel + ' READY: ' + depth.episodes + ' verified episodes, ' + depth.families + ' families, ' +
      depth.hours.toFixed(1) + ' catalog hours, ' + new Set(programs.map(slot => slot.logicalId)).size + '/' +
      programs.length + ' distinct programs in the window, ' + added + ' new files, ' + renewed.length + ' rechecked' +
      (schedule.limited ? ', shorter schedule' : ''));
    return { ...schedule, nextRotation: rotation, category: station.category, status: 'ready' };
  }
  const canRetain = earlier && firstRejectedBroadcastSlot(earlier, Date.now(), rules) < 0;
  const { catalog } = collectBroadcastCatalog({ rules, candidates, previous: earlier });
  console.error(channel + ' HELD: ' + reason);
  return { ...(canRetain ? earlier : {}), channel, name: station.name, category: station.category,
    slots: canRetain ? earlier.slots : [], catalog, nextRotation: rotation, status: 'held', reason };
}

const batch = [...stations];
const published = [];
const parallel = all || selected ? 4 : 1;
for (let start = 0; start < batch.length; start += parallel) {
  const current = await Promise.all(batch.slice(start, start + parallel).map(refreshStation));
  published.push(...current);
}
const ready = published.filter(station => station.status === 'ready').length;
console.log(ready + '/' + published.length + ' channels scheduled on this refresh');
if (!ready || (!all && !selected && ready !== published.length)) process.exitCode = 1;
if (published.length) {
  await fs.mkdir(directory, { recursive: true });
  const temporary = output + '.' + process.pid + '.tmp';
  await fs.writeFile(temporary, JSON.stringify({ schema: 1, fullLineup: all, sourceLineup, stations: published }));
  await fs.rename(temporary, output);
  const publicSchedule = path.join(directory, 'preview.json');
  await fs.writeFile(temporary, JSON.stringify({ lineup, stations: published.filter(s => s.slots.length)
    .map(({ channel, name, category, depth, slots, generatedAt }) =>
    ({ channel, name, category, depth, slots, generatedAt })) }));
  await fs.rename(temporary, publicSchedule);
  console.log(output);
}
