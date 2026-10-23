# V6 Full Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Native execution with one final scoped review; user authorized continuation on 2026-10-23 after the plan review request.

**Goal:** Replace the cramped guide in the opt-in V6 preview with a fast, readable retro-cable directory using real current/next programs.

**Architecture:** Extend the existing read-only presentation adapter with canonical directory metadata. Mount one guarded guide presenter over that adapter; route explicit Watch/favorite/close actions through existing commands. The existing guide remains the fallback for default and Cast modes, never a competing active renderer.

**Tech Stack:** Plain JavaScript/CSS, existing desktop/mobile HTML, Node tests, actual-browser validation. No framework, storage migration, or new provider.

**Spec:** `docs/superpowers/specs/2026-10-21-realsignal-v6-retro-cable-design.md`

## Global Constraints

- Opt in with `v6=1`; no final V6 stamp or default-mode rollout.
- No new channels, removals, merges, renumbering, automatic hiding, time-of-day restrictions, or custom-channel builder.
- Preserve catalogs, exact file identities, source qualification, freshness history, recovery, and existing Cast routing. Roku and Vimeo remain paused.
- Guide browsing must not discover, hydrate, prime queues, restart playback, or advance viewing history.
- Desktop: compact category rail, searchable current/next list, one selected-program detail panel. Mobile: same functions stacked with at least 44px controls and bounded internal scrolling.
- Preserve picture aspect ratio and existing media nodes; do not clone a video into the guide.
- Label viewer-specific programming Playing/Next, not fabricated time slots. Unknown duration is not zero. FAST EPG absence is explicitly unavailable.
- Retain search, favorites, recent channels, duration, source, visible directional focus, Escape/Back-to-close, selection, scroll, and opener focus.
- Connected Cast sender/receiver retain their current guide until separately certified.

## Review Focus

1. A late queue update must not replace a focused row, clear search, or reset scrolling.
2. Long program titles and empty/unavailable listings must remain readable at narrow widths and large text.
3. Keyboard activation, numeric tuning, and Escape must not trigger both guide and page-level handlers.
4. Closing or leaving canary mode must release the guide focus trap and restore the correct controls.
5. Search/favorites/recent filtering must not hide legacy aliases from direct tuning or mutate the real lineup.

## Task 1: Read-only canonical directory adapter

**Files:** Modify `assets/guide-contract-client.js`; extend `scripts/test-guide-contract.js`.

**Interfaces:**
- Consume `publicLineupChannels()`, canonical merge filtering, `guideCategoryFor(ch)`, `canonicalChannelLabel(ch)`, `isFav(num)`, the existing recent-history key, and `snapshot(num)`.
- Produce `RealSignalPresentation.directory()` returning copied `{number,key,name,categoryId,categoryLabel,description,favorite,recentIndex}` rows in category/channel order; `categories()` returns copied `{id,label}` rows. Do not use mutable legacy filter state to build this directory.
- Add command `favorite` resolving the latest `toggleFav(number)` wrapper. Existing tune command owns recent history.

- [x] Write failing tests for canonical-only rows, stable sort, no mutation, favorites/recent persistence, and no discovery/rotation calls.
- [x] Run `node --test scripts/test-guide-contract.js`; confirm expected failures.
- [x] Implement the adapter using existing registry owners without duplicating their channel rules.
- [x] Rerun the tests; expect green and unchanged existing snapshot behavior.
- [ ] Commit the independently tested adapter.

## Task 2: Single-owner responsive guide

**Files:** Create `assets/v6-guide.js`, `assets/v6-guide.css`, `scripts/test-v6-guide.js`; modify both HTML entrypoints and `.github/workflows/ci.yml`.

**Interfaces:**
- Consume `.enabled`, `.directory()`, `.categories()`, `.snapshot(number)`, and `.command(name,value)`.
- Produce `RealSignalGuide.open()`, `.close()`, `.refresh()` and a guarded `#rsV6Guide` dialog. Final `openGuide/closeGuide` wrappers delegate only while eligible; otherwise call the existing owner. Legacy rendering/priming is not invoked by V6 guide actions.
- Store only local presentation state: query, category, all/favorites/recent view, selected channel, list scroll and opener. No catalog or duplicate watched-history ledger.
- Desktop grid: 176px category rail, flexible current/next rows, 300px detail panel; collapse detail below the list under 1100px and categories into a compact selector under 700px. Header/search stay visible. Channel rows select details; a labeled Watch action tunes and closes.
- Show channel number/name, honest state, current/next title, known runtime/source, favorite action, and selected program details. Pending entries remain browsable without internal warmup terminology.
- Refresh visible data at most once per second while open, updating text in place; rebuild rows only when filters change. No polling while closed.

- [ ] Write failing behavioral tests: filter/search/favorites/recent, current/next rendering, no fake duration, exact single Watch command, selection without tuning, no queue work, safe text rendering, preserved scroll/focus, refresh without replacing focused rows.
- [ ] Add keyboard tests: arrows move visible selection; Enter on Watch/favorite acts once; Escape closes and restores opener; typing in search is isolated from page numeric/shortcut handlers; Tab remains within an open dialog.
- [ ] Add mode tests: default and Cast retain legacy behavior; entering Cast while open closes the V6 guide without emitting a stray receiver command; disabled mode leaves no focus trap.
- [ ] Run `node --test scripts/test-v6-guide.js`; confirm new behavior fails before implementation.
- [ ] Implement the guarded presenter and scoped CSS; reuse existing presentation commands and snapshots.
- [ ] Run new tests, guide-contract and watching-shell suites plus `node scripts/check-html-syntax.js`; expect green.
- [ ] Commit the tested guide behind the existing canary flag.

## Task 3: Real-use verification and preview release

**Files:** Add `docs/2026-10-22-v6-full-guide.md`; update visible desktop/mobile build stamps and versioned asset URLs together only after verification.

- [ ] Browser-test desktop 1440×900 and 1024×600, mobile 390×844 and landscape 844×390; inspect screenshots for readable text, long titles, no page overflow and reachable controls.
- [ ] During actual IA playback, exercise category/search, favorites/recent, Watch, Next, rapid tune, reopen, Escape and numeric entry. Record guide open/close timings and decoded video progress, not just queue readiness.
- [ ] Test empty results, missing EPG/runtime, resize, increased text, default-mode fallback and simulated connected-Cast guards. Do not claim physical Cast certification from a browser simulation.
- [ ] Run the exact offline CI Node command set including both HTML arguments. Report every failure; retain unrelated audit artifacts untouched.
- [ ] Request one scoped independent review; fix substantive findings with RED→GREEN regression tests.
- [ ] Document evidence and limits. Push only the reviewed opt-in preview under a fresh 5.6.x build; verify CI/Pages before calling it shipped. Final V6 rollout remains a separate decision.

## Separate current defect

The reported irrelevant short IA programs are an existing playback-admission defect, not guide behavior. Diagnose and test selected-file runtime propagation and final admission independently; preserve original cartoon shorts and interstitials. Do not broaden this guide plan into a provider/catalog rewrite.
