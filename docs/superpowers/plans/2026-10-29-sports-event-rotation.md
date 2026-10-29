# Sports event identity, balanced rotation and recovery

**Goal:** Apply the three approved sports priorities to the existing IA/NASCAR playback architecture and ship a verified version update.
**Architecture:** One small shared pure-JavaScript sports contract for API/rotation/client use. Preserve source inventories and qualify existing records before selection. Identity is conservative: missing event evidence does not discard a program or merge unrelated games. No new services, credentials, paid APIs or migrations.
**Approved spec:** User selected event identity, balanced rotation and same-event recovery after discussing the existing sports lineup and an event-led programming mix.

## Constraints
- Preserve all channel identities, numbers, source gates, freshness history and live Sports Center behavior.
- Never count another encoding/upload as a new event when identity is certain; keep those copies for recovery.
- Do not infer a specific matchup from an upload date or year alone. Keep distinct contests, sessions, parts and documentaries separate.
- Balance competition, participants and eras as preferences. Do not delete good inventory or wait for a perfect mix.
- No discovery requests during recovery. Try at most two alternate, already playable copies; preserve playback position only on matching timelines.
- Cancel recovery on channel change, Next or power-off. Failed copies do not imply an event/provider ban.
- Maintain desktop/mobile parity and existing Cast ownership. Physical Cast behavior is not certified by a browser test.

## Tasks
- [x] 1. Add failing event identity, event-copy grouping, balance and bounded recovery tests; implement `assets/sports-programs.js`.
- [x] 2. Integrate event-aware selection/history and copy metadata at the existing API/rotation boundaries, including D1 round trips; add real rotation/API regressions.
- [x] 3. Wire desktop/mobile playback to bounded same-event recovery; test failed starts, midstream recovery, cancellation and stale callbacks.
- [x] 4. Run affected tests, then the existing release gate once. Verify real IA/NASCAR visible frames, Next and guide in Chrome; run a controlled browser failure test.
- [ ] 5. Review, commit/push/deploy with visible 6.1.0 stamp; verify hosted catalogs, playback and deployment results.

## Review focus
- Same participants can meet repeatedly in one season; weak identity must never merge those games.
- A full card and its individual bouts are different programs; event/part boundaries must survive recovery.
- Preloading is not viewing. Only actual plays advance the event freshness history.
- Retry another complete record, never attach another file to the failed record's title/ID.
- Bad or exhausted alternate inventory must fall back promptly without a retry loop or a stale channel taking over.

## Verification evidence
- 24 focused sports behavior/integration checks pass; 96 existing CI/API Node commands pass (2026-10-29).
- One fresh review found five P2 edge cases. Regression tests reproduced split parts, Formula subseries, bare playback commits, retained cached copies, and reload-position ownership; all repaired.
- Chrome: deliberately failed official HLS recovered to the correct 720p race in 3.738 seconds. Normal IA racing, boxing, basketball, NASCAR Next, rapid changes and guide checked with visible compositor frames.
- Normal desktop starts in the bounded sample: 0.224–6.353 seconds. This is evidence of working playback, not a claim of instant startup or all-channel certification.
- Phone-size Chrome exercises the actual mobile HTML; physical phone/Cast testing is not claimed. Existing sender/receiver ownership bypass tests pass.
- No channel IDs, profiles, genres, services, credentials or migrations changed. Deployment and hosted verification pending.
