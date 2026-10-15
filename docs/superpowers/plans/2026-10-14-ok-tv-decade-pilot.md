# OK TV Decade Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast, deep 1980s, 1990s, and 2000s OK television channels as filtered views of the verified channel 585 catalog, without creating new scrapers or weakening the existing master channel.

**Architecture:** Continue ingesting and verifying OK television exactly once under `ok-tv-channel`. Persist TVmaze-derived series premiere metadata in each program's existing `metadata_json`, then serve channels 600–602 through a derived-catalog read path that filters the parent D1 catalog before the SQL limit while keeping a separate freshness ledger for each decade channel. The clients receive only cached verified manifests; no decade tune request may call OK.ru or TVmaze.

**Tech Stack:** JavaScript ES modules, Cloudflare Workers, D1, Durable Objects, HTML desktop/mobile clients, Node 22 behavioral tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-14-ok-tv-decade-pilot-design.md`

## Global Constraints

- Channel 585 remains the mixed-era OK TV master and retains all trustworthy items, including programs with unknown premiere years.
- Pilot channels are fixed as 600 `OK TV: The 80s`, 601 `OK TV: The 90s`, and 602 `OK TV: The 2000s`; no current channel is removed or renumbered.
- A decade is determined only from the original series premiere year returned by the already-used TVmaze identity lookup. Upload dates and unverified title years are never classification evidence.
- The existing OK TV admission gates remain mandatory: English identity, official playable OK embed, landscape format, at least 15 minutes, and no podcasts, fan productions, parodies, reactions, tutorials, clips, trailers, animation, movies, or audio-only rows.
- One discovery/verification pipeline owns all four channels. Decade channels are read-only filtered views and must never schedule provider discovery, consume separate OK.ru query offsets, or copy program rows.
- Store `seriesStartYear` and `seriesDecade` in existing `programs.metadata_json`; do not add a migration unless a failing test proves JSON filtering cannot meet the response and correctness gates.
- The parent catalog key and playback freshness key are separate concepts: `ok-tv-channel` supplies candidates, while each of `ok-tv-channel`, `ok-tv-1980s`, `ok-tv-1990s`, and `ok-tv-2000s` owns independent recent-play history.
- Public shelves remain five verified items with one playing, two ready, and background candidates. Prefer five distinct series and enforce the ten-series cooldown while alternatives exist.
- Unknown-year, wrong-decade, or unverified rows cannot pad a shallow decade. A lane that misses its depth gate remains canary-only.
- The initial feature flag is `okDecades=1`. Without it, ordinary guide/surfing behavior must be byte-for-byte equivalent at the channel-contract level.
- Existing untracked audit artifacts and research scripts remain untouched. Increment the visible release only when a verified pilot is actually promoted.

## File and Responsibility Map

- `ok_public_search.js`: derive trustworthy series premiere metadata from TVmaze identities.
- `realsignal_source_catalog.js`: preserve series metadata through normalization and define derived-profile contracts without adding discovery tasks.
- `source_suite_profile_registry.js`: declare the three decade profiles as derived views of `ok-tv-channel`.
- `realsignal_api_v2_worker.js`: decouple catalog source key from freshness key, filter decade rows in D1 before limiting, and serve derived manifests without upstream calls.
- `assets/ok-embed-runtime.js`: preserve/validate decade metadata at the playback boundary if the current client sanitizer strips it.
- `the_dial_desktop.html`, `the_dial_mobile.html`: guarded channel registrations, guide descriptions, independent local series history keys, and desktop/mobile parity.
- `scripts/test-ok-tv-decades.js`: focused unit/integration contract for classification, D1 selection, freshness, guide parity, and no-discovery behavior.
- `scripts/test-ok-catalog-depth.js`: prove channel 585 behavior and other OK families remain unchanged.
- `.github/workflows/ci.yml`, `.github/workflows/realsignal-api.yml`: run the focused decade contract wherever the affected Worker/client paths deploy.
- `docs/`: record canary evidence, promotion decision, release stamp, and rollback command.

## Review Focus

- **Freshness-key leakage:** a derived request must read `channel_programs` with the parent key but join/write `channel_freshness` with its own profile key; otherwise watching the 80s lane corrupts channel 585 or the 90s lane.
- **Post-limit filtering:** decade qualification must occur in the D1 predicate before `LIMIT`; filtering a 512-row mixed-era window afterward can falsely underfill a deep decade.
- **Cold-path discovery:** no branch, retry, shallow-catalog repair, family fallback, or maintenance hint from a viewer request may invoke OK.ru/TVmaze for a derived profile.
- **Untrusted year inference:** missing/malformed TVmaze `premiered` data must leave the item master-only; title years, upload timestamps, and episode air dates cannot classify it.
- **Flag/rollback drift:** desktop, mobile, guide, direct tune, service worker assets, and API profile handling must agree on the flag, and disabling it must leave channel 585 and all non-TV OK profiles unchanged.

---

### Task 1: Persist canonical TVmaze decade metadata

**Files:** Modify `ok_public_search.js`, `realsignal_source_catalog.js`, `realsignal_api_v2_worker.js`; create `scripts/test-ok-tv-decades.js`.

**Interfaces:**

- Add `export function okSeriesPremiere(show)` returning `{ seriesStartYear, seriesDecade }` only for a valid TVmaze `show.premiered` year in the supported four-digit range, otherwise `null`.
- Extend the television result of `okProgramIdentity(item, "tv", getJson, cache)` with `seriesStartYear` and `seriesDecade` from `okSeriesPremiere(show)`.
- Preserve both numeric fields through `normalized()` and `compactCatalogItem()`, and reconstruct them in `catalogFallback()` from `metadata_json`.
- Keep `year` as provider/upload metadata; it is not repurposed as the series premiere field.

- [ ] Add failing boundary tests to `scripts/test-ok-tv-decades.js` for 1979/1980, 1989/1990, 1999/2000, 2009/2010; malformed/missing dates; and a title containing `1994` whose TVmaze show has no premiere date.
- [ ] Add a failing persistence round-trip test proving an identity-verified item retains `seriesStartYear: 1984` and `seriesDecade: 1980` after normalization, `compactCatalogItem()`, D1 upsert, and catalog reconstruction.
- [ ] Run `node scripts/test-ok-tv-decades.js`; expect failures for the missing helper and stripped metadata.
- [ ] Implement the minimal metadata helper and preservation fields without changing existing title queries, provider discovery, or admission rules.
- [ ] Run `node scripts/test-ok-tv-decades.js`, `node scripts/test-ok-source-recovery.js`, and `node scripts/test-ok-catalog-depth.js`; expect all pass.
- [ ] Commit only Task 1 files with message `feat: classify verified OK TV series by decade`.

### Task 2: Define derived decade profiles with no discovery path

**Files:** Modify `source_suite_profile_registry.js`, `realsignal_source_catalog.js`, `scripts/test-ok-tv-decades.js`.

**Interfaces:**

- Add profiles `ok-tv-1980s`, `ok-tv-1990s`, and `ok-tv-2000s` with `parentProfileKey: "ok-tv-channel"`, `derivedCatalogOnly: true`, `seriesDecade: 1980 | 1990 | 2000`, the same runtime/admission contract as OK TV, and no provider-owned discovery queries.
- Extend `normalizedProfile()` to return `parentProfileKey`, `derivedCatalogOnly`, and `seriesDecade` after validating the parent exists, is an OK television profile, and the decade is one of the approved pilot values.
- Add `export function sourceCatalogKey(profile)` returning the parent key for a derived profile and its own key otherwise.
- Make `sourceCatalogTasks()` and `sourceRefreshTasks()` return an empty task list for `derivedCatalogOnly`; direct calls to `discoverSourceCatalog()` for a derived profile return a typed `derived-catalog-only` result rather than calling a provider.
- Make `qualifySourceItem()` apply channel 585's existing TV identity/admission gate plus exact `seriesDecade` equality for derived profiles.

- [ ] Add failing tests asserting all three derived profiles normalize to the parent catalog, reject wrong/unknown decades, and produce zero OK.ru/TVmaze provider tasks even for `maintenance`, `refresh`, and empty-cache inputs.
- [ ] Add a regression assertion that `ok-tv-channel`, OK Movies, OK animation, OK curated TV, and OK music still produce their existing discovery plans.
- [ ] Run `node scripts/test-ok-tv-decades.js`; expect the profile/no-discovery assertions to fail.
- [ ] Implement the derived-profile contract and shared parent qualification without copying channel 585's deny/match arrays into divergent code.
- [ ] Run `node scripts/test-ok-tv-decades.js`, `node scripts/test-external-source-channels.js`, `node scripts/test-ok-animation-depth.js`, `node scripts/test-ok-curated-tv.js`, and `node scripts/test-ok-music.js`; expect all pass.
- [ ] Commit only Task 2 files with message `feat: define derived OK TV decade profiles`.

### Task 3: Serve filtered parent catalogs with independent freshness

**Files:** Modify `realsignal_api_v2_worker.js`, `scripts/test-ok-tv-decades.js`, and `scripts/test-v3-api-contract.js` only if the advertised capability list changes.

**Interfaces:**

- Extend `catalogFallback(env, body, requestedLimit, options)` with `body.catalogChannel`; `body.channel` remains the freshness/rotation identity, while `body.catalogChannel` selects `channel_programs` rows.
- For derived profiles, use SQL that joins `channel_programs cp` on `cp.channel_key = parentProfileKey`, joins `channel_freshness cf` on `cf.channel_key = derivedProfileKey`, and applies `CAST(json_extract(p.metadata_json, '$.seriesDecade') AS INTEGER) = ?` before ordering and `LIMIT`.
- Add `handleDerivedSourceCatalog(request, env, ctx, id, body, profile)` (or an equivalently isolated branch) that only reads the filtered D1 manifest, records played IDs under the derived profile, returns the standard Source Suite payload, and never reaches `sourceCatalogTasks()`, `scheduleSourceRefresh()`, family fallback, or first-lane discovery.
- Preserve `catalogDepth`, `playableCatalogDepth`, `unseenCatalogItems`, `catalogExhausted`, `candidateItems`, five-item shelf, five-series balance, and ten-series cooldown semantics.
- The guide endpoint uses the same derived catalog/freshness keys and exact items as playback.

- [ ] Build an in-memory D1 fixture with at least 15 series and 75 episodes per pilot decade, unknown-year rows, boundary rows, and mixed-era parent ordering; add a failing test proving each lane returns only its decade and reaches five distinct series even when its rows appear beyond the first mixed-era limit.
- [ ] Add failing isolation tests: play an item in channel 600, then prove it is fresh in 585/601/602 but excluded in 600; also prove ten cooled 80s series yield an unseen 80s series before any cooled fallback.
- [ ] Add a provider-spy test proving cold, shallow, refresh, repeated Next, and guide requests for 600–602 make zero outbound fetches and zero discovery-offset writes.
- [ ] Add last-known-good and exhaustion tests: a populated derived catalog serves during provider outage; a truly exhausted lane reports `repeatAllowed: true`; a wrong-decade row never pads the shelf.
- [ ] Run `node scripts/test-ok-tv-decades.js`; expect D1 key/filter/freshness assertions to fail.
- [ ] Implement the parent-catalog/derived-ledger read path and exact server payload.
- [ ] Run `node scripts/test-ok-tv-decades.js`, `node scripts/test-ok-catalog-depth.js`, `node scripts/test-v2-api-worker.js`, and `node scripts/test-v3-api-contract.js`; expect all pass.
- [ ] Commit only Task 3 files with message `feat: serve OK decade manifests from the master catalog`.

### Task 4: Add guarded desktop/mobile channels and guide parity

**Files:** Modify `the_dial_desktop.html`, `the_dial_mobile.html`, `scripts/test-ok-tv-decades.js`, `scripts/check-channel-registry.js` if its expected registry count is explicit.

**Interfaces:**

- Add a shared client predicate equivalent to `new URLSearchParams(location.search).get("okDecades") === "1"`.
- When enabled, register channels 600/601/602 as `cat: "SOURCE"`, `source: "v2preview"`, and preview keys `ok-tv-1980s`, `ok-tv-1990s`, `ok-tv-2000s`; when disabled, omit them from surfing, guide, numeric tune resolution, favorites, and recent-channel lists.
- Each profile uses its own local `v2recent:` and `v2recentSeries:` key while requesting its server profile key; never alias history to `OK TV Channel`.
- Add concise guide descriptions that state the series-debut rule, 15-minute minimum, and shared verified OK catalog. Guide current/next remains sourced from the returned manifest, not a client guess.
- Direct canary links use `?okDecades=1&channel=600`, `601`, or `602`; disabling/removing the flag restores the baseline lineup without stored-data changes.

- [ ] Add failing static/runtime tests that the flag exposes exactly three channels with matching numbers/profile keys on desktop and mobile, and that the unflagged registry excludes all three.
- [ ] Add failing tests for independent local history keys, exact current/next guide rows, direct tuning under the flag, and disabled-flag rejection/fallback without changing channel 585.
- [ ] Run `node scripts/test-ok-tv-decades.js` and `node scripts/check-channel-registry.js`; expect flag/registry assertions to fail.
- [ ] Implement the guarded channel and guide registrations in both clients with identical ordering and metadata.
- [ ] Run `node scripts/test-ok-tv-decades.js`, `node scripts/check-channel-registry.js`, `node scripts/check-html-syntax.js`, `node scripts/check-source-suite-contract.js`, and `node scripts/test-guide-row-stability.js`; expect all pass.
- [ ] Serve the app locally and run `python ci/test_regression.py http://localhost:8799/the_dial_desktop.html?okDecades=1` plus the mobile equivalent; expect no page errors and unchanged baseline behavior without the flag.
- [ ] Commit only Task 4 files with message `feat: add guarded OK TV decade channels`.

