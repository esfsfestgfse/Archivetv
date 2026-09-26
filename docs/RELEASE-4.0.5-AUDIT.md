# RealSignal 4.0.5 audit and cleanup

Date: 2026-09-25 (America/Chicago)

## Outcome

The cleanup pass is stable in the local contract suite and in the deployed
Worker certification. The public channel registry remains at 272 channels,
with desktop/mobile parity intact. The dormant decade-only profiles were
removed from the public runtime and from the canonical station module; the
retirement test remains as a guard against their return.

## Inventory and duplicate check

- Public registry: 272 channels, 13 categories.
- Desktop/mobile registry parity: passed.
- IA parity for genre, program, and editorial overlays: passed.
- Public duplicate IDs or duplicate registry entries: none found.
- IA certification manifest: 171 IA lanes.
- Live/data lanes represented by the static audit: 102.

## IA certification

The final deployed-Worker run covered all 171 IA lanes using checkpointed
batches and the rolling queue contract.

- First-play ready: 171/171.
- Full five-item depth: 171/171.
- Empty/no-signal lanes: 0.
- Queue or transport timeouts: 0.
- Duplicate items in observed rotations: 0.
- Unique observed coverage: 100% per batch.
- First-play latency: 292 ms minimum, 15,835 ms maximum, 1,614 ms average.

Channel 54 had timed out in the earlier concurrent audit, but passed the
serial targeted retry with full depth and no repeats. It also passed the final
certification run, so no channel-specific patch was added for that transient.

## Source Suite audit

The deployed audit covered all 62 approved YouTube/PeerTube profiles.

- Provider/API failures: 0.
- Empty catalogs: 0.
- Exhausted catalogs: 0.
- Duplicate rows: 0.
- Runtime violations below the 15-minute floor: 0.
- Average catalog depth: 10.8.
- Deep profiles (12+ items): 29.
- Profiles under five ready items: 11.

The remaining under-five profiles are recorded as long-tail quality findings,
not hidden as if they were healthy. They are:

`garden-ledger`, `jukebox-television`, `lesson-reel`, `local-signal`,
`memory-bank`, `print-shop`, `screen-test`, `sound-lab`, `stage-door`,
`variety-hour`, and `western-screen`.

They return playable, duplicate-free, 15-minute-compliant items, but need a
separate catalog-depth pass before they can be called deep. The cleanup keeps
their strict filters instead of admitting unrelated short or off-topic media.

## Code cleanup

- Removed the retired decade-only TV and movie query profiles and program
  overlays from desktop and mobile.
- Removed the unused canonical `eraStation` helper and hybrid decade blueprint
  array.
- Converted the former hybrid-lineup test into a retirement guard.
- Added an explicit long-form relaxation flag for only the full-performance
  and full-film Source Suite profiles that need it; the 15-minute, landscape,
  deny-term, topic, and program gates remain active.
- Broadened only the profiles proven shallow by the production audit; no global
  filter relaxation was made.
- Archived old root-level audit reports under
  `audit-archive/2026-09-25/` without deleting them. Cache folders and legacy
  probe scripts remain untouched and are ignored rather than removed.

## Regression gates

Passed: channel registry, IA parity and contract, Source Suite contract,
Worker/V2/V3 contracts, Cast contract/runtime, FAST recovery, guide row
stability, live-data lifecycle, modern-cartoon lock, IA retirement guard, and
desktop/mobile HTML syntax/build stamps.

Worker release: `4.0.5-audit-cleanup`

The release is eligible to ship as the cleanup build. The next focused task is
not another broad rebuild: deepen the 11 Source Suite long-tail profiles and
measure the separate live-data, desktop, mobile, and Cast telemetry lanes.
