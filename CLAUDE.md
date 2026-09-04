# Archive TV ("The Dial") — Project Context

## What this is
A retro CRT-styled "channel dial" web app — a browser-based television that channel-surfs
between public-domain video, live sports, real government weather/hurricane data, live IPTV,
and real-time data feeds. Runs as a PWA on Android and a bookmarked page in desktop Chrome.

## Architecture — LOAD-BEARING CONSTRAINTS
- **Single-file HTML.** Both builds are self-contained — all markup, CSS, and JS inline.
  No framework, no bundler, no npm build step. This is a stated product requirement, not
  an oversight. Do NOT modularize.
- **Two builds:** `the_dial_mobile.html` (mobile/PWA) and `the_dial_desktop.html` (desktop).
  Edited independently, merged by hand. Every change to mobile must be ported to desktop.
- **Deploy via git push.** `git add . && git commit -m "message" && git push` deploys to
  GitHub Pages at esfsfestgfse.github.io/Archivetv.
- **Verify deploys via GitHub API**, never the Pages CDN (which caches stale content for minutes).

## Current builds
Check with: `grep '__ATV_BUILD=' the_dial_mobile.html the_dial_desktop.html`

## Key systems

### Programmed Channels 2.0 (PROGRAM const)
Every content channel (61 total) has a PROGRAM entry with:
- `providers[]` — collections + required subjects for IA queries
- `deny{title[], subject[]}` — per-channel deny lists checked after every pick
- `subjRequired`, `noBlindFallback` — prevent off-genre bleed
- `require{runtime_max_s}` — reject items exceeding runtime threshold

The old `G` object still exists as fallback but PROGRAM is the active authority.

### Sports-data cache (Cloudflare Worker)
All ESPN/TheSportsDB calls route through `fetchSportsData()` →
`https://sports-cache.tdy1990.workers.dev`. Hard-coded, no config needed.
Worker source: `archive_tv_sports_cache_worker.js` (KV namespace: SPORTS_CACHE).

### Live Radio (SomaFM + radio-browser)
`fetchSomaFM()` + `rbSearch()` with `radioNormName()` dedup. Vintage wooden
cabinet UI with 7-slot station strip.

### Channel-bug (broadcast ident strip)
`mountChanBug(hostId, {ident})` returns `{update(main, sub)}`. Currently on 20 channels.

### Guide status
`setChanStatus(ch.num, text)` — live one-liner in the channel guide. 20 channels feed it.

### Soak harness
Built-in soak sampler captures `col/subj/cre/id` per content pick.
Run via DIAG in the app. External harness: `pw_soak_content.py` + `soak_summary.py`.

## Workflow for every change

1. **Edit mobile first** (`the_dial_mobile.html`)
2. **Syntax check:** Extract scripts and run `node --check` on each
3. **Test:** Serve locally, run Playwright tests (tune-all, regression, OSD sweep)
4. **Bump build stamp:** `sed -i 's/mobile\.NNN/mobile.NNN+1/' the_dial_mobile.html`
5. **Port to desktop** (`the_dial_desktop.html`) — same changes, verify parity
6. **Bump desktop stamp**
7. **Ship:** `git add . && git commit -m "description" && git push`
8. **Verify:** Check deployed build stamps via GitHub API

## Syntax check one-liner
```bash
python3 -c "
import re
h=open('the_dial_mobile.html',encoding='utf-8').read()
for i,s in enumerate(re.findall(r'<script[^>]*>(.*?)</script>',h,re.S)):
    open(f'/tmp/chk_s{i}.js','w',encoding='utf-8').write(s)
" && for f in /tmp/chk_s*.js; do node --check "$f" || echo "FAIL: $f"; done && echo "syntax ok"
```

## Test suite
CI scripts in `ci/` directory:
- `ci/test_tune_all.py` — tunes every channel discovered from the live registry, asserts zero page errors
- `ci/test_regression.py` — 10-point functional check covering power, tuning, guide open/close, build identity, and page errors

Run locally:
```bash
pip install playwright && playwright install chromium
python -m http.server 8799 &
python ci/test_tune_all.py http://localhost:8799/the_dial_mobile.html
python ci/test_regression.py http://localhost:8799/the_dial_mobile.html
```

## Content sourcing rules
- Internet Archive public-domain corpus for all video/audio content
- Government APIs (NOAA, NWS, NHC, USGS, NASA) for data channels
- ESPN (undocumented) + TheSportsDB (free tier) for sports — cached via Worker
- IPTV: only defensible sources (iptv-org, world_ip_tv, Free-TV, Tubi, Roku, Pluto)
- **NEVER add unverified or pirate sources**

## What NOT to do
- Do NOT modularize or split the HTML files
- Do NOT relax IPTV sourcing standards
- Do NOT delete the G object (PROGRAM supersedes it but G is fallback)
- Do NOT use raw.githubusercontent.com to verify deploys (use API)
- Do NOT ship without syntax-checking both files
- Do NOT guess at IA collection names — verify they exist first

## Owner context
- Based in Waco, Texas
- Storm chaser, runs "Bellmead Favorite Weatherman" Facebook page
- Co-hosts BWAAA! (King of the Hill rewatch podcast)
- Prefers terse communication, decisive recommendations over option menus
- Treats Claude as a technical partner, not an assistant
