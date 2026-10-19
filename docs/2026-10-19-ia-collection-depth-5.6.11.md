# RealSignal 5.6.11 — IA collection-depth unlock

## What changed

This is an incremental repair to the existing relay, API, and session rotation, not a new playback architecture. It does not change channel numbers, hide channels, or change OK, Vimeo, Source Suite, or Cast behavior.

- Background collection expansion now opens known complete-series parents even when the starter file came from a reviewed recovery bank. Previously that provenance could prevent sibling discovery.
- Ordinary video metadata retains its distinct-program count, allowing unlabelled multi-program items to be expanded later. Ordinary single-program recovery files do not trigger arbitrary metadata scans.
- Large background collection reads keep the existing bounded eight-second metadata budget instead of being cancelled at 2.8 seconds. Actual canary logs and an abort-aware delayed-manifest test reproduced the previous repeated-abort failure. This does not extend a channel-change request or its foreground budget.
- Standard cold recovery can use its accumulated family catalog instead of reopening only the small emergency bank. Editorial, media-type, duration, and deny rules are reapplied before selection. The public candidate window remains bounded; the private catalog is not shortened to the window.
- Standard IA session rotation now receives the existing show-family balancing policy. The same eligible inventory fills constrained shelves; no content is invented or relaxed to meet a count.
- Oversized initial and continuation harvest messages carry a small bootstrap and their existing family key instead of serializing the entire catalog into a queue envelope. Standard and guarded consumers await family persistence before sending a compact continuation, retain its page cursor, and reload the family through the existing path. A missing family can temporarily leave bootstrap-only depth; it does not justify declaring all candidates playable.
- Merged Auto Archive/Gear Head preserves both constituent editorial identities. Top Gear is no longer excluded merely because the manufacturing member had a narrower identity lock. Late-night Leno remains excluded.
- New expanded video files and promoted cached-family files need known landscape dimensions and pass the existing global exclusions. Declared non-English audio is rejected outside the existing international lanes. Holiday TV and cartoon siblings must have seasonal identity in their actual filename or original Archive parent title, not merely a curated starter label.
- Proven multi-program parents get priority in the bounded expansion batch. A known count-one file with only a singular episode label cannot monopolize that budget. Explicit collection evidence remains eligible because older starter counts and long-form counts do not exhaustively describe the parent's files or original short cartoons.
- Raw Archive filenames now participate in the fan/parody/podcast exclusion check. Original complete theatrical cartoons retain their reviewed short-program exception.

## Measured discovery gain

The same 36 public Archive manifests were replayed through the old and new real background expansion functions at low concurrency. The new path exposed **1,110 channel-qualified sibling candidates representing 792 distinct physical files across nine positive station samples**.

These are metadata-qualified files, not 1,110 decoded or immediately served videos. Some files belong to multiple channels. The old path returned zero *sibling expansions for these specific recovery starters*; the channels themselves still had existing playable banks.

| Station sample | Newly reachable qualified siblings |
| --- | ---: |
| Modern Rerun TV | 318 |
| Modern Cartoons | 232 |
| Cartoon Reelhouse | 230 |
| Blighty | 134 |
| Archive Series Vault | 53 |
| Bob Ross & Comfort TV | 43 |
| Anime Alley | 42 |
| The Telly | 37 |
| Gear Head / Auto Archive | 21 |

Britcom and Adult Animation's sampled starters were single-program items and correctly did not manufacture episode depth. They need additional real parent sources, not more copies of their existing files.

## Verification before publication

- All **79 repository CI commands** passed locally after the version bump; these are commands, not 79 individual tests.
- All **82 focused behavioral tests** passed, including collection siblings, genre contamination, geometry/language, all six seasonal TV/cartoon identities, initial and continuation queue bounds, persistence ordering, short-cartoon preservation, background metadata timeouts, deep cold catalogs, show-family balancing, and non-IA compatibility.
- One independent read-only reviewer identified four Important gaps, no Critical or Minor findings. Reproducing tests failed before the fixes and passed afterward; the full suite was rerun. No second review or implementer agents were used.
- The standalone deep-harvesting contract also passed. Its obsolete source-text assertion was replaced with a real recovery-rotation test.
- Nine representative newly reachable programs returned HTTP 206, video/mp4, and media bytes on small Range requests. This proves transport access for the sample, not decoder compatibility for all files.
- The loopback canary ran the actual API, relay, and session rotation against public Archive media without mutating production storage. Modern Cartoons decoded at 714×540, Next decoded a different episode, and Modern Rerun TV decoded VR.5 at 629×480. Guide open/close worked during playback.
- After the final review and timeout fixes, the canary was restarted and Modern Rerun TV again decoded an actual program at 854×480 with advancing playback time.
- Browser screenshot capture timed out; no screenshot evidence or precisely measured end-to-end first-frame time is claimed.
- Eight acknowledged skip rotations each on Modern Rerun TV and Modern Cartoons selected eight distinct programs per lane, with no request errors. A new empty-cache Auto Archive session still had only two ready programs and repeated after exhausting them. This is an explicit remaining depth limitation, not a clean freshness certification.

## Rollout and remaining work

Release/deployment and hosted checks are recorded after the production rollout. The previous runtime release was 5.6.10; desktop/mobile tab titles and visible build stamps, cache-busting asset parameters, and API health now identify 5.6.11.

Next work should target actual underfilled catalogs—starting with Auto Archive's cold-ready depth and sampled single-program Britcom/Adult Animation parents—then measure longer viewer rotations. This release unlocks existing parent depth; it does not claim infinite inventory, zero provider outages, or complete physical-device certification.

## Decisions and tradeoffs

- Reused the existing isolated worktree and implemented inline to conserve credits. The changes remain bounded and revertible; no alternate architecture was introduced.
- Unioned the merged station members' existing editorial terms rather than keeping only one member's identity. Downstream genre and deny checks remain necessary.
- Bounded oversized queue envelopes using the existing family reference. Cache loss may temporarily constrain depth to bootstrap items; keeping the full private catalog remains the normal path.
- Retained explicit collection evidence when suppressing count-one singletons: older starter counts and long-form counts can omit genuine sibling/short-cartoon files. The tradeoff is one bounded background read, not relaxed genre or runtime gates.
- Included the directly observed metadata timeout repair in this release; a background read can now occupy up to eight seconds, without changing foreground waits or concurrency.
- Kept unchanged later-rotation serialization, emergency remerge, and unrelated providers outside this incremental patch. They remain candidates for separate telemetry-led work.
- Followed the user's standing normal push-to-main authorization and kept the managed detached worktree. The previous runtime commit remains the rollback baseline; no force push or unrelated cleanup is authorized.

The reviewer left CI/live canary evidence to the main session; the checks above supply it, with the explicit sample limitations. No Minor findings were deferred.

No new services, database migrations, credentials, or paid infrastructure were added.
