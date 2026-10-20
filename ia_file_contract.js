/* File qualification is distinct from discovery and from decoded-frame
   telemetry. Transport verification never claims device decode success. */
const SHORT_FORM = new Set(['13', '236', '501', '509']);
// Complete original cartoons, not arbitrary short uploads. The relay has the
// same reviewed collection identities; admission parity is covered by tests.
const COMPLETE_CARTOON_SHORT_PARENTS = new Set([
  'looney-tunes-complete', 'popeye-the-sailor-the-complete-series',
  'the-pink-panther-cartoon-collection', 'roger-ramjet', 'felix-the-cat-1959',
  '017-betty-boop-rudy-vallee-melodies-1932-screen-songs-ld-rip',
  'woody-woodpecker-filmography', 'dudley-do-right-complete-720-540',
  'tennessee-tuxedo-season-1', 'tennessee-tuxedo-season-2', 'tennessee-tuxedo-season-3',
  'walt-disneys-silly-symphonies-the-complete-collection-1929-39',
  'WDTWaveTwo_TheCompleteGoofy', 'WDTWaveFour_TheCompletePluto',
  'mighty-mouse_202305', 'colonelbleep_s1',
]);
const INTERNATIONAL = new Set(['106', '107', '114', '115', '119', '120', '151']);
const FEATURES = new Set(['100', '101', '102', '103', '105', '106', '107', '108', '110', '111', '112', '114', '115', '116', '117', '119', '120', '124', '125', '132', '135', '700', '701', '702']);

export function iaReviewedCartoonSource(raw = {}) {
  return COMPLETE_CARTOON_SHORT_PARENTS.has(normalizeIaFileRecord(raw).sourceIdentifier);
}

export function iaGameShowYear(item = {}) {
  // Episode filenames and dates describe the broadcast; Archive year often
  // describes a recent upload of a much older collection.
  for (const text of [normalizeIaFileRecord(item).fileName, item.title]) {
    const years = [...String(text || '').matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?=[^0-9]|$)/g)]
      .map(match => Number(match[1])).filter(year => year >= 1940 && year <= 2026);
    if (years.length && new Set(years.map(year => year < 1980)).size === 1) return years[0];
  }
  return Number(item.broadcastYear || item.year) || 0;
}

