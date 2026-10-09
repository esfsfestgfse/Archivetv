/* Public title-search metadata only. Playback stays in OK's official iframe;
 * never persist or relay its signed/CDN media URLs. */
export function okDecodeAttribute(value) {
  return String(value || "").replace(/&quot;/gi, '"').replace(/&#(?:39|x27);|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function okSearchRows(html) {
  const rows = [];
  const seen = new Set();
  for (const match of String(html || "").matchAll(/data-props="([^"]*)"/g)) {
    if (!match[1].includes("searchQuery") || !match[1].includes("videos")) continue;
    let props;
    try { props = JSON.parse(okDecodeAttribute(match[1])); } catch (_) { continue; }
    for (const row of okSearchResultRows(props)) {
      if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); }
    }
  }
  return rows;
}

export function okSearchResultRows(props) {
  const rows = [], seen = new Set();
  for (const row of props?.videos?.list || []) {
    const movie = row.movie;
    if (!movie || movie.blocked || movie.paid || row.warning || !/^\d+$/.test(String(movie.id || "")) || seen.has(String(movie.id))) continue;
    seen.add(String(movie.id));
    rows.push({ ...movie, permalink: `https://ok.ru/video/${movie.id}`,
      description: movie.description || row.description || "",
      // Search results use milliseconds; the embed metadata uses seconds.
      duration_seconds: Number(movie.duration) / 1000,
      title: movie.title || row.name || "" });
  }
  return rows;
}

export function okEmbedMetadata(html, expectedId) {
  for (const match of String(html || "").matchAll(/data-options="([^"]*)"/g)) {
    let options, metadata;
    try {
      options = JSON.parse(okDecodeAttribute(match[1]));
      metadata = options.flashvars?.metadata;
      if (typeof metadata === "string") metadata = JSON.parse(metadata);
    } catch (_) { continue; }
    const movie = metadata?.movie;
    if (!movie || String(movie.id || movie.movieId) !== String(expectedId)) continue;
    if (movie.status !== "OK" || movie.notPublished || movie.isClip) return null;
    const width = Number(movie.width), height = Number(movie.height);
    if (!(width > 0 && height > 0)) return null;
    return { id: String(expectedId), title: String(movie.title || ""),
      duration: Number(movie.duration) || 0, width, height, aspectRatio: width / height,
      embedAllowed: true, type: "embed", url: `https://ok.ru/videoembed/${expectedId}`,
      embedUrl: `https://ok.ru/videoembed/${expectedId}`,
      rights: "OK.ru public embed; playback remains subject to provider availability" };
  }
  return null;
}

export function okTVIndexTitles(shows, cursor = 0) {
  const eligible = (Array.isArray(shows) ? shows : []).filter(show =>
    show?.language === "English" && show.type !== "Animation" &&
    (show.network?.country?.code === "US" || show.webChannel?.country?.code === "US"));
  const offset = Math.abs(Math.floor(Number(cursor) || 0)) * 3;
  return Array.from({ length: Math.min(3, eligible.length) }, (_, i) => eligible[(offset + i) % eligible.length].name);
}

// Atomically advance discovery independently of a viewer's playback rotation.
// The existing rules record carries the cursor; no schema migration is needed.
export async function okDiscoveryCursor(db, profileKey, fallback = 0) {
  if (db?.prepare) {
    try {
      const result = await db.prepare("INSERT INTO channel_rules (channel_key, rules_json, updated_at) VALUES (?, '{\"okDiscoveryCursor\":1}', ?) ON CONFLICT(channel_key) DO UPDATE SET rules_json=json_set(channel_rules.rules_json, '$.okDiscoveryCursor', COALESCE(json_extract(channel_rules.rules_json, '$.okDiscoveryCursor'), 0)+1) RETURNING json_extract(rules_json, '$.okDiscoveryCursor') AS cursor").bind(profileKey, Date.now()).all();
      const cursor = Number(result.results?.[0]?.cursor);
      if (Number.isFinite(cursor) && cursor > 0) return cursor - 1;
    } catch (_) { /* old/test databases retain bounded rotation-based discovery */ }
  }
  return Math.abs(Math.floor(Number(fallback) || 0));
}

