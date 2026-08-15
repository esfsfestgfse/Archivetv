# Data Sources Catalog

Every external URL the app touches, with CORS status, current health, and
notes. Update this when you add/remove/change a source.

Legend:
- **CORS `*`** — browser can fetch directly, no proxy needed
- **CORS `<origin>`** — restricted to a specific origin, need CORS relay
- **CORS `none`** — no CORS header, need CORS relay
- **`<img>` OK** — image loads via `<img src>` don't require CORS
- **Status ✓** — verified working
- **Status ⚠** — flaky / intermittent
- **Status ✗** — currently broken

---

## Video / Audio (channels playing content)

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| Internet Archive advancedsearch | `archive.org/advancedsearch.php` | JSONP fallback | ✓ | Primary content source |
| Internet Archive scrape | `archive.org/services/search/v1/scrape` | * | ✓ | Bulk pagination |
| Internet Archive metadata | `archive.org/metadata/{id}` | * | ✓ | Per-item metadata |
| Internet Archive files | `archive.org/download/{id}/{file}` | * | ✓ | Direct file serves |
| Internet Archive thumbs | `archive.org/services/img/{id}` | * | ✓ | 32×32 guide thumbnails (F06) |
| Wikimedia Commons | `commons.wikimedia.org/w/api.php` | * | ✓ | On This Day footage search |

## Live TV / Cams (HLS + JPG)

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| iptv-org catalog | `iptv-org.github.io/api/streams.json` | * | ✓ | Live TV catalog |
| WildEarth Kruger | `dqga3jatxofgx.cloudfront.net/WildEarth.m3u8` | none | ✓ | HLS, `<video>` OK |
| Love Nature 4K | `pb-ehs1glsha1juy.akamaized.net/Love_Nature_4K.m3u8` | * | ✓ | Added 2026-08-14 |
| Samsung Wild Life | `pb-olm46bexcljjf.akamaized.net/Samsung_Wild_Life.m3u8` | * | ✓ | Added 2026-08-14 |
| PBS Nature | `amg02333-pbs-amg02333c11-firetv-us-4242.playouts.now.amagi.tv/playlist.m3u8` | * | ✓ | Added 2026-08-14 |
| Safari TV India | `j78dp346yq5r-hls-live.5centscdn.com/safari/live.stream/playlist.m3u8` | * | ✓ | Added 2026-08-14 |
| Outdoor America | `d1e354daam8g5r.cloudfront.net/playlist.m3u8` | * | ✓ | Added 2026-08-14 |
| BBC Earth | `amg00793-amg00793c6-firetv-us-4067.playouts.now.amagi.tv/playlist.m3u8` | * | ✓ | Added 2026-08-14 |
| China Travel (CCTV+) | `fastlive.cctvplus.com/out/v1/ca6f9297b7314a63959435028af287fc/index.m3u8` | * | ✓ | Added 2026-08-14 |
| Beach TV (Wowza) | `media4.tripsmarter.com:1935/LiveTV/{X}TVHD/playlist.m3u8` | * | ✓ | 5 sub-feeds |
| Palm Beaches TV | `live.feed.thepalmbeaches.tv/index.m3u8` | * | ✓ | |
| Aruba TV | `cdn01.setar.aw/Canal49/canal49/playlist.m3u8` | * | ✓ | |
| Alps · Schladming | `m317.video-stream-hosting.de/...playlist.m3u8` | * | ✓ | |
| Pocono TV | `dfoiz3dv1euv7.cloudfront.net/ptnlive-s3/live1.m3u8` | * | ✓ | |
| 3Cat Weather Cams | `directes-tv-int.3catdirectes.cat/...master.m3u8` | * | ✓ | |
| Caltrans JPG cams | `cwwp2.dot.ca.gov/data/d{N}/cctv/image/{cam}/{cam}.jpg` | * | ✓ | 10 curated, jpg-refresh 5 sec |

