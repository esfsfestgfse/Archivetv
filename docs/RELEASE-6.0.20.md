# RealSignal 6.0.20 — IA Next continuity

This is a targeted playback and admission repair based on controlled Chrome usage, not a new architecture or a full-lineup certification.

## Confirmed failures and repair

Classic Cartoons 150 reached ten distinct decoded programs, then Next entered a persistent tuning loop. The built-in network log repeatedly recorded `IA repair 400`. The bounded reservation catalog can evict a played record when importing a large collection. The later Skip/completion acknowledgement was rejected, and the client's ordered outbox then prevented every subsequent queue request.

Terminal acknowledgements now accept an exact episode already recorded in that session's durable seen ledger even when the bounded catalog no longer contains it. Unknown IDs and attempts to start evicted media remain rejected. Late acknowledgements cannot clear a different currently playing episode; legacy parent/file identities are compared canonically. No history reset, admission relaxation, or catalog deletion is involved.

The Source Suite check also encountered `Sx05wFa494k`, “Black Ants vs Red Ants,” from Ai Clash Zone (`UCa56NpS_ul3xsCBatFQ7kgA`). The actual embedded player displayed YouTube's AI label. The shared client/server guard now excludes that confirmed uploader and video, including older cached records without disclosure metadata. This is a specific evidence-backed exclusion, not a claim to identify every undisclosed synthetic video.

## Playback observations before repair

Each native channel received an initial start and ten Next actions without clearing viewer history. Native timings are compositor observations from the opt-in playback audit.

| Channel | Decoded starts | Distinct episodes | Median visible start | Finding |
| --- | ---: | ---: | ---: | --- |
| 10 Classic Rerun TV | 11/11 | 11 | 2.56 s | Seven Benson episodes, including six consecutively; series balance still needs work |
| 150 Classic Cartoons | 10/11 | 10 | 2.49 s among successes | Persistent HTTP 400 acknowledgement loop on the tenth skip; reproduced on retune |
| 22 Modern Game Shows | 11/11 | 11 | 2.99 s | Jeopardy, Wheel of Fortune, Card Sharks and Divided; no exact repeat in this sample |
| 555 Cartoon Time Machine | 11/11 | 11 | 1.75 s identity-matched decode observation | One confirmed unwanted AI item, now excluded |

For channel 555, each counted start required an embedded video link matching the selected YouTube ID, landscape decoded dimensions, and an advancing unpaused video clock. Its timings include browser observation overhead and are not native compositor first-frame metrics. An earlier, weaker clock-only-plus-dimensions pass was not used for this table.

Classic TV's raw 96-row catalog sample had only 25 presently admitted records, 17 from Benson. Stored depth therefore overstates playable series diversity. This release fixes the blocking acknowledgement failure; it does not claim to have repaired that remaining catalog-balance issue.

## Regression guard

- Five reservation tests cover eviction, recovery of an already-evicted session, unknown identities, late acknowledgements, legacy parent aliases, singleton exhaustion, and existing multi-family rotation.
- Captured AI video/uploader fixtures reject both fresh and stored Source Suite admission.
- All 90 offline CI/API commands pass after the final changes.
- Three build-stamp fixtures pass; desktop/mobile titles, visible build stamps, cache keys, and API release advance together to 6.0.20.

Hosted recovery is checked after API deployment against the previously stuck browser session. Physical mobile and Chromecast testing are not part of this controlled Chrome pass. No recurring task was created, channel lineup changed, or V8 scheduling work started.
