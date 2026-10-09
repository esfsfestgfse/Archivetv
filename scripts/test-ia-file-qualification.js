const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
function relay(metadata = {}, mediaStatus = 206) {
  const sandbox = { console, URL, URLSearchParams, Request, Response, Headers, AbortController, AbortSignal,
    TextEncoder, TextDecoder, Date, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    caches: { default: { match: async () => undefined, put: async () => {} } },
    fetch: async url => {
      if (/archive\.org\/metadata\//.test(String(url))) return Response.json(metadata);
      assert.match(String(url), /archive\.org\/download\//);
      return new Response('x', { status: mediaStatus, headers: { 'content-type': 'video/mp4' } });
    } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8').replace('export default', 'const worker =') +
    '\nglobalThis.contract={iaRuntimeAllowed, iaStationQualityGate, queuePlayable, iaPlayableIdentity, hydrateIaQueue};', sandbox);
  return sandbox.contract;
}
const verified = { identifier: 'series::episode.mp4', sourceIdentifier: 'series', title: 'Family sitcom episode',
  language: 'eng', media: { type: 'video', url: 'https://archive.org/download/series/episode.mp4',
    runtime: 1320, width: 640, height: 480, verifiedAt: Date.now(), verification: 'transport' } };

test('the selected child runtime overrides the longer parent runtime', () => {
  assert.equal(relay().iaRuntimeAllowed({ runtime: 1800, media: { type: 'video', runtime: 120 } }, 900), false);
});
test('missing explicit episode must not silently substitute the first file', async () => {
  const f = relay({ metadata: { language: 'eng' }, files: [{ name: 'other.mp4', format: 'h.264', length: 1320, width: 640, height: 480 }] });
  assert.equal(await f.queuePlayable('series::missing.mp4', 'https://relay.invalid', null, ['movies']), null);
});
test('file hydration carries exact source, runtime, geometry, language and provenance', async () => {
  const f = relay({ metadata: { language: 'eng', licenseurl: 'https://creativecommons.org/licenses/by/4.0/' },
    files: [{ name: 'episode.mp4', format: 'h.264', length: 1320, width: 640, height: 480 }] });
  const media = await f.queuePlayable('series::episode.mp4', 'https://relay.invalid', null, ['movies']);
  assert.equal(media.runtime, 1320); assert.equal(media.fileName, 'episode.mp4');
  assert.equal(media.sourceIdentifier, 'series'); assert.equal(media.language, 'eng');
  assert.equal(media.sourceUrl, 'https://archive.org/details/series');
  assert.match(media.rights, /creativecommons/); assert.ok(media.metadataVerifiedAt > 0);
});
test('TV qualification rejects known portraits, unresolved metadata, shorts and stale/failed verification', async () => {
  const { catalogFallbackAllowed } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const rules = { iaRepair: true, channel: '10', minRuntimeSeconds: 900, mediaTypes: ['movies'] };
  assert.equal(catalogFallbackAllowed(verified, rules), true);
  for (const media of [
    { ...verified.media, width: 480, height: 640 },
    { ...verified.media, width: 0, height: 0 },
    { ...verified.media, runtime: 120 },
    { ...verified.media, runtime: 0 },
    { ...verified.media, verifiedAt: Date.now() - 2 * 86400_000 },
    { ...verified.media, verification: 'failed' },
  ]) assert.equal(catalogFallbackAllowed({ ...verified, runtime: 1800, media }, rules), false);
  assert.equal(catalogFallbackAllowed({ ...verified, language: 'jpn' }, rules), false);
  assert.equal(catalogFallbackAllowed({ ...verified, language: 'jpn', media: { ...verified.media, runtime: 4000 } }, { ...rules, channel: '106' }), true, 'international stations keep their language contract');
  assert.equal(catalogFallbackAllowed({ identifier: 'radio', media: { type: 'audio', url: 'https://archive.org/download/radio/program.mp3' } }, { ...rules, channel: '920', mediaTypes: ['audio'] }), true);
});
test('strict hot-shelf hydration performs transport validation and preserves enriched candidates', async () => {
  const metadata = { metadata: { language: 'eng' }, files: [{ name: 'episode.mp4', format: 'h.264', length: 1320, width: 640, height: 480 }] };
  const ctx = { iaRepair: true, waitUntil: promise => promise };
  const candidate = { identifier: 'series::episode.mp4', title: 'Full sitcom episode' };
  const good = await relay(metadata).hydrateIaQueue({ candidateItems: [candidate], minRuntimeSeconds: 900 }, 1, 'https://relay.invalid', ctx, ['movies']);
  assert.equal(good.ready, 1); assert.equal(good.items[0].media.verification, 'transport');
  assert.ok(good.items[0].media.verifiedAt > 0);
  assert.equal(good.candidateItems[0].media.runtime, 1320);
  const dead = await relay(metadata, 403).hydrateIaQueue({ candidateItems: [candidate], minRuntimeSeconds: 900 }, 1, 'https://relay.invalid', ctx, ['movies']);
  assert.equal(dead.ready, 0, 'metadata or a plausible URL does not prove a playable transport');
});
test('confirmed editorial contamination is rejected without blocking genuine cooking or court TV', () => {
  const f = relay();
  for (const [channel, title, subject] of [
    ['201', 'Office Etiquette', 'secretarial office relations'],
    ['20', 'Judge Roy Bean: Letty Leaves Home', '1956 fictional television western'],
    ['707', 'Christmas Night (1933)', 'Little King cartoon animation'],
    ['19', '6 characters read to Happy Days', 'fan made character reading'],
  ]) assert.equal(f.iaStationQualityGate(channel, { title, subject }), false, channel + ': ' + title);
  assert.equal(f.iaStationQualityGate('201', { title: 'The French Chef with Julia Child', subject: 'cooking food' }), true);
  assert.equal(f.iaStationQualityGate('20', { title: 'Judge Judy episode', subject: 'small claims courtroom television' }), true);
});
test('D1 compaction preserves selected-file qualification instead of erasing duration and geometry', async () => {
  const { compactCatalogItem } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const record = compactCatalogItem(verified);
  assert.equal(record.duration, 1320); assert.equal(record.aspectRatio, 640 / 480);
  assert.equal(record.width, 640); assert.equal(record.height, 480);
  assert.equal(record.fileName, 'episode.mp4'); assert.equal(record.sourceIdentifier, 'series');
  assert.equal(record.sourceUrl, 'https://archive.org/details/series'); assert.equal(record.language, 'eng');
});
test('canonical manifest does not label portrait or failed media verified', async () => {
  const { normalizeCanonicalItem, canonicalItemAccepted, IA_CANONICAL_PILOT_PROFILES } = await import(pathToFileURL(path.join(root, 'ia_canonical_station.mjs')));
  const profile = IA_CANONICAL_PILOT_PROFILES['classic-tv'];
  const base = { archiveId: 'tv', file: 'episode.mp4', title: 'Leave It to Beaver Full Episode', year: 1960,
    runtimeSeconds: 1320, subject: 'television sitcom episode', mediaUrl: 'https://archive.org/download/tv/episode.mp4' };
  assert.equal(canonicalItemAccepted(normalizeCanonicalItem(base, profile), profile), true);
  assert.equal(normalizeCanonicalItem(base, profile).playability, 'metadata-only');
  const selected = normalizeCanonicalItem({ ...base, file: undefined, mediaUrl: undefined, ...verified, year: 1960 }, profile);
  assert.equal(selected.file, 'episode.mp4');
  assert.equal(selected.media.width, 640);
  assert.equal(selected.media.verification, 'transport');
  assert.equal(canonicalItemAccepted(normalizeCanonicalItem({ ...base, width: 480, height: 640 }, profile), profile), false);
  assert.equal(canonicalItemAccepted(normalizeCanonicalItem({ ...base, playability: 'failed' }, profile), profile), false);
});
test('alternate encodings do not inflate canonical episode depth', async () => {
  const { buildCanonicalManifest, IA_CANONICAL_PILOT_PROFILES } = await import(pathToFileURL(path.join(root, 'ia_canonical_station.mjs')));
  const base = { archiveId: 'beaver', title: 'Leave It to Beaver television sitcom episode', year: 1960, runtimeSeconds: 1320 };
  const manifest = buildCanonicalManifest(IA_CANONICAL_PILOT_PROFILES['classic-tv'], [
    { ...base, file: 'episode.mp4', mediaUrl: 'https://archive.org/download/beaver/episode.mp4' },
    { ...base, file: 'episode_512kb.mp4', mediaUrl: 'https://archive.org/download/beaver/episode_512kb.mp4' },
  ]);
  assert.equal(manifest.catalogDepth, 1);
});

test('strict file shelves are isolated without invalidating legacy cache identities', () => {
  const source = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8');
  const section = source.slice(source.indexOf('  const fileContract ='), source.indexOf('  const digest = await stableKey(fingerprint);'));
  const args = { channel: '10', queries: ['tv'], themeTerms: [], denyTerms: [], requiredTitleTerms: [], mediaTypes: ['movies'], themeMinScore: 1, minRuntimeSeconds: 900, diversity: {}, count: 3, rotation: 0, IA_GLOBAL_VIDEO_POLICY_VERSION: 'policy', IA_CATALOG_BUDGET_VERSION: 'budget', stableKey: async value => value };
  const run = body => vm.runInNewContext('(async()=>{' + section + ';return {familyFingerprint,fingerprint};})()', { ...args, body });
  return Promise.all([run({}), run({ iaRepair: true })]).then(([legacy, strict]) => {
    assert.equal(Object.hasOwn(JSON.parse(legacy.familyFingerprint), 'fileContract'), false);
    assert.equal(Object.hasOwn(JSON.parse(legacy.fingerprint), 'fileContract'), false);
    assert.equal(JSON.parse(strict.familyFingerprint).fileContract, 'ia-file-1');
    assert.notEqual(strict.fingerprint, legacy.fingerprint);
  });
});
