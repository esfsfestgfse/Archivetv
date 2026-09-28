#!/usr/bin/env node
/* Regression contract for the server-side IA deep-harvest path. This is a
 * source-level guard because the live Archive catalog is intentionally dynamic
 * and should not be hard-coded into CI. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const relay = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8');
const failures = [];
function check(ok, message) {
  console.log(`${message}: ${ok ? 'ok' : 'FAILED'}`);
  if (!ok) failures.push(message);
}

check(/IA_QUEUE_CACHE_VERSION\s*=\s*"v215"/.test(relay), 'underfill-depth rotation invalidates the prior queue namespace');
check(/const candidateLimit = Math\.max\(count, Math\.min\(IA_STRICT_CATALOG_CANDIDATE_MAX, Number\(candidateCount\) \|\| count\)\)/.test(relay), 'fresh Archive search preserves the larger rolling candidate catalog');
check(/function rotatePlayableIaShelf\([\s\S]*orderedIaEmergencySeeds\(recoveryChannel, 0\)/.test(relay), 'slow fallbacks merge the lane-owned verified bank before rotating');
check(/rotationApplied === true/.test(relay) && /rotationApplied: true/.test(relay), 'rotation state prevents cached shelves from being advanced twice');
check(/"701": \[[\s\S]*TheThingFromAnotherWorldHorrorSciFi1951JamesArnessKennethTobeyMargaretSheridan[\s\S]*TheGiantGilaMonster/.test(relay), 'Halloween Haunt adds full-length multi-era horror files');
check(/IA_STRICT_CATALOG_CANDIDATE_MAX\s*=\s*128/.test(relay) && /IA_CATALOG_CANDIDATE_MAX\s*=\s*96/.test(relay), 'every IA lane receives a larger rolling catalog budget');
check(/IA_FRESHNESS_CANDIDATE_FLOOR\s*=\s*32/.test(relay) && /IA_FRESHNESS_LEDGER_MAX\s*=\s*96/.test(relay) && /IA_PLAYED_PATH/.test(relay), 'freshness history is large enough to cover several shelves and records actual plays');
check(/IA_BACKGROUND_COLLECTION_EPISODES_PER_PARENT\s*=\s*20/.test(relay) && /IA_BACKGROUND_CONTAINER_EXPANSIONS\s*=\s*8/.test(relay), 'container harvesting covers multiple parents and episode positions');
check(/IA_MAX_EXPANDED_FILES\s*=\s*1200/.test(relay) && /sampleArchiveSequence\(rotatedPlayable, IA_MAX_EXPANDED_FILES\)/.test(relay), 'large complete-series manifests are sampled instead of discarded');
check(/background\s*\?\s*\(iaDepthRecoveryEnabled\(channel\) \? 32 : 24\)/.test(relay), 'background rotations sample a deep deterministic Archive page window');
check(/const rows = firstApprovedLane \? 36 : 60/.test(relay), 'background searches request a wider result page without slowing first tune');
check(/IA_DEPTH_PLAYABLE_TARGET\s*=\s*72/.test(relay) && /IA_BACKGROUND_PLAYABLE_TARGET\s*=\s*48/.test(relay), 'playable depth is measured separately from the five-item on-air shelf');
check(/catalogVersion: IA_CATALOG_BUDGET_VERSION/.test(relay) && /episodeDepth: queueEpisodeDepth\(deepHydrated\)/.test(relay), 'deep catalog depth is published for guide and telemetry consumers');
check(/for \(let row = 0; row < IA_BACKGROUND_COLLECTION_EPISODES_PER_PARENT/.test(relay), 'expanded files are interleaved across parent collections');
check(/const rotationRefreshLimit = firstApprovedLane && Number\(rotation\) > 0/.test(relay) && /iaDepthRecoveryEnabled\(channel\) \? 4 : 2/.test(relay), 'later rotations widen discovery without slowing the first tune');
check(/const rotationQueries = rotation > 0/.test(relay) && /const fastQueries = rotationQueries\.slice\(0, fastLaneCount\)/.test(relay), 'later rotations prioritize a fresh Archive rail instead of reordering one shallow shelf');
check(/memoryNeedsFreshRotation/.test(relay) && /iaShouldBypassShallowRotation\(cachedPayload, rotation/.test(relay), 'shallow exact caches cannot mask a later fresh rotation');
check(/function safeMinRuntimeSeconds\(/.test(relay) && /function iaRuntimeAllowed\(/.test(relay) && /minRuntimeSeconds/.test(relay), 'runtime floors are enforced before short Archive clips reach first play');
check(/Number\(rotation\) > 0 \|\| iaDepthRecoveryEnabled\(channel\)/.test(relay), 'later rotations collect supplemental Archive rails within the bounded grace window');
check(/const expandedEpisode = item && rawIdentifier\.includes\("::"\)/.test(relay) && /rawIdentifier\.split\("::"\)\[0\]/.test(relay), 'expanded episode records can re-open their parent container for sibling harvesting');
check(/"704": \[/.test(relay) && /HowTheGrinchStoleChristmas_201812/.test(relay) && /"705": \[/.test(relay) && /halloween-cartoon-collection_20231022/.test(relay) && /"706": \[/.test(relay) && /garfieldsthanksgiving/.test(relay), 'holiday animation stations have verified Archive recovery rails');
check(/"158": \[[\s\S]*spider-mantheanimatedseries[\s\S]*DragonTalesTVSeries[\s\S]*powerpuff-girls-complete-series/.test(relay), 'Saturday Morning recovery rotates across multiple animated series instead of one Pingu shelf');
check(/const searchQueries = uniqueIaQueries\(queries, firstApprovedLane \? 8 : 12\)/.test(relay), 'background harvest uses the complete editorial query rail set');
check(/function iaHolidaySearchQueries\(channel, queries\)/.test(relay) && /queries = iaHolidaySearchQueries\(channel, queries\)/.test(relay), 'holiday stations add bounded collection/title discovery rails after normal query shaping');
check(/function iaHolidayThemeMatch\(doc, themeTerms\)/.test(relay) && /!holidayMatch\) return false/.test(relay), 'holiday stations use collection-aware acceptance without weakening the title gate globally');
check(/const seenPlayableIds = new Set\(\)/.test(relay) && /seenPlayableIds\.has\(id\)/.test(relay), 'merged Archive rails cannot duplicate one playable file across adjacent shelves');
check(/holidayCandidateCount = Math\.min\(IA_STRICT_CATALOG_CANDIDATE_MAX, Math\.max\(IA_DEPTH_PLAYABLE_TARGET/.test(relay) && /holidaySeed/.test(relay), 'holiday family shelves continue background harvesting until a deep playable target is reached');
check(/const eligible = bank\.filter/.test(relay) && /const offset = eligible\.length > count/.test(relay), 'strict recovery rotates the verified bank after editorial filtering');
check(/const IA_DEEP_HARVEST_BANKS = Object\.freeze/.test(relay) && /"51": \[[\s\S]*dvd-transfer-95_202207[\s\S]*"57": \[[\s\S]*tulane-vs-usc[\s\S]*"58": \[[\s\S]*1989-nba-all-star-game[\s\S]*"69": \[[\s\S]*womeninsportsaninformalhistory[\s\S]*"124": \[[\s\S]*frankenstein-created-woman_202505[\s\S]*"209": \[[\s\S]*cstmaah_000049[\s\S]*"215": \[[\s\S]*gov\.fema\.9-1315[\s\S]*"232": \[[\s\S]*STS1LaunchTracking[\s\S]*"703": \[[\s\S]*DNALOUNGE-VIDEO-2022-12-24/.test(relay), 'Deep harvest adds verified family banks to the weak IA lanes');
check(/hands-of-the-ripper-1971::Hands of the Ripper 1971\.mp4/.test(relay) && /the-vampire-lovers-1970_202608::The Vampire Lovers 1970\.mp4/.test(relay), 'Hammer House adds verified full-length Hammer features');
check(/the-satanic-rites-of-dracula-1973::The Satanic Rites Of Dracula 1973\.ia\.mp4/.test(relay) && /dracula-has-risen-from-the-grave-1968_202406::Dracula Has Risen from the Grave 1968\.ia\.mp4/.test(relay), 'Hammer House adds a deeper Dracula-era feature rail');
check(/0520_American_Cowboy::0520_American_Cowboy_04_32_19_07_3mb\.mp4/.test(relay) && /gov\.archives\.arc\.47087::gov\.archives\.arc\.47087_512kb\.mp4/.test(relay), 'Country Roads adds verified rural and ranch programming');
check(/170003_202005::170003\.ia\.mp4/.test(relay) && /000495_202005::000495\.m4v/.test(relay), 'Country Roads adds additional full-length rural files');
check(/masterhandscomplete4kh264::Master_Hands_complete_4K_h264\.mov/.test(relay) && /200723_American_Maker::200723_American_Maker_master\.intros\.mov/.test(relay), 'Motor City adds verified manufacturing features');
check(/0311_Chryslers_New_One_Hundred_Million_Dollar_Look_aka_Chrysler_1955_12_00_53_00::/.test(relay) && /6183_Its_Called_Motor_Oil_01_15_22_09::/.test(relay), 'Motor City adds additional automobile-industry programs');
check(/nasa_tv-Shuttle_Endeavour_Crew_s_Best_of_Flight_Day_10::Shuttle_Endeavour_Crew_s_Best_of_Flight_Day_10\.mp4/.test(relay) && /future-iss-residents-meet-media-76tf_uy7skQ::future-iss-residents-meet-media-76tf_uy7skQ\.mp4/.test(relay), 'Space Race adds verified long-form NASA programs');
check(/0969_Air_A_Film_Lesson_in_General_Science_19_15_53_15::/.test(relay) && /6240_System_Technology_01_29_28_19::/.test(relay) && /gov\.ntis\.ava20966vnb1\.1::/.test(relay), 'Future Lab adds a deeper science and technology file rail');
check(/Holiday_Fireplace_2018::Holiday_Fireplace_2018\.mp4/.test(relay) && /christmas-yule-log-ambience-25-days-of-christmas-freeform::/.test(relay), 'The Hearth adds a broad verified fireplace and Yule Log bank');
check(/jims-halloween-cartoon-marathon::1972 - The New Scooby-Doo Movies - Wednesday is Missing\.mp4/.test(relay) && /jims-halloween-cartoon-marathon::1998 - The New Batman Adventures - The Demon Within\.mp4/.test(relay), 'Halloween Cartoons adds full-length official animated specials from another Archive family');
check(/stableRotationWindow/.test(relay) && /payload && payload\.holidayCatalog === true/.test(relay) && /strict\.ready >= count && \(!strictNeedsFreshRotation \|\| holidayFamily\)/.test(relay), 'holiday and full-window shelves keep a stable rotation and bypass the slow shallow-cache path');
check(!/friona-tx-tornado-june-2-1995-vortex-95::Friona TX Tornado June 2 1995 VORTEX-95\.mp4/.test(relay), 'Storm Chase Classics excludes the verified sub-15-minute tornado clip');
check(/const requiredRuntime = safeMinRuntimeSeconds\(payload && payload\.minRuntimeSeconds\)/.test(relay) && /item\.media\.url && iaRuntimeAllowed\(item, requiredRuntime\)/.test(relay), 'Rotated direct shelves enforce the lane runtime floor before promotion');
check(/"80": \[[\s\S]*HuntingSeason[\s\S]*whitetail-madness-an-unbelievable-season[\s\S]*TheVistaGroup-WaterfowlChallenge1998/.test(relay), 'The Hunt has verified long-form hunting recovery media');
check(/"128": \[[\s\S]*gov\.archives\.arc\.36070::gov\.archives\.arc\.36070_512kb\.mp4[\s\S]*Industrial_Britain::Industrial_Britain_512kb\.mp4/.test(relay), 'Britain on Film has a deeper multi-era file rail');
check(/"217": \[[\s\S]*IntroductionToHolography::IntroductionToHolography1972\.mp4[\s\S]*theconquestofeverest::theconquestofeverestreel2\.mp4/.test(relay), 'Educational Filmstrip has a deeper verified classroom rail');
check(/"233": \[[\s\S]*amazon-land-of-the-flooded-forest-1991::AmazonForest\.mp4[\s\S]*NOVAStillWaters::NOVA\.S05E12\.Still\.Waters/.test(relay), 'Creature Comforts has a deeper wildlife rail');
check(/"241": \[[\s\S]*Rocheste1963_2::Rocheste1963_2\.mp4[\s\S]*CityTheP1939_2::CityTheP1939_2\.mp4/.test(relay), 'Civic Cinema has a deeper city-film rail');
check(!/general-idi-amin-1973.*General Idi Amin/.test(relay), 'Britain on Film excludes the verified short newsreel from the 15-minute lane');
check(/const IA_UNDERFILL_DEPTH_BANKS\s*=\s*Object\.freeze/.test(relay) && /"66": \[[\s\S]*"81": \[[\s\S]*"212": \[[\s\S]*"929": \[/.test(relay), 'underfill-depth harvest covers video, nature, and audio long-tail lanes');
check(/Xcorps21ASRhd2::Xcorps21ASRhd2\.mp4/.test(relay) && /Nature_Land_of_the_Eagle::Nature S10E07/.test(relay) && /mix_07_7_06::mix_07_7_06\.mp3/.test(relay), 'underfill-depth bank carries concrete Archive derivatives instead of collection placeholders');
check(/"212": \[[\s\S]*wildlife nature animal behavior zoology natural history documentary television/.test(relay) && /"902": \[[\s\S]*bluegrass folk acoustic string band live music/.test(relay), 'underfill-depth bank preserves strict station vocabulary');

check(relay.includes('const IA_UNDERFILL_DEPTH_ROTATION_CHANNELS = new Set(Object.keys(IA_UNDERFILL_DEPTH_BANKS))') && relay.includes('function rotateUnderfillDepthBank(') && relay.includes('underfillDepthRotation: true') && relay.includes('const stableCandidates = candidates.slice().sort'), 'underfill lanes rotate the verified file bank instead of reopening a shallow search shelf');

if (failures.length) {
  console.error(`IA deep-harvesting contract failed: ${failures.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log('IA deep-harvesting contract passed.');
}
