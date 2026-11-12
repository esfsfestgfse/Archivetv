import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBroadcastWindow, firstRejectedBroadcastSlot } from '../broadcast_schedule.mjs';
import { retainPublishedSlots, slotAt } from '../assets/broadcast-clock.mjs';

const now = 1794319200000;
const rules = { channel: '10', name: 'Classic Reruns', mediaTypes: ['movies'] };
const minute = 60_000;
const shows = ['The Andy Griffith Show', 'The Dick Van Dyke Show', 'I Love Lucy',
  'The Honeymooners', 'The Jack Benny Program', 'The Addams Family'];
const candidates = Array.from({ length: 30 }, (_, index) => {
  const series = 'series-' + (index % 6);
  const fileName = 'Episode ' + index + '.mp4';
  return {
    identifier: series + '::' + fileName, sourceIdentifier: series, fileName, seriesId: series,
    title: shows[index % 6] + ' · Episode ' + index,
    media: { url: 'https://archive.org/download/' + series + '/' + encodeURIComponent(fileName), type: 'video',
      runtime: 22 * 60, width: 640, height: 480, verification: 'transport', verifiedAt: now }
  };
});

const wrongTitles = [
  ['000-mufon', 'MUFON Tri-State UFO conference with Kenny Young (2004)', 'Jackie Gleason'],
  ['001-softball', '2016 House v Senate Softball Game', 'Illinois Channel TV; Government Access TV'],
  ['002-film', 'College Holiday (1936)', 'Jack Benny; Burns and Allen; comedy'],
  ['003-guest-vj', 'MTV Guest VJ Hour with the Cast of The New Leave It to Beaver', 'classic television'],
  ['004-game-show', 'You Bet Your Life · Groucho Marx', 'classic television game show']
];
const wrongPrograms = wrongTitles.map(([sourceIdentifier, title, subject]) => ({
  ...candidates[0], identifier: sourceIdentifier + '::recording.mp4', sourceIdentifier,
  seriesId: sourceIdentifier, fileName: 'recording.mp4', title, subject, genreVerified: true,
  media: { ...candidates[0].media, url: 'https://archive.org/download/' + sourceIdentifier + '/recording.mp4' }
}));

