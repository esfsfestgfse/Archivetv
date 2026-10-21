# V6 First Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the proven overridden guide renderer in both builds while keeping the effective guide, channel lineup, playback, and freshness behavior unchanged.

**Architecture:** This is the first bounded slice of the V6 umbrella design, not the new UI rollout. Keep the current HTML/asset loading structure. Pin the effective renderer with executable offline tests, remove only the superseded declaration, and wire that guard into existing CI.

**Tech Stack:** Existing JavaScript, Node built-ins (`node:test`, `node:assert/strict`, `node:vm`, `node:fs`), existing HTML clients and GitHub Actions. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-realsignal-v6-retro-cable-design.md`, sections 1, 5, 7, and subproject 1 in section 8.

## Global Constraints

- "Depth and freshness remain core requirements, not trade-offs for a prettier screen."
- "No new channels, removals, merges, renumbering, automatic hiding, time-of-day restrictions, or custom-channel builder are part of this project."
- "Roku and Vimeo remain paused."
- "Do not reintroduce a synchronous five-video startup requirement."
- "Preserve audit artifacts and user data; remove code only when references and tests establish it is unused or replaced."
- "Metadata readiness and HTTP range responses are not decoded playback evidence."
- "Do not rerun an expensive full soak for every cosmetic edit."
- No API, provider, schema, service-worker, watch-history, commercial, or Cast changes in this slice. V6 layout and module extraction are deferred to later plans.
- Production remains 5.6.29. This local cleanup is not a V6 release or permission to deploy; any later release must have matching visible build stamps and normal verification.

## Review Focus

1. Duplicate declarations can hide effective behavior: assert one renderer and execute the directory implementation, not the retired bank.
2. A hidden guide should do no row work: render with the guide closed and assert zero DOM writes and no discovery calls.
3. Empty/filter results must stay usable: render an empty list and assert the current empty-state copy without throwing.
4. Selecting an aliased channel must tune its canonical number exactly once and close the correct surface; cover desktop and mobile sheet paths.
5. Titles and current/next text are untrusted: preserve escaping, stable row keys, favorites, and current-channel indication.

Each case belongs to the single task below. Deferred wrapper consolidation must not be smuggled into this change.

## File structure

- Modify `the_dial_mobile.html`: remove only the first overridden `renderRail` declaration.
- Modify `the_dial_desktop.html`: port the identical removal.
- Create `scripts/test-guide-renderer-ownership.js`: dependency-free ownership and behavior regression tests for both HTML builds.
- Modify `.github/workflows/ci.yml`: run the new test once in `test-worker` beside `test-guide-row-stability.js`; its existing HTML/scripts path filters cover the change.
- Keep `docs/2026-10-21-v6-runtime-ownership.md` as the inventory/evidence record; append cleanup results after verification.

### Task 1: Remove the overridden renderer under a behavior guard

**Interfaces:**
- Consumes existing inline `renderRail() -> void`, `visibleChannels() -> Channel[]`, `guideListing(ch) -> {now,next,detail}`, and DOM row/click behavior. Do not change those signatures.
- Produces one `renderRail` declaration per build and a Node test script that exits nonzero on ownership or behavior regressions. No new browser API or runtime export.

- [x] **Step 1: Write the failing regression tests.**

  In `scripts/test-guide-renderer-ownership.js`, use `node:test` to check both builds. Count declarations with `/\bfunction\s+renderRail\s*\(/g` and assert `count === 1`.

  For executable cases, slice the renderer section between `function renderRail(){` and the comment beginning `Queue warming runs while this panel is open`, compile it with `vm.Script`, and invoke the resulting `renderRail` in a small fake DOM. Before cleanup that section includes both declarations, allowing the tests to establish which renderer wins. Keep all helpers private to this test file.

  The fake DOM records created nodes, appended fragments, `innerHTML`, datasets, classes, and click listeners. Supply the existing renderer's dependencies: `chList`, `gwrap`, `visibleChannels`, category/merge lookups, `$`, `guideCategoryFor`, `canonicalChannelLabel`, `guideFamilyLabel`, `guideListing`, `esch`, `isFav`, `tuneNum`, `closeGuide`, and optional `window.closeSheets`. No networking, storage, timers, or real media.

  Assert these named cases for each build:
  - `one renderer owns the guide`: exactly one declaration.
  - `hidden guide does not render or discover`: zero writes, zero list/discovery requests.
  - `empty results preserve the current empty state`: expected "No matching channels yet" copy; no channel rows.
  - `canonical card selects once and closes desktop guide`: input channel `{num:20,key:'courtroom',nm:'Courtroom TV'}` produces `data-channel-num=20`, one `tuneNum(20)`, and one `closeGuide()`.
  - `mobile selection closes sheets`: same input with `window.closeSheets` provided calls it once instead of `closeGuide`.
  - `row metadata stays escaped and stable`: malicious-looking sample title is escaped, current row has `on`, favorite mark remains, and current/next strings and channel key match supplied data. No legacy duplicate row or provider discovery occurs.

- [x] **Step 2: Confirm red and capture the effective renderer baseline.**

  Run `node --test scripts/test-guide-renderer-ownership.js`. Expect only the two declaration-count cases to fail (`2 !== 1`); all behavioral cases must already pass. Resolve harness mistakes before removing code. Record the two current renderer-section hashes or retain the before/after diff for comparison; do not save large HTML snapshots.

- [x] **Step 3: Remove only the dead declaration, mobile first, then desktop.**

  Delete from the first `function renderRail(){ /* v9: honest CHANNEL BANK grid` through its closing brace immediately before `/* RealSignal guide-directory renderer`. Preserve the later renderer byte-for-byte. Do not edit open/close/tune wrappers, category registries, queue constants, scripts, or catalog data.

- [x] **Step 4: Verify green and neighboring contracts.**

  Run, checking every exit status:

  ```text
  node --test scripts/test-guide-renderer-ownership.js
  node scripts/check-html-syntax.js
  node scripts/test-guide-row-stability.js
  node scripts/check-channel-registry.js
  node scripts/check-ia-parity.js
  node scripts/test-release2-runtime.js
  node scripts/test-cast-runtime.js
  ```

  Expect zero failures. Diff review must show the active renderer and runtime state/storage paths unchanged. These checks establish cleanup equivalence, not audiovisual health or first-frame gains.

- [x] **Step 5: Add the guard to CI and record evidence.**

  Add `node --test scripts/test-guide-renderer-ownership.js` to `test-worker` next to the existing guide stability step. Re-run the new test and diff check. Append exact test results, deleted lines/bytes, and untouched boundaries to the ownership inventory. Do not claim a latency improvement without measurement.

- [x] **Step 6: Commit the reviewed local cleanup.**

  Verify only the two HTML builds, test, CI guard, and inventory are staged. Run `git -c core.whitespace=cr-at-eol diff --cached --check`, then commit with `refactor: remove overridden guide renderers`. Preserve unrelated untracked files. No automatic push, deploy, cache reset, or V6 stamp.

## Handoff and later scope

Recommend native execution by the lead agent: one tightly coupled task does not need an implementer team. A final focused review should cover the HTML removals, harness fidelity, and CI wiring. The next V6 plan is shared playback/guide contracts; this plan does not authorize that extraction or the new UI yet.
