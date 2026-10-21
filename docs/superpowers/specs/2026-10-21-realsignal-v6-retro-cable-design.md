# RealSignal V6 — Polished Retro Cable

Status: visual direction approved; written scope awaiting review.
Baseline: 5.6.29, commit `a52be2a53455407bb3bbef5dc832005e51448620`.
This document does not authorize a production rollout or stamp the app as V6.

## 1. Purpose and boundaries

Make the existing app feel like a coherent cable service: a large picture,
immediate controls, an understandable guide, dependable rotation, and breaks
placed intentionally. Clean the backend without sacrificing working catalogs,
provider integrations, recovery, or viewing history. Depth and freshness remain
core requirements, not trade-offs for a prettier screen.

The approved direction is restrained retro cable, not a photorealistic TV that
shrinks the picture. The interactive watching/guide concept illustrates layout
and interactions using sample programs; it is not connected to live queues.

No new channels, removals, merges, renumbering, automatic hiding, time-of-day
restrictions, or custom-channel builder are part of this project. Keep Live TV,
Sports, Weather, Radio, music genres, and the existing specialty channels.
Roku and Vimeo remain paused. Do not restore previously removed data channels.
Do not add a viewer-facing rate limit. Provider protection and bounded background
concurrency must not hold normal tuning behind a bulk warmup.

## 2. Approach

Use incremental consolidation behind the working engine. A cosmetic reskin alone
would leave duplicate behavior and confusing guide ownership. A ground-up backend
replacement would put hard-won catalog depth and recovery at unnecessary risk.
Neither is the selected approach.

Retain the existing D1 catalog, session rotation, freshness ledger, source adapters,
and rolling `1 playing + 2 ready + background candidates` model. Consolidate their
client interfaces and ownership before attaching the new presentation. Do not
reintroduce a synchronous five-video startup requirement.

## 3. Watching experience

- Let video dominate the window. Preserve its aspect ratio; never stretch or crop
  a program by default. Large 4:3 programs retain intentional side bars.
- Use charcoal surfaces, green tuner digits, restrained amber accents, and legible
  modern typography. Channel number, local time, and date belong in a compact dock.
- Provide clearly labeled Power, Channel, Guide, Next, Info, Menu, volume, and mute
  controls. The dock can fade during playback and returns on interaction or focus.
- Fade the program overlay after a short interval. Info recalls it. No permanent
  channel-description overlay over the picture.
- Keep picture options small: clean picture plus optional light/broadcast scanlines.
  Effects do not obscure captions, controls, or guide text; honor reduced motion.
- Adapt layout deliberately for desktop, touch/mobile, and TV/Cast. A cast sender
  becomes a remote rather than playing a second local copy. Preserve working Cast
  handoff and receiver playback; do not rebuild discovery in this UI project.

## 4. Guide: honest programming, not invented schedules

The guide shares the player's canonical channel identities and verified queue
snapshot. It does not independently discover or hydrate programs. Opening,
searching, closing, or changing a category cannot restart playback or fetch a
whole new catalog before responding.

On desktop, show a compact category rail, searchable current/next list, and one
selected-program detail area. On mobile, stack those same functions with readable
rows and touch targets. TV uses visible directional focus and Back-to-close.
Keep search, genres, favorites, recent channels, duration, source, and a clear
Watch action. Retain scroll position, selection, and focus when reopening.

For IA, OK, and Source Suite, label viewer-specific entries as Playing/Next rather
than fabricating broadcast clock slots. The current program comes from the actual
player; next comes from the playable shelf. Show runtime when known and remaining
time only when a reliable playhead exists. Unknown is not zero.

FAST uses genuine provider EPG when available, otherwise explicitly says program
information is unavailable. Radio uses station/track information when supplied;
Weather and Sports describe the actual live service rather than fake episodes.
Slow or unavailable guide enrichment must never block browsing or tuning.

## 5. Backend cleanup and ownership

First map references and runtime ownership. Large embedded catalogs are not dead
code merely because they make HTML files large. Preserve audit artifacts and user
data; remove code only when references and tests establish it is unused or replaced.

Assign one owner to each responsibility:

