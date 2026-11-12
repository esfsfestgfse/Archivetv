import PeerTubeMedia from './assets/peertube-media.js';
import SourcePrograms from './assets/source-program-policy.js';
import { nascarMediaProof, nascarReplayAllowed } from './nascar_catalog.js';

// Source Suite keeps its existing editorial filters and provider cooldowns.
// Only sources with an implemented clock join are admitted to this scheduler.
const providerKey = { 'NASCAR Classics': 'nascar', YouTube: 'youtube', PeerTube: 'peertube', 'OK.ru': 'ok', Vimeo: 'vimeo' };
export const isMusicVideoProfile = key => /^ok-(?:soul-flow|country-video|video-hits)-channel$/.test(key || '');
const editorialTitles = {
  'field-notes': /\b(?:field study|field biology|ecology|ecological|wildlife|biodiversity|natural history|field research|ecosystems?)\b/i,
  'legal-record': /\b(?:law|legal|court|courts|judicial|judiciary|constitution|constitutional|justice|rights)\b/i,
  'memory-bank': /\b(?:oral history|community history|public history|local history|historical archives?|memoirs?)\b/i,
  'cooks-table': /\b(?:cooking|kitchen|chef|recipe|cuisine|baking|cookhouse|cookery)\b/i
};
const editorialExclusions = {
  'field-notes': /\b(?:astrophysique|astrophysics|software|conferenza)\b/i,
  'storm-lab': /\b(?:instrument flight techniques|flight training|flight simulator)\b/i,
  'freedom-stories': /\b(?:last week tonight|daily show|stand.up comedy)\b/i,
  'blueprint': /\b(?:microservices|software architecture|first impressions|computer architecture|sleep history)\b/i,
  'legal-record': /\b(?:unfiltered talk|law students failing)\b/i,
  'memory-bank': /\b(?:murder|suspect|manson|prison|confessed|scandal)\b|^X community history$/i
};
export function broadcastSourceCooling(item, cooledProviders) {
  return cooledProviders?.has(providerKey[item.provider]);
}

