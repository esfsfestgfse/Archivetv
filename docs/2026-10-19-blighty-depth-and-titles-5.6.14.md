# RealSignal 5.6.14 — Blighty depth and episode titles

## What changed

- Blighty (118) now uses 260 actual metadata-qualified episode files across 12 Archive parents and 11 series through the existing collection index. Its direct bank contains 277 file entries including retained, deduplicated prior recovery material; this is not a claim that every file was decoded or freshly transport-verified.
- An older shallow family cache can no longer hide the new reviewed index. Existing approved entries and personal freshness history remain intact; the ready shelf balances series.
- The Blighty fallback schedules bounded background discovery/collection expansion instead of returning forever from its starter bank. No Archive metadata request is awaited when ready media already exists.
- Re-expanding an episode uses canonical series/container metadata, not the previous episode's display title. That stops recursive filename accumulation across IA collection channels.
- Desktop/mobile clean old recursive labels when the final descriptive fragment matches the actual current file. Opaque DVD names and unrelated human editorial subtitles are retained.
- Explicit DVD bonus material is excluded from new British background expansion and old-cache promotion. Actual interview documentaries are not blanket-banned.

No services, bindings, schema, channel numbering, source adapters, or unrelated channel profiles changed. The 5.6.13 personal freshness fix, genre/runtime/landscape gates and complete-short-cartoon exception remain.

## Indexed programs

| Series | Metadata-qualified file records |
| --- | ---: |
| Only Fools and Horses | 63 |
| Keeping Up Appearances | 43 |
| Yes Minister & Yes, Prime Minister | 37 |
| Dad's Army | 27 |
| Space: 1999 | 24 |
| Red Dwarf | 24 |
| Sherlock | 14 |
| The Young Ones | 12 |
| Blackadder | 6 |
| One Foot in the Grave | 6 |
| Are You Being Served? | 4 |
| **Total** | **260** |

These are file-level records derived from real public Archive manifests, not invented URLs. The reviewed selection omits menu tracks, known duplicate encodes, bonus material, and ambiguous whole-disc/PGC copies. It does not impose a new global maximum runtime: clearly named long-form TV programs remain eligible. Some DVD files retain their source filenames because exact episode-name mapping was not verified. Where Archive omits a language declaration, it remains undeclared rather than being presented as a spoken-language certification.

## Local verification

- 99 focused behavioral tests passed. New cases were observed failing first: recursive re-expansion, desktop/mobile cached labels, missing background growth, index not reaching playback, shallow durable-cache hiding, and background/stale-cache DVD extras.
- All 79 CI commands passed after the final review fixes and version stamp. The standalone deep-harvest and IA title contracts passed.
- 24 representative small-range probes (two per parent) returned HTTP 206 video responses. This tests transport availability, not every episode's decoded playback or audio language.
- The actual local API/relay canary completed 48 Blighty selections with 48 distinct programs and zero request errors. All responses had three media URLs; the minimum reported response window was 96. All twelve indexed parents appeared; combined Dad's Army selections were 12/48 (25%), the largest series share in that sample.
- The real desktop player decoded Are You Being Served (624×482), then Space: 1999 — Dragon's Domain (641×470) after Next, with readyState 4 and advancing time. This was before the final narrow review admission/label fixes; final deployed evidence is recorded separately below.

## Review and release

One bounded reviewer found two Important issues: background expansion could reintroduce DVD bonus files, and cached recursive labels with distinct fragments were not cleaned. Both were reproduced in failing tests and fixed in one RED/GREEN pass; the 99-test suite and all CI commands passed afterward. No unresolved findings or deferred minors.

Normal commit/push, production gates, visible stamps, hosted rotations and final decoded-playback results will be recorded after deployment.

## Remaining limits

The five-minute readiness snapshot is not an all-episode playback certification. Metadata labels cannot prove spoken language. The 256-entry personal ledger is still bounded; genuine catalog exhaustion may repeat. Physical mobile/Cast behavior and universal instantaneous first-frame latency are not certified by this run. The actual response window can be smaller than the indexed library; it must not be confused with total available depth.

Unrelated research artifacts, paused provider work and the managed checkout are preserved. Only this task's temporary review/checkpoint workspace is disposable; raw test/research evidence stays under artifacts.
