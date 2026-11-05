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
// Unknown geometry/runtime normally defers; combat channels require runtime for ready files.
// Full file qualification is separate. Original cartoon shorts and TV satire remain allowed.
export function iaKnownVideoPolicyViolation(item = {}, rules = {}) {
  const meta = item.meta || {}, media = item.media || meta.media || {};
  if (String(media.type || item.type || item.mediaType || item.mediatype || meta.mediatype || '').toLowerCase() === 'audio') return false;
  const channel = String(rules.channel || '');
  if (channel === '65' && !iaSportingLifeAllowed(item)) return true;
  if (channel === '66' && !iaSurfSkateSnowAllowed(item)) return true;
  if (channel === '68' && !iaCoachingAllowed(item)) return true;
  if (channel === '69' && !iaSportsNewsreelAllowed(item)) return true;
  if (channel === '70' && !iaRodeoAllowed(item)) return true;
  if (['77','78','79'].includes(channel) && !iaFinalSportsAllowed(item,channel)) return true;
  if (channel === '76' && !iaStockCarAllowed(item)) return true;
  if (channel === '75' && !iaWaterSportsAllowed(item)) return true;
  if (channel === '74' && !iaWinterSportsAllowed(item)) return true;
  if (channel === '73' && !iaEquestrianAllowed(item)) return true;
  if (channel === '64') {
    const titleParts=String(item.title||'').split(' \u00b7 ');
    if (titleParts.length>2&&titleParts.slice(0,-1).some((part,index,parts)=>parts.indexOf(part)!==index)) return true;
    const selected=[item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/&/g,' and ').replace(/[_./-]+/g,' ');
    const identity=[selected,item.identifier||item.id,item.sourceIdentifier,media.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    if (/\b(?:game ?boy|longplay|gameplay|playthrough|simulation|video games?|nintendo|xbox|playstation|dance marathon|state of the city|city council|board meeting|shadow government|conspiracy|cspan|case on|bombers?|lecture|speech|book discussion|chariots of fire|running brave|prefontaine full movie|oakland athletics|baseball|basketball|swimming|diving|soccer|football|nfl|nhl|hockey|motor racing|race car|road racing motorcycle|isle of man|horse rac(?:e|ing)|equestrian|cycling|skiing|cross country ski|full movie)\b/.test(identity)) return true;
    if (/\b(?:highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|previews?|trailers?|promos?|podcasts?|interviews?|press conference|tutorials?|how to|coaching|training|workout|technique|newscast|television news|reviews?|reviewed|talk show|bombing|terrorist|audio only|commentary only|(?:russian|spanish|portuguese|french|german|italian|japanese) (?:commentary|broadcast|audio))\b/.test(selected)) return true;
    const athletics=/\b(?:track and field|track meet|track feed|athletics|road running|running race|marathon|race walk(?:ing)?|decathlon|heptathlon|steeplechase|hurdles|javelin|discus|shot put|pole vault|high jump|long jump|triple jump)\b/;
    const athlete=/\b(?:jesse owens|steve prefontaine|wilma rudolph|carl lewis|usain bolt|mo farah|eliud kipchoge|abebe bikila|haile gebrselassie|sebastian coe|paula radcliffe|jackie joyner kersee|faith kipyegon|sifan hassan)\b/;
    // The old label called this mixed-sports TV container an athletics collection.
    const source=String(item.sourceIdentifier||media.sourceIdentifier||String(item.identifier||item.id||'').split('::')[0]);
    const file=String(item.fileName||media.fileName||String(item.identifier||item.id||'').split('::')[1]||'').split('/').pop().toLowerCase().replace(/[_./-]+/g,' ');
    if (['Olympics.2012.BBC','2008_Beijing_Olympics','2016_Rio_Olympics_Track_and_Field'].includes(source)&&!athletics.test(file)) return true;
    const topic=athletics.test(selected)||athlete.test(selected);
    if (!topic) return true;
    const documentary=(athletics.test(selected)||athlete.test(selected))&&/\b(?:documentary|documentaries|history|biography|this is your life|american experience|fire on the track)\b/.test(selected);
    const event=athletics.test(selected)&&/\b(?:meet|championship|championships|olympic(?:s)?|session|final|finals|race|marathon|competition|trials|grand prix|diamond league|(?:vs?|versus))\b/.test(selected);
    const index=!media.url&&!item.url&&!item.mediaUrl&&!item.fileName&&!String(item.identifier||item.id||'').includes('::');
    if (!event&&!documentary&&!(index&&/\b(?:collection|games|athletics)\b/.test(selected))) return true;
  }
  if (channel === '63') {
    // Generic soccer/world-cup tags cannot turn coaching, news or another sport into a match.
    const selected=[item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ').replace(/\b(?:with|without|no)(?: original)? commercials\b/g,' ');
    const identity=[selected,item.identifier||item.id,item.sourceIdentifier,media.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const context=selected+' '+[item.seriesTitle,item.subject,item.subjects,meta.subject,meta.subjects].filter(Boolean).join(' ').toLowerCase();
    if (/\b(?:4chan|babbies|fifa\s+(?:[0-2]?\d)|ea sports|efootball|pro evolution soccer|pes\s+\d+|football manager|video games?|gameplay|longplay|playthrough|simulation|nintendo|xbox|playstation|playboy|escape to victory|bend it like beckham)\b/.test(identity)) return true;
    if (/\b(?:highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|previews?|trailers?|promos?|podcasts?|interviews?|talks to|discussion|press conference|hot tips?|improve your|how to|tutorials?|coaching|training|workout|aerobics|great goals|best goals|tribute|home movie|team preparation|awards|newscast|television news|news at|fox \d news|season review|pre match|post match|trophy lift|all time xi|where are they now|compilation|watch along|audio only|commentary only|(?:first|second|1st|2nd) half|(?:italian|spanish|portuguese|russian|french|german|arabic|japanese) (?:commentary|broadcast|audio)|latino|dublado)\b/.test(identity)) return true;
    if (/\b(?:basketball|fibau?\d*|cricket|icc|t20|rugby|american football|nfl|gridiron|baseball|volleyball|hockey|futsal|beach soccer|full (?:hd )?movie)\b/.test(context)) return true;
    const topic=/\b(?:soccer|association football|fifa|uefa|premier league|la liga|bundesliga|serie a|fa cup|football club|champions league|world cup|olympic football)\b/.test(context);
    const documentary=topic&&/\b(?:documentary|documentaries|soccer history|football history|history of|official centenary|soccer legends|premier league years)\b/.test(selected);
    const match=topic&&/\b(?:vs?|versus|at|full match|complete match|full broadcast|final|soccer game|soccer match|soccer championship)\b/.test(selected);
    const index=!media.url&&!item.url&&!item.mediaUrl&&!item.fileName&&!String(item.identifier||item.id||'').includes('::');
    if (!match&&!documentary&&!(index&&topic&&/\b(?:matches|games|collection|classics)\b/.test(selected))) return true;
    const fileRuntime=['runtime','duration','length'].some(key=>Object.prototype.hasOwnProperty.call(media,key));
    const value=String((fileRuntime?media.runtime||media.duration||media.length:item.runtimeSeconds||item.durationSeconds||item.runtime||item.duration||meta.runtime)||'');
    const parts=value.split(':').map(Number),runtime=parts.every(Number.isFinite)?parts.reduce((n,x)=>n*60+x,0):0;
    if (!documentary&&runtime>0&&runtime<(/\b(?:high school|school soccer|boys soccer|girls soccer)\b/.test(context)?3600:4500)) return true;
  }
  if (channel === '52') {
    // Promotion names in tags are not proof of an actual combat-sports program.
    const selected = [item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const identity = [selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const classification = [item.subject,item.subjects,item.collection,meta.subject,meta.subjects,meta.collection].filter(Boolean).join(' ').toLowerCase();
    if (/\b(?:video games?|gameplay|longplay|playthrough|simulation|ufc undisputed|ea sports|ufc 3 game|ufc 4 game|ufc league|mma onslaught|fight night champion|playstation|xbox|free download|kung ?fu monk|chuck norris|wwe|wwf|wrestlemania|professional wrestling)\b/.test(identity)) return true;
    if (/\b(?:highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|previews?|trailers?|press conference|interviews?|podcasts?|tutorials?|workout|training demo|gym demo|weigh[ -]?ins?|seminars?|lectures?|panel discussion|countdown show|best of|top ufc|trilogies|compilations?|watch[ -]?alongs?|watch part(?:y|ies)|no (?:fight|bout|event|match) footage|commentary only|audio only|reaction streams?|predictions?|news analysis|sports diplomacy|teatime|political speech|fight analysis|fight breakdown)\b/.test(selected)) return true;
    if (/\b(?:cartoons?|animation|anime|sitcom|feature film|fiction film|fictional)\b/.test(classification) || /\b(?:full (?:hd )?movie|formula (?:one|1)|latino|espa[nñ]ol|dublado|(?:japanese|thai|russian|spanish|portuguese) (?:broadcast|commentary|audio))\b/.test(selected)) return true;
    // This reviewed parent explicitly contains the original Japanese live editions.
    if (/\b2002 08 28 dynamite summer night fever in kunitachi\b/.test(identity)) return true;
    const source = String(media.sourceIdentifier || item.sourceIdentifier || String(item.identifier || item.id || '').split('::')[0]).replace(/^ia:/i,'');
    let file = String(media.fileName || item.fileName || String(item.identifier || item.id || '').split('::')[1] || '');
    try { if (!file) file = decodeURIComponent(new URL(media.url || item.url || item.mediaUrl).pathname.split('/').pop()); } catch (_) {}
    // These originals reproduced audio-only playback; their H.264 derivatives render video.
    if (source === 'BigFight_Bellator-237-plus-BONUS-FIGHTS-12.28.19' && /(?:^|\/)(?:9|10|12|13)\s*-/.test(file) && /\.mp4$/i.test(file) && !/\.ia\.mp4$/i.test(file)) return true;
    const promotion = /\b(?:ufc|ultimate fighting championship|pride (?:fc|fighting)|bellator|strikeforce|pancrase|one championship|pfl|invicta|iafc|k 1|glory kickboxing)\b/.test(selected);
    const discipline = /\b(?:mma|mixed martial arts|vale tudo|kickboxing|muay thai|cage fighting|lethwei)\b/.test(selected+' '+classification);
    if (/\b(?:strikeforce|pfl|invicta)\b/.test(selected) && !discipline) return true;
    const event = (promotion || discipline) && (/\b(?:vs?|versus|full (?:fight|bout|card|event|broadcast)|tournament|championship|grand prix|main card|preliminary card|prelims)\b/.test(selected) || promotion && /\b(?:ufc|pride(?: fc)?|bellator|pancrase|one championship)\s*\d{1,4}\b/.test(selected));
    const documentary = (promotion || discipline) && /\b(?:documentary|documentaries|ringside history|mma history)\b/.test(selected);
    if (!event && !documentary) return true;
  }
  if (channel === '53') {
    // The flagship carries substantial programs, not anything tagged sports.
    // Incidental halftime interviews/commercials inside a full broadcast stay.
    const selected = [item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const identity = [selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const classification = [item.subject,item.subjects,item.collection,meta.subject,meta.subjects,meta.collection].filter(Boolean).join(' ').toLowerCase();
    if (/\b(?:countdown clock|torch relay|medal display|olympic medals|home movies?|training|tutorials?|practice|workout|ski with a ranger|highlights?|clips?|recaps?|condensed|quick ?cut|abridged|incomplete|partial|previews?|trailers?|podcasts?|press conference|security update|ceremonies|parades?|watch[ -]?along|watch party|no (?:game|event|fight) footage|commentary only|audio only|reaction streams?|gameplay|longplay|playthrough|simulation|video games?|madden|ncaa football (?:0[0-9]|1[0-4])|ea sports college football \d{2}|nintendo|playstation|xbox)\b/.test(identity)) return true;
    if (/\b(?:cartoons?|animation|anime|sitcom|feature film|fiction film|fictional|video ?games?|sports simulation)\b/.test(classification) || /\b(?:full (?:hd )?movie|rocky balboa|peeping tom|basketball diaries|golf specialist)\b/.test(selected)) return true;
    const topic = /\b(?:baseball|basketball|football|gridiron|cfl|usfl|xfl|ufl|grey cup|pancrase|strikeforce|pfl|invicta|one championship|muay thai|vale tudo|glory kickboxing|hockey|boxing|mma|ufc|pride fc|bellator|kickboxing|wrestling|roller ?derby|rollergames|olympic(?:s)?|golf|masters tournament|tennis|soccer|rugby|cricket|cycling|athletics|track and field|swimming|skiing|skating|snowboarding|volleyball|rodeo|nascar|indycar|formula (?:one|[123e])|grand prix|nfl|nba|wnba|aba|mlb|nhl|fifa|world series|rose bowl|sugar bowl|orange bowl|cotton bowl|fiesta bowl|peach bowl|camellia bowl|super bowl|sports documentary)\b/.test(selected+' '+classification);
    if (!topic) return true;
  }
  if (channel === '57') {
    const selected = [item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([a-z])([0-9])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const identity = [selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([a-z])([0-9])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const classification = [item.subject,item.subjects,item.collection,meta.subject,meta.subjects,meta.collection].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();
    if (/\b(?:soccer|fifa|uefa|premier league|champions league|australian rules|gaelic football|rugby|madden|ncaa football (?:0[0-9]|1[0-4])|ea sports college football \d{2}|bowl bound college football|video games?|gameplay|longplay|playthrough|simulation|nintendo|playstation|xbox|remember the titans|the waterboy|n3on|my final stream|just chatting)\b/.test(identity)) return true;
    if (/\bworld cup\b/.test(identity) && !/\b(?:ifaf|american football world cup)\b/.test(selected)) return true;
    if (/\b(?:highlights?|clips?|recaps?|condensed|quick ?cut|sports weekly|college gameday|abridged|incomplete|partial|previews?|trailers?|interviews?|podcasts?|tutorials?|workout|training|practice|security update|security briefing|cartoons?|carebears|childrens shows|action news|press conference|lectures?|seminars?|panel discussion|watch[ -]?alongs?|no (?:game|event) footage|commentary only|audio only|reaction streams?|(?:first|second|1st|2nd)\s*half|reel\s*[1-9]|seinfeld|television news|newscast)\b/.test(selected+' '+identity)) return true;
    if (/\b(?:parades?|tournament of roses|statues?|unveiling|ceremonies|stadium tour|stadium dedication|groundbreaking|pep rally|luncheon|banquet)\b/.test(selected) && !/\b(?:full|complete) game\b/.test(selected)) return true;
    if (/\b(?:cartoons?|animation|anime|sitcom|feature film|fiction film|fictional)\b/.test(classification) || /\b(?:full (?:hd )?movie|hockey|nhl|basketball|nba|baseball|mlb|latino|espa[nñ]ol|dublado|(?:japanese|russian|spanish|portuguese) (?:broadcast|commentary|audio))\b/.test(selected)) return true;
    if (/\b(?:video ?games?|gameplay|sports simulation|electronic arts)\b/.test(classification)) return true;
    const topic = /\b(?:college football|high school football|prep football|varsity football|american football|gridiron|nfl|ncaa football|cfl|usfl|xfl|ufl|super bowl|grey cup|rose bowl|sugar bowl|orange bowl|cotton bowl|fiesta bowl|peach bowl|football bowl)\b/.test(selected+' '+classification) || /\bfootball\b/.test(selected+' '+classification) && /\b(?:high ?school|prep|varsity|college|university)\b/.test(selected+' '+classification);
    const documentary = topic && /\b(?:documentary|documentaries|football history|history of the gridiron|football biography|nfl films|breaking the huddle)\b/.test(selected);
    const game = topic && /\b(?:vs?|versus|at|full game|complete game|full broadcast|game\s*\d+|football broadcast|football game|football championship|super bowl|grey cup|rose bowl|sugar bowl|orange bowl|cotton bowl|fiesta bowl|peach bowl|football on (?:abc|fox|cbs|nbc)|week\s*\d+)\b|\bfootball\s*\d{8}\b/.test(selected);
    const index = !media.url && !item.url && !item.mediaUrl && !item.fileName && !String(item.identifier || item.id || '').includes('::');
    if (!game && !documentary && !(index && topic && /\b(?:games?|season|collection|classics)\b/.test(selected))) return true;
    const fileRuntime=['runtime','duration','length'].some(key=>Object.prototype.hasOwnProperty.call(media,key));
    const value=String((fileRuntime ? media.runtime || media.duration || media.length : item.runtimeSeconds || item.durationSeconds || item.runtime || item.duration || meta.runtime) || '');
    const parts=value.split(':').map(Number), runtime=parts.every(Number.isFinite)?parts.reduce((n,x)=>n*60+x,0):0;
    if (!documentary && runtime>0 && runtime<2700) return true;
  }
  if (channel === '62') {
    const selected=[item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./()\[\]-]+/g,' ').replace(/\s+/g,' ');
    const context=[selected,item.seriesTitle,meta.seriesTitle,item.subject,item.subjects,meta.subject,meta.subjects].filter(Boolean).join(' ').toLowerCase();
    const identity=[selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    if (/\b(?:nfl|nba|wnba|mlb|nhl|usfl|cfl|xfl|ufl|high school|prep football|prep basketball|varsity high|junior varsity|madden|ncaa football (?:0[0-9]|1[0-4])|ea sports college football \d{2}|gameplay|longplay|playthrough|simulation|video games?|nintendo|playstation|xbox|animal house|revenge of the nerds)\b/.test(identity) || /\bhigh school\b/.test(context)) return true;
    if (/\b(?:ban college football|intelligence squared|debates?|after the whistle|raptor report|year in review|highlights?|clips?|recaps?|condensed|quick ?cut|abridged|incomplete|partial|(?:first|second|1st|2nd)\s*half|rained out|rainout|ring ceremon(?:y|ies)|podcasts?|previews?|trailers?|interviews?|press conference|press club|lectures?|seminars?|panel discussion|recruiting|signing day|training|practice|workout|tutorials?|watch[ -]?alongs?|no (?:game|event) footage|commentary only|audio only|reaction streams?|security update)\b/.test(identity)) return true;
    if (/\b(?:homecoming|parades?|pep rally|statue|unveiling|banquet|stadium tour)\b/.test(selected) && !/\b(?:full|complete) (?:game|match|broadcast)\b/.test(selected)) return true;
    if (/\b(?:cartoons?|animation|anime|sitcom|feature films?|fiction films?|fictional|sports simulation)\b/.test(context) || /\b(?:full (?:hd )?movie|language (?:spanish|french|russian|german|portuguese)|(?:spanish|russian|portuguese) (?:broadcast|commentary|audio)|dublado)\b/.test(selected)) return true;
    const collegiate=/\b(?:college|university|ncaa|naia|njcaa|intercollegiate|collegiate|community college)\b/.test(context);
    const sport=/\b(?:football|basketball|baseball|volleyball|soccer|softball|lacrosse|hockey|wrestling|swimming|diving|gymnastics|tennis|golf|rowing|track|athletics|cross country|fencing|water polo)\b/.test(context);
    const documentary=/\b(?:documentary|documentaries|sports history|athletics history|breaking the huddle)\b/.test(context);
    const game=/\b(?:vs?|versus|at|full (?:game|match|meet|broadcast|event)|complete (?:game|match|meet|broadcast|event)|championship|tournament|final|semi final|game\s*\d+|bowl|football on (?:abc|cbs|nbc|fox))\b|@/.test(selected);
    const index=!media.url && !item.url && !item.mediaUrl && !item.fileName && !String(item.identifier || item.id || '').includes('::');
    if (!collegiate || !sport || !game && !documentary && !(index && /\b(?:games?|season|collection)\b/.test(selected))) return true;
    const fileRuntime=['runtime','duration','length'].some(key=>Object.prototype.hasOwnProperty.call(media,key)),value=String((fileRuntime?media.runtime||media.duration||media.length:item.runtimeSeconds||item.durationSeconds||item.runtime||item.duration||meta.runtime)||''),parts=value.split(':').map(Number),runtime=parts.every(Number.isFinite)?parts.reduce((n,x)=>n*60+x,0):0;
    if (!documentary && runtime>0 && runtime<(/\b(?:football|baseball)\b/.test(context)?2700:/\bbasketball\b/.test(context)?1800:900)) return true;
  }
  if (channel === '61') {
    // Require the selected Olympic program, not a passing news/guest mention.
    const selected = [item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./()\[\]-]+/g,' ').replace(/\s+/g,' ');
    const identity = [selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./()\[\]-]+/g,' ').replace(/\s+/g,' ');
    const classification = [item.subject,item.subjects,item.collection,meta.subject,meta.subjects,meta.collection].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g,' ');
    if (/\b(?:world news|newshour|newscast|capitol hill|hearings|cspan|late night with|jimmy fallon|seth meyers|maria bartiromo|benson|tv land|countdown|torch relay|medal display|olympic medals|home movies?|highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|podcasts?|press conference|security update|watch[ -]?alongs?|no (?:game|event) footage|commentary only|audio only|reaction streams?|differences between|computers and the olympics|gameplay|longplay|playthrough|simulation|video games?|mario|sonic|nintendo|playstation|xbox|trojan games|pain olympics|sex olympics|terrytoons|cartoons?|anime|running man philippines)\b/.test(identity)) return true;
    if (/\b(?:cartoons?|animation|anime|sitcom|feature films?|fiction films?|fictional|adult sex|erotic|video games?|sports simulation)\b/.test(classification)) return true;
    if (/\b(?:language (?:spanish|french|russian|german|portuguese)|(?:spanish|french|russian|german|portuguese|italian) (?:broadcast|commentary|audio)|dublado|dubbed (?:russian|spanish))\b/.test(selected)) return true;
    const topic=/\bolympic(?:s)?\b/.test(selected) || /\b(?:this is your life jesse owens|flame in the snow)\b/.test(selected);
    if (!topic) return true;
  }
  if (channel === '59') {
    // Reviewed parent packages old-time radio audio inside MP4 containers.
    const source=String(media.sourceIdentifier || item.sourceIdentifier || String(item.identifier || item.id || '').split('::')[0]).replace(/^ia:/i,'');
    if(source==='MajorLeagueBaseball1948WorldSeriesGame5BostonBravesAtClevelandIndians_201705')return true;
    const selectedFile=String(media.fileName || item.fileName || String(item.identifier || item.id || '').split('::')[1] || '');
    if(source==='therewasalwayssunshiningsomeplacelifeinthenegroleagues' && /reel[12](?:\.ia)?\.mp4$/i.test(selectedFile))return true;
    const selected = [item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const identity = [selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g,' ');
    const classification = [item.subject,item.subjects,item.collection,meta.subject,meta.subjects,meta.collection].filter(Boolean).join(' ').toLowerCase();
    if (/\b(?:video games?|gameplay|longplay|playthrough|simulation|mlb the show|mlb\s*2k\d*|mvp baseball|rbi baseball|nintendo|playstation|xbox|field of dreams|the sandlot|league of their own|bad news bears|race across the world|babies their wonderful world|hetalia|klay world|stampy|transhuman|world series of (?:golf|poker))\b/.test(identity)) return true;
    if (/\b(?:highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|previews?|trailers?|interviews?|podcasts?|tutorials?|workout|training|practice|commissioner on|luncheon|speech|press club|panel discussion|lectures?|seminars?|battle of the movies|tonight show|(?:11|10|6|5)pm news|performs?|concert|music video|watch[ -]?alongs?|no (?:game|event) footage|commentary only|audio only|reaction streams?|reel\s*[1-9]|inning [1-9]|innings [1-9]|seinfeld|family matters|television news|newscast)\b/.test(selected) || /\(most\)/i.test(String(item.title||''))) return true;
    if (/\b(?:cartoons?|animation|anime|sitcom|feature film|fiction film|fictional)\b/.test(classification) || /\b(?:full (?:hd )?movie|football|nfl|hockey|nhl|basketball|nba|soccer|softball|latino|espa[nñ]ol|dublado|(?:japanese|russian|spanish|portuguese) (?:broadcast|commentary|audio))\b/.test(selected)) return true;
    const topic = /\b(?:baseball|mlb|world series|negro leagues)\b/.test(selected+' '+classification);
    const documentary = topic && /\b(?:documentary|documentaries|baseball history|story of the negro leagues|life in the negro leagues)\b/.test(selected+' '+classification);
    const game = topic && /\b(?:vs?|versus|at|full game|complete game|full broadcast|all star game|game\s*\d+|baseball broadcast|baseball tournament|baseball championship|baseball classic)\b|\bbaseball\s*\d{8}\b/.test(selected);
    const index = !media.url && !item.url && !item.mediaUrl && !item.fileName && !String(item.identifier || item.id || '').includes('::');
    if (!game && !documentary && !(index && topic && /\b(?:games?|season|collection|classics)\b/.test(selected))) return true;
    const fileRuntime=['runtime','duration','length'].some(key=>Object.prototype.hasOwnProperty.call(media,key));
    const value=String((fileRuntime ? media.runtime || media.duration || media.length : item.runtimeSeconds || item.durationSeconds || item.runtime || item.duration || meta.runtime) || '');
    const parts=value.split(':').map(Number), runtime=parts.every(Number.isFinite)?parts.reduce((n,x)=>n*60+x,0):0;
    if (!documentary && runtime>0 && runtime<2700) return true;
  }
  if (channel === '58') {
    // Reviewed recording explicitly states that its first quarter is missing.
    const source=String(media.sourceIdentifier || item.sourceIdentifier || String(item.identifier || item.id || '').split('::')[0]).replace(/^ia:/i,'');
    if(source==='nba-1977-all-star-game-west-vs-east-erving-30pts-12rbs-4stl-mc-adoo-30pts-10rbs-3stl')return true;
    const selected = [item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const identity = [selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g,' ');
    const classification = [item.subject,item.subjects,item.collection,meta.subject,meta.subjects,meta.collection].filter(Boolean).join(' ').toLowerCase();
    if (/\b(?:nba\s*2k\d*|nba jam|nba live \d+|video games?|gameplay|longplay|playthrough|simulation|nintendo|snes|playstation|xbox|basketball diaries|space jam|hang time full 1995|mutant league|furious finishes)\b/.test(identity)) return true;
    if (/\b(?:highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|previews?|trailers?|interviews?|podcasts?|tutorials?|workout|training|practice|watch[ -]?alongs?|no (?:game|match|event) footage|commentary only|audio only|reaction streams?|(?:first|second|1st|2nd) half|reel [1-9]|quarter [1-4])\b/.test(selected)) return true;
    if (/\b(?:cartoons?|animation|anime|sitcom|feature film|fiction film|fictional)\b/.test(classification) || /\b(?:full (?:hd )?movie|football|nfl|hockey|nhl|baseball|mlb|soccer|latino|espa[nñ]ol|dublado|(?:japanese|russian|spanish|portuguese) (?:broadcast|commentary|audio))\b/.test(selected)) return true;
    const topic = /\b(?:basketball|nba|wnba|aba all star|college hoops)\b/.test(selected+' '+classification);
    const documentary = topic && /\b(?:documentary|documentaries|basketball history|nba history|basketball biography)\b/.test(selected);
    const game = topic && /\b(?:vs?|versus|at|full (?:game|match|broadcast)|all star games?|finals|game \d+|basketball broadcast|basketball tournament|basketball championship)\b|\bbasketball\s*\d{8}\b|\bbasketball.{0,100}\b(?:home|away)\b/.test(selected);
    const index = !media.url && !item.url && !item.mediaUrl && !item.fileName && !String(item.identifier || item.id || '').includes('::');
    if (!game && !documentary && !(index && topic && /\b(?:games?|season|collection|classics)\b/.test(selected))) return true;
    const value=String(media.runtime || media.duration || item.runtimeSeconds || item.durationSeconds || item.runtime || item.duration || '');
    const parts=value.split(':').map(Number), runtime=parts.every(Number.isFinite)?parts.reduce((n,x)=>n*60+x,0):0;
    if (!documentary && runtime>0 && runtime<2700) return true;
  }
  if (channel === '55') {
    const selected = [item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const identity = [selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const classification = [item.subject,item.subjects,item.collection,meta.subject,meta.subjects,meta.collection].filter(Boolean).join(' ').toLowerCase();
    const source = String(media.sourceIdentifier || item.sourceIdentifier || String(item.identifier || item.id || '').split('::')[0]).replace(/^ia:/i,'');
    // These reviewed legacy collections explicitly reconstruct the broadcast from fan edits.
    if (['wce93','wce96v3','recdub94','recdub2000540','re-c-dub-1995-complete','Roller_Derby'].includes(source)) return true;
    if (/\b(?:video games?|gameplay|longplay|playthrough|simulation|wwe ?2k\d*|wwf no mercy|wrestlemania 2000 nintendo|nintendo 64|n64|playstation|xbox|rollerball|whip it|the wrestler 2008|ready to rumble|no holds barred|oil wrestling|mud wrestling|bikini wrestling|straight outta compton)\b/.test(identity)) return true;
    if (/\b(?:highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|trailers?|previews?|shoot interviews?|interviews?|podcasts?|tutorials?|workout|training|practice|seminars?|lectures?|watch[ -]?alongs?|no (?:match|event|fight) footage|commentary only|audio only|reaction streams?)\b/.test(selected)) return true;
    if (/\b(?:cartoons?|anime|sitcom|feature film|fiction film|fictional)\b/.test(classification) || /\b(?:full (?:hd )?movie|latino|espa[nñ]ol|dublado|(?:japanese|thai|russian|spanish|portuguese) (?:broadcast|commentary|audio))\b/.test(selected)) return true;
    const derby = /\b(?:roller derby|roller games|rollergames)\b/.test(selected);
    const wrestling = /\b(?:professional wrestling|pro wrestling|world (?:class championship|championship|wrestling federation)|wrestling society x|wrestling championship|wrestling television|wrestling tv|wrestling broadcast|wrestling match|wrestling event|wcw|wccw|njpw|wwf|wwe|ecw|tna wrestling|aew)\b/.test(selected) || /\b(?:awa|nwa)\b/.test(selected) && /\bwrestling\b/.test(selected+' '+classification);
    const program = /\bs\d{1,3}e\d{1,3}\b/.test(selected) || /\b(?:vs?|versus|full (?:show|match|event|broadcast)|episode|raw|nitro|smackdown|superstars|saturday night|wrestlemania|royal rumble|championship|wrestling society x|complete collection)\b/.test(selected) || /\b(?:19|20)\d{2}\b/.test(selected);
    const documentary = /\b(?:documentary|documentaries|ringside history|banked track history)\b/.test(selected);
    if ((!derby && !wrestling) || (!program && !documentary)) return true;
    if (/\bwwf\b/.test(selected) && /\b(?:wildlife|conservation|pandas?|nature)\b/.test(selected)) return true;
  }
  if (channel === '56') {
    // Subject tags can describe a guest actor rather than the program. Require
    // boxing-program evidence in the selected title/file, including on old shelves.
    const selected = [item.title,item.fileName,media.fileName,meta.title,meta.fileName].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
    const identity = [selected,item.identifier || item.id,item.sourceIdentifier,media.sourceIdentifier,meta.sourceIdentifier].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ').replace(/\b(?:with|without)(?: original)? commercial(?: break)?s\b/g,' ');
    const classification = [item.subject,item.subjects,item.collection,meta.subject,meta.subjects,meta.collection].filter(Boolean).join(' ').toLowerCase();
    if (/\b(?:killer'?s? wife|abbott and costello|rocky balboa|apollo creed|bloodsport|fox[yie] boxing|sports talk|striptease|erotic|video games?|boxing games?|gameplay|longplay|playthrough|simulation|fight night champion|fight night round|punch out|ea sports)\b/.test(identity)) return true;
    if (/\b(?:highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|previews?|trailers?|press conference|interviews?|meet the press|talk of the town|rose city report|tutorials?|mittwork|workout|injuries|training|countdown show|pre fight countdown|watch[ -]?alongs?|watch part(?:y|ies)|no (?:fight|bout|event|match) footage|commentary only|audio only|reaction streams?|boxing (?:analysis|predictions?|breakdown)|fight analysis|fight predictions?|fight breakdown|now sanctioned|still fixed|fights (?:pt|part))\b/.test(selected)) return true;
    if (/\b(?:cartoons?|animation|anime|sitcom|feature film|fiction film|fictional)\b/.test(classification) || /\b(?:ufc|mma|mixed martial arts|professional wrestling|wwe|wwf)\b/.test(identity)) return true;
    const boxing = /\b(?:boxing|golden gloves|prizefight(?:ing)?|pugilis[mt]|muhammad ali|cassius clay|mike tyson|lennox lewis|evander holyfield|floyd patterson|sonny liston|jack dempsey|joe louis|max schmeling|max baer|james braddock|manny pacquiao|floyd mayweather|roberto duran|sugar ray leonard|marvin hagler|roy jones|george foreman)\b/.test(selected+' '+classification);
    const event = boxing && (/\b(?:vs?|versus)\b/.test(selected) || /\b(?:full (?:fight|bout|card|event|broadcast)|boxing (?:match|tournament|broadcast|night)|championship boxing|golden gloves)\b/.test(selected) || /\bboxing\b/.test(selected) && /\b(?:19|20)\d{2}\b/.test(selected));
    const documentary = boxing && /\b(?:documentary|documentaries|ringside history|boxing history|fallen champ)\b/.test(selected);
    if (!event && !documentary) return true;
  }
  if (['60','71','72'].includes(channel)) {
    // Judge the selected program and original identity, not incidental words
    // in descriptions of intermission coverage inside a complete broadcast.
    const sportsText = [item.title,item.identifier || item.id,item.sourceIdentifier,item.fileName,media.fileName,meta.title,meta.sourceIdentifier,meta.fileName].filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g,' ').replace(/\b(?:with|without)(?: original)? commercial(?: break)?s\b/g,' ');
    if (/\b(?:highlights?|clips?|recaps?|condensed|abridged|incomplete|partial|previews?|trailers?|promos?|commercials?|interviews?|post match|press conference|gameplay|longplay|playthrough|video games?|simulation|ytp|youtube poop|grand slam tennis 2|andre agassi tennis|asg golf)\b/.test(sportsText)) return true;
    if (channel === '60' && /\b(?:pickup ?hockey|field hockey|underwater hockey|street hockey|floor hockey)\b/.test(sportsText)) return true;
    if (/\bea sports\b/.test(sportsText) || /\b20020617 2336 channel 5 nhl stanley cup finals and more\b/.test(sportsText)) return true;
    // The Archive source labels this recording incomplete; old editorial
    // shelf titles omitted that fact. Its source identity remains excluded.
    if (channel === '72' && /\bwimbledon wilandermcenroe 19890705\b/.test(sportsText)) return true;
  }
  if (channel) {
    const features = ['100','101','102','103','105','106','108','110','111','112','114','115','116','119','120','124','125','132','135','701'];
    const shorts = ['13','236','501','509'];
    const sportsNhl = channel === '60' && /\bnhl\b|\bstanley[-_. ]cup\b/i.test([item.title,item.identifier || item.id,item.sourceIdentifier,item.fileName,media.fileName,meta.title].filter(Boolean).join(' '));
    const floor = Math.max(Number(rules.minRuntimeSeconds) || 0, sportsNhl ? 3600 : channel === '71' ? 2700 : ['60','72'].includes(channel) ? 1800 : 0, channel === '150' ? 120 : shorts.includes(channel) ? 0 : features.includes(channel) ? 3600 : 900);
    // A selected child with missing/short metadata must not borrow the parent runtime.
    const fileRuntime = ['runtime','duration','length'].some(key => Object.prototype.hasOwnProperty.call(media,key));
    const value = fileRuntime ? media.runtime || media.duration || media.length : item.runtimeSeconds || item.durationSeconds || item.duration || item.runtime || meta.runtimeSeconds || meta.durationSeconds || meta.duration || meta.runtime;
    const parts = String(value || '').split(':').map(Number);
    const runtime = parts.every(Number.isFinite) ? parts.reduce((total,part) => total * 60 + part,0) : 0;
    // A legacy direct URL with no duration must hydrate before it can be ready.
    if (['52','53','55','56','57','58','59','61','62','63','64','65','66','68','69','70','73','74','75','76','77','78','79'].includes(channel) && !runtime && (media.url || item.url || item.mediaUrl)) return true;
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
  if (String(channel) === '51') {
    if (/\b(?:podcast|reactions?|video game|simulation|fantasy football)|\bmadden\s+(?:nfl\s+\d{2,4}|gameplay|playthrough)\b/i.test(identity)) return false;
    const broadcast = source.match(/^([a-z0-9]{3,12})_(?:19|20)\d{6}_\d{6}_(.+)$/i);
    if (broadcast && !/^nfl/i.test(broadcast[1]) && !/\b(?:nfl|football|super bowl|hard knocks|gridiron|america'?s game|america s game)\b/i.test(broadcast[2].replace(/_/g,' '))) return false;
    const topic = /\b(?:nfl|football|super bowl|hard knocks|gridiron|sabol|facenda|a football life|inside the nfl|america'?s game|america s game|steel curtain|doomsday defense|fearsome foursome|monsters of the midway|purple people eaters|new york sack exchange|greatest show on turf|giants (?:yearbook|forever)|jersey guys rooting for big blue)\b|\bwk\s*\d{1,2}\b.*\bgotw\b/i;
    const parts = String(item.title || item.meta && item.meta.title || '').replace(/[_-]+/g,' ').split(/\s+(?:\u00c2)?·\s+/), selectedTitle = parts[parts.length-1];
    const fileTitle = file.replace(/(?:\.ia)?\.[^.]+$/,'').replace(/[._-]+/g,' ');
    const genericName = /^(?:vts\s*\d+(?:\s+\d+)*|(?:episode|ep|part|reel|disc|disk|video|chapter)\s*\d+[a-z]?|\d+)$/i, generic = genericName.test(fileTitle || selectedTitle) && genericName.test(selectedTitle);
    if (!topic.test(selectedTitle) && !topic.test(fileTitle) && !(generic && topic.test(parts.slice(0,-1).join(' ')))) return false;
  }
  // Incidental NFL tags cannot turn a newscast or the wrestling film named
  // "Hard Knocks" into football programming, including in old saved shelves.
  if (String(channel) === '51' && /\b(?:cbs this morning|cbs evening news|nbc nightly news|abc world news|early today|world business|eyewitness news|(?:morning|evening|nightly|world|local) news|news at \d{1,2}|wwf|wwe|wcw|ecw|mick foley|pro wrestling)\b/.test(identity)) return false;
  if (String(channel) === '209') {
    // Collection subjects describe every sibling together. They cannot qualify
    // Peeping Tom just because another film is about missing aircraft.
    const topic = /\b(?:aviation|aircraft|airplanes?|aeroplanes?|airships?|airlines?|airports?|aviators?|helicopters?|zeppelins?|air\s+forces?|flight|flying fortress|fighter jets?|corsair|tomcat|vulcan bomber|dogfights?)\b/i;
    const title = String(item.title || '').replace(/[_-]+/g, ' '), parts = title.split(/\s+·\s+/);
    const child = parts.length > 1 ? parts[parts.length - 1] : title;
    if (/\bled zeppelin\b|\bpublic art\b/i.test(child)) return false;
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
  if (String(channel) === '54') {
    if (/\b(?:documentary|highlights?|recap|qualifying|practice|interview|podcast|gameplay|simulation|car review|road test|training|car restoration|crash compilation|race compilation|music video|trailer|feature film|fan movie|fan film|fanmade|fan made|parody|automobile design|f1 challenge|season mod|assetto corsa|i racing|iracing|r factor|arcade|longplay|playthrough|psx|trump|biden|political|campaign speech|organic rally|post race|post gp|rainout|rain out)\b/.test(identity)) return false;
    if (/\b(?:grand prix[ (]*(?:1966|2010)|rush[ (]*2013|days of thunder|ford v ferrari|talladega[ ._-]+nights|ricky[ ._-]+bobby)\b/i.test(String(item.title || ''))) return false;
    const raceTitle = [item.title,file].join(' ').replace(/[._-]+/g,' ');
    const fullRace = /\b(?:full race|complete race|race replay|full broadcast|full event|complete coverage|raw satellite feed)\b/i.test(raceTitle);
    if (!fullRace && /\b(?:on[ -]?board|post gp|post race|pre race|race preview|press conference)\b|\((?:most|partial|incomplete)\)/i.test(raceTitle)) return false;
    const raceParts = String(media.runtime || item.runtime || item.duration || item.meta && item.meta.runtime || 0).split(':').map(Number);
    const raceSeconds = raceParts.every(Number.isFinite) ? raceParts.reduce((total,part) => total * 60 + part,0) : 0;
    const event = /\b(?:nascar|formula [123e]|formula one|grand prix|indycar|indianapolis 500|indy 500|daytona|talladega|le mans|imsa|sebring|nhra|us nationals|world of outlaws|knoxville nationals|wrc|motocross|supercross|truck racing|drag racing|kart racing|karting|usac|world rally|rally racing|rallycross|dakar|rally monte carlo|monte carlo rally|sprint car|dirt track|winston cup|goodwrench|pontiac excitement|budweiser|winston|craftsman truck)\b/i.test(raceTitle);
    const namedEvent = /\b(?:(?:canadian|dutch|japanese|british|italian|belgian|monaco|baltimore|long beach|australian|mexican|chinese|spanish|german|french) grand prix|grand prix of|indianapolis 500|indy 500|daytona 500|talladega 500|knoxville nationals|us nationals|le mans|sebring|winston cup|southern 500|coca cola 600|pontiac excitement|goodwrench|budweiser|pennzoil world of outlaws)\b/i.test(raceTitle);
    const vettedNumberedRace = (item.recoveryVerified === true || item.meta && item.meta.recoveryVerified === true) && /\b(?:nascar|stock car racing)\b/i.test(String(item.subject || item.meta && item.meta.subject || '')) && /\b(?:300|400|500|600)\b/.test(raceTitle) && /\b(?:19|20)\d{2}\b/.test(raceTitle);
    if ((!event && !vettedNumberedRace) || (!fullRace && !vettedNumberedRace && !(namedEvent && raceSeconds >= 3600 && /\b(?:19|20)\d{2}\b/.test(raceTitle)))) return false;
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
  // These observed legacy uploads are fiction or general home movies, not outdoor programs.
  if (/^(?:HuntingSeason|098909)(?:::|$)/i.test(String(item.sourceIdentifier || item.identifier || item.id || ''))) return false;
  // Identity comes from the program, not incidental tags on a civic upload.
  const meta = item.meta || {};
  const text = [item.title, item.seriesTitle, item.fileName, item.media?.sourceTitle,
    item.sourceIdentifier, item.identifier || item.id, meta.title].filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g, ' ');
  if (/\b(?:city council|council meeting|committee hearing|press conference|politics|political|concert|full performance|music video|podcast|commercial breaks|logo compilation|drupal|wordpress|web development|software tutorial|ed bassmaster|easy money|good will hunting|funny or die|twitch|full movie|feature film|cartoons?|animation|swimming|basketball|football|baseball|video games?|gameplay|simulation|public lecture|panel discussion|webinars?|seminars?|symposium|conference|home movies?)\b/.test(text)) return false;
  // Equipment-buying listicles are not an outdoor program or field event.
  if (/\b(?:rifles?|guns?|crossbows?|hunting gear|hunting equipment)\b/.test(text) && /\b(?:you should avoid|quietly avoiding|poor accuracy|outdated designs|before you buy|buying guide)\b/.test(text)) return false;
  return /\b(?:fishing|fisherman|hunting|angling|angler|archery|bowhunting|realtree|whitetail|bassmaster|buckmasters|mossy oak|trap and skeet|sporting clays|sporting dogs|american sportsman|bill dance|jimmy houston|babe winkelman|orlando wilson)\b/.test(text);
}

export function iaFinalSportsAllowed(item = {}, channel = '') {
  const media=item.media||{},meta=item.meta||{},id=String(item.identifier||item.id||'');
  let source=String(item.sourceIdentifier||media.sourceIdentifier||id.split('::')[0]),file=String(item.fileName||media.fileName||id.split('::')[1]||'');
  const path=String(media.url||item.url||item.mediaUrl||id).match(/^https?:\/\/[^/]+\/(?:download|\d+\/items)\/([^/?#]+)\/([^?#]+)/i);
  if(path){if(!file)file=path[2];if(!item.sourceIdentifier&&!media.sourceIdentifier)try{source=decodeURIComponent(path[1]);}catch(_){}}
  try{file=decodeURIComponent(file);}catch(_){}
  const norm=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' '),leaf=file.split('/').pop().replace(/(?:\.ia)?\.[^.]+$/i,''),generic=/^(?:(?:video|videoplayback|program|race|title|vts|r)\W*\d*|[\d _.-]+)$/i.test(leaf);
  const selected=norm(file&&!generic?file:[item.title,meta.title,file].filter(Boolean).join(' ')),index=!file&&!media.url&&!item.url&&!item.mediaUrl;
  const language=String(media.language||item.language||meta.language||'').toLowerCase();
  if(language&&!/^(?:und|unknown|undetermined|n\/a)$/.test(language)&&!/(?:^|[,; /])(?:eng|en(?:[-_][a-z]+)?|english)(?:$|[,; /])/.test(language))return false;
  const value=String((['runtime','duration','length'].some(k=>Object.prototype.hasOwnProperty.call(media,k))?media.runtime||media.duration||media.length:item.runtime||item.duration)||0).split(':').map(Number),runtime=value.every(Number.isFinite)?value.reduce((a,b)=>a*60+b,0):0;
  if(!index&&runtime<900||Number(media.width||item.width)>0&&Number(media.height||item.height)>=Number(media.width||item.width))return false;
  if(/^(?:CNN|FOXNEWS|HLN|KGO|KPIX|KNTV|KRON|WBAL|WJZ|WPVI|WTSP|WUSA|TELEARUBA)[A-Z0-9]*_/i.test(source))return false;
  if(/\b(?:video games?|f1 ?challenge|gameplay|playthrough|longplay|simulation|simulator|nintendo|yoshi|super mario|xbox|playstation|wii fit|podcasts?|watch along|commentary only|audio only|reaction streams?|newscast|news report|press conference|full movie|feature film|fiction film|cartoons?|sitcom|fan film|fanmade|ai generated|fetish|naked|hotties|sex lies|photo slide show|bloopers|trailers?|promos?|incomplete|partial|fragment|clips?)\b/.test(selected)||/F1Challenge|Formula1SeasonMod|roosterteeth/i.test(source))return false;
  if(/\b(?:russian|spanish|portuguese|french|german|arabic|japanese) (?:audio|commentary|broadcast|aerobics|workout)\b|\b(?:latino|dublado)\b/.test(selected))return false;
  if(String(channel)==='77'){
    if(source==='cart-indycar-series-full-races-archival'&&/^(?:2001 Indy Racing League Casino Magic 500k At Texas Motor Speedway|2011 IZOD IndyCar Series Kentucky Indy 300)\.mp4$/i.test(file))return false;
    const reviewed=/^(?:cart-indycar-series-full-races-archival|grandam-americanlemans-imsa-full-race-archival|f1-(?:1990|1998|2000|2001)-full-race-replys?-grand-prix-highlights-and-reviews)$/.test(source);
    if(index&&reviewed)return true;
    if(/\b(?:highlights?|in review|reviews?|recaps?|condensed|abridged|classic telecast version|qualifying|practice|on ?board|post race|pre race only|accident coverage|sportscenter|speed news|start of race|tuesday conclusion|monday coverage|happy hour|cancelled|canceled|rainout|nascar|stock car|moto ?gp|motorcycle|motocross|bowling|cycling|chess|gymnastics|1966 full)\b|\b(?:part|pt|cd|disc)\s*\d+\b/.test(selected))return false;
    const topic=/\b(?:formula ?(?:one|1|two|2|three|3|e)|f[123]|indy ?car|indianapolis 500|indy 500|irl|cart|champ ?car|grand prix|le mans|imsa|alms|endurance rac(?:e|ing))\b/.test(selected);
    const format=/\b(?:race|racing|grand prix|gp|500|200|300|400|600|championship|documentary|history)\b/.test(selected);
    return (topic||reviewed)&&(index||format||reviewed)&&(index||runtime>=3600||/\b(?:full|complete) (?:sprint )?(?:race|broadcast|event)\b|\b(?:documentary|history)\b/.test(selected));
  }
  if(String(channel)==='78'){
    if(/\b(?:friends|elmos?|teletubbies|off topic|meat zone|emergency response|medical|health seminar|politic(?:s|al)|talk show|news|children|kids|sex fiends|watch first|side\s*[12]|part\s*\d+)\b/.test(selected))return false;
    const reviewed=source==='TheChampionWithin'&&/^The\.Infinite\.Voyage\.S03E04\.The\.Champion\.Within\.1989\./i.test(file)||/^Scvtv20-(?:ymffd25537|YM_FFD_240283-2)$/.test(source)&&/^Scvtv20-(?:ymffd25537|YM_FFD_240283)_512kb\.mp4$/i.test(file);
    return reviewed||/\b(?:fitness|workout|work out|exercise|bodybuilding|weightlifting|weight lifting|strength training|aerobics?|pilates|gymnastics|athletic (?:training|conditioning)|physical fitness|pumping iron|balletcise|ab doer)\b/.test(selected);
  }
  if(String(channel)==='79'){
    // Cue sports lead this channel. Retain the finals-day specials from these
    // large darts packages, not every long preliminary-day recording.
    if(/^(?:03-wsdt-|wsdt-world-darts-|20260205_20260205_2255)/.test(source)&&!index&&!/\bfinals? day\b/.test(selected))return false;
    if(/\b(?:swimming|swim|pool party|hot tub|swimming pool|hotel|parks and recreation|ozzie and harriet|city council|council meeting|the hustler|the color of money|kingpin|big lebowski|trick shots?|highlights?|recaps?|tutorial shorts|bowling for columbine)\b|\b(?:part|pt|disc)\s*\d+\b/.test(selected))return false;
    // These broadcaster filenames name players instead of the sport. Admit
    // only the reviewed media file; unrelated siblings still pass every veto above.
    const poolBroadcasts=['AH-show_offs_strickland_v_reyes_8_ball','AH-the_show_offs_us_amateur_women_3-2016','AH-the_show_offs_apa_pro_women','AH-the_show_offs_massey_vs_morris_3-2017'];
    if(poolBroadcasts.includes(source)&&(index||file===source+'.mp4'))return true;
    return /\b(?:bowling|candlepin|billiards?|snooker|darts?|power pool|(?:9|8|nine|eight) ball (?:tournament|championship|match)|pool (?:tournament|championship|match|competition)|(?:exhibition )?pool tournament)\b/.test(selected);
  }
  return true;
}

export function iaStockCarAllowed(item = {}) {
  const media=item.media||{},meta=item.meta||{},id=String(item.identifier||item.id||'');
  let source=String(item.sourceIdentifier||media.sourceIdentifier||id.split('::')[0]),file=String(item.fileName||media.fileName||id.split('::')[1]||'');
  const path=String(media.url||item.url||item.mediaUrl||id).match(/^https?:\/\/[^/]+\/(?:download|\d+\/items)\/([^/?#]+)\/([^?#]+)/i);
  if(path){if(!file)file=path[2];if(!item.sourceIdentifier&&!media.sourceIdentifier)try{source=decodeURIComponent(path[1]);}catch(_){}}
  try{file=decodeURIComponent(file);}catch(_){}
  // These filenames failed actual MP4 header checks; admit replacements only after format verification.
  if(source==='nascar-cup-series-full-races-archival'&&["2001 Winston All Star Race (Full race).mp4","2022 AutoTrader EchoPark Automotive 500 - NASCAR Cup Series Full Race Replay.mp4","2006 Charlotte 600 NASCAR Cup Full Race May 28, 2006.mp4","2010 Coke Zero 400 (HD).mp4","2011 Daytona 500.mp4","2006 Darlington NASCAR Cup Series Full Race May 13, 2006.mp4","2006 Pocono NASCAR Cup Series Full Race June 11, 2006.mp4","2009 NASCAR Sprint Cup Series Coke Zero 400.mp4","2006 Dover NASCAR Cup Full Race June 6, 2006.mp4","2007 Toyota-Save Mart 350.mp4","2006 Infineon, (aka- Sears Point or Sonoma) NASCAR Cup Full Race June 25, 2006.mp4","2001 NASCAR Winston Cup Series Harrah's 500.mp4","2006 Talladega NASCAR Cup Series Full Race October 8, 2006.mp4","2012 Hollywood Casino 400.mp4","2006 All Star NASCAR Cup Full Race May 20, 2006.mp4","2006 Daytona Dual 150's February 16, 2006 Full Race.mp4","2006 Michigan NASCAR Cup Full Race June 18, 2006.mp4","2006 Daytona Bud Shootout February 2, 2006 Full Race.mp4"].includes(file))return false;
  const norm=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' '),leaf=file.split('/').pop().replace(/(?:\.ia)?\.[^.]+$/i,''),generic=/^(?:(?:video|program|race|drag|title|vts)\W*\d*|\d+)$/i.test(leaf);
  const selected=norm(file&&!generic?file:[item.title,meta.title,file].filter(Boolean).join(' ')),text=selected+' '+norm(source);
  if(/^(?:CNN|FOXNEWS|HLN|KGO|KPIX|KNTV|KRON|WBAL|WJZ|WPVI|WTSP|WUSA|TELEARUBA)[A-Z0-9]*_/i.test(source))return false;
  if(/\b(?:newsroom|anderson cooper|fox friends|fox news|hannity|jesse watters|political|politics|newscast|eyewitness news|news report|o reilly factor|bonnie hunt|louder with crowder|podcasts?|press conference|interview|driver education|driver safety|slot cars|model cars|video games?|gameplay|playthrough|longplay|simulation|nintendo|test drive unlimited|nascar racers|cartoons?|anime|talladega nights|full movie|feature film|tutorial|how to|spark plug|promo|promotional|film trailer)\b/.test(text))return false;
  if(/\b(?:formula (?:one|1|two|2|three|3)|f1|grand prix|indycar|indy car|indianapolis 500|indy 500|imsa|alms|le mans|endurance racing|motorcycle racing|motocross|bicycle racing)\b/.test(text))return false;
  const edition=norm(file.toLowerCase());
  if(/\b(?:dublado|subtitulado)\b|\b(?:russian|german|french|spanish|japanese|portuguese) (?:audio|commentary|broadcast|dubbed|subtitles|720p|1080p|mp4)\b/.test(edition))return false;
  const reviewed=['01-1990-daytona-500-full-broadcast','2004-nascar-nextel-cup-series','nascar-cup-series-full-races-archival'].includes(source),index=!file&&!media.url&&!item.url&&!item.mediaUrl;
  if(index&&reviewed)return true;
  if(/\b(?:partial|incomplete|fragment|highlights?|recaps?|clips?|previews?|trailers?|post race|rainout|year in review|season review|qualifying|practice|happy hour|on ?board|in car only)\b|\b(?:part|pt|cd|disc)\s*\d+\b/.test(selected))return false;
  if(/\bdays of thunder\b/.test(selected)&&!/\b(?:daytona 500|full race|full broadcast)\b/.test(selected))return false;
  if(reviewed&&file&&!/^(?:\d{1,2} +)?(?:(?:nascar|nsc) +)?(?:19|20)\d{2}\b/.test(norm(leaf)))return false;
  const topic=/\b(?:nascar|stock ?car|dirt track|short track|sprint car|world of outlaws|late model racing|arca|nhra|drag rac(?:e|es|ing)|hot rod rac(?:e|es|ing)|daytona 500|talladega|brickyard)\b/;
  if(!topic.test(text))return false;
  const format=/\b(?:rac(?:e|es|ing)|full broadcast|raw satellite feed|championships?|finals?|event|round|documentary|history)\b/.test(selected);
  const declared=/\b(?:full|complete) (?:race|broadcast|event)|\braw satellite feed\b|\b(?:documentary|history)\b/.test(selected);
  const value=String(media.runtime||item.runtime||item.duration||0).split(':').map(Number),seconds=value.every(Number.isFinite)?value.reduce((sum,v)=>sum*60+v,0):0;
  return (format||reviewed)&&(reviewed||declared||seconds>=3600||index);
}

export function iaWaterSportsAllowed(item = {}) {
  const media=item.media||{},meta=item.meta||{},id=String(item.identifier||item.id||'');
  let source=String(item.sourceIdentifier||media.sourceIdentifier||id.split('::')[0]),file=String(item.fileName||media.fileName||id.split('::')[1]||'');
  const path=String(media.url||item.url||item.mediaUrl||id).match(/^https?:\/\/[^/]+\/(?:download|\d+\/items)\/([^/?#]+)\/([^?#]+)/i);
  if(path){if(!file)file=path[2];if(!item.sourceIdentifier&&!media.sourceIdentifier)try{source=decodeURIComponent(path[1]);}catch(_){}}
  try{file=decodeURIComponent(file);}catch(_){}
  if(/twitch/i.test(source))return false;
  const norm=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' '),selected=norm(file),text=norm([item.title,meta.title,file,source].filter(Boolean).join(' '));
  // A water-sport tag is not proof of actual competition footage.
  if(/\b(?:video games?|gameplay|playthrough|longplay|simulation|minecraft|sea of thieves|twitch|nintendo|mario|sonic|cartoon|anime|full movie|feature film|podcasts?|talk show|newscast|news report|press conference|home movies?|family scenes|vlog|travelogue|travel diary|sailing the mediterranean|scuba|shipwreck|marine wildlife|tourism|cruise ship|boat building|building a boat|cardboard|model sailboat|toy boat|rubber duck|fishing|opening day|open house|ribbon cutting|fundraiser|music video|concert|tutorial|how to|swimming lesson|workout|training tips)\b/.test(text))return false;
  if(/\b(?:partial|fragment|incomplete|highlights?|clips?|recaps?|previews?|promos?|trailers?|teasers?|opening ceremony|closing ceremony)\b|\b(?:part|pt|cd|disc|p)\s*\d+\b/.test(text))return false;
  const languageFile=norm(file.toLowerCase());
  if(/\b(?:swehd|schaatsen|purjehdus|olympiakisat|naisten|sd slo|dublado|subtitulado)\b/.test(languageFile))return false;
  if(/\b(?:swedish|norsk|finnish|russian|german|italian|spanish|japanese|french) (?:audio|commentary|broadcast|dubbed|subtitles|720p|1080p|hdtv|pdtv|webrip|mp4|m4v|webm)\b|\b(?:audio|commentary|language) (?:swedish|finnish|russian|german|italian|spanish|japanese|french)\b/.test(languageFile))return false;
  if(/\b(?:athletics|equestrian|dressage|basketball|football|hockey|tennis|volleyball|boxing|skiing|snowboard|wrestling)\b/.test(selected))return false;
  const water=/\b(?:sailing|sail regatta|sailboat rac(?:e|ing)|yacht rac(?:e|ing)|regatta|rowing|crew rac(?:e|ing)|canoe(?:ing)?|kayak(?:ing)?|swimming|diving|water ?polo|w polo|w w polo|aquatics)\b/;
  if(['2008_Beijing_Olympics','2016_Rio_Olympics_Aquatics'].includes(source)&&file&&!water.test(selected))return false;
  if(!water.test(text))return false;
  return /\b(?:olympic(?:s)?|championships?|finals?|heats?|repechages?|race|races|racing|regatta|session|coverage|broadcast|full show|program|documentary|history|vs?|match|meet)\b/.test(text);
}

export function iaWinterSportsAllowed(item = {}) {
  const media=item.media||{},meta=item.meta||{},id=String(item.identifier||item.id||'');
  let source=String(item.sourceIdentifier||media.sourceIdentifier||id.split('::')[0]);
  let file=String(item.fileName||media.fileName||id.split('::')[1]||'');
  const path=String(media.url||item.url||item.mediaUrl||id).match(/^https?:\/\/[^/]+\/(?:download|\d+\/items)\/([^/?#]+)\/([^?#]+)/i);
  if(path){if(!file)file=path[2];if(!item.sourceIdentifier&&!media.sourceIdentifier)try{source=decodeURIComponent(path[1]);}catch(_){}}
  try{file=decodeURIComponent(file);}catch(_){}
  const norm=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
  const selected=norm(file),text=norm([item.title,meta.title,file,source].filter(Boolean).join(' '));
  // Shared winter tags cannot qualify a game, resort promo or unrelated collection child.
  if(/\b(?:gameplay|video games?|gamevideoarchive|c64|playthrough|longplay|simulation|nintendo|anime|cartoon|bob the builder|little bear|full movie|feature film|podcasts?|talk show|news report|newscast|press conference|politics|protest|home movies?|family scenes|vacation|resort tour|opening day|open house|ribbon cutting|fundraiser|music video|concert|hair|ice hockey|roller skat(?:e|ing)|water ski(?:ing)?|waterskiing|tutorial|how to|lesson|workout|ski better|ski with a ranger)\b/.test(text))return false;
  if(/\b(?:partial|fragment|incomplete|trailers?|promos?|previews?|teasers?|highlights?|clips?|recaps?|scenes|best of the meet|run of the meet)\b|\b(?:part|pt|cd|disc)\s*\d+\b/.test(text))return false;
  if(/\b(?:opening|closing) ceremon(?:y|ies)\b/.test(text)||/\bceremon(?:y|ies)\b/.test(selected)&&!/\b(?:finals?|competition|runs?)\b/.test(selected))return false;
  if(/\b(?:swedish|swehd|schaatsen|norsk|norwegian|sloveni[ae]n|sd slo|german|russian|rus|italian|japanese|spanish|french|dublado|subtitulado)\b/.test(norm(file.toLowerCase())))return false;
  if(/\b(?:athletics|marathon|football|basketball|volleyball|swimming|tennis|boxing|nascar|wrestling|ice hockey|hockey)\b/.test(selected))return false;
  const winter=/\b(?:winter sports?|winter olympic(?:s)?|ski(?:ing)?|ski jump(?:ing)?|moguls|snowboard(?:ing)?|figure skat(?:e|ing)|speed ?skat(?:e|ing)|short track|ice danc(?:e|ing)|curling|biathlon|bobsle(?:d|igh)|luge|skeleton|nordic combined)\b/;
  if(source==='2010_Vancouver_Olympics'&&file&&!winter.test(selected))return false;
  // Do not count multiple frame-rate conversions of the same Reno VHS broadcast.
  if(source==='salt-lake-olympics'&&file!=='2002olympics-60fps.mp4')return false;
  if(!winter.test(text))return false;
  return /\b(?:olympic(?:s)?|championships?|world cup|finals?|qualif(?:ication|ications|ying)|session|coverage|broadcast|program|documentary|history|film|warren miller|vs?|meet|ski jumping|biathlon|skiing|snowboarding|curling)\b/.test(text);
}

export function iaEquestrianAllowed(item = {}) {
  const media=item.media||{},meta=item.meta||{},id=String(item.identifier||item.id||'');
  let source=String(item.sourceIdentifier||media.sourceIdentifier||id.split('::')[0]);
  let file=String(item.fileName||media.fileName||id.split('::')[1]||'');
  // Old rapid-tune caches stored only a direct URL. Recover the same selected
  // path before checking a mixed collection; a missing field is not a genre exemption.
  const path=String(media.url||item.url||item.mediaUrl||id).match(/^https?:\/\/[^/]+\/(?:download|\d+\/items)\/([^/?#]+)\/([^?#]+)/i);
  if (path) {
    if (!file) file=path[2];
    if (!item.sourceIdentifier&&!media.sourceIdentifier) { try { source=decodeURIComponent(path[1]); } catch (_) {} }
  }
  try { file=decodeURIComponent(file); } catch (_) {}
  const norm=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
  const selected=norm(file),text=norm([item.title,meta.title,file,source].filter(Boolean).join(' '));
  // Generic horse-sport subject tags cannot qualify a poem, game, movie or unrelated Olympic child.
  if (/\b(?:poetry|poems?|poet|umamusume|uma musume|anime|cartoon|equestria girls|my little pony|video games?|gameplay|playthrough|board games?|android device|nintendo|podcasts?|talk show|people are talking|good morning shrewsbury|sportsline|press conference|simulcast agreement|action news|newscast|news minute|ribbon cutting|statue|portraitist|home movies?|family scenes|firefighting|fire fighting|travelogue|tourism|politics|political|council|gala|party|fundraiser|balloon|steamboat|music video|concert|full movie|feature film|blu ray|dvdrip|tutorial|how to|coaching|instruction(?:al)?|training lesson|road safety|therapy|therapeutic)\b/.test(text)) return false;
  if (/\b(?:partial|incomplete|fragment|trailers?|promos?|previews?|teasers?|dvd menus?|bonus features?)\b|\b(?:part|pt)\s*(?:\d+|[ivx]+)\b/.test(text)) return false;
  if (/\b(?:athletics|marathon|football|basketball|volleyball|swimming|table tennis|t tennis|boxing|badminton|gymnastics|nascar|motor racing|wrestling)\b/.test(selected)) return false;
  const horse=/\b(?:equestrian|dressage|eventing|show jumping|horse rac(?:e|es|ing)|horseracing|thoroughbred|harness horse|kentucky derby|breeders.? cup|belmont stakes|preakness|secretariat|seabiscuit|steeplechase)\b/;
  if (['2008_Beijing_Olympics','Olympics.2012.BBC'].includes(source) && file && !horse.test(selected)) return false;
  if (!horse.test(text)) return false;
  const format=/\b(?:broadcast|championship|finals?|session|event(?:s|ing)?|meet|olympic(?:s)?|grand prix|cross country|documentary|history|story|profile|biography|racing legend|life and times|last race|best of|thrills and spills|saddle up)\b/;
  return format.test(text);
}

export function iaRodeoAllowed(item = {}) {
  const media=item.media||{},meta=item.meta||{},id=String(item.identifier||item.id||'');
  const source=String(item.sourceIdentifier||media.sourceIdentifier||id.split('::')[0]);
  // This identically named legacy upload is a Mack Sennett fictional comedy.
  if (source==='The_Rodeo') return false;
  let file=String(item.fileName||media.fileName||id.split('::')[1]||'');
  try { file=decodeURIComponent(file); } catch (_) {}
  const text=[item.title,meta.title,file,source].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./-]+/g,' ');
  // Identity comes from the selected program, never the inherited rodeo tags.
  if (/\b(?:fishing|bicycle|bike|motorcycle|mechanical bull|bus|transit|starmetro|roadeo|lineman|lineworker|backhoe|skid steer|truck|traffic|safety fair|city council|policy meeting|frank ?talks|hit the bricks|not just books|statue unveiling|news report|newscast|talk show|book discussion|panel discussion|politics|political|news minute|news flash|press conference|media day|interview|podcasts?|tutorial|how to|parade|pageant|princess competition|royalty|carnival|vacation|home movies?|family scenes|music video|country music|blue rodeo|concert|song|full movie|feature film|eight seconds|8 seconds|rodeo romeo|cartoon|gameplay|video game|nintendo|playthrough|rental rodeo|rodeo fx|goat rodeo|not my first rodeo|fragment|incomplete)\b/.test(text)) return false;
  if (/\bpart\s+(?:\d+|[ivx]+)\s+(?:of\s+\d+)?\b|\b(?:trailers?|promos?|previews?|teasers?|tv spots?|dvd menus?|bonus features?)\b/.test(text)) return false;
  return /\b(?:rodeos?|bull ?riding|professional bull riders|national finals rodeo|barrel rac(?:e|es|ing)|calf roping|breakaway roping|team roping|steer wrestling|saddle bronc|bareback riding|mutton bust(?:in|ing)|goat tying|pole bending)\b/.test(text);
}

export function iaSportsNewsreelAllowed(item = {}) {
  const media=item.media||{},meta=item.meta||{},id=String(item.identifier||item.id||'');
  const source=String(item.sourceIdentifier||media.sourceIdentifier||id.split('::')[0]);
  // These old seeds were fiction and television engineering, respectively.
  if (['On_Your_Toes_P1','Magicint1955'].includes(source)) return false;
  let file=String(item.fileName||media.fileName||id.split('::')[1]||'');
  try { file=decodeURIComponent(file); } catch (_) {}
  const norm=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[_./–-]+/g,' ');
  const selected=norm(file),title=norm(item.title||meta.title),text=title+' '+selected;
  if (/\b(?:dvd menus?|trailers?|bonus features?|podcasts?|movie reviews?|movies you may have missed|city council|policy meeting|video yearbook|high school yearbook|television engineering|full movie|feature film|gameplay|video games?|playthrough|longplay|nintendo|playstation|nfl 2k\d*|nba 2k\d*)\b/.test(text)) return false;
  // A selected child has its own identity; a collection heading cannot turn a game into a report.
  const magazine=/\b(?:abc )?wide world of sports\b/.test(text);
  const report=/\b(?:newsreel|news features?|highlights?|reviews?|yearbook|athlete profile|sports documentary|informal history|the great years|juice on the loose|race film|tales from the vault)\b/;
  const game=/\b(?:full|complete) (?:game|match|race|broadcast)\b|\ball star game\b|\bgame\s+\d{1,2}\b|\b(?:vs?|versus)\b/;
  const edited=/\b(?:highlights?|reviews?|yearbook|athlete profile|documentary|history|race film)\b/;
  // These three inspected files are 41–72-minute edited ABC race reports,
  // despite uploader filenames calling the three-hour events "Full Race".
  const reviewedRaceReport=source==='full-race-broadcast-1970-indianapolis-500' && [
    '1967 Indianapolis 500 Full Race).mp4',
    '1968 Indianapolis 500 _ INDYCAR Classic Full-Race Rewind.mp4',
    'Full Race Broadcast_ 1970 Indianapolis 500.mp4'
  ].includes(file);
  if (game.test(selected) && !edited.test(selected) && !/\bwide world of sports\b/.test(selected) && !reviewedRaceReport) return false;
  if (!game.test(selected) && game.test(title) && !edited.test(title) && !magazine) return false;
  const sport=/\b(?:sports?|athlet(?:e|es|ics)|football|nfl|giants|bears|simpson|basketball|nba|globetrotters|golf|british open|formula 1|grand prix|indianapolis|le mans|olympi(?:c|cs|ad)|tennis|boxing|baseball|soccer|hockey|wrestling|track and field|racing)\b/.test(text);
  if (!sport || !(report.test(text)||magazine)) return false;
  // Select the covered event year before an uploader/reissue date. Do not read 1920x1080 as a year.
  const years=value=>[...String(value||'').matchAll(/(?:^|[^\d])((?:19|20)\d{2})(?!\d|\s*[x×]\s*\d)/g)].map(m=>Number(m[1]));
  // A later parenthesized release/reissue year must not replace the leading event year.
  const fileYears=years(file),titleYears=years(item.title||meta.title),year=(fileYears.length?fileYears:titleYears)[0]||Number(item.year||meta.year)||0;
  const parent=!media.url&&!item.url&&!item.mediaUrl&&!file&&!id.includes('::');
  return parent&&!year || year>=1920&&year<=1985;
}

export function iaCoachingAllowed(item = {}) {
  if (!item || typeof item !== 'object') return false;
  const selected = String(item.fileName || item.media?.fileName || String(item.identifier || item.id || '').split('::')[1] || '').replace(/[_./-]+/g,' ');
  if (/\b(?:interviews?|full (?:game|match)|dvd menus?|trailers?|music videos?|bonus features?|podcasts?)\b/i.test(selected)) return false;
  if (/\b(?:full|complete)(?: [a-z]+){0,3} (?:game|match|broadcast)\b/i.test(selected)) return false;
  const selectedLesson = /\b(?:coaching|clinic|instruction(?:al)?|lessons?|drills?|skills?|fundamentals?|tactics|techniques?|training|conditioning|practice)\b/i.test(selected);
  if (!selectedLesson && /\b(?:vs?|versus)\b|\bgame\s+\d{1,3}\b/i.test(selected)) return false;
  const text = [item.title,item.seriesTitle,item.fileName,item.media?.sourceTitle,item.meta?.title,item.sourceIdentifier,item.identifier || item.id]
    .filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g,' ');
  if (/\b(?:coach and captains|coach captains|coach & captains|coach shev|coaching news|sports news|news broadcast|tv spot|career|health sciences|health leaders|kinesiology 101|courtside clinician|guilty secrets|doctors tennis|pro evolution soccer|video games?|gameplay|life coaching|business coaching|civic engagement|social skills|panel discussion|project play summit|access spotlight|podcasts?|interviews?|press conference|city council|school committee|retirement|honored following|twitch|funny or die)\b/.test(text)) return false;
  if (/\bcoerver method\b/.test(text)) return true;
  const sport=/\b(?:basketball|baseball|football|soccer|tennis|golf|volleyball|wrestling|swimming|track and field|hockey|kayaking|rowing|boxing|rodeo|track|athletic conditioning|physical education)\b/.test(text);
  const lesson=/\b(?:coaching|clinic|instruction(?:al)?|fundamentals?|skills|drills|techniques?|tactics|playbook|training|conditioning|footwork|ball handling|player development|team play|practice|how to play|lesson with|tennis kqed|vic braden)\b/.test(text);
  return sport && lesson;
}

export function iaSurfSkateSnowAllowed(item = {}) {
  if (!item || typeof item !== 'object') return false;
  const source = String(item.sourceIdentifier || item.media?.sourceIdentifier || item.identifier || item.id || '').replace(/^ia:/i, '').split('::')[0];
  const selected = String(item.fileName || item.media?.fileName || String(item.identifier || item.id || '').split('::')[1] || '').replace(/[_./-]+/g,' ');
  // A parent film identity cannot turn an explicitly labelled DVD extra into the film.
  if (/\b(?:bonus interview|interviews?|music videos?|making of|featurettes?|dvd menus?|deleted scenes?|trailers?)\b/i.test(selected)) return false;
  // Metadata review: these old entries are talk/music/sailing/skydiving, despite shared sports tags.
  if (['ian-and-jay-space-out-2024-07-07','Xcorps16TheMUSIChd2','Xcorps64NoodSailingHD2_201802','Xcorps4AIRBORNEhd2'].includes(source)) return false;
  const text = [item.title,item.seriesTitle,item.fileName,item.media?.sourceTitle,source,item.identifier || item.id,item.meta?.title]
    .filter(Boolean).join(' ').toLowerCase().replace(/[_./-]+/g,' ');
  if (/\b(?:city council|council meeting|public hearing|politics|political|podcasts?|talk show|full movie comedy|surf school|surf nazis|surf ninjas|surf s up|johnny tsunami|johnny kapahala|chalet girl|out cold|fan made|parody|gameplay|video games?|simulator|press conference|software tutorial)\b/.test(text)) return false;
  // Specific reviewed mixed episodes contain actual skating, unlike the excluded sibling episodes.
  if (['Xcorps21ASRhd2','Xcorps25MOTOSK8hd2','Xcorps47BIGAIRhd2','heroin-roger-homage-2022','element-bams-or-bust-2008','girl-chocolate-badass-meets-dumbass-2007','fourstar-gang-of-fourstar-2009'].includes(source)) return true;
  return /\b(?:surf(?:ing)?|skateboard(?:ing)?|snowboard(?:ing)?|skiing|skate video|skate film|transworld|411 ?vm|411 video magazine|mack dawg|endless summer|september sessions|world industries|tree fort|lo fi skate explosion)\b/.test(text);
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
  if (channel === '71') return Math.max(requested, 2700);
  if (['60','72'].includes(channel)) return Math.max(requested, 1800);
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
  // These cached names were verified against Archive's identical SHA-1 and
  // explicit original-file relationship; never strip DVD title numbers globally.
  if (source === 'dvd-transfer-224' && /^(?:title 1 )?super bowl x \(2023 nfl network rebroadcast\)$/.test(stem)) return 'super bowl x (2023 nfl network rebroadcast)';
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
  if (['52','53','55','56','57','58','59','60','61','62','63','64','65','66','68','69','70','71','72','73','74','75','76','77','78','79'].includes(channel) && iaKnownVideoPolicyViolation(item, rules)) return reject('off-genre-sports');
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
