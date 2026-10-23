# V6 Shared Guide Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute natively; one final scoped review.

**Goal:** Give desktop and mobile a read-only current/next snapshot and a command boundary for the approved V6 presentation.

**Architecture:** A small shared selector normalizes existing playback, queue, and live state. A client adapter reads those existing owners and delegates commands to the final installed functions. An opt-in `v6=1` flag uses the snapshot for guide copy; normal playback/provider selection stays with the existing engine.

**Tech Stack:** Plain JavaScript, existing HTML builds, Node built-in tests; no dependencies or migrations.

**Spec:** `docs/superpowers/specs/2026-10-21-realsignal-v6-retro-cable-design.md`

## Global Constraints

- Preserve channel numbers, identities, profiles, catalogs, viewing history, source filters, and Cast ownership.
- The guide shares the player's canonical channel identities and verified queue snapshot. It does not independently discover or hydrate programs.
- Unknown is not zero. Current comes from the actual player; next comes from the playable shelf.
- Retain the rolling `1 playing + 2 ready + background candidates` model.
- No automatic push, deployment, or V6 release stamp. This is a local canary.
- Future watching layout must fit browser width and height with all essential controls reachable; this contract step makes no layout claim.

## Review Focus

1. Switching channels can leave a previous current item behind: require matching channel identity.
2. Queued metadata can masquerade as playable media: filter unresolved records and exclude the actual current ID.
3. A server-wide guide can disagree with a viewer's Next: local playback/shelf wins; never promote a server catalog guess to current playback.
4. Missing/invalid duration or playhead can produce bogus zero/negative remaining time: return null unless values are finite and valid.
5. Previewing can mutate source cursors/history: selection reads copies; command delegation occurs only for an explicit command.

## Task 1: Shared normalized selector

**Files:** Create `assets/guide-contract.js`; create `scripts/test-guide-contract.js`.

**Interfaces:** `RealSignalGuideContract.select({channel,current,queue,live,position,capacity,powered}) -> {channel,current,next,later,state,live,ready,capacity,position,remainingSeconds}`; `listing(snapshot) -> {now,next,detail,state,live,ready,capacity}`. Program records contain `id,title,durationSeconds,provider` and preserve exact source identity. Pure functions; no fetch, timers, storage, or DOM.

- [x] Write tests for wrong-channel current, real playing item versus stale catalog, exact file identity, duplicate/current exclusion, missing/unplayable queue rows, live service copy, powered-off state, malformed duration and playhead, and immutable inputs. Assert literal results.
- [x] Run `node --test scripts/test-guide-contract.js`; confirm missing contract fails.
- [x] Implement selector and compatibility listing with explicit pending/live copy.
- [x] Run focused tests and commit the selector plus tests.

## Task 2: Browser adapter and guarded guide integration

**Files:** Create `assets/guide-contract-client.js`; modify both HTML builds and `.github/workflows/ci.yml`; extend `scripts/test-guide-contract.js`.

**Interfaces:** `window.RealSignalPresentation.snapshot(channelOrNumber)`, `.command(name, value)` and `.enabled`; commands `tune`, `next`, `guide-open`, `guide-close`, `power`, `info`, `menu` delegate lazily to existing commands. HTML helper `guidePlaybackSnapshot(ch)` supplies real current and ready queue records to Task 1.

- [x] Add executable tests for both HTML adapters, source cursor immutability, disabled-flag behavior, latest-wrapper delegation, and zero command/discovery work during snapshots.
- [x] Run focused tests; confirm integration failures before edits.
- [x] Read actual IA media maps and Source Suite state without fetching; expose shared selector; connect guide listing only for `v6=1`. Guard cast-receiver until physical-device testing.
- [x] Add CI coverage and syntax validation for new assets. Run guide ownership/stability, registry/parity, Cast/runtime, and the complete offline Node CI gate.
- [x] Commit, record evidence and limitations, and run one final independent review. Fix substantive findings with failing-then-passing tests. Preserve audit evidence.

## Execution decision

The user explicitly resumed the approved V6 work on 2026-10-21 after confirming the Archive outage. Continue native implementation under that authorization; do not repeat the earlier completed cleanup. The old cleanup plan's extraction deferral described its scope and is not a prohibition on this next authorized slice. Production rollout remains a separate gate.
