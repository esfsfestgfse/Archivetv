# Project Context — Afterglow (formerly Archive TV / The Dial)

## What This Is

A retro-CRT web app that channel-surfs across public-domain video, live
government data, ADS-B feeds, deep-catalog radio, and about a dozen other
public sources. Runs entirely in the browser — no account, no subscription,
no ads. Installs as a PWA on Android, works as a bookmarked page anywhere.

**Two builds:** mobile (`the_dial_mobile.html`) and desktop
(`the_dial_desktop.html`).

**148 channels** across 11 categories at last count. Numbering plan:

- `2–52` — home & legacy
- `100–157` — retro TV & movies
- `200–229` — documentary
- `300–304` — sports & live broadcast
- `500–509` — retro & special
- `700–703` — holiday
- `900–929` — music
- `950–976` — live data (the amber section in the guide)
- `999` — Prevue Guide meta-channel

## Load-Bearing Constraints

These are stated product requirements. Don't optimize past them without
explicit sign-off from the owner:

- **Single-file HTML.** All markup, CSS, JS inline in one file per build.
  No framework, no bundler, no npm build step.
- **Two builds, edited independently.** Mobile and desktop are hand-merged.
  Every change to mobile must be ported to desktop. Yes, it's tedious. It's
  the stated constraint.
- **Deploy is `git push`.** Push to `main` → GitHub Pages picks up the two
  HTML files → live at `esfsfestgfse.github.io/Archivetv`.
- **Verify deploys via GitHub API**, not the Pages CDN. The CDN caches for
  minutes; the API is source of truth.

## Key Internal Systems

### Programmed Channels 2.0 (`PROGRAM` const)

Every content channel has a `PROGRAM` entry with:

- `providers[]` — Internet Archive collections + required subjects for
  queries
- `deny{title[], subject[]}` — per-channel deny lists, checked after every
  pick
- `subjRequired`, `noBlindFallback` — prevent off-genre bleed
- `require{runtime_max_s}` — reject items exceeding runtime threshold

The older `G` object still exists as a fallback. **Don't delete G** —
PROGRAM supersedes it but G handles legacy code paths.

### Live Data Tuner Pattern

Every live-data channel (LDATA) has an `async function tune<Name>(ch,sl,my)`
that:

1. Checks `my !== token` and returns early (channel-change race guard)
2. Calls `hideOv()`, `setSig("live","ON AIR")`, `showNow(...)`
3. Renders the layout into `screenArea.innerHTML`
4. Mounts a chan-bug via `mountChanBug()`
5. Fetches data via `fetchJSONResilient()` (direct-first, CORS-relay fallback)
6. Sets up a refresh interval via `rtInterval()`
7. Registers teardown in `chanRT.teardowns` so channel change cleans up

**When adding a new live-data channel, model after `tuneSolar` (channel 973)
or `tuneQuakeMap` (channel 974) — they're the cleanest recent examples.**

### CORS Relay Chain

Not every API sets `Access-Control-Allow-Origin: *`. For those that don't,
we route through a chain of public CORS relays:

1. `api.allorigins.win`
2. `api.codetabs.com`
3. `thingproxy.freeboard.io`
4. `corsproxy.io` (last-ditch — 403s null origins now)

Use `fetchJSONResilient(url, tag)` for JSON — it does direct first, falls
through to the relay chain on failure. Use `fetchTextResilient(url, tag)` for
plain text / XML / RSS.

### Cloudflare Workers

We own two Workers (both on `tdy1990.workers.dev`):

- **`sports-cache.tdy1990.workers.dev`** — proxies + caches ESPN /
  TheSportsDB calls (KV namespace: SPORTS_CACHE). Hard-coded in
  `fetchSportsData()`.
- **`ais-relay.tdy1990.workers.dev`** — WebSocket relay to aisstream.io for
  Ship Tracker. Source in `afterglow_ais_relay_worker.js`. Deploy steps in
  `docs/AIS_RELAY_DEPLOY.md`.

### Channel Bug (Broadcast Ident)

`mountChanBug(hostId, {ident})` returns `{update(main, sub)}`. It renders the
retro cable-box-style channel-ident strip inside the tube. Currently on ~20
channels. Update the two-line readout during channel operation.

### Guide Status

`setChanStatus(ch.num, text)` — the live one-liner that appears in the
guide row for that channel. Live-data channels use this to show current
value ("$3.28/gal", "M5.2 · Peru", "N45.3 E126.4").

### Soak Harness

Built-in soak sampler captures `col/subj/cre/id` per content pick. Run via
DIAG. External Playwright harness: `pw_soak_content.py` +
`soak_summary.py` at repo root.

### CH_RENAMES

Backwards-compat rename map. When we renamed a channel, older cached
favorites still work because CH_RENAMES translates old name → new name at
lookup time.

## Workflow — Every Change

1. **Edit mobile first** (`the_dial_mobile.html`)
2. **Syntax check** — extract `<script>` blocks and run `node --check` on
   each (one-liner in CLAUDE.md)
3. **Test locally** — `python -m http.server 8799` and open in browser;
   Playwright suite in `ci/`
4. **Bump mobile build stamp** — `1.7.7-mobile.NNN` in the file
5. **Port to desktop** — repeat the same change in
   `the_dial_desktop.html`
6. **Bump desktop stamp**
7. **Ship** — `git add . && git commit -m "..." && git push`
8. **Verify** — check deployed build stamps via GitHub API

Commit identity used in past sessions:

```
git -c user.name=esfsfestgfse -c user.email=54010214+esfsfestgfse@users.noreply.github.com commit -m "..."
```

## Content Sourcing Rules

- **Internet Archive public-domain corpus** for all video/audio content
- **Government APIs** (NOAA, NWS, NHC, USGS, NASA) for data channels
- **ESPN (undocumented) + TheSportsDB (free tier)** for sports — cached via
  Worker
- **IPTV**: only defensible sources (iptv-org, world_ip_tv, Free-TV, Tubi,
  Roku, Pluto)
- **NEVER add unverified or pirate sources**

## What NOT to Do

- Do NOT modularize or split the HTML files
- Do NOT relax IPTV sourcing standards
- Do NOT delete the `G` object (PROGRAM supersedes it but G is fallback)
- Do NOT use `raw.githubusercontent.com` to verify deploys (use API)
- Do NOT ship without syntax-checking both files
- Do NOT guess at IA collection names — verify they exist first
- Do NOT reintroduce YouTube `/embed/live_stream?channel=X` — every one of
  those broke; ripped out on 2026-08-14
- Do NOT re-add `explore.org/livecams/currently-live/{slug}/embed` URLs —
  their SPA killed that path

## Owner Context

- Based in Waco, Texas
- Storm chaser, runs "Bellmead Favorite Weatherman" Facebook page
- Co-hosts BWAAA! (King of the Hill rewatch podcast)
- Prefers terse communication, decisive recommendations over option menus
- Treats the AI as a technical partner, not an assistant
- Ownership context: this is a personal-use single-user app running on a
  private computer. Standard-issue "review before push" carefulness applies
  in reasonable measure but the owner sets the workflow.

## Repository

**Public repo:** https://github.com/esfsfestgfse/Archivetv
**Live URL:** https://esfsfestgfse.github.io/Archivetv/
