#!/usr/bin/env node
/*
  Static contract for the first real channel merge. The browser smoke test
  validates playback; this guard protects the registry-level invariants:
  Courtroom 20/21 share one canonical session, while Black-media remains out.
*/
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = ['the_dial_desktop.html', 'the_dial_mobile.html'];
let failures = 0;

function expect(file, label, condition) {
  console.log(`${file}: ${label}: ${condition ? 'ok' : 'FAIL'}`);
  if (!condition) failures += 1;
}

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const pilot = source.match(/\{id:"courtroom-tv",canonicalNum:(\d+),label:"([^"]+)",members:\[(\d+),(\d+)\]/);
  const build = source.match(/window\.__ATV_BUILD="([^"]+)"/);
  expect(file, '5.5.27 archive-merge build stamp', build && /^5\.5\.27-(?:desktop|mobile)-archive-movie-merge$/.test(build[1]));
  expect(file, 'Courtroom pilot declares canonical channel 20', pilot && pilot[1] === '20' && pilot[2] === 'Courtroom TV');
  expect(file, 'Courtroom pilot includes legacy members 20 and 21', pilot && pilot[3] === '20' && pilot[4] === '21');
  expect(file, 'legacy tune resolves through canonicalTuneNum', source.includes('canonicalTuneNum(requestedNum)') && source.includes('REAL_CHANNEL_MERGE_BY_NUM'));
  expect(file, 'merged catalog uses both Courtroom program profiles', source.includes('programs:["The Court Room","Court TV"]') && source.includes('rsMergeProgramRecords'));
  const archive = source.match(/\{id:"archive-cinema-mix",canonicalNum:(\d+),label:"([^"]+)",members:\[(\d+),(\d+)\]/);
  expect(file, 'Archive Movie Mix canonicalizes 135/136', archive && archive[1] === '135' && archive[2] === 'Archive Movie Mix' && archive[3] === '135' && archive[4] === '136');
  expect(file, 'merged catalog uses both Archive cinema profiles', source.includes('programs:["Modern Archive Cinema","Archive Genre Cinema"]'));
  expect(file, 'canonical queue uses one channel identity', source.includes('return {show:canonicalChannelLabel(ch)') && source.includes('store.set("last",canonicalNum)'));
  expect(file, 'Black-media channels remain outside the real pilot', source.includes('num:105') && source.includes('num:225') && source.includes('num:538') && !source.includes('REAL_CHANNEL_MERGES=[{id:"courtroom-tv",canonicalNum:20,label:"Courtroom TV",members:[20,21,105'));
}

if (failures) process.exitCode = 1;
else console.log('Real merge pilot contract OK: Courtroom 20/21 canonicalized; Black-media protected.');
