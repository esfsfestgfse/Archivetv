# Live Data Audit (markdown version)

Full HTML version with formatting + counters at `artifacts/03_livedata_audit.html`.

Audit run 2026-08-14 across all 25+ live-data channels. Every endpoint tested
via curl with `Origin: https://esfsfestgfse.github.io` header to see real
browser CORS behavior. Categorized by status.

## Headline Numbers (post-fix)

- **21 Healthy** — direct fetch works, CORS clean
- **0 Flaky** — all previously-flaky rows fixed with `fetchJSONResilient`
- **1 Blocked** — Ship Tracker (aisstream.io outage, not our code)
- **2 Composite** — Space + Hometown History need per-panel re-audit

## Complete Audit

| Ch | Channel | Source | Status | Notes |
|---|---|---|---|---|
| 950 | Weather Watch | api.weather.gov | ✓ Healthy | CORS `*` |
| 951 | Aurora & Space Weather | services.swpc.noaa.gov | ✓ Healthy | CORS `*` |
| 952 | Ham Radio | hamqsl.com + wspr.live + swpc wwv | ✓ Healthy | Uses resilient fetch |
| 953 | ISS Tracker | api.wheretheiss.at | ✓ Healthy | Swapped from dead open-notify |
| 954 | NASA APOD | api.nasa.gov | ✓ Healthy | CORS echoed. Rate-limited on DEMO_KEY |
| 955 | Sky Beacon Live | adsb.lol + airplanes.live + opensky | ✓ Healthy | Fixed via CORS relay routing |
| 956 | Seismic Watch | earthquake.usgs.gov | ✓ Healthy | CORS `*` |
| 957 | Space | mixed | ⚠ Composite | Needs per-panel re-audit |
| 958 | River & Lake Watch | waterservices.usgs.gov | ✓ Healthy | CORS `*` |
| 959 | Tropical Watch | nhc.noaa.gov | ✓ Healthy | Via `fetchJSONResilient` + `fetchTextResilient` |
| 960 | World Clock | (client-side only) | ✓ Healthy | No external data |
| 961 | Wildfire Watch | ArcGIS FeatureServer | ✓ Healthy | CORS `*` |
| 962 | Hometown History | mixed | ⚠ Composite | Needs per-panel re-audit |
| 963 | Gulf Marine | api.tidesandcurrents.noaa.gov | ✓ Healthy | CORS `*` |
| 964 | Gas Price Ticker | api.eia.gov | ✓ Healthy | Now via `fetchJSONResilient` |
| 965 | Ship Tracker | aisstream.io (via ais-relay Worker) | ✗ Blocked | aisstream service outage since 2026-08-05 |
| 966 | Historic Waco | chroniclingamerica.loc.gov | ✓ Healthy | Via resilient fetch |
| 967 | Backyard Naturalist | api.inaturalist.org | ✓ Healthy | CORS `*` |
| 968 | Air & Allergy | AirNow API | ✓ Healthy | Keyed |
| 969 | Storm Center | spc.noaa.gov | ✓ Healthy | CORS `*` |
| 970 | Local Radar | radar.weather.gov (image URLs) | ✓ Healthy | `<img>` OK |
| 971 | The Grid | api.eia.gov | ✓ Healthy | Now via `fetchJSONResilient` |
| 972 | Wikipedia Live | stream.wikimedia.org | ✓ Healthy | SSE |
| 973 | Solar Dashboard | services.swpc.noaa.gov + SDO GSFC | ✓ Healthy | Fixed silent bug in mobile.187 |
| 974 | Global Quakes Map | earthquake.usgs.gov | ✓ Healthy | Same USGS as Seismic Watch |
| 975 | Newsstand | chroniclingamerica.loc.gov | ✓ Healthy | Via `fetchJSONResilient` |
| 976 | Airport Watch | shares fetchSky with Sky Beacon | ✓ Healthy | Fixed with Sky Beacon |
| 302 | Highway Cams | Caltrans JPG cams (jpg-refresh) | ✓ Healthy | Rebuilt with 10 verified DOT cams |
| 303 | The Ranger | HLS nature streams | ✓ Healthy | Rebuilt after explore.org died |
| 304 | NASA Live | SDO/APOD/EPIC image slideshow | ✓ Healthy | Rebuilt after YT purge |

## Fix Plan Reference (all shipped except #4)

### Fix 1 — Universal resilient fetch ✅ SHIPPED (mobile.186/desktop.154)
Promoted `fetchJSONResilient` (direct-first, CORS-relay fallback) to be the
default for every flaky channel. Moved 6 rows from Flaky → Healthy.

### Fix 2 — Highway Cams rebuild ✅ SHIPPED (mobile.184/desktop.153)
`type:"jpg-refresh"` stream type + 10 Caltrans JPG cams.

### Fix 3 — Feed Health chip ✅ SHIPPED (mobile.187/desktop.155)
In-app per-channel health chip in the Signal Diagnostics panel.

### Fix 4 — Ship Tracker AIS Worker ⏳ WORKER DEPLOYED, aisstream DOWN
`ais-relay.tdy1990.workers.dev` deployed + client wired. Aisstream service is
down for everyone (see KNOWN_ISSUES.md #1).

### Fix 5 — HLS-first, embed as last resort ✅ SHIPPED (mobile.183/desktop.152)
All YouTube embeds ripped out; HLS-only pool with clean empty-state.

### Fix 6 — ISS wheretheiss.at swap ✅ SHIPPED (mobile.186/desktop.154)
Swap complete + static TELEMETRY panel replaces astros crew list.

## Remaining Composite Channels

**Channel 957 · Space** — layout mixes NASA imagery + satellite tracker + rocket
schedule. Not audited per-panel yet. Sub-tasks:
- Verify SDO imagery URLs
- Verify Nostradamus rocket launch feed
- Verify satellite pass calculator source

**Channel 962 · Hometown History** — layout mixes narration + local photos +
headlines. Not audited per-panel yet. Sub-tasks:
- Verify TTS source (browser speechSynthesis or external?)
- Verify photo pool (LOC? Local newspaper?)
- Verify headline source (Chronicling America locale-filtered?)

Both are v2.0 audit tasks. Non-blocking for current stable release.
