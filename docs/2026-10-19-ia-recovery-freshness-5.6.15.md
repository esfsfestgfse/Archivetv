# RealSignal 5.6.15 — recovery freshness and first-tune labels

## Confirmed causes

- A fresh 40-selection hosted channel 11 trace reproduced the same Baywatch repeat at rotation 28 (39 unique selections). The API rejected one off-policy relay slot, entered D1 recovery, then selected by modulo without applying the viewer's history. Its expanded catalog still had 51 unseen resolved records. A direct relay check with the same history returned an unseen episode.
- Inline `warmIAQueue` media omitted title/year although asynchronous resolution and fast-tune persistence retained them. That caused first playback to display the station name. Previously saved titleless fast-tune entries also needed a label fallback.

## Targeted changes

- Standard relay-owned IA recovery shelves now prefer unseen resolved items from their qualified union, using explicit personal history ahead of shared served preferences. Canonical file identity collapses alternate encodes. Genuine exhaustion preserves playable fallback and reports it in freshness diagnostics.
- Guarded file reservations and ordinary full relay shelves keep their existing owner/order. No new source fetch, database schema, binding, shared watch-history mutation, or source admission relaxation was added.
- Desktop/mobile inline-ready records retain the episode label and year. Old titleless fast-tune records derive their existing file label without clearing playable caches.

## Local verification

- Baseline focused suite: 99 tests passed.
- Eleven new behavioral regressions were observed failing before the relevant fixes: four inline title cases, two saved-cache cases, and five recovery-history cases (private, legacy, canonical alternate, true exhaustion, last unseen episode).
- Updated focused suite and full CI are required before release. First local browser tune decoded Keeping Up Appearances S02 E02 at 416×320, readyState 4, advancing playback, with its episode title visible.
- No changes to OK/Vimeo, FAST catalogs, channel identities, Roku, or physical Cast configuration.

## Release verification

Pending final review, push, five deployment gates, hosted extended rotation and playback checks. Queue selection/URL readiness is not a universal visible-first-frame or physical mobile/Cast certification.
