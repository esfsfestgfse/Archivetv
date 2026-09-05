# .070 — rotation and asynchronous fallback recovery

## Confirmed fixes

- IA rotation advancement previously saturated at 127. It now wraps through
  the supported 0–127 range, persists the new position and leaves other channels alone.
  This removes a permanent stuck-rotation condition, not all possible duplicate content.
- Corrected .069: the local fallback is asynchronous, so recovery flags must be applied
  to its awaited array rather than its Promise. The previous test's synchronous stub
  missed this. The replacement test runs the actual local-search function, request
  handler and refill function together, with asynchronous search responses.
- Existing genre filters, temporary repeat exclusions and five-item buffers are unchanged.

## Production queue observations (September 4, 2026)

The Beeb (121) and Modern Cartoons (153) each returned five ready items in both
tested rotations using rotation base 79. Neither repeated an identifier across its
two rotations. Their first successful queue response latencies were 436 and 578 ms
(507 ms average). Source headers were program-director/program-director-background.

These were new requested rotation offsets, not proven uncached responses. They do not
establish first-frame latency, continuous playback, or genre accuracy for every item.
The earlier Beeb stall did not reproduce in this sample; no speculative provider or
genre broadening was applied. No Worker deployment was needed.

## Remaining

- Measure actual media-start latency and validate sustained physical Cast playback.
- Follow the nightly audit for recurring cold-queue failures and repeats.
- Review editorial outliers separately from playback failures; metadata matches alone
  cannot certify every title's genre, era or availability.
