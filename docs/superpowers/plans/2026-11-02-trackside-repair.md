# Trackside 64 — 6.1.13 targeted repair

Goal: retain long-form athletics meets/sessions, road-running broadcasts and substantial athlete documentaries. Remove reproduced city-government, video-game, short-clip and mixed-Olympics contamination; provide accurate selected-file titles and fresh rotations.

Architecture: reuse qualified Olympic athletics files through the existing relay repair banks, add inspected non-Olympic files, and keep the API/rolling shelf/viewer freshness/event recovery architecture. No services, bindings, migrations or synchronous discovery.

- [x] Capture production baseline: five ready / 88 candidates; State of the City relay-race presentation, Game Boy, short clips, ambiguous BBC Olympic files, and recursively appended/wrong session titles.
- [x] Reproduce these admission failures at relay, file/API and saved desktop/mobile boundaries. Require selected-file runtime and athletics identity; preserve real sessions and original intermissions.
- [x] Reuse the reviewed Olympic athletics bank, inspect more athletics/road-race/documentary files, verify transport, and preserve date/discipline/gender/session identity and balanced rotation.
- [x] Check repeated rotations and representative decoded video, Next and guide; complete one bounded review and correct its three reproduced findings.
- [x] Complete the final CI/API gate, publish, and verify hosted 6.1.13 (2609ec1).

Review focus: mixed Olympic parent labels must not approve unrelated children; school/college “athletics” can mean other sports; scheduled sessions/rounds and gender stay distinct; derivative copies of one event should not bypass history; reservation cooldowns and saved-media metadata survive. Whole-video completeness and physical phone/Cast certification are outside this bounded check. Preserve unrelated artifacts.

Local evidence: 106 reviewed files / 94 event identities, eight athletics categories; six API rotations with 30 distinct selections and no policy rejections; eight representative recordings decoded visible landscape frames. The fresh-origin app reached its first frame in 2.408 seconds, Next in 505 ms, and guide open/close retained playback.

Review repairs: reject unrelated children hidden under mixed Olympic parent labels; preserve gender/group/discipline identity through compaction and generic filenames; remove temporarily failed files from nested recovery copies until cooldown expiry. A final client parity check reproduced 40 valid files rejected by the old theme vocabulary; both clients now admit all 106 while the stricter selected-file policy continues to reject contamination.

Hosted 6.1.13: CI and all four deploy/publish runs succeeded; both public titles and API release matched. Six rotations returned 30 distinct selections, five ready each / 96 candidates. Actual Chrome first frame was 2.765 seconds and Next was 570 ms.

Follow-up found by a real second skip: after a played upload left the returned catalog, its alternate Olympic-session recording could reappear. Legacy client history stored only the upload ID. A reproduced desktop/mobile regression now stores the stable sports event key alongside that ID; the existing API excludes it without rediscovery or a new freshness owner. Both original and alternate remain available for same-event recovery.

6.1.14: 40 affected sports/client tests and 90 guide/playback/telemetry tests pass, plus API contract and both HTML syntax/stamp checks. The original 96-command / 148-sports-test 6.1.13 gate remains valid for unchanged catalog/admission/recovery code.
- [x] Publish 6.1.14 (4628489); continue the bounded browser rotation check. Superseded by the cache-identity follow-up below.

6.1.15 follow-up: an old rapid-tune record used its Archive CDN URL as its ID, so the same file could re-enter the queue under parent::filename. Normalize Archive-owned direct URLs to that exact file identity in the shared sports helper, persist the distinct canonical key, and reject current-event copies from stale client queues. No source/cache/history clearing or new discovery service. The reproduced cached Jesse Owens → athletics → Jesse Owens sequence now advances to different programs.

Final local gate: all 96 commands pass, including 153 sports tests. One extracted-function test initially failed because no browser window exists in its VM; the optional sports adapter now has an explicit environment guard. Re-ran that 99-test depth suite and all affected sports, playback, guide, API and HTML checks successfully.
- [ ] Push 6.1.15 and verify hosted visible playback, skips, guide and version stamps.