**REMOVED 2026-08-14** (do not re-add):
- All `youtube.com/embed/live_stream?channel=X` — playability check fails
- All `explore.org/livecams/currently-live/{slug}/embed` — 404
- `dronetv` HLS (`d35j504z0x2vu2.cloudfront.net/...`) — connection failure
- Sen Space Live HLS (`880ca9c9341c405f83d8664a18cc7134.mediatailor...`) — 404

## Sports

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| ESPN scoreboard | `site.api.espn.com/apis/site/v2/sports/{sp}/scoreboard` | * | ✓ | Via sports-cache Worker |
| TheSportsDB | `www.thesportsdb.com/api/v1/json/3` | * | ✓ | Via sports-cache Worker |
| sports-cache Worker | `sports-cache.tdy1990.workers.dev/?url=...` | * | ✓ | Proxy + KV cache |

## Weather / Radar

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| NWS forecast | `api.weather.gov/points/{lat},{lon}` | * | ✓ | Also gridpoints/... |
| NWS METAR | `aviationweather.gov/api/data/metar` | * | ✓ | Aviation weather |
| radar.weather.gov | `radar.weather.gov/ridge/standard/{ID}_loop.gif` | none | ✓ | `<img>` OK |
| SPC Day 1 outlook | `spc.noaa.gov/products/outlook/day1otlk.txt` | * | ✓ | Text |
| NHC current storms | `nhc.noaa.gov/CurrentStorms.json` | none | ⚠ | Via `fetchJSONResilient` (relay) |
| NHC text products | `nhc.noaa.gov/text/MIATWOAT.shtml` | none | ⚠ | Via `fetchTextResilient` |

## Space / Solar

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| SDO GSFC direct | `sdo.gsfc.nasa.gov/assets/img/latest/latest_512_*.jpg` | none | ✓ | `<img>` OK. Filters: 0171, 0193, 0211, 0304, 0335, HMIIF, HMIB |
| SWPC SUVI 171 | `services.swpc.noaa.gov/images/animations/suvi/primary/171/latest.png` | * | ✓ | |
| SWPC SUVI 304 | `services.swpc.noaa.gov/images/animations/suvi/primary/304/latest.png` | * | ✓ | |
| SWPC Kp index | `services.swpc.noaa.gov/products/noaa-planetary-k-index.json` | * | ✓ | |
| GOES X-ray flux | `services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json` | * | ✓ | Flare class |
| SWPC F10.7 | `services.swpc.noaa.gov/json/f107_cm_flux.json` | * | ✓ | Solar radio flux |
| SWPC solar cycle | `services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json` | * | ✓ | SSN |
| SWPC WWV | `services.swpc.noaa.gov/text/wwv.txt` | * | ✓ | Ham Radio (via `fetchTextResilient`) |
| NASA APOD | `api.nasa.gov/planetary/apod?api_key=DEMO_KEY` | echoed | ✓ | Rate-limited on DEMO_KEY |
| NASA EPIC | `epic.gsfc.nasa.gov/api/natural` | * | ✓ | Earth from L1 |
| ISS Tracker | `api.wheretheiss.at/v1/satellites/25544` | * | ✓ | Swapped from dead open-notify.org |

**BROKEN / removed**:
- `services.swpc.noaa.gov/images/animations/sdo/{aia171,aia304,hmib}/latest.jpg` — all 404
- `api.open-notify.org/iss-now.json` — unresponsive since months
- `api.open-notify.org/astros.json` — same

