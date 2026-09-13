# RealSignal server-side Source Suite catalog

This slice moves Source Suite provider discovery behind the Version 2 API
boundary while preserving the current browser adapters as a safe canary
fallback.

## Request path

`Desktop / Mobile / Cast client` → `realsignal-api /api/v2/source/catalog` →
`YouTube + PeerTube adapters` → `Queue` → `D1 catalog`

The client submits only the built-in profile descriptor: stable profile key,
queries, positive topic terms, deny terms, approved providers, and rotation
number. The Worker owns the expensive provider calls and returns the first
verified lane as soon as it has an eligible item. The remaining provider work
continues through `ctx.waitUntil()` and is written asynchronously to the
`realsignal-catalog-refresh` Queue. When the next request arrives, D1 is the
fast durable manifest instead of a fresh provider search.

## Qualification contract

- YouTube and PeerTube are the only Source Suite providers.
- Every item must be at least 15 minutes, landscape, and have a usable media
  URL or an embeddable YouTube URL.
- Shorts, vertical videos, tutorials/how-to, trailers, promos, ads, reactions,
  fan edits, lyrics videos, and explicit channel deny terms are rejected.
- YouTube language metadata and title/account signals must not indicate a
  non-English upload.
- PeerTube items must carry an open/public rights label and a direct video
  rendition; an unverifiable embed is not promoted.
- D1 records keep provider, source URL, rights, runtime, aspect ratio, and
  qualification metadata so the guide and playback use the same truth.

## Failure behavior

1. A D1 manifest with at least two items is returned immediately.
2. A cold request returns the first eligible provider lane while the full
   catalog is hydrated in the background.
3. If the API has no eligible item or is unavailable, the existing client
   adapters remain active for canary fallback.
4. A failed provider never invalidates a previously verified D1 catalog.

The API endpoint is intentionally bounded: profile arrays are capped, source
requests time out, provider fan-out is limited, and the persisted catalog is
limited to 48 normalized items per response. This keeps channel changes out of
the browser’s discovery critical path without making a synchronous five-item
warmup.

## Deployment note

The server adapter reads `YOUTUBE_API_KEY` only from the Worker secret store.
If that secret is not present, the endpoint reports YouTube unavailable and the
browser’s existing YouTube adapter remains the fallback. No key is embedded in
the new Worker module.
