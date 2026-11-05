/* Companion guide entries and publisher policies for YouTube Sports.
 * The server resolves these handles, checks upload ownership and verifies embeds.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RealSignalYouTubeSports = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const lineup = [
    { number: 800, key: "hard-count", name: "Football Films", publishers: ["@NFL", "@NFLFilms", "@NFLThrowback"], topics: ["nfl", "football"], format: "program", minutes: 20 },
    { number: 801, key: "octagon", name: "MMA Replays", publishers: ["@ONEChampionship", "@PFLMMA", "@ufc"], topics: ["mma", "mixed martial arts", "one championship", "pfl", "ufc"], format: "fight", minutes: 15 },
    { number: 802, key: "sports-vault", name: "Sports Replay Vault", publishers: ["@Olympics", "@MLBVault", "@FIBA", "@FIFA"], topics: ["olympic", "baseball", "basketball", "football", "championship", "world cup"], format: "event", minutes: 30 },
    { number: 803, key: "auto-racing", name: "Sports Car Replays", publishers: ["@imsaofficial", "@GTWorld", "@FIAWEC"], topics: ["imsa", "gtworld", "gt world", "gt3", "endurance", "le mans", "weathertech", "wec"], format: "race", minutes: 35 },
    { number: 804, key: "derby-wrestling", name: "Derby & Wrestling Replays", publishers: ["UC7eMWpvytqd3gYAqxTl9w7g", "@unitedworldwrestling", "@WWE", "@FloWrestling"], topics: ["roller derby", "wftda", "wrestling", "greco-roman", "freestyle", "wwe"], format: "game", minutes: 20 },
    { number: 805, key: "boxing", name: "Boxing Replays", publishers: ["@toprank", "@PremierBoxingChampions", "@MatchroomBoxing"], topics: ["boxing", "top rank", "pbc", "matchroom boxing"], format: "fight", minutes: 15 },
    { number: 806, key: "gridiron", name: "Gridiron Replays", publishers: ["@NFL", "@NFLThrowback", "@CFL"], topics: ["nfl", "cfl", "american football", "super bowl", "grey cup"], format: "game", minutes: 60 },
    { number: 807, key: "basketball", name: "Basketball Replays", publishers: ["@FIBA", "@NBAGLeague", "@NBA", "@WNBA"], topics: ["basketball", "fiba", "nba", "wnba", "g league"], format: "game", minutes: 45 },
    { number: 808, key: "baseball", name: "Baseball Replays", publishers: ["@MLBVault", "@MLB", "@WBSC"], topics: ["baseball", "mlb", "world series", "all-star game", "wbsc"], format: "game", minutes: 60 },
    { number: 809, key: "hockey", name: "Hockey Replays", publishers: ["@thepwhlofficial", "@IIHFWorlds", "@NHL"], topics: ["hockey", "pwhl", "iihf", "nhl", "stanley cup"], format: "game", minutes: 45 },
    { number: 810, key: "olympics", name: "Olympic Replays", publishers: ["@Olympics", "@OlympicsAquatics"], topics: ["olympic", "tokyo 2020", "paris 2024", "rio 2016", "london 2012", "beijing 2022"], format: "event", minutes: 25 },
    { number: 811, key: "college", name: "College Sports Replays", publishers: ["@MarchMadness", "@NCAAChampionships", "@BigTenNetwork"], topics: ["ncaa", "college", "march madness", "big ten", "final four"], format: "game", minutes: 45 },
    { number: 812, key: "soccer", name: "Soccer Replays", publishers: ["@FIFA", "@Concacaf", "@MLS", "@USSoccer"], topics: ["fifa", "concacaf", "mls", "soccer", "world cup", "nations league"], format: "game", minutes: 55 },
    { number: 813, key: "track-field", name: "Track & Field Replays", publishers: ["@EuropeanAthletics", "@WorldAthletics", "@DiamondLeague", "@usatf", "@Olympics"], topics: ["athletics", "diamond league", "track & field", "track and field", "marathon", "long jump"], format: "event", minutes: 25 },
    { number: 814, key: "sporting-life", name: "Outdoor Sports Films", publishers: ["@TheNorthFace", "UCl3xZ-f3cQhOHvH6f-7-ssQ", "@RedBull", "@rei"], topics: ["north face", "mountaineering", "climbing", "trail running", "expedition", "outdoor", "skiing", "snowboarding", "surfing"], format: "program", minutes: 15,
      playlists: { "@TheNorthFace": { id: "PLb8M2N__cpL88meaT5c7uELJX287v_iNL", label: "Full Film" },
        "UCl3xZ-f3cQhOHvH6f-7-ssQ": { id: "PLJQsrK_W2jnhITiPMzU_q6o2jxsvMXmVT", label: "Full Film" } } },
    { number: 815, key: "action-sports", name: "Surf, Skate & Snow Replays", publishers: ["@wsl", "@StreetLeague", "@XGames", "@fissnowboard"], topics: ["surf", "skateboard", "snowboard", "x games", "street league"], format: "event", minutes: 25 },
    { number: 816, key: "women-in-sport", name: "Women’s Sports Replays", publishers: ["@FIBA", "@thepwhlofficial", "@WNBA", "@NWSLsoccer"], topics: ["women", "nwsl", "wnba", "pwhl"], format: "game", minutes: 45 },
    { number: 817, key: "coaches-clinic", name: "Coaching Programs", publishers: ["@FIBA", "@usabasketball", "@usavolleyball", "@USSoccer"], topics: ["coaching", "clinic", "coach education", "coach development"], format: "clinic", minutes: 15,
      // FIBA's clinic and Africa coaching resource pages link these recordings.
      videos: { "@FIBA": { label: "Coaching Clinic", ids: [
        "iMLpZIjVCx0", "7WlwWhegq-s", "9uXjyH54toM", "xnyvHbJInQ4", "RzDoqf4ANl8", "4BuyAX-QEl4", "rE1fMRWHnUE", "06BcyZ50-zE", "mrbppxQ8Tms",
        "wZGEwQ5qW9E", "DbiZg7phuaw", "aq5I_ddQLjc", "LiTNdFKu8zE", "rxuJLXQh1H4", "p5wMK59kCp0", "dHUU78BucSM", "2L4usJ_mtL0", "wJvCEsf64lM", "SKovmwvgf_A", "Uu75nq0F9H4", "93G0FiGsAk0",
      ] } } },
    { number: 818, key: "sports-newsreel", name: "Sports History Films", publishers: ["@Olympics", "@NFLFilms", "@MLBVault", "@BritishPathe"], topics: ["sport", "sports", "athlete", "olympic", "olympics", "nfl", "baseball", "football", "boxing"], format: "program", minutes: 20,
      playlists: { "@Olympics": { id: "PL-292yfpAFGYp7Ha9qTi_tPDhnY6feCxx", label: "Olympic Documentary" } } },
    { number: 819, key: "rodeo", name: "Rodeo Replays", publishers: ["@PBR", "@PRCAProRodeo", "@WRANGLERNFR"], topics: ["rodeo", "pbr", "bull riding", "nfr", "prca"], format: "event", minutes: 25 },
    { number: 820, key: "golf", name: "Golf Replays", publishers: ["@TheMasters", "@TheOpen", "@USGA", "@PGATOUR"], topics: ["golf", "masters", "usga", "the open", "pga tour"], format: "round", minutes: 45 },
    { number: 821, key: "racquet", name: "Racquet Sports Replays", publishers: ["@usopen", "@Wimbledon", "@AustralianOpen", "@bwftv", "@WTTGlobal"], topics: ["tennis", "badminton", "table tennis", "wimbledon", "australian open", "us open", "wtt"], format: "match", minutes: 25 },
    { number: 822, key: "equestrian", name: "Equestrian Replays", publishers: ["@feichannel", "@USEquestrian", "@ClipMyHorseTV"], topics: ["equestrian", "dressage", "jumping", "eventing", "fei"], format: "event", minutes: 25 },
    { number: 823, key: "winter", name: "Winter Sports Replays", publishers: ["@WorldCurling", "@fisski", "@ISUSkating", "@Olympics", "@IBSFsliding"], topics: ["skiing", "skating", "curling", "bobsleigh", "luge", "biathlon", "winter olympic"], format: "event", minutes: 25 },
    { number: 824, key: "regatta", name: "Regatta Replays", publishers: ["@SailGP", "@WorldRowing", "@WorldSailingTV", "@americascup"], topics: ["rowing", "sailing", "regatta", "sailgp", "america's cup"], format: "event", minutes: 25 },
    { number: 825, key: "stock-car", name: "Stock Car Replays", publishers: ["@NASCAR", "@NASCARRegional", "@ARCARacing"], topics: ["nascar", "stock car", "arca", "truck series", "xfinity", "modified tour"], format: "race", minutes: 40 },
    { number: 826, key: "grand-prix", name: "Grand Prix Replays", publishers: ["@IndyCar", "@FormulaE", "@Formula1"], topics: ["formula 1", "formula e", "indycar", "grand prix", "e-prix", "indy 500"], format: "race", minutes: 40 },
    { number: 827, key: "gymnasium", name: "Gymnastics & Strength Replays", publishers: ["@USAGymnastics", "@gymnastics", "@IWFWeightlifting"], topics: ["gymnastics", "weightlifting", "gymnast", "iwf", "all-around"], format: "event", minutes: 25 },
    { number: 828, key: "cue-sports", name: "Pool & Snooker Replays", publishers: ["@MatchroomMultiSport", "UC-YHhXeWjF80OkVxR-HE2Xw", "@WorldSnookerTour"], topics: ["snooker", "pool", "billiards", "mosconi cup", "nineball", "9-ball", "8-ball"], format: "cue", minutes: 25 },
    { number: 829, key: "hunt", name: "Hunting Programs", publishers: ["@MossyOak", "@MeatEater", "@OutdoorChannel"], topics: ["hunting", "hunt", "deer season", "elk season", "turkey season", "waterfowl"], format: "program", minutes: 20 },
    { number: 830, key: "fishing", name: "Fishing Programs", publishers: ["UCmovLz7KR-NS7VQ_cdfdh9A", "@Bassmaster", "@InFishermanTV"], topics: ["fishing", "angling edge", "bassmaster", "angler"], format: "program", minutes: 15,
      playlists: { "UCmovLz7KR-NS7VQ_cdfdh9A": { id: "PLG880RKfZvnWANWB1z5ncDxvOoEUIU7_e", label: "Full Episode" } } },
    { number: 831, key: "camp-trail", name: "Camp & Trail Films", publishers: ["@BackpackerMagazine", "@rei", "@TheNorthFace"], topics: ["backpacker", "camping", "backpacking", "hiking", "trail", "expedition", "thru-hike"], format: "program", minutes: 15,
      playlists: { "@BackpackerMagazine": { id: "PLznQMhu60MaKwsiwzg4MXjhpealFzrut_", label: "Full Episode" } } },
    { number: 832, key: "range-field", name: "Target Sports Replays", publishers: ["@WorldArcheryTV", "@issfchannel", "@ArcheryGB"], topics: ["archery", "shooting sport", "issf", "recurve", "compound", "skeet", "trap"], format: "event", minutes: 25 },
    { number: 833, key: "nascar-classics", name: "NASCAR Replay Vault", publishers: ["@NASCAR"], topics: ["nascar", "daytona", "talladega", "cup series"], format: "race", minutes: 60, throughYear: 2019 },
  ];

  const profiles = {};
  const channels = [];
  for (const entry of lineup) {
    const key = "yt-sports-" + entry.key;
    const name = entry.name;
    const profile = {
      name, profileKey: key, youtubeSports: true, intent: "sports",
      providers: ["youtube"], queries: [entry.topics[0] + " full replay"],
      match: entry.topics, topics: entry.topics, deny: [],
      minRuntimeSeconds: entry.minutes * 60, sportsFormat: entry.format,
      sportsPlaylists: entry.playlists || {},
      sportsVideos: entry.videos || {},
      sportsThroughYear: entry.throughYear || 0,
      youtubeChannelHandles: entry.publishers, youtubeChannelWindow: entry.publishers.length,
      youtubeChannelPageWindow: 3, youtubeChannelDiscoveryOnMaintenance: false,
      youtubeSearchOnViewer: false, youtubeSearchOnMaintenance: false, deepCatalog: true,
    };
    profiles[key] = profile;
    channels.push({ nm: name, num: entry.number, cat: "YTSPORTS", source: "v2preview", ns: "tv", previewKey: key });
  }

  return Object.freeze({ profiles: Object.freeze(profiles), channels: Object.freeze(channels) });
});

