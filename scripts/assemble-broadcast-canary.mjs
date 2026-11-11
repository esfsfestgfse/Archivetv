import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [checkpointDirectory, siteDirectory] = process.argv.slice(2);
if (!checkpointDirectory || !siteDirectory) {
  throw new Error('Usage: node scripts/assemble-broadcast-canary.mjs <checkpoint directory> <site directory>');
}

const scheduleRoute = 'output/broadcast-pilot-preview/preview.json';
const manifest = await readFile(path.join(checkpointDirectory, 'preview.json'), 'utf8');
const { stations } = JSON.parse(manifest);
const now = Date.now();
assert.deepEqual(stations.map(station => station.channel).sort(), ['10', '12', '150']);
for (const station of stations) {
  const { channel, slots, generatedAt } = station;
  const programs = slots.filter(slot => slot.kind === 'program');
  assert.ok(generatedAt >= now - 30 * 60_000, 'Channel ' + channel + ' did not refresh');
  assert.ok(slots.some(slot => slot.startsAt <= now && now < slot.endsAt), 'Channel ' + channel + ' is off air');
  assert.ok(slots.at(-1).endsAt >= now + 5 * 60 * 60_000, 'Channel ' + channel + ' schedule is too short');
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
  writeFile(manifestPath, manifest),
  writeFile(path.join(siteDirectory, '_headers'), '/' + scheduleRoute + '\n  Cache-Control: no-store\n')
]);
console.log('Assembled broadcast channels 10, 12, and 150.');