| Owner | Contract |
| --- | --- |
| Channel registry | Stable identity, category, order, aliases, and provider profile |
| Catalog adapters | Provider-specific discovery and normalized program/file records |
| Playback coordinator | Tune, Next, cancellation, recovery, and current program state |
| Rotation service | Durable watched history, balanced selection, and exhaustion policy |
| Guide selector | Read current/next snapshots without changing rotation |
| Commercial scheduler | Break eligibility, ad rotation, and clean program resume |
| Presentation adapters | Desktop, mobile, and Cast controls over the same commands |
| Telemetry | Correlated events without becoming a playback dependency |

Extract shared behavior from desktop/mobile in small compatibility-preserving
slices. Remove duplicated helpers, obsolete overrides, and conflicting timers only
after the replacement owns that behavior and passes regression. Separate static
catalog data from executable logic where it improves loading and maintenance.
Do not add storage services or schema migrations merely to reorganize files.

Retain exact Archive file identity, complete-series expansion, genre qualification,
temporary failure cooldowns, and watched history. A failed file must not silently
play a sibling under the wrong title. Preserve short-cartoon exceptions; no blanket
15-minute minimum across channels. Keep portraits, podcasts, fan/parody productions,
and off-genre contamination excluded under the existing channel rules.

## 6. Commercials

Default to a brief break between complete programs, not arbitrary mid-scene cuts.
For short cartoons, accumulate a proposed 20–30-minute block before a break; this
range is a scheduling default to validate, not permission to insert ads mid-cartoon.
Movies break between films. Mid-film intermissions require explicit approved markers
and remain off by default. Drive-In and holiday lanes can use matching bumpers.

TV channels admit video ads only; radio admits audio ads. Keep a separate ad-history
ledger, era/channel matching, and frequency limits so one era or spot cannot dominate.
Do not stack our commercials over FAST/provider-native advertising.

Prepare the break and next program in the background. If an ad cannot start, skip
the break and continue programming. Next/channel-change remain responsive during
ads. Changing channel cancels the old break and pending callbacks. No commercial
may become a new tuning or reconnecting loop.

## 7. Evidence and release gates

Compare each slice with the same 5.6.29 baseline conditions and channel sample.
Measure p50/p95 first decoded frame, warm tune/Next, guide open/close, startup work,
ready depth, repeat window, stalls, recovery, and source errors. Metadata readiness
and HTTP range responses are not decoded playback evidence. Provider-limited starts
must remain visible in reporting, not be excluded to improve the numbers.

Proposed local-interaction targets: guide open/close within 150 ms at p95, immediate
command acknowledgement, and no catalog work on the guide critical path. Media
targets: warm first visible frame within two seconds at p95 on the documented test
devices and no regression in cold-start behavior. These are release criteria to
measure, not promises of instantaneous upstream delivery on every network.

Require no reproducible new dead signals, wrong-file titles, audio-only starts,
duplicate playback, broken skips, early repeats, or lost history in changed paths.
Test adjacent lanes as well as the ones edited. Use narrow automated checks and
browser playback after small changes, then full cross-family regression for a release
candidate. Do not rerun an expensive full soak for every cosmetic edit.

Keep the current production route available during canary testing. Use additive
interfaces and a build/feature boundary; rollback restores the previous code without
deleting catalogs or watch history. Desktop/mobile browser checks cannot certify
physical Cast; verify an actual receiver before declaring new Cast behavior passed.
Stamp V6 only after the combined gates and user review, not when the mockup lands.

## 8. Delivery sequence and approval

This is an umbrella design, not one enormous implementation task. Deliver these
bounded subprojects in order, each with its own scoped plan and evidence:

1. Freeze the baseline and document behavior ownership; remove only proven dead code.
2. Extract shared playback/guide contracts without changing provider selection.
3. Build the watching shell and guide against those contracts, behind a canary flag.
4. Connect responsive mobile/Cast presentation and verify command/state parity.
5. Introduce the fail-open commercial scheduler and independent ad rotation.
6. Run the full release candidate regression, canary, rollback check, and V6 review.

The immediate next deliverable after approval is a written plan for subproject 1,
not a live UI replacement. Review this document before implementation planning.
Production remains 5.6.29 throughout this design stage.
