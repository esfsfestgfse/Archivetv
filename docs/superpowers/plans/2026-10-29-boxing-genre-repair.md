# Channel 56 boxing genre repair

Preserve the existing sports rotation, event identity, viewer history, recovery and Cast ownership. Keep channel 52's MMA programming separate from channel 56's boxing cards, bouts and substantial boxing documentaries.

Evidence: public Archive metadata identifies `KillersWife` as an Abbott and Costello episode with boxers in its cast. Its boxing subject tag bypassed the old genre checks. The production catalog also contains video-game lists, interviews, tutorials and striptease.

- [x] Reproduce subject-tag contamination in relay, API, file admission and both saved client shelves. Require program-level boxing/event evidence and reject non-program formats without using incidental description words to reject full broadcasts.
- [x] Requalify the existing catalog and add verified file-level full bouts/cards so stricter filtering preserves depth. Validate metadata, selected-file duration, landscape dimensions and bounded media transport.
- [ ] Test multiple rotations, actual Chrome playback, Next and guide; run affected release checks, push/deploy 6.1.3, then verify hosted behavior and the visible stamp.

No per-tune metadata searches or new service bindings. Historical shorts remain outside this lane's existing 15-minute floor. Catalog counts do not substitute for visible playback or full recording review.

## Local verification
- 49 selected landscape files from 45 Archive parents pass metadata/runtime admission and MP4 range checks. Known non-English collection and unrelated/countdown/fragment files were excluded. Unknown audio language remains unknown, not certified English.
- Five actual API/relay shelves return 25 distinct file selections, five ready per shelf, with 49 qualified candidates and zero duplicate file selections or rejected catalog rows. This is not a claim of 25 independently reviewed unique events.
- Reproduced and fixed the channel 56 MMA substring exclusion matching Muhammad Ali. Explicit watchalongs/commentary-only streams are rejected after one fresh review; full bouts with English commentary remain allowed.
- Legacy direct media with unknown duration must hydrate before being ready, preventing old 1-8 minute recordings from bypassing the runtime floor. Discovery indexes remain eligible for background work.
- 38 focused tests and all 96 existing CI/API Node command groups pass. Chrome shows actual boxing video; representative visible first frame 863ms and Next1189ms, plus current/next guide data. No physical phone/Cast certification claimed.
- Hosted deployment and final public canary remain the publish check.
