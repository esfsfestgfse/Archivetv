import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [checkpointDirectory, siteDirectory] = process.argv.slice(2);
if (!checkpointDirectory || !siteDirectory) {
  throw new Error('Usage: node scripts/assemble-broadcast-canary.mjs <checkpoint directory> <site directory>');
}

const scheduleRoute = 'output/broadcast-pilot-preview/preview.json';
const manifest = await readFile(path.join(checkpointDirectory, 'preview.json'), 'utf8');
const { stations, lineup } = JSON.parse(manifest);
const now = Date.now();
const active = stations.filter(station => station.slots.some(slot => slot.startsAt <= now && now < slot.endsAt));
const required = ['10', '12', '150'];
for (const channel of required) assert.ok(active.some(station => station.channel === channel), 'Channel ' + channel + ' is off air');
if (lineup?.length) {
  const channelNumbers = new Set(lineup.map(station => station.channel));
  assert.equal(channelNumbers.size, lineup.length, 'Duplicate channel numbers in the guide');
  assert.ok(active.every(station => channelNumbers.has(station.channel)), 'Scheduled channel missing from the guide');
}
for (const station of active) {
  const { channel, slots, generatedAt } = station;
  const programs = slots.filter(slot => slot.kind === 'program');
  if (required.includes(channel)) {
    assert.ok(generatedAt >= now - 30 * 60_000, 'Channel ' + channel + ' did not refresh');
    assert.ok(slots.at(-1).endsAt >= now + 5 * 60 * 60_000, 'Channel ' + channel + ' schedule is too short');
  }
  assert.ok(slots.slice(1).every((slot, i) => slot.startsAt === slots[i].endsAt), 'Channel ' + channel + ' schedule has a gap');
  assert.equal(new Set(programs.map(slot => slot.logicalId)).size, programs.length, 'Channel ' + channel + ' repeats an episode');
}

const manifestPath = path.join(siteDirectory, scheduleRoute);
await mkdir(path.dirname(manifestPath), { recursive: true });
await mkdir(path.join(siteDirectory, 'assets'), { recursive: true });
await Promise.all([
  copyFile('broadcast_preview.html', path.join(siteDirectory, 'broadcast_preview.html')),
  copyFile('assets/broadcast-clock.mjs', path.join(siteDirectory, 'assets/broadcast-clock.mjs')),
  copyFile('assets/broadcast-player.mjs', path.join(siteDirectory, 'assets/broadcast-player.mjs')),
  writeFile(manifestPath, JSON.stringify({ lineup, stations: active })),
  writeFile(path.join(siteDirectory, '_headers'), '/' + scheduleRoute + '\n  Cache-Control: no-cache\n')
]);
if (lineup?.length) {
  await cp('assets', path.join(siteDirectory, 'assets'), { recursive: true });
  await Promise.all(['the_dial_desktop.html', 'the_dial_mobile.html', 'realsignal_cast_receiver.html', 'roku_remote.html',
    'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png'].map(file => copyFile(file, path.join(siteDirectory, file))));
}
console.log('Assembled ' + active.length + ' broadcast schedules for ' + (lineup?.length || active.length) + ' guide channels.');
