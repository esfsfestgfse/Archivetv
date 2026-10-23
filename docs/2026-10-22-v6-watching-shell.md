# V6 watching shell — 5.6.31 preview

## What changes

Opt in with `v6=1` in desktop or mobile HTML. The existing player fills the space
above a compact charcoal/green tuner dock. Controls are actual labeled buttons:
Power, Channel −/+, Guide, Next, Info, Menu, Volume −/+, Mute, and Cast. Channel,
local date/time, current title and playback state come from the shared read-only
snapshot. Picture aspect ratio is retained; 4:3 video has intentional side bars.

No catalog, channel numbering, rotation history, commercial scheduler, provider,
backend storage, or Cast protocol changes. Refresh and resize do not recreate
media. Normal URLs keep the original UI. Connected Cast senders and receivers
remain on their existing presentation. This is not the final V6 release or the
guide redesign; the latter is the next scoped project.

## Evidence, 2026-10-22

- Eight presentation/command tests failed before the shell existed, then passed.
  They execute the actual shell/adapter with a small DOM and timer boundary double.
  They cover guard exit/re-entry, real text rendering, command validation, latest
  wrappers, one action per click, media identity, idle/focus, and guide focus return.
- Existing shared guide suite: 29/29. Exact offline CI command gate: 58/58.
  These are not 58 physical-device/media tests. HTML syntax passed in both builds.
- Desktop 1440×900: page dimensions exactly 1440×900; all 11 control buttons inside
  viewport. Classic Cartoons decoded at 658×480 and advanced. Guide advertised
  The Purloined Pup; Next played that same Pluto file, decoded at 720×540.
- Desktop 1024×600: page exactly 1024×600; 1000×450 watching stage; every control
  within viewport with 44px height. Resizing retained playback.
- Mobile HTML 390×844: page exactly 390×844; 378×650 watching stage; all controls
  inside viewport, at least 44px high. Actual moving 720×540 video. Guide advertised
  Birdman S01E03; Next played that exact 720×480 episode with an advancing playhead.
- Mobile landscape 844×390: page exactly 844×390; 834×268 watching stage; controls
  all within viewport and at least 44px high. Playback continued through resize.
- Mobile ordered Channel +/− changed 150 → 151 → 150. Menu and Info opened; volume
  down produced a 60% OSD bar, Mute produced 0% and the pressed state. Desktop
  Picture controls still exposed brightness, contrast, color, tint and CRT effects.
- A real-browser mobile regression found the legacy remote tab still visible.
  Its computed-style assertion failed before the scoped mTab/mPanel hide rule and
  passed afterward. Flag-off browser check confirmed no new dock/root class and
  the original mobile remote still displayed normally.

The first attached browser reported a zero-sized viewport. A fresh preview tab
provided actual sizes; zero-sized observations were not accepted as fit evidence.
Screenshots remain in local `output/v6-watch/`, not the public application assets.

## Limits and rollout

No physical phone or Chromecast certification, full 179-channel media soak, p95
latency measurement, embedded-provider volume guarantee, or final V6 gate is
claimed. Only local browser playback and the stated automated checks are covered.
Preview remains opt-in. Rollback removes the canary URL flag without resetting
catalogs/history; code rollback remains a normal revert of the preview commits.

The user explicitly authorized push after reviewing the implementation plan.
Independent review found no Critical or Minor issues and two Important findings:
the duplicate legacy mobile remote, already corrected in the browser check above,
and Enter being intercepted by the existing channel-entry shortcut. Two tests
executing the real HTML keyboard handlers failed before the scoped propagation
guard and passed afterward. Native button activation is retained. The final
presentation suite is **10/10**, shared guide **29/29**, and the post-fix complete
offline gate again **58/58**.

Actual desktop and mobile browser Enter now operates Power and Guide; Escape
closes the guide and restores focus. Browser warning/error logs were empty in
these checks. Temporary viewport overrides were reset. Physical/device-specific
Cast, browser chrome/safe areas/enlarged text, inherited fullscreen, future guide,
commercial and catalog work were not silently certified by the review. No review
findings remain deferred. Hosted Actions/Pages status must be checked separately
after push; local offline checks do not establish a successful deployment.

## Recorded decisions

- Publish only the opt-in preview under the user's latest push authorization;
  cost if mistaken: preview files are public, while default presentation stays old.
- Use 5.6.30 rather than final 6.0; cost: one maintenance version before V6 release.
- Preserve ignored audit evidence under the umbrella spec; cost: local disk space.
- Keep actual-device certification and remaining V6 features as separate gates;
  cost: device-specific issues may still surface during preview testing.

## Hosted numeric-entry follow-up

The first hosted check's standby state was traced to a real keyboard conflict,
not provider availability: Power retained focus, so Enter after typing a channel
number activated Power a second time. Two real-handler regression tests failed
with an unwanted `togglePower` call. Numeric entry now releases dock-button focus
and continues to the existing channel-entry owner; native Enter on a deliberately
focused button still works. The focused shell suite is now 12/12. This follow-up
increments the visible stamp and cache keys to 5.6.31 rather than silently changing
5.6.30. No provider or queue behavior changes.

The exact Power → 150 → Enter sequence now preserves powered-on channel 150 in
both real browser builds, with dock focus released. The final 5.6.31 offline gate
passed 58/58 again. The initial 5.6.30 GitHub worker/desktop/mobile CI and both Pages
deployments succeeded; the follow-up has its own normal push/deployment gate.