export async function okQueryOffset(db, profileKey, path, reset = false) {
  if (!db?.prepare) return 0;
  try {
    if (reset) {
      await db.prepare("UPDATE channel_rules SET rules_json=json_set(rules_json, ?, 0) WHERE channel_key=?").bind(path, profileKey).all();
      return 0;
    }
    const result = await db.prepare("INSERT INTO channel_rules (channel_key, rules_json, updated_at) VALUES (?, json_set('{}', ?, 20), ?) ON CONFLICT(channel_key) DO UPDATE SET rules_json=json_set(channel_rules.rules_json, ?, COALESCE(json_extract(channel_rules.rules_json, ?), 0)+20) RETURNING json_extract(rules_json, ?) AS cursor").bind(profileKey, path, Date.now(), path, path, path).all();
    return Math.max(0, (Number(result.results?.[0]?.cursor) || 20) - 20);
  } catch (_) { return 0; }
}

// Anonymous continuation endpoint used by OK's public search UI. No login,
// cookies, secret token, media extraction, or player authorization is involved.
export function okSearchPageRequest(query, offset = 0) {
  return { url: "https://ok.ru/web-api/v2/video/fetchSearchResult", options: {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, parameters: { displayMode: "Movie", videosOffset: Math.max(0, Math.floor(offset)), channelsOffset: 0, searchQuery: String(query).slice(0, 120), currentStateId: "anonymVideo", durationType: "ANY", hd: false } })
  } };
}

export function okTitleSearchQueries(profile, rotation = 0, options = {}) {
  const markers = profile.profileKey === "ok-movie-channel"
    ? ["yts", "bdrip", "blu-ray", "dvd rip", "vhs rip", "1080p movie", "4k movie"]
    : ["S01E01 1080p", "S02E01 DVDRip", "S01 BDRip", "S03 1080p", "tv series dvd rip", "sitcom 1080p", "television VHS rip"];
  const seeds = profile.profileKey === "ok-tv-channel"
    ? ["The Twilight Zone", "The Fugitive", "Taxi", "I Love Lucy", "The Andy Griffith Show", "The Beverly Hillbillies", "Miami Vice", "Knight Rider", "MacGyver", "The X Files", "Friends", "Seinfeld", "The Sopranos", "The Wire", "Breaking Bad", "The Office", "Parks and Recreation", "Law and Order", "Murder She Wrote", "Columbo", "Gunsmoke", "Perry Mason", "The Dick Van Dyke Show", "The Mary Tyler Moore Show", "Dallas", "Dynasty", "The Rockford Files", "Bonanza"]
    : ["Batman", "Batman and Robin", "Tombstone", "The Godfather", "Scarface", "Goodfellas", "The Shawshank Redemption", "Pulp Fiction", "The Matrix", "Jurassic Park", "Back to the Future", "Die Hard", "The Terminator", "Aliens", "Predator", "Rocky", "Rambo", "Top Gun", "The Blues Brothers", "The Goonies", "The Breakfast Club", "The Lost Boys", "Heat", "Casino", "Se7en", "Fight Club", "The Green Mile", "The Departed", "The Dark Knight", "Inception", "Interstellar", "John Wick"];
  const offset = Math.abs(Math.floor(Number(rotation) || 0));
  // A broad query always accompanies title examples: examples are not a whitelist.
  const examples = Array.from({ length: 3 }, (_, index) => {
    const seed = seeds[(offset * 3 + index) % Math.max(1, seeds.length)];
    const quality = profile.profileKey === "ok-tv-channel" ? ["1080p", "DVDRip", "DVDRip"][index] : ["1080p", "1080p", "1080p"][index];
    return seed ? `${seed} ${quality}` : markers[(offset + index + 1) % markers.length];
  });
  // Search the whole show title; enforce release words on each result title.
  // Forcing BDRip on a modern series (or 1080p on an old VHS show) hid episodes.
  const indexed = (options.seriesTitles || []).slice(0, 3);
  // Bare release markers find programs outside every example/index list.
  const broad = profile.profileKey === "ok-tv-channel" ? ["DVDRip S01", "1080p S02", "BDRip S03", "VHS rip episode", "1080p S04", "4k S01"][offset % 6] : markers[offset % markers.length];
  const movieDepth = options.deep && profile.profileKey === "ok-movie-channel"
    ? [`${1980 + offset % 47} 1080p`, `${1980 + (offset * 7) % 47} BDRip`] : [];
  return Array.from(new Set([broad, ...indexed, ...examples, ...movieDepth])).slice(0, options.deep ? 6 : 4);
}

