/* Curated long-form OK.ru television lanes.
 *
 * Search phrases are discovery hints only. A result is admitted only when its
 * own title identifies one of the channel's approved program families. Public
 * OK embeds only; no signed media extraction or private-video scraping.
 */

const COMMON_DENY = /\b(?:shorts?|clip|trailer|teaser|promo|recap|reaction|review|podcast|how[ -]?to|tutorial|fan[ -]?(?:made|film|edit|animation)|parody|mashup|gameplay|soundtrack|theme song|music video|audio only|commentary only|interview|behind the scenes|making of|video essay|explained|lecture|seminar|conference|panel|best of|supercut|tribute|anniversary|50 years of laughs|greatest christmas moments|lost pilot|test episode|comedy duo|life lessons|doctors? revisited)\b/i;
const FOREIGN = /(?:[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u1100-\u11ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]|\b(?:vostfr|vose|truefrench|subfrench|subesp|subbed|rus|russian|french|spanish|german|hindi|tamil|telugu|italian|hungarian|dublado|dubbed|dual|multi|latino|espa[nñ]ol|fran[cç]ais|episodul|portugu[eê]s|subtitulado|magyar|turkish|romana|romanian|ukrainian|ukr|dvo|tr-p\d+|seizoen|polarni|hun)\b)/i;

const CHANNELS = Object.freeze({
  "ok-britannia-channel": {
    family: "britannia",
    programs: [
      ["Only Fools and Horses"], ["Fawlty Towers"], ["Doctor Who"], ["Blackadder"],
      ["Peep Show"], ["The Office UK", "The Office (UK)", "The Office BBC"],
      ["Midsomer Murders"], ["Inspector Morse"], ["Poirot", "Agatha Christie's Poirot"],
      ["Keeping Up Appearances"], ["Are You Being Served"], ["The IT Crowd"]
    ]
  },
  "ok-history-vault-channel": {
    family: "history",
    programs: [
      ["The Men Who Built America"], ["Ancient Discoveries"], ["Connections", "Connections James Burke"],
      ["The World at War"], ["The Century America's Time", "The Century: America's Time"],
      ["History Detectives"], ["Cities of the Underworld"], ["Engineering an Empire"],
      ["America The Story of Us", "America: The Story of Us"], ["Lost Worlds"]
    ]
  },
  "ok-factory-floor-channel": {
    family: "factory",
    programs: [
      ["Ultimate Factories"], ["MegaFactories", "Mega Factories"],
      ["How It's Made Dream Cars", "How Its Made Dream Cars"], ["How It's Made", "How Its Made"],
      ["Food Factory"], ["How Do They Do It"], ["Inside the Factory"],
      ["Mega Manufacturing"], ["Inside the Christmas Factory"], ["Inside the Spitfire Factory"],
      ["Made in a Day"], ["Secrets of the Superfactories", "Secrets of the Super Factories"]
    ]
  },
  "ok-cookhouse-channel": {
    family: "cookhouse",
    programs: [
      ["The French Chef", "Julia Child The French Chef"], ["Essential Pepin"],
      ["Two Fat Ladies"], ["Great British Bake Off", "The Great British Baking Show"],
      ["America's Test Kitchen"], ["Great Chefs"], ["Baking with Julia"],
      ["Jacques Pepin Fast Food My Way"], ["Good Eats"]
    ]
  },
  "ok-science-lab-channel": {
    family: "science-lab",
    programs: [
      ["How the Universe Works"], ["Through the Wormhole", "Through the Wormhole with Morgan Freeman"],
      ["Cosmos A Spacetime Odyssey"], ["Cosmos Possible Worlds"], ["Wonders of the Universe"],
      ["PBS NOVA", "NOVA PBS"], ["Wonders of the Solar System"], ["The Planets BBC", "BBC The Planets"],
      ["Bill Nye the Science Guy"]
    ]
  },
  "ok-gearhead-channel": {
    family: "gearhead",
    programs: [
      ["Top Gear"], ["Fifth Gear"], ["Wheeler Dealers"], ["Car SOS", "Car S O S"],
      ["Jay Leno's Garage", "Jay Lenos Garage"], ["Chasing Classic Cars"],
      ["Fast N Loud", "Fast and Loud"], ["MotorWeek"], ["Car Fix"]
    ]
  },
  "ok-black-tv-channel": {
    family: "black-tv",
    programs: [
      ["Martin"], ["In Living Color", "In Living Colour"], ["Living Single"], ["Moesha"],
      ["The Parkers"], ["Girlfriends"], ["The Jamie Foxx Show"], ["A Different World"],
      ["The Wayans Bros", "The Wayans Brothers"], ["The Steve Harvey Show"],
      ["The Bernie Mac Show"], ["The Fresh Prince of Bel-Air", "The Fresh Prince of Bel Air"]
    ]
  }
});

