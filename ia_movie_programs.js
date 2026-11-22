/* Feature-film discovery and rotation share original release evidence. The
 * Archive upload date, restoration date and codec never define a film's era. */
const TOPICS = {
  '100': ['science fiction film', 'sci-fi film', 'science fiction movie', 'speculative fiction film'],
  '101': ['horror film', 'horror movie', 'horror feature', 'supernatural horror'],
  '102': ['western film', 'western movie', 'western feature', 'neo-western', 'revisionist western'],
  '103': ['comedy film', 'comedy movie', 'romantic comedy film', 'slapstick comedy'],
  '105': ['black cinema', 'african american cinema', 'black-directed film', 'african american film'],
  '106': ['world cinema', 'international film', 'foreign film', 'international drama', 'non-English film'],
  '108': ['neo-noir', 'film noir', 'detective film', 'murder mystery film', 'crime thriller film'],
  '110': ['cult classic film', 'contemporary classic cinema', 'modern classic film'],
  '111': ['drive-in film', 'grindhouse film', 'exploitation film', 'b-movie', 'cult horror'],
  '112': ['family film', 'family movie', 'family adventure film', 'children’s film', 'family musical'],
  '113': ['arthouse film', 'auteur cinema', 'international drama', 'independent feature'],
  '114': ['martial arts film', 'martial arts movie', 'kung fu film', 'wuxia film', 'hong kong action'],
  '115': ['kaiju film', 'kaiju movie', 'godzilla', 'gamera', 'giant monster film'],
  '117': ['independent feature', 'indie film', 'festival film', 'arthouse feature'],
  '119': ['samurai film', 'samurai movie', 'chanbara', 'jidaigeki'],
  '120': ['spanish cinema', 'mexican cinema', 'cine español', 'cine mexicano', 'latin american film'],
  '124': ['hammer horror', 'hammer films', 'hammer film productions'],
  '125': ['ealing studios', 'ealing comedy'],
  '131': ['british cult film', 'british horror', 'british science fiction', 'british crime film'],
  '132': ['cult film', 'cult horror', 'b movie', 'grindhouse film', 'midnight movie'],
  '135': ['feature film', 'independent feature', 'feature movie', 'indie film'],
  '136': ['horror feature', 'science fiction film', 'action film', 'western film', 'mystery film'],
  '700': ['christmas movie', 'christmas film', 'holiday feature', 'yuletide film'],
  '701': ['halloween film', 'horror film', 'horror movie', 'supernatural horror', 'haunted house film']
};
const PERIOD_OR_FORMAT_CHANNELS = new Set(['104','107','109','116','133','134','575']);
const PERIODS = { '107': [1895,1929,/\bsilent (?:film|movie|cinema|comedy|drama|western)\b/i],
  '109': [1930,1960,/\b(?:film serial|movie serial|chapter play|cliffhanger serial)\b/i],
  '116': [1970,1985,/\b(?:blaxploitation|black exploitation)\b/i] };
const BLACK_FILM = /\b(?:black (?:cinema|independent film|directed|led|exploitation)|african[ -]american (?:cinema|film)|race films?|oscar micheaux|spike lee|kasi lemmons|cheryl dunye|julie dash|john singleton|charles burnett|blaxploitation)\b/i;
const FILM_YEAR = '(?:18[89]\\d|19\\d{2}|20\\d{2})';
const YEAR_TAG = new RegExp('[([]\\s*(' + FILM_YEAR + ')\\s*[),\\]]');
const EXACT_YEAR = new RegExp('^(' + FILM_YEAR + ')(?:-\\d{2}(?:-\\d{2})?)?$');
const RESOLUTION = /\s+(?:480p|720p|1080p|2160p|4k|uhd|h[ .]?26[45]|x26[45]|blu-?ray|webrip|web-dl|dvd[ -]rip|vhs[ -]rip|restored|remastered|colori[sz]ed|full movie|full film)\b.*$/i;

export function archiveMovieChannel(channel) {
  return Object.hasOwn(TOPICS, String(channel)) || PERIOD_OR_FORMAT_CHANNELS.has(String(channel));
}

function yearValue(value) {
  const match = String(value ?? '').trim().match(EXACT_YEAR);
  const year = Number(match?.[1]);
  return year && year <= new Date().getUTCFullYear() ? year : 0;
}

export function archiveMovieReleaseYear(item = {}) {
  const title = String(item.title || '');
  const file = String(item.fileName || item.media?.fileName || '').split('/').pop();
  const filename = file.replace(/\.[a-z0-9]+$/i, '').replace(/[_\.]+/g, ' ');
  const embedded = yearValue(title.match(YEAR_TAG)?.[1]) || yearValue(filename.match(YEAR_TAG)?.[1]) ||
    yearValue(filename.replace(RESOLUTION, '').match(new RegExp('\\s(' + FILM_YEAR + ')$'))?.[1]);
  return yearValue(item.releaseYear) || embedded || yearValue(item.sourceDate) || yearValue(item.date) || yearValue(item.year);
}

