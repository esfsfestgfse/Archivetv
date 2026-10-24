# RealSignal 6.0.6 — playback and measurement repair

Started23October; resumed24October2026. Baseline:6.0.5/a5367c2.
This is a scoped client repair, not Version7 or full channel certification.

## What was reproduced; what is included

- YouTube's iframe-load timer can declare success after 3.5 seconds without a
  playing event. A player-event/handshake candidate passed its controlled tests
  but failed repeated real-app Chrome starts. That candidate is WITHHELD, not
  shipped. Both clients retain their exact 6.0.5 YouTube function. The failed
  candidate and its tests are retained in the ignored diagnostic output, not CI.
  YouTube startup remains unresolved; this release must not be called its fix.
- Returning from a warmed music channel could reuse an AUDIO element for a video
  MP4. Blues→Uptown Comedy reproduced audio-only playback and repeated attempts.
  Unstaged video acquisition now reuses only a VIDEO element. Explicitly warmed
  audio is preserved for music channels; catalogs and history are unchanged.
- Ordinary telemetry missed video when the first frame arrived while staged at
  opacity0, and stopped observing reused elements after a channel/Next change.
  Observation now retries promotion, re-arms per tune, and removes old listeners.
- The opt-in compositor audit could attribute a replacement frame to the previous
  failed file when both attempts shared one element. Each element now has one
  active audit owner.
- Current queue depth comes from the live IA owner, not the largest historic
  sample. Source Suite candidate counts are no longer presented as verified-ready
  counts. Missing measurements remain unknown rather than becoming zero.
- Blues can play audio through either AUDIO or VIDEO elements. Its starts are
  measured as audio, not fabricated video frames. Explicit embed failures now
  contribute to local failure counters.

## Controlled playback evidence

These are individual desktop samples, not fleet percentiles or source guarantees.
Remote telemetry was disabled for the diagnostic runs; viewing history was not
cleared. Raw local evidence remains in ignored output/v6-reliability/.

| Lane | Actual observations | Interpretation |
|---|---|---|
|555 Cartoon Time Machine|One embed-denied150 error recovered to decoded1280×720 video; tune1.797s. Next decoded a different program; tune0.628s.|The error was retained, not converted to a fake successful start. Tune time is not a measured iframe first-frame time.|
|54 Auto Racing|Failed WBAL news file, then1990 Daytona decoded; compositor first frame6.123s. Two different racing skips0.181s/0.992s.|Recovery works, but the cold failed-source cost and inappropriate news candidate remain real findings.|
|225 Uptown Comedy|Initially a generic stand-up fallback decoded in1.725s. After905, a video MP4 loaded in AUDIO and failed video admission. After the pool repair, In Living Color decoded in0.680s; Next0.194s/0.655s.|The audio-only handoff was a shared player bug, not proof of an empty catalog. Generic-comedy fallback contamination is a separate catalog issue.|
|905 Blues|Three advancing audio files; audio starts0.969s/0.011s/0.401s. No video frame expected.|The old missing-frame signal did not prove the audio channel was dead. A later non-English-titled selection warrants a separate editorial audit.|

The matched static YouTube harness played the same previously troublesome IDs in
Chrome and the in-app browser. The real Chrome app did reproduce repeated 8.5s
startup timeouts with the proposed event-only candidate, even when the clean
in-app client played. Neither the old URL parameter nor transparent staging alone
explained the discrepancy in matched controls. No extension, browser setting or
source was blamed without evidence. The candidate was withheld instead of
introducing this unresolved behavior into production.
Some browser automation mouse dispatches failed; keyboard-accessible controls
were used and actual media state was inspected. This is not physical-phone or
Chromecast certification.

## Verification and release status

- New defect fixtures exercised real production functions with controlled browser
  events and were observed failing before their fixes.
- 18 focused telemetry/audit tests pass; the audio/video pool regression
  adds 2 tests to the existing playback-order suite.
- Final reduced-release offline gate: 84 commands, zero failures; Python visible
  stamp tests: 3/3. Independent review completed; its two Important measurement
  findings were fixed with RED→GREEN regressions. Hosted CI/deployment are separate
  checks on the release commit, not inferred from these local results.
- Both HTML titles/build stamps and the health asset cache key are6.0.6.
- No Worker/database migration, catalog reset, channel removal or hiding change.
  The independent API release remains6.0.5-cartoon-program-admission.

Independent review found two further measurement errors: a failed tune could
re-label retained outgoing video as the new channel's success, and legacy queue
counts included pending/failed candidates. Both were reproduced as failing tests,
then fixed. Tune completion no longer re-observes retained media; actual source
mutations/new nodes re-arm observation. Legacy ready counts exclude unresolved
Promises and cooled failures. No second review or broader refactor was needed.

Decisions: keep existing catalogs/history untouched (editorial defects remain);
show unknown readiness for Source Suite rather than call metadata candidates
ready (that count stays unavailable); withhold the inconsistent YouTube candidate
(its startup limitation remains); do not claim fleet, physical-mobile or Cast
certification from a few controlled samples. The withheld candidate's minor
handshake-cadence test gap remains with that experiment, not released code.

## Remaining measured work

1. Repair Auto Racing's inappropriate/unavailable news candidate at catalog
   admission rather than masking its failure in the dashboard.
2. Replace Uptown Comedy's generic-comedy recovery rails with genre-correct
   programs. Preserve catalog depth and freshness while doing so.
3. Audit selected-file language/editorial accuracy in Blues and the already
   documented Classic Cartoons/Source Suite findings.
4. Resolve the real Chrome Source Suite startup discrepancy in an isolated canary;
   do not promote the withheld event-only candidate from unit tests alone.
5. Keep measuring decoded starts separately from player-state/tune completion;
   physical phone/Cast and fleetp95 remain open.

Rollback: revert this scoped release with a new commit and normal deployment to
the6.0.5 application baseline. Never reset main or delete user viewing history.

Release URLs (use after the deployment checks are green):

- Desktop: https://esfsfestgfse.github.io/Archivetv/the_dial_desktop.html?build=6.0.6
- Mobile: https://esfsfestgfse.github.io/Archivetv/the_dial_mobile.html?build=6.0.6
