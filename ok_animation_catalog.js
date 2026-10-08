/* Separate, identity-checked animation lanes. Search phrases are never genre
 * evidence. Public OK embeds only; no signed media or private-video scraping. */
import { okProgramName } from './ok_public_search.js';
export const OK_ANIMATION_SHOWS = Object.freeze({
  kids:['The Flintstones','The Jetsons','Scooby-Doo, Where Are You!','The New Scooby-Doo Movies','The Smurfs','The Garfield Show','Garfield and Friends','DuckTales','Darkwing Duck','Chip n Dale Rescue Rangers','TaleSpin','Animaniacs','Tiny Toon Adventures','Batman: The Animated Series','Superman: The Animated Series','Justice League','X-Men','Spider-Man','SpongeBob SquarePants','Hey Arnold!','Rugrats','Dexter\'s Laboratory','The Powerpuff Girls','Courage the Cowardly Dog','Ed, Edd n Eddy','Johnny Bravo','The Wild Thornberrys','Recess','Arthur','The Magic School Bus','Avatar: The Last Airbender','The Adventures of Jimmy Neutron, Boy Genius','The Fairly OddParents','Doug','Rocko\'s Modern Life','Teenage Mutant Ninja Turtles','ThunderCats','He-Man and the Masters of the Universe'],
  adult:['The Simpsons','Futurama','King of the Hill','Family Guy','American Dad!','Bob\'s Burgers','South Park','The Boondocks','Daria','Beavis and Butt-Head','Archer','Rick and Morty','BoJack Horseman','The Venture Bros.','Harvey Birdman, Attorney at Law','Aqua Teen Hunger Force','Home Movies','Mission Hill','The Critic','The Oblongs','Duckman','Metalocalypse','Disenchantment','F Is for Family'],
  anime:['Cowboy Bebop','Trigun','Dragon Ball Z','Naruto','Naruto: Shippuden','Bleach','One Piece','Fullmetal Alchemist','Fullmetal Alchemist: Brotherhood','Death Note','Yu Yu Hakusho','Inuyasha','Sailor Moon','Pokemon','Digimon: Digital Monsters','Samurai Champloo','Rurouni Kenshin','Gundam Wing','Mobile Suit Gundam','Outlaw Star','The Big O','Neon Genesis Evangelion','Attack on Titan','My Hero Academia','Demon Slayer: Kimetsu no Yaiba']
});
const compact = value => String(value||'').toLowerCase().replace(/^the\s+/,'').replace(/[^a-z0-9]/g,'');
export function okAnimationFamily(profile) { return /^ok-(kids|adult|anime)-channel$/.exec(profile?.profileKey||'')?.[1] || ''; }
export function okAnimationQueries(profile,cursor) {
  const family=okAnimationFamily(profile),titles=OK_ANIMATION_SHOWS[family]||[];
  return Array.from({length:Math.min(4,titles.length)},(_,index)=>{
    if (family==='anime' && index===3) return ['anime English dubbed','anime English dub','English dubbed anime episode'][Math.abs(Number(cursor)||0)%3];
    const title=titles[(Math.abs(Number(cursor)||0)*4+index)%titles.length];
    return family==='anime' ? `${title} English dub` : title;
  });
}
export function okAnimationPrecheck(profile,item,checkAspect=true) {
  const family=okAnimationFamily(profile),title=String(item?.title||''),hay=[title,item?.description,item?.tags,item?.category].join(' ');
  if (!family || !item?.id || Number(item.duration)<900 || checkAspect && !(Number(item.aspectRatio)>=1.2)) return false;
  if (/\b(?:shorts?|clip|trailer|teaser|recap|reaction|review|podcast|how[ -]to|tutorial|fan[ -]?(?:made|film|edit|animation)|parody|amv|mashup|gacha|gameplay|rom hack|soundtrack|theme song|best songs|porn|hentai|r18|nsfw|uncensored sex|audio only|commentary only)\b/i.test(hay)) return false;
  if (/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff]/.test(title) || /\b(?:vostfr|truefrench|subbed|subesp|rus|russian|french|spanish|german|hindi|tamil|telugu|italian|hungarian|dublado|dual|multi|donghua|latino|espa[nñ]ol|fran[cç]ais|episodul|portugu[eê]s|subtitulado)\b/i.test(title)) return false;
  // Anime must be the English audio version, not an English-subtitled upload.
  if (family==='anime' && !/\b(?:english[ ._-]+dub(?:bed)?|dub(?:bed)?[ ._-]+english)\b/i.test(title)) return false;
  return true;
}
export async function okAnimationIdentity(profile,item,getJson,cache=new Map()) {
  const family=okAnimationFamily(profile);
  if (!okAnimationPrecheck(profile,item)) return null;
  const name=okProgramName(item.title,'tv').replace(/^anime[ :._-]+/i,'').split(/\b(?:ep|e)[ ._-]*\d+\b/i)[0].replace(/\b(?:english[ ._-]+dub(?:bed)?|dub(?:bed)?[ ._-]+english|compilation|marathon|complete series|complete season|all episodes|full series|full season|mega comp)\b.*$/i,'').replace(/[ :._-]+$/,'').trim();
  if (!name) return null;
  const key=compact(name);
  if(!cache.has(key)) cache.set(key,getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(name)}`));
  const rows=await cache.get(key);
  const matching=(Array.isArray(rows)?rows:[]).map(row=>row.show).filter(show=>compact(show?.name)===key);
  const show=matching.find(show=>show?.type==='Animation');
  if(!show)return null;
  const episodeRuntime=Number(show.averageRuntime||show.runtime||0)*60;
  const compilation=/\b(?:compilation|marathon|complete series|complete season|all episodes|full series|full season|mega comp)\b/i.test(item.title);
  if (!compilation && (episodeRuntime>0 && Number(item.duration)>episodeRuntime*1.35 || !episodeRuntime && matching.some(candidate=>candidate.type!=='Animation'))) return null;
  const origin=show.network?.country?.code||show.webChannel?.country?.code||'';
  const anime=show.language==='Japanese'||origin==='JP';
  if (family==='anime' ? !anime : anime||show.language!=='English') return null;
  if (family==='adult' && !OK_ANIMATION_SHOWS.adult.some(title=>compact(title)===compact(show.name))) return null;
  if (family==='kids' && (!OK_ANIMATION_SHOWS.kids.some(title=>compact(title)===compact(show.name)) && !(show.genres||[]).includes('Children'))) return null;
  return {language:'en',seriesId:`tvmaze:${show.id}`,seriesTitle:show.name,identityProvider:'TVmaze',identityReference:show.url,animationFamily:family,animationVerified:true,animationVerificationVersion:2,animationEpisodeRuntime:episodeRuntime};
}
export function okAnimationVerified(profile,item) {
  return okAnimationPrecheck(profile,item)&&item.animationVerified===true&&item.animationVerificationVersion===2&&item.animationFamily===okAnimationFamily(profile)&&item.language==='en'&&/^tvmaze:\d+$/.test(String(item.seriesId||''))&&/^https:\/\/www\.tvmaze\.com\/shows\/\d+(?:\/|$)/.test(String(item.identityReference||''))&&item.embedAllowed===true&&/^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/.test(String(item.embedUrl||item.url||''))&&(!(Number(item.animationEpisodeRuntime)>0)||Number(item.duration)<=Number(item.animationEpisodeRuntime)*1.35||/\b(?:compilation|marathon|complete series|complete season|all episodes|full series|full season|mega comp)\b/i.test(item.title));
}