### Task 5: Certify, canary, and promote only passing channels

**Files:** Modify `.github/workflows/ci.yml`, `.github/workflows/realsignal-api.yml`; create `scripts/certify-ok-tv-decades.js`; update release stamps and create `docs/2026-10-14-ok-tv-decade-pilot-results.md` only if promotion gates pass.

**Interfaces:**

- `scripts/certify-ok-tv-decades.js --base-url <api>` performs cached-manifest checks for each profile and emits JSON containing `profileKey`, distinct series, playable episodes, ready depth, response time, wrong-decade count, blocked-format count, exact repeats across 15 Next operations, cooldown violations, guide mismatch count, and pass/fail reasons.
- A channel passes only with at least 12 series, 60 episodes, five ready items from five series, cached response below 500 ms in the measured production region, no exact repeat before exhaustion, no cooldown violation while alternatives exist, no contaminated rows, and guide/playback agreement.
- CI runs the deterministic local contract on every affected change. Network certification is a guarded manual/canary job and cannot silently redefine a failed lane as healthy.

- [ ] Add the focused deterministic test to both CI workflows and run the same affected suites locally; expect all pass before any deployment.
- [ ] Deploy the API/client change to the existing canary path with `okDecades` still excluded from the ordinary guide; verify health headers and rollback target.
- [ ] Run `node scripts/certify-ok-tv-decades.js --base-url <canary-api>` and save the exact JSON evidence. Run visible first-frame and fifteen-Next checks on desktop and mobile canary pages; record device limitations rather than inferring them.
- [ ] Obtain a fresh code review focused on the five Review Focus risks; add a regression test for every reproducible finding before changing code.
- [ ] If an individual lane misses any gate, leave that lane canary-only and document the measured constraint. Do not pad it, publish it, or block promotion of a different lane that independently passes.
- [ ] If one or more lanes pass, remove only those passing registrations from flag-only filtering, bump all visible release/API/service-worker stamps together, run the full local CI command set represented in `.github/workflows/ci.yml`, and push/deploy with rollback ready.
- [ ] Verify GitHub CI, API deployment, Pages deployment, public build stamp, unflagged baseline, promoted guide entries, and channel 585 regressions before claiming completion.
- [ ] Commit certification wiring separately as `test: certify OK TV decade pilot`; commit any actual promotion/release as `release: promote verified OK TV decade channels`.
- [ ] Record exact commit SHA, public URL, promoted/constrained channels, metrics, and rollback procedure in the results document.

## Final Self-Review Checklist

- [ ] Every requirement and out-of-scope item in the approved spec maps to a task or Global Constraint.
- [ ] Every changed behavior starts with a failing deterministic test and includes the command plus expected failure/pass state.
- [ ] The same metadata names and types are used end-to-end: numeric `seriesStartYear`, numeric `seriesDecade`, string `parentProfileKey`, boolean `derivedCatalogOnly`.
- [ ] The five Review Focus failure modes each own at least one explicit regression assertion.
- [ ] No task requires a schema migration, new credential, new scraper, existing-channel renumber, or browser-side catalog discovery.
- [ ] Promotion is per-channel, evidence-backed, reversible, and cannot alter channel 585's catalog or freshness history.
