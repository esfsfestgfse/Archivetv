# V6 Watching Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Native execution; one final scoped review. Pending plan review before implementation.

**Goal:** Give the approved retro-cable watching experience a large, uncropped picture and labeled controls that fit the browser viewport.

**Architecture:** Keep the existing media host, playback engine, catalogs, and guide owner. Add a guarded presentation layer over the shared `RealSignalPresentation` interface. Reuse the current media node; do not move, clone, or restart it to resize the page.

**Tech Stack:** Plain JavaScript and CSS, existing desktop/mobile HTML, Node built-in tests, actual-browser checks. No new framework, package, backend service, or migration.

**Spec:** `docs/superpowers/specs/2026-10-21-realsignal-v6-retro-cable-design.md`

## Global Constraints

- Production remains 5.6.29; no automatic push, deployment, or V6 stamp.
- No channel, profile, catalog, source-selection, freshness, cooldown, commercial, or Cast-protocol changes.
- Opt in with `v6=1`; normal users retain their current presentation.
- Cast receiver and connected Cast sender retain the existing presentation and command routing until separately certified.
- Preserve aspect ratio. No picture cropping/stretching or page scrolling to reach essential controls.
- Keep power, channel, Guide, Next, Info, Menu, volume, mute, and Cast clearly labeled and keyboard reachable.
- Keep local channel number, time, and date in a compact dock; no permanent description overlay over the picture.
- Preserve existing menu, guide search/favorites/recent state, focus, and watch history. The full guide redesign is the following slice, not a second guide owner here.
- Honor reduced motion and retain optional clean/light/broadcast picture treatments.

## Review Focus

1. Short landscape windows and mobile browser chrome must not push controls below the viewport.
2. Resizing, dock fading, and guide opening must not recreate media or cause extra tune/Next commands.
3. Keyboard focus and touch interaction must reveal controls and prevent the dock fading while in use.
4. Unsupported/disabled canary and Cast modes must not leave hidden legacy controls or a mixed presentation behind.
5. Long titles and large text must wrap/truncate intentionally without covering controls or causing horizontal scrolling.

## Task 1: Guarded watching presentation

**Files:** Create `assets/v6-watching-shell.css` and `assets/v6-watching-shell.js`; modify both HTML builds, `assets/guide-contract-client.js`, and `.github/workflows/ci.yml`; create `scripts/test-v6-watching-shell.js`.

**Interfaces:**
- Consume `RealSignalPresentation.enabled`, `.snapshot()` and `.command(name, value)`.
- Extend commands with `channel-step` → `step(-1|1)`, `volume-step` → `setVol(-0.1|0.1)`, `mute` → `toggleMute()`, and `cast` → `__rsCastRequest()`. Reject invalid steps. Resolve final wrappers at click time.
- Export `RealSignalWatchingShell.refresh()` for a read-only presentation refresh; it reads current snapshot/state and never discovers, primes, tunes, or advances history.
- Apply all new CSS only under `.rs-v6-watch`; remove the class and disable/hide new controls when the canary is not eligible.
- Use the existing `.room/.stage/.console/.set/#tube/#screenArea` media hierarchy and a new compact semantic dock. Hide obsolete decorative hardware only in the eligible canary.

- [ ] Write behavioral tests first: opt-in/Cast guards; one command per explicit click; final-wrapper resolution; invalid step rejection; title/state/date rendering; no media replacement or discovery during refresh; keyboard/touch visibility and idle cancellation; mode exit restores old controls. Assert consumer-visible results with literal fixtures.
- [ ] Run `node --test scripts/test-v6-watching-shell.js`; confirm the new behavior fails before implementation.
- [ ] Implement the smallest guarded shell and command additions. Use bounded read-only updates, avoid full-DOM rerenders, and never create a second video. Keep metadata out of live announcement loops.
- [ ] Run the new tests, `node --test scripts/test-guide-contract.js`, and `node scripts/check-html-syntax.js`; expect all green.
- [ ] Run the exact offline Node CI command set with all HTML arguments retained. Record all failures; do not weaken unrelated checks.
- [ ] Browser-check desktop at 1440×900 and 1024×600, mobile HTML at 390×844, and landscape at 844×390. Verify actual viewport bounds and no page overflow; restore temporary viewport overrides afterward.
- [ ] In both builds, verify decoded/advancing video, one Next transition, Guide open/close, focus return, Menu/Info, power, volume/mute, scanline settings, and controls surviving resize. Check flag-off behavior separately. Report unsupported embedded-player volume honestly rather than simulating it.
- [ ] Record evidence, make a local commit, obtain one independent scoped review, and fix substantive findings with RED→GREEN tests plus a green regression gate. Do not publish.

## Subsequent slices, outside this plan

1. Rebuild the guide list/detail presentation against the same verified snapshots.
2. Certify dedicated mobile/Cast presentation and handoff on actual devices.
3. Implement the fail-open commercial scheduler and era/channel-balanced ad rotation.
4. Run the combined release gate and user review before a V6 release stamp.
