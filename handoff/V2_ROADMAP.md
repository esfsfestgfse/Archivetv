# v2 Roadmap (markdown version)

Full HTML version with editorial layout at `artifacts/04_v2_vision.html`.
This is the plaintext dev-facing version — feature lists condensed for scanning.

## Thesis

v1 was about coverage — how many channels can we curate, how many feeds can
we plumb. v2 is about **use** — how does the app anticipate what you need,
how does it split its attention across multiple channels, how does it let
you build your own dial. Four pillars, all independently shippable.

---

## Pillar 01 · STORM MODE

The dial becomes a chase companion. Auto-tunes to weather channels when
SPC/NHC/USGS/NWS trigger events for your area.

### Features
- **Alert bus** *(tentpole)* — poll SPC/NHC/USGS/NWS every 60 sec, dedup by
  event ID, normalize to single event stream
- **Auto-tune** *(tentpole)* — on new event above severity threshold, hold
  current channel, snap to Local Radar / Storm Center / Tropical Watch,
  resume after N min
- **Multi-alert queue** — two active events → rotate between them every
  20 sec until either clears
- **Chase-day audio bed** — swap country/ragtime beds for subtle procedural
  drone during active event
- **Chaser log** — every tune during active event auto-logs to Chase Sheet:
  time, event, channel, location. Export CSV
- **Post-storm replay** — after event closes, offer to replay last 24 hours
  of Chase Sheet as marathon

### Implementation notes
- Reuse existing `nlog()` + `NETLOG` pattern for the Chase Sheet
- Alert bus lives at ~15-20 KB of JS in a new IIFE, calls existing
  `fetchJSONResilient`
- Auto-tune reuses existing `tuneNum()` + `chanRT` teardown
- No new external dependencies

---

## Pillar 02 · MULTI-VIEW

Split the tube. Watch multiple channels simultaneously.

### Features
- **2-up / 3-up / quad layouts** *(tentpole)* — preset splits, each pane
  its own tuned channel
- **Overlay mode** — data channel semi-transparently over video channel
- **Audio focus** — only one pane has audio; tap to swap
- **Layout memory** — save/name/recall layouts via OSD
- **Auto-multi triggers** — certain events auto-switch to layouts (tornado
  warning → "Storm Watch" layout: Radar + Storm Center + LOCAL ALERT bug)

### Implementation notes
- Riskiest pillar structurally — touches every tuner + video/iframe management
- Need to generalize `screenArea` into N independent tube regions
- Each region gets its own `chanRT.teardowns`
- Existing tuners should work unchanged, just called with a different
  `screenArea` reference

---

## Pillar 03 · BUILD YOUR OWN CHANNELS

Turn 148 curated channels into infinite user channels.

### Features
- **Forge UI** *(tentpole)* — wizard: name, category, era slider, IA
  collection multi-select, subject include/exclude, deny-title regex
- **Live preview** — wizard shows next 5 items that would play as you type
  filters
- **User channel numbers** — 601–699 in new "MY CHANNELS" category
- **Share by URL** — every user channel encodes as share URL; import lands
  as ch 601+ next slot
- **Community remix** — optional gallery of published user channels,
  star/fork/adopt

### Implementation notes
- User channels stored in localStorage as JSON matching `PROGRAM` schema
- Renderer already handles arbitrary `PROGRAM` entries; extending is
  additive
- Share URL uses base64-encoded JSON in fragment (`#c=...`)
- No server needed for base flow; gallery would need lightweight backend

---

## Pillar 04 · THE TIME MACHINE

Set the watch date. Programming shifts to that day in history.

### Features
- **Time-slider control** *(tentpole)* — vintage rotary date-picker in
  OSD. Snap to significant days (moon landing, JFK, V-J, Katrina, 9/11).
  Or free-scrub
- **Date-locked programming** *(tentpole)* — video-content channels filter
  PROGRAM catalog to items published within ±1 year of selected date
- **Historical Newsstand** — Chronicling America already scopes by date;
  wire directly
- **Historical Storm Center** — SPC/NHC don't publish historical products
  via API, use NOAA PDF archives (best-available)
- **Historical Wax Museum** — LOC Nat'l Jukebox filters by year; wire
  directly
- **Storm chase replay** *(for the owner)* — feed a historic storm date,
  whole app becomes that day's dashboard

### Implementation notes
- Most engineering-heavy pillar
- Requires touching PROGRAM catalog filtering (new date-scoped provider)
- Historical data sources for weather need research per-event
- Storm replay is best done as pre-recorded event bundles (Katrina '05,
  Harvey '17, Sandy '12) rather than live historical data pull

---

## Phased Delivery

### Phase 0 · Foundation (1-2 weeks)
- Alert bus + user-channel storage schema. Invisible infrastructure both
  Storm Mode and BYOC depend on.

### Phase 1 · Storm Mode (1 week)
- On top of alert bus. Auto-tune + persistent alert bug + Chase Sheet.

### Phase 2 · Multi-View (2 weeks)
- Layout system + audio focus + preset library. Riskiest but no external
  deps.

### Phase 3 · Build Your Own Channels (2 weeks)
- Forge UI + live preview + 601-699 neighborhood. Share-by-URL + community
  remix in a follow-up sub-phase.

### Phase 4 · Time Machine (2-3 weeks)
- Time-slider + date-locked programming first. Historical-Storm-Center +
  storm-replay follow as best-available data becomes accessible.

## Q1 Checklist

Concrete items landing in first quarter. Nothing depends on anything not
already in the codebase.

- [ ] Alert bus scaffolding + poller (foundation)
- [ ] Storm Mode auto-tune (Pillar 01, first surface)
- [ ] Chase Sheet auto-log + export
- [ ] Multi-View 2-up split layout
- [ ] Layout memory + OSD recall
- [ ] User-channel storage schema
- [ ] Channel Forge wizard (Pillar 03 base)
- [ ] Time-slider control (Pillar 04 UI)
- [ ] Date-locked programming across content channels
- [ ] Historical Newsstand mode (Q2 stretch)
- [ ] Storm chase replay (Q2 tentpole)
- [ ] User channel share-by-URL (Q2)

## Explicit Non-Goals

- **Native app / Electron wrapper** — deferred. Single-file HTML PWA
  constraint is load-bearing to iteration speed. v3 conversation.
- **Social layer / watch parties** — deferred. Pulls the app toward being
  a chat product; want to stay a tuning surface.
- **Podcast integration** — deferred. Adjacent to archive theme but a
  fully different content pipeline.
- **Full account system** — deferred. localStorage + URL-shared channels
  covers 95% of value at 5% of infrastructure.
- **Payment / donation flow** — not planned. Contract stays "free channel-
  surfing on free public archives."
- **AI Curator chat** — not planned. Undermines the tuning ritual that IS
  the app.
