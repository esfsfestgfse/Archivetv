# Internet Archive repair — canary status, October 9, 2026

## Release decision

**Do not promote this repair to production yet.** The production reference is
5.5.85 (`90ada75`). No production push or deployment was performed during this repair run.
The new behavior is opt-in through `?iaRepair=1`; existing OK/Vimeo protocols
and the normal IA rotation path remain available.

Scope: all **169 canonical IA stations**: 141 video and 28 audio. Thirteen
existing aliases are not counted as separate stations. No station was hidden,
removed, or padded with off-genre material to improve a test score.

### Resumed run — latest decision

Archive metadata/search became reachable again. The availability incident below
is historical, not the current blocker. Actual desktop TV/cartoon pictures and
Next were rechecked. A shared background/cold-tune depth defect was reproduced
and repaired behind `iaRepair`; **production promotion is still blocked** by
the remaining underfills and incomplete device/freshness certification.

The checkpoint has **76 passing behavioral tests** and **49 passing local Node
CI commands**. These are local results, not a claim that hosted CI, physical
mobile/Cast, or all 169 stations have passed.

New repairs:

- Reuse already-fetched file metadata to identify unlabelled multi-program
  parents. Alternate encodings, short/portrait files and previews do not inflate
  the hydration hint; normal runtime/editorial/transport gates still apply.
- Persist enriched qualification into the same family being harvested, including
  equal-size metadata improvements. Strict recovery now retains that family key.
- A background queue delivery learns its small seed's metadata itself, so it
  cannot miss sibling expansion merely by starting before foreground verification.
- Family-only qualification avoids two immediate writes to the same KV key;
  the merged family write remains authoritative. This is covered by regression
  assertion, not a relaxation of the external provider's limits.
- In repair mode, a grown approved family outranks the small emergency bank on
  cold tune. The emergency bank remains fallback. No new foreground discovery,
  production flag, binding, channel, or OK/Vimeo change was introduced.

Fresh evidence:

| Check | Result | Limit |
| --- | --- | --- |
| Classic Cartoons, desktop | Six distinct visible starts; 286–1,500 ms; zero recorded stalls | Small browser sample, not a full-device soak |
| Classic TV, desktop | Bonanza and Dragnet pictures; clean samples 232/216 ms | One overlapping Get Smart/Bonanza event was ambiguous and is not counted as a reliable program-correlated measurement |
| Guide, desktop | Open 208 ms; close 26 ms; actual current/next and durations | One interaction sample |
| Grand Prix after repair | Three rotations, three transport-qualified reservations each, nine distinct programs, zero repeats; queue 170/160/150 ms | Synthetic skip acknowledgements, not nine decoded videos |
| Grand Prix, visible playback | Austrian race 1,124 ms; Next to Italian race 1,079 ms; after client reload, Next to an expanded French race file 868 ms | Actual pictures/advancing media time and a file beyond the old bank; not a long/device-wide soak |
| Repeated weak-lane retry | 15 of the other 17 still underfill; Midnight Matinee and Ragtime initially fill | Both initial recoveries drop to two ready items on later rotations; neither is certified |

Remaining measured backlog: 56 Friday Night Fights; 68 Coaches' Clinic; 71 The
Fairway; 72 Racquet Club; 73 Equestrian; 74 Winter Games; 83 Range & Field;
134 Darcys Playground; 19 Old Nick; 200 Manufacturing Marvels; 202 Comedy
Archive; 204 Prelinger Vault; 227 Auto Archive; 702 Thanksgiving Channel;
511 The Detective. Also recheck sustained depth on 132 Midnight Matinee and
911 Ragtime. Do not lower the quality floors to make these appear healthy.

Background discovery can continue after a cold response; these failures are
valid shelf observations, not proof that every source is dead. The local queue
harness is bounded and is not a production-scale saturation certification.
The full 169-station run has **not** been repeated after these last fixes.

Local evidence retained, not committed:
`ia-repair-resumed-targeted.json`, `ia-repair-resumed-weak-lanes.json`,
`ia-repair-deep-cold-rotations.json`, `ia-repair-deep-cold-weak-retry.json`, and
`ia-repair-deep-cold-recovered-rotations.json` under `artifacts/`.

Bounded independent review: safe to checkpoint on the repair branch; no
remaining critical finding in this diff. The existing shared-write helper
logs/swallow failures without retry. Durable-owner failure must be distinguished
from a failed KV mirror, and verified response success must not be treated as
proof of persistence. Add recovery/telemetry coverage before production
promotion. Cloudflare documents one same-key KV write per second:
https://developers.cloudflare.com/kv/platform/limits/ .
Actual cloud throttling/concurrent delivery, full unrelated legacy/OK/Vimeo
behavior, and physical-device decoding were outside that narrow review and
remain separate release gates; controlled owner concurrency tests did pass.

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

## Earlier evidence and its limits

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

At the earlier checkpoint, the CDN/startup/generation repairs passed regression tests but did not yet
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

1. Preserve the successful availability preflight and the TV/cartoon/racing
   picture evidence; do not repeat broad discovery for those observations.
2. Extend the successful clean-session Next sample with longer browser playback
   and mobile/Cast acknowledgement behavior.
3. Repair the measured remaining misses with low concurrency. Retain strict
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
