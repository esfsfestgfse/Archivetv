/* Durable public catalog discovery; playback always uses Vimeo's own player. */
import { createHash } from 'node:crypto';
export const VIMEO_FIELDS = 'uri,name,description,duration,width,height,language,license,link,privacy,status,is_playable,tags.name,categories.name,user.name,created_time';

// Abort both the request and JSON body read. One slow search must not erase
// the verified items already found by the other queries in this refresh.
export async function vimeoJson(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Vimeo HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

export function vimeoProgramOkay(item, kind = '') {
  const identity = [item?.title, item?.description, item?.tags, item?.category, item?.account].join(' ');
  if (/\b(?:wedding|weddings|videography|satsang|sermon|church service|bible study|meditation session|dj set|concert|gaming|gameplay|livestream|live stream|webinar|seminar|conference|keynote|growth mindset|fixed mindset|business presentation|podcast|fan[ -]?made|parody|television restoration|tv restoration|sample episode|full episode sample)\b/i.test(identity)) return false;
  return kind !== 'tv' || !/\b(?:anime|animation|animated|cartoon|miraculous|zombizou|watamote|crayon shin[ -]?chan)\b/i.test(identity);
}

export function vimeoOriginalSeriesEvidence(item) {
  const name = vimeoIdentityTitle(item?.title || '', 'tv');
  if (name.length < 3 || /^(?:episode|pilot|season|television|tv show|series)$/i.test(name)) return false;
  // The upload's declared language alone admitted disguised anime. A new
  // independent series needs production/story evidence, not just "Episode 3".
  return vimeoLanguageKnown(item) && /\b(?:original (?:series|show)|web series|written by|writer|direct(?:or|ed)|producer|produced|production|created (?:by|for)|crew|cast|screenplay|starring|scripted|drama series|comedy series|docureality television series)\b/i.test(String(item?.description || ''));
}

export function vimeoIdentityTitle(title, kind) {
  let name = String(title).replace(/\.(?:mp4|mov)$/i, '').replace(/^action movie\s*\d{4}\s*[-:]\s*/i, '')
    .replace(/\([^)]*(?:feature film|full movie|full film|full episode|full pilot|1080p|4k)[^)]*\)/gi, '');
  name = kind === 'tv' ? name.split(/\b(?:s\d{1,2}[ ._-]*e\d{1,3}|episode\s*\d+|ep\.?\s*\d+|season\s*\d+|full pilot episode|full episode)\b/i)[0]
    : name.split(/\b(?:feature film|full length movie|full movie|full film|best action movies)\b/i)[0];
  return name.replace(/\s*[([]?\b(?:19|20)\d{2}\b[)\]]?\s*$/g, '').replace(/^[\s\-:]+|[\s\-:]+$/g, '').trim();
}

// No language guess from an English search phrase or an English-looking title.
export function vimeoLanguageKnown(item) {
  return /^en(?:[-_]|$)/i.test(String(item?.language || ''));
}

// Public uploads often omit language. Use exact program identity rather than
// guessing English from a query, title, or uploader's country. Never change
// the shared OK identity rules as part of the Vimeo repair.
export async function vimeoProgramIdentity(item, kind, getJson, cache = new Map()) {
  const name = vimeoIdentityTitle(item.title, kind);
  const compact = value => String(value || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
  if (!compact(name)) return null;
  const key = `${kind}:${compact(name)}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    if (kind === 'tv') {
      const rows = await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(name)}`);
      const show = (Array.isArray(rows) ? rows : []).map(row => row.show).find(show => show && compact(show.name) === compact(name));
      if (show && (show.language !== 'English' || show.type === 'Animation')) return { rejectedIdentity: true };
      return show ? { language:'en', seriesTitle:show.name, seriesId:`tvmaze:${show.id}`, identityReference:show.url, identityProvider:'TVmaze' } : null;
    }
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.search = new URLSearchParams({action:'wbsearchentities',search:`${name} film`,language:'en',type:'item',limit:'10',format:'json'});
    const search = await getJson(url.href);
    const entity = (search.search || []).find(row => [row.label,row.match?.text,...(row.aliases || [])].some(label => compact(label) === compact(name)) && /\bfilm\b/i.test(row.description || '') && !/documentary|parody|fan film/i.test(row.description || ''));
    if (!entity) return null;
    url.search = new URLSearchParams({action:'wbgetentities',ids:entity.id,props:'claims',format:'json'});
    const claims = (await getJson(url.href)).entities?.[entity.id]?.claims;
    const values = property => (claims?.[property] || []).map(claim => claim.mainsnak?.datavalue?.value);
    const languages = values('P364').map(value => value?.id), genres = values('P136').map(value => value?.id);
    const years = values('P577').map(value => Number(String(value?.time || '').match(/\+(\d{4})/)?.[1])).filter(Boolean);
    if (!languages.includes('Q1860') || genres.some(id => ['Q93204','Q622548'].includes(id)) || !years.length || Math.min(...years) < 1980) return null;
    const titleYear = String(item.title).match(/\b(?:19|20)\d{2}\b/)?.[0];
    if (titleYear && !years.includes(Number(titleYear))) return null;
    return {language:'en', year:Math.min(...years), identityReference:`https://www.wikidata.org/wiki/${entity.id}`,identityProvider:'Wikidata'};
  })());
  return cache.get(key);
}

