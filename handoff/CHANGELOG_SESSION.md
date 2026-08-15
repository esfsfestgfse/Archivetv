# Session Changelog — 2026-08 Sprint

Chronological record of every ship in the most recent working session.
Each entry lists the commit SHA + build stamps + what landed.

Read this to get "state of the world" fast without walking `git log` manually.

---

## Ships (oldest → newest)

### `ef24904` — Ship C of 3 · β cleanup + Favorites/Blocklist managers + Export/Reset
Build: `mobile.176 / desktop.145`
- Baseline before rebrand + v2 batch work

### `a2cd540` — AFTERGLOW rebrand + v2 batch 1
Build: `mobile.177 / desktop.146`
- **Rebrand**: all user-visible strings updated across both builds — HTML title,
  splash title (with amber phosphor mark SVG above), wall clock, ticker,
  chan-bug default, WX bug, share title, reset confirm, Emergency Studio
  takeover, colorbars sign-off, rail head, guide logo
- **F16 · Phosphor Tint** — OSD entry cycles tube through Green (P1) / Amber
  (P3) / Cyan (P4) / White (mono). Chrome stays green, only the tube shifts.
- **C22 · Wikipedia Live** — new LDATA channel 972 streaming every Wikipedia
  edit via Wikimedia EventStreams (public SSE)
- **F30 · Source metadata in NOW/NEXT** — info panel shows COLL + clickable
  IA identifier

### `b94f5cb` — v2 batch 2 · Solar Dashboard + Sleep sign-off + Today in History
Build: `mobile.178 / desktop.147`
- **C17 · Solar Dashboard** — new LDATA channel 973. SDO imagery rotator +
  GOES X-ray flux with A/B/C/M/X flare class + F10.7 solar flux + sunspot
  number. NOAA SWPC feeds.
- **F20 · Sleep-timer sign-off countdown** — last 10 seconds show a big
  animated countdown number in the tube
- **F26 · Today in History** — new OSD entry opens Wikipedia OnThisDay
  events browser

### `e61b6de` — v2 batch 3 · Grid stress meter + F02 verified + Global Quakes Map
Build: `mobile.179 / desktop.148`
- **F24 · Grid stress meter** — horizontal stress bar on The Grid (971).
  Green under 65% of 85GW ERCOT capacity, amber 65-80% (elevated), red
  above 80% (stressed).
- **F02 · Search-as-you-type** — verified already shipped in earlier build,
  no code change needed
- **C16 · Global Quakes Map** — new LDATA channel 974. World map (equirect
  projection, no coastlines) with pulsing dots for every ≥M2.5 quake in
  last 24 hours. USGS ANSS feed.

### `e4be05b` — v2 batch 4 · IA thumbnails + Newsstand + Prevue Guide
Build: `mobile.180 / desktop.149`
- **F06 · IA thumbnails in guide rows** — every guide row has a 32×32
  thumbnail column. Persists via localStorage. Placeholder glyph for
  never-watched channels.
- **C01 · Newsstand** — new LDATA channel 975. Historic newspaper front
  pages from LOC Chronicling America.
- **C28 · Prevue Guide** — new RETRO channel 999. Meta-channel that
  renders the classic 90s cable Prevue Guide look inside the tube.

### `9b2e0dd` — v2 batch 5 · Airport Watch re-enabled
Build: `mobile.181 / desktop.150`
- **C15 · Airport Watch** — new LDATA channel 976 wired to the pre-existing
  `tuneAirport` function (was fully implemented but had no CH row)

### `a991230` — Triage · Sky Beacon CORS, Black Cinema era, Ranger cams
Build: `mobile.182 / desktop.151`
- **Sky Beacon Live (955) CORS fix** — all 3 ADS-B tiers (adsb.lol,
  airplanes.live, opensky) CORS-block browser fetches. Rewrote `fetchSky`
  to try-direct-then-relay for all three tiers.
- **Black Cinema (105) era widened** to 1915–2026 with a full filmmaker
  subject list (Spike Lee, Julie Dash, Charles Burnett, Ava DuVernay,
  Barry Jenkins, Ryan Coogler, Jordan Peele, Denzel, Sidney Poitier,
  Morgan Freeman). All 4 places updated (CH, G-obj, META, PROGRAM).
- **The Ranger cams rebuilt** — all 5 explore.org iframe entries removed
  (their SPA killed the embed path). Replaced with Cornell Lab of
  Ornithology, Nat Geo WILD, Monterey Bay Aquarium, and Explore.org's own
  YouTube channel.

### `158b593` — Rip out all YouTube embeds — every YT live_stream is broken
Build: `mobile.183 / desktop.152`
- User reported every YT embed broken. Confirmed via testing.
- **Removed 11 broken entries** from LIVECAMS_STREAMS
- **Added 7 verified HLS replacements** for NATURE + CITY categories
- Highway Cams (302) and NASA Live (304) went to 0 streams — added
  "CHANNEL OFFLINE" empty-state to tuneLiveCams

