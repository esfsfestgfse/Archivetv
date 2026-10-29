/* Official NASCAR Classics public catalog. Discovery runs on the server;
 * clients consume the same verified race records and rolling history as other
 * sources. Public replays remain NASCAR's content, not public-domain media. */
import { NASCAR_VERIFIED_SEED } from './nascar_verified_seed.js';

const API = 'https://apiv3.videoflow.io/ch/vfc-veql4g7blzgd';
const SEARCH = '/pages/wszPshklHN/sections/SIvJii7uAC/content';
const REJECT = /\b(?:condensed|recap|highlights?|qualifying|practice|podcast|reaction|gameplay|simulation|trailer)\b/i;
function mediaUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'va.aws.nascar.com' && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
}
export function nascarReplayAllowed(item) {
  if (!item || item.officialReplay !== true || item.verification !== 'hls-vod-segment' || item.provider !== 'NASCAR Classics') return false;
  const id = String(item.id || ''), match = String(item.sourceUrl || '').match(/^https:\/\/classics\.nascar\.com\/video\/([A-Za-z0-9_-]+)(?:~[A-Za-z0-9_~-]+)?$/);
  return !!match && id === 'nascar:' + match[1] && !!mediaUrl(item.url) && /\.m3u8(?:\?|$)/i.test(item.url) &&
    Number(item.duration) >= 3600 && Number(item.aspectRatio || Number(item.width) / Number(item.height)) >= 1.2 &&
    /^en(?:-|$)/i.test(item.language || '') && !REJECT.test(String(item.title || ''));
}
async function boundedText(response, max = 2 * 1024 * 1024) {
  if (!response.ok || !response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder(); let text = '', bytes = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
    if (bytes > max) return ''; text += decoder.decode(part.value, { stream: true }); }
    return text + decoder.decode();
  } finally { try { await reader.cancel(); } catch {} }
}
async function read(url, request, headers) {
  return boundedText(await request(url, { headers, redirect: 'error', signal: AbortSignal.timeout(3500) }));
}
export async function nascarMediaProof(url, request = fetch) {
  if (!mediaUrl(url)) return null;
  try {
    const master = await read(url, request);
    const variants = [...master.matchAll(/#EXT-X-STREAM-INF:([^\n]+)\n([^#\s][^\n]*)/g)].map(m => {
      const size = m[1].match(/RESOLUTION=(\d+)x(\d+)/);
      return size && /avc1/i.test(m[1]) ? { width: Number(size[1]), height: Number(size[2]), url: new URL(m[2].trim(), url).href } : null;
    }).filter(v => v && v.width / v.height >= 1.2 && mediaUrl(v.url)).sort((a,b) => Math.abs(a.height-720)-Math.abs(b.height-720));
    const variant = variants[0]; if (!variant) return null;
    const body = await read(variant.url, request);
    if (!body.startsWith('#EXTM3U') || !body.includes('#EXT-X-ENDLIST') || /#EXT-X-(?:KEY|SESSION-KEY)/.test(body + master)) return null;
    const duration = [...body.matchAll(/#EXTINF:([\d.]+)/g)].reduce((sum,m) => sum + Number(m[1]),0);
    const first = body.split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'));
    if (duration < 3600 || !first) return null;
    const segment = new URL(first.trim(), variant.url).href; if (!mediaUrl(segment)) return null;
    const response = await request(segment, { headers: { Range: 'bytes=0-2047' }, redirect: 'error', signal: AbortSignal.timeout(3500) });
    try { if (![200,206].includes(response.status)) return null; } finally { if (response.body) await response.body.cancel(); }
    return { duration: Math.round(duration), width: variant.width, height: variant.height, aspectRatio: variant.width / variant.height, verification: 'hls-vod-segment', verifiedAt: Date.now() };
  } catch { return null; }
}
function normalized(detail, proof) {
  const input = detail && detail.input;
  if (!input || input.state !== 'vod' || input.geo_restriction?.enabled === true || !input.token || !proof || REJECT.test(input.name || '')) return null;
  const item = { id: 'nascar:' + input.token, title: String(input.name || '') + ' — Full Race Broadcast',
    url: input.src, sourceUrl: 'https://classics.nascar.com/video/' + input.token, provider: 'NASCAR Classics',
    description: 'Official NASCAR Classics race broadcast.', account: 'NASCAR Classics', tags: 'nascar stock car racing full race broadcast',
    rights: 'Official NASCAR Classics public replay; NASCAR retains rights.', type: 'video', language: 'en', officialReplay: true,
    year: String(input.metadata?.year || '').slice(0,4), raceTrack: String(input.metadata?.track || ''), raceSeries: String(input.metadata?.series || ''), ...proof };
  return nascarReplayAllowed(item) ? item : null;
}
export async function nascarCatalog(profile, rotation = 0, options = {}, request = fetch) {
  const seeds = NASCAR_VERIFIED_SEED.filter(nascarReplayAllowed).map(item => ({ ...item }));
  if (options.firstLane === true) return { provider: 'NASCAR Classics', items: seeds, health: { verifiedSeed: true, ready: seeds.length } };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),10500);
  const network = (url, init = {}) => request(url, { ...init, signal: AbortSignal.any([controller.signal, init.signal || AbortSignal.timeout(3500)]) });
  const headers = { Origin: 'https://classics.nascar.com' };
  // The public site uses a channel identifier and Origin, not account secrets.
  // A rotating year/page window deepens D1 without searching during playback.
  const cursor = Math.abs(Math.trunc(Number(rotation) || 0)) + Math.floor(Date.now() / 1800000);
  const year = 1979 + cursor % 48, items = [], errors = [];
  try {
    const first = JSON.parse(await read(API + SEARCH + '?q=' + year + '&page=1', network, headers));
    const pages = Math.max(1,Math.min(200,Number(first.paging?.total_pages)||1));
    const page = 1 + Math.floor(cursor / 48) % pages;
    const payload = page === 1 ? first : JSON.parse(await read(API + SEARCH + '?q=' + year + '&page=' + page, network, headers));
    const rows = (payload.data || []).filter(row => row.input?.state === 'vod' && !REJECT.test(row.input?.name || '') && row.input?.geo_restriction?.enabled !== true).slice(0,4);
    let index = 0;
    await Promise.all(Array.from({ length: 2 }, async () => { while (index < rows.length && !controller.signal.aborted) {
      const row = rows[index++], token = String(row.token || '');
      if (!/^[A-Za-z0-9_~-]+$/.test(token)) continue;
      try { const detail = JSON.parse(await read(API + '/content/' + encodeURIComponent(token),network,headers));
        const proof = await nascarMediaProof(detail.input?.src,network), item = normalized(detail,proof); if (item) items.push(item);
      } catch (e) { errors.push(String(e.message || e).slice(0,100)); }
    }}));
    return { provider: 'NASCAR Classics', items: [...items,...seeds].filter((item,i,all) => all.findIndex(x => x.id===item.id)===i),
      health: { discovered: items.length, verifiedSeed: seeds.length, year, page, pages, errors } };
  } catch (e) { return { provider: 'NASCAR Classics', items: seeds, health: { verifiedSeed: true, error: String(e.message || e).slice(0,100) } }; }
  finally { clearTimeout(timer); }
}
