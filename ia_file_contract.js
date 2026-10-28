/* File qualification is distinct from discovery and from decoded-frame
   telemetry. Transport verification never claims device decode success. */
const SHORT_FORM = new Set(['13', '236', '501', '509']);
// Complete original cartoons, not arbitrary short uploads. The relay has the
// same reviewed collection identities; admission parity is covered by tests.
const COMPLETE_CARTOON_SHORT_PARENTS = new Set([
  'looney-tunes-complete', 'popeye-the-sailor-the-complete-series',
  'the-pink-panther-cartoon-collection', 'roger-ramjet', 'felix-the-cat-1959',
  '017-betty-boop-rudy-vallee-melodies-1932-screen-songs-ld-rip',
  'woody-woodpecker-filmography', 'dudley-do-right-complete-720-540',
  'tennessee-tuxedo-season-1', 'tennessee-tuxedo-season-2', 'tennessee-tuxedo-season-3',
  'walt-disneys-silly-symphonies-the-complete-collection-1929-39',
  'WDTWaveTwo_TheCompleteGoofy', 'WDTWaveFour_TheCompletePluto',
  'mighty-mouse_202305', 'colonelbleep_s1',
]);
const INTERNATIONAL = new Set(['106', '107', '114', '115', '119', '120', '151']);
const FEATURES = new Set(['100', '101', '102', '103', '105', '106', '108', '110', '111', '112', '114', '115', '116', '119', '120', '124', '125', '132', '135', '701']);

// A narrow, synchronous admission gate for old catalogs and playback caches.
// Unknown geometry/runtime is not a violation; full file qualification remains
// a separate step. Original cartoon shorts and ordinary TV satire are allowed.
export function iaKnownVideoPolicyViolation(item = {}, rules = {}) {
  const meta = item.meta || {}, media = item.media || meta.media || {};
  if (String(media.type || item.type || item.mediaType || item.mediatype || meta.mediatype || '').toLowerCase() === 'audio') return false;
  const channel = String(rules.channel || '');
  if (channel) {
    const features = ['100','101','102','103','105','106','108','110','111','112','114','115','116','119','120','124','125','132','135','701'];
    const shorts = ['13','236','501','509'];
    const floor = Math.max(Number(rules.minRuntimeSeconds) || 0, channel === '150' ? 120 : shorts.includes(channel) ? 0 : features.includes(channel) ? 3600 : 900);
    // A selected child with missing/short metadata must not borrow the parent runtime.
    const fileRuntime = ['runtime','duration','length'].some(key => Object.prototype.hasOwnProperty.call(media,key));
    const value = fileRuntime ? media.runtime || media.duration || media.length : item.runtimeSeconds || item.durationSeconds || item.duration || item.runtime || meta.runtimeSeconds || meta.durationSeconds || meta.duration || meta.runtime;
    const parts = String(value || '').split(':').map(Number);
    const runtime = parts.every(Number.isFinite) ? parts.reduce((total,part) => total * 60 + part,0) : 0;
    if (runtime > 0 && runtime < floor) return true;
    const international = ['106','107','114','115','119','120','151'];
    const language = String(media.language || item.language || meta.language || '').trim().toLowerCase();
    if (!international.includes(channel) && language && !/^(?:und|unknown|undetermined|n\/a)$/.test(language)
      && !/(?:^|[,; /])(?:eng|en(?:[-_][a-z]+)?|english)(?:$|[,; /])/.test(language)) return true;
  }
  const width = Number(media.width || item.width || item.videoWidth) || 0;
  const height = Number(media.height || item.height || item.videoHeight) || 0;
  const ratio = Number(media.aspectRatio || item.aspectRatio) || 0;
  if ((width > 0 && height >= width) || (ratio > 0 && ratio <= 1)) return true;
  const text = [item.title, item.description, item.subject, item.subjects, item.fileName, media.fileName,
    item.identifier || item.id, meta.title, meta.subject, meta.subjects].filter(Boolean).join(' ')
    .replace(/<[^>]+>/g, ' ').normalize('NFKD').toLowerCase().replace(/[_-]+/g, ' ');
  return /\b(?:pod\s?casts?|vodcasts?|fan\s?(?:made|film|movie|edit|production|fic)|reaction video)\b|\b(?:portrait|vertical)\s+(?:video|format|orientation|mode|footage|clip)\b|\b(?:shot|filmed|recorded|uploaded) in (?:portrait|vertical)\b|9\s*:\s*16|1080\s*[x×]\s*1920|#shorts\b|\byoutube shorts\b/.test(text)
    || /\b(?:unofficial|homemade|bootleg)\b.{0,48}\b(?:film|movie|feature|parody|remake|reconstruction)\b|\b(?:film|movie|feature|parody|remake|reconstruction)\b.{0,48}\b(?:unofficial|homemade|bootleg)\b/.test(text);
}