test('the publisher checks the regular Archive queue when its cached inventory is too shallow', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'realsignal-broadcast-'));
  t.after(() => {
    for (const name of ['schedule.json', 'preview.json']) {
      try { unlinkSync(path.join(directory, name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    rmdirSync(directory);
  });
  const verifiedAt = Date.now();
  const programs = candidates.map(item => ({
    ...item,
    year: 1991,
    genreVerified: true,
    media: { ...item.media, runtime: 30 * 60, verifiedAt }
  }));
  const inventory = programs.slice(0, 21).map(item => ({
    id: item.identifier,
    source_identifier: item.sourceIdentifier,
    title: item.title,
    year: item.year,
    media_type: 'video',
    media_url: item.media.url,
    duration_seconds: item.media.runtime,
    metadata_json: JSON.stringify({ fileName: item.fileName, seriesId: item.seriesId,
      width: item.media.width, height: item.media.height, genreVerified: true,
      verification: 'transport', verifiedAt })
  }));
  const mock = `
    globalThis.fetch = async value => {
      const route = new URL(value).pathname;
      if (route.endsWith('/catalog')) return Response.json({ items: ${JSON.stringify(inventory)} });
      if (route.endsWith('/ia/queue')) return Response.json({ items: ${JSON.stringify(programs.slice(21))} });
      if (route.startsWith('/metadata/')) return Response.json({ files: [] });
      throw new Error('Unexpected request to ' + route);
    };
  `;
  const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(mock),
    'scripts/build-broadcast-pilot.mjs', directory, '--channels=11'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const { stations } = JSON.parse(readFileSync(path.join(directory, 'schedule.json'), 'utf8'));
  assert.equal(stations[0].status, 'ready');
  assert.equal(stations[0].depth.episodes, 30);
});

test('a saved PeerTube fragment cannot survive as a scheduled program', () => {
  const host = 'https://peertube.example';
  const directory = host + '/static/streaming-playlists/hls/b79ee051-facb-4611-8d2e-8f5b504089f3/';
  const saved = {
    channel: '527',
    catalog: [
      { logicalId: 'verified', provider: 'PeerTube', sourceUrl: host + '/w/good', media: { url: directory + 'master.m3u8' } },
      { logicalId: 'fragment', provider: 'PeerTube', sourceUrl: host + '/w/bad', media: { url: directory + '480-fragmented.mp4' } }
    ],
    slots: [
      { logicalId: 'verified', kind: 'program', endsAt: now + minute },
      { logicalId: 'fragment', kind: 'program', endsAt: now + 2 * minute }
    ]
  };
  assert.equal(firstRejectedBroadcastSlot(saved, now, { sourceCatalog: true }), 1);
  assert.equal(firstRejectedBroadcastSlot(saved, now, { sourceCatalog: true, cooledProviders: new Set(['peertube']) }), 0);
});

test('Classic Reruns schedules episodes and rerun blocks, rejecting incidental show and actor mentions', () => {
  const block = { ...candidates[0], title: '1994 Nick@Nite I Love Lucy Block' };
  const unknownSeriesEpisode = { ...candidates[1], title: 'The New Neighbors · Season 1 Episode 3',
    subject: 'sitcom; television' };
  const window = buildBroadcastWindow({ rules, candidates: [block, unknownSeriesEpisode,
    ...candidates.slice(2), ...wrongPrograms], now });
  assert.equal(window.depth.episodes, 30);
  assert.ok(window.catalog.some(item => item.title === block.title));
  assert.ok(window.catalog.some(item => item.title === unknownSeriesEpisode.title));
  assert.ok(window.slots.every(slot => !wrongTitles.some(([, title]) => title === slot.title)));
});

test('rebuilding a saved schedule removes an off-genre slot and preserves the valid live program and history', () => {
  const legacy = buildBroadcastWindow({ rules: { ...rules, channel: '11' },
    candidates: [candidates[0], ...wrongPrograms, ...candidates.slice(1)], now });
  const episode = legacy.slots.find(slot => slot.logicalId === 'series-0::episode 0');
  const bad = legacy.slots.find(slot => slot.title === wrongTitles[0][1]);
  assert.ok(episode && bad);
  // Simulate a saved schedule that put a contaminant after a valid episode.
  legacy.slots = [{ ...episode, startsAt: now, endsAt: now + 22 * minute },
    { ...bad, startsAt: now + 22 * minute, endsAt: now + 44 * minute }];
  const window = buildBroadcastWindow({ rules, candidates: [], now: now + minute,
    previous: { ...legacy, channel: '10' } });
  assert.deepEqual(window.slots[0], legacy.slots[0]);
  assert.equal(window.slots[1].startsAt, window.slots[0].endsAt);
  assert.equal(window.depth.episodes, 30);
  assert.ok(window.used.includes(episode.logicalId));
  assert.ok(window.slots.every(slot => !wrongTitles.some(([, title]) => title === slot.title)));
});

test('two viewers share the same program and a break occupies its published time', () => {
  const window = buildBroadcastWindow({ rules, candidates, now });
  assert.equal(window.depth.episodes, 30);
  assert.equal(window.depth.families, 6);
  const first = slotAt(window, now + 2 * minute);
  const second = slotAt(window, now + 7 * minute);
  assert.equal(first.slot.id, second.slot.id);
  assert.equal(second.offsetMs - first.offsetMs, 5 * minute);
  assert.equal(slotAt(window, now + 22 * minute).slot.kind, 'break');
  assert.equal(slotAt(window, now + 22 * minute + 20_000).slot.kind, 'program');
  assert.equal(slotAt(window, window.slots.at(-1).endsAt), null);
});

test('short-form Archive channels keep enough unique material for their hourly refresh', () => {
  const spots = Array.from({ length: 48 }, (_, index) => {
    const item = candidates[index % candidates.length];
    const sourceIdentifier = 'vintage-tv-spot-' + index;
    return { ...item, sourceIdentifier, identifier: sourceIdentifier + '::spot.mp4',
      fileName: 'spot.mp4', title: 'Vintage Television Commercial ' + index,
      media: { ...item.media, runtime: 4 * 60, url: 'https://archive.org/download/' + sourceIdentifier + '/spot.mp4' } };
  });
  const modern = { ...spots[0], title: 'Campaign Commercial (2026)', year: 2026,
    sourceIdentifier: 'current-campaign', identifier: 'current-campaign::spot.mp4' };
  const window = buildBroadcastWindow({ rules: { channel: '13', name: 'Vintage Commercials' },
    candidates: [...spots, modern], now });
  assert.equal(window.depth.episodes, 48);
  assert.equal(window.slots.at(-1).endsAt, now + 120 * minute);
  assert.equal(window.slots.length, 30);
  assert.equal(new Set(window.slots.map(slot => slot.logicalId)).size, 30);
  assert.ok(window.slots.every(slot => slot.kind === 'program'));
  assert.equal(firstRejectedBroadcastSlot({ channel: '13', catalog: [{ ...modern, logicalId: 'recent' }],
    slots: [{ kind: 'program', logicalId: 'recent', endsAt: now + minute }] }, now), 0);
});

test('catalog exhaustion never repeats a program still published in the current window', () => {
  const first = buildBroadcastWindow({ rules, candidates, now });
  const live = first.slots[0];
  const previous = {
    ...first,
    slots: [live],
    used: first.catalog.map(item => item.logicalId),
    lastId: 'last-from-an-earlier-window',
    lastFamily: '',
    familyOrder: []
  };
  const next = buildBroadcastWindow({ rules, candidates, previous, now: now + minute });
  assert.equal(next.slots[0], live);
  assert.equal(next.slots.filter(slot => slot.logicalId === live.logicalId).length, 1);
});

test('window updates preserve published slots and rotate through unseen programs first', () => {
  const first = buildBroadcastWindow({ rules, candidates, now });
  const later = now + 3 * 60 * minute;
  const extended = buildBroadcastWindow({ rules, candidates: candidates.slice().reverse(), now: later, previous: first });
  assert.deepEqual(extended.slots.slice(0, first.slots.filter(slot => slot.endsAt > later).length),
    first.slots.filter(slot => slot.endsAt > later));
  const combined = [...first.slots, ...extended.slots.filter(slot => slot.startsAt >= first.slots.at(-1).endsAt)]
    .filter(slot => slot.kind === 'program');
  assert.equal(new Set(combined.slice(0, 24).map(slot => slot.logicalId)).size, 24);
  assert.ok(combined.slice(1).every((slot, index) => slot.family !== combined[index].family));
});

test('an open viewer keeps the current video object while picking up an extended guide', () => {
  const first = buildBroadcastWindow({ rules, candidates, now });
  const later = now + 60 * minute;
  const extended = buildBroadcastWindow({ rules, candidates, now: later, previous: first });
  const incoming = JSON.parse(JSON.stringify(extended.slots));
  const slots = retainPublishedSlots(first.slots, incoming);
  assert.equal(slotAt({ slots }, later).slot, slotAt(first, later).slot);
  assert.ok(slots.at(-1).endsAt > first.slots.at(-1).endsAt);
  incoming[0].url += '?changed';
  assert.equal(retainPublishedSlots(first.slots, incoming)[0], incoming[0]);
});

test('shallow or expired input cannot replace a deep schedule', () => {
  const first = buildBroadcastWindow({ rules, candidates, now });
  assert.throws(() => buildBroadcastWindow({ rules, candidates: candidates.slice(0, 3), now }), /depth/i);
  assert.throws(() => buildBroadcastWindow({ rules, candidates: [], now: now + 25 * 60 * minute,
    previous: first }), /verified unseen/i);
});

test('expired playback checks retain the deep catalog while rechecked unseen episodes extend the schedule', () => {
  const first = buildBroadcastWindow({ rules, candidates, now, horizonMs: 60 * minute });
  const later = now + 25 * 60 * minute;
  const unused = first.catalog.filter(item => !first.used.includes(item.logicalId));
  const renew = rows => rows.map(row => ({ ...row, media: { ...row.media, verifiedAt: later } }));
  const updated = buildBroadcastWindow({ rules, candidates: renew(unused.slice(0, 9)), previous: first,
    now: later, horizonMs: 60 * minute });
  assert.equal(updated.depth.episodes, first.depth.episodes);
  assert.equal(updated.readyDepth.episodes, 9);
  assert.ok(updated.slots.filter(slot => slot.kind === 'program').every(slot => !first.used.includes(slot.logicalId)));
  const watched = first.catalog.filter(item => first.used.includes(item.logicalId));
  assert.throws(() => buildBroadcastWindow({ rules, candidates: renew(watched), previous: first,
    now: later, horizonMs: 60 * minute }), /unseen/i);
});

test('duplicate encodes count as one episode and an existing ad break stays attached to the recording', () => {
  const row = candidates[0];
  const variant = { ...row, identifier: row.identifier.replace('.mp4', '.ia.mp4'),
    fileName: row.fileName.replace('.mp4', '.ia.mp4') };
  const withAds = candidates.map(item => ({ ...item, containsCommercials: true }));
  const result = buildBroadcastWindow({ rules, candidates: [...withAds, variant], now });
  assert.equal(result.depth.episodes, 30);
  assert.ok(result.slots.every(slot => slot.kind === 'program'));
});

test('a scheduled commercial has the same offset and end for both viewers and does not repeat inside the window', () => {
  const spot = { id: 'spot', url: 'https://archive.org/download/ad/spot.mp4', durationMs: 29_990, title: 'Vintage spot' };
  const schedule = buildBroadcastWindow({ rules, candidates, now, spots: [spot] });
  const start = now + 22 * minute;
  const during = slotAt(schedule, start + 15_000);
  assert.equal(during.slot.url, spot.url);
  assert.equal(during.offsetMs, 15_000);
  assert.equal(during.slot.endsAt, start + spot.durationMs);
  assert.equal(slotAt(schedule, during.slot.endsAt).slot.kind, 'program');
  assert.equal(schedule.slots.filter(slot => slot.url === spot.url).length, 1);
});
