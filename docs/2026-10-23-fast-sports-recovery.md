# RealSignal 6.0.2 — Live TV and Sports recovery

## Scope

IA genre/catalog work remains paused. No IA channel numbers, content rules,
rotation history, Cast protocol or Roku-device preview were changed.

## Repairs

- Parse quoted commas and comma-separated playlist attributes without corrupting titles.
- Consolidate same-name/quality-suffix duplicates into serializable provider variants.
- Source views find alternate providers instead of inspecting only the primary row.
- Open Live TV on FAST services by default; community IPTV remains selectable.
- Completed background catalogs refresh the visible Live TV rows once, not just
  the source dropdown. Stale-screen callbacks and reload loops are guarded.
- A size-limited saved directory samples providers fairly instead of truncating away
  the later FAST services. Old catalog snapshots are refreshed to schema version 2.
- Retrieve apsattv public catalogs through the existing relay when browser CORS fails;
  unwrap catalog relay URLs before choosing a playback route.
- Skip the narrow HLS relay for unsupported hosts; preserve custom proxy precedence.
- Prefer a recently decoded same-title provider over a recently failed one, without
  changing the frozen attempt order midway through recovery or permanently banning it.
- Enable only Roku's `delivery.roku.com` video CDN on the existing HLS-aware relay.
  Relative child playlists resolve against the final CDN, not the jmp2 shortener.
- Every playback attempt has its own owner. Superseded library loads, fatal callbacks
  and deferred retries cannot replace or destroy a later manual selection.
- Start the 10-second per-route first-frame deadline before player/manifest loading.
  The optional library gets 2.5 seconds before native HLS fallback. A TV feed with
  only audio is not marked healthy. Recovery never selects an unrelated channel.
- Sports uses the shared warmed directory and accepts completed background catalogs
  without rebuilding the playing video. Alternate providers survive incomplete tags.
- Remove Sports automatic rotation, including the menu action and saved true preference.

## New service options

Tablo and Fire TV public catalog feeds are included, with separate source filters.
Local Chrome canaries decoded actual 1920×1080 video with advancing clocks:
Tablo / ALLBLK Gems and Fire TV / Vice TV. These are sample proofs, not a guarantee
that every channel in either external catalog is available in every region.
Free-TV's existing Sports contribution is retained in the shared directory with
its own source filter; English-region feeds are admitted, not YouTube/watch pages.

Playlist attribution: [apsattv](https://www.apsattv.com/streams.html) and
[BuddyChewChew's public FAST generator](https://github.com/BuddyChewChew/app-m3u-generator).
Additional community IPTV attribution: [Free-TV](https://github.com/Free-TV/IPTV).
This change does not bypass account, DRM or region restrictions.

## Verification before client publication

- 65 unique offline CI commands passed after review fixes.
- 62 actual-function client regression cases passed (desktop and mobile).
- 3 relay tests passed: Roku final-base rewriting, blocked private/unapproved
  redirect targets, and binary key handling.
- Independent scoped review found three edge cases; all three were reproduced
  and repaired with regression tests. Relay/workflow review found no actionable issues.
- All 21 previously configured public playlist feeds responded. Bounded two-item
  media probes across 23 feeds distinguished manifests from media responses.
- Roku Unbeaten Sports played visible 1920×1080 video after relay deployment.
- Pluto 00s Replay, Tablo ALLBLK Gems and Fire TV Vice TV played visible video.
- A Tubi A&E Crime 360 selection recovered to the same title on Pluto, not an
  unrelated station. Xumo Willow Sports played in Sports; opening/closing the guide
  preserved video and leaving the Live TV subview removed the player.

Relay commit: `98630e4`; deployment workflow `39988657241` succeeded.
The 6.0.1 public canary exposed the partial-directory refresh edge; 6.0.2
includes its targeted repair and version bump before final handoff.
Client hosted CI/Pages and final public-browser verification are release gates;
their final results are recorded in the delivery message.

## Known external limitations

Distro FTF/Horizon samples currently fail upstream DNS (530); sampled Cineverse
and VIDAA routes did not produce usable child playlists. Some Tubi, Samsung GB
and Fire TV entries also failed samples. These results do not establish that
entire services are dead, so no whole provider was removed on that basis.
Working same-title providers remain available for recovery. Health strikes are
temporary; external feeds and regional availability cannot be guaranteed.

The 10-second bound is per route, not a universal end-to-end channel-start promise:
multiple provider attempts can take longer. Native fallback is behavior-tested;
this release does not claim a new physical iPhone/Android/Cast certification.
