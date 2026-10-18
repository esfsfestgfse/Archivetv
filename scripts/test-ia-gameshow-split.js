const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const episode = (title, year) => ({ identifier: 'game-show::episode.mp4', title, year, language: 'eng',
  media: { type: 'video', url: 'https://archive.org/download/game-show/episode.mp4',
    runtime: 1320, width: 640, height: 480, verifiedAt: Date.now(), verification: 'transport' } });

test('game show era admission uses episode evidence before an Archive upload year', async () => {
  const { catalogFallbackAllowed } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const classic = { iaRepair: true, channel: '12', mediaTypes: ['movies'] };
  const modern = { ...classic, channel: '22' };
  const oldEpisode = episode('Family Feud · October 12, 1977', 2025);
  assert.equal(catalogFallbackAllowed(oldEpisode, classic), true);
  assert.equal(catalogFallbackAllowed(oldEpisode, modern), false);
  const newEpisode = episode('Family Feud · October 12, 2012', 1980);
  assert.equal(catalogFallbackAllowed(newEpisode, classic), false);
  assert.equal(catalogFallbackAllowed(newEpisode, modern), true);
  const boundary = episode('Match Game · 1980 episode', 2025);
  assert.equal(catalogFallbackAllowed(boundary, classic), false);
  assert.equal(catalogFallbackAllowed(boundary, modern), true);
  assert.equal(catalogFallbackAllowed(episode('Match Game · 1979 episode',2025),classic),true);
  assert.equal(catalogFallbackAllowed(episode('Match Game · 1979 episode',2025),modern),false);
  assert.equal(catalogFallbackAllowed(episode('Game show episode'), modern), false,
    'unknown episode years must be resolved rather than borrowing the other era');
  const imitation = episode('WE PLAYED FAMILY FEUD IN GMOD! Gmod Sandbox Game Show',2024);
  assert.equal(catalogFallbackAllowed(imitation,modern),false,'a game-show title cannot admit gameplay recreations');
  assert.equal(catalogFallbackAllowed(episode('Password · Cryptography and password cracking',1975),classic),false,
    'the Password television series must not admit computing lessons');
  const identifierDate=episode('Match Game complete episodes',2025);
  identifierDate.identifier='uploaded-collection::Match Game 1975 episode.mp4';
  identifierDate.media.url='https://archive.org/download/uploaded-collection/Match%20Game%201975%20episode.mp4';
  assert.equal(catalogFallbackAllowed(identifierDate,classic),true,'legacy file identities retain their episode date');
  assert.equal(catalogFallbackAllowed(identifierDate,modern),false);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': exports two independent game-show stations', () => {
  const manifest = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/export-ia-manifest.js'), path.join(root, file)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  assert.equal(manifest.find(row => row.channel === '12')?.name, 'Classic Game Shows');
  assert.equal(manifest.find(row => row.channel === '22')?.name, 'Modern Game Shows');
  const modern = manifest.find(row => row.channel === '22');
  assert.ok(modern.queries.some(query => query.includes('1980 TO 2026')));
  assert.ok(manifest.find(row => row.channel === '12').queries.some(query => query.includes('1940 TO 1979')));
  assert.ok(modern.themeTerms.some(term => /supermarket|weakest|divided|figure it out/.test(term)));
});

test('both game-show stations expose deep file banks and keep their parents discoverable', () => {
  const scope = { console, URL, URLSearchParams, Request, Response, Headers, AbortController,
    TextEncoder, Date, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8').replace('export default', 'const worker =') +
    '\nglobalThis.f={iaRepairCollectionSeeds,iaStationQualityGate};', scope);
  for (const channel of ['12', '22']) {
    const rows = scope.f.iaRepairCollectionSeeds(channel);
    assert.ok(rows.filter(row => row.media).length >= 48, channel + ' must have more than five startup files');
    assert.ok(rows.filter(row => !row.media).length >= 3, channel + ' must retain collection indexes for expansion');
    assert.ok(rows.filter(row => row.media).every(row => scope.f.iaStationQualityGate(channel, row)));
  }
  assert.equal(scope.f.iaStationQualityGate('12', episode('Supermarket Sweep · 2003', 2003)), false);
  assert.equal(scope.f.iaStationQualityGate('22', episode('Match Game · 1975', 1975)), false);
  assert.equal(scope.f.iaStationQualityGate('12', episode('Press Your Luck · 1983', 1983)), false);
  assert.equal(scope.f.iaStationQualityGate('22', episode('Press Your Luck · 1983', 1983)), true);
  assert.equal(scope.f.iaStationQualityGate('12',{identifier:'collection-index',title:'Match Game complete episodes',year:2025}),true,
    'a collection upload year must not prevent discovery of its dated child episodes');
});
