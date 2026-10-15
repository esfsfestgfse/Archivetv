# OK TV Decade Views Pilot

**Date:** 2026-10-14
**Status:** Proposed for review
**Scope:** Three pilot television channels derived from the existing OK TV master catalog

## Purpose

Make decade-based browsing understandable without recreating the shallow, slow, independently searched decade channels that previously failed in the Archive lineup. The pilot must preserve the depth, freshness, and startup behavior of channel 585 while providing reliable 1980s, 1990s, and 2000s television views.

## User-visible pilot

The pilot adds these channels only after their catalogs pass the release gates below:

| Channel | Number | Series debut years | Source |
|---|---:|---:|---|
| OK TV: The 80s | 600 | 1980–1989 | Shared OK TV catalog |
| OK TV: The 90s | 601 | 1990–1999 | Shared OK TV catalog |
| OK TV: The 2000s | 602 | 2000–2009 | Shared OK TV catalog |

Channel 585, **OK TV Channel**, remains the mixed-era master channel. No existing channel is removed or renumbered by this pilot.

## Core architectural rule

There is one OK TV discovery and verification pipeline. The decade channels are filtered views over its verified D1 catalog; they are not independent scrapers.

- Background ingestion continues to discover, verify, and store programs under `ok-tv-channel`.
- Each verified program receives a canonical `seriesStartYear` and `seriesDecade` when TVmaze identity evidence is available.
- The three decade profiles read the parent catalog and apply an exact decade filter server-side.
- Tuning a decade channel never initiates OK.ru or TVmaze discovery.
- All clients receive a cached manifest containing verified playable items.
- Each decade channel owns a separate playback/freshness ledger, even though the media records are shared.

This keeps ingestion cost bounded, prevents duplicated searches, and makes channel switching a catalog read rather than a provider search.

## Classification and year rules

1. The canonical year is the identified television series' original premiere year from TVmaze.
2. An upload date never determines the decade.
3. A year found only in an unverified title is insufficient for decade admission.
4. Programs without a trustworthy series year remain eligible for channel 585 but not channels 600–602.
5. A series belongs to exactly one pilot decade, based on its premiere year. This deliberately favors stable classification over attempting to infer individual episode air dates from incomplete OK.ru titles.

Every item must also pass the existing OK TV rules: English-language identity, landscape video, at least 15 minutes, playable official OK embed, and rejection of podcasts, fan productions, parody, reactions, tutorials, clips, trailers, and audio-only material.

## Catalog and rotation behavior

Each decade manifest must expose a large candidate catalog while returning the normal rolling shelf:

- 1 program playing.
- 2 verified programs ready immediately.
- Additional candidates retained server-side and in the cached manifest.
- Five-item public shelf for guide/current-next compatibility.
- Ten-distinct-series cooldown.
- No exact episode repeat until unseen verified inventory is exhausted.
- Rotate series before selecting another episode from the same show.
- When all available series are cooled, select the least-recently watched series first.
- A constrained catalog may reuse old verified programs only after fresh programs have been placed first; it may never pad itself with off-decade or unverified content.

The guide reads current/next data from the exact manifest used for playback, so its listings cannot advertise a program the channel cannot start.

## Startup and failure behavior

- Tune requests read CDN/D1-backed manifests only; provider discovery stays in background maintenance.
- A verified last-known-good decade manifest remains available during provider or maintenance outages.
- No decade channel may fall through to browser-side discovery.
- No decade channel may borrow programs from another decade to avoid underfill.
- A failed item receives the existing temporary cooldown and is replaced from the same decade catalog.
- Existing channel 585 remains the rollback path, but the app does not silently retune a decade viewer to channel 585.

## Feature flag and rollout

The pilot is initially available only behind an `okDecades` feature flag and is excluded from ordinary surfing and guide results. Promotion occurs per channel only when that channel passes every release gate.

Promotion adds channels 600–602 to the normal Source guide category. Rollback removes the three registrations and disables the flag; it does not alter the master catalog, channel 585, or stored programs.

## Release gates

Each pilot channel must independently demonstrate:

- At least 12 distinct verified series.
- At least 60 verified playable episodes.
- Five ready items from five different series on a cold session.
- Cached manifest response under 500 ms in the production region.
- First visible frame within the existing Source Suite target.
- Fifteen consecutive Next operations without an exact episode repeat while unseen inventory exists.
- No series repeated inside the ten-series cooldown while alternatives exist.
- Zero wrong-decade, portrait, short, podcast, fan-made, parody, trailer, or audio-only items in the certification sample.
- Desktop and mobile parity.
- Guide current/next entries matching actual playback.
- Existing OK TV, OK Movies, OK animation, and OK music regressions remaining green.

If a decade misses a depth gate, it remains canary-only. It is not padded, hidden after public launch, or replaced with unrelated content.

## Testing

Automated coverage will verify:

- Parent-catalog reuse with no decade-specific discovery calls.
- Exact year-boundary classification for 1979/1980, 1989/1990, 1999/2000, and 2009/2010.
- Unknown-year exclusion from decade views while retaining master-channel eligibility.
- Five-series shelf balance and ten-series cooldown.
- Exhaustion fallback ordering.
- Independent freshness ledgers for channels 585, 600, 601, and 602.
- Correct guide records and channel registry parity on desktop/mobile.
- No behavior change for OK Movies or existing animation/music channels.

The implementation must also pass the complete local release validator and production CI before any pilot profile is promoted.

## Explicitly out of scope

- 1950s, 1960s, 1970s, 2010s, or 2020s channels.
- Movie or cartoon decade channels.
- Renumbering existing channels.
- New OK.ru credentials or provider scraping paths.
- Time-of-day programming.
- Removing or narrowing channel 585.

Those extensions require evidence from the television pilot and a separate approval.
