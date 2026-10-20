# RealSignal 5.6.16 — complete recovery history

## What ships

Includes the 5.6.15 partial-shelf freshness, saved-cache/first-tune title, asynchronous metadata, and Modern Rerun English-cache repairs described in `2026-10-19-ia-recovery-freshness-5.6.15.md`.

An extended hosted run deliberately went beyond the original 40 clean selections. At rotations 45–57 it exposed a legacy identity mismatch: `first-time-out-1995` was reported as played, but the catalog's identity also contained a concrete filename. Canonical-only exclusion did not recognize the actual reported ID. Channel 11 selected 53 unique IDs in 64 requests, with 11 repeats, despite unseen D1 candidates.

The recovery selector now checks both exact reported playback IDs and canonical file identities. It does not treat playing a parent record as a ban on its unplayed child episodes. This adds no source request or shared state mutation.

## Verification

- Legacy parent-ID regression observed failing, then passing, including an unseen-sibling control.
- Focused suite: 117/117 passed. Full workflow CI: 79/79 commands passed on this final version. Title contract and whitespace checks also passed.
- Prior 5.6.15 deploy: all four applicable workflows passed; API and public desktop/mobile stamps were verified. The relay source/config did not change, so its path-filtered deploy was not triggered.
- 5.6.16 deployment, hosted 64-selection test, controls, readiness snapshot, and browser playback remain to be recorded below. No physical mobile/Cast certification is claimed.

## Scope decisions

The one scope ruling remains the channel 11 cached/direct English-policy parity fix: a reproducible saved record bypassed its existing API contract. Cost if wrong: a valid English-labelled channel 11 cache matching the existing exclusion signals could be rejected. No other station's language rules were changed. Review findings were fixed, not deferred; the extended identity defect was then reproduced and patched with its own regression test.
