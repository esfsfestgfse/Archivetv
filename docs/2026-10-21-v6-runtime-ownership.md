# V6 cleanup: current runtime ownership

Read-only inventory against `8303b83`, with application code from 5.6.29.
This records what is loaded today, not a claim that V6 is implemented.

## Baseline active paths (before cleanup)

| Responsibility | Present owners | Cleanup boundary |
| --- | --- | --- |
| Channels and genre profiles | Inline `CH`, `PROGRAM`, canonical merge helpers, and guide category registry in both HTML builds | Preserve identities, numbers, aliases, profiles, and catalog records |
| Tune and teardown | Inline `tuneNum`, `killMedia`, provider tune functions; late reliability wrapper; guide-recent and telemetry wrappers | Preserve call order and cancellation; not safe to delete merely because a function is wrapped |
| IA ready shelf | `assets/ia-playback-shelf.js`, inline `tuneIARepair` and `iaRepairEvent`; other IA paths retain their existing opt-in/Cast guards | Do not conflate promoted repair lanes, fallback paths, and Cast |
| IA catalog and durable rotation | `realsignal_api_v2_worker.js`, `realsignal_api_rotation.js`, `ia_file_contract.js`, relay and seed/manifest data | No schema, rotation, qualification, or discovery changes in the first cleanup |
| Source Suite catalog bridge | `assets/source-catalog-client.js` wraps `v2Provider`; API catalog adapter remains server-side | Preserve played-only freshness accounting and verified local recovery |
| OK playback | `assets/ok-embed-runtime.js` plus inline provider wiring | Preserve current integration and EOF/recovery behavior |
| Guide render | Two same-scope `renderRail` declarations per build; the directory renderer is the effective declaration | Remove only the earlier overridden declaration after a regression test pins ownership |
| Guide metadata updates | Inline `guideListing`, `refreshGuideRows`, `primeGuideQueues`; `assets/verified-guide-client.js` background bridge | Preserve stable row nodes and local-first opening; no redesign in first cleanup |
| Guide controls | Inline open/close; final reliability wrapper; `assets/guide-overhaul.js`; telemetry wrapper | Preserve Cast commands and deferred hydration, not just function names |
| Diagnostics and telemetry | `assets/playback-audit.js`, `release2-runtime.js`, opt-in `release3-runtime.js`, `release31-runtime.js` | All are referenced by both builds; old release numbers do not imply unused code |
| Cast | Inline sender/remote wiring and `realsignal_cast_receiver.html` | No handoff, receiver, discovery, or protocol changes |
| Cache/offline | `sw.js`, network-first same-origin fetch behavior | No cache eviction or local-storage reset in first cleanup |

## Verified duplicate

Each HTML build contains an earlier `renderRail` beginning with the comment
`v9: honest CHANNEL BANK grid` and a later `renderRail` following the comment
`RealSignal guide-directory renderer`. They are adjacent declarations in the same
inline script. The later declaration owns the binding; the earlier function body
does not run. There is no interposed capture of the earlier function.

Removing the old declaration removes about 45 lines per build, not a channel or
catalog. It is a maintainability and parse-input cleanup, not an established
first-frame performance improvement. Tests must verify which function actually
runs, rather than treating a text search as sufficient evidence.

## Keep until separately proved removable

- Late guide/tune wrappers are active, including deferred hydration and Cast routing.
- `release31-runtime.js` is loaded and adds diagnostics; do not delete it as an old version.
- Vimeo remains paused, but its asset is still loaded and referenced. Paused is not dead.
- Embedded catalog/seed arrays account for substantial bytes. They are useful data,
  not a cleanup target based on file size alone.
- `CLAUDE.md` describes an older channel count and single-file architecture. The first
  cleanup adds no bundler, framework, or new runtime module; larger extraction belongs
  to a later reviewed V6 slice.
- Existing tests still refer to some removed live-data features. Do not delete those
  assertions or feature code without tracing reachable registry and runtime paths.

## Baseline checks run for this inventory

- `node scripts/check-html-syntax.js`: both builds parsed with 5.6.29 stamps.
- `node scripts/test-guide-row-stability.js`: source guards and four executable
  canonical/legacy-label search tests passed.
- `node scripts/test-release2-runtime.js`: current runtime/guide/telemetry contracts passed.

These are local offline checks, not a new media soak, latency measurement, or device
certification. No application runtime files were modified during this inventory.

## First cleanup implementation

- Removed only the overridden `v9: honest CHANNEL BANK grid` function from each HTML
  build: 44 lines / 3,379 UTF-8 bytes on mobile and 44 lines / 3,391 bytes on desktop.
- Compared each resulting HTML with the baseline minus that exact function. All other
  source, including CSS, playback, provider profiles, data, wrappers, and build stamps,
  is unchanged. Both effective renderer sections have SHA-256
  `0e5e353d6abbe549e63ee0278f368a96c5258954da5c55ecd1f205a61399a6d3`.
- Added `scripts/test-guide-renderer-ownership.js` and its CI step. The first run
  passed ten behavior tests and failed the two ownership tests (`2 !== 1`). After
  deletion, all twelve passed. These execute the actual renderer with a small DOM
  boundary double; they are not real-browser layout or audiovisual certification.
- HTML syntax, guide row stability, registry, IA parity, Release 2 runtime, and Cast
  runtime checks passed independently.
- The first broad offline gate passed 55 of 56 commands. The audit checkpoint test
  failed with an `EPERM` rename in the sandbox's temporary directory; its unchanged
  eight-test suite passed when rerun outside the sandbox. No product fix was applied
  to hide or weaken that test.
- The complete set of 56 distinct offline Node commands from the CI workflow then
  passed in one clean-environment run, including the new renderer guard. Browser
  tune-all/regression jobs and physical-device playback were not run by that gate.
- The user's viewport-fit requirement is explicit in the V6 design: the watching
  stage and essential controls must fit browser width and height, including short
  landscape windows and mobile chrome. This cleanup does not implement or claim the
  new layout; that requires real-browser sizing checks in the watching-shell slice.

This is a local pre-release cleanup, not a new public version or a first-frame speed
improvement. Production remains 5.6.29. Provider catalogs and viewing history remain
untouched; no channel was added, removed, hidden, or renumbered.
