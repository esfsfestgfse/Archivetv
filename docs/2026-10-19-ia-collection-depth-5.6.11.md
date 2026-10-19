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

Runtime commit: **3c1cd81627cfe2cbbe854ff6f2cb72781e045c4a**, pushed normally to main. [Hosted CI](https://github.com/esfsfestgfse/Archivetv/actions/runs/39331258573), [API deployment](https://github.com/esfsfestgfse/Archivetv/actions/runs/39331258553), [relay deployment](https://github.com/esfsfestgfse/Archivetv/actions/runs/39331258496), [Publish RealSignal](https://github.com/esfsfestgfse/Archivetv/actions/runs/39331258597), and legacy Pages deployment all completed successfully.

Public desktop/mobile HTML returned HTTP 200 with 5.6.11 in both tab titles and visible build strings. API health reports `5.6.11-ia-collection-depth-unlock`. The previous runtime release was 5.6.10.

The published desktop build also decoded a deeper Modern Cartoons selection, **The Powerpuff Girls, Season 6 — West in Pieces**, at 720×540 with readyState 4 and advancing playback time. This is actual hosted video, not merely a metadata or queue response.

Hosted availability checks covered **170 canonical IA channels**: zero request errors, zero empty shelves, zero missing media URLs, and three resolved items per shelf. The Weather Loop (509) reported only four catalog candidates. This is queue availability, not a 170-channel decoded first-frame certification. The initial local report write hit an operating-system file error after 42 completed lanes; the remaining lanes were resumed without repeating them, using a compact report.

Twelve acknowledged skip rotations on each of 18 hosted lanes selected 216 programs, 207 unique per-lane selections, with zero request/admission errors. Sixteen lanes had no repeats: 10, 12, 22, 150, 153, 123, 220, 227, 243, 244, and 704–709. **Modern Rerun TV (11) repeated six selections; Blighty (118) repeated three.** A fresh-session retest reproduced repeats in both. These are remaining bugs, not legitimate exhaustion certificates. The test's telemetry uses queue selections and skip acknowledgements, not full episode playback.

A later browser TV skip also needed slow recovery before decoding resumed. This release does not certify instantaneous switching or consistently fast Next behavior. The availability pass must not be used to hide that distinction.

Next work should fix the **reproduced Modern Rerun TV / Blighty rotation failures and slow TV skip recovery first**, then deepen genuinely constrained catalogs (Auto Archive's empty-cache starters, sampled single-program Britcom/Adult Animation parents, and Weather Loop). Auto Archive's hosted 12-skip sample was repeat-free even though the isolated empty-cache session remained shallow. This release unlocks existing parent depth; it does not claim infinite inventory, zero provider outages, or complete physical-device certification.

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
