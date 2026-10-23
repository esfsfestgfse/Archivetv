# RealSignal 5.6.32 — V6 guide preview

## Delivery boundary

The new guide is opt-in with `v6=1`, on desktop and mobile. This is not a
6.0 release or a default-UI rollout. Normal and connected-Cast users retain
their existing guide. No lineup, channel number, catalog, source adapter,
freshness history or provider configuration was replaced.

Preview links after Pages publishes this build:

- `https://esfsfestgfse.github.io/Archivetv/the_dial_desktop.html?v6=1&build=5.6.32`
- `https://esfsfestgfse.github.io/Archivetv/the_dial_mobile.html?v6=1&build=5.6.32`

## Guide changes

- Category rail on desktop, compact category selector on mobile.
- Search channels, genres, descriptions, and known current/next program titles.
- All, Favorites and Recent views reuse the existing registry and local history.
- Selecting a row previews its program; the labeled Watch button tunes it.
- Real Playing/Next data, known runtime/provider, and reliable remaining time.
  Unknown data stays pending/unavailable, without made-up broadcast slots.
- One selected-channel detail panel, with independently scrolling text and an
  always-visible Watch control at the checked window sizes.
- Arrow navigation, isolated search typing, Escape/Back-to-close, bounded Tab
  navigation, opener-focus restoration, and retained dialog focus/scroll.
- Read-only visible-row refresh once per second while open. Closed guide has
  no refresh timer. Unchanged reopening reuses its row nodes. No discovery,
  hydration or bulk warmup is triggered by guide browsing.
- Existing local health telemetry receives guide-open/close measurements;
  telemetry failure cannot prevent opening or closing.

The private dialog ID is `rsV6GuidePanel`; `rsV6Guide` remains the working dock
button. This avoids duplicate IDs and preserves existing control bindings.

## IA short-file repair

The user identified documentary/archive channels, without a specific title.
Reproduction found that the browser resolver discarded selected-file length
and geometry while retaining collection-level runtime. Cached playback also
missed stricter slot minimums; final decoded duration was not checked.

The resolver now retains the actual selected-child facts, including explicit
unknown runtime rather than borrowing the collection length. Cached admission
applies the existing slot minimum. Known invalid IA video is rejected before
player allocation or Cast publication; decoded duration/geometry is checked
again before a visible commit. This does not add a new blanket runtime rule.
Original short-cartoon exceptions, ads, audio, and non-IA live video remain intact.

Tests explicitly cover rejection of a two-minute regular program on channels
10, 204, 226 and 243, plus parent-duration masking and already-warmed media.
The change applies to existing IA playback, not only the guide preview.

Independent review caught a cleanup race where a superseded startup timeout
could pause a newer tune reusing the same decoder. A real-allocator regression
test reproduced it in both builds; cleanup now pauses only the current token.
Two focus-retention issues and a Cast-disconnect guide-owner overlap were also
reproduced and fixed before release.

## Verification

- Final focused gate: 82 tests passing across guide contract, full guide,
  watching shell, and IA runtime admission.
- Final complete offline CI command set: 60 commands, zero failures, retaining
  both HTML arguments. `output/v6-guide/ci-final.txt` holds local raw evidence.
- Earlier sandbox-only checkpoint rename denial was rerun outside the sandbox;
  the existing checkpoint suite passed 8/8. No unrelated test was weakened.
- HTML syntax/stamp checks and desktop/mobile registry/parity checks passed.
- One independent scoped review; substantive findings fixed RED→GREEN.

Actual browser layout checks:

| Entry point | Viewport | Page overflow | Watch control |
| --- | --- | --- | --- |
| Desktop | 1440×900 | None observed | Inside dialog |
| Desktop | 1024×600 | None observed | Bottom 569px, inside 600px viewport |
| Mobile | 390×844 | None observed | Bottom 825px, inside 844px viewport |
| Mobile | 844×390 | None observed | Bottom 369px, inside 390px viewport |

Local screenshots: `output/v6-guide/desktop.jpg`, `desktop-short.jpg`,
`mobile.jpg`, `mobile-landscape.jpg`. These are QA artifacts, not public assets.

Channel 226 visibly decoded multiple full documentaries (approximately 55,
58 and 108 minutes) at 638/640×480; time advanced with the guide open and closed.
An uncovered Next handoff recorded a compositor-visible frame at 921ms,
no repeat and no stall in that sample. A prior start recorded 1308ms; its
guide interactions make it unsuitable as a controlled cold-start comparison.
These are samples, not certification of every channel or device.

Real browser actions covered category/search, selecting a channel, Watch,
Next, favorites add/remove, Recent and Escape. Favorites were restored after QA.
Unit/integration coverage also exercises rapid tune cancellation, numeric-entry
isolation, stale callbacks, default/Cast guards, and dialog focus ownership.

## Limits and next gate

Synchronous guide-open measurements varied from about 81ms to 412ms across
initial/warm/layout-changing samples. The proposed final-V6 p95 <150ms target
is **not certified**. Close samples were about 4–29ms. These measure handler/DOM
work, not a cross-device paint percentile or an upstream playback guarantee.

Enlarged-text/browser-chrome testing and physical mobile/Cast verification remain
open. Some existing upstream episode titles are excessively long/recursive;
this guide displays supplied metadata without inventing a correction. This pass
does not certify every provider or repair the entire editorial catalog.

Keep the canary boundary while measuring cold guide work, large-text behavior
and real-device navigation. Do not stamp V6 on the strength of these samples.

## Implementation decisions

1. Use the non-conflicting dialog ID rather than duplicate the dock button ID.
   Cost if wrong: private new presenter/test selectors, not existing remotes.
2. Treat focus retention as a functional requirement, not deferred polish.
   Cost if wrong: a small focus-state variable and regression-test maintenance.
3. Publish only an opt-in 5.6.32 preview while final timing/device gates remain
   open. Cost: default users keep the prior guide until those gates pass.