export function broadcastSourceProgramAllowed(profileKey, item) {
  if (!SourcePrograms.allow(profileKey, item)) return false;
  if (item.provider === 'OK.ru' || item.provider === 'Vimeo') {
    const expected = item.provider === 'OK.ru' ? 'ok-' : 'vimeo-';
    return String(profileKey).startsWith(expected) && item.providerAdmitted === true;
  }
  const title = String(item.title || '');
  if ((editorialTitles[profileKey] && !editorialTitles[profileKey].test(title)) ||
      editorialExclusions[profileKey]?.test(title)) return false;
  if (/\b(?:minecraft|gameplay|walkthrough|speedrun|let['’]?s play|game modding)\b/i.test(title) &&
    ['map-room', 'field-notes', 'mission-control', 'backroad-journal', 'storm-lab', 'atomic-age-files', 'rail-archive',
      'invention-files', 'blueprint', 'animation-desk', 'screen-test', 'lesson-reel'].includes(profileKey)) return false;
  if (profileKey !== 'screen-test') return true;
  const subject = [item.title, item.subject].filter(Boolean).join(' ');
  return /\b(?:cinematography|film[- ]?making|film editing|movie editing|film production|movie production|film studios?|movie studios?|movie cameras?|film cameras?|production design|motion picture technology|cinema technology|camera technology|special effects|film lighting|colour grading|color grading)\b/i.test(subject);
}

export function broadcastSourceType(item) {
  try {
    const url = new URL(item.media?.url || item.embedUrl || item.url);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    if (item.provider === 'YouTube' &&
        /^www\.youtube(?:-nocookie)?\.com$/.test(url.hostname) &&
        /^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname)) return 'youtube';
    if (item.provider === 'NASCAR Classics' && item.officialReplay === true &&
        url.hostname === 'va.aws.nascar.com' && /\.m3u8$/i.test(url.pathname)) return 'hls';
    if (item.provider === 'OK.ru' && url.origin === 'https://ok.ru' && /^\/videoembed\/\d+$/.test(url.pathname)) return 'ok';
    if (item.provider === 'Vimeo' && url.origin === 'https://player.vimeo.com' && /^\/video\/\d+$/.test(url.pathname)) return 'vimeo';
    if (item.provider === 'PeerTube' && new URL(item.sourceUrl).origin === url.origin) {
      if (PeerTubeMedia.fragment(url.href)) return null;
      if (/^\/static\/streaming-playlists\/.+\.m3u8$/i.test(url.pathname)) return 'hls';
      if (/^\/static\/(?:web-videos|videos)\/.+\.mp4$/i.test(url.pathname)) return 'video';
    }
  } catch { /* Unsupported or incomplete media identity. */ }
  return null;
}

function admittedProvider(profileKey, row, type) {
  if (!['ok', 'vimeo'].includes(type)) return false;
  if (!profileKey.startsWith(type + '-') || row.embedAllowed !== true || !(Number(row.aspectRatio) > 1) ||
      !/^en(?:[-_]|$)/i.test(row.language || '')) return false;
  if (type === 'vimeo') return row.embedVerified === true && row.publicEmbed === true;
  if (isMusicVideoProfile(profileKey)) return row.musicVerified === true && row.musicVerificationVersion === 2 && Boolean(row.musicTrackKey);
  if (/^ok-(?:kids|adult|anime)-channel$/.test(profileKey)) return row.animationVerified === true && row.animationVerificationVersion === 2;
  return row.curatedVerified === true || /^https:\/\/(?:www\.tvmaze\.com\/shows\/\d+|www\.wikidata\.org\/wiki\/Q\d+)/.test(row.identityReference || '');
}

function sourceProgramId(row) {
  if (row.provider === 'OK.ru') {
    if (row.musicTrackKey) return 'ok:track:' + row.musicTrackKey;
    if (/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(row.identityReference || '')) return 'ok:film:' + row.identityReference.split('/').at(-1);
    const episode = row.episodeIdentity || row.title.match(/\bs\d{1,2}[ ._-]*e\d{1,3}\b/i)?.[0];
    if (row.seriesId && episode) return 'ok:episode:' + row.seriesId + ':' + episode.toLowerCase().replace(/[ ._-]+/g, '');
  }
  return row.provider + ':' + row.sourceIdentifier;
}

export async function readSourceBroadcastInventory(profileKey) {
  const endpoint = 'https://realsignal-api.tdy1990.workers.dev/api/v3/source/status?profileKey=';
  const response = await fetch(endpoint + encodeURIComponent(profileKey), { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error('Source catalog HTTP ' + response.status);
  const data = await response.json();
  if (data.profileKey !== profileKey) throw new Error('Source profile mismatch');
  const cooledProviders = new Set(data.providerAvailability?.cooldownProviders || []);
  const candidates = (data.items || []).flatMap(row => {
    const mediaUrl = row.media?.url || row.embedUrl || row.url;
    const type = broadcastSourceType(row);
    const runtime = Number(row.runtimeSeconds || row.runtime || row.duration);
    const providerAdmitted = admittedProvider(profileKey, row, type);
    const minimum = isMusicVideoProfile(profileKey) ? 120 : /^(?:ok|vimeo)-movie-channel$/.test(profileKey) ? 3600 : 900;
    const resolvePeerTube = row.provider === 'PeerTube' && PeerTubeMedia.fragment(mediaUrl);
    if ((!type && !resolvePeerTube) || broadcastSourceCooling(row, cooledProviders) || !row.title || !row.sourceIdentifier ||
        !broadcastSourceProgramAllowed(profileKey, { ...row, providerAdmitted }) ||
        (row.provider === 'NASCAR Classics' && !nascarReplayAllowed(row)) ||
        row.embedAllowed === false || !Number.isFinite(runtime) || runtime < minimum ||
        (row.aspectRatio && Number(row.aspectRatio) <= 1)) return [];
    return [{
      identifier: row.identifier || row.id, sourceIdentifier: row.sourceIdentifier,
      logicalId: sourceProgramId(row), provider: row.provider, providerAdmitted,
      seriesTitle: row.seriesTitle || row.raceTrack || '', seriesId: row.seriesId || '', title: row.title,
      subject: row.subject, description: row.description, account: row.account, channelId: row.channelId,
      defaultAudioLanguage: row.defaultAudioLanguage, language: row.language, defaultLanguage: row.defaultLanguage,
      containsSyntheticMedia: row.containsSyntheticMedia === true || row.status?.containsSyntheticMedia === true,
      year: row.year || null, runtimeSeconds: runtime, sourceUrl: row.sourceUrl,
      officialReplay: row.officialReplay === true, media: { type, url: mediaUrl },
      verification: '', verifiedAt: 0
    }];
  });
  return { candidates, cooledProviders };
}

async function verifyPeerTubePlaylist(url) {
  const origin = url.origin;
  const signal = AbortSignal.timeout(7000);
  for (let depth = 0; depth < 2; depth++) {
    if (url.origin !== origin || !/\.m3u8$/i.test(url.pathname)) return false;
    const response = await fetch(url, { redirect: 'error', signal });
    if (!response.ok) return false;
    const body = await response.text();
    if (!body.startsWith('#EXTM3U') || /#EXT-X-(?:KEY|SESSION-KEY)/.test(body)) return false;
    if (body.includes('#EXT-X-ENDLIST')) return body.includes('#EXTINF:');
    const variant = body.match(/#EXT-X-STREAM-INF:[^\n]+\n([^#\s][^\n]*)/)?.[1];
    if (!variant) return false;
    url = new URL(variant.trim(), url);
  }
  return false;
}

export async function verifyBroadcastSource(item) {
  if (item.provider === 'PeerTube' && PeerTubeMedia.fragment(item.media.url)) {
    const url = new URL(item.media.url);
    if (url.protocol !== 'https:' || url.origin !== new URL(item.sourceUrl).origin) return null;
    const resolved = await PeerTubeMedia.resolve({ url: url.href }, async detailUrl => {
      const response = await fetch(detailUrl, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('PeerTube metadata HTTP ' + response.status);
      return response.json();
    });
    item = { ...item, media: { url: resolved.url } };
  }
  const type = broadcastSourceType(item);
  if (!type) return null;
  const url = new URL(item.media.url);
  const checked = { ...item, media: { type, url: url.href }, verification: 'source-admitted', verifiedAt: Date.now() };
  if (type === 'hls') {
    if (item.provider === 'NASCAR Classics') {
      const proof = await nascarMediaProof(url.href);
      return proof ? { ...checked, runtimeSeconds: proof.duration, verifiedAt: proof.verifiedAt } : null;
    }
    return await verifyPeerTubePlaylist(url) ? checked : null;
  }
  if (type === 'ok') {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(7000) });
    if (!response.ok) return null;
    const html = await response.text();
    return /data-options=/.test(html) && /video-player|moviePlayer/.test(html) &&
      !/video is unavailable|video not found|видеозапись недоступна/i.test(html) ? checked : null;
  }
  if (type === 'vimeo') {
    const id = url.pathname.split('/').pop();
    const endpoint = new URL('https://vimeo.com/api/oembed.json');
    endpoint.searchParams.set('url', 'https://vimeo.com/' + id);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return null;
    const data = await response.json();
    return String(data.video_id) === id && Number(data.width) > Number(data.height) &&
      Number(data.duration) >= 900 && data.html?.includes('https://player.vimeo.com/video/' + id)
      ? { ...checked, runtimeSeconds: Number(data.duration) } : null;
  }
  let response;
  if (type === 'youtube') {
    const id = url.pathname.split('/').pop();
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', 'https://www.youtube.com/watch?v=' + id);
    endpoint.searchParams.set('format', 'json');
    response = await fetch(endpoint, { signal: AbortSignal.timeout(7000) });
  } else {
    response = await fetch(url, { headers: { Range: 'bytes=0-8191' }, redirect: 'manual',
      signal: AbortSignal.timeout(7000) });
  }
  if (response.body) await response.body.cancel();
  const valid = type === 'youtube' ? response.ok
    : response.status === 206 && /^bytes 0-\d+\/\d+$/.test(response.headers.get('content-range') || '');
  return valid ? checked : null;
}