export function iaReviewedFileAllowed(item, channel) {
  if (!item || typeof item !== 'object') return false;
  const media = item.media || {}, id = String(item.identifier || item.id || '');
  const source = String(media.sourceIdentifier || item.sourceIdentifier || id.split('::')[0]).replace(/^ia:/i, '');
  let file = String(media.fileName || item.fileName || id.split('::')[1] || '');
  if (!file) { try { file = decodeURIComponent(new URL(media.url || item.mediaUrl || item.url).pathname.split('/').pop()); } catch (_) {} }
  file = file.split('/').pop();
  // This parent's numbered original MP4 names were playlist labels, not files.
  // Only the separately listed numbered .ia.mp4 derivatives actually exist.
  if (source === 'halloween-cartoon-collection_20231022' && /^\d{2}-(?:19|20)\d{2}\b/.test(file) && !/\.ia\.mp4$/i.test(file)) return false;
  // A saved episode must never play another child while retaining its title.
  // Origin/encoding alternatives may differ; the Archive parent and program may not.
  const selected = String(media.fileName || item.fileName || id.slice(id.indexOf('::') + 2));
  if (source === 'colonialnaturalist' && /^colonialnaturalistreel[12]\.mp4$/i.test(selected)) return false;
  if (source === 'mr.-rhodes-s-1e-08-looking-for-mrs.-goodbar-episode-8' && selected === 'Mr Rhodes- s1e06 - Huge - Mr Rhodes - 1.06.ia.mp4') return false;
  if (id.includes('::') && /\.(?:mp4|m4v|webm|ogv|mov|mp3|ogg|m4a|flac)$/i.test(selected)) {
    const decode = value => { try { return decodeURIComponent(value); } catch (_) { return value; } };
    const program = value => String(value).replace(/(?:\.ia)?\.(?:mp4|m4v|webm|ogv|mov|mp3|ogg|m4a|flac)$/i, '').replace(/[._-](?:512kb|h264|h\.264|mpeg4|avc)$/i, '');
    const urls = [media.url || item.mediaUrl || item.url].concat(media.alts || item.alts || []).filter(Boolean);
    for (const url of urls) {
      const path = String(url).match(/^https?:\/\/(?:[a-z0-9.-]+\.)?archive\.org\/(?:download|\d+\/items)\/([^/]+)\/([^?#]+)/i);
      if (path && (decode(path[1]) !== id.split('::')[0].replace(/^ia:/i, '') || program(decode(path[2])) !== program(selected))) return false;
    }
  }
  // This DVD parent has continuation chunks; title _1 alone is not a full episode.
  if (source === 'vts-01-1_20231104' && (!file || /^VTS_\d+_\d+(?:\.ia)?\.mp4$/i.test(file))) return false;
  const identity = [item.title, source, file].join(' ').toLowerCase().replace(/[_-]+/g, ' ');
  if (String(channel) === '209') {
    // Collection subjects describe every sibling together. They cannot qualify
    // Peeping Tom just because another film is about missing aircraft.
    const topic = /\b(?:aviation|aircraft|airplanes?|aeroplanes?|airships?|airlines?|airports?|aviators?|helicopters?|zeppelins?|air\s+forces?|flight|flying fortress|fighter jets?|corsair|tomcat|vulcan bomber|dogfights?)\b/i;
    const title = String(item.title || '').replace(/[_-]+/g, ' '), parts = title.split(/\s+·\s+/);
    const child = parts.length > 1 ? parts[parts.length - 1] : title;
    const fileTitle = file.replace(/(?:\.ia)?\.[^.]+$/, '').replace(/[._-]+/g, ' ');
    const genericChild = /^(?:(?:episode|ep|part|reel|disc|disk|video|chapter)\s*\d+[a-z]?|\d+)$/i.test(child.trim());
    const reviewed = (source === 'cstmaah_000052' && /^cstmaah_000052_access(?:\.ia)?\.mp4$/i.test(file))
      || (source === 'ARC-39163' && /^ARC-39163(?:\.ia)?\.mp4$/i.test(file))
      || (source === '33-312' && /^33-312-r1(?:\.ia)?\.mp4$/i.test(file))
      || (source === '200594_Hawaii_at_Your_Wingtip' && file === '200594_Hawaii_at_Your_Wingtip_master.intros.mp4')
      || (source === 'the-big-plane-trip-b-1-t-00' && file === 'THE_BIG_PLANE_TRIP-B1_t00.ia.mp4');
    if (/\b(?:commission(?:ers)?|authority|council|board)\s+(?:meetings?|sessions?)\b|\b(?:phone|airplane mode)\b/i.test(child)) return false;
    if (!reviewed && !topic.test(child) && !topic.test(fileTitle)
      && !(parts.length > 1 && genericChild && topic.test(parts.slice(0, -1).join(' ')))) return false;
  }
  // Actor/show names also appear in long discussion programs. Their format
  // identity must not pass as an episode merely because the subject names a sitcom.
  if (String(channel) === '10' && /\b(?:american tv with mitchell hadley|(?:television|tv|sitcom) (?:history )?(?:discussion|retrospective|video essay|analysis)|(?:discussion|retrospective|video essay) (?:about|of) (?:classic )?(?:television|tv|sitcoms?))\b/.test(identity)) return false;
  // Classify the selected program's format, including persisted subject tags.
  // Incidental description links are not genre evidence. Real eyewitness
  // interviews remain eligible; gaming streams and movie publicity do not.
  if (String(channel) === '234') {
    const disasterFormat = [identity,item.subject,item.subjects,item.tags,item.meta && item.meta.title,item.meta && item.meta.subject,item.meta && item.meta.subjects,item.meta && item.meta.tags].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g,' ');
    if (/\b(?:on[ -]set interviews?|(?:movie|film|cast) interviews?|(?:movie|film) (?:trailers?|reviews?|recaps?)|roblox|minecraft|fortnite|war thunder|gameplay|walkthrough|playthrough|speedrun|video games?|twitch(?: ?vod)?|literacy gap)\b/.test(disasterFormat)) return false;
  }
  // A traditional cultural performance is not Saturday-morning children's TV.
  if (String(channel) === '158') {
    if (source.toLowerCase() === 'indonesianpuppetshow') return false;
    // Generic puppet recordings need actual television-program evidence.
    // Do not mistake community/church performances for Saturday-morning TV.
    const puppetFormat = [identity,item.subject,item.subjects,item.seriesTitle,item.meta && item.meta.title,item.meta && item.meta.subject,item.meta && item.meta.subjects].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g,' ');
    if (/\bpuppet(?:ry)? shows?\b/.test(puppetFormat)
      && !/\b(?:television|tv series|sesame street|muppets?|colby['’]?s clubhouse|lamb chop|shari lewis|mister rogers|mr\.? rogers|fraggle rock|eureeka['’]?s castle|allegra['’]?s window)\b/.test(puppetFormat)) return false;
  }
  // Channel-specific editorial evidence must survive stale catalogs and files.
  // A racing subject tag does not turn the 2001 fictional feature into a race.
  if (String(channel) === '54' && /\bdriven\s*\(?2001(?:\)|\b)/.test(identity)) return false;
  if (String(channel) === '54' && /\b(?:\d{1,2}\s+news|news\s+at\s+\d|eyewitness news|nightly news|world news|newscast|television news|news broadcast|journal televise|slide\s*show|watching videos|nascar or gamba|gone in (?:sixty|60) seconds|halicki)\b/.test(identity)) return false;
  if (String(channel) === '225') {
    // A comedian appearing in an interview or podcast is not a stand-up/sketch
    // programme. Use show-format identity, not a guest's name or promo footer.
    const comedyFormat = [identity,item.subject,item.subjects,item.meta && item.meta.subject,item.meta && item.meta.subjects,media.sourceTitle].filter(Boolean).join(' ').toLowerCase();
    if (/\b(?:h3podcast|h3tv|(?:the\s+)?howard stern show|late night with conan o['’]?\s*brien)\b/.test(comedyFormat)) return false;
    if (/\b(?:black baseball|negro leagues|oprah winfrey|the today show|who wants to see past the bs puppet show)\b/.test(identity)) return false;
    const performer = [identity,source.replace(/([a-z])([A-Z])/g,'$1 $2'),item.seriesTitle,media.sourceTitle,item.meta && item.meta.title,item.creator,item.account,item.meta && item.meta.creator].filter(Boolean).join(' ').toLowerCase();
    if (!/\b(?:def comedy jam|def jam comedy|comic\s?view|in living colou?r|chappelle|richard pryor|eddie murphy|chris rock|martin lawrence|bernie mac|cedric the entertainer|steve harvey|d[.\s]*l[.\s]*hughley|katt williams|redd foxx?|paul mooney|robin harris|eddie griffin|kevin hart|wanda sykes|sommore|adele givens|laura hayes|mo['’]?nique|tiffany haddish|hannibal buress|donald glover|jerrod carmichael|lil rel howery|damon wayans|david alan grier|tommy davidson|tracy morgan|arsenio hall|lavell[e]? crawford|drew fraser|kings of comedy|queens of comedy|key\s*(?:and|&)\s*peele|african american stand[ -]?up|black stand[ -]?up|black sketch comedy)\b/.test(performer)
      && !/\b(?:african american stand[ -]?up|black stand[ -]?up|black sketch comedy)\b/i.test([item.subject,item.subjects,item.meta && item.meta.subject,item.meta && item.meta.subjects].join(' '))
      && !(/\bsinbad\b/.test(performer) && /comedy|stand[ -]?up|afros|bellbottoms|brain damaged|preacher/.test([performer,item.subject,item.subjects].join(' ')))) return false;
  }
  if (String(channel) === '905') {
    if (/\bradio\s+(?:adverts?|advertisements?|commercials?)\b/.test(identity)) return false;
    const editorial = [identity,item.description,item.subject,item.subjects,item.creator,item.meta && item.meta.description,item.meta && item.meta.subject,item.meta && item.meta.subjects].filter(Boolean).join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLowerCase();
    if (source === '477-Robert-Johnson-Kavsaktaki-Adam-17-Agustos-2026' || /\b(?:pod\s?casts?|spoken word|talk shows?|radio documentaries|radio documentary|artist interviews?)\b|babil['’]?\s*den\s+sonra|ruzgar[a]?\s+birakilmis\s+sesler/.test(editorial)) return false;
  }

  if (String(channel) === '83' && /\b(?:gta|grand theft auto|gameplay|roblox|minecraft|news conference|press conference)\b/.test(identity)) return false;
  if (String(channel) === '81' && (source === 'daiwa-fishing-video-fun-to-fish-with-lure_202506'
    || /\b(?:home movies?|hm|fishing for fate|tailwaggers|farming of fish|salmon ranch|neets ?bay|fishing with a cop|drupal|wordpress|web development|software tutorial)\b/.test(identity))) return false;
  if (String(channel) === '128' && (source === 'rebecca-1940-film-noir-thirller-hitchcock'
    || /^032[34]_Little_Journey_to_England_and_France_/.test(source))) return false;
  if (String(channel) === '66' && (source === 'Skateboarding-Live_it_Breath_it_Love_it_Dig_it'
    || (source === 'were-people-too' && /^were_people_too8\.mp4$/i.test(file)))) return false;
  return !(String(channel) === '212' && source === 'the_blue_planet' && /^the_blue_planet_(?:09|1[0-3])(?:[_. -]|$)/i.test(file));
}
export function iaHuntingAllowed(item = {}) {
  if (!item || typeof item !== 'object') return false;
  if (/^HuntingSeason(?:::|$)/i.test(String(item.sourceIdentifier || item.identifier || item.id || ''))) return false;
  // Observed 30-second app advertisement, not a hunting episode. Do not ban
  // the provider's other uploads merely because they share an uploader.
  const source = String(item.media?.sourceIdentifier || item.sourceIdentifier || item.identifier || item.id || '').replace(/^ia:/i, '').split('::')[0];
  if (source === 'youtube-eFJ0FqQIPqc') return false;
  const text = [item.title, item.seriesTitle, item.fileName, item.media?.sourceTitle,
    item.sourceIdentifier, item.identifier || item.id, item.meta?.title]
    .filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g, ' ').replace(/\s+/g, ' ');
  if (/\b(?:frontier fremont|bsd|corrupt justice|ensemble|analysis|party foul|funny or die|lemonparty|this past weekend|theo von|caleb pressley|joy behar|wizardworks|dnr prepares|potential problems|news report|politics|political|bureaucrats?|press conference|interview|dr oz|nightly nuge|podcast|sermon|pastor|church service|concert|music video|good will hunting)\b/.test(text)) return false;
  return /\b(?:hunting|bowhunting|whitetail|buckmasters|monster bucks|realtree|mossy oak|american sportsman|north american hunter|outdoor life)\b/.test(text)
    || (/\bted nugent\b/.test(text) && /\b(?:spirit|call) of the wild\b/.test(text));
}
export function iaCookingAllowed(item = {}) {
  if (!item || typeof item !== 'object') return false;
  const text = [item.title, item.seriesTitle, item.fileName, item.media?.sourceTitle,
    item.sourceIdentifier, item.identifier || item.id, item.meta?.title]
    .filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g, ' ');
  if (/\b(?:office etiquette|secretarial|sewing|laundry|housekeeping|home nursing|dating|good manners|table manners|city council|press conference|megacast|podcast|who is killing the great chefs|pbs member stations nightmare|recipe (?:view|model|app|application)|web development|software tutorial)\b/.test(text)) return false;
  return /\b(?:cook(?:s|ing|ery|house)?|cuisine|culinary|food|chefs?|recipes?|bak(?:e|ing)|pastry|bread|grill(?:ing)?|barbecue|good eats|america['’]?s test kitchen|julia child|jacques p[eé]pin)\b/.test(text);
}
export function iaCourtroomAllowed(item = {}) {
  if (!item || typeof item !== 'object') return false;
  const text = [item.title, item.seriesTitle, item.fileName, item.media?.sourceTitle,
    item.sourceIdentifier, item.identifier || item.id, item.meta?.title]
    .filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g, ' ');
  if (/\b(?:washington week|city council|press conference|political speech|political rally|podcast)\b/.test(text)) return false;
  return /\b(?:judge (?:judy|joe brown|(?:greg )?mathis|wapner|milian|hatchett|alex|faith|jerry)|people'?s court|divorce court|hot bench|small claims (?:court|tv))\b/.test(text);
}
export function iaSportingLifeAllowed(item = {}) {
  if (!item || typeof item !== 'object') return false;
  // This specific legacy recovery upload is a scavenger-hunt fiction film.
  if (/^HuntingSeason(?:::|$)/i.test(String(item.sourceIdentifier || item.identifier || item.id || ''))) return false;
  // Identity comes from the program, not incidental tags on a civic upload.
  const meta = item.meta || {};
  const text = [item.title, item.seriesTitle, item.fileName, item.media?.sourceTitle,
    item.sourceIdentifier, item.identifier || item.id, meta.title].filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g, ' ');
  if (/\b(?:city council|council meeting|committee hearing|press conference|politics|political|concert|full performance|music video|podcast|commercial breaks|logo compilation|drupal|wordpress|web development|software tutorial|ed bassmaster|easy money|good will hunting|funny or die|twitch)\b/.test(text)) return false;
  return /\b(?:fishing|fisherman|hunting|angling|angler|archery|bowhunting|realtree|whitetail|bassmaster|sporting dogs|american sportsman|bill dance|jimmy houston|babe winkelman|orlando wilson|outdoors|outdoor (?:life|adventures?|recreation|competition|sports?))\b/.test(text);
}

export function iaReviewedCartoonSource(raw = {}) {
  return COMPLETE_CARTOON_SHORT_PARENTS.has(normalizeIaFileRecord(raw).sourceIdentifier);
}

export function iaGameShowYear(item = {}) {
  // Episode filenames and dates describe the broadcast; Archive year often
  // describes a recent upload of a much older collection.
  for (const text of [normalizeIaFileRecord(item).fileName, item.title]) {
    const years = [...String(text || '').matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?=[^0-9]|$)/g)]
      .map(match => Number(match[1])).filter(year => year >= 1940 && year <= 2026);
    if (years.length && new Set(years.map(year => year < 1980)).size === 1) return years[0];
  }
  return Number(item.broadcastYear || item.year) || 0;
}

export function iaModernGameShowAllowed(item = {}) {
  const meta = item.meta || {};
  const text = [item.identifier || item.id, item.sourceIdentifier, item.title, item.seriesTitle,
    item.fileName || item.media?.fileName, item.subject, item.subjects, meta.title, meta.subject, meta.subjects].filter(Boolean).join(' ').replace(/[_./-]+/g, ' ').replace(/['’]/g, '');
  if (/\b(?:nickelodeon|nick arcade|guts|figure it out|double dare|legends of the hidden temple|family game night|finders keepers|get the picture|make the grade|wild and crazy kids|brainsurge|brain surge|fun house|funhouse|masters of the maze|junior jeopardy|kids? (?:week|game shows?|edition|tournament)|teen (?:week|tournament|edition)|philippines|filipino|tagalog|family feud ph|concentration camps?|major fraud|podcast|reaction|documentary|retrospective|press conference)\b/i.test(text)) return false;
  // A phrase anywhere in an upload is not a show identity: e.g. a camp
  // documentary is not Concentration, nor a news headline Deal or No Deal.
  return [item.seriesTitle, item.title, meta.title, item.sourceIdentifier, item.identifier || item.id].filter(Boolean).some(value => {
    const identity = String(value).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(?:the )?(?:new )?/, '');
    return /^(?:(?:19|20)\d{2} )?(?:price is right|wheel of fortune|jeopardy|family feud|who wants to be a millionaire|millionaire|deal or no deal|press your luck|supermarket sweep|match game|weakest link|divided|crystal maze|chase|catch 21|lingo|card sharks|(?:\d+ )*pyramid|hollywood squares|newlywed game|classic concentration|concentration|sale of the century|tic tac dough|jokers wild|(?:super )?password(?: plus)?|lets make a deal|greed|1 vs 100|win ben steins money|tpir)\b/.test(identity);
  });
}

export function iaGameShowEraAllowed(item, channel) {
  if (!['12', '22'].includes(String(channel))) return true;
  if (String(channel) === '22' && !iaModernGameShowAllowed(item)) return false;
  const text = [item.title,item.subject,item.description,item.fileName].filter(Boolean).join(' ');
  if (/\b(?:cryptography|cryptographic|password cracking|password manager|change password|reset password|aula|computer tutorial|software tutorial)\b/i.test(text)) return false;
  if (/\b(?:gmod|garry.?s mod|roblox|minecraft|gameplay|walkthrough|speedrun|podcast|reaction|parody|fan[- ]?made|mock game|video essay|retrospective|press conference|interactive dvd|dvd game)\b/i.test(text)) return false;
  const year = iaGameShowYear(item);
  return String(channel) === '12' ? year >= 1940 && year <= 1979 : year >= 1980 && year <= 2026;
}

export function iaMinimumFileRuntimeSeconds(rules = {}) {
  if (Array.isArray(rules.mediaTypes) && rules.mediaTypes.length && !rules.mediaTypes.includes('movies') && !rules.mediaTypes.includes('video')) return 0;
  const requested = Math.max(0, Number(rules.minRuntimeSeconds) || 0), channel = String(rules.channel || '');
  if (channel === '150') return Math.max(requested, 120);
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

// Publisher-specific identity proof; never merge unrelated same-title uploads.
function iaReviewedEpisodeKey(sourceIdentifier, fileName) {
  const source = String(sourceIdentifier || '').toLowerCase().replace(/^ia:/, '');
  const raw = String(fileName || '').split('/').pop().toLowerCase().replace(/(?:\.ia)?\.(?:mp4|m4v|webm|ogv)$/, '');
  const stem = raw.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (source === 'the-september-sessions' && ['the september sessions',
    'the september sessions the tommorowland story brought to life in brilliant 16mm film'].includes(stem)) return 'the september sessions';
  if (source !== '411-vm-skateboarding-videos' || /\b(?:disc|part)\s*\d+/.test(stem)) return '';
  const volume = raw.match(/\b411vm[ _-]*(\d+)\.(\d+)/);
  if (volume) return '411vm volume ' + volume[1] + '.' + volume[2];
  const issue = stem.match(/\bissue\s*#?\s*0*(\d+)\b/) || stem.match(/\b411vm\s*#?\s*0*(\d+)\b/);
  if (issue && !/greatest/.test(stem)) return '411vm issue ' + Number(issue[1]);
  const best = stem.match(/best of.*?vol(?:ume)?\s*0*(\d+)/);
  if (best) return '411vm best ' + Number(best[1]);
  const europe = stem.match(/europe.*?((?:19|20)\d{2})/);
  if (europe) return '411vm europe ' + europe[1];
  if (/\blove affair\b/.test(stem)) return '411vm love affair';
  return '';
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
  const stem = iaReviewedEpisodeKey(sourceIdentifier, fileName) || fileName.toLowerCase().replace(/\.(?:mp4|m4v|mov|ogv|webm|mp3|flac|ogg|oga|wav|m4a|aac)$/i, '')
    .replace(/(?:[._ -](?:ia|h\.?264|avc|x264|mpeg4|webm|ogv|\d{2,4}kb|orig|original|source|low|small|preview|proxy))+$/i, '')
    .replace(/\s*\[comm\]\s*$/i, '').trim()
    // Some collection derivatives repeat a matching episode index twice.
    .replace(/^(\d+)\s+episode\s*,?\s*(\d+)\b/i, (all, index, episode) => Number(index) === Number(episode) ? 'episode ' + Number(episode) : all)
    .replace(/^episode\s*,?\s*(\d+)\b/i, (_, episode) => 'episode ' + Number(episode));
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
    if (String(rules.channel) === '905' && !iaReviewedFileAllowed(item, '905')) return reject('off-genre-reviewed-collection');
    if (rules.iaRepair === true && rules.requireTransport !== false && !transportValid) return reject('unverified-transport', true);
    return { accepted: !Array.isArray(rules.mediaTypes) || !rules.mediaTypes.length || rules.mediaTypes.includes('audio'), reason: 'audio-contract', item };
  }
  const text = [item.title, item.description, item.subject, item.fileName].filter(Boolean).join(' ').toLowerCase();
  const channel = String(rules.channel || '');
  if (!iaReviewedFileAllowed(item, channel)) return reject('off-genre-reviewed-collection');
  const completeCartoon = channel === '150' && COMPLETE_CARTOON_SHORT_PARENTS.has(item.sourceIdentifier)
    && !/\b(?:clip|trailer|preview|teaser|promo|bumper|intro|introduction|outro|review|reaction|tutorial|interview|bonus|menu|featurette|tiktok|reels)\b|#shorts|youtube shorts/i.test(text);
  if (/\b(?:podcasts?|vodcasts?|fan[- ]?made|fan[- ]?(?:film|movie|edit)|fanfic|unofficial remake|reaction video)\b/i.test(text)) return reject('policy-contamination');
  if (/\b(?:portrait|vertical)\s+(?:video|format|orientation|mode|footage|clip)\b|\b(?:shot|filmed|recorded|uploaded) in (?:portrait|vertical)\b|9\s*:\s*16|#shorts\b|\byoutube shorts\b/i.test(text) || (item.aspectRatio && item.aspectRatio <= 1)) return reject('portrait-media');
  if (!item.aspectRatio) return reject('unknown-geometry', true);
  if (channel === '150' && /\b(?:noods|network ident|logo compilation|bumper compilation|animated background|background video loop|stock animation|stock footage|motion graphics|screensaver)\b/i.test(text)) return reject('off-genre');
  if (channel === '150' && /\b(?:pt[- _.]?br|dublado|dublagem|em portugu[eê]s)\b/i.test(text)) return reject('non-english-edition');
  if (channel === '150' && item.sourceIdentifier === 'fat-albert-72' && /\((?:alternate version|attention study|1984 version|banned and uncensored version)\)/i.test(text)) return reject('duplicate-edition');
  if (!INTERNATIONAL.has(channel) && /\b(?:dansk tale|dublado|dublagem|deutsche fassung|deutschsprachig|(?:french|german|spanish|italian|portuguese|russian|danish) dub(?:bed)?|dubbed in (?:french|german|spanish|italian|portuguese|russian|danish))\b/i.test(text)) return reject('non-english-edition');
  if (!iaGameShowEraAllowed(item, channel)) return reject('wrong-era');
  const floor = iaMinimumFileRuntimeSeconds(rules);
  if (!item.runtimeSeconds) return reject('unknown-runtime', true);
  if (channel === '150' && item.runtimeSeconds < 900 && !completeCartoon) return reject('unreviewed-cartoon-short');
  if (item.runtimeSeconds < floor) return reject('short-runtime');
  if (!INTERNATIONAL.has(channel) && item.language && !/^(?:und|unknown|undetermined|n\/a)$/.test(item.language)
    && !/(?:^|[,; /])(?:eng|en(?:[-_][a-z]+)?|english)(?:$|[,; /])/.test(item.language)) return reject('non-english-edition');
  if (item.verification === 'failed' || raw.playability === 'failed') return reject('failed-media');
  if (rules.requireTransport !== false && !transportValid) return reject('unverified-transport', true);
  return { accepted: true, reason: 'file-qualified', needsHydration: false, item };
}
