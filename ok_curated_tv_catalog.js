/* Curated long-form OK.ru television lanes.
 *
 * Search phrases are discovery hints only. A result is admitted only when its
 * own title identifies one of the channel's approved program families. Public
 * OK embeds only; no signed media extraction or private-video scraping.
 */

const COMMON_DENY = /\b(?:shorts?|clip|trailer|teaser|promo|recap|reaction|review|podcast|how[ -]?to|tutorial|fan[ -]?(?:made|film|edit|animation)|parody|mashup|gameplay|soundtrack|theme song|music video|audio only|commentary only|interview|behind the scenes|making of|video essay|explained|lecture|seminar|conference|panel|best of|supercut|tribute|anniversary|50 years of laughs|greatest christmas moments|lost pilot|test episode|comedy duo|life lessons|doctors? revisited)\b/i;
const FOREIGN = /(?:[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u1100-\u11ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]|\b(?:vostfr|vose|truefrench|subfrench|subesp|subbed|rus|russian|french|spanish|german|hindi|tamil|telugu|italian|hungarian|dublado|dubbed|dual|multi|latino|espa[nñ]ol|fran[cç]ais|episodul|portugu[eê]s|subtitulado|magyar|turkish|romana|romanian|ukrainian|ukr|dvo|tr-p\d+)\b)/i;

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
      ["Made in a Day"], ["Secrets of the Superfactories", "Secrets of the Super Factories"]
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

const clean = value => String(value || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const compact = value => clean(value).replace(/\s+/g, "");
const canonical = aliases => aliases[0];

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
    if (channel.family === "factory" && program === "Ultimate Factories") return "National Geographic Ultimate Factories full episode English";
    if (channel.family === "factory" && program === "MegaFactories") return "National Geographic MegaFactories full episode English";
    if (channel.family === "factory") return `${program} full episode`;
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
      if (!programLeadsTitle(channel, program, title)) continue;
      if (channel.family === "factory" && program === "How It's Made" && /\bdream cars?\b/i.test(title)) return "How It's Made: Dream Cars";
      if (channel.family === "black-tv" && program === "Martin" && !/^\s*martin(?:\s|[-:._(]|$)/i.test(title)) continue;
      return program;
    }
  }
  return null;
}

function programLeadsTitle(channel, program, title) {
  let value = clean(title);
  value = value.replace(/^\d+\s+(?:episode\s+\d+|ep\s*\d+)\s+/, "");
  value = value.replace(/^(?:episode\s+\d+|ep\s*\d+)\s+/, "");
  value = value.replace(/^asa\s+/, "");
  if (channel.family === "factory") value = value.replace(/^national geographic\s+/, "");
  const name = clean(program);
  return value.startsWith(name) || value.startsWith(`the ${name}`);
}

function martinEpisode(title) {
  if (/\b(?:dean martin|doc martin|steve martin|martin scorsese|martin short)\b/i.test(title)) return false;
  if (/\bmartin lawrence\b.*\b(?:stand[ -]?up|interview|special|movie|film|tour|live)\b/i.test(title)) return false;
  return /(?:^|[^a-z])martin(?:[^a-z]|$)/i.test(title)
    && /\b(?:s\d{1,2}[ ._-]*e\d{1,3}|\d{1,2}x\d{1,3}|season\s*\d+|episode\s*\d+|ep\.?\s*\d+)\b/i.test(title);
}

function episodeEvidence(title) {
  return /\b(?:s[ ._-]*\d{1,2}[ ._-]*e[ ._-]*\d{1,3}|\d{1,2}\s*x\s*\d{1,3}|season\s*\d+\s*(?:episode|ep)\s*\d+|episode\s*\d+|\d+\s*of\s*\d+|\d+of\d+|s[ ._-]*\d+[ ._-]*ep[ ._-]*\d+|\d+[ ._-]*episode[ ._-]*\d+)\b/i.test(title);
}

function episodeIdentity(title) {
  const patterns = [
    /\bs\s*(\d{1,2})[ ._-]*e\s*(\d{1,3})\b/i,
    /\b(\d{1,2})\s*x\s*(\d{1,3})\b/i,
    /\bseason\s*(\d{1,2})\s*(?:episode|ep)\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\s*of\s*(\d{1,3})\b/i,
    /\b(\d{1,3})of(\d{1,3})\b/i,
  ];
  for (const pattern of patterns) {
    const match = String(title || "").match(pattern);
    if (match) return `s${String(Number(match[1])).padStart(2,"0")}e${String(Number(match[2])).padStart(2,"0")}`;
  }
  const episode = String(title || "").match(/\b(?:episode|ep)\.?\s*(\d{1,3})\b/i);
  return episode ? `episode${Number(episode[1])}` : "";
}

export function okCuratedPrecheck(profile, item, checkAspect = true) {
  const channel = okCuratedChannel(profile);
  const title = String(item?.title || "");
  const haystack = [title, item?.description, item?.tags, item?.category].join(" ");
  if (!channel || !item?.id || Number(item.duration) < 900) return false;
  if (checkAspect && !(Number(item.aspectRatio) >= 1.2)) return false;
  if (COMMON_DENY.test(haystack) || FOREIGN.test(haystack)) return false;
  const program = matchProgram(profile, title);
  if (!program) return false;
  if (channel.family === "black-tv" && program === "Martin" && !martinEpisode(title)) return false;
  if (!programLeadsTitle(channel, program, title)) return false;
  if (channel.family === "factory" && /\b(?:cyborg|android|robots? build themselves|ai generated|sci[ -]?fi factory)\b/i.test(haystack)) return false;
  return true;
}

export async function okCuratedIdentity(profile, item) {
  if (!okCuratedPrecheck(profile, item)) return null;
  const channel = okCuratedChannel(profile);
  const program = matchProgram(profile, item.title);
  if (!channel || !program) return null;
  const slug = compact(program);
  return {
    language: "en",
    seriesId: `realsignal-ok:${channel.family}:${slug}`,
    seriesTitle: program,
    identityProvider: "RealSignal curated program index",
    identityReference: `https://ok.ru/video/${String(item.rawId || item.id || "").replace(/^ok:/, "")}`,
    curatedFamily: channel.family,
    curatedVerified: true,
    curatedVerificationVersion: 1,
    episodeIdentity: episodeIdentity(item.title)
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