## Seismic / Geologic

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| USGS earthquakes | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` | * | ✓ | Also all_hour, all_week |
| USGS river/lake | `waterservices.usgs.gov/nwis/iv/?format=json&sites={id}` | * | ✓ | |
| USGS Volcano Hazards RSS | `volcanoes.usgs.gov/vhp/rss/rss_all.xml` | * (redirect) | ✗ | Cloudfront 403 |
| Smithsonian GVP RSS | `volcano.si.edu/news/WeeklyVolcanicActivity.xml` | none | ✗ | 404 |

## Aviation / Ships

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| adsb.lol | `api.adsb.lol/v2/point/{lat}/{lon}/{nm}` | none | ⚠ | Direct blocked, works via relay |
| airplanes.live | `api.airplanes.live/v2/point/{lat}/{lon}/{nm}` | none | ✗ | Now requires email-registered token |
| OpenSky Network | `opensky-network.org/api/states/all?lamin=...` | own-origin only | ⚠ | Must go through relay |
| Planespotters photos | `api.planespotters.net/pub/photos/hex/{hex}` | * | ✓ | Airport Watch photo pop |
| aisstream.io | `wss://stream.aisstream.io/v0/stream` | blocks browsers | ✗ | See KNOWN_ISSUES #1 |
| ais-relay Worker | `wss://ais-relay.tdy1990.workers.dev/` | * | ✓ | Our proxy; wired but aisstream itself is down |

## Economy / Infrastructure

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| EIA petroleum (gas) | `api.eia.gov/v2/petroleum/pri/gnd/data/` | intermittent | ⚠ | Now via `fetchJSONResilient` |
| EIA electricity (ERCOT) | `api.eia.gov/v2/electricity/rto/region-data/data/` | intermittent | ⚠ | Now via `fetchJSONResilient` |

## Wildlife / Nature Data

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| iNaturalist | `api.inaturalist.org/v1/observations` | * | ✓ | Backyard Naturalist |
| NIFC wildfires | `services.arcgis.com/OLiydejKCZTGhvWg/.../USA_Wildfires_v1/...` | * | ✓ | ArcGIS FeatureServer |

## Marine / Tides

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| NOAA CO-OPS | `api.tidesandcurrents.noaa.gov/api/prod/datagetter` | * | ✓ | Tides + buoys |

## Archives / Historical

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| LOC Chronicling America search | `chroniclingamerica.loc.gov/search/pages/results/?format=json` | none | ⚠ | Via `fetchJSONResilient` |
| LOC Chronicling America images | `chroniclingamerica.loc.gov/lccn/.../print/image_*.jpg` | none | ✓ | `<img>` OK, no CORS needed |
| LOC photos | `www.loc.gov/photos/?fo=json` | none | ⚠ | Via `fetchJSONResilient` |

## Radio / Music

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| SomaFM | `somafm.com/channels.json` | * | ✓ | Live Radio |
| radio-browser | `de1.api.radio-browser.info/json/stations/search` | * | ✓ | Global radio |
| WSPR live | `db1.wspr.live/?query=...` | none | ⚠ | Via `fetchTextResilient` |

## Wikipedia / Wikimedia

| Source | URL pattern | CORS | Status | Notes |
|---|---|---|---|---|
| Wikipedia OnThisDay | `en.wikipedia.org/api/rest_v1/feed/onthisday/events/{mm}/{dd}` | * | ✓ | F26 modal |
| Wikimedia EventStreams | `stream.wikimedia.org/v2/stream/recentchange` | none | ✓ | SSE, has own CORS model |

## CORS Relays

Direct-first, fallback chain used by `fetchJSONResilient` and `fetchTextResilient`:

1. `api.allorigins.win/raw?url=...`
2. `api.codetabs.com/v1/proxy/?quest=...`
3. `thingproxy.freeboard.io/fetch/...`
4. `corsproxy.io/?url=...` (last-ditch — 403s null origins now)

## Our Cloudflare Workers

| Worker | URL | Purpose |
|---|---|---|
| sports-cache | `sports-cache.tdy1990.workers.dev` | ESPN + TheSportsDB proxy + KV cache |
| ais-relay | `ais-relay.tdy1990.workers.dev` | WebSocket proxy to aisstream.io (upstream is down; see KNOWN_ISSUES #1) |
