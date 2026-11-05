/* Shared, conservative sports identity/selection. No discovery or network I/O. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RealSignalSports=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function enabled(channel){return channel==='nascar-classics'||Number(channel)>=51&&Number(channel)<=84;}
 function id(item){
  var value=String(item&&(item.identifier||item.id)||'');
  // Old rapid-tune records sometimes used the CDN URL as their identifier.
  // Preserve the exact Archive file identity across cache and catalog records.
  if(/^https?:\/\//i.test(value))try{
   var parsed=new URL(value),file=parsed.pathname.match(/^\/(?:download|\d+\/items)\/([^/]+)\/(.+)$/);
   if(/(?:^|\.)archive\.org$/i.test(parsed.hostname)&&file)return decodeURIComponent(file[1])+'::'+decodeURIComponent(file[2]);
  }catch(_){}
  return value;
 }
 function url(item){return String(item&&(item.media&&item.media.url||item.mediaUrl||item.url)||'');}
 function clean(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
 function seconds(item){var m=item&&item.media||{},meta=item&&item.meta||{},v=m.runtime||item&&item.runtime||item&&item.duration||meta.runtime||0;var p=String(v).split(':').map(Number);return p.every(Number.isFinite)?p.reduce(function(a,b){return a*60+b;},0):0;}
 function selectedTitle(item,channel){
  var raw=id(item),file=String(item.fileName||raw.includes('::')&&raw.slice(raw.indexOf('::')+2)||'');
  try{file=decodeURIComponent(file);}catch(_){}
  file=file.split('/').pop().replace(/(?:\.ia)?\.(?:mp4|m4v|webm|mov|ogv)$/i,'');
  if(file&&!/^(?:vts\W*\d+|(?:video|title|part|episode|disc)\W*\d+|\d+)$/i.test(file)&&(/\b(?:19|20)\d{2}\b|\b(?:nfl|nba|nhl|mlb|ufc|super[ ._-]*bowl|daytona|indianapolis|grand[ ._-]*prix)\b|\bvs?\b/i.test(file.replace(/_/g,' '))||Number(channel)===57&&/^\d{6}\s/.test(file)))return file;
  var parent=String(item.title||item.meta&&item.meta.title||''),part=clean(file).match(/\b(?:part|pt|disc)\s*(\d+)\b/);
  return parent+(part&&!/\b(?:part|pt|disc)\s*\d+\b/i.test(parent)?' Part '+part[1]:'');
 }
 function competition(text,channel){
  if(Number(channel)===77){
   if(/\b(?:imsa|alms|le mans|endurance|rolex 24)\b/.test(text))return 'grandprix-endurance';
   if(/\b(?:indy ?car|indianapolis|indy 500|irl|cart|champ ?car)\b/.test(text))return 'grandprix-indycar';
   return 'grandprix-formula';
  }
  if(Number(channel)===78){
   if(/\b(?:weightlifting|weight lifting|gymnastics)\b/.test(text))return 'fitness-competition';
   if(/\b(?:bodybuilding|champion within|pumping iron|comeback)\b/.test(text))return 'fitness-strength';
   if(/\b(?:pilates|balletcise)\b/.test(text))return 'fitness-pilates';
   return 'fitness-workout';
  }
  if(Number(channel)===79){
   if(/\bdarts?\b/.test(text))return 'recreation-darts';
   if(/\b(?:bowling|candlepin)\b/.test(text))return 'recreation-bowling';
   if(/\bsnooker\b/.test(text))return 'recreation-snooker';
   return 'recreation-pool';
  }
  if(Number(channel)===76){
   if(/\b(?:nhra|drag rac(?:e|es|ing))\b/.test(text))return 'stockcar-drag';
   if(/\barca\b/.test(text))return 'stockcar-arca';
   if(/\bnascar\b|\b01 1990 daytona 500 full broadcast\b|\b(?:daytona 500|talladega|brickyard 400)\b/.test(text))return 'stockcar-nascar';
   if(/\b(?:dirt track|sprint car|world of outlaws|pdtr|late model)\b/.test(text))return 'stockcar-dirt';
   return 'stockcar-short-track';
  }
  if(Number(channel)===75){
   var waters=[['polo',/\b(?:water ?polo|w polo|w wpolo|m wpolo)\b/],['sailing',/\b(?:sailing|regatta|yacht racing|nood)\b/],['rowing',/\b(?:rowing|crew racing)\b/],['paddling',/\b(?:canoe(?:ing)?|kayak(?:ing)?)\b/],['artistic-swimming',/\b(?:synchroni[sz]ed swimming|artistic swimming)\b/],['diving',/\b(?:diving|springboard|platform)\b/],['swimming',/\bswimming\b/]];
   for(var w=0;w<waters.length;w++)if(waters[w][1].test(text))return 'water-'+waters[w][0];
   return 'water-multisport';
  }
  if(Number(channel)===74){
   var winters=[['biathlon',/\bbiathlon\b/],['curling',/\bcurling\b/],['snowboard',/\bsnowboard(?:ing)?\b/],['sliding',/\b(?:bobsleigh|bobsled|luge|skeleton)\b/],['ski-jumping',/\bski jump(?:ing)?\b/],['nordic',/\b(?:cross country skiing|nordic combined)\b/],['figure-skating',/\b(?:figure skat(?:ing|ng)|ice dance)\b/],['speed-skating',/\b(?:speed ?skating|short track)\b/],['freestyle-skiing',/\b(?:freestyle|moguls|ski cross|slopestyle|halfpipe)\b/],['alpine-skiing',/\b(?:skiing|slalom|downhill)\b/]];
   for(var w=0;w<winters.length;w++)if(winters[w][1].test(text))return 'winter-'+winters[w][0];
   return 'winter-multisport';
  }
  if(Number(channel)===73){
   if(/\b(?:eventing|cross country)\b/.test(text))return 'horse-eventing';
   if(/\b(?:horse racing|horseracing|thoroughbred|harness horse|kentucky derby|breeders.? cup|belmont stakes|preakness|secretariat|seabiscuit|triple crown)\b/.test(text))return 'horse-racing';
   if(/\bdressage\b/.test(text))return 'horse-dressage';
   if(/\b(?:show jumping|jumping)\b/.test(text))return 'horse-jumping';
   return 'horse-equestrian';
  }
  if(Number(channel)===70){
   var families=[['superstars',/\brodeo superstars|superstars rodeo\b/],['franklin',/\bfranklin\b/],['winter-series',/\bwinter series|diamond fork\b/],['houston',/\bhouston\b/],['orick',/\borick\b/],['valemount',/\b(?:valemount|canoe mountain)\b/],['vhs',/\b(?:bloopers|worst wrecks)\b/],['historic',/\b(?:historic|callister|documentary)\b/]];
   for(var i=0;i<families.length;i++)if(families[i][1].test(text))return 'rodeo-'+families[i][0];
   return 'rodeo-events';
  }
  if(Number(channel)===69){
   var disciplines=[['olympics',/\bolympi(?:c|cs|ad)\b/],['racing',/\b(?:formula 1|grand prix|indianapolis|le mans|race film)\b/],['basketball',/\b(?:nba|basketball|globetrotters)\b/],['golf',/\b(?:golf|british open)\b/],['football',/\b(?:football|nfl|giants|bears|simpson)\b/],['boxing',/\b(?:boxing|sonny liston|leotis martin)\b/],['tennis',/\btennis\b/]];
   for(var i=0;i<disciplines.length;i++)if(disciplines[i][1].test(text))return 'news-'+disciplines[i][0];
   return 'news-multisport';
  }
  if(Number(channel)===68){
   if(/\bcoerver\b/.test(text))return 'coaching-soccer';
   var sport=text.match(/\b(basketball|baseball|soccer|football|tennis|golf|volleyball|wrestling|swimming|hockey|kayaking|rowing|boxing|rodeo)\b/);
   return 'coaching-'+(sport?sport[1]:/\btrack and field\b/.test(text)?'athletics':'conditioning');
  }
  if(Number(channel)===66){
   if(/\b(?:surf(?:ing)?|endless summer|september sessions)\b/.test(text))return 'action-surf';
   if(/\b(?:skateboard(?:ing)?|skate|transworld|411 ?vm|411 video magazine|sick boys|tree fort|world industries|heroin|bams or bust|badass meets dumbass|fourstar)\b/.test(text))return 'action-skate';
   if(/\b(?:snowboard(?:ing)?|skiing|mack dawg)\b/.test(text))return 'action-snow';
   return 'action-mixed';
  }
  if(Number(channel)===65){
   if(/\b(?:fishing|fisherman|angler|angling|in fisherman|catfish|panfish|bassin|bill dance|jimmy houston|babe winkelman|orlando wilson)\b/.test(text))return 'outdoor-fishing';
   if(/\b(?:hunting|bowhunting|whitetail|realtree|real tree|monster bucks|buckmasters|mossy oak|turkey school|sports afield|eastmans|capstick)\b/.test(text))return 'outdoor-hunting';
   if(/\b(?:archery|skeet|trap|sporting clays|sporting dogs|field trials?)\b/.test(text))return 'outdoor-field';
   return 'outdoor-recreation';
  }
  if(Number(channel)===61){
   var disciplines=[['ceremony',/\bceremon(?:y|ies)\b/],['swimming',/\bswimming\b/],['diving',/\bdiving\b/],['water-polo',/\bwater polo\b/],['basketball',/\bbasketball\b/],['volleyball',/\bvolleyball\b/],['soccer',/\b(?:soccer|football)\b/],['archery',/\barchery\b/],['gymnastics',/\bgymnastics\b/],['athletics',/\b(?:athletics|track and field|race walking|marathon|steeplechase|hurdles|javelin|discus|shot put|pole vault|high jump|long jump|triple jump|heptathlon|decathlon)\b/],['hockey',/\bhockey\b/],['skating',/\b(?:skating|short track)\b/],['skiing',/\b(?:skiing|ski|biathlon|nordic combined)\b/],['snowboard',/\bsnowboard(?:ing)?\b/],['sliding',/\b(?:bobsleigh|bobsled|luge|skeleton)\b/],['cycling',/\bcycling\b/],['racquet',/\b(?:tennis|badminton)\b/],['combat',/\b(?:boxing|wrestling|judo|taekwondo|fencing)\b/],['rowing',/\b(?:rowing|canoe|kayak|sailing)\b/],['weightlifting',/\bweightlifting\b/],['equestrian',/\b(?:equestrian|dressage)\b/],['breaking',/\b(?:breaking|breakdancing|raygun)\b/]];
   for(var d=0;d<disciplines.length;d++)if(disciplines[d][1].test(text))return 'olympics-'+disciplines[d][0];
  }

  if(Number(channel)===57){
   if(/\b(?:lingerie football league|legends football league|lfl)\b/.test(text))return 'lfl';
   if(/\b(?:high school football|school football|varsity football)\b/.test(text))return 'high-school';
   var footballLeague=text.match(/\b(cfl|usfl|xfl|ufl)\b/);if(footballLeague)return footballLeague[1];
   if(/\b(?:ncaa|college football|rose bowl|sugar bowl|orange bowl|cotton bowl|fiesta bowl|peach bowl)\b/.test(text))return 'ncaa';
  }
  if(Number(channel)===59){
   if(/\blittle league\b/.test(text))return 'little-league';
   if(/\b(?:ncaa|college baseball|college world series)\b/.test(text))return 'ncaa';
   if(/\bworld baseball classic\b/.test(text))return 'wbc';
   if(/\bnegro leagues\b/.test(text))return 'negro-leagues';
   if(/\b(?:mlb|major league baseball|world series)\b/.test(text))return 'mlb';
  }
  if(Number(channel)===55){
   if(/\b(?:roller ?derby|rollergames|roller games)\b/.test(text))return 'roller-derby';
   if(/\b(?:wcw|world championship wrestling)\b/.test(text))return 'wcw';
   if(/\b(?:njpw|new japan pro wrestling)\b/.test(text))return 'njpw';
   if(/\b(?:wccw|world class championship wrestling)\b/.test(text))return 'wccw';
   if(/\b(?:ecw|extreme championship wrestling)\b/.test(text))return 'ecw';
   if(/\bwrestling society x\b/.test(text))return 'wsx';
   if(/\b(?:awa|american wrestling association)\b/.test(text))return 'awa';
   if(/\b(?:nwa|national wrestling alliance)\b/.test(text))return 'nwa';
  }
  var formula=text.match(/\bformula (one|two|three|[123e])\b/);
  if(formula)return 'formula-'+({one:'1',two:'2',three:'3'}[formula[1]]||formula[1]);
  var pairs=[['nascar',/\bnascar\b|\b(?:daytona|talladega) 500\b/],['indycar',/\bindycar\b|\bindianapolis 500\b|\bindy 500\b/],['imsa',/\b(?:imsa|alms|uscc)\b/],['formula',/\bformula (?:one|[123e])\b|\bgrand prix\b/],['ufc',/\bufc\b/],['pride',/\bpride (?:fc|fighting|\d)\b/],['nfl',/\bnfl\b|\bsuper bowl\b/],['nba',/\bnba\b/],['wnba',/\bwnba\b/],['nhl',/\bnhl\b/],['mlb',/\bmlb\b|\bworld series\b/],['ncaa',/\bncaa\b|\bcollege (?:football|basketball|baseball)\b/],['olympics',/\bolympic(?:s)?\b/],['fifa',/\bfifa\b|\bfifa world cup\b/],['nhra',/\bnhra\b/],['pga',/\bpga\b/],['atp',/\batp\b/],['wta',/\bwta\b/],['wwe',/\b(?:wwe|wwf)\b/]];
  for(var i=0;i<pairs.length;i++)if(pairs[i][1].test(text))return pairs[i][0];
  return ({51:'nfl',52:'mma',56:'boxing',57:'football',58:'basketball',59:'baseball',60:'hockey',61:'olympics',62:'college',63:'soccer',64:'athletics',70:'rodeo',71:'golf',72:'racquet',73:'equestrian',74:'winter-sport',75:'water-sport',76:'stockcar',77:'formula',80:'hunting',81:'fishing',82:'backcountry',83:'field-sport',84:'nascar','nascar-classics':'nascar'})[channel]||'sport';
 }
 function soccerDescription(item){
  var raw=selectedTitle(item,63),selectedFile=String(item.fileName||id(item).split('::')[1]||''),segments=selectedFile.split('/'),leaf=segments.pop()||'',folder=segments.pop()||'';
  // Broadcaster/copy-number leaves belong to the fixture named by their folder.
  if(!/\b(?:vs?|versus)\b/i.test(leaf)&&/\b(?:vs?|versus)\b/i.test(folder)&&/\b(?:19|20)\d{2}\b/.test(folder))raw=folder;
  var text=clean(raw),context=clean(raw+' '+String(item.title||'')+' '+String(item.seriesTitle||'')+' '+String(item.subject||''));
  var women=/\bwomen(?:s)?\b|\bgirls\b/.test(context),kind='soccer';
  var leagues=[['world-cup',/\b(?:fifa|world cup)\b/],['champions-league',/\b(?:champions league|ucl)\b/],['fa-cup',/\bfa cup\b/],['premier-league',/\b(?:premier league|epl)\b/],['la-liga',/\b(?:la liga|laliga)\b/],['olympic',/\bolympic(?:s)?\b/],['college',/\b(?:college|university|ncaa|njcaa|naia)\b/],['school',/\b(?:high school|varsity|boys soccer|girls soccer)\b/]];
  for(var l=0;l<leagues.length;l++)if(leagues[l][1].test(context)){kind=leagues[l][0];break;}
  var y=raw.match(/\b((?:19|20)\d{2})\b/),year=Number(y?y[1]:String(item.year||'').slice(0,4))||0;
  var result={eventId:'',competition:'soccer-'+kind+(women?'-women':'-men'),sport:'soccer',year:year,era:year?Math.floor(year/10)*10:0,participants:[],format:'program'};
  if(/\b(?:documentary|history of|official centenary|soccer legends|premier league years)\b/.test(context)){result.format='documentary';return result;}
  var date=String(item.eventDate||''),file=String(item.fileName||id(item).split('::')[1]||''),iso=(file+' '+raw).match(/\b((?:19|20)\d{2})[-_.](\d{2})[-_.](\d{2})\b/);
  if(!date&&iso)date=iso[1]+'-'+iso[2]+'-'+iso[3];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)date='';
  if(date){result.year=Number(date.slice(0,4));result.era=Math.floor(result.year/10)*10;}
  var stage=(text.match(/\b(quarter ?finals?|semi ?finals?|third place|round of 16|group [a-h]|final)\b/)||[])[1]||'',leg=(text.match(/\b((?:1st|2nd|first|second) leg|replay)\b/)||[])[1]||'';
  var names=text.replace(/\b(?:one ddl com|oneddl com|zmovie4u com)\b/g,' ').replace(/\b(?:19|20)\d{2}(?: \d{2} \d{2})?\b/g,' ')
   .replace(/\b(?:fifa|uefa|world cup|champions league|ucl|fa cup|premier league|epl|la liga|laliga|olympic(?:s)?(?: games)?|soccer|football|high school|varsity|college|women(?:s)?|men(?:s)?|boys|girls|full|complete|match|game|broadcast|coverage|quarter ?finals?|semi ?finals?|third place|round of 16|group [a-h]|final|(?:1st|2nd|first|second) leg|replay)\b/g,' ')
   .replace(/\b(?:hdtv|pdtv|webrip|web dl|h264|h 264|x264|x265|aac|ac3|dd|uploaded by)\b.*$/,' ').replace(/\b(?:1080[pi]|720p|2160p|4k|hd|uhd|bbc|itv|espn|english|eng)\b/g,' ').replace(/^\d+\s+/,' ').replace(/\s+/g,' ').trim().replace(/\s+[a-z0-9]+ (?:org|com|net)$/,'');
  var pair=names.match(/^(.+?)\s+(?:vs?|versus|x|at)\s+(.+)$/);
  if(pair)result.participants=[clean(pair[1]),clean(pair[2])].sort();
  if(result.participants.length===2){
   if(date)result.eventId='sports:'+result.competition+':'+date+':'+result.participants.join('-vs-');
   else if(year&&stage&&(kind==='world-cup'||kind==='olympic'||stage==='final'||leg))result.eventId='sports:'+result.competition+':'+year+':'+stage.replace(/ /g,'-')+':'+result.participants.join('-vs-')+(leg?':'+leg.replace(/ /g,'-'):'');
  }
  if(result.eventId||/\b(?:full|complete) (?:match|game|broadcast)\b/.test(text))result.format='event';
  return result;
 }
 function athleticsDescription(item){
  var raw=selectedTitle(item,64),file=String(item.fileName||id(item).split('::')[1]||''),text=clean(raw+' '+file),label=clean(raw+' '+String(item.title||'')+' '+String(item.seriesTitle||''));
  var y=(file+' '+raw).match(/\b((?:19|20)\d{2})\b/),year=Number(y?y[1]:String(item.year||'').slice(0,4))||0,discipline='meet';
  var types=[['combined',/\b(?:heptathlon|decathlon)\b/],['road',/\b(?:marathon|road running|road race)\b/],['walk',/\brace walk(?:ing)?\b/],['jumps',/\b(?:high jump|long jump|triple jump|pole vault)\b/],['throws',/\b(?:discus|shot put|javelin|hammer)\b/],['hurdles',/\b(?:hurdles|steeplechase)\b/],['distance',/\b(?:[135]\d{3}|10000)m\b/],['sprints',/\b(?:100|200|400|800)m\b|\brelay\b/]];
  for(var d=0;d<types.length;d++)if(types[d][1].test(text)){discipline=types[d][0];break;}
  var result={eventId:'',competition:'athletics-'+discipline,sport:'athletics',year:year,era:year?Math.floor(year/10)*10:0,participants:[],format:'program'};
  if(/\b(?:documentary|history|biography|american experience|this is your life|fire on the track)\b/.test(label)){result.format='documentary';return result;}
  var date=String(item.eventDate||''),iso=(file+' '+raw).match(/\b((?:19|20)\d{2})[-_.](\d{2})[-_.](\d{2})\b/);
  if(!date&&iso)date=iso[1]+'-'+iso[2]+'-'+iso[3];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)date='';
  if(date){result.year=Number(date.slice(0,4));result.era=Math.floor(result.year/10)*10;}
  var leaf=file.split('/').pop()?.replace(/(?:\.ia)?\.mp4$/i,'')||'',generic=/^(?:(?:event|video|recording|file|title|part|disc|vts)[ _.-]*\d*|\d+)$/i.test(leaf);
  var part=(text.match(/\b(?:part|pt|disc)\s*(\d+)\b/)||[])[1]||'',stem=clean(!leaf||generic?raw:leaf)
   .replace(/\b(?:hdtv|pdtv|webrip|web dl|h264|h 264|x264|x265|aac|dd)\b.*$/,' ').replace(/\b(?:1080[pi]|720p|576p|480p|432p|360p|2160p|hd|sd|bbc|nbc|muxed)\b/g,' ').replace(/\b(?:19|20)\d{2}(?: \d{2} \d{2})?\b/g,' ').replace(/\s+/g,' ').trim();
  var olympic=/\bolympic(?:s)?\b/.test(label+' '+clean(item.sourceIdentifier||''));
  if(olympic)stem=stem.replace(/\b(?:rio|beijing|london|olympic(?:s)?(?: games)?|athletics|track and field)\b/g,' ').replace(/\s+/g,' ').trim();
  var session=(text.match(/\b(morning|afternoon|evening)\b/)||[])[1];
  if(olympic&&discipline==='meet'&&session){
   var qualifiers=Array.from(new Set((text.match(/\b(?:women(?:s)?|men(?:s)?|mixed|group\s*[a-z]|heats?|finals?|qualif(?:ying|ication)|round\s*\d+)\b/g)||[]).map(function(v){return v.replace(/^(women|men)s$/,'$1').replace(/\s+/g,'-');}))).sort();
   stem=session+'-session'+(qualifiers.length?'-'+qualifiers.join('-'):'');
  }
  if(date&&stem){result.eventId='sports:athletics:'+(olympic?'olympic-'+result.year:result.competition)+':'+date+':'+stem.replace(/ /g,'-')+(part?':part-'+part:'');result.format='event';}
  return result;
 }
 function describe(item,channel){
  item=item||{};
  if(Number(channel)===64)return athleticsDescription(item);
  if(Number(channel)===63)return soccerDescription(item);
  if(Number(channel)===62){
   var collegeText=clean([selectedTitle(item,62),item.title,item.seriesTitle].filter(Boolean).join(' '));
   var collegeLanes=[[58,'basketball',/\bbasketball\b/],[59,'baseball',/\bbaseball\b/],[57,'football',/\b(?:football|gridiron|rose bowl|sugar bowl|cotton bowl|fiesta bowl|orange bowl|peach bowl|camellia bowl)\b/]];
   for(var k=0;k<collegeLanes.length;k++)if(collegeLanes[k][2].test(collegeText))return Object.assign(describe(item,collegeLanes[k][0]),{competition:'college-'+collegeLanes[k][1],sport:collegeLanes[k][1]});
   var collegeSport=collegeText.match(/\b(volleyball|soccer|softball|lacrosse|hockey|wrestling|swimming|diving|gymnastics|tennis|golf|rowing|track|athletics|fencing)\b/);
   if(collegeSport){
    var collegeInfo=describe(item,65),collegeDiscipline='college-'+collegeSport[1];
    if(collegeInfo.eventId)collegeInfo.eventId=collegeInfo.eventId.replace(/^sports:[^:]+:/,'sports:'+collegeDiscipline+':');
    return Object.assign(collegeInfo,{competition:collegeDiscipline,sport:collegeSport[1]});
   }
  }
  if(Number(channel)===53){
   var vaultText=clean([selectedTitle(item,53),item.title,item.seriesTitle].filter(Boolean).join(' '));
   var vaultLanes=[[58,'basketball',/\b(?:basketball|nba|wnba|aba)\b/],[59,'baseball',/\b(?:baseball|mlb|world series|negro leagues)\b/],[60,'hockey',/\b(?:hockey|nhl|stanley cup)\b/],[52,'mma',/\b(?:mma|ufc|pride fc|bellator|kickboxing|mixed martial arts)\b/],[55,'wrestling-derby',/\b(?:wrestling|wwf|wwe|wcw|njpw|awa|nwa|roller ?derby|rollergames)\b/],[56,'boxing',/\b(?:boxing|muhammad ali|floyd patterson|joe louis|joe frazier|mike tyson)\b/],[63,'soccer',/\b(?:soccer|fifa|uefa|premier league|champions league)\b/],[57,'football',/\b(?:football|gridiron|nfl|cfl|usfl|xfl|ufl|super bowl|rose bowl|sugar bowl|orange bowl|cotton bowl|fiesta bowl|peach bowl|camellia bowl)\b/],[71,'golf',/\b(?:golf|pga|masters tournament)\b/],[72,'tennis',/\b(?:tennis|wimbledon|atp|wta)\b/],[54,'racing',/\b(?:nascar|indycar|formula (?:one|[123e])|grand prix)\b/]];
   for(var v=0;v<vaultLanes.length;v++)if(vaultLanes[v][2].test(vaultText))return Object.assign(describe(item,vaultLanes[v][0]),{sport:vaultLanes[v][1]});
  }
  var raw=selectedTitle(item,channel),text=clean(raw),yearMatch=raw.match(/\b((?:19|20)\d{2})\b/),year=Number(yearMatch?yearMatch[1]:String(item.year||'').slice(0,4))||0;
  var competitionText=[55,57,58,59,61,65,66,68,69,70,73,74,75,76,77,78,79].includes(Number(channel))?text+' '+clean(item.title)+' '+clean(item.seriesTitle):text;
  if([74,75,76,77,78,79].includes(Number(channel)))competitionText+=' '+clean(item.fileName||id(item).split('::')[1]||'')+(Number(channel)===76?' '+clean(item.sourceIdentifier||id(item).split('::')[0]):'');
  var result={eventId:'',competition:competition(competitionText,channel),year:year,era:year?Math.floor(year/10)*10:0,participants:[],format:'program'};
  if([77,78,79].includes(Number(channel))){
   var finalSource=String(item.sourceIdentifier||id(item).split('::')[0]),finalFile=String(item.fileName||item.media&&item.media.fileName||id(item).split('::')[1]||'').split('/').pop().replace(/(?:\.ia)?\.mp4$/i,''),label=clean(item.title||finalFile);
   var fileLabel=clean(finalFile.replace(/\([^)]*(?:\d{3,4}p|h264|h\.264|\dfps|kbit)[^)]*\)/ig,'')),sourceYear=finalSource.match(/f1-((?:19|20)\d{2})/i);
   if(sourceYear){year=Number(sourceYear[1]);result.year=year;result.era=Math.floor(year/10)*10;}
   if(Number(channel)===77){
    var raceLabel=finalFile&&!/^(?:program|video|videoplayback|[0-9 ._-]+)$/i.test(finalFile)?fileLabel:label;result.competition=competition(raceLabel+(/cart-indycar/.test(finalSource)?' indycar':''),77);var raceYear=raceLabel.match(/\b((?:19|20)\d{2})\b/);if(raceYear&&!sourceYear){year=Number(raceYear[1]);result.year=year;result.era=Math.floor(year/10)*10;}var raceText=raceLabel.replace(/\bf1\b|\bformula one\b/g,'formula 1').replace(/\bgp\b/g,'grand prix'),country=raceText.match(/\b(australian|brazilian|san marino|spanish|monaco|canadian|british|french|german|hungarian|belgian|italian|portuguese|european|japanese|united states|us|dutch|qatar|chinese|miami|mexican|saudi arabian) (?:grand prix|race)\b/);
    if(year&&result.competition==='grandprix-formula'&&country)result.eventId='sports:grandprix:formula:'+year+':'+country[1].replace(/ /g,'-')+(/\bsprint\b/.test(raceText)?':sprint':'');
    else if(year&&/\b(?:indianapolis 500|indy 500)\b/.test(raceText))result.eventId='sports:grandprix:indy500:'+year;
   }
   if(Number(channel)===78){
    var programLabel=label.replace(/\b(?:vhs|vintage|60 fps|full|complete|\d{4}|2000s)\b/g,' ').replace(/\s+/g,' ').trim();
    if(/\brichard simmons\b/.test(programLabel)&&/\breach for fitness\b/.test(programLabel))programLabel='richard simmons reach for fitness';
    if(programLabel&&!/\bweightlifting\b/.test(programLabel))result.eventId='sports:fitness:program:'+programLabel;
   }
   if(!result.eventId&&finalSource&&finalFile)result.eventId='sports:final:'+channel+':file:'+finalSource+':'+fileLabel.replace(/^\d{1,2} (?=(?:19|20)\d{2})/,'');
   if(/\b(?:documentary|history|champion within)\b/.test(label))result.format='documentary';
   return result;
  }
  if(Number(channel)===76){
   var stockSource=String(item.sourceIdentifier||id(item).split('::')[0]),stockFile=String(item.fileName||item.media&&item.media.fileName||id(item).split('::')[1]||'').split('/').pop().replace(/(?:\.ia)?\.mp4$/i,'');
   var stockIdentity=stockFile.replace(/\([^)]*(?:\d{3,4}p|h264|h\.264|\dfps|kbit)[^)]*\)/ig,'').replace(/\((?:RAW SATELLITE FEED|FULL RACE REPLAY)\)/ig,'').replace(/^\d{1,2}\s+(?=(?:19|20)\d{2})/,'');
   stockIdentity=clean(stockIdentity).replace(/\b(?:nascar )?(?:(?:winston|nextel|sprint|monster energy) )?cup series\b/g,'').replace(/\bnascar\b/g,'').replace(/\b(?:classic )?full race(?: replay)?\b|\bfull broadcast\b|\braw satellite feed\b/g,'').replace(/\s+/g,' ').trim();
   stockIdentity=stockIdentity.replace(/^((?:19|20)\d{2}) (?:nncs|nwcs|nscs|ncs) /,'$1 ').replace(/\braw (?:satellite )?feed\b/g,'').replace(/\s+/g,' ').trim();
   if(/\bdaytona 500\b/.test(stockIdentity)&&year)stockIdentity=year+' daytona 500';
   if(stockIdentity&&/\b(?:19|20)\d{2}\b/.test(stockIdentity))result.eventId='sports:stockcar:'+result.competition+':'+stockIdentity;
   else if(stockSource&&stockFile)result.eventId='sports:stockcar:file:'+stockSource+':'+clean(stockFile);
   if(/\b(?:documentary|history|biography)\b/.test(text))result.format='documentary';
   return result;
  }
  if(Number(channel)===75){
   var waterSource=String(item.sourceIdentifier||id(item).split('::')[0]),waterFile=String(item.fileName||item.media&&item.media.fileName||id(item).split('::')[1]||'').replace(/(?:\.ia)?\.mp4$/i,'');
   var waterIdentity=(waterFile.split('/').pop()||'').split(/[ ._-](?:\d{3,4}[pi]|hdtv|pdtv|webrip|sdtv|x264|xvid)/i)[0];
   if(/^(?:finals?|heats?|session|program|\d+)$/i.test(waterIdentity))waterIdentity=waterFile;
   if(/^Xcorps64NoodSailingHD2(?:_201802)?$/.test(waterSource))result.eventId='sports:water:sailing:xcorps-64-nood';
   else if(waterSource==='2012_London_Olympics_Swimming'){
    var label=clean(waterIdentity),day=label.match(/\bday\s*(\d+)\b/),date=label.match(/^2012(\d{2})(\d{2})\b/),phase=/\b(?:heats|preliminaries)\b/.test(label)?'heats':/\b(?:finals|evening)\b/.test(label)?'finals':'';
    if(date){var offset=Math.round((Date.UTC(2012,Number(date[1])-1,Number(date[2]))-Date.UTC(2012,6,28))/86400000);if(offset>=0&&offset<8)day=[null,String(offset+1)];}
    if(day&&phase&&!/\b(?:womens|mens|4x\d+)\b/.test(label))result.eventId='sports:water:swimming:london2012:day-'+Number(day[1])+':'+phase;
   }
   if(!result.eventId&&waterSource&&waterIdentity)result.eventId='sports:water:file:'+waterSource+':'+clean(waterIdentity);
  }
  if(Number(channel)===74){
   var winterSource=String(item.sourceIdentifier||id(item).split('::')[0]),winterFile=String(item.fileName||item.media&&item.media.fileName||id(item).split('::')[1]||'').split('/').pop().replace(/(?:\.ia)?\.mp4$/i,'');
   // Resolution/codec variants share an event; distances, rounds and sessions do not.
   winterFile=winterFile.split(/[ ._-](?:\d{3,4}[pi]|hdtv|pdtv|webrip|sdtv|sd[ .]eng|x264|xvid|dd5)/i)[0];
   var winterIdentity=clean(winterFile).replace(/\bwomans\b|\bladies\b/g,'womens');
   if(/^2014_Sochi_Olympics_/.test(winterSource))winterIdentity=winterIdentity.replace(/^(?:2014 sochi olympics|2014 winter olympics|winter olympics 2014|sochi winter olympics 2014|olympics2014) /,'');
   if(winterSource&&winterFile)result.eventId='sports:winter:file:'+winterSource+':'+winterIdentity;
  }
  if(Number(channel)===73){
   var source=String(item.sourceIdentifier||id(item).split('::')[0]),file=String(item.fileName||item.media&&item.media.fileName||id(item).split('::')[1]||'').replace(/(?:\.ia)?\.(?:mp4|m4v|webm|mov|ogv)$/i,'').replace(/(?:_512kb|_3mb)$/i,'');
   if(source==='2016_Rio_Olympics_Equestrian' && /^(?:equestrian-team-jumping-finals-432p|Rio\.Olympics\.2016\.08\.17\.Equestrian\.Jumping\.Team\.Final\.720p\.iP\.WEBRip\.AAC2\.0\.H\.264-BTW)$/i.test(file))result.eventId='sports:horse:rio-2016:team-jumping-final';
   else if(source&&file)result.eventId='sports:horse:file:'+source+':'+clean(file);
  }
  if(Number(channel)===70){
   var rodeoTitle=clean(item.title||raw),show=rodeoTitle.match(/\bshow\s*(\d+)\b/);
   if(result.competition==='rodeo-superstars'&&year&&(show||year===1978||year===1979))result.eventId='sports:rodeo:superstars:'+year+(show?':show-'+Number(show[1]):'');
   if(!result.eventId){
    var source=String(item.sourceIdentifier||id(item).split('::')[0]),file=String(item.fileName||item.media&&item.media.fileName||id(item).split('::')[1]||'').replace(/(?:\.ia)?\.(?:mp4|m4v|webm|mov|ogv)$/i,'').replace(/(?:_512kb|_3mb)$/i,'');
    if(source&&file)result.eventId='sports:rodeo:file:'+source+':'+clean(file);
   }
  }
  if(Number(channel)===66){
   var actionText=clean(raw+' '+String(item.title||'')+' '+String(item.seriesTitle||'')+' '+id(item));
   var brand=actionText.match(/\b(411 ?vm|411 video magazine|transworld|mack dawg|xcorps|world industries|endless summer)\b/);
   result.programFamily=brand?brand[1].replace(/^411.*$/,'411vm'):String(item.sourceIdentifier||id(item).split('::')[0]||clean(raw));
   var actionSource=String(item.sourceIdentifier||item.media&&item.media.sourceIdentifier||id(item).split('::')[0]);
   if(actionSource==='411-vm-skateboarding-videos'){
    var actionFile=String(item.fileName||item.media&&item.media.fileName||id(item).split('::')[1]||''),stem=clean(actionFile),episode='',volume=actionFile.match(/\b411vm[ _-]*(\d+)\.(\d+)/i);
    if(!/\b(?:disc|part)\s*\d+/.test(stem)){
     var issue=stem.match(/\bissue\s*0*(\d+)\b/)||stem.match(/\b411vm\s*0*(\d+)\b/),best=stem.match(/best of.*?vol(?:ume)?\s*0*(\d+)/),europe=stem.match(/europe.*?((?:19|20)\d{2})/);
     if(volume)episode='volume-'+volume[1]+'.'+volume[2];
     else if(issue&&!/greatest/.test(stem))episode='issue-'+Number(issue[1]);
     else if(best)episode='best-'+Number(best[1]);
     else if(europe)episode='europe-'+europe[1];
     else if(/\blove affair\b/.test(stem))episode='love-affair';
    }
    if(episode)result.eventId='sports:action-skate:411vm:'+episode;
   }
  }
  if(!enabled(channel))return result;
  if(/\b(?:documentary|documentaries|history|biography|retrospective|nfl films|a football life|behind the scenes)\b/.test(text)){result.format='documentary';return result;}
  var formatText=Number(channel)===59?text.replace(/\b(?:with|without|no) post ?game\b/g,''):text;
  if(/\b(?:highlights?|recap|condensed|compilation|post race|post game|post gp|rainout|podcast|gameplay|simulation)\b/.test(formatText))return result;
  var full=/\b(?:full|complete) (?:race|game|match|event|fight|bout|card|broadcast|coverage|meet|round|final)\b|\braw satellite feed\b/.test(text);
  var part=text.match(/\b(?:part|pt|disc)\s*(\d+)\b/),suffix=part?':part-'+part[1]:'';
  if(/\b(?:qualifying|practice|warm up|weigh in)\b/.test(text)){result.format='session';return result;}
  if(/\bsprint race\b/.test(text))suffix+=':sprint';
  var raceNumber=text.match(/\brace\s+([12])\b/);if(raceNumber)suffix+=':race-'+raceNumber[1];
  var iso=raw.match(/\b((?:19|20)\d{2})[-_.](\d{2})[-_.](\d{2})\b/),date=String(item.eventDate||'');
  if(iso)date=iso[1]+'-'+iso[2]+'-'+iso[3];
  if(Number(channel)===57&&!date){
   var compact=raw.match(/^(\d{2})(\d{2})(\d{2})\s/);
   if(compact){var yy=Number(compact[1]),datedYear=year&&year%100===yy?year:yy<30?2000+yy:1900+yy;date=datedYear+'-'+compact[2]+'-'+compact[3];}
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)date='';
  if(Number(channel)===57&&date){year=Number(date.slice(0,4));result.year=year;result.era=Math.floor(year/10)*10;}
  var stem=text.replace(/\b(?:full|complete) (?:race|game|match|event|fight|bout|card|broadcast|coverage|meet|round|final)(?: replay| broadcast)?\b/g,' ')
   .replace(/\b(?:raw satellite feed|with commercials|without commercials|original broadcast|classic|replay|720p|1080p|2160p|480p|360p|h264|x264|h 264|webrip|web dl|dvdrip|hd|sd|english|eng)\b/g,' ')
   .replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/\b(?:part|pt|disc|round)\s*\d+\b/g,' ').replace(/\b(?:nascar|formula one|formula [123e]|indycar(?: series)?)\b/g,' ').replace(/\s+/g,' ').trim();
  var racing=['nascar','stockcar','indycar','formula','imsa','nhra'].includes(result.competition)||result.competition.startsWith('formula-');
  if(racing&&year&&(full||seconds(item)>=3600)&&!(/\b(?:races|collection|recordings|season review)\b/.test(stem))){
   var named=stem.match(/\b(daytona 500|talladega 500|indianapolis 500|indy 500|(?:canadian|dutch|japanese|british|italian|belgian|monaco|baltimore|australian|mexican|chinese|spanish|german|french|san marino) grand prix)\b/);
   var name=named?named[1].replace(/^indy 500$/,'indianapolis 500'):stem;
   if(named||/\b(?:300|400|500|600|1000|24 hours|12 hours)\b/.test(name))result.eventId='sports:'+result.competition+':'+year+':'+clean(name).replace(/ /g,'-')+suffix+(/\bon ?board\b/.test(text)?':onboard':'');
  }
  var masters=text.match(/\bmasters(?: tournament)?(?: (?:19|20)\d{2})? (final|first|second|third|fourth|round [1-4])\b/);
  if(Number(channel)===71&&year&&masters&&/\bbroadcast\b/.test(text)){
   var round=({final:4,first:1,second:2,third:3,fourth:4})[masters[1]]||Number(masters[1].slice(-1));
   result.competition='pga';result.eventId='sports:golf:masters:'+year+':round-'+round+suffix;
  }
  var matchupText=Number(channel)===57&&date&&text.startsWith(date.slice(2).replace(/-/g,'')+' ')?text.slice(7):text;
  var versus=matchupText.replace(/\b(?:nfl|nba|wnba|nhl|mlb|ncaa|fifa|ufc|pride|full|complete|game|match|fight|bout|event|broadcast|replay|season|playoffs?)\b/g,' ').replace(/\b(?:19|20)\d{2}(?: \d{2} \d{2})?\b/g,' ').replace(/\s+/g,' ').trim().match(/^(.+?)\s+(?:vs?|versus|at)\s+(.+)$/);
  if(versus)result.participants=[clean(versus[1]),clean(versus[2])].filter(Boolean).map(function(v){return v.slice(0,90);}).sort();
  var card=text.match(/\b(ufc|pride)\s+(\d{1,3})\b/);
  if(card&&full){result.format=versus?'bout':'event';result.eventId='sports:'+card[1]+':'+card[2]+(versus?':bout:'+result.participants.join('-vs-'):'')+suffix;}
  else if(Number(channel)!==75&&!racing&&date&&result.participants.length===2&&(full||seconds(item)>=900))result.eventId='sports:'+result.competition+':'+date+':'+result.participants.join('-vs-')+suffix;
  var bowl=text.match(/\bsuper bowl\s+(\d{1,3}|[ivxlcdm]+)\b/);
  if(bowl&&full){var number=Number(bowl[1]);if(!number){var values={i:1,v:5,x:10,l:50,c:100,d:500,m:1000},last=0;number=0;for(var r=bowl[1].length-1;r>=0;r--){var value=values[bowl[1][r]];number+=value<last?-value:value;last=Math.max(last,value);}}if(number>0&&number<200)result.eventId='sports:nfl:super-bowl-'+number+suffix;}
  if(Number(channel)===58&&year){
   var label=clean(raw+' '+String(item.title||'')).replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/\s+/g,' ').trim();
   var allStar=label.match(/\b(nba|wnba|aba) all star game\b/),finals=label.match(/\b(nba|wnba|aba) finals\b/),game=label.match(/\bgame\s+(\d{1,2})\b/);
   // Legacy All-Star broadcasts have one known event; newer formats stay
   // ungrouped until their individual tournament games are identified.
   if(allStar&&year<=2024&&!/\b(?:celebrity|rising stars|rookie|skills|dunk|three point|semifinal)\b/.test(label))result.eventId='sports:'+allStar[1]+':all-star:'+year+suffix;
   else if(finals&&game&&Number(game[1])>=1&&Number(game[1])<=7)result.eventId='sports:'+finals[1]+':finals:'+year+':game-'+Number(game[1])+suffix;
  }
  if(Number(channel)===59&&year&&result.competition==='mlb'){
   var baseballLabel=clean(raw),ws=/\b(?:world series|ws)\b/.test(baseballLabel),baseballGame=baseballLabel.match(/\b(?:world series|ws)(?:\s+(?:19|20)\d{2})?\s+game\s*(\d{1,2})\b/);
   if(ws&&baseballGame&&Number(baseballGame[1])>=1&&Number(baseballGame[1])<=(year<=1921?9:7))result.eventId='sports:mlb:world-series:'+year+':game-'+Number(baseballGame[1])+suffix;
   else if(/\b(?:mlb|major league baseball)\b/.test(baseballLabel)&&/\ball star game\b/.test(baseballLabel)&&!/\b(?:home run|derby|futures|celebrity)\b/.test(baseballLabel))result.eventId='sports:mlb:all-star:'+year+suffix;
  }
  if(Number(channel)===57&&date&&result.competition==='ncaa'){
   var footballBowl=text.match(/\b(junior rose|rose|sugar|orange|cotton|fiesta|peach|camellia) bowl\b/);
   if(!footballBowl){
    var programLabel=clean(item.title),programBowls=programLabel.match(/\b(?:junior rose|rose|sugar|orange|cotton|fiesta|peach|camellia) bowl\b/g)||[];
    if(programBowls.length===1&&!/\b(?:collection|season|recordings|games)\b/.test(programLabel))footballBowl=programBowls[0].match(/(.+) bowl/);
   }
   if(footballBowl)result.eventId='sports:ncaa:'+footballBowl[1].replace(/ /g,'-')+'-bowl:'+date+suffix;
  }
  if(result.eventId||full)result.format=result.format==='bout'?'bout':'event';
  return result;
 }
 function key(item,channel){return describe(item,channel).eventId||id(item);}
 function strip(item){var copy=Object.assign({},item);delete copy.sportsCopies;return copy;}
 function groups(items,channel){var map=new Map();(items||[]).forEach(function(item){var k=key(item,channel);if(!k)return;var group=map.get(k);if(!group){group={key:k,info:describe(item,channel),rows:[]};map.set(k,group);}var rows=[item].concat(group.info.eventId?(item.sportsCopies||item.meta&&item.meta.sportsCopies||[]).filter(function(row){return key(row,channel)===k&&url(row);}):[]);rows.forEach(function(row){if(!group.rows.some(function(prior){return id(prior)===id(row)&&url(prior)===url(row);}))group.rows.push(row);});});return Array.from(map.values());}
 function select(items,options){
  options=options||{};var count=Math.max(0,Math.min(1024,Number(options.count)||5)),channel=options.channel;
  if(!enabled(channel))return (items||[]).slice(0,count);
  var inventory=groups(items,channel),history=(options.history||[]).filter(Boolean),seen=new Set(history.map(function(row){return key(row,channel);}).concat(options.seenKeys||[]));
  var unseen=inventory.filter(function(group){return !seen.has(group.key);}),pool=(unseen.length?unseen:inventory).slice(),selected=[],recent=history.slice(-12).map(function(row){return describe(row,channel);});
  while(pool.length&&selected.length<count){
   var best=0,bestScore=Infinity,docDue=(recent.length+1)%5===0;
   pool.forEach(function(group,index){var info=group.info,score=0;if(Number(channel)===79&&!['recreation-pool','recreation-snooker'].includes(info.competition)&&pool.some(g=>['recreation-pool','recreation-snooker'].includes(g.info.competition))&&recent.slice(-4).some(r=>!['recreation-pool','recreation-snooker'].includes(r.competition)))score+=100;if(Number(channel)===65){var media=group.rows[0].media||group.rows[0];if(Number(media.width)>1920||Number(media.height)>1080)score+=16;}recent.slice(-8).forEach(function(prior){if(Number(channel)===53&&prior.sport&&prior.sport===info.sport)score+=16;if(Number(channel)===66&&prior.programFamily&&prior.programFamily===info.programFamily)score+=12;if(prior.competition===info.competition)score+=4;if(prior.era&&prior.era===info.era)score+=1;info.participants.forEach(function(p){if(prior.participants.includes(p))score+=3;});});
    if(![68,69,78,80,81,82,83].includes(Number(channel))&&info.format==='documentary')score+=docDue?-8:8;
    if(score<bestScore){best=index;bestScore=score;}
   });
   var chosen=pool.splice(best,1)[0],primary=strip(chosen.rows[0]);primary.sports=chosen.info;
   primary.sportsCopies=chosen.info.eventId?chosen.rows.slice(1).filter(function(row){return !!url(row);}).slice(0,2).map(strip):[];
   selected.push(primary);recent.push(chosen.info);
  }
  return selected;
 }
 function history(items,ids){var byId=new Map((items||[]).map(function(row){return [id(row),row];}));return (ids||[]).map(function(value){return byId.get(String(value));}).filter(Boolean);}
 function sameTimeline(a,b){
  if(id(a)&&id(a)===id(b))return true;
  var am=a.media||a.meta&&a.meta.media||{},bm=b.media||b.meta&&b.meta.media||{},hash=String(am.md5||am.sha1||'').toLowerCase(),other=String(bm.md5||bm.sha1||'').toLowerCase();
  return /^(?:[a-f0-9]{32}|[a-f0-9]{40})$/.test(hash)&&hash===other;
 }
 function allowedUrl(value){try{var u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(/(?:^|\.)archive\.org$/.test(u.hostname)||u.hostname==='va.aws.nascar.com');}catch(_){return false;}}
 function recovery(item,options){
  var channel=options.channel,description=describe(item,channel),copies=[strip(item)],seen=new Set([url(item)]),next=0,generation=0,pending=null,exhausted=false;
  (item.alts||item.media&&item.media.alts||[]).forEach(function(value){if(!seen.has(value)&&allowedUrl(value)){var row=strip(item);row.url=value;if(row.media)row.media=Object.assign({},row.media,{url:value});copies.push(row);seen.add(value);}});
  (item.sportsCopies||item.meta&&item.meta.sportsCopies||[]).forEach(function(row){if(description.eventId&&describe(row,channel).eventId===description.eventId&&allowedUrl(url(row))&&!seen.has(url(row))){copies.push(strip(row));seen.add(url(row));}});
  copies=copies.slice(0,3);
  async function advance(position,duration,source,midstream){
   while(next<copies.length&&options.isCurrent()){
    var candidate=copies[next++];
    if(midstream&&position>2&&!sameTimeline(source,candidate))continue;
    if(options.allowed&&!options.allowed(candidate))continue;
    var mine=++generation,seek=midstream?Math.max(0,Number(position)||0):0;
    var control={seekSeconds:seek,onFailure:function(at,total){if(mine!==generation||!options.isCurrent())return Promise.resolve(false);if(pending)return pending;generation++;pending=advance(at,total,candidate,true).finally(function(){pending=null;});return pending;}};
    if(options.onAttempt)options.onAttempt(candidate,next-1);
    try{if(await options.play(candidate,control))return options.isCurrent();}catch(_){}
   }
   if(midstream&&options.isCurrent()&&!exhausted){exhausted=true;if(options.onExhausted)options.onExhausted();}
   return false;
  }
  return {start:function(){return advance(0,0,item,false);}};
 }
 return {enabled:enabled,describe:describe,key:key,select:select,history:history,recovery:recovery,uniqueCount:function(items,channel){return groups(items,channel).length;}};
});
