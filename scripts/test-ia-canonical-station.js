#!/usr/bin/env node
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const station = await import(pathToFileURL(path.join(__dirname, '..', 'ia_canonical_station.mjs')));
  const { IA_CANONICAL_PILOT_PROFILES, buildCanonicalManifest, canonicalGuide, selectCanonicalItems } = station;
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
  assert.equal(guide.current.programId, manifest.items[0].programId);
  assert.equal(guide.next.programId, manifest.items[1].programId);
  console.log('IA canonical station contract passed: filtering, runtime validation, freshness exhaustion, and guide data.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
