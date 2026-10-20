# RealSignal 5.6.15 — recovery freshness and first-tune labels

## Confirmed causes

- A fresh 40-selection hosted channel 11 trace reproduced the same Baywatch repeat at rotation 28 (39 unique selections). The API rejected one off-policy relay slot, entered D1 recovery, then selected by modulo without applying the viewer's history. Its expanded catalog still had 51 unseen resolved records. A direct relay check with the same history returned an unseen episode.
- Inline `warmIAQueue` media omitted title/year although asynchronous resolution and fast-tune persistence retained them. That caused first playback to display the station name. Previously saved titleless fast-tune entries also needed a label fallback.

## Targeted changes

- Standard relay-owned IA recovery shelves now prefer unseen resolved items from their qualified union, using explicit personal history ahead of shared served preferences. Canonical file identity collapses alternate encodes. Genuine exhaustion preserves playable fallback and reports it in freshness diagnostics.
- This also covers a policy-reduced relay shelf when D1 is absent or contributes no new identities; existing qualified unseen candidates can fill it immediately.
- Guarded file reservations and ordinary full relay shelves keep their existing owner/order. No new source fetch, database schema, binding, shared watch-history mutation, or source admission relaxation was added.
- Desktop/mobile inline-ready records retain the episode label and year. Old titleless fast-tune records derive their existing file label without clearing playable caches.
- Asynchronous warm resolution captures title/year before the pending queue record can be consumed, so an opaque DVD filename cannot replace a known episode label.
- Real browser testing also exposed a saved Modern Rerun record bypassing its English-focus API filter. Channel 11 now applies that existing station contract to cached/scheduled/preloaded and direct-recovery media on both clients; other stations keep their own rules. No universal language or catalog rewrite was introduced.

## Local verification

- Baseline focused suite: 99 tests passed.
- Eleven new behavioral regressions were observed failing before the relevant fixes: four inline title cases, two saved-cache cases, and five recovery-history cases (private, legacy, canonical alternate, true exhaustion, last unseen episode).
- Updated focused suite: 116/116 passed, including two additional RED→GREEN cache/direct language-gate regressions and four review regressions. Full workflow CI: 79/79 commands passed after the final correction. Standalone title/deep-harvest contracts and whitespace checks passed.
- First local browser tune decoded Keeping Up Appearances S02 E02 at 416×320, readyState 4, advancing playback, with its episode title visible. Next switched to S03 E06 at 576×432. Guide opened and tuned channel 11. After reloading without clearing storage, its old rejected cache was replaced by Seven Days at 480×360, readyState 4, advancing playback.
- Local API/relay channel 11: 40 selections, 40 unique identifiers, no request errors or repeats. Local storage has no production D1, so the SQL/recovery fixture and later hosted retest are separate required evidence.
- No changes to OK/Vimeo, FAST catalogs, channel identities, Roku, or physical Cast configuration.

## Release verification

Final review completed with its findings fixed and tests green. Runtime `77a27f4` deployed with all four applicable workflows green (the relay is unchanged). The first hosted test passed 40/40 selections, but extending to 64 revealed a legacy parent-ID mismatch. The follow-up 5.6.16 report documents its fix and final hosted evidence. Queue selection/URL readiness is not a universal visible-first-frame or physical mobile/Cast certification.

## Review decisions

- One fresh read-only reviewer found an important missing no-additions recovery case and an adjacent asynchronous title race initially graded minor. The latter was treated as important because this release explicitly fixes episode labels; losing a known title/year to `VTS 01 3` violates that contract. Both were reproduced failing then fixed in one RED→GREEN pass; no second review was dispatched. No critical findings, declined-to-judge items, or deferred minors remain.
- Scope ruling: include the browser-reproduced channel 11 cached/direct English-policy bypass in this repair. Otherwise the same affected station can still play a record rejected by its API. Cost if wrong: a valid English-labelled channel 11 cache matching the existing API's exclusion signals could be rejected. The restriction remains channel 11 only.
