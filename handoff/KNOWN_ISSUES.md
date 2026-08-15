# Known Issues & Footguns

Read this before you spend an hour debugging something that's already
been diagnosed. Everything here has been root-caused; the entries tell
you what NOT to try again.

---

## 1. Ship Tracker (channel 965) shows no data

**Symptom**: WebSocket opens, subscribe message sent, aisstream.io returns
zero frames, connection eventually closes.

**Root cause**: aisstream.io service-wide outage since 2026-08-05. Their own
issue tracker has 10+ open reports describing identical symptoms
([github.com/aisstream/issues](https://github.com/aisstream/issues) — see
issues `#262`, `#263`, `#269`, `#272`, `#274`, `#276`, and more).

**What's already done**:
- Cloudflare Worker `ais-relay.tdy1990.workers.dev` is deployed and correct
  (source in `afterglow_ais_relay_worker.js`)
- Client (`tuneShips` in both HTML files) is wired to the Worker
- Subscribe format matches aisstream's canonical Python example exactly
- Tested end-to-end with Python WebSocket client — plumbing is 100% correct

**What NOT to try**:
- Don't change the subscription JSON format — it's already correct
- Don't rewrite the Worker — verified working
- Don't debug the browser client — verified working
- Don't generate more aisstream API keys — the service is silent regardless

**Actual fix paths**:
1. Wait for aisstream to come back
2. Swap to a paid AIS provider (MarineTraffic, VesselFinder)
3. Swap to GlobalFishingWatch (research access, application required)
4. Swap to BarentsWatch (Norway-focused, free)

---

## 2. YouTube channel-based embeds are broken (ecosystem decay)

**Symptom**: `<iframe src="https://www.youtube.com/embed/live_stream?channel=X">`
returns 200 HTML but the playability check fails inside the iframe. Viewer
sees YouTube's "channel not currently live" placeholder even when the
channel IS live.

**Root cause**: YouTube quietly deprecated the reliability of this URL
pattern. Most broadcasters disable embedding on their live streams.

**What's already done**:
- All `type:"youtube"` entries removed from `LIVECAMS_STREAMS` on
  2026-08-14
- Replaced with HLS entries where available (nature cams: WildEarth,
  Love Nature, Samsung Wild Life, PBS Nature, Safari TV, Outdoor America,
  BBC Earth)
- Highway Cams rebuilt with `type:"jpg-refresh"` using Caltrans direct JPG
  URLs
- NASA Live rebuilt as bespoke image slideshow (SDO/APOD/EPIC)

**What NOT to try**:
- Don't re-add `youtube.com/embed/live_stream?channel=X` — every one broke
- The code still has `ytEmbedUrl()` and `exploreEmbedUrl()` functions
  defined but unused; safe to remove if you want to clean up

---

## 3. explore.org iframe embeds go 404

**Symptom**: `https://explore.org/livecams/currently-live/{slug}/embed`
returns 404 for every slug.

**Root cause**: explore.org migrated to a Next.js SPA and killed the old
embed URL pattern.

**What's already done**:
- All `type:"explore"` entries removed from `LIVECAMS_STREAMS`
- Substitute wildlife content via Cornell Lab of Ornithology YouTube +
  Nat Geo WILD + WildEarth Kruger HLS (but see issue #2 — the YouTube
  ones are fragile)

**What NOT to try**:
- Don't guess new explore.org embed URLs — their SPA doesn't expose stable
  ones
- If you want individual explore.org cams, you'd need to reverse-engineer
  each cam's underlying YouTube video ID and hard-code (fragile)

---

## 4. Cloudflare Workers `fetch()` requires `https://`, not `wss://`

**Symptom**: Worker returns 502 with body
`"aisstream connect failed: Fetch API cannot load: wss://stream.aisstream.io/v0/stream"`.

**Root cause**: Cloudflare Workers `fetch()` scheme validation rejects
`wss://`. The upgrade to WebSocket happens because of the
`Upgrade: websocket` header, not the URL scheme.

**Fix**: use `https://` and rely on the header. See
`afterglow_ais_relay_worker.js` line 30.

---

## 5. Caltrans DOT camera JSON API is intermittent

**Symptom**: `cwwp2.dot.ca.gov/data/d{N}/cctv/cctvStatus{DN}.json` times out
frequently.

**Impact**: Live pull of new highway cams is unreliable — code uses a
curated static list of ~10 verified JPG URLs instead of live-fetching.

**Fix if you want more cams**: retry the JSON with backoff, or use static
verified URLs. The image endpoint itself is reliable — it's the JSON
catalog that flakes.

---

## 6. Solar Dashboard image URLs at SWPC animations path 404

**Symptom (fixed already)**: `services.swpc.noaa.gov/images/animations/sdo/{aia171,aia304,hmib}/latest.jpg`
all return 404.

**Root cause**: SWPC changed URLs at some point in 2025-2026.

**Fix already applied**: use `sdo.gsfc.nasa.gov/assets/img/latest/latest_512_*.jpg`
directly + SWPC SUVI at `services.swpc.noaa.gov/images/animations/suvi/primary/{171,304}/latest.png`.

**Lesson**: verify NASA/NOAA image endpoints periodically. They rearrange
paths without deprecation notices.

---

## 7. Pre-existing latent bug fixed in mobile.185

`.chcell-old-unused` comment header at line ~523 of `the_dial_mobile.html`
had two selectors below it that targeted `.chcell` (not
`.chcell-old-unused`), cascade-clobbering the guide typography since
1.6.x. Removed. If you see similar "old" or "unused" naming patterns,
verify the actual selectors match the label.

---

## 8. Aisstream keys don't error, they silently drop

**Symptom**: Invalid/inactive aisstream API keys don't return the documented
`{"error": "Api Key Is Not Valid"}` message. They just accept the
connection, silently drop the subscription, and close after ~30 sec.

**Detection**: If you're diagnosing a "connect + subscribe + silence"
issue, test with a different key AND a different bounding box (their own
canonical `[[[-11,178],[30,74]]]` should never be empty). If both silent,
the key is dead or the service is down (see #1).

---

## 9. NASA APOD DEMO_KEY is heavily rate-limited

**Symptom**: `api.nasa.gov/planetary/apod?api_key=DEMO_KEY` returns 429
during high-traffic hours.

**Impact**: NASA Live channel + APOD channel don't get today's picture.

**Fix**: register a personal NASA API key at api.nasa.gov and replace
`DEMO_KEY` in `tuneAPOD` and `tuneNASALive`.

---

## 10. Open-Notify.org (ISS) is dead

**Symptom (fixed)**: `api.open-notify.org/iss-now.json` and
`api.open-notify.org/astros.json` return no response (timeout).

**Root cause**: their infrastructure has been intermittent for months.

**Fix already applied**: swapped ISS Tracker (953) to
`api.wheretheiss.at/v1/satellites/25544`. The astros crew-list panel was
replaced with a static TELEMETRY panel.

**What NOT to try**: don't try to bring open-notify back online. If
wheretheiss.at also fails someday, look at N2YO or Celestrak instead.

---

## Historical Debt Notes

- Original repo name is `Archivetv`. App was rebranded to AFTERGLOW on
  2026-08-14 but the URL path still says `/Archivetv/`. Renaming the repo
  would break the deploy URL, so we didn't.
- `AISSTREAM_KEY` constant in `tuneShips` code is now dead (Worker
  injects the key from Cloudflare Secret). Safe to remove in cleanup.
- `ytEmbedUrl()` and `exploreEmbedUrl()` functions defined but no longer
  called. Safe to remove in cleanup.

## Reference

**Their own issue tracker for aisstream**:
https://github.com/aisstream/issues

**Cloudflare Workers WebSocket docs**:
https://developers.cloudflare.com/workers/runtime-apis/websockets/