export function okProgramName(title, kind) {
  let value = String(title || "").replace(/^\[[^\]]+\]\s*/g, "").replace(/[._]+/g, " ");
  const cutoff = kind === "tv" ? /\b(?:s\d{1,2}\s*e\d{1,3}|\d{1,2}x\d{1,3}|season\s*\d+|episode\s*\d+|full episodes?)\b/i
    : /\b(?:19|20)\d{2}\b/;
  value = value.split(cutoff)[0].replace(/\b(?:4k|1080p|bdrip|blu\s*ray|dvd\s*rip|vhs\s*rip|webrip)\b.*$/i, "");
  if (kind === "tv") value = value.replace(/\b(?:19|20)\d{2}\b/g, " ");
  return value.replace(/[()[\]{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
}

export async function okProgramIdentity(item, kind, getJson, cache = new Map()) {
  const name = okProgramName(item.title, kind);
  if (!name) return null;
  const key = `${kind}:${name.toLowerCase()}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    if (kind === "tv") {
      const rows = await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(name)}`);
      const compact = s => String(s || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
      const show = (Array.isArray(rows) ? rows : []).map(row => row.show)
        .find(show => show && compact(show.name) === compact(name) && show.language === "English" && show.type !== "Animation");
      return show ? { language: "en", seriesTitle: show.name, identityReference: show.url, identityProvider: "TVmaze", seriesId: `tvmaze:${show.id}` } : null;
    }
    const year = String(item.title).match(/\b((?:19|20)\d{2})\b/)?.[1];
    const query = new URL("https://www.wikidata.org/w/api.php");
    query.search = new URLSearchParams({ action: "wbsearchentities", search: name, language: "en", type: "item", limit: "5", format: "json" });
    const search = await getJson(query.href);
    const entity = (search.search || []).find(row => /\bfilm\b/i.test(row.description || "") && (!year || String(row.description).includes(year)));
    if (!entity) return null;
    query.search = new URLSearchParams({ action: "wbgetentities", ids: entity.id, props: "claims", format: "json" });
    const data = await getJson(query.href);
    const claims = data.entities?.[entity.id]?.claims;
    const languages = (claims?.P364 || []).map(claim => claim.mainsnak?.datavalue?.value?.id);
    if (!languages.includes("Q1860")) return null;
    return { language: "en", identityReference: `https://www.wikidata.org/wiki/${entity.id}`, identityProvider: "Wikidata" };
  })().catch(() => null));
  return cache.get(key);
}

export function okPublicSearchUrl(query) {
  const url = new URL("https://ok.ru/video/search");
  url.searchParams.set("st.cmd", "anonymVideo");
  url.searchParams.set("st.ft", "search");
  url.searchParams.set("st.m", "SEARCH");
  url.searchParams.set("st.gsq", String(query).slice(0, 120));
  return url.href;
}