import { okEpisodeIdentity } from "./ok_public_search.js";

const clean = value => String(value || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const compact = value => clean(value).replace(/\s+/g, "");
const canonical = aliases => aliases[0];

const SPECIALIST_FAMILIES = new Set(["factory", "cookhouse", "science-lab", "gearhead"]);

export function okCuratedChannel(profile) {
  return CHANNELS[profile?.profileKey] || null;
}
export function okCuratedQueries(profile, cursor = 0) {
  const channel = okCuratedChannel(profile);
  if (!channel) return [];
  const programs = channel.programs;
  const start = Math.abs(Number(cursor) || 0) * 4;
  const selected = Array.from({ length: Math.min(4, programs.length) }, (_, index) => canonical(programs[(start + index) % programs.length]));
  return selected.map(program => {
    if (channel.family === "black-tv" && program === "Martin") return "Martin Lawrence Martin 1992 sitcom full episode";
    if (channel.family === "black-tv") return `${program} full episode`;
    if (channel.family === "history" && program === "The Men Who Built America") return "History Channel The Men Who Built America full episode";
    if (channel.family === "history" && program === "Ancient Discoveries") return "Ancient Discoveries History Channel full episode";
    if (SPECIALIST_FAMILIES.has(channel.family)) {
      if (program === "The French Chef") return "The French Chef Julia Child";
      if (program === "How Do They Do It") return "How Do They Do It Discovery";
      return program;
    }
    return `${program} full episode`;
  });
}

function matchProgram(profile, title) {
  const channel = okCuratedChannel(profile);
  if (!channel) return null;
  const normalized = ` ${clean(title)} `;
  for (const aliases of channel.programs) {
    if (aliases.some(alias => normalized.includes(` ${clean(alias)} `))) {
      const program = canonical(aliases);
      if (!aliases.some(alias => programLeadsTitle(channel, alias, title))) continue;
      if (channel.family === "factory" && program === "How It's Made" && /\bdream cars?\b/i.test(title)) return "How It's Made Dream Cars";
      if (channel.family === "black-tv" && program === "Martin" && !/^\s*martin(?:\s|[-:._(]|$)/i.test(title)) continue;
      return program;
    }
  }
  return null;
}

function programLeadsTitle(channel, program, title) {
  let value = clean(title.replace(/^\[[\w .-]{1,32}\]\s*/, ""));
  value = value.replace(/^\d+\s+(?:episode\s+\d+|ep\s*\d+)\s+/, "");
  value = value.replace(/^(?:episode\s+\d+|ep\s*\d+)\s+/, "");
  value = value.replace(/^asa\s+/, "");
  if (channel.family === "factory") value = value.replace(/^(?:national geographic|discovery channel)\s+/, "");
  if (channel.family === "gearhead") value = value.replace(/^bbc\s+/, "");
  const name = clean(program);
  const boundary = " " + value + " ";
  return boundary.startsWith(" " + name + " ") || boundary.startsWith(" the " + name + " ")
    || (channel.family === "gearhead" && name === "jay lenos garage" && boundary.endsWith(" jay lenos garage "))
    || (channel.family === "cookhouse" && name === "the french chef" && /(?:^| )the french chef (?:with julia child|season \d+|s\d{1,2}e\d{1,3})\b/.test(value));
}

function martinEpisode(title) {
  if (/^\s*martin[ ._-]+(?:mystery|chuzzlewit|luther|clunes|freeman)\b/i.test(title)) return false;
  if (/\b(?:dean martin|doc martin|steve martin|martin scorsese|martin short)\b/i.test(title)) return false;
  if (/\bmartin lawrence\b.*\b(?:stand[ -]?up|interview|special|movie|film|tour|live)\b/i.test(title)) return false;
  return /(?:^|[^a-z])martin(?:[^a-z]|$)/i.test(title)
    && /\b(?:s\d{1,2}[ ._-]*e\d{1,3}|\d{1,2}x\d{1,3}|season\s*\d+|episode\s*\d+|ep\.?\s*\d+)\b/i.test(title);
}


export function okCuratedPrecheck(profile, item, checkAspect = true) {
  const channel = okCuratedChannel(profile);
  const title = String(item?.title || "");
  const haystack = [title, item?.description, item?.tags, item?.category].join(" ");
  if (!channel || !item?.id || !(Number(item.duration) >= 900)) return false;
  if (checkAspect && !(Number(item.aspectRatio) >= 1.2)) return false;
  const program = matchProgram(profile, title);
  if (!program) return false;
  if (channel.family === "black-tv" && program === "Martin" && !martinEpisode(title)) return false;
  // These words are part of the verified series or episode name.
  let editorialTitle = title;
  if (program === "The French Chef") editorialTitle = editorialTitle.replace(/\bthe french chef\b/i, "");
  if (program === "Inside the Spitfire Factory") editorialTitle = editorialTitle.replace(/\bmaking of an icon\b/i, "");
  const editorialText = program === "The French Chef" ? haystack.replace(/\bthe french chef\b/gi, "") : haystack;
  const specialist = SPECIALIST_FAMILIES.has(channel.family);
  if (COMMON_DENY.test(specialist ? editorialTitle : haystack) || FOREIGN.test(editorialText)
    || /\breunion\b|\b(?:CZ|FR|ES|RU|HU|DE)[._-]EN\b|\b(?:VF|DK Hardsubs|DUB)\b/i.test(editorialText)
    || /\b(?:ai[ -]?(?:generated|factory|video)|generated (?:by|with) ai|unofficial|concept video|satisfying factory)\b/i.test(haystack)) return false;
  if (program === "Wheeler Dealers" && !/\b(?:s\d{1,2}[ ._-]*e\d{1,3}|\d{1,2}x\d{1,3}|season\s*\d+|episode\s*\d+)\b/i.test(title)) return false;
  if (program === "Bill Nye the Science Guy" && (Number(item.duration) > 2100 || /\b(?:pc game|stop the rock)\b/i.test(title))) return false;
  if (program === "How the Universe Works" && Number(item.duration) > 5400) return false;
  if (program === "PBS NOVA" && /\b(?:manhunt|boston bombers|escape from nazi alcatraz)\b/i.test(title)) return false;
  if (program === "Mega Manufacturing" && /\b\d+of\d+\b/i.test(title)) return false;
  if (channel.family === "cookhouse" && /\b(?:an extra slice|celebrity bake off|junior bake off)\b/i.test(title)) return false;
  if (channel.family === "gearhead" && /\b(?:tonight show|top gear america|top gear australia|top gear korea)\b/i.test(title)) return false;
  if (program === "Inside the Factory" && !/\b(?:s\d{1,2}[ ._-]*e\d{1,3}|series[ ._-]*\d+|season[ ._-]*\d+|episode[ ._-]*\d+|[1-9]\d?x\d{1,2}|bbc|gregg wallace|cherry healey)\b/i.test(title)) return false;
  if (channel.family === "factory" && /\b(?:cyborg|android|robots? build themselves|ai generated|sci[ -]?fi factory)\b/i.test(haystack)) return false;
  return true;
}

export async function okCuratedIdentity(profile, item) {
  if (!okCuratedPrecheck(profile, item)) return null;
  const channel = okCuratedChannel(profile);
  const program = matchProgram(profile, item.title);
  if (!channel || !program) return null;
  const slug = compact(program);
  // Non-numbered specials still need a stable identity across alternate uploads.
  // Include a tagged year when an uploader supplies only a standalone episode number.
  const number = okEpisodeIdentity(item.title);
  const year = String(item.title).match(/\b(?:19|20)\d{2}\b/)?.[0];
  const special = clean(item.title).replace(/^(?:bbc )?(?:top gear|bill nye the science guy|mega ?factories) /, "")
    .replace(/\b(?:dc |proper |hd |hq )?\d{3,4}(?:p|i)?(?: hd)?\b.*$/, "").replace(/\b(?:hdtv|webrip|bluray)\b.*$/, "").trim();
  const named = program === "Top Gear" || program === "Bill Nye the Science Guy" || program === "MegaFactories";
  const episode = number && year && program === "Great British Bake Off" && number.startsWith("episode") ? year + number
    : number || (named && special ? "special-" + compact(special).slice(0, 60) : "");
  return {
    language: "en",
    seriesId: `realsignal-ok:${channel.family}:${slug}`,
    seriesTitle: program,
    identityProvider: "RealSignal curated program index",
    identityReference: `https://ok.ru/video/${String(item.rawId || item.id || "").replace(/^ok:/, "")}`,
    curatedFamily: channel.family,
    curatedVerified: true,
    curatedVerificationVersion: 1,
    episodeIdentity: episode
  };
}

export function okCuratedVerified(profile, item) {
  const channel = okCuratedChannel(profile);
  return !!channel
    && okCuratedPrecheck(profile, item)
    && item.curatedVerified === true
    && item.curatedVerificationVersion === 1
    && item.curatedFamily === channel.family
    && item.language === "en"
    && String(item.seriesId || "").startsWith(`realsignal-ok:${channel.family}:`)
    && item.embedAllowed === true
    && /^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/.test(String(item.embedUrl || item.url || ""));
}
