/* Curated long-form OK.ru television lanes.
 *
 * Search phrases are discovery hints only. A result is admitted only when its
 * own title identifies one of the channel's approved program families. Public
 * OK embeds only; no signed media extraction or private-video scraping.
 */

const COMMON_DENY = /\b(?:shorts?|clip|trailer|teaser|promo|recap|reaction|review|podcast|how[ -]?to|tutorial|fan[ -]?(?:made|film|edit|animation)|parody|mashup|gameplay|soundtrack|theme song|music video|audio only|commentary only|interview|behind the scenes|making of|video essay|explained|lecture|seminar|conference|panel|best of|supercut|tribute|anniversary|50 years of laughs|greatest christmas moments|lost pilot|test episode|comedy duo|life lessons|doctors? revisited)\b/i;
const FOREIGN = /(?:[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u1100-\u11ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]|\b(?:vostfr|vose|truefrench|subfrench|subesp|subbed|rus|russian|french|spanish|german|hindi|tamil|telugu|italian|hungarian|dublado|dubbed|dual|multi|latino|espa[nñ]ol|fran[cç]ais|episodul|portugu[eê]s|subtitulado|magyar|turkish|romana|romanian|ukrainian|ukr|dvo|tr-p\d+|seizoen|polarni|hun|vost|castellano)\b)/i;

