#!/usr/bin/env node
/* Regression contract for the server-side IA deep-harvest path. This is a
 * source-level guard because the live Archive catalog is intentionally dynamic
 * and should not be hard-coded into CI. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const relay = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8');
const failures = [];
function check(ok, message) {
  console.log(`${message}: ${ok ? 'ok' : 'FAILED'}`);
  if (!ok) failures.push(message);
}

check(/IA_QUEUE_CACHE_VERSION\s*=\s*"v108"/.test(relay), 'deep harvest invalidates the prior queue namespace');
check(/IA_STRICT_CATALOG_CANDIDATE_MAX\s*=\s*96/.test(relay) && /IA_CATALOG_CANDIDATE_MAX\s*=\s*72/.test(relay), 'every IA lane receives a larger rolling catalog budget');
check(/IA_FRESHNESS_CANDIDATE_FLOOR\s*=\s*24/.test(relay) && /IA_FRESHNESS_LEDGER_MAX\s*=\s*32/.test(relay), 'freshness history is large enough to cover several shelves');
check(/IA_BACKGROUND_COLLECTION_EPISODES_PER_PARENT\s*=\s*10/.test(relay) && /IA_BACKGROUND_CONTAINER_EXPANSIONS\s*=\s*6/.test(relay), 'container harvesting covers multiple parents and episode positions');
check(/IA_MAX_EXPANDED_FILES\s*=\s*720/.test(relay) && /sampleArchiveSequence\(rotatedPlayable, IA_MAX_EXPANDED_FILES\)/.test(relay), 'large complete-series manifests are sampled instead of discarded');
check(/background\s*\?\s*\(iaDepthRecoveryEnabled\(channel\) \? 18 : 12\)/.test(relay), 'background rotations sample a deep deterministic Archive page window');
check(/const rows = firstApprovedLane \? 36 : 60/.test(relay), 'background searches request a wider result page without slowing first tune');
check(/IA_DEPTH_PLAYABLE_TARGET\s*=\s*36/.test(relay) && /IA_BACKGROUND_PLAYABLE_TARGET\s*=\s*24/.test(relay), 'playable depth is measured separately from the five-item on-air shelf');
check(/catalogVersion: IA_CATALOG_BUDGET_VERSION/.test(relay) && /episodeDepth: queueEpisodeDepth\(deepHydrated\)/.test(relay), 'deep catalog depth is published for guide and telemetry consumers');
check(/for \(let row = 0; row < IA_BACKGROUND_COLLECTION_EPISODES_PER_PARENT/.test(relay), 'expanded files are interleaved across parent collections');
check(/const rotationRefreshLimit = firstApprovedLane && Number\(rotation\) > 0/.test(relay) && /iaDepthRecoveryEnabled\(channel\) \? 4 : 2/.test(relay), 'later rotations widen discovery without slowing the first tune');
check(/const rotationQueries = rotation > 0/.test(relay) && /const fastQueries = rotationQueries\.slice\(0, fastLaneCount\)/.test(relay), 'later rotations prioritize a fresh Archive rail instead of reordering one shallow shelf');
check(/memoryNeedsFreshRotation/.test(relay) && /iaShouldBypassShallowRotation\(cachedPayload, rotation/.test(relay), 'shallow exact caches cannot mask a later fresh rotation');
check(/function safeMinRuntimeSeconds\(/.test(relay) && /function iaRuntimeAllowed\(/.test(relay) && /minRuntimeSeconds/.test(relay), 'runtime floors are enforced before short Archive clips reach first play');
check(/Number\(rotation\) > 0 \|\| iaDepthRecoveryEnabled\(channel\)/.test(relay), 'later rotations collect supplemental Archive rails within the bounded grace window');
check(/const expandedEpisode = item && rawIdentifier\.includes\("::"\)/.test(relay) && /rawIdentifier\.split\("::"\)\[0\]/.test(relay), 'expanded episode records can re-open their parent container for sibling harvesting');
check(/"704": \[/.test(relay) && /HowTheGrinchStoleChristmas_201812/.test(relay) && /"705": \[/.test(relay) && /halloween-cartoon-collection_20231022/.test(relay) && /"706": \[/.test(relay) && /garfieldsthanksgiving/.test(relay), 'holiday animation stations have verified Archive recovery rails');
check(/"158": \[[\s\S]*spider-mantheanimatedseries[\s\S]*DragonTalesTVSeries[\s\S]*powerpuff-girls-complete-series/.test(relay), 'Saturday Morning recovery rotates across multiple animated series instead of one Pingu shelf');

if (failures.length) {
  console.error(`IA deep-harvesting contract failed: ${failures.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log('IA deep-harvesting contract passed.');
}
