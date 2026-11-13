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
    ['ok-factory-floor-channel', 'Mega Manufacturing S01E05 Volvo Truck Manufacturer', 'Mega Manufacturing'],
    ['ok-factory-floor-channel', 'Inside the Spitfire Factory S01E01 Making of an Icon', 'Inside the Spitfire Factory'],
    ['ok-cookhouse-channel', 'The French Chef with Julia Child Season 1', 'The French Chef'],
    ['ok-wildlife-channel', 'The Life of Birds Episode 05', 'The Life of Birds'],
    ['ok-casefiles-channel', 'Forensic Files S13E36 Writing on the Wall', 'Forensic Files'],
    ['ok-homestead-channel', 'Gardeners World S54E17', "Gardeners' World"],
    ['ok-treasures-channel', 'Salvage Hunters S16E15', 'Salvage Hunters'],
    ['ok-travel-channel', 'Globe Trekker S15E07 West Texas', 'Globe Trekker'],
    ['ok-science-lab-channel', 'NOVA | PBS The Case of ESP S11E01', 'PBS NOVA'],
    ['ok-gearhead-channel', "1966 Buick Riviera - Jay Leno's Garage", "Jay Leno's Garage"],
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
    const stored = worker.compactCatalogItem(persistedCandidate);
    assert.equal(stored.curatedVerified, true, `${profileKey} verification survives database serialization`);
    assert.equal(stored.curatedFamily, identity.curatedFamily);
    assert.equal(stored.episodeIdentity, identity.episodeIdentity);
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
  for (const [key,title,duration] of [
    ['factory-floor','Inside the Factory: A Leapfrog Story',1800],
    ['factory-floor','Inside the Factory S01E01 AI Generated Future Cars',1800],
    ['gearhead','The Wheeler Dealers (1963)',6333],
    ['gearhead',"The Tonight Show with Jay Leno's Garage",1800],
    ['science-lab','Bill Nye the Science Guy - Stop The Rock (PC Game)',5515],
    ['cookhouse','Great British Bake Off: An Extra Slice S02E01',1700],
    ['cookhouse','Essential Pepin.Ep.23-Eggs-quisite',1491],
    ['wildlife','BBC Planet Earth 07 Great Plains - ปฐพีชีวิต ตอน 7',2500],
    ['travel','Anthony Bourdain Parts Unknown Iran Watch Party',2200],
  ]) assert.equal(catalog.okCuratedPrecheck({profileKey:'ok-'+key+'-channel'},{
    id:'ok:1', title, duration, aspectRatio:16/9
  }),false,title);
  const source=await import(pathToFileURL(path.join(__dirname,'..','realsignal_source_catalog.js')));
  const shared=await import(pathToFileURL(path.join(__dirname,'..','ok_public_search.js')));
  for(const family of ['factory-floor','cookhouse','science-lab','gearhead','wildlife','casefiles','homestead','treasures','travel','rail','air','rescue']){
    const profileKey='ok-'+family+'-channel', profile=source.sourceProfile({profileKey});
    const seeds=source.okVerifiedSeed(profile);
    if (['wildlife','casefiles','homestead','treasures','travel','rail','air','rescue'].includes(family)) assert.ok(seeds.every(item => item.id.startsWith('ok:'+family+':')), 'station metadata must have separate storage IDs');
    assert.ok(seeds.length>=25,profileKey+' cold-start catalog is shallow');
    assert.ok(new Set(seeds.map(item=>item.seriesId)).size>=(family==='air'?2:4),profileKey+' should have multiple shows');
    const ordered=shared.okBalancedCandidates([seeds],'tv',512);
    assert.equal(ordered.length,seeds.length,profileKey+' includes alternate copies');
    const minSeries = family === 'air' ? 2 : 4;
    for(let offset=0;offset<15;offset+=5){
      const shelf=ordered.slice(offset,offset+5);
      assert.ok(new Set(shelf.map(item=>item.seriesId)).size>=minSeries,profileKey+' repeats the same series in the first three shelves');
    }
  }
  const black = { profileKey: 'ok-black-tv-channel' };
  for (const title of ['Dean Martin Show S02E04', 'Doc Martin S02E04', 'Steve Martin S02E04', 'Martin Scorsese S02E04', 'Martin Lawrence Stand Up S02E04', 'Martin Mystery S02E04']) {
    assert.equal(catalog.okCuratedPrecheck(black, { id: 'ok:x', title, duration: 1800, aspectRatio: 16 / 9 }), false, `Martin filter rejects ${title}`);
  }
  const martinEpisode = { id: 'ok:martin', rawId: 'martin', title: 'Martin S02E04', duration: 1320, aspectRatio: 16 / 9, embedAllowed: true, embedUrl: 'https://ok.ru/videoembed/123' };
  assert.equal((await catalog.okCuratedIdentity(black, martinEpisode)).seriesTitle, 'Martin');
  const brit = { profileKey: 'ok-britannia-channel' };
  assert.equal(catalog.okCuratedPrecheck(brit, { id: 'ok:revisited', title: 'Doctor Who: The Doctors Revisited 2013 S01E07', duration: 1800, aspectRatio: 16 / 9 }), false, 'Doctor Who retrospectives must not enter the episode channel');
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
  const helpers = await import(pathToFileURL(path.join(__dirname, '..', 'ok_public_search.js')));
  const aviation = { profileKey: 'ok-air-channel' };
  assert.ok(Array.from({length:12},(_,window)=>catalog.okCuratedQueries(aviation,window)).flat().includes('Mayday Air Disasters'),
    'background discovery must reach alternate names of the same aviation series');
  const hd = { ...duplicateEpisode, id: 'ok:hd', videoHeight: 1080 };
  const sd = { ...duplicateEpisode, id: 'ok:sd', videoHeight: 480 };
  assert.equal(helpers.okBalancedCandidates([[sd,hd]], 'tv')[0].id, hd.id, 'duplicate copies prefer verified higher resolution');
  assert.equal(window.RealSignalOKEmbed.order({intent:'television'}, [sd,hd])[0].id, hd.id);
  const pending = { id: 'pending', title: 'Selected episode' };
  const stable = window.RealSignalOKEmbed.reconcileShelf({ items: [pending], pendingId: pending.id, currentId: 'prior' }, [{ id: 'new' }]);
  assert.equal(stable.items[stable.cursor].id, 'pending', 'background installs cannot change the pending tune');
  const selectedEpisode = { id: 'chosen', seriesId: 'show', title: 'Living Single S01E02' };
  const alternateEpisode = { ...selectedEpisode, id: 'alternate-copy' };
  const refreshed = window.RealSignalOKEmbed.reconcileShelf({ items: [selectedEpisode], pendingId: selectedEpisode.id }, [alternateEpisode, { ...selectedEpisode, id: 'unseen', title: 'Living Single S01E03' }]);
  assert.deepEqual(Array.from(refreshed.items, item => item.id), ['chosen', 'unseen'], 'retaining a pending item must remove alternate copies of that same episode');
  for (const title of ['Living Single Season:1 Episode:2', 'Living.Single.S01E02.DVDRip', 'Living Single - S1-E2', 'Living Single season-1-episode-2_480.mp4']) {
    assert.equal(helpers.okEpisodeIdentity(title), 's01e02');
    assert.equal(window.RealSignalOKEmbed.programKey({ id: 'copy', seriesId: 'show', title }), 'show:s01e02');
  }
  for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const saved = new Map();
    const context = { store: { get: (key, fallback) => saved.has(key) ? saved.get(key) : fallback, set: (key, value) => saved.set(key, value) }, window, V2_SOURCE_READY_BUFFER: 5, v2Shuffle: items => items.slice().reverse() };
    for (const name of ['v2Recent', 'v2Remember', 'v2Shelf', 'v2CatalogOrder']) vm.runInNewContext(html.split(/\r?\n/).find(line => line.startsWith(`function ${name}(`)), context);
    context.v2Rejected = () => [];
    const channel = 'OK Black Television';
    const watched = { id: 'watched', provider: 'OK.ru', seriesId: 'show', title: 'Living Single S01E02' };
    context.v2Remember(channel, watched);
    const replacement = { ...watched, id: 'alternate', title: 'Living Single Season:1 Episode:2' };
    const fresh = { ...watched, id: 'fresh', title: 'Living Single S01E03' };
    const ordered = context.v2CatalogOrder(channel, [watched, replacement, fresh]);
    assert.deepEqual(Array.from(ordered, item => item.id), ['fresh'], `${file} cannot rotate watched programs or alternate copies ahead of an unseen episode`);
    context.v2Remember(channel, fresh);
    assert.ok(context.v2CatalogOrder(channel, [watched, replacement, fresh]).length, 'exhaustion must preserve playback instead of producing no signal');
    for (let i = 0; i < 70; i++) context.v2Remember(channel, { id: `old-${i}`, provider: 'OK.ru', title: `Test S01E${i + 1}`, seriesId: 'test' });
    assert.ok(context.v2Recent(channel).includes('watched'), 'new OK profiles retain more than the old 24/48-item history');
    const raceItems = [pending, { id: 'other' }];
    let finishPlayer, rejected = 0;
    const race = { token: 1, V2_PREVIEW_PROFILES: { black: { name: channel } }, v2PreviewState: { 596: { items: raceItems, cursor: 0 } },
      V2_SOURCE_READY_BUFFER: 5, v2PreviewInflight: { [channel]: true }, v2FreshCursor() {}, v2Reject() { rejected++; },
      playV2Embed: () => new Promise(resolve => { finishPlayer = resolve; }), window: {} };
    for(const name of ['v2SourceProgramAllowed','v2PruneSourcePrograms','v2CanPrepareYouTube'])vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),race);
    vm.runInNewContext(html.slice(html.indexOf('async function tuneV2Preview('), html.indexOf('function v2TuneRefreshed(')), race);
    pending.type = 'embed'; pending.provider = 'OK.ru';
    const tune = race.tuneV2Preview({ num: 596, previewKey: 'black' }, {}, 1);
    race.token = 2; finishPlayer(false); await tune;
    assert.equal(rejected, 0, `${file}: a cancelled tune must not reject the newly selected shelf`);
    assert.equal(raceItems.length, 2);
  }
  console.log('Curated OK TV verification passed: family identity, canonical freshness, stable shelves and cancelled-tune isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
