# RealSignal 6.0.18 — Focused channel accuracy repair

The follow-up to 6.0.17 corrects six additional records that still passed editorial admission:

- Auto Racing: the fictional feature **Driven (2001)**. Motorsport subject tags do not make it a race broadcast.
- Uptown Comedy: **H3TV #29**, two **Howard Stern** interview records that matched Chris Rock's name, and a **Late Night with Conan O'Brien** episode that matched guest Damon Wayans. Actual Chris Rock Show episodes and stand-up/sketch performances remain eligible.
- Blues: **The Final Cut Radio Advert** from a Pink Floyd collection. Music tracks and genuine radio-session concerts remain eligible.

The same narrow rules run in the IA file contract, relay, desktop and mobile gates, including persisted API playback and current/next guide reads. These are exclusions from admission, not catalog deletion or viewing-history resets. No source, channel, numbering, discovery or player architecture changed.

## Measured scope

Fresh read-only samples contained 96 stored records for each target. Known-policy admission changed Auto Racing 96→95, Uptown Comedy 63→60, and Blues 94→93. Those are candidate counts, not transport/decode-certified catalog totals. Garden Ledger retained all 96 sampled programs under its existing Source Suite qualification.

Replaying the previous 23,128-record capture covering 170 IA lanes and 92 Source profiles found the same five additional exclusions, confined to those three IA lanes. The other 167 IA lanes and Source Suite policy are unchanged. The replay is bounded metadata evidence, not a full-channel playback or semantic certification.

The sixth record was observed starting in the mobile HTML during browser verification, outside that first-page snapshot: *Late Night With Conan O' Brien With Damon Wayans, Gabrielle Reece, Kurt Anderson*. Its show-format collision was reproduced RED, excluded in all four gates, and added to the guide regression before shipping.

Original Archive metadata confirmed the movie, podcast/interview and advertisement identities before editing. Other uncertain music and race-radio records were not blocked merely from suggestive keywords.

## Validation

- New negative fixtures failed against 6.0.17; all 42 file/relay/client qualification tests pass after the repair. Positive fixtures retain racing documentaries, Chris Rock Show guest appearances and blues radio concerts.
- All 16 shared editorial/guide tests pass, including current/next exclusion of the confirmed collisions.
- All 89 offline CI/API commands and three build-stamp tests pass.
- After the extra browser finding, the final 58 file/editorial/guide tests were rerun and passed. Chrome decoded visible Def Comedy Jam and Richard Pryor programs at 640x480 on desktop and a full 1990 NASCAR race at 480x360 in the mobile HTML. These are bounded browser checks, not physical-phone/Cast certification or latency percentiles.
- Desktop/mobile titles, visible stamps, asset cache keys and API release advance together to 6.0.18.

## Telemetry limits

The read-only one-hour dashboard sample had zero events. The 24-hour window had 56 events, one frame and one failure, spanning earlier builds. It cannot establish post-6.0.17 beta performance, freshness improvement or fleet-wide first-frame percentiles. Test playback remains separate from beta telemetry.

Version 7 certification remains open. Version 8 continuity/schedules remain deferred. Rollback uses a normal commit revert; no schema migration or catalog cleanup is needed.
