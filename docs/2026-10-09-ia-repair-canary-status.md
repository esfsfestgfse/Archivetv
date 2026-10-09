# Internet Archive repair — canary status, October 9, 2026

## Release decision

**Do not promote this repair to production yet.** The production reference is
5.5.85 (`90ada75`). No production push or deployment was performed during this repair run.
The new behavior is opt-in through `?iaRepair=1`; existing OK/Vimeo protocols
and the normal IA rotation path remain available.

Scope: all **169 canonical IA stations**: 141 video and 28 audio. Thirteen
existing aliases are not counted as separate stations. No station was hidden,
removed, or padded with off-genre material to improve a test score.

## Implemented repairs

- Durable catalog unions and played history have a serialized owner instead
  of competing last-writer-wins cache updates. Deep catalogs and reservations
  are stored in transactional chunks below the storage value/batch limits.
- Preparation reserves programs; only an actual start records them as watched.
  Starts, skips, completions and failures preserve stable episode identities.
- Original files and common derivative encodings share a logical identity.
  Missing requested files cannot silently become another episode.
- File runtime, geometry, language, provenance and transport qualification
  survive compaction. Ordinary television has a 15-minute floor; features have
  a 60-minute floor. Existing intentional short-form, audio and international
  contracts are preserved. There is no new upper duration limit.
- Twelve discovery rails have independent resumable cursors. Parent collections
  expand across file batches, retain deeper inventory, and refresh again later.
  Balancing limits the small shelf, not the underlying catalog.
- Guide, preload, Next and end-of-program use the same reservation order in the
  canary. Hydration excludes watched/failed items before spending its budget.
- Explicit rotation generations prevent delayed preload/fast-skip overlaps from
  permanently masking the next item after genuine catalog exhaustion.
- A superseded staged player's rollback cannot overwrite a newer player.
  Canary video startup tries up to two alternate origins, with four seconds
  per origin. A resolved Archive CDN URL is retained only for the same file on
  an HTTPS Archive host. This is transport recovery, not proof of decoding.
- First-frame telemetry rejects superseded events and missing timing origins;
  audio start and embed loading are not reported as visible video frames.
- Certification has an availability preflight. A failed Archive connection
  aborts before testing lanes instead of generating an all-channel false alarm.

Classic Cartoons received three collection parents (Flintstones, Scooby-Doo,
Jetsons) and nine full-length starter episodes, interleaved by show. These
starters still require transport checks. Their collection files continue through
background expansion; nine is not a claim about the channel's ultimate depth.

## Evidence and its limits

| Check | Observed result | What it proves |
| --- | --- | --- |
| New behavioral regressions | 68 passed, 0 failed | State, qualification, rotation, ordering, recovery and telemetry logic under controlled edges |
| Local Node commands extracted from CI | 49 commands, 0 failures | Local contract/regression checks; not hosted CI or Python/browser jobs |
| Earlier full serial canary admission | 140/169 passed | Three transport-qualified reservations at that earlier revision, not visible playback |
| Retry of the earlier 29 misses | 7 recovered; 22 still failed | Some transient misses; remaining repair backlog, not final certification |
| Five-lane rotations after hydration exclusion fix | 3 ready per rotation, 9 distinct over 3 rotations in each lane | Rotation of Hunt, Classic TV, Game Shows, Modern Cartoons and Halloween Cartoons at that earlier revision |
| Classic Cartoons after collection additions | 9 distinct over 3 rotations | Transport admission and reservation rotation, not nine decoded videos |
| Desktop picture sample | Classic TV: 2.59 seconds; Flintstones: 3.214 seconds | Actual visible-frame observations before the final startup/generation fixes |
| Guide sample | Open: 257 ms; close: 27 ms | One local desktop interaction sample |
| Subsequent cartoon Next | Selected the advertised Scooby episode, then stalled/failed through recovery | Real playback is not certified; queue readiness alone was insufficient |
| Latest full attempt | Stopped after 20/169, 0 passing | An incomplete run during independently reproduced Archive connection failures; not a verdict that all channels are dead |
| Final availability preflight | Aborted, 0 lanes scored | Archive metadata connection still timed out from this machine |

Independent command-line requests to Archive's homepage and known collection
metadata timed out, including a separate HTTP client. Other network access
responded. This establishes a connection problem from the test environment,
**not** an assertion that Internet Archive is down worldwide or a known cause.

The last CDN/startup/generation repairs passed regression tests but do not yet
have a fresh live-browser playback pass. Physical mobile and Cast certification
was not performed. Receiver-side start/skip/completion acknowledgement behavior
must be checked before the canary is promoted for Cast.

## Saved evidence

Local artifacts are intentionally not added to Git:

- `artifacts/ia-repair-full-admission.json`
- `artifacts/ia-repair-admission-retry.json`
- `artifacts/ia-repair-targeted-rotations-after.json`
- `artifacts/ia-repair-after-floor-and-cartoon.json`
- `artifacts/ia-repair-full-after-runtime.json` (incomplete)
- `artifacts/ia-repair-preflight-final.json` (availability abort)
- `artifacts/ia-repair-cartoon-depth.json` (public metadata research)

## Next steps — avoid rerunning broad discovery unnecessarily

1. Restore a successful Archive availability preflight.
2. Restart the isolated canary with the final code and verify actual picture,
   Next and guide transitions on channels 10 and 150 first.
3. Recheck the earlier repeated misses with low concurrency. Retain strict
   qualification; expand suitable collection files rather than lowering floors.
4. Repeat the full 169-lane transport/rotation pass only after those checks pass.
   Measure freshness across multiple rotations, not only a ready shelf.
5. Verify desktop/mobile/Cast start and advance acknowledgements and cross-family
   behavior. Queue success is not a substitute for visible-frame evidence.
6. Only then publish a new stamped canary/release and promote guarded behavior.

## Deployment and rollback

The relay now uses a private `IA_STATE_OWNER` binding to the existing API
`SessionRotation` class. Deploy the API handler before the relay binding. A
separate hosted canary must point that binding at its own API script, **not**
the production state owner. No new Durable Object class migration is required.

Keep production's existing protocol until promotion. Removing `iaRepair=1`
selects the normal client path; preserve the existing API/relay versions for a
deployment rollback. Do not delete or rewrite legacy cache/history records.
Untracked audit artifacts and unrelated research were left untouched.
