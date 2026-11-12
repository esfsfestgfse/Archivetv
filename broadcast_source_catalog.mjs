import PeerTubeMedia from './assets/peertube-media.js';
import { nascarMediaProof, nascarReplayAllowed } from './nascar_catalog.js';

// Source Suite keeps its existing editorial filters and provider cooldowns.
// Only sources with an implemented clock join are admitted to this scheduler.
const providerKey = { 'NASCAR Classics': 'nascar', YouTube: 'youtube', PeerTube: 'peertube' };
export function broadcastSourceCooling(item, cooledProviders) {
  return cooledProviders?.has(providerKey[item.provider]);
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
    if (item.provider === 'PeerTube' && new URL(item.sourceUrl).origin === url.origin) {
      if (PeerTubeMedia.fragment(url.href)) return null;
      if (/^\/static\/streaming-playlists\/.+\.m3u8$/i.test(url.pathname)) return 'hls';
      if (/^\/static\/(?:web-videos|videos)\/.+\.mp4$/i.test(url.pathname)) return 'video';
    }
  } catch { /* Unsupported or incomplete media identity. */ }
  return null;
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
    const resolvePeerTube = row.provider === 'PeerTube' && PeerTubeMedia.fragment(mediaUrl);
    if ((!type && !resolvePeerTube) || broadcastSourceCooling(row, cooledProviders) || !row.title || !row.sourceIdentifier ||
        (row.provider === 'NASCAR Classics' && !nascarReplayAllowed(row)) ||
        row.embedAllowed === false || !Number.isFinite(runtime) || runtime < 900 ||
        (row.aspectRatio && Number(row.aspectRatio) <= 1)) return [];
    return [{
      identifier: row.identifier || row.id, sourceIdentifier: row.sourceIdentifier,
      logicalId: row.provider + ':' + row.sourceIdentifier, provider: row.provider,
      seriesTitle: row.seriesTitle || row.raceTrack || '', seriesId: row.seriesId || '', title: row.title,
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
