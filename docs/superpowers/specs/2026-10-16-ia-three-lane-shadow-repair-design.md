# IA Three-Lane Shadow Repair Design

## Purpose

Repair the regression introduced while piloting a stricter server-side catalog
model for the three affected Internet Archive stations:

- Classic TV
- Classic Cartoons
- Game Shows

The replacement must improve catalog depth, variety, freshness, and startup
reliability without exposing an incomplete catalog to viewers.

## Non-Negotiable Rules

- Existing public playback remains the active path during the repair.
- A viewer never waits for Archive discovery or collection expansion.
- No portrait, short-form, podcast, trailer, fan film, parody, reaction, or
  off-genre media enters a verified shelf.
- A single series or Archive collection cannot dominate a station.
- No station moves to the new catalog path until it passes its promotion gate.
- Failure means retain the public fallback; it does not mean fill the shelf
  with weak material.

## Architecture

Each station has two independent paths:

1. **Public fallback path**: current production playback, retained unchanged.
2. **Shadow catalog path**: a server-side catalog built and measured without
   being served to normal viewers.

The shadow path builds a station manifest from Archive search results,
collection membership, and individual playable files. It normalizes each
candidate into a canonical record containing title, series, episode,
collection, year, runtime, orientation, media URL, and genre score.

The resulting catalog feeds a simulated rolling shelf:

- one selected program;
- two independently playable ready programs;
- background candidates for asynchronous replacement.

The manifest is compared to the public path but cannot take over automatically.

## Station Profiles

### Classic TV

- Era: early television through the 1980s.
- Programming: scripted television, sitcom, drama, mystery, variety, western,
  and family programming.
- Balance by decade, series, collection, and creator.
- Reject non-television lectures, isolated clips, podcasts, and modern material
  that does not belong in the lane.

### Classic Cartoons

- Programming: actual landscape cartoon episodes, serials, and verified
  compilation blocks that behave as television.
- Include broad historic animation variety without drifting into animation
  criticism, art films, or unrelated short experiments.
- Balance character, series, studio, collection, and era.

### Game Shows

- Programming: actual game-show episodes and long-form broadcast blocks from
  all available eras.
- Balance format, host, title, decade, and collection.
- Reject game-show commentary, highlight clips, contestant interviews, and
  unrelated quiz content.

## Depth and Freshness Rules

- Expand complete-series and collection records to file-level episode records.
- Prefer unseen programs using persistent channel history.
- Exclude the most recently watched IDs before making a new shelf.
- Add a per-series and per-collection cap to every five-item shelf.
- Select a different series for the opening item whenever the catalog permits.
- Permit a repeat only after the eligible unseen inventory is exhausted.
- Keep last-known-good media only as a fallback, never as the default opening.

## Promotion Gate

Each station can be promoted only when the shadow path proves all of the
following across multiple rotations:

- Five ready playable items.
- Catalog depth sufficient for its identity, with no single series or
  collection flooding the shelf.
- At least three distinct series in a five-item shelf when inventory permits.
- No forbidden formats or known off-genre material.
- No early repeats during a defined multi-skip rotation test.
- First visible-frame and catalog response behavior at least as good as the
  public fallback.
- Current/next guide records match the selected verified items.

## Deliverables

1. Baseline report: current public behavior and catalog profile for all three
   stations.
2. Shadow manifests: deep file-level candidate catalogs for each station.
3. Comparison report: public fallback versus shadow catalog on depth, series
   diversity, latency, rotation, and filtering.
4. Targeted code change behind a per-station feature flag.
5. Canary report and a public release only after all gates pass.

## Rollback

Each station retains its existing playback path. Disabling the station feature
flag returns it immediately to the current public fallback without deleting
catalog or freshness data. No broad rollback is required.

## Scope Boundary

This project repairs only Classic TV, Classic Cartoons, and Game Shows. The
same proven design will later be applied to remaining IA families and then to
the hidden OK TV 1950s, 1960s, and 2020s decade lanes.