export function iaModernGameShowAllowed(item = {}) {
  const meta = item.meta || {};
  const text = [item.identifier || item.id, item.sourceIdentifier, item.title, item.seriesTitle,
    item.fileName || item.media?.fileName, item.subject, item.subjects, meta.title, meta.subject, meta.subjects].filter(Boolean).join(' ').replace(/[_./-]+/g, ' ').replace(/['’]/g, '');
  if (/\b(?:nickelodeon|nick arcade|guts|figure it out|double dare|legends of the hidden temple|family game night|finders keepers|get the picture|make the grade|wild and crazy kids|brainsurge|brain surge|fun house|funhouse|masters of the maze|junior jeopardy|kids? (?:week|game shows?|edition|tournament)|teen (?:week|tournament|edition)|philippines|filipino|tagalog|family feud ph|concentration camps?|major fraud|podcast|reaction|documentary|retrospective|press conference)\b/i.test(text)) return false;
  // A phrase anywhere in an upload is not a show identity: e.g. a camp
  // documentary is not Concentration, nor a news headline Deal or No Deal.
  return [item.seriesTitle, item.title, meta.title, item.sourceIdentifier, item.identifier || item.id].filter(Boolean).some(value => {
    const identity = String(value).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(?:the )?(?:new )?/, '');
    return /^(?:(?:19|20)\d{2} )?(?:price is right|wheel of fortune|jeopardy|family feud|who wants to be a millionaire|millionaire|deal or no deal|press your luck|supermarket sweep|match game|weakest link|divided|crystal maze|chase|catch 21|lingo|card sharks|(?:\d+ )*pyramid|hollywood squares|newlywed game|classic concentration|concentration|sale of the century|tic tac dough|jokers wild|(?:super )?password(?: plus)?|lets make a deal|greed|1 vs 100|win ben steins money|tpir)\b/.test(identity);
  });
}

export function iaGameShowEraAllowed(item, channel) {
  if (!['12', '22'].includes(String(channel))) return true;
  if (String(channel) === '22' && !iaModernGameShowAllowed(item)) return false;
  const text = [item.title,item.subject,item.description,item.fileName].filter(Boolean).join(' ');
  if (/\b(?:cryptography|cryptographic|password cracking|password manager|change password|reset password|aula|computer tutorial|software tutorial)\b/i.test(text)) return false;
  if (/\b(?:gmod|garry.?s mod|roblox|minecraft|gameplay|walkthrough|speedrun|podcast|reaction|parody|fan[- ]?made|mock game|video essay|retrospective|press conference|interactive dvd|dvd game)\b/i.test(text)) return false;
  const year = iaGameShowYear(item);
  return String(channel) === '12' ? year >= 1940 && year <= 1979 : year >= 1980 && year <= 2026;
}

export function iaMinimumFileRuntimeSeconds(rules = {}) {
  if (Array.isArray(rules.mediaTypes) && rules.mediaTypes.length && !rules.mediaTypes.includes('movies') && !rules.mediaTypes.includes('video')) return 0;
  const requested = Math.max(0, Number(rules.minRuntimeSeconds) || 0), channel = String(rules.channel || '');
  if (channel === '150') return Math.max(requested, 120);
  return SHORT_FORM.has(channel) ? requested : Math.max(requested, FEATURES.has(channel) ? 3600 : 900);
}

function seconds(value) {
  if (value == null || value === '') return 0;
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
  const parts = String(value).split(':').map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function normalizeIaFileRecord(raw = {}) {
  const media = raw.media || {};
  const identifier = String(raw.identifier || raw.id || '');
  const url = String(media.url || raw.mediaUrl || raw.url || '');
  const sourceIdentifier = String(media.sourceIdentifier || raw.sourceIdentifier || raw.archiveId || identifier.split('::')[0]).replace(/^ia:/, '');
  let fileName = String(media.fileName || raw.fileName || raw.file || raw.sourceFile || identifier.split('::')[1] || '');
  if (!fileName && url) {
    try { const parsed = new URL(url); fileName = decodeURIComponent(parsed.pathname.split('/').slice(3).join('/')); } catch (_) { /* remains unknown */ }
  }
  const hasFileRuntime = ['runtime', 'duration', 'length'].some(key => Object.prototype.hasOwnProperty.call(media, key));
  const runtime = hasFileRuntime ? seconds(media.runtime || media.duration || media.length) : seconds(raw.runtimeSeconds || raw.durationSeconds || raw.duration || raw.runtime);
  const width = Number(media.width || raw.width || raw.videoWidth) || 0;
  const height = Number(media.height || raw.height || raw.videoHeight) || 0;
  const aspectRatio = width > 0 && height > 0 ? width / height : Number(media.aspectRatio || raw.aspectRatio) || 0;
  const stem = fileName.toLowerCase().replace(/\.(?:mp4|m4v|mov|ogv|webm|mp3|flac|ogg|oga|wav|m4a|aac)$/i, '')
    .replace(/(?:[._ -](?:ia|h\.?264|avc|x264|mpeg4|webm|ogv|\d{2,4}kb|orig|original|source|low|small|preview|proxy))+$/i, '')
    .replace(/\s*\[comm\]\s*$/i, '').trim()
    // Some collection derivatives repeat a matching episode index twice.
    .replace(/^(\d+)\s+episode\s*,?\s*(\d+)\b/i, (all, index, episode) => Number(index) === Number(episode) ? 'episode ' + Number(episode) : all)
    .replace(/^episode\s*,?\s*(\d+)\b/i, (_, episode) => 'episode ' + Number(episode));
  const logicalId = sourceIdentifier.toLowerCase() + (stem ? '::' + stem : '');
  return { ...raw, sourceIdentifier, fileName, logicalId, runtimeSeconds: runtime, duration: runtime || null,
    width, height, aspectRatio: aspectRatio || null,
    language: String(media.language || raw.language || '').toLowerCase(),
    sourceUrl: String(media.sourceUrl || raw.sourceUrl || (sourceIdentifier ? 'https://archive.org/details/' + encodeURIComponent(sourceIdentifier) : '')),
    rights: String(media.rights || raw.rights || raw.license || ''),
    seriesId: String(raw.seriesId || raw.seriesTitle || raw.family || sourceIdentifier),
    seriesTitle: String(raw.seriesTitle || ''),
    verification: String(media.verification || raw.verification || 'metadata-only'),
    verifiedAt: Number(media.verifiedAt || raw.verifiedAt) || 0,
    metadataVerifiedAt: Number(media.metadataVerifiedAt || raw.metadataVerifiedAt) || 0,
    media: { ...media, url, runtime, width, height, sourceIdentifier, fileName },
  };
}

export function qualifyIaFileRecord(raw, rules = {}, now = Date.now()) {
  const item = normalizeIaFileRecord(raw), type = String(item.media.type || item.mediaType || item.type || 'video');
  const reject = (reason, needsHydration = false) => ({ accepted: false, reason, needsHydration, item });
  if (!item.media.url) return reject('unresolved-media', true);
  if (item.verification === 'failed' || raw.playability === 'failed') return reject('failed-media');
  const transportValid = item.verification === 'transport' && item.verifiedAt > 0 && now - item.verifiedAt <= 86400_000 && item.verifiedAt <= now + 60_000;
  if (type === 'audio') {
    if (rules.iaRepair === true && rules.requireTransport !== false && !transportValid) return reject('unverified-transport', true);
    return { accepted: !Array.isArray(rules.mediaTypes) || !rules.mediaTypes.length || rules.mediaTypes.includes('audio'), reason: 'audio-contract', item };
  }
  const text = [item.title, item.description, item.subject, item.fileName].filter(Boolean).join(' ').toLowerCase();
  const channel = String(rules.channel || '');
  const completeCartoon = channel === '150' && COMPLETE_CARTOON_SHORT_PARENTS.has(item.sourceIdentifier)
    && !/\b(?:clip|trailer|preview|teaser|promo|bumper|intro|introduction|outro|review|reaction|tutorial|interview|bonus|menu|featurette|tiktok|reels)\b|#shorts|youtube shorts/i.test(text);
  if (/\b(?:podcast|vodcast|fan[- ]?made|fan[- ]?(?:film|movie|edit)|fanfic|unofficial remake|reaction video|parody|spoof)\b/i.test(text)) return reject('policy-contamination');
  if (/\b(?:vertical|portrait|9\s*:\s*16)\b/i.test(text) || (/\bshorts\b/i.test(text) && !completeCartoon) || (item.aspectRatio && item.aspectRatio <= 1)) return reject('portrait-media');
  if (!item.aspectRatio) return reject('unknown-geometry', true);
  if (channel === '150' && /\b(?:noods|network ident|logo compilation|bumper compilation|animated background|background video loop|stock animation|stock footage|motion graphics|screensaver)\b/i.test(text)) return reject('off-genre');
  if (channel === '150' && /\b(?:pt[- _.]?br|dublado|dublagem|em portugu[eê]s)\b/i.test(text)) return reject('non-english-edition');
  if (channel === '150' && item.sourceIdentifier === 'fat-albert-72' && /\((?:alternate version|attention study|1984 version|banned and uncensored version)\)/i.test(text)) return reject('duplicate-edition');
  if (!INTERNATIONAL.has(channel) && /\b(?:dansk tale|dublado|dublagem|deutsche fassung|deutschsprachig|(?:french|german|spanish|italian|portuguese|russian|danish) dub(?:bed)?|dubbed in (?:french|german|spanish|italian|portuguese|russian|danish))\b/i.test(text)) return reject('non-english-edition');
  if (!iaGameShowEraAllowed(item, channel)) return reject('wrong-era');
  const floor = iaMinimumFileRuntimeSeconds(rules);
  if (!item.runtimeSeconds) return reject('unknown-runtime', true);
  if (channel === '150' && item.runtimeSeconds < 900 && !completeCartoon) return reject('unreviewed-cartoon-short');
  if (item.runtimeSeconds < floor) return reject('short-runtime');
  if (!INTERNATIONAL.has(channel) && item.language && !/(?:^|[,; /])(?:eng|en|english)(?:$|[,; /])/.test(item.language)) return reject('non-english-edition');
  if (item.verification === 'failed' || raw.playability === 'failed') return reject('failed-media');
  if (rules.requireTransport !== false && !transportValid) return reject('unverified-transport', true);
  return { accepted: true, reason: 'file-qualified', needsHydration: false, item };
}
