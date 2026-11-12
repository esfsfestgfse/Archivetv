// Source Suite keeps its existing editorial filters and provider cooldowns.
// Only sources with an implemented clock join are admitted to this scheduler.
export function broadcastSourceType(item) {
  try {
    const url = new URL(item.media?.url || item.embedUrl || item.url);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    if (item.provider === 'YouTube' &&
        /^www\.youtube(?:-nocookie)?\.com$/.test(url.hostname) &&
        /^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname)) return 'youtube';
    if (item.provider === 'PeerTube' && new URL(item.sourceUrl).origin === url.origin &&
        /^\/static\/(?:web-videos|videos|streaming-playlists)\/.+\.mp4$/i.test(url.pathname)) return 'video';
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
    const type = broadcastSourceType(row);
    const runtime = Number(row.runtimeSeconds || row.runtime || row.duration);
    if (!type || cooledProviders.has(row.provider.toLowerCase()) || !row.title || !row.sourceIdentifier ||
        row.embedAllowed === false || !Number.isFinite(runtime) || runtime < 900 ||
        (row.aspectRatio && Number(row.aspectRatio) <= 1)) return [];
    return [{
      identifier: row.identifier || row.id, sourceIdentifier: row.sourceIdentifier,
      logicalId: row.provider + ':' + row.sourceIdentifier, provider: row.provider,
      seriesTitle: row.seriesTitle || '', seriesId: row.seriesId || '', title: row.title,
      year: row.year || null, runtimeSeconds: runtime, sourceUrl: row.sourceUrl,
      media: { type, url: row.media?.url || row.embedUrl || row.url },
      verification: '', verifiedAt: 0
    }];
  });
  return { candidates, cooledProviders };
}

export async function verifyBroadcastSource(item) {
  const type = broadcastSourceType(item);
  if (!type) return null;
  const url = new URL(item.media.url);
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
  return valid ? { ...item, verification: 'source-admitted', verifiedAt: Date.now() } : null;
}
