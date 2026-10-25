# Chrome compatibility and genre verification — 6.0.12

> **For agentic workers:** Use superpowers:executing-plans. Execute the approved user steps inline; obtain one bounded independent review of any final code changes.

**Goal:** Isolate the remaining Chrome blank-player trigger, preserve fast playback and catalog depth, and ship only reproduced fixes as 6.0.12.

**Architecture:** Keep the shared YouTube transport and existing catalog/freshness contracts. Use local diagnostic controls to distinguish application lifecycle failures from browser-profile behavior. Reuse the shared IA and Source Suite admission boundaries for proven genre corrections.

**Tech stack:** Plain browser JavaScript, existing Node/Python regression suites, Cloudflare API/relay, GitHub Pages/Actions.

**Spec:** The user's approved four-step request in this conversation; no separate design artifact.

## Global constraints

- No catalog, browser-profile, or viewing-history resets; no channel hiding or broad rewrite.
- Preserve Source Suite 15-minute minimum, no portraits, no podcasts/fan productions/disclosed AI. Preserve legitimate short classic cartoons on IA.
- Do not change extensions or browser settings to make tests pass. Previously blocked internal Chrome inspection must not be bypassed.
- Browser-layout testing is not physical mobile/Cast certification; playback clock is not first-frame telemetry.
- Normal main push/deploy is already authorized; visibly stamp 6.0.12 only for actual verified changes.

## Review focus

- SDK ready after cancellation cannot revive media.
- Compatible Next must retain transport and isolate stale callbacks.
- Missing playback evidence cannot count as a successful tune.
- Title/subject collisions must be rejected without rejecting valid series episodes.
- Cached/stored/relay/client paths must apply the same editorial policy without resetting freshness.

### Task 1 — isolate and verify Chrome startup

Files: ignored `output/v6-reliability/` controls; modify `assets/youtube-embed-runtime.js` and lifecycle/client tests only if an application defect reproduces.

- [ ] Run matching immediate/delayed controls in regular Chrome and isolated browser; inspect document loading and decoded media, including whether observer actions themselves affect the result.
- [ ] Record a cause or bounded unresolved condition. If code is implicated, add the failing behavioral regression before the smallest fix.
- [ ] Verify actual cold start, Next, rapid changes, guide open/close on desktop and mobile HTML.

### Task 2 — bounded cross-family genre corrections and release

Files: shared `ia_file_contract.js`, `assets/source-program-policy.js`, relay and both HTML gate copies where relevant; existing admission tests; release notes and stamps.

- [ ] Sample ready programs/candidates across representative IA/Source Suite TV, cartoons, films, documentary, outdoors/auto, music and comedy lanes; preserve saved evidence.
- [ ] Reproduce only confirmed wrong-program admissions in tests, patch their shared boundary, and check retained valid depth.
- [ ] Run focused suites, full established offline gate and stamp tests; obtain one independent final review.
- [ ] Commit/push/deploy 6.0.12; verify hosted decoded playback, live queues, stamps and all deployment jobs; record limitations and clean up only this task's test resources.