export function archiveFilmKey(item) {
  const year = archiveMovieReleaseYear(item);
  let title = String(item.title || '').replace(RESOLUTION, '');
  title = title.replace(new RegExp('\\s*[([]' + year + '[)\\]].*$|\\s+' + year + '$'), '');
  title = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // Generic package names and multi-title uploads have weak cross-upload identity.
  if (!year || title.length < 4 || !/[a-z\p{L}]/u.test(title) ||
      /\b(?:collection|compilation|trilogy|serial|episode|chapter|double feature|disc|unknown|part \d+)\b/i.test(title)) return '';
  return 'film:' + year + ':' + title;
}

export function archiveMovieAllowed(item, channel) {
  const id = String(channel);
  if (!archiveMovieChannel(id)) return true;
  const title = String(item.title || '');
  const label = [title, item.fileName || item.media?.fileName].filter(Boolean).join(' ');
  if (/\b(?:watch[ -]?along|reaction videos?|movie night (?:w(?:ith)?|livestream)|twitch(?: stream)?|streamers? in a horror movie|pirates smp|video essay|featurette|dvd menu|deleted scenes|behind the scenes|fan[ -]?(?:made|film)|podcast|trailer compilation|analysis collection|horror filmography|festival.*\b(?:open|live|satellite) feed|tokusatsu block|fight (?:scenes?|compilation)\b.{0,36}\bcomp(?:ilation)?)\b/i.test(label)) return false;
  const subject = String(item.subject || item.subjects || '');
  const year = archiveMovieReleaseYear(item);
  const period = PERIODS[id];
  if (period && (year ? year < period[0] || year > period[1] : !period[2].test(title + ' ' + subject))) return false;
  if (id === '105' && !BLACK_FILM.test([title, subject, item.creator].filter(Boolean).join(' '))) return false;
  if (id === '102' && /^the year \d{4}\W*$/i.test(title)) return false;
  if (id === '103' && /\bchikan densha\b|^少女惑星/i.test(title)) return false;
  if (id === '112' && /\bcolombian requiem\b/i.test(title)) return false;
  if (id === '131' && /\b(?:fred and rose west|the kneale tapes)\b/i.test(title)) return false;
  if (id === '700' && /\b(?:tv recording|sing[ -]along songs|christmas concert|christmas parade)\b/i.test(title)) return false;
  if (id === '135' || id === '136') return year >= 1980 && !/\b(?:east side kids|bowery boys)\b/i.test(title);
  return true;
}

export function archiveMovieDiscovery(body) {
  const channel = String(body.channel);
  const topics = Object.hasOwn(TOPICS, channel) && TOPICS[channel];
  if (!topics || body.sourceCatalog === true || body.iaRepair !== true) return body;
  const current = new Date().getUTCFullYear();
  const terms = topics.map(topic => '"' + topic + '"').join(' OR ');
  const featureCollection = ['135', '136'].includes(String(body.channel))
    ? '(subject:(' + terms + ') OR (collection:feature_films AND title:(' + terms + ')))'
    : 'subject:(' + terms + ')';
  const era = (start, end) => 'mediatype:movies AND year:[' + start + ' TO ' + end + '] AND ' + featureCollection;
  const original = Array.isArray(body.queries) ? body.queries : [];
  const queries = [original[0], era(2000, current), era(1980, 1999), original[1],
    era(2010, 2019), era(2020, current), original[2]];
  const themeTerms = [...new Set([...(Array.isArray(body.themeTerms) ? body.themeTerms : []), ...topics])].slice(0, 256);
  return { ...body, archiveMovieEraMix: true, themeTerms, queries: [...new Set(queries.filter(Boolean))].slice(0, 8) };
}

export function balanceArchiveMovieEras(items, history = []) {
  const band = year => !year ? 3 : year >= 2000 ? 0 : year >= 1980 ? 2 : 1;
  const decades = [new Map(), new Map(), new Map(), new Map()];
  const lastBand = [-1, -1, -1, Infinity], lastDecade = new Map();
  items.forEach(item => {
    const year = archiveMovieReleaseYear(item), decade = Math.floor(year / 10) * 10, map = decades[band(year)];
    if (!map.has(decade)) map.set(decade, []);
    map.get(decade).push(item);
  });
  history.forEach((item, index) => {
    const year = archiveMovieReleaseYear(item);
    if (!year) return;
    lastBand[band(year)] = index;
    lastDecade.set(Math.floor(year / 10) * 10, index);
  });
  const order = [0, 1, 2, 3].sort((a, b) => lastBand[a] - lastBand[b]);
  const queues = decades.map(map => {
    const groups = [...map.entries()].sort(([a], [b]) => (lastDecade.get(a) ?? -1) - (lastDecade.get(b) ?? -1));
    const result = [];
    for (let index = 0, depth = Math.max(0, ...groups.map(([, rows]) => rows.length)); index < depth; index++) {
      for (const [, rows] of groups) if (rows[index]) result.push(rows[index]);
    }
    return result;
  });
  const result = [];
  for (let index = 0, depth = Math.max(...queues.map(rows => rows.length)); index < depth; index++) {
    for (const key of order) if (queues[key][index]) result.push(queues[key][index]);
  }
  return result;
}
