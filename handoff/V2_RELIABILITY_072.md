# .072 — focused IA buffer recovery

## Scope

This release is a reliability pass only. It does not add channels or alter the Cast interface.

## What the soak found

- **Friday Night Fights** returned a complete first queue, then shallow one-item queues on later rotations (`[5, 1, 1]`). A partial shared cache entry had replaced the complete fallback shelf.
- **Computer Chronicles** returned `[5, 3]` on a subsequent rotation when a fresh background hydration was allowed to surface before it reached the five-item target.
- **Modern Cartoons** returned `[1, 5]` and admitted a Hindi moral-story item through an overly broad cartoon search.

## What changed

- A partial queue can no longer overwrite the long-lived complete fallback shelf.
- When a shared or fresh queue is still short, the Worker serves a rotated complete last-good queue while it refills in the background.
- A fallback shelf is now keyed to the channel's complete editorial definition, so a tightened genre rule cannot reuse stale material from the older rule.
- Modern Cartoons now uses television-cartoon anchors and rejects Hindi-story, meme, VTuber, trailer, and other short-form/social filler.
- Desktop and mobile share the same Modern Cartoons rule, with a CI check guarding it.

## Measured result

After the Worker cache fix, Friday Night Fights retested at `[5, 5]` with no failed starts. Computer Chronicles retested at `[5, 5]` with no underfilled queue. On the final production pass, Modern Cartoons returned two complete five-item rotations with no failed starts, no duplicates, and a 1.421-second first-play result. The results were Cartoon Network, Nickelodeon, and Boomerang material rather than the stale Hindi-story and meme filler.

## Verification

- Desktop/mobile IA parity and contracts
- Worker cache contract
- IA measurement tests
- HTML/build-stamp validation
- Cast contract and runtime tests
- Modern Cartoons rule guard
