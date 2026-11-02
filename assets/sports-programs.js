/* Shared, conservative sports identity/selection. No discovery or network I/O. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RealSignalSports=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function enabled(channel){return channel==='nascar-classics'||Number(channel)>=51&&Number(channel)<=84;}
 function id(item){return String(item&&(item.identifier||item.id)||'');}
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
 function describe(item,channel){
  item=item||{};
  if(Number(channel)===53){
   var vaultText=clean([selectedTitle(item,53),item.title,item.seriesTitle].filter(Boolean).join(' '));
   var vaultLanes=[[58,'basketball',/\b(?:basketball|nba|wnba|aba)\b/],[59,'baseball',/\b(?:baseball|mlb|world series|negro leagues)\b/],[60,'hockey',/\b(?:hockey|nhl|stanley cup)\b/],[52,'mma',/\b(?:mma|ufc|pride fc|bellator|kickboxing|mixed martial arts)\b/],[55,'wrestling-derby',/\b(?:wrestling|wwf|wwe|wcw|njpw|awa|nwa|roller ?derby|rollergames)\b/],[56,'boxing',/\b(?:boxing|muhammad ali|floyd patterson|joe louis|joe frazier|mike tyson)\b/],[63,'soccer',/\b(?:soccer|fifa|uefa|premier league|champions league)\b/],[57,'football',/\b(?:football|gridiron|nfl|cfl|usfl|xfl|ufl|super bowl|rose bowl|sugar bowl|orange bowl|cotton bowl|fiesta bowl|peach bowl|camellia bowl)\b/],[71,'golf',/\b(?:golf|pga|masters tournament)\b/],[72,'tennis',/\b(?:tennis|wimbledon|atp|wta)\b/],[54,'racing',/\b(?:nascar|indycar|formula (?:one|[123e])|grand prix)\b/]];
   for(var v=0;v<vaultLanes.length;v++)if(vaultLanes[v][2].test(vaultText))return Object.assign(describe(item,vaultLanes[v][0]),{sport:vaultLanes[v][1]});
  }
  var raw=selectedTitle(item,channel),text=clean(raw),yearMatch=raw.match(/\b((?:19|20)\d{2})\b/),year=Number(yearMatch?yearMatch[1]:String(item.year||'').slice(0,4))||0;
  var competitionText=[55,57,58,59].includes(Number(channel))?text+' '+clean(item.title)+' '+clean(item.seriesTitle):text;
  var result={eventId:'',competition:competition(competitionText,channel),year:year,era:year?Math.floor(year/10)*10:0,participants:[],format:'program'};
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
  else if(!racing&&date&&result.participants.length===2&&(full||seconds(item)>=900))result.eventId='sports:'+result.competition+':'+date+':'+result.participants.join('-vs-')+suffix;
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
   pool.forEach(function(group,index){var info=group.info,score=0;recent.slice(-8).forEach(function(prior){if(Number(channel)===53&&prior.sport&&prior.sport===info.sport)score+=16;if(prior.competition===info.competition)score+=4;if(prior.era&&prior.era===info.era)score+=1;info.participants.forEach(function(p){if(prior.participants.includes(p))score+=3;});});
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
