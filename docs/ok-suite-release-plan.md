# OK suite: shared-engine release plan

All OK profiles use the existing public search, official embed player, server
catalog, and rotation infrastructure. No private/signed video URL extraction.
New channels configure the common pipeline; they do not receive new backends.

## This release

- Long freshness history applies to every registered OK profile, not a hardcoded
  subset of older channel names.
- Episode identity recognizes season/episode punctuation and alternate uploads.
- Unseen programs stay ahead of watched programs in desktop and mobile catalogs.
- Pending tunes survive background shelf refreshes. Cancelled tunes cannot
  reject the replacement shelf. Loaded players that never start get bounded
  recovery; explicit pauses, autoplay restrictions and ads are not failures.
- Black Television can launch based on overall programming depth. Missing Martin
  does not block unrelated verified shows. Martin must mean the Lawrence sitcom.
- British and factory channels retain their existing programming restrictions.

## Remaining rollout

1. Deepen History Vault and launch Science Lab with actual playback evidence.
2. Gearhead TV: English automotive programs, never late-night Jay Leno.
3. Cookhouse: cooking/food programs; Julia Child, Pepin, Great Chefs and others.
4. Video Hits: 1980–2009 music videos, MTV-inspired, not affiliated with MTV.

## Music admission gate (Soul & Flow 597 and Country Video 598)

Use the same OK discovery/storage/playback engine with a music-video profile.
Verify track identity and original release year using MusicBrainz; upload dates
and an artist's career dates are not sufficient. Apply landscape, genre and
video-format checks. Reject lyrics-only/audio-only, reactions, fan edits, parody,
podcasts and unrelated performances. Deliberately allow normal music-video
runtimes rather than forcing a 15-minute television floor. Rotate artists, with
eight-play artist separation when inventory permits. Do not publish empty lanes.
MusicBrainz discovery runs only in background maintenance; viewer requests use
the shared D1/verified-bootstrap path. Exact artist/song matching and canonical
artist IDs prevent later reissues from replacing an original release era.
Incomplete recording-search pages are withheld rather than guessed.

## Still to prove or implement

- Visible frames, skip behavior and guide integration for each newly exposed lane.
- Automated cross-session series-share limits; do not claim a 30% cap is already
  enforced. It requires at least four healthy program families to be feasible.
- Independent spoken-language verification: curated English program/title
  evidence is not a guarantee that an upload has not been dubbed.
- Continued discovery beyond initial program seeds, without relaxed genre gates.
- A rolling 1 playing + 2 ready shelf without a blocking full-catalog rebuild.

Each verified release gets a new desktop/mobile stamp. Vimeo remains paused.

## 5.5.80 launch candidate

- Channel 597: OK Soul & Flow, an independent BET-inspired 1980–2009 music-video
  channel. It is not a BET feed or affiliated with BET.
- The launch canary verified 50 public embeds representing 42 distinct songs
  and 24 artists across the 1980s, 1990s and 2000s. This is a bootstrap catalog,
  not a whitelist or a claim of unlimited depth. Scheduled rotating artist
  searches add newly qualified programs to the same durable catalog.
- Alternate uploads share recording identity, and the persistent local history
  separates artists by eight plays when inventory permits, including after
  genuine catalog exhaustion. Unseen tracks always take priority over repeats.
- Music metadata survives the Worker/D1 read path. Normal music-video runtimes
  are allowed only in this profile; other television/movie floors remain intact.
- Browser startup testing caught the legacy final runtime gate and its wrapper
  dropping music below fifteen minutes. Both are now covered by failing-then-
  passing regression tests. Chrome showed visible frames for En Vogue, Janet
  Jackson, Mary J. Blige and Anita Baker; desktop/mobile Next and current/next
  guide data worked. This is browser-layout evidence, not physical-device or
  Chromecast certification. Hosted deployment still needs confirmation.
- Independent review caught post-exhaustion artist spacing and weaker client
  title admission. Paired server/browser rejection tests and canonical-history
  rotation tests reproduced the failures and now pass after targeted fixes.
  The bounded review follow-up cleared both findings; all 54 local CI/deploy
  commands and the complete 50-upload server/browser admission check passed.
- Metadata/official-embed checks are not an independent license determination
  or a guarantee that every provider upload stays available indefinitely.

## 5.5.81 cold-catalog follow-up

Production verification caught alternate uploads in the very first no-D1
response; later stored-catalog responses were already canonical. The startup
search, manifest and merge rails now deduplicate by song before returning,
retain the deeper bootstrap without provider requests, and are covered by a
failing-then-passing empty-catalog regression. Existing TV/movie rails are
unchanged. The visible stamp is bumped for this follow-up.

## 5.5.82 Country Video

- Channel 598: OK Country Video, CMT-inspired country music videos from 1980
  through 2009. Independent channel; not affiliated with CMT.
- Twenty rotating four-artist discovery windows produced 117 public embeds.
  After excluding a Music City Tonight performance, the admitted bootstrap is
  116 embeds: 100 distinct songs and 55 artists. The upload inventory spans 22
  1980s, 47 1990s and 47 2000s entries. Alternate uploads are one song in playback.
- Country and Soul share search, original-year verification, D1, official
  embeds, Next and guide integration. Country has a separate genre/family and
  viewing ledger; old Soul rows without a family remain backward compatible.
- Scheduled maintenance now advances both independent artist catalogs. Provider
  discovery and MusicBrainz checks remain off the viewer's startup path.
- Real Chrome canary showed Trace Adkins and Lee Ann Womack video frames;
  Next and current/next guide open/close worked. Physical-device testing is not
  implied. Hosted deployment and final regression evidence follow below.
- The five ready items are a shelf, not the catalog. The shared 96-item window
  and durable catalog remain intact; the verified bootstrap is not a whitelist.
- Mobile visual testing caught the performance-show title loophole before
  publishing. Reproducing server/browser tests failed first, then passed after
  excluding performance shows and fan films from the shared music gate.

## 5.5.79 verification record

- Focused contract, depth, freshness and runtime tests pass locally, including
  real SQLite tests covering sixteen five-item rotations and long OK history.
- Chrome showed actual frames for Jamie Foxx, The Wayans Bros, A Different World
  and Bernie Mac through consecutive Next actions. Desktop guide open/close
  preserved playback and showed current/next program data.
- The mobile page played Jamie Foxx through its own remote and guide. This is
  browser evidence, not physical Android or Chromecast certification.
- Independent review reproduced three edge cases: suppression before iframe
  load, alternate episode reinsertion, and watched rows outside the active
  catalog window. Regression tests first reproduced these failures; the fixes
  now pass. Canonical history lookup includes inactive originals without
  admitting them to playback.
- Review follow-up cleared all three findings, and all eighteen focused tests
  passed again after the fixes. Hosted build stamp, CI, API deployment and Pages
  deployment must still be checked after pushing.
