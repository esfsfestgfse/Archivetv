/* Music admission only; discovery/storage/player are the shared OK engine.
 * Artist rails broaden over time. A rail is NOT release-year evidence. */
export const OK_SOUL_ARTISTS = Object.freeze([
  'Janet Jackson', 'Whitney Houston', 'TLC', 'Aaliyah', 'Usher', 'Missy Elliott',
  'New Edition', 'En Vogue', 'SWV', 'Boyz II Men', 'Mary J. Blige', 'Brandy',
  'Monica', 'Toni Braxton', 'Bobby Brown', 'Bell Biv DeVoe', 'Jodeci', 'Keith Sweat',
  'Sade', 'Anita Baker', 'Luther Vandross', 'Chaka Khan', 'Prince', 'Michael Jackson',
  'Run-DMC', 'Public Enemy', 'LL Cool J', 'Salt-N-Pepa', 'Queen Latifah', 'MC Lyte',
  'De La Soul', 'A Tribe Called Quest', 'OutKast', 'Lauryn Hill', 'The Fugees',
  'Tupac', '2Pac', 'The Notorious B.I.G.', 'Nas', 'Common', 'Busta Rhymes',
  'Jay-Z', 'Snoop Dogg', 'Dr. Dre', 'Destiny\'s Child', 'Beyonce', 'Beyoncé',
  'Alicia Keys', 'Erykah Badu', 'D\'Angelo', 'Maxwell', 'Jill Scott', 'India.Arie',
  'Ciara', 'Ashanti', 'Nelly', 'Ludacris', 'Kanye West', 'Ne-Yo', 'Rihanna',
  'Earth, Wind & Fire', 'Kool & The Gang', 'Lionel Richie', 'Teena Marie',
]);
export const OK_COUNTRY_ARTISTS = Object.freeze([
  'George Strait', 'Reba McEntire', 'Alan Jackson', 'Randy Travis',
  'Clint Black', 'Dwight Yoakam', 'Vince Gill', 'Patty Loveless',
  'Garth Brooks', 'Brooks & Dunn', 'Travis Tritt', 'Mark Chesnutt',
  'Joe Diffie', 'Tanya Tucker', 'Ricky Skaggs', 'Sawyer Brown',
  'Alabama', 'The Oak Ridge Boys', 'Kathy Mattea', 'Mary Chapin Carpenter',
  'Shania Twain', 'Faith Hill', 'Tim McGraw', 'Kenny Chesney',
  'Toby Keith', 'Trace Adkins', 'Brad Paisley', 'Keith Urban',
  'Joe Nichols', 'Martina McBride', 'Lee Ann Womack', 'LeAnn Rimes',
  'Wynonna', 'Trisha Yearwood', 'Carrie Underwood', 'Sugarland',
  'Lady Antebellum', 'Dixie Chicks', 'Josh Turner', 'Dierks Bentley',
  'Rodney Atkins', 'Big & Rich', 'Gretchen Wilson', 'Lonestar',
  'Montgomery Gentry', 'Rascal Flatts', 'John Michael Montgomery', 'Mel McDaniel',
  'Don Williams', 'Dolly Parton', 'Kenny Rogers', 'Johnny Cash',
  'Willie Nelson', 'Waylon Jennings', 'Steve Earle', 'Rosanne Cash',
  'Steve Wariner', 'Collin Raye', 'Deana Carter', 'Mindy McCready',
  'Tracy Lawrence', 'David Lee Murphy', 'Suzy Bogguss', 'Hank Williams Jr.',
  'Restless Heart', 'Diamond Rio', 'Pam Tillis', 'Lorrie Morgan',
  'The Judds', 'Rick Trevino', 'Gary Allan', 'Chris LeDoux',
  'Billy Ray Cyrus', 'BlackHawk', 'Little Texas', 'Emmylou Harris',
  'Nitty Gritty Dirt Band', 'SHeDAISY', 'Phil Vassar', 'Tracy Byrd',
]);
const MUSIC_FAMILIES = Object.freeze({'ok-soul-flow-channel':'soul','ok-country-video-channel':'country'});
const ARTISTS = [...OK_SOUL_ARTISTS, ...OK_COUNTRY_ARTISTS];
const DENY = /\b(?:lyrics?|live|concert|reaction|review|podcast|interview|tutorial|trailer|teaser|cover|karaoke|remix|bootleg|dj[ -]?edit|tribute|slideshow|mashup|parody|fan[ -]?(?:made|edit|video|film)|unofficial|audio[ -]?only|visualizer|shorts?|vertical|dance practice|behind the scenes|making of|music city tonight|nashville now|austin city limits|grand ole opry|cmt crossroads|farm aid|tnn)\b/i;
const FOREIGN = /[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff]|\b(?:vostfr|subesp|dublado|latino|espa[nñ]ol|fran[cç]ais)\b/i;
const MBID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function okMusicChannel(profile) { return Object.hasOwn(MUSIC_FAMILIES,profile?.profileKey || ''); }
export function okMusicQueries(profile, cursor = 0) {
  if (!okMusicChannel(profile)) return [];
  const artists = MUSIC_FAMILIES[profile.profileKey] === 'country' ? OK_COUNTRY_ARTISTS : OK_SOUL_ARTISTS;
  return Array.from({ length: 4 }, (_, i) => `${artists[(Math.abs(Math.floor(cursor)) * 4 + i) % artists.length]} music video`);
}
export function okMusicTitle(title) {
  const input = String(title || '').trim();
  const artist = [...ARTISTS].sort((a,b) => b.length-a.length).find(name => normalize(input.slice(0, name.length)) === normalize(name) && /^[\s\-–—_:,.]+/.test(input.slice(name.length)));
  if (!artist) return null;
  const song = input.slice(artist.length).replace(/^[\s\-–—_:,.]+/, '')
    .replace(/\([^)]*(?:official|music video|remaster|\b(?:19|20)\d{2}\b|\b(?:hd|hq|4k|1080p|720p)\b)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(?:official(?: music)? video|music video|official|remastered|hd|hq|4k|1080p|720p)\b.*$/i, '')
    .replace(/\b(?:feat\.?|ft\.?)\s+.*$/i, '')
    .replace(/["“”]/g, '').replace(/\s*\((?:\d+)\)\s*$/, '').replace(/[\s\-_:,]+$/, '').trim();
  return song && song.length <= 160 ? { artist, song, key: normalize(artist) + ':' + normalize(song) } : null;
}
export function okMusicPrecheck(profile, item, checkAspect = true) {
  const title = okMusicTitle(item?.title);
  const artists = MUSIC_FAMILIES[profile?.profileKey] === 'country' ? OK_COUNTRY_ARTISTS : OK_SOUL_ARTISTS;
  return okMusicChannel(profile) && !!item && !!item.id && !!title && artists.includes(title.artist)
    && Number(item.duration) >= 120 && Number(item.duration) <= 900
    && (!checkAspect || Number(item.aspectRatio) >= 1.2)
    && !DENY.test(String(item.title || '')) && !FOREIGN.test(String(item.title || ''));
}
export function okMusicIdentityFromResults(item, result) {
  const title = okMusicTitle(item.title);
  if (!title) return null;
  const records = (result?.recordings || []).filter(record => {
    const artist = record['artist-credit']?.[0]?.artist;
    const credit = record['artist-credit']?.[0]?.name || artist?.name;
    return MBID.test(record.id || '') && MBID.test(artist?.id || '')
      && normalize(record.title) === normalize(title.song)
      && [credit, artist?.name, ...(artist?.aliases || []).map(x => x.name)].some(x => normalize(x) === normalize(title.artist))
      && /^\d{4}/.test(record['first-release-date'] || '')
      && !/live|remix|dj[ -]?mix|karaoke|cover|bootleg/i.test(record.disambiguation || '');
  }).sort((a,b) => String(a['first-release-date']).localeCompare(String(b['first-release-date'])) || a.id.localeCompare(b.id));
  const record = records[0];
  if (!record) return null;
  const year = Number(record['first-release-date'].slice(0,4));
  if (year < 1980 || year > 2009) return null;
  return { musicVerified: true, musicVerificationVersion: 2, musicFamily: OK_COUNTRY_ARTISTS.includes(title.artist) ? 'country' : 'soul', musicArtist: title.artist,
    musicArtistId: record['artist-credit'][0].artist.id, musicTrack: title.song,
    musicTrackKey: title.key, musicRecordingId: record.id, musicReleaseYear: year,
    year: String(year), language: 'en', seriesId: 'musicbrainz:' + record['artist-credit'][0].artist.id,
    seriesTitle: title.artist, identityProvider: 'MusicBrainz',
    identityReference: 'https://musicbrainz.org/recording/' + record.id };
}
export function okMusicVerified(profile, item) {
  const title = okMusicTitle(item?.title);
  return okMusicPrecheck(profile,item) && item.musicVerified === true && item.musicVerificationVersion === 2
    && (item.musicFamily || 'soul') === MUSIC_FAMILIES[profile.profileKey]
    && title?.key === item.musicTrackKey && MBID.test(item.musicArtistId || '') && MBID.test(item.musicRecordingId || '')
    && item.musicReleaseYear >= 1980 && item.musicReleaseYear <= 2009
    && item.identityReference === 'https://musicbrainz.org/recording/' + item.musicRecordingId
    && item.embedAllowed === true && /^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/.test(item.embedUrl || item.url || '');
}
/* Only background maintenance consults MusicBrainz. Known track identities
 * survive provider outages in D1; viewer requests never wait on this service. */
export async function okMusicIdentities(items, known, fetchJson) {
  const cache = new Map(known.filter(x => x.musicVerified && x.musicVerificationVersion === 2 && x.musicTrackKey).map(x => [x.musicTrackKey,x]));
  const artistIds = new Map(known.filter(x => MBID.test(x.musicArtistId || '')).map(x => [normalize(x.musicArtist),x.musicArtistId]));
  const identities = new Map();
  let lookups = 0, lastLookup = 0;
  const deadline = Date.now() + 20000;
  async function request(query) {
    const delay = Math.max(0,lastLookup + 1100 - Date.now());
    if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
    if (Date.now() > deadline) throw new Error('music discovery window exhausted');
    lastLookup = Date.now();
    return fetchJson('https://musicbrainz.org/ws/2/recording/?fmt=json&limit=100&query=' + encodeURIComponent(query + ' AND status:official AND NOT comment:live AND NOT comment:remix AND NOT comment:mix AND NOT comment:rehearsal'));
  }
  for (const item of items) {
    const title = okMusicTitle(item.title);
    if (!title) continue;
    let identity = cache.get(title.key);
    if (!cache.has(title.key) && lookups < 12 && Date.now() < deadline) {
      lookups++;
      const quote = value => '"' + value.replace(/["\\]/g,' ') + '"';
      try {
        let artistId = artistIds.get(normalize(title.artist));
        if (!artistId) {
          const initial = await request('recording:' + quote(title.song) + ' AND artist:' + quote(title.artist));
          const match = (initial.recordings || []).find(row => normalize(row.title) === normalize(title.song) && (row['artist-credit'] || []).some(x => [x.name,x.artist?.name,...(x.artist?.aliases || []).map(a=>a.name)].some(name=>normalize(name)===normalize(title.artist))));
          artistId = match?.['artist-credit']?.[0]?.artist?.id;
          if (MBID.test(artistId || '')) artistIds.set(normalize(title.artist),artistId);
        }
        if (artistId) {
          const result = await request('recording:' + quote(title.song) + ' AND arid:' + artistId);
          // A partial search page cannot certify an original release date.
          identity = Number(result.count || 0) <= 100 ? okMusicIdentityFromResults(item,result) : null;
        }
      } catch (_) { identity = null; }
      cache.set(title.key, identity);
    }
    if (identity) {
      const keys = ['musicVerified','musicVerificationVersion','musicFamily','musicArtist','musicArtistId','musicTrack','musicTrackKey','musicRecordingId','musicReleaseYear','year','language','seriesId','seriesTitle','identityProvider','identityReference'];
      identities.set(item.id, Object.fromEntries(keys.map(key => [key, identity[key]])));
    }
  }
  return identities;
}
