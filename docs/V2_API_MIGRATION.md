# RealSignal Version 2 API migration

## Current slice

`realsignal_api_worker.js` is the first stable API boundary for Version 2. It
exposes a versioned contract without changing the live browser clients:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/v1/health` | GET | API health and capability probe |
| `/api/v1/ia/search` | GET | IA discovery search |
| `/api/v1/ia/metadata/:id` | GET | IA metadata and file resolution |
| `/api/v1/ia/queue` | POST | Verified IA shelf construction |
| `/api/v1/ia/program` | POST | Program-director queue construction |

The API Worker calls `ais-relay` through the `RELAY` Service Binding. It does
not call the public relay URL, and it does not yet own catalog state. The
existing relay remains the source of truth during this migration slice.

## Safe cutover order

1. Deploy `ais-relay` and `realsignal-api` in the same Cloudflare account.
2. Probe `/api/v1/health` and verify the Service Binding in a staging client.
3. Move IA search/metadata callers to the versioned API first.
4. Move queue callers behind a feature flag, keeping the current relay as a
   bounded fallback during the canary.
5. Add D1 catalog tables and background ingestion before moving discovery out
   of the relay.
6. Add Durable Object channel rotation and Queues/Workflows for background
   hydration and health checks.
7. Remove the compatibility fallback only after a full desktop/mobile/Cast
   soak passes.

## Next backend slice

Add a D1 schema for normalized programs, source records, collection members,
channel rules, and health observations. The API contract should remain stable
while the relay-backed implementation is replaced by D1-backed reads. No
client should need to know whether a result came from the old relay, D1, or a
future source adapter.
