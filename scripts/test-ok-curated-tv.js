/* Curated OK television admissions: the program identity must be in the title. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const catalog = await import(pathToFileURL(path.join(__dirname, '..', 'ok_curated_tv_catalog.js')));
  const worker = await import(pathToFileURL(path.join(__dirname, '..', 'realsignal_api_v2_worker.js')));
  const profiles = [
    ['ok-britannia-channel', 'Only Fools and Horses S02E03 DVDRip', 'Only Fools and Horses'],
    ['ok-history-vault-channel', 'The World at War S01E02 1080p', 'The World at War'],
    ['ok-factory-floor-channel', "How It's Made S04E11 DVDRip", "How It's Made"],
    ['ok-black-tv-channel', 'Martin S02E04 DVDRip', 'Martin'],
  ];
  for (const [profileKey, title, seriesTitle] of profiles) {
    const profile = { profileKey };
    const item = { id: 'ok:123', rawId: '123', title, duration: 1320, aspectRatio: 16 / 9, embedAllowed: true, embedUrl: 'https://ok.ru/videoembed/123' };
    assert.equal(catalog.okCuratedPrecheck(profile, item), true, `${profileKey} accepts a long landscape program`);
    const identity = await catalog.okCuratedIdentity(profile, item);
    assert.equal(identity.seriesTitle, seriesTitle);
    const persistedCandidate = { ...item, ...identity, provider: 'OK.ru', type: 'embed', url: item.embedUrl };
    assert.equal(worker.catalogFallbackAllowed(persistedCandidate, { sourceCatalog: true, channel: profileKey }), true, `${profileKey} keeps curated programs through the persistence gate`);
    assert.equal(worker.catalogFallbackAllowed({ ...persistedCandidate, duration: 120 }, { sourceCatalog: true, channel: profileKey }), false, `${profileKey} still enforces runtime during persistence`);
    if (/In Living Color/.test(title)) assert.equal(identity.episodeIdentity, 'episode9');
    assert.equal(catalog.okCuratedVerified(profile, { ...item, ...identity }), true);
    for (const bad of [
      { title: title.replace(/S\d{2}E\d{2}/, 'clip'), duration: 120 },
      { title: `${title} podcast`, duration: 1800 },
      { title: `${title} fan parody`, duration: 1800 },
      { title, duration: 1800, aspectRatio: 0.56 },
      { title: `${title} VOSTFR`, duration: 1800 },
    ]) assert.equal(catalog.okCuratedPrecheck(profile, { ...item, ...bad }), false, `${profileKey} rejects contaminated/short/portrait material`);
  }
  const black = { profileKey: 'ok-black-tv-channel' };
  for (const title of ['Dean Martin Show S02E04', 'Doc Martin S02E04', 'Steve Martin S02E04', 'Martin Scorsese S02E04', 'Martin Lawrence Stand Up S02E04']) {
    assert.equal(catalog.okCuratedPrecheck(black, { id: 'ok:x', title, duration: 1800, aspectRatio: 16 / 9 }), false, `Martin filter rejects ${title}`);
  }
  const martinEpisode = { id: 'ok:martin', rawId: 'martin', title: 'Martin S02E04', duration: 1320, aspectRatio: 16 / 9, embedAllowed: true, embedUrl: 'https://ok.ru/videoembed/123' };
  assert.equal((await catalog.okCuratedIdentity(black, martinEpisode)).seriesTitle, 'Martin');
  const { default: fs } = await import('node:fs');
  const vm = await import('node:vm');
  const runtime = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ok-embed-runtime.js'), 'utf8');
  const window = {};
  vm.runInNewContext(runtime, { window, URL, document: { createElement: () => ({}) } });
  const duplicateEpisode = { provider: 'OK.ru', seriesId: 'realsignal-ok:black-tv:inlivingcolor', title: 'Episode 9 In Living Color', episodeIdentity: 'episode9' };
  const deDuplicated = window.RealSignalOKEmbed.order({ profileKey: 'ok-black-tv-channel', intent: 'television' }, [
    { ...duplicateEpisode, id: 'ok:one' }, { ...duplicateEpisode, id: 'ok:two' }
  ]);
  assert.equal(deDuplicated.length, 1, 'alternate copies of the same episode must collapse in the playback order');
  console.log('Curated OK TV verification passed: three launch-ready families and a strict Martin Lawrence identity guard.');
})().catch(error => { console.error(error); process.exitCode = 1; });
