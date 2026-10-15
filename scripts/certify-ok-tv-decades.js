#!/usr/bin/env node
'use strict';

const profiles = [
  { profileKey: 'ok-tv-1980s', decade: 1980 },
  { profileKey: 'ok-tv-1990s', decade: 1990 },
  { profileKey: 'ok-tv-2000s', decade: 2000 },
];
const args = process.argv.slice(2);
const valueFor = (name) => {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};
const baseUrl = String(valueFor('--base-url') || '').replace(/\/$/, '');
if (!baseUrl) {
  console.error('Usage: node scripts/certify-ok-tv-decades.js --base-url https://worker.example/api/v3');
  process.exit(2);
}

const blockedText = /\b(?:podcast|fan[ -]?(?:film|movie|made)|parody|reaction|trailer|teaser|vertical|shorts?)\b/i;
const providerKey = (value) => String(value || '').toLowerCase().includes('ok') ? 'ok' : String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const itemId = (item) => String(item && (item.id || item.identifier || item.sourceIdentifier) || '');
const seriesId = (item) => String(item && (item.seriesId || item.seriesTitle) || '');
const blockedItem = (item) => {
  const duration = Number(item && (item.duration || item.runtime || item.duration_seconds)) || 0;
  const ratio = Number(item && item.aspectRatio) || 0;
  const mediaUrl = String(item && (item.url || item.embedUrl || item.mediaUrl || item.media?.url) || '');
  return duration < 900 || (ratio > 0 && ratio <= 1) || !mediaUrl || blockedText.test(`${item && item.title || ''} ${item && item.description || ''}`);
};
const cachedResponseTimeMs = (rows) => {
  const values = rows.map((row) => Number(row.responseTimeMs) || 0).sort((a, b) => a - b);
  if (!values.length) return Infinity;
  return values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)];
};

async function requestJson(url, options) {
  const started = performance.now();
  const response = await fetch(url, options);
  const responseTimeMs = Math.round(performance.now() - started);
  let payload;
  try { payload = await response.json(); }
  catch (_) { payload = { error: `non-JSON response (${response.status})` }; }
  return { response, payload, responseTimeMs };
}

async function certify({ profileKey, decade }) {
  const endpoint = `${baseUrl}/source/catalog`;
  const headers = { 'content-type': 'application/json', 'x-realsignal-client': 'ok-decade-certifier' };
  const played = new Set();
  const playedSeries = [];
  const series = new Set();
  const snapshots = [];
  let exactRepeats = 0;
  let wrongDecadeCount = 0;
  let blockedFormatCount = 0;
  let cooldownViolations = 0;
  let playableEpisodes = 0;
  let readyDepth = Infinity;
  let readySeriesDepth = Infinity;

  for (let rotation = 0; rotation <= 15; rotation += 1) {
    const recentIds = Array.from(played).slice(-256);
    const playedIds = rotation && snapshots.length ? [itemId(snapshots.at(-1).items[0])] : [];
    const result = await requestJson(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify({ profileKey, count: 5, minimumReady: 5, staleReady: 2, rotation, recentIds, recentSeries: playedSeries.slice(0, 24), playedIds }),
    });
    const items = Array.isArray(result.payload.items) ? result.payload.items : [];
    snapshots.push({ status: result.response.status, responseTimeMs: result.responseTimeMs, payload: result.payload, items });
    const payload = result.payload;
    playableEpisodes = Math.max(playableEpisodes, Number(payload.playableCatalogDepth ?? payload.catalogDepth) || items.length);
    readyDepth = Math.min(readyDepth, items.length);
    readySeriesDepth = Math.min(readySeriesDepth, new Set(items.map(seriesId).filter(Boolean)).size);
    const cooled = new Set((result.payload.providerAvailability?.cooldownProviders || []).map(providerKey));
    for (const item of items) {
      const id = itemId(item);
      if (Number(item.seriesDecade) !== decade) wrongDecadeCount += 1;
      if (blockedItem(item)) blockedFormatCount += 1;
      if (cooled.has(providerKey(item.provider))) cooldownViolations += 1;
      const identity = seriesId(item);
      if (identity) series.add(identity);
    }
    const selectedId = itemId(items[0]);
    const selectedSeries = seriesId(items[0]);
    if (selectedId && played.has(selectedId) && played.size < playableEpisodes) exactRepeats += 1;
    if (selectedId) played.add(selectedId);
    if (selectedSeries) {
      const existing = playedSeries.indexOf(selectedSeries);
      if (existing >= 0) playedSeries.splice(existing, 1);
      playedSeries.unshift(selectedSeries);
    }
  }

  const parityPlayback = await requestJson(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({ profileKey, count: 5, minimumReady: 5, staleReady: 2, rotation: 0, recentIds: [] }),
  });
  const guide = await requestJson(`${baseUrl}/guide?channel=${encodeURIComponent(profileKey)}&limit=5`, { headers: { 'x-realsignal-client': 'ok-decade-certifier' } });
  const guideItems = Array.isArray(guide.payload.items) ? guide.payload.items : [];
  const playbackIds = (Array.isArray(parityPlayback.payload.items) ? parityPlayback.payload.items : []).map(itemId);
  const guideIds = guideItems.map(itemId);
  const guideMismatchCount = Math.max(playbackIds.length, guideIds.length) - playbackIds.filter((id, index) => id && guideIds[index] === id).length;
  const responseTimeMs = cachedResponseTimeMs(snapshots.slice(1));
  const minimumSeries = decade === 1980 ? 10 : 12;
  const reasons = [];
  if (snapshots.some((row) => row.status !== 200)) reasons.push('catalog request failed');
  if (series.size < minimumSeries) reasons.push(`distinct series ${series.size} < ${minimumSeries}`);
  if (playableEpisodes < 60) reasons.push(`playable episodes ${playableEpisodes} < 60`);
  if (readyDepth < 5) reasons.push(`ready depth ${readyDepth} < 5`);
  if (readySeriesDepth < 5) reasons.push(`ready series ${readySeriesDepth} < 5`);
  if (responseTimeMs >= 500) reasons.push(`cached response ${responseTimeMs}ms >= 500ms`);
  if (wrongDecadeCount) reasons.push(`${wrongDecadeCount} wrong-decade rows`);
  if (blockedFormatCount) reasons.push(`${blockedFormatCount} blocked-format rows`);
  if (exactRepeats) reasons.push(`${exactRepeats} premature exact repeats`);
  if (cooldownViolations) reasons.push(`${cooldownViolations} cooldown violations`);
  if (guide.response.status !== 200 || guideMismatchCount) reasons.push(`${guideMismatchCount || 1} guide mismatches`);
  return {
    profileKey,
    distinctSeries: series.size,
    playableEpisodes,
    readyDepth: Number.isFinite(readyDepth) ? readyDepth : 0,
    responseTimeMs,
    wrongDecadeCount,
    blockedFormatCount,
    exactRepeats,
    cooldownViolations,
    guideMismatchCount,
    nextOperations: 15,
    pass: reasons.length === 0,
    reasons,
  };
}

(async () => {
  const health = await requestJson(`${baseUrl}/health`, { headers: { 'x-realsignal-client': 'ok-decade-certifier' } });
  if (health.response.status !== 200) throw new Error(`API health failed: ${health.response.status}`);
  const results = [];
  for (const profile of profiles) results.push(await certify(profile));
  const report = { baseUrl, checkedAt: new Date().toISOString(), release: health.payload.release || null, results, pass: results.every((row) => row.pass) };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
})().catch((error) => {
  console.error(JSON.stringify({ baseUrl, pass: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
