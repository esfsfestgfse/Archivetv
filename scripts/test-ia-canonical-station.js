#!/usr/bin/env node
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const station = await import(pathToFileURL(path.join(__dirname, '..', 'ia_canonical_station.mjs')));
  const {
    IA_CANONICAL_PILOT_PROFILES,
    buildCanonicalManifest,
    canonicalGuide,
    canonicalPromotionEligibility,
    normalizeCanonicalItem,
    selectCanonicalItems,
  } = station;
  const profile = IA_CANONICAL_PILOT_PROFILES['classic-cartoons'];
  const raw = [
    { archiveId: 'cartoon-a', file: 'a.mp4', title: 'Popeye Cartoon Episode', year: 1942, runtimeSeconds: 900, collection: 'classic_cartoons', mediaUrl: 'https://archive.org/download/cartoon-a/a.mp4' },
    { archiveId: 'cartoon-b', file: 'b.mp4', title: 'Tom and Jerry Cartoon', year: 1952, runtimeSeconds: 720, collection: 'classic_cartoons', mediaUrl: 'https://archive.org/download/cartoon-b/b.mp4' },
    { archiveId: 'cartoon-c', file: 'c.mp4', title: 'Animation History Documentary', year: 1955, runtimeSeconds: 1800, collection: 'classic_cartoons', mediaUrl: 'https://archive.org/download/cartoon-c/c.mp4' },
    { archiveId: 'cartoon-d', file: 'd.mp4', title: 'Woody Woodpecker Cartoon', year: 1960, runtimeSeconds: 850, collection: 'animationandcartoons', mediaUrl: 'https://archive.org/download/cartoon-d/d.mp4' },
  ];
  const manifest = buildCanonicalManifest(profile, raw, '2026-09-25T00:00:00.000Z');
  assert.equal(manifest.schemaVersion, 'ia-canonical-1');
  assert.equal(manifest.catalogDepth, 3, 'documentary contamination must be rejected');
  assert.ok(manifest.items.every((item) => item.mediaUrl.startsWith('https://archive.org/')));
  const first = selectCanonicalItems(manifest, [], 2, 0);
  assert.equal(first.items.length, 2);
  const second = selectCanonicalItems(manifest, first.items.map((item) => item.programId), 2, 0);
  assert.equal(second.items.length, 1, 'freshness should not invent a duplicate');
  const exhausted = selectCanonicalItems(manifest, manifest.items.map((item) => item.programId), 2, 0);
  assert.equal(exhausted.catalogExhausted, true);
  assert.equal(exhausted.repeatAllowed, true);
  const guide = canonicalGuide(manifest, [], 3);
  const guideSelection = selectCanonicalItems(manifest, [], 3, 0);
  assert.equal(guide.current.programId, guideSelection.items[0].programId, 'guide must reflect the balanced queue order');
  assert.equal(guide.next.programId, guideSelection.items[1].programId, 'guide next must reflect the balanced queue order');

  const promotionProfile = { ...profile, minCatalog: 5, maxPerFamily: 2, maxPerCollection: 2 };
  const promotionCandidates = [
    { archiveId: 'popeye', file: 'episode-1.mp4', title: 'Popeye Cartoon Episode 1', seriesTitle: 'Popeye', year: 1942, runtimeSeconds: 900, collection: 'popeye_collection', mediaUrl: 'https://archive.org/download/popeye/episode-1.mp4' },
    { archiveId: 'tom-jerry', file: 'episode-1.mp4', title: 'Tom and Jerry Cartoon Episode 1', seriesTitle: 'Tom and Jerry', year: 1952, runtimeSeconds: 900, collection: 'tom_jerry_collection', mediaUrl: 'https://archive.org/download/tom-jerry/episode-1.mp4' },
    { archiveId: 'woody', file: 'episode-1.mp4', title: 'Woody Woodpecker Cartoon Episode 1', seriesTitle: 'Woody Woodpecker', year: 1960, runtimeSeconds: 900, collection: 'woody_collection', mediaUrl: 'https://archive.org/download/woody/episode-1.mp4' },
    { archiveId: 'bugs', file: 'episode-1.mp4', title: 'Bugs Bunny Cartoon Episode 1', seriesTitle: 'Bugs Bunny', year: 1968, runtimeSeconds: 900, collection: 'bugs_collection', mediaUrl: 'https://archive.org/download/bugs/episode-1.mp4' },
    { archiveId: 'fleischer', file: 'episode-1.mp4', title: 'Fleischer Cartoon Episode 1', seriesTitle: 'Fleischer', year: 1938, runtimeSeconds: 900, collection: 'fleischer_collection', mediaUrl: 'https://archive.org/download/fleischer/episode-1.mp4' },
  ];
  const promotion = canonicalPromotionEligibility(promotionProfile, promotionCandidates);
  assert.equal(promotion.eligible, true, 'a balanced five-item shelf should qualify');
  assert.equal(promotion.readyDepth, 5);
  assert.equal(promotion.distinctFamilies, 5);

  const underfilled = canonicalPromotionEligibility(promotionProfile, promotionCandidates.slice(0, 4));
  assert.equal(underfilled.eligible, false);
  assert.ok(underfilled.reasons.includes('catalog-underfilled'));
  assert.ok(underfilled.reasons.includes('ready-shelf-underfilled'));

  const portrait = canonicalPromotionEligibility(promotionProfile, [...promotionCandidates, {
    archiveId: 'portrait-cartoon', file: 'portrait.mp4', title: 'Portrait Cartoon', year: 1955, runtimeSeconds: 900,
    collection: 'portrait_collection', mediaUrl: 'https://archive.org/download/portrait-cartoon/portrait.mp4', aspectRatio: 0.75,
  }]);
  assert.equal(portrait.eligible, true, 'forbidden candidates cannot inflate catalog depth');
  assert.equal(portrait.forbiddenCount, 1);

  const oneFamily = canonicalPromotionEligibility(promotionProfile, promotionCandidates.map((candidate, index) => ({
    ...candidate,
    archiveId: `same-family-${index}`,
    file: `episode-${index}.mp4`,
    seriesTitle: 'Popeye',
    collection: `different_collection_${index}`,
  })));
  assert.equal(oneFamily.eligible, false);
  assert.ok(oneFamily.reasons.includes('family-cap-exceeded'));

  const oneDecade = canonicalPromotionEligibility({ ...promotionProfile, minDecades: 3, maxDecadeShare: 0.5 }, promotionCandidates.map((candidate, index) => ({
    ...candidate,
    archiveId: `same-decade-${index}`,
    file: `episode-${index}.mp4`,
    seriesTitle: `Cartoon ${index}`,
    collection: `collection_${index}`,
    year: 1942,
  })));
  assert.equal(oneDecade.eligible, false);
  assert.ok(oneDecade.reasons.includes('decade-diversity-underfilled'));
  assert.ok(oneDecade.reasons.includes('decade-balance-exceeded'));

  const balanceProfile = { ...promotionProfile, targetCatalog: 7, minCatalog: 5, maxPerFamily: 3, maxPerCollection: 2 };
  const fileLevelCandidates = [
    { archiveId: 'popeye-complete-series', file: 'popeye-s01e01.mp4', title: 'Popeye Cartoon Episode 1', seriesTitle: 'Popeye', year: 1942, runtimeSeconds: 900, collection: 'popeye_complete_series', mediaUrl: 'https://archive.org/download/popeye-complete-series/popeye-s01e01.mp4' },
    { archiveId: 'popeye-complete-series', file: 'popeye-s01e02.mp4', title: 'Popeye Cartoon Episode 2', seriesTitle: 'Popeye', year: 1942, runtimeSeconds: 900, collection: 'popeye_complete_series', mediaUrl: 'https://archive.org/download/popeye-complete-series/popeye-s01e02.mp4' },
    { archiveId: 'popeye-complete-series', file: 'popeye-s01e03.mp4', title: 'Popeye Cartoon Episode 3', seriesTitle: 'Popeye', year: 1942, runtimeSeconds: 900, collection: 'popeye_complete_series', mediaUrl: 'https://archive.org/download/popeye-complete-series/popeye-s01e03.mp4' },
    { archiveId: 'tom-jerry-complete', file: 'tom-jerry-s01e01.mp4', title: 'Tom and Jerry Cartoon Episode', seriesTitle: 'Tom and Jerry', year: 1952, runtimeSeconds: 900, collection: 'tom_jerry_complete', mediaUrl: 'https://archive.org/download/tom-jerry-complete/tom-jerry-s01e01.mp4' },
    { archiveId: 'woody-complete', file: 'woody-s01e01.mp4', title: 'Woody Woodpecker Cartoon Episode', seriesTitle: 'Woody Woodpecker', year: 1960, runtimeSeconds: 900, collection: 'woody_complete', mediaUrl: 'https://archive.org/download/woody-complete/woody-s01e01.mp4' },
    { archiveId: 'bugs-complete', file: 'bugs-s01e01.mp4', title: 'Bugs Bunny Cartoon Episode', seriesTitle: 'Bugs Bunny', year: 1968, runtimeSeconds: 900, collection: 'bugs_complete', mediaUrl: 'https://archive.org/download/bugs-complete/bugs-s01e01.mp4' },
    { archiveId: 'fleischer-complete', file: 'fleischer-s01e01.mp4', title: 'Fleischer Cartoon Episode', seriesTitle: 'Fleischer', year: 1938, runtimeSeconds: 900, collection: 'fleischer_complete', mediaUrl: 'https://archive.org/download/fleischer-complete/fleischer-s01e01.mp4' },
  ];
  const balancedManifest = buildCanonicalManifest(balanceProfile, fileLevelCandidates, '2026-10-16T00:00:00.000Z');
  assert.equal(new Set(balancedManifest.items.map((item) => item.programId)).size, balancedManifest.catalogDepth, 'episode files must retain distinct program IDs');
  assert.ok(balancedManifest.items.filter((item) => item.archiveId === 'popeye-complete-series').length <= 2, 'a complete-series upload cannot exceed its collection cap');
  assert.ok(balancedManifest.items.length < balanceProfile.targetCatalog, 'a shallow catalog should underfill rather than relax collection caps');

  const familyFlood = [
    ...Array.from({ length: 5 }, (_, index) => ({
      ...promotionCandidates[0], archiveId: `popeye-flood-${index}`, file: `popeye-${index}.mp4`, title: `Popeye Cartoon Episode ${index}`, seriesTitle: 'Popeye', collection: `popeye_collection_${index}`,
    })),
    promotionCandidates[1],
    promotionCandidates[2],
  ].map((item) => normalizeCanonicalItem(item, promotionProfile));
  const balancedShelf = selectCanonicalItems({ items: familyFlood, rules: { maxPerFamily: 3, maxPerCollection: 3 } }, [], 5, 0);
  assert.ok(new Set(balancedShelf.items.map((item) => item.familyKey)).size >= 3, 'a promotable catalog must open with at least three program families when available');
  console.log('IA canonical station contract passed: filtering, runtime validation, freshness exhaustion, and guide data.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
