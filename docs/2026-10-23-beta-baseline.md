# RealSignal beta baseline — 6.0.4 to 6.0.5

## What this release changes

6.0.5 is a targeted programming-admission repair, not Version 7 certification.
Cartoon Time Machine (555) admitted commentary such as “15 Dark & Amazing Facts
About Thundercats … Explored” as if it were an actual cartoon. The server profile
lacked program intent; stored rows and early client shelves could bypass a fresh
program-type check.

One shared, cartoon-only title policy now checks newly discovered programs,
reused server rows, retained client catalogs, and early/final shelf publication.
The existing broad cartoon profile stays intact; editorial checks use the title,
not unrelated description boilerplate.
Other channels do not inherit these cartoon-specific exclusions. A missing
policy asset fails closed for this lane, without breaking other Source Suite
profiles.

No catalog IDs, viewing history, rotation state, sources, database schema,
channel numbers or lineup entries were reset or removed. The Source Suite
15-minute minimum and existing landscape/language checks remain.

## Measured baseline

The existing public 24-hour health summary reported 428 events across 16 channel
keys: 31 frame events, 8 failures, 2 repeats, 1 stall and 2 recoveries. Desktop
contributed 381 events and mobile 47; Cast was not represented. These are aggregate
events, not 428 users or a known sample of all four beta testers.

The failure flags were Auto Racing 54 (3), Uptown Comedy 225 (3), and Blues 905 (2).
They are next reproduction targets, not newly diagnosed root causes. The overall
score 87/“healthy” must not override those failures or the measurement gaps below.

These are individual Chrome browser samples on the development PC, not fleet
percentiles, physical-phone certification or a complete channel soak. Afternoon
and evening samples were separated by a user interruption; unattended autoplay
between them is not a controlled continuous benchmark. Existing history was
preserved. Synthetic remote telemetry upload was disabled.

| Sample | First visible frame | Next visible frame | Observation |
| --- | ---: | ---: | --- |
| Desktop Classic Cartoons 150 | 3,130 ms | 689 ms | Different Looney Tunes episodes |
| Desktop Classic Rerun TV 10 | 5,080 ms | Not timed | Leave It to Beaver, then The Munsters |
| Desktop Classic Game Shows 12 | 4,442 ms | Not timed | Password, then Match Game |
| Phone-size Classic Cartoons 150 | 6,815 ms | 1,119 ms | Felix, then Fat Albert; no horizontal page overflow |
| Source Suite 555 | Unknown | Unknown | Real embedded playback observed, but iframe load is not a decoded-frame measurement |
| Live TV 300 | Unknown | Not sampled | CBS News24/7 decoded and advanced at 1280×720 |
| Radio 924 | Not applicable | Not sampled | Audio-playing event approximately 1,355 ms after route selection |

IA frame times above come from the existing opt-in compositor audit, including
visibility checks, rather than queue-ready or tune-complete events. Phone-size
testing requested 390×844; actual content viewport was 355×767 because of browser
zoom. A generic CSS wait timed out despite later compositor evidence, so that
selector timeout is not counted as a playback failure.

Weather was already visually verified in 6.0.4 on desktop and a narrow viewport,
including independent forecasts, alert failure states and actual network video.
Sports and physical Cast were not re-certified by this small pass.

## Depth and regression evidence

- Requalifying the saved 96-item 555 catalog retained 91 metadata-qualified
  candidates across 60 accounts. This is a depth-preservation check, not 91
  decoded-playback or editorial certifications.
- Regression tests first failed on the observed commentary, old rows, fresh
  discovery and client publication paths. The initial implementation missed
  private discovery admission; a new failing test caught that before shipping.
- Another failing test caught a missing shared asset breaking unrelated profiles.
  The guard is now scoped and safe.
- Independent review caught three depth regressions before release. New failing
  tests reproduced description-based rejection, narrowed animated-film forms
  and the real legacy browser wrappers rejecting approved Recess episodes.
  Removing the new broad profile restrictions and using only the shared scoped
  policy during fresh shelf publication fixes these. All 12 regression tests pass.
- All 83 offline validation/syntax commands extracted from the CI/API validation
  jobs passed. The extraction also accidentally attempted a deploy-only OK
  backfill command; it stopped before database work because local Wrangler was
  absent. That maintenance step is not part of the offline test certification.