### `5f69189` — Highway Cams back online — jpg-refresh + 8 Caltrans cams
Build: `mobile.184 / desktop.153`
- **New stream type `type:"jpg-refresh"`** in tuneLiveCams. Renders `<img>`
  that reloads on interval (default 5 sec) with cache-busting `?t=<epoch>`
  query. onerror auto-skips to next cam.
- **HIGHWAY category** populated with 8 verified Caltrans cameras across
  3 districts

### `1bdc7b0` — Mobile guide layout fix
Build: `mobile.185` (desktop unchanged)
- Removed pre-existing bug: orphaned `.chcell .cc-n` / `.cc-nm` selectors
  mislabeled as "chcell-old-unused" that were cascade-clobbering the guide
  since 1.6.x
- Fixed F06 regression on mobile: rebuilt `.chcell` as a card layout
  `[accent | 40px thumb | num+name+status stacked | fav corner]`

### `17bb21f` — Universal resilient fetch — flip flaky channels + ISS swap
Build: `mobile.186 / desktop.154`
- **6 channels flipped** from plain `fetchJSON` to `fetchJSONResilient`:
  The Grid, Gas Ticker (2 calls), Newsstand, Ham Radio (WSPR + WWV via
  `fetchTextResilient`)
- **ISS Tracker (953) rebuilt** on a new data source — `api.open-notify.org`
  has been unresponsive for months. Swapped to `api.wheretheiss.at`. Also
  replaced the astros crew-list panel with a static TELEMETRY panel.

### `e0173ad` — Solar Dashboard fix + NASA Live rebuild + Feed Health chip
Build: `mobile.187 / desktop.155`
- **Solar Dashboard (973) SILENT BUG FIX** — SDO image URLs at
  `services.swpc.noaa.gov/images/animations/sdo/{aia171,aia304,hmib}` all
  return 404. Silent since Solar Dashboard shipped. Swapped to
  `sdo.gsfc.nasa.gov/assets/img/latest/latest_512_*.jpg` + SWPC SUVI.
- **NASA Live (304) REBUILT** as bespoke image slideshow (SDO + APOD + EPIC).
  Rotates every 15 sec.
- **Highway Cams** — 2 more D10 Caltrans cams added
- **Feed Health chip** in SIGNAL DIAGNOSTICS panel — aggregates NETLOG by
  tag, renders color-coded chip strip (green/amber/red)

### `cb2b17d` — AIS relay Cloudflare Worker source + deploy doc
Build: no HTML change — new Worker source file
- **`afterglow_ais_relay_worker.js`** — stateless WebSocket relay for
  Ship Tracker
- **`docs/AIS_RELAY_DEPLOY.md`** — copy-paste deploy steps

### `18c40be` — Ship Tracker wired to ais-relay Worker
Build: `mobile.188 / desktop.156`
- WebSocket URL swapped from direct aisstream to
  `wss://ais-relay.tdy1990.workers.dev/`
- Subscribe message drops APIKey (Worker injects server-side from Secret)
- Ticker text updated

### `4902382` — Fix AIS Worker · wss:// → https:// for outbound fetch
Build: no HTML change — Worker source only
- **Cloudflare Workers `fetch()` only accepts `https://` URLs.** The
  Upgrade: websocket header does the actual protocol upgrade — using
  `wss://` throws "Fetch API cannot load" and returns 502.
- Diagnosed live via Python WebSocket client
- Post-fix: Worker plumbing verified correct end-to-end. WS opens cleanly,
  subscription forwarded, but aisstream returns zero frames — service-wide
  outage on their side since 2026-08-05 (10 open issues in
  github.com/aisstream/issues)

---

## Artifacts Published

- **[Rebrand identity pitch](https://claude.ai/code/artifact/4b78a301-9a00-4690-9dba-4b2d577f40a1)** — AFTERGLOW naming, wordmark, palette, in-use mockup
- **[Field Guide](https://claude.ai/code/artifact/3e27f1e2-e4b1-45a2-8e1b-ae6ad27cab9a)** — full 148-channel user manual
- **[Live-Data Audit](https://claude.ai/code/artifact/67ed757e-0b10-40bc-8b9e-e9759afd7df8)** — health report + fix plan
- **[v2 Vision](https://claude.ai/code/artifact/733c9761-1b8e-4066-82e0-a7d04c88cf2d)** — four-pillar roadmap

All four also copied to `handoff/artifacts/` in this repo.

---

## Build Stamp Progression

```
mobile: 176 → 177 → 178 → 179 → 180 → 181 → 182 → 183 → 184 → 185 → 186 → 187 → 188
desktop: 145 → 146 → 147 → 148 → 149 → 150 → 151 → 152 → 153 → 154 → 155 → 156
```

Desktop skipped one bump (185→153 on mobile guide fix — that ship was
mobile-only).

## Current State

- **Live**: mobile.188 / desktop.156 (commit `4902382`)
- **21 live-data channels healthy** after audit
- **Ship Tracker (965)** — plumbing correct, blocked on aisstream.io
  service outage
- **All follow-ups from live-data audit shipped except**:
  - AIS Worker deployed but aisstream service-side broken
  - Highway Cams could benefit from more state DOTs (WSDOT/NJ/NY/TxDOT)
