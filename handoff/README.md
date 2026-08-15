# Afterglow · Codex Handoff Package

**What this folder is:** a self-contained onboarding kit for anyone (or any AI coding
tool) picking up the Afterglow project. Read this file first, then work outward.

---

## Read Order

1. **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** — what the project is, load-bearing
   constraints, workflow, deploy path. If you read one file, read this.
2. **[CHANGELOG_SESSION.md](CHANGELOG_SESSION.md)** — every ship in the most recent
   working session in chronological order. Gets you current state fast.
3. **[LIVE_DATA_AUDIT.md](LIVE_DATA_AUDIT.md)** — health report on all 25+ live data
   channels + the ranked fix plan. Full HTML version at `artifacts/03_livedata_audit.html`.
4. **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)** — footguns, dead APIs, ecosystem-decay
   problems (YouTube embeds, aisstream outage) — what NOT to spend time re-debugging.
5. **[DATA_SOURCES.md](DATA_SOURCES.md)** — every external URL the app touches, with
   CORS status and known behavior.
6. **[V2_ROADMAP.md](V2_ROADMAP.md)** — the proposed v2.0 direction. Four pillars,
   phased delivery, Q1 checklist, explicit non-goals. Full HTML at
   `artifacts/04_v2_vision.html`.

## Also In This Folder

- **[artifacts/](artifacts/)** — HTML deliverables from the last session:
  - `01_rebrand_identity.html` — the AFTERGLOW naming + wordmark + palette pitch
  - `02_field_guide.html` — full user manual with annotated remote, all 148 channels
  - `03_livedata_audit.html` — the live-data health audit (matches LIVE_DATA_AUDIT.md)
  - `04_v2_vision.html` — the v2 roadmap (matches V2_ROADMAP.md)

## Code Location

Everything lives in this repo (`Archivetv/`). Two production files carry the entire app:

- **`the_dial_mobile.html`** — mobile / PWA build (~1.07 MB, all inline)
- **`the_dial_desktop.html`** — desktop build (~1.03 MB, all inline)

Plus:

- **`afterglow_ais_relay_worker.js`** — Cloudflare Worker source for Ship Tracker
- **`docs/AIS_RELAY_DEPLOY.md`** — one-time deploy steps for the AIS Worker
- **`CLAUDE.md`** — the AI-agent onboarding doc (subset of PROJECT_CONTEXT.md)
- **`sw.js`, `manifest.json`, `icon-192.png`** — PWA glue
- **`ci/`** — Playwright test scripts

## Current Build

```
mobile.188 · desktop.156 · commit 4902382
```

Verify with:
```bash
grep '__ATV_BUILD=' the_dial_mobile.html the_dial_desktop.html
```

## Deploy

```bash
git push
```

That deploys to https://esfsfestgfse.github.io/Archivetv — GitHub Pages picks up
the two HTML files directly, no build step.

Verify a deploy via GitHub API (NOT the Pages CDN, which caches for minutes):
```bash
curl -s "https://api.github.com/repos/esfsfestgfse/Archivetv/git/trees/main" | \
  python -c "import json,sys; d=json.load(sys.stdin); \
    print([e['sha'] for e in d['tree'] if e['path']=='the_dial_mobile.html'][0])"
```

Then fetch that blob to see the deployed build stamp.

## The Constraints (Don't Break These)

- **Single-file HTML.** All markup, CSS, JS inline in one file per build. No bundler,
  no framework, no npm build step. This is a stated product requirement.
- **Two builds, edited independently.** Mobile and desktop are hand-merged. Every
  change to mobile must be ported to desktop.
- **Deploy is `git push`.** No CI/CD dance beyond that.
- **Verify via GitHub API.** The Pages CDN lies.

More constraints in PROJECT_CONTEXT.md.

## What Just Shipped

The most recent session (see CHANGELOG_SESSION.md) delivered:

- **AFTERGLOW rebrand** — new name + wordmark, splash mark, all 20+ user-visible
  strings updated across both builds
- **13+ v2 punchlist items** — F16 phosphor tint, F06 IA thumbnails in guide,
  F20 sleep-timer sign-off, F24 grid stress meter, F26 today-in-history, F30
  source metadata, C22 Wikipedia Live, C17 Solar Dashboard, C16 Global Quakes
  Map, C01 Newsstand, C15 Airport Watch, C28 Prevue Guide meta-channel
- **Universal resilient fetch** — 7 flaky channels moved to healthy via
  direct-first-then-CORS-relay-fallback wrapper
- **Highway Cams rebuilt** — YouTube embeds removed (ecosystem-decay), replaced
  with 10 Caltrans jpg-refresh cams
- **NASA Live rebuilt** — YouTube embeds removed, replaced with SDO/APOD/EPIC
  image slideshow
- **Solar Dashboard silent bug fix** — image URLs were 404-ing since it shipped
- **The Ranger cams rebuild** — explore.org embeds gone (their SPA killed the
  embed path), replaced with 7 working HLS nature streams
- **Mobile guide layout fix** — F06 broke it, rebuilt as a card layout
- **Feed Health chip** in Settings — per-channel health from NETLOG
- **AIS Cloudflare Worker deployed** at `ais-relay.tdy1990.workers.dev` — Ship
  Tracker will light up the moment aisstream.io fixes their service-wide outage

## What's Blocked

**Ship Tracker (channel 965).** The Worker is deployed and correct. The client
is wired correctly. Aisstream.io's service has been silently dropping WebSocket
subscriptions for everyone since 2026-08-05
([their issue tracker](https://github.com/aisstream/issues) has ten open reports
about identical symptoms). Zero code changes on our side fix this. Either wait
for aisstream to come back, or swap to a paid provider (MarineTraffic /
VesselFinder) or a research feed (GlobalFishingWatch).

## What's Next

v2 pillars, ranked by impact-per-effort. Full details in `V2_ROADMAP.md`:

1. **STORM MODE** — auto-tune to weather channels on SPC/NHC/USGS/NWS alerts
2. **MULTI-VIEW** — split the tube 2-up, 3-up, quad
3. **BUILD YOUR OWN CHANNELS** — user-defined channels from IA search
4. **THE TIME MACHINE** — set the watch date, whole app shifts to that day

## Owner Context

- Based in Waco, Texas
- Storm chaser, runs "Bellmead Favorite Weatherman" Facebook page
- Co-hosts BWAAA! (King of the Hill rewatch podcast)
- Prefers terse communication, decisive recommendations over option menus
- Treats the AI as a technical partner, not an assistant

## Live URL

**https://esfsfestgfse.github.io/Archivetv/**

Mobile: `the_dial_mobile.html`
Desktop: `the_dial_desktop.html`

---

*Handoff generated 2026-08-14. Refresh anything that goes stale.*
