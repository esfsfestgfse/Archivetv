# Coaches' Clinic 68 — 6.1.22 repair

> Execute inline with superpowers:executing-plans; one bounded fresh final review. User explicitly skipped 67; do not alter Women in Sport.

**Goal:** Replace the reproduced coach-interview/game/medical-promo shelf with substantial real sports-instruction programs and healthy rotation.

**Architecture:** Existing relay/API/session/HTML playback pipeline; add reviewed file-level coaching records, enforce one synchronous coaching identity rule at every admission boundary, balance sports in the existing selector and retain full viewer exclusions/cooldowns. No new services, bindings, migrations or synchronous discovery on tune.

**Spec:** Existing channel description: playbooks, drills, conditioning and the craft of coaching. Landscape, selected runtime >=900 seconds, original sports instruction. Coaching demonstrations/clinics are intentionally instructional; do not apply other sports channels' blanket training/tutorial ban. No podcasts, unrelated games, coach interviews, career/college promotions, fiction, medical drama, games, portrait or short/unknown ready files. Preserve original intermissions and genuine instruction chapters >=15 minutes.

- [x] Production baseline: five recovery sources, no selected-file durations; production ready shelf includes Blaine Coach & Captains interviews and an ordinary baseball game.
- [x] Bounded Archive search and metadata review; expand selected full instructional files and deduplicate encodes without inventing depth.
- [x] Write behavioral failing admission/depth/balancing and old-D1/cooldown regressions; implement the minimal repair.
- [x] Probe all 24 primary media URLs; four queue rotations returned 20 distinct programs. Real browser start plus five skips across six sports showed visible frames, no repeats/stalls, matching current/next guide and successful dismissal.
- [x] Final 96-command release gate passed, including 192 sports tests. One fresh review; both reproduced findings fixed through failing-then-passing tests. Visible/API stamps 6.1.22.
- [ ] Commit/push/deploy and verify public stamps/playback.

Review focus: broad parent sports tags must not admit a game/bonus/podcast child; actual instruction must survive descriptions mentioning interviews or commercials; source geometry/duration/language must survive cache/API paths; the small shelf must rotate through the deeper file bank; old D1 and failed-file reservations must not undo the repair. Unknown language and genuinely limited disciplines are not evidence of infinite depth.

Outcome before publication: 24 reviewed lessons/23 Archive parents, eight sports (10 basketball, 5 golf, 4 tennis, 1 each baseball/soccer/volleyball/wrestling/kayaking). Selected MP4 geometry, duration, exact filename, observed item CDN origin, alternate URL, source title, rights and language declarations are retained. Original/derivative encodes are not counted as different lessons. Candidates with uncertain bilingual/game-promo/podcast identity were held out rather than padding depth. No claim of an unlimited catalog or full-video/device certification.

Actual local first frames: 832/140/942/191/138/275 ms, with five Next clicks moving basketball → tennis → soccer → golf → wrestling → volleyball. The guide matched Coaching Youth Volleyball and next Retendo. Those are browser samples, not guaranteed latency. Preview maps both normal V2 and explicit V3 routes to the repaired local API, avoiding the previous preview-route ambiguity.

Review findings: selected filenames Full Basketball Game and Lakers vs Celtics could inherit a coaching parent identity. Corrected the regression fixture to use matching media URLs (the first fixture falsely passed on URL mismatch), then reject actual game children before parent inheritance while preserving Man vs Zone Defense Drills. Football Training/Basketball Conditioning/Boxing Fundamentals were over-rejected; restored the intended training/conditioning and boxing/rodeo vocabulary without accepting life/business coaching. Reviewer closed. No channel 67 changes.

Production follow-up 6.1.23: initial deployment e229640 passed CI and four fresh rotations (20 distinct), but its 23-candidate response exposed one valid reviewed lesson being dropped. The generic game-number filter interpreted The Short Game 1991 as a game number. Added failing year/lesson-number fixtures, preserve explicitly instructional child titles and limit ordinary numbered-game matching to 1–3 digits. Recheck every raw reviewed record, rather than only the already-filtered bank, so this cannot hide behind a minimum-depth assertion. Invalidate the targeted 68 policy fingerprint. Same media URLs and unchanged 24/24 transport evidence; no additional source crawl.
