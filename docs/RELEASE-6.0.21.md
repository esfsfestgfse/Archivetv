# RealSignal 6.0.21 — Stable IA catalogs and background verification

Classic TV's confirmed imbalance was a pipeline failure, not evidence that only Benson was available. A fresh production sample contained 96 stored rows but only 25 with current file qualification; 17 of those were Benson. Most other transport checks were 49–137 hours old. The new canary also reproduced eight different query/catalog contracts across eight Next actions, isolating each request from depth verified for earlier requests.

## Repairs

- The guarded IA client keeps one station query plan during the page session. Actual editorial profile, era, or audio changes invalidate that plan. Next no longer creates a new server catalog identity merely because a local search cursor advances. Background discovery still advances its own existing cursors. Desktop and mobile share this repair; the separately certified Cast protocol remains unchanged.
- Background maintenance uses the same current-transport window as file verification. Expired and future-dated checks are not counted as healthy depth. Complete runtime and geometry are required as well.
- Each maintenance batch contains at most eight pending records and favors series with fewer currently playable episodes. It does not rescan a large historical verified count on every pass or consume the budget with already healthy records.
- Successful repairs merge into the complete catalog. A partial repair cannot shrink the existing three-item ready shelf.
- Failed transport or metadata attempts receive a temporary five-minute retry delay within the background catalog. Later candidates can advance; inventory is retained and retry resumes after the delay. This does not admit failed media to playback.

No new channels, lineup changes, history resets, weaker genre rules, or recurring tasks were introduced.

## Verification

- New tests first reproduced expired-check suppression, rotating query identities, a one-record repair shrinking a ready shelf, and failed files monopolizing later repair attempts. The corrected tests also cover genuine profile changes, timestamp bounds, full catalog retention, incomplete metadata, and retry after cooldown.
- The broad offline gate passed all 92 commands. After the final metadata-predicate correction, all 74 focused qualification, playback-order, and stability tests passed. Three build-stamp fixtures passed. Hosted CI runs the final committed code again.
- In the isolated Chrome canary, the API catalog grew from its three-item opening shelf to 405 currently qualified episode records. This is transport/metadata admission, not proof that all 405 episodes have been decoded on every device.
- A fresh canary sequence produced 11 distinct visible programs from 11 series: Benson, Bonanza, Leave It to Beaver, Dragnet, Get Smart, Green Acres, The Munsters, Sherlock Holmes, The Beverly Hillbillies, The Addams Family, and The Benny Hill Show. No exact repeats, failed starts, or stalls occurred in this sequence. Median observed compositor first-frame time was about 1.99 seconds; this is a bounded local canary, not a controlled production latency comparison.
- Production playback and release stamps are checked after deployment. No full-lineup or physical mobile/Cast certification is claimed by this release.

The visible desktop/mobile build, browser titles, asset cache keys, and API release all advance to 6.0.21. Existing catalogs and session freshness history remain in place.
