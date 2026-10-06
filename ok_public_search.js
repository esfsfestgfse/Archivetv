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
    for (const row of props.videos?.list || []) {
      const movie = row.movie;
      if (!movie || movie.blocked || movie.paid || row.warning || !/^\d+$/.test(String(movie.id || "")) || seen.has(String(movie.id))) continue;
      seen.add(String(movie.id));
      rows.push({ ...movie, permalink: `https://ok.ru/video/${movie.id}`,
        description: movie.description || row.description || "",
        // Search results use milliseconds; the embed metadata uses seconds.
        duration_seconds: Number(movie.duration) / 1000,
        title: movie.title || row.name || "" });
    }
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

export function okTitleSearchQueries(profile, rotation = 0) {
  const markers = profile.profileKey === "ok-movie-channel"
    ? ["yts", "bdrip", "blu-ray", "dvd rip", "vhs rip", "1080p movie", "4k movie"]
    : ["S01E01 1080p", "S02E01 DVDRip", "S01 BDRip", "S03 1080p", "tv series dvd rip", "sitcom 1080p", "television VHS rip"];
  const seeds = profile.profileKey === "ok-tv-channel"
    ? ["The Twilight Zone", "The Fugitive", "Taxi", "I Love Lucy", "The Andy Griffith Show", "The Beverly Hillbillies", "Miami Vice", "Knight Rider", "MacGyver", "The X Files", "Friends", "Seinfeld", "The Sopranos", "The Wire", "Breaking Bad", "The Office", "Parks and Recreation", "Law and Order", "Murder She Wrote", "Columbo", "Gunsmoke", "Perry Mason", "The Dick Van Dyke Show", "The Mary Tyler Moore Show", "Dallas", "Dynasty", "The Rockford Files", "Bonanza"]
    : ["Batman", "Batman and Robin", "Tombstone", "The Godfather", "Scarface", "Goodfellas", "The Shawshank Redemption", "Pulp Fiction", "The Matrix", "Jurassic Park", "Back to the Future", "Die Hard", "The Terminator", "Aliens", "Predator", "Rocky", "Rambo", "Top Gun", "The Blues Brothers", "The Goonies", "The Breakfast Club", "The Lost Boys", "Heat", "Casino", "Se7en", "Fight Club", "The Green Mile", "The Departed", "The Dark Knight", "Inception", "Interstellar", "John Wick"];
  const offset = Math.abs(Math.floor(Number(rotation) || 0));
  // A broad query always accompanies title examples: examples are not a whitelist.
  return [markers[offset % markers.length], ...Array.from({ length: 3 }, (_, index) => {
    const seed = seeds[(offset * 3 + index) % Math.max(1, seeds.length)];
    const quality = profile.profileKey === "ok-tv-channel" ? ["1080p", "DVDRip", "DVDRip"][index] : ["1080p", "1080p", "1080p"][index];
    return seed ? `${seed} ${quality}` : markers[(offset + index + 1) % markers.length];
  })];
}

export function okProgramName(title, kind) {
  let value = String(title || "").replace(/^\[[^\]]+\]\s*/g, "").replace(/[._]+/g, " ");
  const cutoff = kind === "tv" ? /\b(?:s\d{1,2}\s*e\d{1,3}|\d{1,2}x\d{1,3}|season\s*\d|episode\s*\d|full episodes?)\b/i
    : /\b(?:19|20)\d{2}\b/;
  value = value.split(cutoff)[0].replace(/\b(?:4k|1080p|bdrip|blu\s*ray|dvd\s*rip|vhs\s*rip|webrip)\b.*$/i, "");
  return value.replace(/[()[\]{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
}

export async function okProgramIdentity(item, kind, getJson, cache = new Map()) {
  const name = okProgramName(item.title, kind);
  if (!name) return null;
  const key = `${kind}:${name.toLowerCase()}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    if (kind === "tv") {
      const rows = await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(name)}`);
      const compact = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

// Fair admission: no search page or series can consume the hydration budget.
export function okBalancedCandidates(pages, kind, maximum = 36) {
  const seen = new Set(), buckets = new Map();
  for (let index = 0; index < Math.max(0, ...pages.map(page => page.length)); index++) {
    for (const page of pages) {
      const item = page[index];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      const name = okProgramName(item.title, kind).toLowerCase();
      const episode = kind === "tv" ? String(item.title).match(/\b(?:s\d{1,2}\s*e\d{1,3}|\d{1,2}x\d{1,3})\b/i)?.[0] : "";
      const identity = kind === "movie" ? `${name}:${String(item.title).match(/\b(?:19|20)\d{2}\b/)?.[0] || ""}` : `${name}:${episode || item.id}`;
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