export async function okMovieIdentities(items, getJson) {
  const names = items.map(item => {
    const name = okProgramName(item.title, "movie");
    const year = String(item.title).match(/\b(?:19|20)\d{2}\b/)?.[0];
    return { item, year, variants: [name, `${name} (film)`, ...(year ? [`${name} (${year} film)`] : [])] };
  });
  const titles = Array.from(new Set(names.flatMap(row => row.variants)));
  const pages = new Map(), redirects = new Map();
  // Batch identity metadata; never retrieve private data or signed media URLs.
  for (let offset = 0; offset < titles.length; offset += 45) {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.search = new URLSearchParams({ action: "query", titles: titles.slice(offset, offset + 45).join("|"), redirects: "1", prop: "pageprops", format: "json" });
    const data = await getJson(url.href);
    for (const row of [...(data.query?.normalized || []), ...(data.query?.redirects || [])]) redirects.set(row.from, row.to);
    for (const page of Object.values(data.query?.pages || {})) pages.set(page.title, page);
  }
  const matched = names.map(row => ({ ...row, page: row.variants.map(title => {
    const seen = new Set();
    while (redirects.has(title) && !seen.has(title)) { seen.add(title); title = redirects.get(title); }
    return pages.get(title);
  }).find(page => page?.pageprops?.wikibase_item && /\bfilm\b/i.test(page.pageprops["wikibase-shortdesc"] || "") && (!row.year || !(page.pageprops["wikibase-shortdesc"] || "").match(/\b(?:19|20)\d{2}\b/) || String(page.pageprops["wikibase-shortdesc"]).includes(row.year)) && !/documentary|fan[ -]?made|fan film|parody/i.test(page.pageprops["wikibase-shortdesc"] || "") && !("disambiguation" in page.pageprops)) }));
  const ids = Array.from(new Set(matched.map(row => row.page?.pageprops?.wikibase_item).filter(Boolean)));
  const result = new Map();
  if (!ids.length) return result;
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({ action: "wbgetentities", ids: ids.join("|"), props: "claims", format: "json" });
  const data = await getJson(url.href);
  for (const row of matched) {
    const id = row.page?.pageprops?.wikibase_item;
    // Exclude documentary/parody identities even when the upload title looks
    // like a normal feature release. Q93204=documentary, Q622548=parody film.
    const claims = data.entities?.[id]?.claims;
    const genres = (claims?.P136 || []).map(claim => claim.mainsnak?.datavalue?.value?.id);
    if (genres.includes("Q93204") || genres.includes("Q622548")) continue;
    if ((claims?.P364 || []).some(claim => claim.mainsnak?.datavalue?.value?.id === "Q1860"))
      result.set(row.item.id, { language: "en", identityReference: `https://www.wikidata.org/wiki/${id}`, identityProvider: "Wikidata" });
  }
  return result;
}

export function okEpisodeIdentity(title) {
  const value = String(title || "").replace(/[_.:-]+/g, " ");
  const pair = value.match(/\bs\s*(\d{1,2})\s*e\s*(\d{1,3})\b/i)
    || value.match(/\b(\d{1,2})\s*x\s*(\d{1,3})\b/i)
    || value.match(/\bseason\s*(\d{1,2})\s*(?:episode|ep)\s*(\d{1,3})\b/i);
  if (pair) return `s${String(Number(pair[1])).padStart(2, "0")}e${String(Number(pair[2])).padStart(2, "0")}`;
  const episode = value.match(/\b(?:episode|ep)\s*(\d{1,3})\b/i);
  return episode ? `episode${Number(episode[1])}` : "";
}

export function okPlaybackIdentity(item, kind = "tv") {
  if (item.musicVerified && item.identityReference) return item.identityReference;
  const series = item.seriesId || item.seriesTitle || okProgramName(item.title, kind).toLowerCase();
  const episode = okEpisodeIdentity(item.title) || item.episodeIdentity;
  return kind === "tv" && episode ? `${series}:${episode}`
    : kind === "movie" && item.identityReference ? item.identityReference : item.id;
}

// Fair admission: no search page or series can consume the hydration budget.
export function okBalancedCandidates(pages, kind, maximum = 36) {
  const seen = new Set(), buckets = new Map();
  for (let index = 0; index < Math.max(0, ...pages.map(page => page.length)); index++) {
    for (const page of pages) {
      const item = page[index];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      const name = item.musicArtistId || (kind === "tv" && item.seriesId ? item.seriesId : okProgramName(item.title, kind).toLowerCase());
      const identity = kind === "movie" ? `${name}:${String(item.title).match(/\b(?:19|20)\d{2}\b/)?.[0] || ""}` : okPlaybackIdentity(item, kind);
      if (seen.has(`program:${identity}`)) continue;
      seen.add(`program:${identity}`);
      if (!buckets.has(name)) buckets.set(name, []);
      buckets.get(name).push(item);
    }
  }
  const result = [];
  while (result.length < maximum && Array.from(buckets.values()).some(items => items.length)) {
    for (const items of buckets.values()) if (items.length && result.length < maximum) result.push(items.shift());
  }
  return result;
}
