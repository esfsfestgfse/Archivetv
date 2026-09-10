# Build 096 focused reliability findings

## Fixed
- Queue requests carry the browser's required title terms through Worker search, episode expansion, and cache identity. Theme tags alone no longer qualify an item that the browser will reject by title.
- Explicit episode files are resolved from all supported files, not only the first four candidates.
- Mixed audio/video Archive items can resolve their video correctly; commercials request the channel's actual media type.
- Sports Vault excludes the reproduced sports-anime collision. Tight Lines excludes original-song/music-video collisions.
- Queue measurements respect the server's ready count and recheck warm fallback shelves.

## Evidence
- Media-resolution, title-contract, episode-expansion, fallback-refill, HTML syntax, IA contract and desktop/mobile parity tests passed.
- Initial 11-channel, two-rotation queue check exposed animation timeouts; its readiness metric counted candidates and must not be interpreted as visible playback.
- Corrected recheck: Adult Animation and Saturday Morning each returned five ready items (403ms and 9737ms queue latency).
- Corrected post-filter check: Sports Vault and Tight Lines each returned five ready items (810ms and 1188ms queue latency).
- Isolated Chrome observed video starts on Modern Cartoons and Classic Rerun TV. Guide function calls returned promptly; this is not a rendered-frame or physical Cast-device test.

## Still open
- Commercial lookup frequently reaches its short deadline. A reported commercial start was not confirmed as visible video. Do not describe commercial playback as passing.
- Source Suite embeds require iframe/player-state verification; absence of a top-level video element is not proof of failed playback.
- Warm queue readiness does not prove cold-start speed, sustained playback, rotation freshness, or genre accuracy across the full catalog.
- Retest real breaks across all requested suites, including audio radio, before closing the commercial audit.

The browser probe is diagnostic, not a release acceptance test. It reports raw observations; its guide timing measures synchronous calls, and iframe/audio channels need separate probes.