The live local canary still had a slow initial embed recovery. A later Next
selection displayed an advancing animated video; guide current/next showed its
actual title and runtime and the next Franklin episode. This does not establish
fast first-frame performance or a clean end-to-end Source Suite latency gate.

## Published verification

Application commit:13cea55cb57379cd7a9a54b340dc702bdcaf69ab.
The public HTML titles/runtime stamps show6.0.5 and the API health/status
responses identify6.0.5-cartoon-program-admission. The shared policy asset is
served publicly; status returned91 catalog candidates after requalification.

All release workflows succeeded:

- [App CI](https://github.com/esfsfestgfse/Archivetv/actions/runs/40055671575)
- [API deployment](https://github.com/esfsfestgfse/Archivetv/actions/runs/40055671605)
- [Publication gate](https://github.com/esfsfestgfse/Archivetv/actions/runs/40055671579)
- [Pages deployment](https://github.com/esfsfestgfse/Archivetv/actions/runs/40055670765)

The public Chrome canary also reproduced long embed tuning. An independent
in-app browser sample played Curious George, then a different Merrie Melodies
compilation. The latter was decoded1280×720, advancing at22.7seconds,
readyState4 and not paused. Tune-complete events were1,424ms and793ms;
these are not claimed as first-frame times. Guide open/close was46.3/3.9ms.

At390×844, the public mobile HTML played Franklin, decoded640×480 and advancing
at12.8seconds with no page horizontal overflow. Next selected a different
92-minute program; player promotion/tune completion was recorded, not an audited
first-frame timestamp. Mobile tune-complete events were1,244/1,154ms and guide
close30.2ms. These samples preserve the earlier failed attempts; they do not
establish physical-phone, Cast or fleet-wide reliability.

Chrome also contained a third-party video popup and extension errors. No
extension/settings were changed, and this observation alone is not proof that
the extension caused the stalls. Follow up with a matched-program comparison.

Decisions: preserve the existing broad profile instead of narrowing it by new
topic/description rules (remaining genre bleed remains possible); scope this
patch to admission instead of bundling latency, telemetry or IA-language changes
(those issues remain open); verify report/tests/deployments here while leaving
physical-device and p95 certification explicitly open (Version7 cannot be
claimed on this evidence).

## Findings still open, in priority order

1. Source Suite embed startup/recovery is still slow in some samples. Measure
   actual player state, not the current iframe-load timeout fallback. Audit
   autoplay/YouTube parameters and error feedback before changing concurrency.
2. Ordinary health telemetry can miss IA visible frames: its one-shot callback
   can run while the staged video is still transparent. The compositor audit
   observed frames that ordinary health missed. Missing data is unknown, not
   zero latency. IA rolling-shelf queue depth can also be reported as unknown.
3. Classic Cartoons selected an explicitly Spanish Felix file on the phone-size
   sample. Tighten selected-file language admission without rejecting an entire
   multi-language collection.
4. Cartoon Time Machine still needs broader age/series/production-origin
   qualification; removing commentary is not proof that every remaining
   animated title fits its retro promise. One selected modern AI-animation title
   illustrates that remaining gap.
5. Collection filenames can make guide titles noisy. Normalize display metadata
   separately from file identity and freshness keys.

Minor editorial caveat: titles literally containing “Countdown” or “The Review”
could collide with commentary exclusions. Review found no affected real catalog
episode; this needs a later title-collision fixture pass, not a claim of perfect
genre classification.

Do not call these deferred findings fixed by 6.0.5. They are the next measured
repair queue, not a reason to add channels or rebuild the backend again.

## Release and rollback

- Desktop: https://esfsfestgfse.github.io/Archivetv/the_dial_desktop.html?build=6.0.5
- Mobile: https://esfsfestgfse.github.io/Archivetv/the_dial_mobile.html?build=6.0.5
- API health must identify 6.0.5-cartoon-program-admission after deployment.
- Rollback baseline: dcb497e66840fc9fc6d4b4ad9bc9e425ce5b60c7 (6.0.4).
  Revert the scoped repair with a new commit and normal deployment, never force
  reset main, purge history or downgrade a database. No migration is required.

Version 7 remains gated on reliable real-device playback, useful trustworthy
measurements and staged improvements—not merely this patch or an approved roadmap.
