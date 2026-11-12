import { qualifyIaFileRecord } from './ia_file_contract.js';
import { familyId } from './realsignal_api_rotation.js';
import Sports from './assets/sports-programs.js';
import { broadcastSourceCooling, broadcastSourceType } from './broadcast_source_catalog.mjs';

const hour = 3_600_000;
export const broadcastProofMs = 24 * hour;
const breakMs = 20_000;
const cartoonBlockMs = 25 * 60_000;
const classicSeries = new RegExp('^(?:the )?(?:' + [
  '13 queens boulevard', '9 to 5', 'addams family', 'adventures of sherlock holmes', 'alfred hitchcock presents',
  'all s fair', 'amen', 'andy griffith show', 'angie', 'anything but love', 'are you being served', 'baby i m back',
  'benny hill show', 'benson', 'beverly hillbillies', 'bewitched', 'bonanza', 'buick berle show', 'burns and allen',
  'c p o sharkey', 'checking in', 'coming of age', 'dick van dyke show', 'dragnet', 'dusty s trail', 'ed sullivan show',
  'f troop', 'george burns and gracie allen', 'get smart', 'gomer pyle', 'green acres', 'hogan s heroes', 'honeymooners',
  'i dream of jeannie', 'i love lucy', 'jack benny (?:program|show|tv show)', 'jackie gleason show', 'leave it to beaver',
  'lone ranger', 'lost honeymooners', 'lucy show', 'mary tyler moore show', 'mister ed', 'mr ed', 'munsters',
  'night gallery', 'one step beyond', 'outer limits', 'petticoat junction', 'phil silvers show', 'red skelton show',
  'sgt bilko', 'sherlock holmes', 'smothers brothers comedy hour', 'texaco star theatre', 'twilight zone'
].join('|') + ')(?: |$)');

// These specific files carry episode or guest names instead of the series title.
const classicFilesBySource = new Map([
  ['1-2-the-clampetts-strike-oil-extended', /^1 - The Clampetts Strike Oil(?:\.ia)?\.mp4$/i],
  ['19660912S5Ep01LucyWithGeorgeBurns', /^1966-09-12-s5-ep01-Lucy-with-George-Burns\.mp4$/i],
  ['1973-01-17-jack.-benny-rich.-little-dylana.-jenson-dick.-barlow-roger.-pida', /^1973-01-17_Jack\.Benny_Rich\.Little_Dylana\.Jenson_Dick\.Barlow_Roger\.Pida(?:\.ia)?\.mp4$/i]
]);

function classicTvIdentity(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/^(?:(?:19\d{2}|\d{2})(?: \d{1,2} \d{1,2})? |(?:episode of|episode \d+|tv episode) )+/, '');
}

function programAllowed(item, channel) {
  if (channel !== '10') return true;
  if (item.sourceIdentifier === '1974-pray-for-the-wildcats') return false;
  const title = String(item.title || '').split(/\s+[·—]\s+/)[0];
  const file = String(item.fileName || '').split('/').at(-1);
  const identity = classicTvIdentity(title);
  const selected = classicTvIdentity(file);
  const offGenre = /\b(?:ufo conference|mufon|softball game|assembly update|guest vj|feature film|full movie|video essay|retrospective)\b/;
  if (offGenre.test(identity) || offGenre.test(selected)) return false;
  if (classicFilesBySource.get(item.sourceIdentifier)?.test(file) || classicSeries.test(identity) || classicSeries.test(selected) ||
      /^nick (?:at )?nite\b.*\bblock\b/.test(identity)) return true;
  const episode = /\bs\s*\d+\s*e\s*\d+\b|\b(?:episode|ep)\s*\d+\b/i;
  const format = /\b(?:sitcom|television (?:episode|series|drama)|tv (?:episode|series)|anthology series)\b/i;
  return format.test(title) || (episode.test(item.title + ' ' + file) && format.test(String(item.subject || '')));
}

export function firstRejectedBroadcastSlot(previous, now, rules = {}) {
  if (rules.sourceCatalog && previous?.slots) {
    const eligible = new Set(previous.catalog.filter(item => broadcastSourceType(item) &&
      !broadcastSourceCooling(item, rules.cooledProviders)).map(item => item.logicalId));
    return previous.slots.findIndex(slot => slot.endsAt > now && slot.kind === 'program' &&
      !eligible.has(slot.logicalId));
  }
  if (previous?.channel !== '10') return -1;
  const allowed = new Set(previous.catalog.filter(item => programAllowed(item, '10')).map(item => item.logicalId));
  return previous.slots.findIndex(slot => slot.endsAt > now && slot.kind === 'program' && !allowed.has(slot.logicalId));
}