export async function vimeoDiscoveryCursor(db, key, fallback = 0) {
  if (db?.prepare) try {
    const result = await db.prepare("INSERT INTO channel_rules (channel_key,rules_json,updated_at) VALUES (?, '{\"vimeoDiscoveryCursor\":1}', ?) ON CONFLICT(channel_key) DO UPDATE SET rules_json=json_set(channel_rules.rules_json,'$.vimeoDiscoveryCursor',COALESCE(json_extract(channel_rules.rules_json,'$.vimeoDiscoveryCursor'),0)+1) RETURNING json_extract(rules_json,'$.vimeoDiscoveryCursor') AS cursor").bind(key, Date.now()).all();
    const cursor = Number(result.results?.[0]?.cursor);
    if (cursor > 0) return cursor - 1;
  } catch (_) { /* local fixtures need no D1 */ }
  return Math.abs(Math.floor(Number(fallback) || 0));
}

export async function vimeoSearchPage(db, key, query, sort, nextPage) {
  const path = `$.vimeoPages.q${createHash('sha256').update(`${query.toLowerCase()}:${sort}`).digest('hex').slice(0, 16)}`;
  if (!db?.prepare) return 1;
  try {
    if (nextPage !== undefined) {
      const page = Math.max(1, Math.min(200, Number(nextPage) || 1));
      await db.prepare("INSERT INTO channel_rules (channel_key,rules_json,updated_at) VALUES (?,json_set('{}',?,?),?) ON CONFLICT(channel_key) DO UPDATE SET rules_json=json_set(channel_rules.rules_json,?,?),updated_at=excluded.updated_at").bind(key, path, page, Date.now(), path, page).all();
      return page;
    }
    const result = await db.prepare('SELECT json_extract(rules_json,?) AS page FROM channel_rules WHERE channel_key=?').bind(path, key).all();
    return Math.max(1, Math.min(200, Number(result.results?.[0]?.page) || 1));
  } catch (_) { return 1; }
}

export function vimeoItem(row, query) {
  const id = String(row?.uri || '').match(/^\/videos\/(\d+)$/)?.[1];
  if (!id) return null;
  const width = Number(row.width), height = Number(row.height);
  const publicEmbed = row.privacy?.view === 'anybody' && row.privacy?.embed === 'public'
    && row.is_playable !== false && (!row.status || row.status === 'available');
  return { id: `vimeo:${id}`, rawId: id, title: String(row.name || ''),
    description: String(row.description || '').slice(0, 5000),
    tags: (row.tags || []).map(tag => tag.name || '').join(' '),
    category: (row.categories || []).map(category => category.name || '').join(' '),
    account: String(row.user?.name || ''), language: String(row.language || ''),
    year: String(row.created_time || '').slice(0, 4), duration: Number(row.duration) || 0,
    aspectRatio: width > 0 && height > 0 ? width / height : 0,
    rights: String(row.license || 'Vimeo public player permission'),
    embedAllowed: publicEmbed, publicEmbed, type: 'embed',
    url: `https://player.vimeo.com/video/${id}`, embedUrl: `https://player.vimeo.com/video/${id}`,
    sourceUrl: `https://vimeo.com/${id}`, query };
}

export function vimeoOEmbedVerified(item, data) {
  if (!item?.publicEmbed || data?.type !== 'video' || Number(data.video_id) !== Number(item.rawId)) return null;
  const src = String(data.html || '').match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&');
  if (!src) return null;
  let url;
  try { url = new URL(src); } catch (_) { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'player.vimeo.com' || url.pathname !== `/video/${item.rawId}`) return null;
  const width = Number(data.width), height = Number(data.height), duration = Number(data.duration);
  if (!(width > 0 && height > 0 && duration > 0)) return null;
  return { ...item, title: String(data.title || item.title), duration, aspectRatio: width / height,
    embedUrl: url.href, url: url.href, embedAllowed: true, embedVerified: true,
    verifiedAt: Date.now(), rights: 'Vimeo public official player; provider controls availability' };
}

export function vimeoBalancedItems(items) {
  const groups = new Map();
  const programs = new Set();
  for (const item of items) {
    const identity = String(item.title).replace(/\([^)]*(?:full film|full movie|feature film|1080p|4k)[^)]*\)/gi, '').replace(/\b(?:feature film|full film|full movie|1080p|4k)\b/gi, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
    if (identity && programs.has(identity)) continue;
    if (identity) programs.add(identity);
    const series = String(item.seriesTitle || item.title).replace(/\b(?:s\d{1,2}[ ._-]*e\d{1,3}|episode\s*\d+|ep\.?\s*\d+|season\s*\d+).*$/i, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
    const key = series || item.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const result = [], lanes = [...groups.values()];
  for (let i = 0; lanes.some(lane => lane[i]); i++) for (const lane of lanes) if (lane[i]) result.push(lane[i]);
  return result;
}
