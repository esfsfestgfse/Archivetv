# Sports broadcast depth implementation plan

**Goal:** Deepen Ice Time (60), The Fairway (71), and Racquet Club (72) with real games/matches/rounds, and prevent stale short, simulated, interview and highlights entries from returning.
**Architecture:** Reuse the existing Archive file-bank, genre admission, D1 fallback and 6.1 event rotation/recovery. Research happens offline; new file-level records enter the existing relay rail. No new discovery on tune, services, channel numbers, bindings or UI.
**Execution:** Native, one final review; existing linked worktree at f7b1b0b. User already authorized continuing targeted sports improvements and asked for credit efficiency.

## Constraints
- Preserve other sports formats (coaching, newsreels, documentaries and outdoor programs) and current source/landscape/language gates.
- Reject actual source identities as well as polished editorial titles; a video game cannot be relabeled as tennis.
- Never represent a partial recording, highlights, interview or missing runtime as a verified full broadcast.
- Count unique event/file inventory separately from available transport and visible-frame proof.
- Retain the larger unseen catalog; do not turn the new depth into another fixed five-item loop.

## Tasks
- [x] Inspect existing source banks and public metadata; record current catalog/rotation baseline and bounded candidate evidence.
- [x] Add regression cases for contaminated/stale catalogs, valid broadcasts, unrelated channels and file-level expansion. Implement narrow admission across relay/API/client and a verified, deduplicated file bank for 60/71/72.
- [x] Verify the new bank with metadata and bounded media transport checks; exercise multiple catalog rotations plus real visible playback/Next/guide in Chrome desktop and phone-size layout.
- [ ] Run affected tests, one fresh review, required release checks; publish 6.1.1 with a new visible stamp and verify hosted playback/rotations and deployments.

## Review focus
- Original Archive IDs/child filenames must survive editorial labels.
- Genuine recordings in parts remain distinct; do not claim fragments are complete matches.
- Temporary Archive failures do not remove existing healthy broadcasts.
- Stored D1/client shelves apply the same admission as discovery.
- No per-tune metadata fanout or unlimited recovery retries.

## Verified result (2026-10-29)
- New indexed, range-verified files: Ice Time 16; The Fairway 43; Racquet Club 18. These are metadata/transport admissions, not claims that every recording was watched in full or all spoken language was independently certified.
- Source/derivative duplicates, obvious fragments and ambiguous short professional captures excluded. Original source identity and selected file runtime survive API/client requalification.
- Final local canary: three shelves of five for each lane, 15 distinct selections per channel, no early repeats. New banks remain in candidate catalogs.
- One fresh review: removed EA Sports compilation, mixed CSI/hockey/football tape and 30-minute NHL excerpt; repaired full broadcasts with commercials. Further final evidence excluded a known incomplete legacy Wimbledon source whose display title hid the qualifier. Regressions reproduced and passed.
- 31 sports integration tests, 56 affected admission/playback tests, and all 96 existing CI/API Node command groups passed.
- Chrome visible frames: golf, hockey and tennis; representative Next and guide behavior. Phone-size Chrome mobile HTML played a 99-minute Masters round. No physical Cast/phone re-certification is claimed.
- API, relay and visible desktop/mobile stamp set to 6.1.1. Hosted verification remains part of the publish task.