const CHANNELS = Object.freeze({
  "ok-britannia-channel": {
    family: "britannia",
    programs: [
      ["One Foot in the Grave"],
      ["Yes Minister"],
      ["Yes Prime Minister"],
      ["Absolutely Fabulous"],
      ["The Vicar of Dibley"],
      ["As Time Goes By"],
      ["Open All Hours"],
      ["The Good Life"],
      ["Jonathan Creek"],
      ["A Touch of Frost","Touch of Frost"],
      ["Cracker"],
      ["Only Fools and Horses"], ["Fawlty Towers"], ["Doctor Who"], ["Blackadder"],
      ["Peep Show"], ["The Office UK", "The Office (UK)", "The Office BBC"],
      ["Midsomer Murders"], ["Inspector Morse"], ["Poirot", "Agatha Christie's Poirot"],
      ["Keeping Up Appearances"], ["Are You Being Served"], ["The IT Crowd"]
    ]
  },
  "ok-history-vault-channel": {
    family: "history",
    programs: [
      ["Victory at Sea"],
      ["The Great War BBC 1964","The Great War BBC","The Great War 1964"],
      ["World War II in Colour","World War II in Color"],
      ["World War II The Lost Color Archives","WWII The Lost Color Archives"],
      ["Ken Burns The Civil War","The Civil War Ken Burns"],
      ["Civilisations BBC","Civilisations 2018"],
      ["A History of Britain","Simon Schama A History of Britain"],
      ["The Men Who Built America"], ["Ancient Discoveries"], ["Connections", "Connections James Burke"],
      ["The World at War"], ["The Century America's Time", "The Century: America's Time"],
      ["History Detectives"], ["Cities of the Underworld"], ["Engineering an Empire"],
      ["America The Story of Us", "America: The Story of Us"], ["Lost Worlds"]
    ]
  },
  "ok-factory-floor-channel": {
    family: "factory",
    programs: [
      ["Building Giants"],
      ["Impossible Engineering"],
      ["Extreme Engineering"],
      ["Food Factory USA"],
      ["Machines How They Work"],
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
      ["Mary Makes It Easy"],
      ["Mary Berry Love to Cook"],
      ["Rick Stein's Secret France","Rick Stein Secret France"],
      ["Rick Stein's Long Weekends","Rick Stein Long Weekends"],
      ["The Hairy Bikers Go North"],
      ["Gordon Ramsay's Ultimate Cookery Course"],
      ["Nigella At My Table"],
      ["The French Chef", "Julia Child The French Chef"],
      ["Two Fat Ladies"], ["Great British Bake Off", "The Great British Baking Show"],
      ["America's Test Kitchen"], ["Great Chefs"], ["Baking with Julia"],
      ["Jacques Pepin Fast Food My Way"], ["Good Eats"],
      ["Great British Menu"], ["Simply Nigella"], ["Mary Berry Cook and Share"],
      ["Rick Stein's Cornwall"], ["Rick Stein's India"], ["Rick Stein's Food Stories"],
      ["The Hairy Bikers Go West"], ["Gordon Ramsay's Home Cooking"]
    ]
  },
  "ok-science-lab-channel": {
    family: "science-lab",
    programs: [
      ["Horizon","BBC Horizon"],
      ["The Secret Life of Chaos"],
      ["The Day the Universe Changed","James Burke The Day the Universe Changed"],
      ["Wonders of Life"],
      ["How the Universe Works"], ["Through the Wormhole", "Through the Wormhole with Morgan Freeman"],
      ["Cosmos A Spacetime Odyssey"], ["Cosmos Possible Worlds"], ["Wonders of the Universe"],
      ["PBS NOVA", "NOVA PBS"], ["Wonders of the Solar System"], ["The Planets BBC", "BBC The Planets"],
      ["Bill Nye the Science Guy"]
    ]
  },
  "ok-gearhead-channel": {
    family: "gearhead",
    programs: [
      ["Richard Hammond's Workshop","Richard Hammonds Workshop"],
      ["Overhaulin"],
      ["Graveyard Carz"],
      ["Bitchin Rides"],
      ["FantomWorks"],
      ["Counting Cars"],
      ["Top Gear"], ["Fifth Gear"], ["Wheeler Dealers"], ["Car SOS", "Car S O S"],
      ["Jay Leno's Garage", "Jay Lenos Garage"], ["Chasing Classic Cars"],
      ["Fast N Loud", "Fast and Loud"], ["MotorWeek"], ["Car Fix"]
    ]
  },
  "ok-wildlife-channel": {
    family: "wildlife",
    programs: [
      ["BBC Natural World","Natural World"],
      ["The Private Life of Plants"],
      ["The Living Planet"],
      ["Life Story"],
      ["Wild China with Ray Mears"],
      ["The Secret Life of the Zoo"],
      ["Secrets of the Zoo Down Under"],
      ["Wild Scandinavia PBS","PBS Wild Scandinavia","Wild Scandinavia"],
      ["Planet Earth III"],
      ["Planet Earth II"],
      ["Planet Earth"],
      ["Blue Planet II"],
      ["The Blue Planet","Blue Planet"],
      ["Frozen Planet II"],
      ["Frozen Planet"],
      ["The Life of Birds"],
      ["The Life of Mammals"],
      ["Life in Cold Blood"],
      ["Seven Worlds One Planet"],
      ["PBS Nature","Nature PBS"],
      ["Big Cat Diary"],
      ["Dynasties UK","Dynasties BBC"]
    ]
  },
  "ok-casefiles-channel": {
    family: "casefiles",
    programs: [
      ["The First 48 Presents Homicide Squad Atlanta"],
      ["The First 48 Missing Persons"],
      ["Homicide Hunter Lt Joe Kenda","Homicide Hunter"],
      ["Fear Thy Neighbor"],
      ["American Monster"],
      ["New York Homicide"],
      ["Murder Comes to Town"],
      ["The Murder Tapes"],
      ["Unusual Suspects"],
      ["Forensic Files II"],
      ["Forensic Files"],
      ["The FBI Files"],
      ["The New Detectives"],
      ["Cold Case Files"],
      ["American Justice"],
      ["Unsolved Mysteries"],
      ["The First 48"],
      ["Exhibit A Secrets of Forensic Science"]
    ]
  },
  "ok-homestead-channel": {
    family: "homestead",
    programs: [
      ["George Clarke's Amazing Spaces","George Clarke Amazing Spaces"],
      ["Restoration Home"],
      ["Your Home Made Perfect"],
      ["Gardeners' World"],
      ["Beechgrove Garden","The Beechgrove Garden"],
      ["Love Your Garden"],
      ["Garden Rescue"],
      ["Ask This Old House"],
      ["This Old House"],
      ["Grand Designs New Zealand","Grand Designs NZ"],
      ["Grand Designs"],
      ["Escape to the Country"]
    ]
  },
  "ok-treasures-channel": {
    family: "treasures",
    programs: [
      ["Salvage Hunters Classic Cars"],
      ["Celebrity Antiques Road Trip"],
      ["American Restoration"],
      ["King of Collectibles"],
      ["Antiques Roadshow US"],
      ["Antiques Roadshow"],
      ["Celebrity Antiques Road Trip"],
      ["Antiques Road Trip"],
      ["American Pickers"],
      ["Salvage Hunters The Restorers"],
      ["Salvage Hunters"],
      ["The Repair Shop"],
      ["Storage Wars"],
      ["Bargain Hunt"],
      ["Flog It"]
    ]
  },
  "ok-travel-channel": {
    family: "travel",
    programs: [
      ["Joanna Lumley's Silk Road Adventure","Joanna Lumleys Silk Road Adventure"],
      ["Joanna Lumley's Greek Odyssey"],
      ["Himalaya with Michael Palin","Michael Palin Himalaya"],
      ["Michael Palin's New Europe","Michael Palin New Europe"],
      ["Michael Palin in North Korea"],
      ["Michael Palin into Iraq","Michael Palin in Iraq"],
      ["Michael Palin in Nigeria"],
      ["Globe Trekker","Pilot Guides"],
      ["Japanology Plus"],
      ["Rick Steves Europe","Rick Steves","Rick Steve's Art of Europe"],
      ["Michael Palin Around the World in 80 Days","Around the World in 80 Days with Michael Palin"],
      ["Michael Palin Travels of a Lifetime"],
      ["Michael Palin in the Philippines"],
      ["Samantha Brown's Places to Love","Samantha Brown Places to Love"],
      ["Anthony Bourdain No Reservations"],
      ["Anthony Bourdain Parts Unknown"],
      ["Joanna Lumley's Japan"],
      ["Joanna Lumley's Trans Siberian Adventure"],
      ["Joanna Lumley's Unseen Adventures"],
      ["Travel Man 48 Hours in"]
    ]
  },
  "ok-rail-channel": {
    family: "rail",
    programs: [
      ["Great British Railway Journeys"],
      ["Great Continental Railway Journeys"],
      ["Great Japanese Railway Journeys"],
      ["Great Asian Railway Journeys"],
      ["Great American Railroad Journeys"],
      ["Mighty Trains"],
      ["The World's Most Scenic Railway Journeys","World's Most Scenic Railway Journeys"],
      ["Great Coastal Railway Journeys"],
      ["Impossible Railways"]
    ]
  },
  "ok-air-channel": {
    family: "air",
    programs: [
      ["Air Crash Investigation","Mayday Air Disaster","Mayday Air Disasters","Air Disasters","Mayday"],
      ["Mighty Planes"],
      ["Air Warriors"],
      ["Ice Pilots NWT"]
    ]
  },
  "ok-rescue-channel": {
    family: "rescue",
    programs: [
      ["Saving Lives at Sea"],
      ["Paramedics on Scene"],
      ["Helicopter ER"],
      ["Emergency Helicopter Medics"],
      ["Ambulance UK","Ambulance BBC"],
      ["Rescue 911"],
      ["999 What's Your Emergency"],
      ["24 Hours in A&E","24 Hours in AE"]
    ]
  },
  "ok-black-tv-channel": {
    family: "black-tv",
    programs: [
      ["Sister Sister"],
      ["Family Matters"],
      ["Good Times"],
      ["The Jeffersons"],
      ["Sanford and Son"],
      ["Half and Half"],
      ["One on One"],
      ["The Hughleys"],
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

const NEW_FAMILIES = new Set(["wildlife","casefiles","homestead","treasures","travel","rail","air","rescue"]);
const SPECIALIST_FAMILIES = new Set(["factory", "cookhouse", "science-lab", "gearhead", ...NEW_FAMILIES]);

export function okCuratedChannel(profile) {
  return CHANNELS[profile?.profileKey] || null;
}
export function okCuratedCatalogId(profile, item) {
  const family = okCuratedChannel(profile)?.family;
  // D1 program metadata is shared by ID. A specialized station needs its
  // own episode identity when the same upload also appears on general OK TV.
  const match = String(item.id || "").match(/^ok:(\d+)$/);
  return NEW_FAMILIES.has(family) && match ? "ok:" + family + ":" + match[1] : item.id;
}
export function okCuratedQueries(profile, cursor = 0) {
  const channel = okCuratedChannel(profile);
  if (!channel) return [];
  const programs = channel.programs;
  const window = Math.abs(Math.floor(Number(cursor) || 0));
  const start = window * 4;
  const selected = Array.from({ length: Math.min(4, programs.length) }, (_, index) => programs[(start + index) % programs.length]);
  return selected.map((aliases, index) => {
    const program = canonical(aliases);
    if (channel.family === "black-tv" && program === "Martin") return "Martin Lawrence Martin 1992 sitcom full episode";
    // After the first pass, search aliases too so regional series names and
    // alternate spellings contribute their own paginated discovery results.
    const alias = aliases[Math.floor((start + index) / programs.length) % aliases.length];
    if (alias !== program) return alias;
    if (channel.family === "black-tv") return `${program} full episode`;
    if (channel.family === "history" && program === "The Men Who Built America") return "History Channel The Men Who Built America full episode";
    if (channel.family === "history" && program === "Ancient Discoveries") return "Ancient Discoveries History Channel full episode";
    if (SPECIALIST_FAMILIES.has(channel.family)) {
      if (program === "The French Chef") return "The French Chef Julia Child";
      if (program === "How Do They Do It") return "How Do They Do It Discovery";
      if (program === "Gardeners' World") return "Gardeners World";
      if (program === "Unsolved Mysteries") return "Unsolved Mysteries Robert Stack";
      if (program === "Frozen Planet") return "Frozen Planet BBC";
      if (program === "Horizon") return "Horizon BBC science";
      if (program === "Planet Earth") return "Planet Earth BBC";
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
  let value = clean(title.replace(/^(?:\[[\w .-]{1,36}\]|\([\w .-]{1,36}\))\s*/, ""));
  value = value.replace(/^\d+\s+(?:episode\s+\d+|ep\s*\d+)\s+/, "");
  value = value.replace(/^(?:episode\s+\d+|ep\s*\d+)\s+/, "");
  value = value.replace(/^asa\s+/, "");
  if (channel.family === "factory") value = value.replace(/^(?:national geographic|discovery channel)\s+/, "");
  if (["gearhead","homestead","wildlife","travel","rail","air","rescue","history"].includes(channel.family)) value = value.replace(/^bbc(?: one| two)?\s+/, "");
  if (SPECIALIST_FAMILIES.has(channel.family)) value = value.replace(/^(?:19|20)\d{2} /, "");
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
  const haystack = [title, item?.description, item?.tags, item?.category, item?.compilationTitle].join(" ");
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
  if (NEW_FAMILIES.has(channel.family) && /\b(?:fan fiction|audiobook|reaction video|full movie|stop motion)\b/i.test(title)) return false;
  if (program === "Life Story" && !/\b(?:bbc|s\d{1,2}[ ._-]*e\d{1,3}|\d+of\d+|attenborough)\b/i.test(title)) return false;
  if (program === "Gordon Ramsay's Ultimate Cookery Course" && !okEpisodeIdentity(title)) return false;
  if (channel.family === "wildlife" && /\b(?:planet earth live|sezonnye|sntrk|hans zimmer|rom[ -]extremlym|green planet|music from)\b/i.test(title)) return false;
  if (channel.family === "casefiles" && (Number(item.duration) > 5400 || !okEpisodeIdentity(title) && !/\b(?:s\d{1,2}|episode|season|with robert stack)\b/i.test(title))) return false;
  if (channel.family === "homestead" && /\b(?:love your garden for less|blossom)\b/i.test(title)) return false;
  if (/\b(?:bonus|outtakes|gag reel|behind the scenes)\b/i.test(title)) return false;
  if (["Cracker", "Horizon", "Mayday", "Counting Cars", "Good Times", "One on One"].includes(program)
    && !okEpisodeIdentity(title)) return false;
  if (channel.family === "rail" && /\b(?:railway sound|train sounds|cab view|model railway|virtual walk|viyana|bölümü)\b/i.test(title)) return false;
  if (channel.family === "air" && /\b(?:flight simulator|plane spotting|aviation nation|the aviator|the aviators|air crash animation)\b/i.test(title)) return false;
  if (channel.family === "rescue" && /\b(?:reaction video|911 call audio|reenactment compilation)\b/i.test(title)) return false;
  if (channel.family === "travel" && Number(item.duration) > 7200) return false;
  if (channel.family === "travel" && /\b(?:sarkig|full movie|monty python|smart glasses|watch party)\b/i.test(title)) return false;
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
  const normalizedTitle = clean(item.title);
  const aliases = channel.programs.find(entry => canonical(entry) === program) || [program];
  const normalizedProgram = aliases.map(clean).find(alias => (" " + normalizedTitle + " ").includes(" " + alias + " ")) || clean(program);
  const programTail = normalizedTitle.includes(normalizedProgram)
    ? normalizedTitle.slice(normalizedTitle.indexOf(normalizedProgram) + normalizedProgram.length).trim()
    : "";
  const numberedSpecial = (NEW_FAMILIES.has(channel.family) || channel.family === "history")
    ? (programTail.match(/^(?:episode |ep )?(\d{1,2})(?:\s|$)/) || programTail.match(/\b(\d{1,2})\s*of\s*\d{1,2}\b/))?.[1]
    : "";
  const wildlifeEpisode = channel.family === "wildlife" && program !== "PBS Nature";
  const numbered = wildlifeEpisode && number.startsWith("episode") ? "s01e" + number.slice(7).padStart(2,"0")
    : number || (numberedSpecial ? (wildlifeEpisode ? "s01e" + numberedSpecial.padStart(2,"0") : "episode" + Number(numberedSpecial)) : "");
  const episodeTitle = programTail.replace(/^(?:s\d{1,2}\s*e\d{1,3}|\d{1,2}x\d{1,3})\s*/, "");
  const titleKey = programTail.replace(/\b(?:proper|hdtv|webrip|bluray|bdrip|web dl|x264|1080p|720p|576p)\b.*$/, "").trim();
  const year = String(item.title).match(/\b(?:19|20)\d{2}\b/)?.[0];
  const special = clean(item.title).replace(/^(?:bbc )?(?:top gear|bill nye the science guy|mega ?factories) /, "")
    .replace(/\b(?:dc |proper |hd |hq )?\d{3,4}(?:p|i)?(?: hd)?\b.*$/, "").replace(/\b(?:hdtv|webrip|bluray)\b.*$/, "").trim();
  const named = program === "Top Gear" || program === "Bill Nye the Science Guy" || program === "MegaFactories";
  const yearKey = (program === "Great British Bake Off" || program === "Great British Menu" || channel.family === "homestead") && year && numbered.startsWith("episode") ? year : "";
  const forensicName = program === "Forensic Files II" && episodeTitle && episodeTitle !== programTail && !/^\d/.test(episodeTitle)
    ? "title-" + compact(episodeTitle.replace(/\b(?:19|20)\d{2}\b.*$/, "")).slice(0,60) : "";
  // The Canadian, British and US releases of Mayday use different numbering.
  const airCaseTitle = program === "Air Crash Investigation" ? episodeTitle.replace(/\b(?:19|20)\d{2}\b.*$/, "").replace(/\b(?:1080p|720p|hdtv|webrip|bdrip)\b.*$/, "").trim() : "";
  const airCase = airCaseTitle && episodeTitle !== programTail && /[a-z]/.test(airCaseTitle) ? "case-" + compact(airCaseTitle).slice(0,60) : "";
  const episode = airCase || forensicName || yearKey + numbered || (named && special ? "special-" + compact(special).slice(0, 60)
    : NEW_FAMILIES.has(channel.family) && titleKey ? "title-" + compact(titleKey).slice(0, 60) : "");
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
