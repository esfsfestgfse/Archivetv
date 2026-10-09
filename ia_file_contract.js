/* File qualification is distinct from discovery and from decoded-frame
   telemetry. Transport verification never claims device decode success. */
const SHORT_FORM = new Set(['13', '236', '501', '509']);
const INTERNATIONAL = new Set(['106', '107', '114', '115', '119', '120', '151']);
const FEATURES = new Set(['100', '101', '102', '103', '105', '106', '107', '108', '110', '111', '112', '114', '115', '116', '117', '119', '120', '124', '125', '132', '135', '700', '701', '702']);

export function iaMinimumFileRuntimeSeconds(rules = {}) {
  if (Array.isArray(rules.mediaTypes) && rules.mediaTypes.length && !rules.mediaTypes.includes('movies') && !rules.mediaTypes.includes('video')) return 0;
  const requested = Math.max(0, Number(rules.minRuntimeSeconds) || 0), channel = String(rules.channel || '');
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
    .replace(/(?:[._ -](?:ia|h\.?264|avc|x264|mpeg4|webm|ogv|\d{2,4}kb|orig|original|source|low|small|preview|proxy))+$/i, '');
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
  if (/\b(?:podcast|vodcast|fan[- ]?made|fan[- ]?(?:film|movie|edit)|fanfic|unofficial remake|reaction video|parody|spoof)\b/i.test(text)) return reject('policy-contamination');
  if (/\b(?:vertical|portrait|shorts|9\s*:\s*16)\b/i.test(text) || (item.aspectRatio && item.aspectRatio <= 1)) return reject('portrait-media');
  if (!item.aspectRatio) return reject('unknown-geometry', true);
  const channel = String(rules.channel || '');
  const floor = iaMinimumFileRuntimeSeconds(rules);
  if (!item.runtimeSeconds) return reject('unknown-runtime', true);
  if (item.runtimeSeconds < floor) return reject('short-runtime');
  if (!INTERNATIONAL.has(channel) && item.language && !/(?:^|[,; /])(?:eng|en|english)(?:$|[,; /])/.test(item.language)) return reject('non-english-edition');
  if (item.verification === 'failed' || raw.playability === 'failed') return reject('failed-media');
  if (rules.requireTransport !== false && !transportValid) return reject('unverified-transport', true);
  return { accepted: true, reason: 'file-qualified', needsHydration: false, item };
}
