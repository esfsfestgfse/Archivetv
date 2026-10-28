# RealSignal 6.0.40 — Comedy Circuit language review and startup tracing

The two outstanding language records are excluded from ordinary Source Suite admission, including fresh discovery, retained catalogs and client checks:

- `SpSsy62IImo` (Bin Bole Bol): the official player exposes Hindi automatic speech captions and no alternate English audio track.
- `ggG8Jn0r7ks` (Comedian Search): held for review. An English automatic-caption label does not establish an English performance; the inspected transcript does not verify one. This is an exact-upload exclusion, not a claim that every program from its publisher is non-English.

The inspected `eynG7hGrEHs` English-audio positive control remains eligible. Publishers, countries, catalogs and viewing history are not globally banned or reset.

Desktop/mobile playback audit traces now distinguish program selection, player readiness, and a pending result with its readiness flag and error code. These traces are diagnostic and do not label SDK readiness as visible playback.

The proposed selected-video bootstrap did not fix the Chrome reproduction and was removed before release. No player transport rewrite is included. The retained YouTube transport, native handoff, EOF, autoplay and pending-history behavior remain unchanged.

## Evidence and remaining gate

New policy and trace regressions failed before the changes and passed afterward. The 94-command candidate gate passed; after removing the unsuccessful bootstrap experiment, the final runtime/client/direct-handoff/editorial commands passed all 34 tests. CI validates the final branch again through the normal workflow.

A fresh production Comedy Circuit tune started its SDK clock at 2,531ms and played actual 1280×720 video. Next started a different 67-minute performance at 809ms, also with advancing 1280×720 video. These are bounded observations, not universal cold-start or full-catalog freshness certification.

The local failing case selected a valid program but its iframe remained an empty `about:blank` document; it reported pending at 12 seconds with `ready:false`. Earlier independent-page tests had reproduced the delayed-navigation failure outside RealSignal as well. A browser-specific comparison is still required. Browser security blocks automated access to Chrome extension settings, so no settings were changed and the user was asked to confirm the OpenVideo state. Its presence is not proof of causation.

**Version 7 remains withheld.** Language admission is repaired, but the intermittent Chrome navigation/readiness failure has not been fixed or signed off. No physical phone/Cast certification is inferred from browser tests.
