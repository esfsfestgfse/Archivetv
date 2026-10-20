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

Runtime commit `e32f4fffe8ff032a8369bc6f095ee6acef7619d5` reached main through a normal fast-forward push. GitHub CI, Relay deployment, API deployment, Publish RealSignal and Pages deployment all succeeded. Actual desktop/mobile HTML titles and visible constants, plus API health, report 5.6.14; both HTML requests returned HTTP 200.

The fresh concurrency-two snapshot returned three resolved media URLs for all 170 canonical IA channels: zero request errors, empty responses, unresolved shelf entries, or reported catalogs below five. This is URL availability, not decoded playback across the whole lineup.

The hosted eight-lane canary ran 32 acknowledged skip rotations per channel: **256 selections, 255 per-channel unique, zero request errors**. Blighty and six controls were clean through all 32. Every lane's first 24 selections remained repeat-free, matching the previous release's test depth. Extending the test exposed one reproducible Modern Rerun TV repeat at zero-based round 28; a separate serial retry confirmed the same file. That remaining failure is not hidden as a clean all-channel freshness certification.

| Channel | Distinct / selections | Repeats | Minimum reported catalog/window |
| --- | ---: | ---: | ---: |
| 10 Classic Rerun TV | 32/32 | 0 | 512 |
| 11 Modern Rerun TV | 31/32 | 1 | 41 |
| 12 Classic Game Shows | 32/32 | 0 | 350 |
| 22 Modern Game Shows | 32/32 | 0 | 153 |
| 118 Blighty | 32/32 | 0 | 96 |
| 150 Classic Cartoons | 32/32 | 0 | 512 |
| 153 Modern Cartoons | 32/32 | 0 | 96 |
| 705 Halloween Cartoons | 32/32 | 0 | 65 |

All responses retained at least two media URLs; one Halloween Cartoons response returned two rather than three. A reported response window of 96 is not a truncation of the 260-entry indexed British library. Candidate counts remain separate from decoded-video counts.

The final public desktop player decoded Keeping Up Appearances S04 E03 (464×352), then a different S04 E04 file (496×368) after Next. Both had readyState 4, advancing time, and distinct media URLs. Next displayed the correct descriptive filename-derived label. The first fast-tune item showed only the channel name in the program-title area; this remaining label-population issue is recorded below rather than claimed fixed. Screenshot capture was unavailable; no physical mobile/Cast certification is claimed.

Primary metadata examples: [Only Fools and Horses](https://archive.org/details/Onlyfoolsandhorsesseries), [Dad's Army series 3](https://archive.org/details/dads-army-3), and [Sherlock](https://archive.org/details/BBC_Sherlock2010).

## Remaining limits

Readiness snapshots are not all-episode playback certification. Metadata labels cannot prove spoken language. The 256-entry personal ledger is still bounded; genuine catalog exhaustion may repeat. Physical mobile/Cast behavior and universal instantaneous first-frame latency are not certified by this run. The actual response window can be smaller than the indexed library; it must not be confused with total available depth.

Next measured work: trace channel 11's repeated `baywatch_202212::003-Heat Wave(REMASTERED VERSION).mp4` at round 28 (same result on serial retry), and fix first-fast-tune program-title population. These were not mixed into the approved British depth/recursive-title repair or mislabeled as resolved.

Decision/ruling: retain the existing architecture and execute the two approved fixes inline in the existing isolated checkout with a normal release, rather than requesting a new planning/push menu. The scope follows the user's stated workflow; if that judgment is wrong, this bounded runtime commit is independently revertible. There were no deferred reviewer minors.

Unrelated research artifacts, paused provider work and the managed checkout are preserved. Only this task's temporary review/checkpoint workspace is disposable; raw test/research evidence stays under artifacts.
