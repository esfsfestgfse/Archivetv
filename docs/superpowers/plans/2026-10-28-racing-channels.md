# Racing channels implementation plan

**Goal:** Auto Racing 54 plays race broadcasts across motorsports; NASCAR Classics 84 draws full-length races from the official NASCAR archive.

**Design:** Preserve the IA relay for 54. Add one official NASCAR adapter to the existing server Source catalog and reuse its D1 persistence, viewing history, guide, and native HLS playback. Seed cold starts with file/manifest-verified official races; background year/page rotation expands the catalog. No new settings, credentials, proxy, or separate player engine. NASCAR retains ownership; public playback is not labeled public domain.

**Constraints:** No unrelated automotive documentaries, highlights, games, podcasts or portraits. NASCAR replay admission requires an official source URL, NASCAR-hosted HLS, a completed clear VOD playlist, landscape rendition and at least one hour. Keep existing channels and numbers intact. Ship only after visible video/Next proof and affected regression checks.

- [x] Write failing NASCAR adapter/qualification/HLS tests and IA race-format cases.
- [x] Add official replay adapter and verified starter inventory; connect the existing server and client profile.
- [x] Tighten channel 54's race-format gates and seed multiple racing disciplines without removing its NASCAR coverage.
- [x] Verify actual HLS frames, Next, guide listing, rotation and recovery; run release regression checks.
- [ ] Commit, push/deploy with visible 6.0.47 stamp; verify hosted playback and report limitations.

**Local evidence (2026-10-29):** 29 official NASCAR full broadcasts (1979–2024), background adapter added three independent races in 3.4 seconds. Chrome desktop visible starts ~3 seconds, subsequent race starts ~1.3 seconds; mobile-layout Chrome visible start3.0 seconds and4+ minutes advancing playback without recorded stalls. Guide displays actual current/next race titles and durations. This is browser/mobile-layout evidence, not physical phone/Cast certification. Review also caught and repaired D1 proof persistence and overstrict sponsored-event names.

**Final local gate:** all 95 CI/API test commands passed. Added a reproduced-client regression for race verification surviving warm playback and saved shelves; stale Talladega Nights/Grand Prix fiction is rejected. Auto Racing first visible frame 2.549 seconds; Next moved to another full race in 246 ms with no recorded stalls. Official NASCAR Next/mobile-layout proof remains green.

**Production canary:** 6.0.47 exposed Workers rejecting fetch redirect:error; this suppressed background discovery and incorrectly quarantined healthy seeded playback. Corrected to manual redirects (3xx are rejected without following) and separate discoveryError from playback health. Follow-up build 6.0.48; added Workers-mode discovery and fallback-health regressions before the fix.

**Hosted content check:** NASCAR server discovery now adds actual new races (32+ verified records; no discovery errors); production 720p first frame 2.893 seconds, subsequent starts 1.28 seconds. IA named-event metadata also admitted short/post-race/on-board clips, so require substantial runtime for unlabelled race titles, reject explicitly partial/post-race coverage, and retain explicit full-race broadcasts. Added cross-surface regressions; final stamp 6.0.49.

**Final format canary:** a 41-minute Grand Prix was abbreviated coverage despite lacking a highlights label. Unlabelled named events now require at least one hour; explicitly identified full races and vetted full-broadcast files retain their own admission. Final stamp 6.0.50.
