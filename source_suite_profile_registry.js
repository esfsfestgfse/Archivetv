/* Generated from the approved Source Suite descriptors in the client build.
 * The API owns this registry; callers may select a profile key but cannot
 * replace its provider, query, match, or deny rules. */
export const SOURCE_PROFILE_REGISTRY = Object.freeze({
  "public-health-archive": {
    "name": "Public Health Archive",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "public health film",
      "sanitation film",
      "medical education film",
      "hospital documentary",
      "epidemiology film"
    ],
    "match": [
      "public health",
      "health",
      "sanitation",
      "medical",
      "hospital",
      "epidemiology",
      "epidemic",
      "medicine"
    ],
    "deny": [
      "fictional",
      "horror",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "wedding"
    ]
  },
  "signal-room": {
    "name": "The Signal Room",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "telegraph history film",
      "telephone history film",
      "radio engineering film",
      "broadcasting history film",
      "communications technology film"
    ],
    "match": [
      "telegraph",
      "telephone",
      "radio",
      "broadcast",
      "communication",
      "telecom",
      "signal",
      "engineering"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "podcast",
      "sermon"
    ]
  },
  "darkroom": {
    "name": "The Darkroom",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "photography film",
      "darkroom film processing",
      "camera history film",
      "photographic technique film",
      "cinematography film"
    ],
    "match": [
      "photo",
      "photograph",
      "photography",
      "darkroom",
      "camera",
      "cinema",
      "cinematography",
      "film processing"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "wedding photography service",
      "wedding"
    ]
  },
  "restoration-row": {
    "name": "Restoration Row",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "art restoration documentary",
      "furniture restoration documentary",
      "car restoration documentary",
      "building restoration documentary",
      "book restoration documentary",
      "museum conservation film",
      "tool restoration",
      "film restoration documentary"
    ],
    "match": [
      "restoration",
      "preservation",
      "conservation",
      "museum",
      "artifact",
      "furniture",
      "car restoration",
      "vehicle restoration",
      "building restoration",
      "book restoration",
      "tool restoration",
      "film restoration"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "restoration gameplay",
      "restoration video game"
    ]
  },
  "consumer-report": {
    "name": "Consumer Report",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "consumer education film",
      "product safety film",
      "consumer testing documentary",
      "household buying guide film",
      "consumer rights film"
    ],
    "match": [
      "consumer",
      "product safety",
      "testing",
      "household",
      "buying",
      "consumer rights"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "demo",
      "hands-on",
      "design tokens",
      "tutorial",
      "course",
      "workshop",
      "unboxing",
      "influencer",
      "affiliate"
    ]
  },
  "map-room": {
    "name": "The Map Room",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "cartography film",
      "map making documentary",
      "geography film",
      "surveying film",
      "map history documentary"
    ],
    "match": [
      "cartography",
      "cartographic",
      "map making",
      "geography",
      "surveying",
      "map history"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "map mod",
      "game map"
    ]
  },
  "military-archive": {
    "name": "Military Archive",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "military history film",
      "armed forces history documentary",
      "military training film archive",
      "wartime documentary film",
      "military technology history"
    ],
    "match": [
      "military history",
      "armed forces",
      "military training",
      "wartime",
      "military technology",
      "army",
      "navy",
      "air force"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "airsoft",
      "paintball",
      "recruitment ad"
    ]
  },
  "public-works": {
    "name": "Public Works",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "public works documentary",
      "civil engineering film",
      "municipal infrastructure film",
      "transit construction documentary",
      "water utility film"
    ],
    "match": [
      "public works",
      "civil engineering",
      "municipal",
      "infrastructure",
      "transit construction",
      "water utility"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "real estate ad",
      "product ad"
    ]
  },
  "sound-lab": {
    "name": "The Sound Lab",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "peerTubeQueries": [
      "sound design documentary",
      "film sound documentary",
      "acoustics documentary",
      "audio engineering documentary",
      "radio studio technology film",
      "recording engineering documentary full",
      "microphone design documentary",
      "foley sound documentary full",
      "field recording documentary full",
      "broadcast audio engineering full",
      "sound mixing documentary full",
      "recording studio documentary full"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "sound recording technology film",
      "acoustics documentary",
      "audio engineering film",
      "radio studio technology film",
      "recording studio history",
      "audio engineering documentary",
      "recording studio documentary",
      "radio engineering film",
      "acoustics film",
      "sound design documentary",
      "audio technology documentary full",
      "recording engineering documentary full",
      "film sound documentary",
      "sound effects documentary",
      "broadcast audio history documentary",
      "public radio studio documentary",
      "microphone design documentary",
      "foley sound documentary full",
      "field recording documentary full",
      "broadcast audio engineering full",
      "sound mixing documentary full",
      "recording studio documentary full",
      "audio mastering documentary full",
      "film sound recording documentary"
    ],
    "match": [
      "sound recording",
      "acoustics",
      "audio engineering",
      "radio studio",
      "recording studio",
      "audio technology",
      "sound design",
      "microphone",
      "audio production",
      "foley",
      "field recording",
      "sound mixing",
      "audio mastering",
      "broadcast audio"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "ambient sounds",
      "thunderstorm",
      "slugtv",
      "workshop",
      "podcast",
      "asmr",
      "concert",
      "live performance",
      "song"
    ]
  },
  "workshop": {
    "name": "The Workshop",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "workshop tools film",
      "machine shop documentary",
      "fabrication film",
      "craft technique documentary",
      "making things film"
    ],
    "match": [
      "workshop",
      "tools",
      "machine shop",
      "fabrication",
      "craft technique",
      "making things"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "unboxing",
      "influencer",
      "affiliate"
    ]
  },
  "field-notes": {
    "name": "Field Notes",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "field biology film",
      "ecology field study documentary",
      "natural history field film",
      "wildlife research film",
      "environmental science documentary"
    ],
    "match": [
      "field biology",
      "ecology",
      "natural history",
      "wildlife research",
      "environmental science",
      "field study"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "hunting show",
      "fishing show",
      "reality show"
    ]
  },
  "classroom": {
    "name": "The Classroom",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "educational film classroom",
      "science teaching film",
      "civics educational film",
      "school instructional film",
      "educational documentary archive"
    ],
    "match": [
      "educational film",
      "classroom",
      "science teaching",
      "civics",
      "school instructional",
      "educational documentary"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "lecture advertisement",
      "product training"
    ]
  },
  "newsreel-exchange": {
    "name": "Newsreel Exchange",
    "queryLimit": 12,
    "queryWindow": 6,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "historic news footage documentary",
      "newsreel history",
      "archival journalism film",
      "world events documentary",
      "television news history",
      "historic newsreel footage",
      "archival news film",
      "world newsreel archive",
      "newsreel full film",
      "historic news footage full documentary",
      "television newsreel full",
      "archival broadcast news full",
      "world events newsreel full",
      "news archive film full"
    ],
    "match": [
      "newsreel",
      "news footage",
      "journalism",
      "world events",
      "news history",
      "current affairs",
      "archival news",
      "news archive",
      "historical news",
      "broadcast news"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "movie trailer",
      "opinion vlog",
      "linux",
      "debian",
      "software review",
      "open source software",
      "programming",
      "coding",
      "developer conference",
      "technology conference",
      "unboxing",
      "podcast",
      "reaction",
      "commentary"
    ]
  },
  "foodways": {
    "name": "Foodways",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "cooking history documentary",
      "food culture documentary",
      "regional cuisine film",
      "kitchen history film",
      "culinary traditions documentary"
    ],
    "match": [
      "cooking history",
      "food culture",
      "regional cuisine",
      "kitchen history",
      "culinary tradition",
      "foodways",
      "food history"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "unboxing",
      "influencer",
      "affiliate"
    ]
  },
  "wild-earth-desk": {
    "name": "Wild Earth Desk",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "wildlife field research documentary",
      "ecology fieldwork film",
      "animal behavior documentary",
      "conservation science film",
      "natural history expedition"
    ],
    "match": [
      "wildlife research",
      "fieldwork",
      "ecology",
      "animal behavior",
      "conservation science",
      "natural history",
      "expedition"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "hunting show",
      "fishing show",
      "pet influencer"
    ]
  },
  "mission-control": {
    "name": "Mission Control",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "space mission documentary",
      "astronaut training film",
      "rocket engineering documentary",
      "spaceflight history",
      "planetary mission film",
      "nasa mission documentary",
      "apollo mission documentary",
      "space shuttle documentary",
      "rocket launch documentary",
      "astronaut training documentary",
      "planetary exploration documentary"
    ],
    "match": [
      "space mission",
      "astronaut",
      "rocket engineering",
      "spaceflight",
      "planetary mission",
      "orbital",
      "launch vehicle"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "science fiction",
      "flat earth",
      "conspiracy",
      "movie explanation",
      "movie recap",
      "story explained",
      "monster",
      "horror movie",
      "flight vlog",
      "travel vlog"
    ],
    "topics": [
      "space mission",
      "spaceflight",
      "astronaut",
      "rocket",
      "nasa",
      "apollo",
      "orbital",
      "planetary",
      "launch vehicle"
    ]
  },
  "backroad-journal": {
    "name": "Backroad Journal",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "rural life documentary",
      "roadside travel film",
      "small town documentary",
      "farm life history film",
      "American road documentary"
    ],
    "match": [
      "rural life",
      "roadside",
      "small town",
      "farm life",
      "road documentary",
      "backroad",
      "travelogue"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "real estate",
      "luxury resort",
      "influencer"
    ]
  },
  "storm-lab": {
    "name": "Storm Lab",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "meteorology documentary",
      "storm research film",
      "hurricane science documentary",
      "tornado science film",
      "weather instrument history",
      "hurricane science full documentary",
      "tornado research full documentary",
      "meteorology full documentary",
      "weather radar science documentary",
      "storm research full episode"
    ],
    "match": [
      "meteorology",
      "storm research",
      "hurricane science",
      "tornado science",
      "weather instrument",
      "atmospheric science",
      "forecasting history"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "weather prank",
      "conspiracy",
      "storm chaser vlog",
      "sleep music",
      "relaxing facts",
      "weather forecast today",
      "weather update"
    ],
    "topics": [
      "meteorology",
      "storm research",
      "hurricane",
      "tornado",
      "weather instrument",
      "atmospheric science",
      "weather radar",
      "forecasting history"
    ]
  },
  "atomic-age-files": {
    "name": "Atomic Age Files",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "cold war civil defense film",
      "atomic age documentary",
      "nuclear history film",
      "air raid preparedness film",
      "space race cold war history"
    ],
    "match": [
      "cold war",
      "civil defense",
      "atomic age",
      "nuclear history",
      "air raid",
      "fallout shelter",
      "arms race"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "science fiction",
      "conspiracy",
      "recruitment ad"
    ]
  },
  "lesson-reel": {
    "name": "Lesson Reel",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 2,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 12,
    "peerTubeFallbackQueryWindow": 2,
    "peerTubeInstances": ["https://search.joinpeertube.org"],
    "peerTubeQueries": [
      "health education film",
      "school film archive",
      "instructional film full program",
      "classroom instructional film",
      "civics education film",
      "educational film archive",
      "industrial training film"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "classroom instructional film",
      "science lesson documentary",
      "civics education film",
      "vocational training film",
      "teaching history documentary",
      "educational film archive",
      "school film archive",
      "instructional science film",
      "public domain instructional film full",
      "industrial training film",
      "home economics instructional film",
      "health education film",
      "science classroom film",
      "vocational education film",
      "instructional film full program",
      "educational film archive full"
    ],
    "match": [
      "classroom",
      "instructional film",
      "educational film",
      "science lesson",
      "civics education",
      "vocational training",
      "teaching",
      "school film",
      "education"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "lecture advertisement",
      "product training",
      "webinar"
    ]
  },
  "local-signal": {
    "name": "Local Signal",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 4,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 12,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org"],
    "peerTubeQueries": [
      "public affairs tv full episode",
      "local public affairs program",
      "municipal public affairs video",
      "public access television program",
      "community television documentary",
      "community channel full program",
      "local public affairs full episode"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "community television documentary",
      "public access television history",
      "local cable access film",
      "community media project",
      "municipal public affairs video",
      "public access television program",
      "community television full program",
      "local public affairs program",
      "public access show full episode",
      "community television full episode",
      "local government television full meeting",
      "community media full documentary",
      "public affairs tv full episode",
      "cable access full program",
      "community channel full program",
      "local public affairs full episode"
    ],
    "match": [
      "community television",
      "public access",
      "local cable",
      "community media",
      "public affairs",
      "municipal",
      "community",
      "cable access",
      "local government",
      "town meeting"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "campaign ad",
      "real estate",
      "influencer"
    ]
  },
  "comfort-television": {
    "name": "Comfort Television",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "craft demonstration television",
      "home improvement history film",
      "gardening television documentary",
      "quiet making documentary",
      "public television lifestyle"
    ],
    "match": [
      "craft demonstration",
      "home improvement",
      "gardening television",
      "quiet making",
      "lifestyle television",
      "home workshop",
      "public television"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "unboxing",
      "influencer",
      "affiliate",
      "reality dating"
    ]
  },
  "comedy-circuit": {
    "name": "Comedy Circuit",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "stand up comedy history",
      "comedy performance documentary",
      "comedy club film",
      "sketch comedy archive",
      "comic interview documentary"
    ],
    "match": [
      "stand up comedy",
      "comedy performance",
      "comedy club",
      "sketch comedy",
      "comic interview",
      "comedy history",
      "comedian"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "prank",
      "reaction",
      "podcast"
    ]
  },
  "rhythm-archives": {
    "name": "Rhythm Archives",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "music history documentary",
      "live soul performance archive",
      "jazz performance film",
      "rhythm and blues documentary",
      "recording artist profile"
    ],
    "match": [
      "music history",
      "soul performance",
      "jazz performance",
      "rhythm and blues",
      "artist profile",
      "music documentary",
      "concert archive"
    ],
    "deny": [
      "fictional",
      "commercial",
      "cartoon",
      "gameplay",
      "reaction",
      "lyrics video",
      "fan edit"
    ]
  },
  "freedom-stories": {
    "name": "Freedom Stories",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "civil rights documentary",
      "social movement history film",
      "human rights archive",
      "labor movement documentary",
      "voting rights history"
    ],
    "match": [
      "civil rights",
      "social movement",
      "human rights",
      "labor movement",
      "voting rights",
      "freedom struggle",
      "activism history"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "campaign ad",
      "conspiracy",
      "opinion vlog"
    ]
  },
  "black-stage": {
    "name": "Black Stage",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeFallbackQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "intent": "performance",
    "formatRelaxed": true,
    "strictTopicTerms": [
      "black theatre",
      "black theater",
      "african american",
      "black arts",
      "soul performance",
      "black comedy",
      "black performance",
      "black stage"
    ],
    "topics": [
      "Black theatre",
      "Black theater",
      "African American",
      "Black arts",
      "Black comedy",
      "Black dance",
      "soul performance",
      "stage play",
      "dance performance",
      "live performance"
    ],
    "formats": [
      "full performance",
      "complete performance",
      "full show",
      "complete show",
      "full episode",
      "live performance",
      "full concert"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "Black theatre full play",
      "Black theater complete performance",
      "African American stage play full",
      "African American theatre full performance",
      "Black comedy full performance",
      "Black dance full performance",
      "soul performance full concert",
      "Black arts full program",
      "African American music performance full",
      "Black television performance full episode",
      "Black stage play complete",
      "Black live performance full show",
      "African American dance full performance",
      "Black performance archive full"
    ],
    "match": [
      "Black theatre",
      "Black theater",
      "African American",
      "Black arts",
      "Black comedy",
      "Black dance",
      "soul performance",
      "stage play",
      "dance performance",
      "live performance",
      "Black performance"
    ],
    "deny": [
      "fictional",
      "commercial",
      "cartoon",
      "gameplay",
      "reaction",
      "fan edit",
      "lyrics video",
      "a black comedy",
      "audiobook",
      "unabridged",
      "chapter",
      "harry potter",
      "fantasy",
      "horror",
      "monster movie",
      "full movie",
      "podcast",
      "retro movie archive",
      "hammer films",
      "nursery theatre",
      "happily never after",
      "tim burton",
      "lemony snicket",
      "brothers grimm",
      "klaus schulze",
      "electronic music",
      "synthesizer",
      "discography",
      "album"
    ]
  },
  "documentary-desk": {
    "name": "Documentary Desk",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "public media documentary",
      "investigative documentary film",
      "science documentary television",
      "history documentary program",
      "independent documentary"
    ],
    "match": [
      "public media documentary",
      "investigative documentary",
      "science documentary",
      "history documentary",
      "independent documentary",
      "documentary film"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "oil exploration",
      "petroleum",
      "drilling",
      "abu dhabi",
      "calculated risk",
      "corporate training",
      "trailer",
      "reaction",
      "vlog"
    ]
  },
  "invention-files": {
    "name": "The Invention Files",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "invention history documentary",
      "patent history film",
      "industrial design history",
      "engineering inventions documentary",
      "technology history film"
    ],
    "match": [
      "invention",
      "patent",
      "industrial design",
      "engineering history",
      "technology history",
      "inventor"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "unboxing",
      "influencer",
      "affiliate"
    ]
  },
  "blueprint": {
    "name": "The Blueprint",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "architecture documentary",
      "architectural history film",
      "building design documentary",
      "modern architecture history",
      "urban design film"
    ],
    "match": [
      "architecture",
      "architectural history",
      "building design",
      "architect",
      "urban design",
      "built environment"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "real estate ad",
      "house tour",
      "luxury home"
    ]
  },
  "rail-archive": {
    "name": "Rail Archive",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "railway history documentary",
      "locomotive history film",
      "railroad engineering documentary",
      "train journey history",
      "railway preservation film"
    ],
    "match": [
      "railway",
      "railroad",
      "locomotive",
      "rail transport",
      "railway preservation",
      "train history"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "model train",
      "train simulator",
      "railfan vlog"
    ]
  },
  "flight-deck": {
    "name": "Flight Deck",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "aviation history documentary",
      "aircraft engineering film",
      "airline history documentary",
      "airport history film",
      "aviation museum documentary"
    ],
    "match": [
      "aviation history",
      "aircraft",
      "airline history",
      "airport history",
      "flight engineering",
      "aviation museum"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "flight simulator",
      "airshow vlog",
      "airline ad",
      "software",
      "programming",
      "coding",
      "lisp",
      "developer",
      "foss4ge",
      "open source software",
      "airport data",
      "data conference",
      "sleep documentary",
      "things you might not know",
      "vlog",
      "preupload"
    ]
  },
  "ocean-desk": {
    "name": "Ocean Desk",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "oceanography documentary",
      "marine science film",
      "underwater exploration documentary",
      "ocean conservation film",
      "deep sea research documentary"
    ],
    "match": [
      "oceanography",
      "marine science",
      "underwater exploration",
      "ocean conservation",
      "deep sea research",
      "marine biology"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "fishing show",
      "fishing vlog",
      "cruise advertisement"
    ]
  },
  "garden-ledger": {
    "name": "Garden Ledger",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 6,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://spectra.video"],
    "peerTubeQueries": [
      "garden restoration documentary",
      "gardening history film",
      "plant conservation documentary",
      "public garden tour documentary",
      "botanical garden documentary",
      "horticulture documentary full",
      "gardening full documentary",
      "horticulture full program",
      "botanical garden full documentary",
      "landscape gardening full program",
      "plant cultivation documentary",
      "community garden documentary",
      "gardening",
      "permaculture full documentary",
      "regenerative farming documentary",
      "pollinator garden documentary",
      "organic farming documentary",
      "vegetable gardening full documentary",
      "seed saving documentary",
      "greenhouse gardening documentary",
      "soil health documentary",
      "homestead gardening documentary",
      "community garden full program",
      "permaculture farm documentary"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "strictTopicTerms": [
      "gardening",
      "gardener",
      "horticulture",
      "botanical",
      "permaculture",
      "pollinator",
      "food forest",
      "soil health",
      "garden design",
      "garden tour",
      "plant cultivation",
      "plant conservation",
      "landscape gardening",
      "community garden",
      "farm",
      "farmer",
      "homestead",
      "greenhouse",
      "vegetable",
      "organic farming",
      "seed saving",
      "compost",
      "soil",
      "crop",
      "homesteading",
      "agroecology",
      "food production"
    ],
    "queries": [
      "horticulture documentary full",
      "botanical garden documentary",
      "garden history documentary",
      "landscape design documentary",
      "plant science documentary",
      "botany documentary full",
      "garden design documentary",
      "public garden tour documentary",
      "arboretum documentary",
      "gardening history film",
      "plant cultivation documentary",
      "landscape architecture garden documentary",
      "garden restoration documentary",
      "gardening full documentary",
      "permaculture full documentary",
      "regenerative farming documentary",
      "organic farming documentary",
      "vegetable gardening full documentary",
      "seed saving documentary",
      "greenhouse gardening documentary",
      "soil health documentary",
      "homestead gardening documentary",
      "community garden full program",
      "permaculture farm documentary"
    ],
    "match": [
      "horticulture",
      "gardening",
      "botanical",
      "botany",
      "plant science",
      "landscape design",
      "landscape architecture",
      "arboretum",
      "garden history",
      "garden restoration",
      "garden design",
      "plant cultivation",
      "plant conservation",
      "public garden",
      "permaculture",
      "regenerative farming",
      "pollinator garden",
      "food forest",
      "soil health",
      "greenhouse",
      "vegetable",
      "organic farming",
      "seed saving",
      "compost",
      "soil",
      "crop",
      "homesteading",
      "agroecology",
      "food production"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "strange horticulture",
      "gaming",
      "video game",
      "let's play",
      "walkthrough",
      "game stream",
      "twitch",
      "podcast",
      "linux",
      "debian",
      "system administration",
      "software conference",
      "conference",
      "summit",
      "webinar",
      "lecture",
      "airborne",
      "army",
      "military",
      "war footage",
      "product review",
      "influencer",
      "affiliate",
      "diecast",
      "majorette",
      "toy restoration",
      "model car",
      "logging truck",
      "truck restoration",
      "walled garden",
      "digital painting",
      "time lapse",
      "garden statues",
      "garden hustle",
      "france is a garden",
      "horse meat",
      "horsemeat",
      "horse slaughter",
      "horse racing",
      "horse show",
      "animal slaughter",
      "meat processing",
      "livestock",
      "animal husbandry",
      "hunting",
      "fishing"
    ]
  },
  "animal-care": {
    "name": "Animal Care",
    "queryLimit": 12,
    "queryWindow": 6,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "veterinary documentary",
      "animal behavior research film",
      "wildlife rehabilitation documentary",
      "zoo history film",
      "animal welfare documentary",
      "veterinary hospital documentary",
      "animal rescue full documentary",
      "wildlife conservation film",
      "zoo documentary full",
      "animal science documentary",
      "veterinary medicine full film"
    ],
    "match": [
      "veterinary",
      "animal",
      "wildlife",
      "animal behavior",
      "wildlife rehabilitation",
      "zoology",
      "zoo",
      "animal welfare",
      "animal care",
      "conservation"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "team presentation",
      "judging session",
      "conference",
      "pet influencer",
      "pet prank",
      "hunting show"
    ]
  },
  "food-lab": {
    "name": "The Food Lab",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "food science documentary",
      "food processing history film",
      "agricultural food systems documentary",
      "food safety film",
      "fermentation science documentary"
    ],
    "match": [
      "food science",
      "food processing",
      "food systems",
      "food safety",
      "fermentation",
      "agricultural science"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "recipe",
      "cooking tutorial",
      "unboxing",
      "restaurant review"
    ]
  },
  "language-lab": {
    "name": "Language Lab",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "linguistics documentary",
      "language history film",
      "writing systems documentary",
      "endangered languages film",
      "translation history documentary"
    ],
    "match": [
      "linguistics",
      "language history",
      "writing system",
      "endangered language",
      "translation history",
      "phonetics"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "language lesson",
      "language learning vlog",
      "podcast"
    ]
  },
  "legal-record": {
    "name": "The Legal Record",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "legal history documentary",
      "courtroom history film",
      "law and justice documentary",
      "constitutional history film",
      "legal education documentary"
    ],
    "match": [
      "legal history",
      "courtroom history",
      "law and justice",
      "constitutional history",
      "legal education",
      "jurisprudence"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "true crime",
      "crime vlog",
      "reaction",
      "court tv clip"
    ]
  },
  "earth-lab": {
    "name": "Earth Lab",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "geology documentary",
      "volcanology film",
      "paleontology documentary",
      "earth science history film",
      "mineral science documentary"
    ],
    "match": [
      "geology",
      "volcanology",
      "paleontology",
      "earth science",
      "mineral science",
      "seismology"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "flat earth",
      "conspiracy",
      "storm chaser"
    ]
  },
  "textile-archive": {
    "name": "Textile Archive",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "textile history documentary",
      "weaving history film",
      "fashion construction documentary",
      "garment industry history",
      "fiber arts documentary"
    ],
    "match": [
      "textile history",
      "weaving",
      "fashion history",
      "garment industry",
      "fiber arts",
      "fabric history"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "fashion haul",
      "unboxing",
      "influencer",
      "affiliate"
    ]
  },
  "stage-door": {
    "name": "Stage Door",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 4,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 12,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org"],
    "peerTubeQueries": [
      "complete theatre performance",
      "full Broadway musical",
      "complete musical performance",
      "full opera performance",
      "ballet full performance",
      "full stage production"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "intent": "performance",
    "formatRelaxed": true,
    "topics": ["stage play", "play", "theatre", "theater", "theatre performance", "dance theatre", "live theatre", "ballet", "opera", "musical"],
    "formats": ["full performance", "complete performance", "full play", "complete play", "full show", "full musical", "full production", "full-length play", "entire performance", "complete opera", "full ballet"],
    "queries": ["stage play full performance", "theatre full play", "complete theatre performance", "dance theatre full performance", "live theatre complete show", "classic stage play full", "ballet full performance", "stage musical full performance", "public domain stage play full", "full Broadway musical", "complete opera performance", "full stage production", "full theatre performance archive", "complete musical performance", "full opera performance", "full dance theatre performance"],
    "match": ["stage play", "play", "theatre", "theater", "theatre performance", "dance theatre", "live theatre", "ballet", "opera", "musical", "full performance", "complete play"],
    "deny": [
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "reaction",
      "fan edit",
      "lyrics video"
    ]
  },
  "print-shop": {
    "name": "The Print Shop",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 2,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 12,
    "peerTubeFallbackQueryWindow": 2,
    "peerTubeInstances": ["https://search.joinpeertube.org"],
    "peerTubeQueries": [
      "printing history documentary",
      "publishing history documentary",
      "typesetting film",
      "newspaper printing film",
      "printing press documentary full",
      "bookbinding film full",
      "printmaking documentary full"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "printing history documentary",
      "typography history film",
      "publishing history documentary",
      "book arts film",
      "letterpress documentary",
      "letterpress full documentary",
      "printing factory documentary",
      "bookbinding documentary",
      "typesetting film",
      "newspaper printing film",
      "printing press documentary full",
      "industrial printing documentary",
      "bookbinding film full",
      "newspaper press documentary",
      "typefounding documentary",
      "printmaking documentary full"
    ],
    "match": [
      "printing history",
      "printing",
      "typography",
      "publishing",
      "publishing history",
      "book arts",
      "letterpress",
      "printmaking",
      "bookbinding",
      "typesetting",
      "newspaper printing"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "demo",
      "hands-on",
      "design tokens",
      "tutorial",
      "course",
      "workshop",
      "unboxing",
      "influencer",
      "affiliate"
    ]
  },
  "memory-bank": {
    "name": "Memory Bank",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "peerTubeQueries": [
      "personal archives film",
      "personal archive documentary",
      "oral history documentary",
      "community history film",
      "life story documentary full",
      "oral history full interview",
      "community oral history full",
      "family history documentary full",
      "memoir film full",
      "first person documentary full",
      "community memory project full",
      "veteran oral history full"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "oral history documentary",
      "community history film",
      "memoir documentary",
      "personal archives film",
      "public history documentary",
      "oral history full documentary",
      "personal history film",
      "community voices documentary",
      "oral history full interview",
      "first person history documentary",
      "community oral history full",
      "personal archive documentary",
      "life story documentary full",
      "local history oral history",
      "oral history program full",
      "life story interview documentary full",
      "family history documentary full",
      "memoir film full",
      "first person documentary full",
      "community memory project full",
      "veteran oral history full",
      "immigrant oral history full",
      "personal documentary full"
    ],
    "match": [
      "oral history",
      "community history",
      "memoir",
      "personal archive",
      "public history",
      "memory archive",
      "life story",
      "community voices",
      "interview",
      "family history",
      "autobiography",
      "personal story",
      "first person",
      "testimony",
      "community memory"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "reaction",
      "vlog",
      "opinion",
      "debate",
      "commentary",
      "political campaign",
      "news panel"
    ]
  },
  "cartoon-time-machine": {
    "name": "Cartoon Time Machine",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "classic cartoons full episodes",
      "Saturday morning cartoons full episodes",
      "90s animated series full episodes",
      "1980s animated series full episodes",
      "theatrical cartoons full compilation",
      "public domain cartoons full episodes",
      "animated feature film full",
      "cartoon television special full"
    ],
    "match": [
      "cartoon",
      "cartoons",
      "animated",
      "animation",
      "saturday morning",
      "animated series",
      "animated film",
      "cartoon compilation"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "gameplay",
      "reaction",
      "fan edit",
      "shorts",
      "anime opening",
      "lyrics video",
      "educational",
      "education",
      "instructional",
      "informational",
      "public service announcement",
      "psa",
      "safety film",
      "training",
      "classroom",
      "documentary",
      "lecture",
      "studio history",
      "animation history",
      "fan film",
      "fan-made",
      "parody",
      "game movie",
      "software",
      "blender",
      "code quest",
      "programming",
      "coding",
      "tutorial",
      "how to",
      "seminar",
      "lecture",
      "explained",
      "industrial film",
      "sponsored film",
      "shell oil",
      "gasoline",
      "oil field",
      "chamber of commerce",
      "post-wwii prosperity",
      "for better performance"
    ]
  },
  "movie-house": {
    "name": "Movie House",
    "fallbackProfiles": ["indie-feature-house", "horror-house", "sci-fi-signal", "western-screen", "film-noir-desk"],
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 6,
    "peerTubeDetailLimit": 16,
    "peerTubeFallbackQueryWindow": 6,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://video.blender.org", "https://framatube.org", "https://peertube.uno", "https://tilvids.com", "https://peertube.doesstuff.social", "https://peertube.dngr.us"],
    "providers": ["peertube", "youtube"],
    "intent": "film",
    "minTitleYear": 1980,
    "topics": ["feature film", "full movie", "full-length film", "independent film", "public domain film", "movie", "film"],
    "formats": ["full movie", "full film", "feature film", "complete movie", "full-length movie", "complete feature film", "public domain movie", "feature movie"],
    "queries": [
      "full feature film 1980s", "full feature film 1990s", "full feature film 2000s",
      "full feature film 2010s", "full feature film 2020s", "independent feature film full",
      "public domain feature film full", "free movie full length", "classic movie full",
      "cult movie full", "action movie full", "horror movie full", "sci-fi movie full",
      "western movie full", "comedy movie full", "romance movie full"
    ],
    "match": ["feature film", "feature movie", "full movie", "full length film", "independent film", "indie film", "public domain film", "complete movie", "movie", "film"],
    "deny": ["shorts", "short film", "vertical", "trailer", "teaser", "clip", "recap", "review", "reaction", "podcast", "how to", "tutorial", "fan film", "fan-made", "fan made", "fanmade", "fan animation", "unofficial", "parody", "mashup", "amv", "gacha", "roleplay", "my little pony", "pony", "music video", "commercial", "documentary", "film history", "film preservation", "movie commentary", "film explained", "lecture", "seminar", "conference", "panel discussion", "making of", "movie making", "filmmaking", "film making", "behind the scenes", "studio tour", "educational film", "retrospective"]
  },
  "modern-free-cinema": {
    "name": "Modern Free Cinema",
    "queryLimit": 16,
    "queryWindow": 10,
    "peerTubeQueryWindow": 10,
    "peerTubeInstanceLimit": 6,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 10,
    "deepCatalog": true,
    "youtubeSearchOnViewer": false,
    "youtubeSearchOnMaintenance": false,
    "youtubeChannelDiscoveryOnMaintenance": false,
    "youtubeSearchPageWindow": 2,
    "youtubeChannelWindow": 6,
    "youtubeChannelPageWindow": 3,
    "youtubeChannelHandles": ["@FilmRiseMovies", "@MovieCentral", "@Popcornflix", "UC8IHAQMuiJdY6ALuhG7iU8Q", "UCVFYikepF-avelvuIaQ_lHA", "UCGBzBkV-MinlBvHBzZawfLQ", "UCfyNImm1H16YKz71j08BDFA"],
    "youtubeDiscoveryWindow": 5,
    "youtubeDiscoveredChannelWindow": 8,
    "youtubeDiscoveryQueries": ["official full movies", "free full length movies", "full feature films official", "movie channel full films", "legally free movies"],
    "youtubeChannelRequired": ["movie", "movies", "film", "films", "cinema", "filmrise", "popcornflix"],
    "youtubeChannelIdentityRequired": ["movie", "movies", "film", "films", "cinema", "filmrise", "popcornflix", "central"],
    "youtubeChannelDeny": ["shorts", "clips", "podcast", "reaction", "review", "fan", "parody", "gaming", "kids", "trailer", "indie", "independent", "arthouse", "festival"],
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://video.blender.org", "https://framatube.org", "https://peertube.uno", "https://tilvids.com", "https://peertube.doesstuff.social", "https://peertube.dngr.us"],
    "providers": ["peertube", "youtube"],
    "intent": "film",
    "minTitleYear": 1980,
    "minContentYear": 1980,
    "movieLane": "modern",
    "laneDeny": ["independent", "indie", "arthouse", "festival", "student film", "cult", "microbudget", "micro-budget", "no budget", "no-budget", "underground film", "gothic horror", "midnight screening", "film sales company", "indie rights"],
    "topics": ["feature film", "full movie", "independent film", "public domain film", "modern cinema", "movie", "film"],
    "formats": ["full movie", "full film", "feature film", "complete movie", "full-length movie", "complete feature film", "public domain movie", "feature movie"],
    "queries": [
      "full feature film 1980s", "full feature film 1990s", "full feature film 2000s",
      "full feature film 2010s", "full feature film 2020s", "free full movie 1980s",
      "free full movie 1990s", "free full movie 2000s", "free full movie 2010s",
      "free full movie 2020s", "full-length feature film drama", "full-length feature film thriller",
      "full-length feature film comedy", "full-length feature film action", "complete feature film English",
      "modern cinema feature film", "feature film full movie official", "full movie landscape", "movie"
    ],
    "match": ["feature film", "feature movie", "full movie", "full length film", "independent film", "indie film", "public domain film", "modern cinema", "complete movie", "landscape feature", "movie", "film"],
    "deny": ["shorts", "short film", "vertical", "trailer", "teaser", "clip", "recap", "review", "reaction", "podcast", "how to", "tutorial", "fan film", "fan-made", "fan made", "fanmade", "fan animation", "unofficial", "parody", "mashup", "amv", "gacha", "roleplay", "my little pony", "pony", "music video", "commercial", "movie commentary", "documentary", "film explained"]
  },
  "indie-feature-house": {
    "name": "Indie Feature House",
    "queryLimit": 16,
    "queryWindow": 10,
    "peerTubeQueryWindow": 10,
    "peerTubeInstanceLimit": 6,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 10,
    "deepCatalog": true,
    "youtubeSearchOnViewer": false,
    "youtubeSearchOnMaintenance": false,
    "youtubeChannelDiscoveryOnMaintenance": false,
    "youtubeSearchPageWindow": 2,
    "youtubeChannelWindow": 6,
    "youtubeChannelPageWindow": 3,
    "youtubeChannelHandles": ["@TheFilmSalesCompany", "@themidnightscreening", "UCJuyiB0GT9-q92gC_M3XLpg", "UCX1nchEcBshItKBeJvH-YMw", "@KingsOfHorror"],
    "youtubeDiscoveryWindow": 5,
    "youtubeDiscoveredChannelWindow": 8,
    "youtubeDiscoveryQueries": ["official independent films", "full independent movies", "arthouse films full", "film festival feature films", "microbudget movies full"],
    "youtubeChannelRequired": ["film", "films", "movie", "movies", "cinema", "indie", "independent", "arthouse", "festival", "screening"],
    "youtubeChannelIdentityRequired": ["film", "films", "movie", "movies", "cinema", "indie", "independent", "arthouse", "festival", "screening"],
    "youtubeChannelDeny": ["shorts", "clips", "podcast", "reaction", "review", "fan", "parody", "gaming", "kids", "trailer"],
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://video.blender.org", "https://framatube.org", "https://peertube.uno", "https://tilvids.com", "https://peertube.doesstuff.social", "https://peertube.dngr.us"],
    "providers": ["peertube", "youtube"],
    "intent": "film",
    "minTitleYear": 1980,
    "minContentYear": 1980,
    "movieLane": "indie",
    "laneRequired": ["independent", "indie", "arthouse", "art house", "festival", "film festival", "cult", "public domain", "microbudget", "micro-budget", "no budget", "no-budget", "free movie", "free feature", "alternative cinema", "underground film", "experimental film"],
    "topics": ["independent feature film", "independent movie", "indie feature", "festival feature", "arthouse feature", "public domain movie", "movie", "film"],
    "formats": ["full movie", "full film", "feature film", "complete movie", "full-length movie", "complete feature film", "public domain movie", "feature movie"],
    "queries": [
      "independent feature film 1980s full", "independent feature film 1990s full", "independent feature film 2000s full",
      "independent feature film 2010s full", "independent feature film 2020s full", "indie feature film full length",
      "arthouse feature film full movie", "festival feature film full", "microbudget feature film full",
      "cult independent feature full movie", "public domain independent feature", "free independent feature film",
      "independent cinema full film", "no budget feature film full", "underground feature film full",
      "experimental feature film full", "alternative cinema feature film", "full length independent movie", "movie"
    ],
    "match": ["independent feature film", "independent movie", "indie feature", "festival feature", "arthouse feature", "public domain movie", "free feature film", "cult independent film", "full length movie", "complete feature film", "movie", "film"],
    "deny": ["shorts", "short film", "vertical", "trailer", "teaser", "clip", "recap", "review", "reaction", "podcast", "how to", "tutorial", "fan film", "fan-made", "fan made", "fanmade", "fan animation", "unofficial", "parody", "mashup", "amv", "gacha", "roleplay", "my little pony", "pony", "music video", "commercial", "movie commentary", "documentary", "film explained", "filmrise", "popcornflix", "movie central"]
  },
  "ok-movie-channel": {
    "name": "OK Movie Channel",
    "queryLimit": 32,
    "queryWindow": 10,
     "providers": ["ok-api", "ok-sitemap", "ok-manifest"],
    "intent": "film",
    "serverOnly": true,
    "minTitleYear": 1980,
    "minRuntimeSeconds": 3600,
    "movieLane": "modern",
    "deepCatalog": true,
    "okApiQueries": ["yts", "yts.am", "yify", "yts 1080p", "yts bluray", "4k", "2160p", "1080p", "bdrip", "blu-ray", "bluray", "dvdrip", "dvd rip", "vhsrip", "vhs rip", "fullmovie"],
    "okApiTitleQueries": ["batman", "batmanandrobin", "tombstone", "godfather", "scarface", "goodfellas", "shawshankredemption", "pulpfiction", "matrix", "jurassicpark", "backtothefuture", "diehard", "terminator", "aliens", "predator", "rocky", "rambo", "topgun", "bluesbrothers", "goonies", "breakfastclub", "lostboys", "heat", "casino", "se7en", "fightclub", "greenmile", "departed", "darkknight", "inception", "interstellar", "johnwick"],
    "okApiTitleQualifiers": ["1080p", "4k", "bdrip", "blu-ray", "dvdrip", "vhs rip", "yts"],
    "okApiBroadQueries": ["movie", "film", "feature", "cinema", "hollywood", "american movie", "classic movie", "action movie", "western movie", "comedy movie", "drama movie", "horror movie", "thriller movie", "science fiction movie", "english movie", "full length movie"],
    "topics": ["feature film", "full movie", "movie", "film"],
    "formats": ["full movie", "full film", "feature film", "complete movie", "full-length movie"],
    "titleRequiredTerms": ["4k", "2160p", "1080p", "bdrip", "blu-ray", "bluray", "dvd rip", "dvdrip", "vhs rip", "vhsrip", "yts", "yts.am", "yify"],
    "formatRelaxed": true,
    "queries": ["4k full movie", "1080p full movie", "blu-ray movie", "dvd rip movie", "vhs rip movie", "full movie 1980s", "full movie 1990s", "full movie 2000s", "full movie 2010s", "full movie 2020s", "english movie 1080p", "american movie 1080p"],
    "match": ["feature film", "full movie", "full-length movie", "complete movie", "movie", "film"],
    "deny": ["shorts", "short film", "vertical", "trailer", "teaser", "clip", "recap", "review", "reaction", "podcast", "how to", "tutorial", "fan film", "fan-made", "fan made", "fanmade", "fan animation", "unofficial", "parody", "mashup", "amv", "gacha", "roleplay", "my little pony", "pony", "music video", "commercial", "documentary", "film history", "film explained", "lecture", "seminar", "conference", "panel discussion", "tv series", "television series", "season", "episode"]
  },
  "ok-tv-channel": {
    "name": "OK TV Channel",
    "queryLimit": 32,
    "queryWindow": 10,
     "providers": ["ok-api", "ok-sitemap", "ok-manifest"],
    "intent": "television",
    "serverOnly": true,
    "minRuntimeSeconds": 900,
    "deepCatalog": true,
    "okApiQueries": ["yts", "yify", "4k", "2160p", "1080p", "bdrip", "blu-ray", "dvdrip", "dvd rip", "vhsrip", "full episode", "tv series", "english television", "american television", "english series", "sitcom"],
    "okApiTitleQueries": ["bonanza", "andygriffith", "beverlyhillbillies", "ilovelucy", "twilightzone", "mash", "cheers", "taxi", "ateam", "miamivice", "knightrider", "macgyver", "xfiles", "seinfeld", "friends", "sopranos", "thewire", "breakingbad", "theoffice", "parksandrecreation", "simpsons", "lawandorder", "murderwrote", "columbo", "gunsmoke", "perrymason", "dickvandyke", "marytylermoore", "gilligansisland", "dallas", "dynasty", "rockfordfiles"],
    "okApiTitleQualifiers": ["1080p", "4k", "bdrip", "blu-ray", "dvdrip", "vhs rip", "yts"],
    "okApiBroadQueries": ["television", "tv show", "tv series", "full episode", "classic television", "classic tv", "american television", "english television", "english series", "sitcom", "drama series", "comedy series", "western television", "crime series", "public domain television", "complete episode"],
    "topics": ["television", "tv", "tv show", "tv series", "show", "episode", "ep", "season", "series", "serial", "sitcom", "drama", "comedy", "program"],
    "formats": ["full episode", "complete episode", "full series", "tv show", "television episode"],
    "formatRelaxed": true,
    "titleRequiredTerms": ["4k", "2160p", "1080p", "bdrip", "blu-ray", "bluray", "dvd rip", "dvdrip", "vhs rip", "vhsrip", "yts", "yts.am", "yify"],
    "queries": ["yts tv show", "yify full episode", "4k tv show", "1080p tv episode", "blu-ray tv series", "dvd rip tv show", "vhs rip television", "english tv show", "english television", "full episode english", "american tv series", "classic english television", "public domain tv", "television 1980s", "television 1990s"],
    "match": ["television", "tv show", "tv series", "show", "full episode", "complete episode", "episode", "ep", "sitcom", "series", "serial", "program"],
    "deny": ["shorts", "short film", "vertical", "trailer", "teaser", "clip", "recap", "review", "reaction", "podcast", "how to", "tutorial", "fan film", "fan-made", "fan made", "fanmade", "fan animation", "unofficial", "parody", "mashup", "amv", "gacha", "roleplay", "my little pony", "pony", "music video", "commercial", "cartoon", "gameplay", "lecture", "seminar", "conference", "panel discussion", "full movie", "full film", "feature film", "complete movie", "movie", "cinema", "film", "anime", "donghua", "manhua", "manhwa", "xianxia", "wuxia", "cultivation", "k-drama", "korean drama", "telenovela"]
  },
  "vimeo-movie-channel": {
    "name": "Vimeo Movie Channel",
    "queryLimit": 8,
    "queryWindow": 4,
    "providers": ["vimeo"],
    "intent": "film",
    "serverOnly": true,
    "minTitleYear": 1980,
    "movieLane": "modern",
    "topics": ["feature film", "full movie", "movie", "film", "cinema"],
    "formats": ["full movie", "full film", "feature film", "complete movie", "full-length movie"],
    "queries": ["full feature film 1980s", "full feature film 1990s", "full feature film 2000s", "full feature film 2010s", "full feature film 2020s", "independent feature film full", "public domain feature film", "full movie English"],
    "match": ["feature film", "feature movie", "full movie", "full length film", "independent film", "public domain film", "complete movie", "movie", "film"],
    "deny": ["shorts", "short film", "vertical", "trailer", "teaser", "clip", "recap", "review", "reaction", "podcast", "how to", "tutorial", "fan film", "fan-made", "fan made", "fanmade", "unofficial", "parody", "mashup", "music video", "commercial", "documentary", "film history", "film explained", "lecture", "seminar", "conference", "panel discussion", "making of", "behind the scenes"]
  },
  "vimeo-tv-channel": {
    "name": "Vimeo TV Channel",
    "queryLimit": 8,
    "queryWindow": 4,
    "providers": ["vimeo"],
    "intent": "television",
    "serverOnly": true,
    "topics": ["television", "tv show", "tv series", "episode", "sitcom", "drama", "documentary series"],
    "formats": ["full episode", "complete episode", "episode", "ep", "full series", "tv show", "television episode", "season", "series"],
    "queries": ["full television episode 1980s", "full television episode 1990s", "full television episode 2000s", "full television episode 2010s", "full television episode 2020s", "full tv series episode", "complete tv show episode", "television program full episode"],
    "match": ["television", "tv show", "tv series", "full episode", "complete episode", "sitcom", "series", "television program"],
    "deny": ["shorts", "short film", "vertical", "trailer", "teaser", "clip", "recap", "review", "reaction", "podcast", "how to", "tutorial", "fan film", "fan-made", "parody", "music video", "commercial", "cartoon", "gameplay", "lecture", "seminar", "conference", "panel discussion", "making of", "behind the scenes"]
  },
  "tv-time-machine": {
    "name": "TV Time Machine",
    "queryLimit": 12,
    "queryWindow": 6,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "television history documentary",
      "broadcast television archive",
      "classic TV history film",
      "television production documentary",
      "TV network history",
      "classic television program full episode",
      "broadcast archive full program",
      "television interview archive full",
      "old tv program full",
      "public domain television full episode",
      "tv archive full show",
      "television program archive full"
    ],
    "match": [
      "television",
      "broadcast television",
      "classic tv",
      "classic tv history",
      "television production",
      "tv network",
      "television archive",
      "tv program",
      "tv show",
      "broadcast archive"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "reaction",
      "episode recap",
      "fan edit",
      "shorts"
    ]
  },
  "cooks-table": {
    "name": "The Cook's Table",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "cooking show archive",
      "cooking show full episode",
      "classic cooking television episode",
      "culinary history documentary",
      "recipe demonstration television",
      "food television program",
      "regional cooking program",
      "chef profile full episode"
    ],
    "match": [
      "cooking show",
      "cooking television",
      "classic cooking",
      "culinary history",
      "culinary television",
      "recipe demonstration",
      "regional cuisine",
      "chef profile",
      "food television",
      "food television program",
      "cooking archive"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "unboxing",
      "influencer",
      "affiliate",
      "restaurant review",
      "shorts"
    ]
  },
  "gearhead-garage": {
    "name": "Gearhead Garage",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "automotive history documentary",
      "car restoration documentary",
      "automotive engineering film",
      "motorsport history documentary",
      "classic car road test archive"
    ],
    "match": [
      "automotive history",
      "car restoration",
      "automotive engineering",
      "motorsport history",
      "classic car",
      "road test archive",
      "automobile history"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "unboxing",
      "influencer",
      "affiliate",
      "rental car ad",
      "shorts"
    ]
  },
  "green-culture": {
    "name": "Green Culture",
    "queryLimit": 12,
    "queryWindow": 6,
    "persistedMatch": ["cannabis", "marijuana", "hemp"],
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "cannabis culture full documentary",
      "marijuana history documentary",
      "cannabis history documentary",
      "cannabis science documentary",
      "cannabis policy documentary",
      "hemp history film",
      "medical cannabis history documentary",
      "cannabis social history film",
      "cannabis full film",
      "marijuana full documentary",
      "hemp documentary full",
      "cannabis culture full film",
      "marijuana policy full documentary",
      "cannabis medicine full documentary",
      "cannabis cultivation history documentary",
      "cannabis in america documentary",
      "cannabis history full documentary",
      "hemp culture full documentary",
      "cannabis science full documentary"
    ],
    "topics": ["cannabis", "marijuana", "hemp", "cannabis history", "marijuana history", "cannabis culture", "cannabis science", "cannabis policy"],
    "match": [
      "cannabis",
      "marijuana",
      "hemp",
      "cannabis history",
      "marijuana history",
      "marijuana culture",
      "cannabis culture",
      "cannabis policy",
      "cannabis botany",
      "cannabis medicine",
      "medical cannabis history",
      "cannabis science",
      "hemp history",
      "cannabis documentary"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "how to grow",
      "grow tent review",
      "seed vendor",
      "dispensary ad",
      "product review",
      "smoking challenge",
      "affiliate",
      "shorts",
      "comedy",
      "funniest",
      "top 20",
      "full movie",
      "movie explanation",
      "movie recap",
      "fictional"
    ]
  },
  "animation-desk": {
    "name": "Animation Desk",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "animation history documentary",
      "stop motion history film",
      "animated film production documentary",
      "animation studio history",
      "experimental animation archive",
      "animation festival documentary",
      "animator profile documentary",
      "hand drawn animation history"
    ],
    "match": [
      "animation history",
      "stop motion history",
      "animated film production",
      "animation studio history",
      "experimental animation",
      "animation archive",
      "animation festival",
      "animator profile",
      "hand drawn animation"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "gameplay",
      "reaction",
      "fan edit",
      "shorts",
      "anime opening",
      "lyrics video",
      "software",
      "blender",
      "code quest",
      "programming",
      "coding",
      "tutorial",
      "how to",
      "seminar",
      "lecture",
      "fan film",
      "fan-made",
      "parody"
    ]
  },
  "screen-test": {
    "name": "Screen Test",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 4,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 12,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org"],
    "peerTubeQueries": [
      "motion picture technology documentary",
      "film production documentary full",
      "film production history full documentary",
      "film camera documentary full",
      "movie editing documentary full",
      "documentary about filmmaking"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "cinematography documentary",
      "film editing history",
      "film studio history documentary",
      "production design cinema film",
      "documentary about filmmaking",
      "film production documentary full",
      "cinematography full documentary",
      "film editing documentary",
      "production design documentary",
      "camera film technology documentary",
      "film camera documentary full",
      "movie editing documentary full",
      "cinema technology documentary",
      "film production history full documentary",
      "movie studio documentary full",
      "motion picture technology documentary"
    ],
    "match": [
      "cinematography",
      "film editing",
      "film studio",
      "film studio history",
      "production design",
      "filmmaking",
      "film production",
      "camera technology",
      "movie making",
      "motion picture",
      "cinema"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "oil exploration",
      "petroleum",
      "drilling",
      "abu dhabi",
      "calculated risk",
      "corporate training",
      "trailer",
      "reaction",
      "movie recap",
      "fan edit",
      "shorts"
    ]
  },
  "classic-sitcom-room": {
    "name": "Classic Sitcom Room",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "intent": "television",
    "topics": ["classic sitcom", "sitcom episode", "television comedy", "comedy series"],
    "formats": ["full episode", "complete episode", "television episode", "tv show", "sitcom episode"],
    "queries": ["classic sitcom full episode", "vintage sitcom complete episode", "television comedy full episode", "classic TV comedy episode", "retro sitcom full show", "comedy series complete episode", "classic sitcom marathon", "public domain sitcom full episode"],
    "match": ["classic sitcom", "sitcom", "television comedy", "tv comedy", "comedy series", "full episode", "complete episode"],
    "deny": [
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "2026",
      "2025",
      "reaction",
      "episode recap",
      "fan edit",
      "shorts"
    ]
  },
  "film-noir-desk": {
    "name": "Film Noir Desk",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "film noir documentary",
      "film noir history",
      "detective cinema history",
      "black and white crime film history",
      "noir cinematography documentary"
    ],
    "match": [
      "film noir",
      "noir history",
      "detective cinema",
      "black and white crime film",
      "noir cinematography",
      "noir documentary"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "trailer",
      "reaction",
      "movie recap",
      "fan edit",
      "shorts"
    ]
  },
  "horror-house": {
    "name": "Horror House",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "intent": "film",
    "topics": ["horror movie", "horror film", "monster movie", "supernatural film"],
    "formats": ["full movie", "full film", "feature film", "complete movie", "movie marathon", "full western", "western full film", "full-length western", "complete western", "feature western"],
    "queries": ["classic horror full movie", "public domain horror full movie", "monster movie full movie", "vintage horror feature film", "supernatural horror full film", "classic creature feature full movie", "horror movie marathon", "horror double feature full"],
    "match": ["horror movie", "horror film", "monster movie", "creature feature", "supernatural horror", "full movie", "feature film"],
    "deny": [
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "monster inc",
      "commentary",
      "trailer",
      "reaction",
      "movie recap",
      "fan film",
      "shorts"
    ]
  },
  "western-screen": {
    "name": "Western Screen",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 4,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 12,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org"],
    "peerTubeQueries": [
      "western movie marathon",
      "frontier western feature film",
      "silent western full movie",
      "spaghetti western full movie",
      "classic western feature film",
      "western television movie full"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "intent": "film",
    "formatRelaxed": true,
    "topics": ["western movie", "western film", "western", "cowboy movie", "cowboy", "frontier film", "frontier", "spaghetti western", "silent western"],
    "formats": ["full movie", "full film", "feature film", "complete movie", "movie marathon", "full western", "western full film", "full-length western", "complete western", "feature western"],
    "queries": ["classic western full movie", "public domain western full movie", "cowboy movie full film", "frontier western feature film", "vintage western full movie", "western movie marathon", "classic cowboy film full", "western double feature full", "spaghetti western full movie", "silent western full movie", "classic western feature film", "western television movie full", "public domain cowboy movie full", "classic western feature film", "silent cowboy feature", "western double feature full movie"],
    "match": ["western movie", "western film", "western", "cowboy movie", "cowboy", "frontier western", "frontier", "full movie", "feature film"],
    "deny": [
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "trailer",
      "reaction",
      "movie recap",
      "fan film",
      "fan-made",
      "parody",
      "shorts",
      "navy",
      "fleet",
      "vietnam",
      "military",
      "travel vlog",
      "vlog",
      "music",
      "listening party",
      "event",
      "road trip",
      "panorama",
      "vacation"
    ]
  },
  "sci-fi-signal": {
    "name": "Sci-Fi Signal",
    "queryLimit": 12,
    "queryWindow": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "science fiction film history documentary",
      "classic sci-fi cinema",
      "science fiction television history",
      "space movie production documentary",
      "science fiction film preservation",
      "science fiction full movie",
      "classic sci fi full movie",
      "1950s sci fi full movie",
      "1960s sci fi full movie",
      "public domain sci fi full movie",
      "space opera full movie",
      "alien invasion full movie",
      "robot invasion full movie",
      "time travel full movie",
      "space adventure full movie",
      "science fiction serial full episode",
      "Space Patrol full episode",
      "Flash Gordon serial full episode",
      "Captain Video full episode"
    ],
    "match": [
      "science fiction film history",
      "classic sci-fi cinema",
      "science fiction television",
      "space movie production",
      "science fiction film preservation",
      "sci-fi cinema",
      "science fiction",
      "sci-fi",
      "sci fi",
      "space opera",
      "alien invasion",
      "robot invasion",
      "time travel",
      "space adventure",
      "space patrol",
      "flash gordon",
      "captain video"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "trailer",
      "reaction",
      "movie recap",
      "fan film",
      "shorts",
      "movie explanation",
      "story explained",
      "trailer compilation"
    ],
    "intent": "film",
    "formatRelaxed": true,
    "topics": [
      "science fiction",
      "sci-fi",
      "sci fi",
      "space movie",
      "science fiction television",
      "sci-fi cinema",
      "space opera",
      "alien invasion",
      "robot invasion",
      "time travel",
      "space adventure",
      "space patrol",
      "flash gordon",
      "captain video"
    ],
    "formats": [
      "full movie",
      "feature film",
      "full film",
      "complete film",
      "full episode",
      "complete episode"
    ]
  },
  "game-show-archive": {
    "name": "Game Show Archive",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "game show full episode",
      "classic game show full episode",
      "quiz show full episode",
      "television game show full episode",
      "game show rewind",
      "game show history documentary",
      "classic television game show",
      "quiz show television archive",
      "game show host retrospective",
      "television game show production"
    ],
    "match": [
      "game show",
      "quiz show",
      "full episode",
      "game show rewind",
      "price is right",
      "newlywed game",
      "family feud",
      "jeopardy",
      "wheel of fortune",
      "match game",
      "master minds",
      "trivia",
      "game show history",
      "classic television game show",
      "quiz show television",
      "game show host",
      "television game show production",
      "game show archive"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "video game",
      "esports",
      "reaction",
      "episode recap",
      "shorts"
    ]
  },
  "variety-hour": {
    "name": "Variety Hour",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 4,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 12,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org"],
    "peerTubeQueries": [
      "comedy variety show full episode",
      "complete variety show full episode",
      "vaudeville television full show",
      "1950s variety show full episode",
      "1960s variety show full episode",
      "1970s variety show full episode",
      "1980s variety show full episode",
      "The Ed Sullivan Show full episode",
      "The Jackie Gleason Show full episode",
      "The Dean Martin Show full episode",
      "Hollywood Palace full episode"
    ],
    "providers": [
      "peertube",
      "youtube"
    ],
    "intent": "performance",
    "formatRelaxed": false,
    "topics": ["variety show", "variety", "vaudeville", "stage revue", "revue", "television variety", "television show", "entertainment show"],
    "formats": ["full episode", "complete show", "full show", "variety special", "full performance", "full special", "complete variety", "full revue", "complete revue", "full program"],
    "queries": ["classic variety show full episode", "television variety complete show", "vaudeville television full show", "variety special full episode", "classic stage revue full performance", "music comedy variety show full", "variety show marathon", "television variety archive full episode", "family variety show full episode", "classic television special full show", "comedy variety show full episode", "international variety show full", "1950s variety show full episode", "1960s variety show full episode", "1970s variety show full episode", "1980s variety show full episode"],
    "match": ["variety show", "variety", "vaudeville", "stage revue", "revue", "television variety", "television show", "entertainment show", "full episode", "complete show"],
    "deny": [
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "reaction",
      "fan edit",
      "podcast",
      "shorts"
    ]
  },
  "talk-show-archive": {
    "name": "Talk Show Archive",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "intent": "performance",
    "topics": ["talk show", "television interview", "late night show", "celebrity interview"],
    "formats": ["full episode", "complete episode", "full interview", "complete show", "television interview"],
    "queries": ["classic talk show full episode", "television interview full episode", "late night show full episode", "celebrity interview complete show", "vintage talk show full", "classic interview program full episode", "talk show archive full episode", "late night interview full show"],
    "match": ["talk show", "television interview", "late night show", "celebrity interview", "full episode", "complete show"],
    "deny": [
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "antiques roadshow",
      "topradio",
      "podcast",
      "opinion vlog",
      "reaction",
      "shorts"
    ]
  },
  "travel-reel": {
    "name": "Travel Reel",
    "queryLimit": 12,
    "queryWindow": 6,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "travel film history documentary",
      "destination documentary film",
      "tourism film archive",
      "travel television history",
      "cultural travel documentary",
      "travel documentary full",
      "classic travel film",
      "world travel documentary full",
      "railway travel film",
      "national parks travel film"
    ],
    "match": [
      "travel",
      "travel film history",
      "destination documentary",
      "tourism film",
      "travel television",
      "cultural travel",
      "travel film archive",
      "national parks",
      "railway travel",
      "world travel",
      "exploration"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "influencer",
      "travel vlog",
      "hotel advertisement",
      "shorts"
    ]
  },
  "family-tv-club": {
    "name": "Family TV Club",
    "queryLimit": 8,
    "queryWindow": 6,
    "persistedRelaxed": true,
    "persistedMatch": ["full episode", "complete episode", "full show", "television program"],
    "providers": [
      "peertube",
      "youtube"
    ],
    "intent": "television",
    "topics": ["family television", "family sitcom", "family drama", "children's program", "children's television", "kids television", "educational kids show", "classic television", "television series", "tv show", "tv series"],
    "formats": ["full episode", "complete episode", "full show", "television program", "kids show"],
    "queries": ["family television full episode", "children's television complete episode", "classic family TV show full episode", "public television kids full episode", "kids television full show", "children's program complete episode", "educational kids show full episode", "classic kids TV full episode"],
    "match": ["family television", "family sitcom", "family drama", "children's television", "children's program", "kids television", "kids show", "full episode", "complete episode"],
    "deny": [
      "music video",
      "commercial",
      "gameplay",
      "horror",
      "prank",
      "reaction",
      "reality tv",
      "reality television",
      "reality",
      "dating show",
      "dating",
      "weight loss",
      "competition show",
      "competition",
      "flavor of love",
      "secret eaters",
      "pokemon",
      "backyardigans",
      "unboxing",
      "shorts"
    ]
  },
  "sports-film-room": {
    "name": "Sports Film Room",
    "queryLimit": 8,
    "providers": [
      "peertube",
      "youtube"
    ],
    "queries": [
      "sports documentary history",
      "athlete profile documentary",
      "sports television history",
      "baseball history film",
      "football history documentary"
    ],
    "match": [
      "sports documentary",
      "athlete profile",
      "sports television history",
      "baseball history",
      "football history",
      "sports film"
    ],
    "deny": [
      "fictional",
      "music video",
      "commercial",
      "cartoon",
      "gameplay",
      "esports",
      "sports betting",
      "reaction",
      "how to",
      "shorts"
    ]
  },
  "jukebox-television": {
    "name": "Jukebox Television",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 4,
    "peerTubeInstanceLimit": 1,
    "peerTubeDetailLimit": 12,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org"],
    "peerTubeQueries": [
      "music variety show complete episode",
      "live band full concert",
      "concert television full episode",
      "Soul Train full episode",
      "Don Kirshner's Rock Concert full episode",
      "The Midnight Special full episode",
      "Austin City Limits full episode",
      "music documentary full",
      "public domain music program",
      "music history documentary full",
      "live music full performance"
    ],
    "persistedRelaxed": true,
    "persistedMatch": ["concert", "live music", "music television", "music documentary"],
    "providers": [
      "peertube",
      "youtube"
    ],
    "intent": "performance",
    "formatRelaxed": true,
    "topics": ["music performance", "performance", "concert", "music television", "live band", "music program", "music special"],
    "formats": ["full concert", "full performance", "complete show", "live set", "live music", "full episode"],
    "queries": ["music television full episode", "classic concert full performance", "live band full concert", "music variety show complete episode", "television music special full", "classic live performance full show", "concert television full episode", "music program full performance", "MTV unplugged full episode", "Austin City Limits full episode", "concert film full", "music documentary full", "The Midnight Special full episode", "Don Kirshner's Rock Concert full episode", "Soul Train full episode", "Top of the Pops full episode"],
    "match": ["music performance", "performance", "concert", "live band", "music", "music television", "music variety show", "music program", "music special", "music history", "soundtrack"],
    "deny": [
      "commercial",
      "cartoon",
      "gameplay",
      "reaction",
      "lyrics video",
      "fan edit",
      "shorts"
    ]
  },
  "holiday-movie-house": {
    "name": "Holiday Movie House",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "providers": ["peertube", "youtube"],
    "intent": "film",
    "queries": [
      "holiday movie full",
      "christmas movie full",
      "halloween movie full",
      "thanksgiving movie full",
      "holiday television movie full",
      "public domain holiday feature",
      "classic holiday film full",
      "seasonal movie marathon",
      "winter holiday movie full",
      "holiday family film full",
      "holiday horror feature full",
      "holiday romance movie full"
    ],
    "match": [
      "holiday movie", "holiday film", "christmas movie", "christmas film",
      "halloween movie", "halloween film", "thanksgiving movie", "seasonal film",
      "winter holiday film", "holiday television movie", "holiday feature", "holiday special film"
    ],
    "deny": [
      "shorts", "short film", "trailer", "teaser", "reaction", "review", "recap",
      "commentary", "music video", "commercial", "fan edit", "clip", "countdown",
      "top 10", "how to", "tutorial", "podcast", "vertical", "christmas music",
      "holiday playlist", "holiday songs", "carol"
    ]
  },
  "holiday-cartoon-club": {
    "name": "Holiday Cartoon & TV Club",
    "fallbackProfiles": ["christmas-cartoon-club", "halloween-cartoon-club"],
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "providers": ["peertube", "youtube"],
    "intent": "television",
    "queries": [
      "holiday cartoon full episode",
      "christmas cartoon full episode",
      "halloween cartoon full episode",
      "thanksgiving cartoon full episode",
      "holiday animated special full",
      "seasonal kids television full episode",
      "classic holiday cartoon compilation",
      "winter cartoon full episode",
      "holiday family television full episode",
      "animated holiday television special",
      "holiday cartoon marathon",
      "spooky cartoon full episode",
      "holiday television special full",
      "family holiday special full",
      "winter holiday television full",
      "seasonal family special full",
      "classic holiday television full",
      "holiday cartoon collection full"
    ],
    "match": [
      "holiday cartoon", "christmas cartoon", "halloween cartoon", "thanksgiving cartoon",
      "holiday animated special", "seasonal cartoon", "holiday kids television",
      "holiday family show", "animated holiday special", "winter cartoon", "holiday television special",
      "holiday television special", "family holiday special", "winter holiday television",
      "seasonal family special", "classic holiday television", "holiday cartoon collection"
    ],
    "deny": [
      "educational", "instructional", "seminar", "lecture", "animation history",
      "behind the scenes", "review", "reaction", "shorts", "short film", "trailer",
      "music video", "playlist", "top 10", "how to", "tutorial", "vertical", "fan edit", "countdown"
    ]
  },
  "christmas-movie-house": {
    "name": "Christmas Movie House",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "providers": ["peertube", "youtube"],
    "intent": "film",
    "queries": [
      "christmas movie full",
      "christmas film full",
      "classic christmas movie full",
      "public domain christmas movie",
      "christmas television movie full",
      "santa movie full",
      "noel film full",
      "winter holiday movie full",
      "christmas family film full",
      "christmas romance movie full",
      "christmas horror movie full",
      "christmas movie marathon"
    ],
    "match": [
      "christmas movie", "christmas film", "christmas television movie", "classic christmas",
      "public domain christmas", "santa movie", "noel film", "winter holiday movie",
      "christmas family film", "christmas romance", "christmas horror", "christmas feature"
    ],
    "deny": [
      "shorts", "short film", "trailer", "teaser", "reaction", "review", "recap", "commentary",
      "music video", "christmas music", "christmas songs", "carol", "playlist", "commercial",
      "fan edit", "clip", "countdown", "top 10", "how to", "tutorial", "podcast", "vertical"
    ]
  },
  "christmas-cartoon-club": {
    "name": "Christmas Cartoon & TV",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "providers": ["peertube", "youtube"],
    "intent": "television",
    "queries": [
      "christmas cartoon full episode",
      "christmas animated special full",
      "rudolph cartoon full",
      "frosty cartoon full",
      "grinch cartoon full",
      "santa cartoon full episode",
      "animated christmas television special",
      "charlie brown christmas full",
      "christmas kids television full episode",
      "classic christmas cartoon compilation",
      "christmas cartoon marathon",
      "christmas family show full episode"
    ],
    "match": [
      "christmas cartoon", "christmas animated special", "rudolph", "frosty", "grinch",
      "santa cartoon", "animated christmas", "charlie brown christmas", "christmas kids television",
      "classic christmas cartoon", "christmas family show", "christmas television special"
    ],
    "deny": [
      "educational", "instructional", "seminar", "lecture", "animation history", "behind the scenes",
      "review", "reaction", "shorts", "short film", "trailer", "music video", "christmas music",
      "playlist", "top 10", "how to", "tutorial", "vertical", "fan edit", "countdown"
    ]
  },
  "halloween-movie-house": {
    "name": "Halloween Movie House",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "providers": ["peertube", "youtube"],
    "intent": "film",
    "queries": [
      "halloween movie full",
      "halloween horror movie full",
      "public domain horror feature",
      "spooky movie full",
      "monster movie full",
      "witch movie full",
      "haunted house movie full",
      "halloween television movie full",
      "classic horror feature full",
      "seasonal horror film full",
      "halloween family movie full",
      "halloween movie marathon",
      "classic monster movie full",
      "public domain halloween feature full",
      "spooky feature film full",
      "horror anthology full movie",
      "seasonal horror double feature",
      "halloween classic film full"
    ],
    "match": [
      "halloween movie", "halloween horror", "horror holiday", "spooky feature", "monster movie",
      "witch movie", "haunted house movie", "halloween television movie", "classic horror feature",
      "seasonal horror film", "halloween family movie", "halloween feature",
      "classic monster movie", "public domain halloween feature", "spooky feature film",
      "horror anthology", "seasonal horror double feature", "halloween classic film"
    ],
    "deny": [
      "shorts", "short film", "trailer", "teaser", "reaction", "review", "recap", "commentary",
      "music video", "halloween music", "playlist", "commercial", "fan edit", "fan film", "clip",
      "countdown", "top 10", "how to", "tutorial", "podcast", "vertical"
    ]
  },
  "halloween-cartoon-club": {
    "name": "Halloween Cartoon & TV",
    "queryLimit": 16,
    "queryWindow": 6,
    "peerTubeQueryWindow": 6,
    "peerTubeInstanceLimit": 2,
    "peerTubeDetailLimit": 24,
    "peerTubeFallbackQueryWindow": 4,
    "peerTubeInstances": ["https://search.joinpeertube.org", "https://tilvids.com"],
    "providers": ["peertube", "youtube"],
    "intent": "television",
    "queries": [
      "halloween cartoon full episode",
      "halloween animated special full",
      "halloween special cartoon full",
      "casper halloween cartoon full",
      "scooby doo halloween full",
      "charlie brown halloween full",
      "garfield halloween full",
      "spooky cartoon full episode",
      "monster cartoon full episode",
      "halloween kids television full episode",
      "classic halloween cartoon compilation",
      "halloween cartoon marathon",
      "spooky television special full",
      "monster cartoon special full",
      "classic halloween television special",
      "halloween family tv special full",
      "halloween animated television full",
      "halloween cartoon collection full"
    ],
    "match": [
      "halloween cartoon", "halloween animated special", "halloween special", "casper",
      "scooby doo", "charlie brown halloween", "garfield halloween", "spooky cartoon",
      "monster cartoon", "halloween kids television", "classic halloween cartoon", "halloween television special",
      "spooky television special", "monster cartoon special", "classic halloween television",
      "halloween family tv", "halloween animated television", "halloween cartoon collection"
    ],
    "deny": [
      "educational", "instructional", "seminar", "lecture", "animation history", "behind the scenes",
      "review", "reaction", "shorts", "short film", "trailer", "music video", "halloween music",
      "playlist", "top 10", "how to", "tutorial", "vertical", "fan edit", "countdown"
    ]
  }
});