function measureDepth(items) {
  return {
    episodes: items.length,
    families: new Set(items.map(item => item.broadcastFamily)).size,
    hours: items.reduce((total, item) => total + item.runtimeSeconds / 3600, 0)
  };
}

function trustedArchiveMedia(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /(^|\.)archive\.org$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

function containsCommercials(item) {
  if (typeof item.containsCommercials === 'boolean') return item.containsCommercials;
  return /\b(?:with (?:original )?(?:commercials|ads)|w\s*\/\s*commercials)\b/i.test(
    [item.title, item.fileName].filter(Boolean).join(' '));
}

export function collectBroadcastCatalog({ rules, candidates, now = Date.now(), previous }) {
  const channel = String(rules.channel);
  const mediaType = rules.mediaTypes?.[0] === 'audio' ? 'audio' : 'video';
  const savedCatalog = previous?.catalog || [];
  const eligibleSaved = savedCatalog.filter(item => rules.sourceCatalog
    ? broadcastSourceType(item) && !broadcastSourceCooling(item, rules.cooledProviders)
    : programAllowed(item, channel));
  const qualified = new Map();
  for (const candidate of [...eligibleSaved, ...candidates]) {
    if (rules.sourceCatalog) {
      if (candidate.verification !== 'source-admitted' || !broadcastSourceType(candidate) ||
          broadcastSourceCooling(candidate, rules.cooledProviders) ||
          !(candidate.runtimeSeconds >= 900 && candidate.verifiedAt > 0 && candidate.verifiedAt <= now + 60_000)) continue;
      const saved = qualified.get(candidate.logicalId);
      if (!saved || candidate.verifiedAt >= saved.verifiedAt) {
        qualified.set(candidate.logicalId, { ...candidate, broadcastFamily: familyId(candidate) });
      }
      continue;
    }
    const result = qualifyIaFileRecord(candidate, { ...rules, iaRepair: true, requireTransport: false }, now);
    const item = result.item;
    if (!result.accepted || item.media.type !== mediaType || !item.fileName ||
      !item.runtimeSeconds || !trustedArchiveMedia(item.media.url)) continue;
    if (item.verification !== 'transport' || !(item.verifiedAt > 0 && item.verifiedAt <= now + 60_000)) continue;
    if (!programAllowed(item, channel)) continue;
    if (Sports.enabled(channel)) item.logicalId = Sports.describe(item, channel).eventId || item.logicalId;
    item.broadcastFamily = item.sourceIdentifier === '1-2-the-clampetts-strike-oil-extended'
      ? 'beverly hillbillies' : familyId(item);
    const saved = qualified.get(item.logicalId);
    if (!saved || item.verifiedAt >= saved.verifiedAt) {
      if (item.containsCommercials == null && saved && containsCommercials(saved)) item.containsCommercials = true;
      qualified.set(item.logicalId, item);
    }
  }

  return {
    catalog: [...qualified.values()].sort((a, b) => a.logicalId.localeCompare(b.logicalId, 'en')),
    baseline: eligibleSaved.length === savedCatalog.length ? previous?.depth : measureDepth(eligibleSaved)
  };
}

export function buildBroadcastWindow({ rules, candidates, spots = [], now = Date.now(), previous, horizonMs = 6 * hour }) {
  const channel = String(rules.channel);
  const mediaType = rules.mediaTypes?.[0] === 'audio' ? 'audio' : 'video';
  if (previous && previous.channel !== channel) throw new Error('Schedule belongs to another station');
  if (!Number.isFinite(now) || !(horizonMs > 0 && horizonMs <= 12 * hour)) throw new Error('Invalid schedule time');
  const { catalog, baseline } = collectBroadcastCatalog({ rules, candidates, now, previous });
  const depth = measureDepth(catalog);
  const ready = catalog.filter(item => now - item.verifiedAt <= broadcastProofMs);
  const readyDepth = measureDepth(ready);
  const floor = {
    episodes: Math.max(24, baseline?.episodes || 0),
    families: Math.max(6, baseline?.families || 0),
    hours: Math.max(8, horizonMs / hour, baseline?.hours || 0)
  };
  if (depth.episodes < floor.episodes || depth.families < floor.families || depth.hours + 1e-8 < floor.hours) {
    throw new Error('Station ' + channel + ' depth ' + JSON.stringify(depth) + ' below ' + JSON.stringify(floor));
  }

  // Keep the announced prefix. Rebuild from the first ineligible program's
  // start so a clean show already on air keeps its clock and the guide agrees.
  const rejectedIndex = firstRejectedBroadcastSlot(previous, now, rules);
  const cutoff = rejectedIndex < 0 ? Infinity : previous.slots[rejectedIndex].startsAt;
  const slots = (previous?.slots || []).filter(slot => slot.endsAt > now && slot.startsAt < cutoff);
  let cursor = slots.at(-1)?.endsAt ?? now;
  const used = new Set(previous?.used || []);
  const familyOrder = new Map((previous?.familyOrder || []).filter(([, startsAt]) => startsAt < cutoff));
  const spotOrder = new Map((previous?.spotOrder || []).filter(([, startsAt]) => startsAt < cutoff));
  const kept = rejectedIndex < 0 ? [] : previous.slots.slice(0, rejectedIndex);
  for (const slot of kept) {
    if (slot.kind === 'program') familyOrder.set(slot.family, slot.startsAt);
    const spot = slot.kind === 'break' && spots.find(row => row.url === slot.url);
    if (spot) spotOrder.set(spot.id, slot.startsAt);
  }
  const lastKept = kept.findLast(slot => slot.kind === 'program');
  let lastId = (rejectedIndex < 0 ? previous?.lastId : lastKept?.logicalId) || '';
  let lastFamily = (rejectedIndex < 0 ? previous?.lastFamily : lastKept?.family) || '';
  let blockMs = previous?.blockMs || 0;
  while (cursor < now + horizonMs) {
    const exhausted = catalog.every(item => used.has(item.logicalId));
    if (exhausted) used.clear();
    const unseen = ready.filter(item => !used.has(item.logicalId) && (!exhausted || item.logicalId !== lastId) &&
      cursor - item.verifiedAt <= broadcastProofMs);
    if (!unseen.length) throw new Error('Station ' + channel + ' needs verified unseen programs to extend its schedule');
    const otherFamilies = unseen.filter(item => item.broadcastFamily !== lastFamily);
    const pool = otherFamilies.length ? otherFamilies : unseen;
    const item = pool.reduce((best, row) =>
      (familyOrder.get(row.broadcastFamily) ?? -1) < (familyOrder.get(best.broadcastFamily) ?? -1) ? row : best);
    const startsAt = cursor;
    cursor += Math.round(item.runtimeSeconds * 1000);
    slots.push({ kind: 'program', id: item.identifier, logicalId: item.logicalId, title: item.title,
      family: item.broadcastFamily, startsAt, endsAt: cursor, year: item.year || null,
      url: item.media.url, mediaType: rules.sourceCatalog ? item.media.type : mediaType,
      provider: rules.sourceCatalog ? item.provider : 'Internet Archive' });
    used.add(item.logicalId);
    lastId = item.logicalId;
    lastFamily = item.broadcastFamily;
    familyOrder.set(lastFamily, startsAt);
    blockMs += cursor - startsAt;
    if (rules.sourceCatalog || mediaType === 'audio' || containsCommercials(item)) {
      blockMs = 0;
    } else if (channel !== '150' || blockMs >= cartoonBlockMs) {
      const spot = spots.find(row => trustedArchiveMedia(row.url) && row.durationMs >= 10_000 && row.durationMs <= 61_000 &&
        cursor - (spotOrder.get(row.id) ?? -Infinity) >= 6 * hour);
      const endsAt = cursor + (spot ? spot.durationMs : breakMs);
      slots.push({ kind: 'break', id: channel + '-break-' + cursor, title: spot?.title || 'Station break',
        startsAt: cursor, endsAt, ...(spot ? { url: spot.url } : {}) });
      if (spot) spotOrder.set(spot.id, cursor);
      cursor = endsAt;
      blockMs = 0;
    }
  }
  return { channel, name: rules.name, generatedAt: now, depth, readyDepth, slots, catalog, used: [...used],
    familyOrder: [...familyOrder], spotOrder: [...spotOrder], lastId, lastFamily, blockMs };
}
