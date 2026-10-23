# V6 guide contract canary

The first V6 cleanup removed the overridden renderer (`d0b9de2`, with test-fidelity
follow-up `7ae90aa`). This next slice supplies a common read-only guide snapshot
for the approved watching shell and guide redesign.

## Behavior

- Actual matching-channel playback supplies the current program; a cached server
  catalog cannot pretend to be what this viewer is watching.
- IA reads the existing reservation shelf or settled media map. Unresolved
  metadata is not counted as a ready program.
- Exact file IDs distinguish episodes within the same collection. Current and
  duplicate IDs cannot reappear in Next.
- Source Suite previews the existing freshness selector on a cursor copy; this
  does not advance playback or mark anything watched.
- Unknown duration/position remains null. Remaining time requires a valid current
  program and a matching real playhead.
- Live TV without provider EPG explicitly has unavailable program information.
  Weather, Sports, and Radio describe their service without invented episodes.
- Commands resolve the current installed playback/guide wrappers at invocation
  time. The interface owns neither discovery nor rotation.

## Canary boundary

Local `?v6=1` enables the snapshot-backed guide copy. Without the flag, the current
guide remains in charge. Cast receivers and connected Cast senders retain their
existing contract pending physical-device checks. Catalog/provider selection,
commercial placement, channel registry, and viewing history have no changes.

Public production remains **5.6.29**. Nothing in this slice deploys or stamps V6.
This is contract groundwork; the responsive watching shell and redesigned guide
are the next scoped implementation. The large picture and all essential controls
must fit the available browser width and height, including small/short windows,
before that layout is accepted.

## Verification record

The selector's initial twelve tests failed while the contract was absent and then
passed. Eight integration tests for both builds failed before the adapters existed
and then passed. Tests execute the real inline adapters with external playback
boundaries isolated; they do not certify media delivery or actual viewport fit.

Guide ownership/stability, syntax, channel registry/parity, Cast mock runtime,
and telemetry runtime checks passed. Browser testing was initially unavailable.
On 2026-10-22 it recovered; the sandbox server could not accept browser traffic,
so a normal loopback server was used at port 4190.

Before final review, all **57 distinct offline Node CI commands** passed with their
exact desktop/mobile arguments preserved. Review found four issues: eligibility
reads could prune ledgers; IA's decoded-warmer priority was not reflected; music
preview missed artist/program rules; and display normalization changed literal
file IDs. Seven regression cases reproduced these failures before the repairs.

The focused suite now has **29 passing tests**, including real selection functions
and checks that active skip/failure cooldowns still apply. Playback's normal expiry
cleanup remains active; only guide reads use the nonmutating mode. Three existing
source checks needed their exact-call matchers updated for the optional `readOnly`
argument. Their quarantine/skip requirements remain enforced, with executable
coverage in the new suite. Verification logs remain in the ignored audit workspace.

After those fixes and matcher updates, the complete **57/57** offline command gate
passed again on 2026-10-22. The original post-review failures were the desktop/mobile
IA source contract and the shared catalog-retention check; none remain failing.

Desktop browser verification on 2026-10-22 confirmed Classic Cartoons decoded and
advanced with a 720×480 picture. The guide showed the actual Upsidasium program
and advertised Birdman next; pressing Next played that same Birdman episode.
Search narrowed to one Classic Cartoons card and survived closing/reopening the
guide. Browser warnings/errors were empty for this check. This is sampled playback
evidence, not a complete catalog soak or a latency/physical-device certification.

The mobile HTML browser check also decoded and advanced Classic Cartoons at
640×480. Its guide showed Underdog currently playing and Porky's Last Stand
next; Skip played that exact Looney Tunes file. Reopening the guide retained
the Classic Cartoons search and showed the new current program plus Clutch Cargo
next. Browser warnings/errors were empty. This checks the mobile build in the
desktop browser, not physical touch, responsive viewport fit, or Chromecast.
