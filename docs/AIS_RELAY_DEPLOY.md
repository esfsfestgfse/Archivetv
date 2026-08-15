# AIS Relay Worker — deploy in 5 minutes

The Ship Tracker channel (num 965) needs a Cloudflare Worker to proxy
`aisstream.io` because they explicitly block direct browser connections.
This worker is stateless, one file, ~120 lines. Deploy once, never think
about it again.

## Prerequisites
- A Cloudflare account (free tier is fine)
- Your **aisstream.io API key** (already have one — it's in prior notes)

## Steps (Cloudflare dashboard — no CLI needed)

1. **Open** [dash.cloudflare.com](https://dash.cloudflare.com) → sign in.
2. **Left sidebar** → **Workers & Pages** → **Create application**
   → **Create Worker** button (blue).
3. **Name it** `ais-relay` (or anything — this becomes the subdomain).
4. On the next screen, **Edit code** (top-right button).
5. **Delete** the entire "Hello World" starter code, then paste the
   contents of `afterglow_ais_relay_worker.js` from the repo root.
6. **Deploy** (top-right blue button).
7. Copy the deployed URL — it will look like
   `https://ais-relay.<your-account>.workers.dev`.

## Set the API key

8. Back at the Worker's overview, **Settings** tab → **Variables and Secrets**
   → **Add variable**.
9. **Type**: Secret (not plaintext).
10. **Name**: `AIS_API_KEY`
11. **Value**: paste your aisstream.io API key.
12. **Save**.

The Worker will now inject the key into every subscription message
so the browser never sees it.

## Test it

13. Open a browser to your Worker URL. You should see:
    ```
    afterglow-ais-relay · WebSocket-only endpoint
    Open `wss://<this-domain>/` from the Afterglow client to use it.
    ```
    That means it's alive.

## Tell Afterglow to use it

14. Send me the Worker URL and I'll wire it into `tuneShips` in one commit.

## What the Worker does

- Accepts a WebSocket connection from the browser
- Opens its own WebSocket to `wss://stream.aisstream.io/v0/stream`
- On the first browser message (which should be the subscription JSON),
  injects `AIS_API_KEY` and forwards to aisstream
- Bidirectionally relays every subsequent message
- Closes the paired connection when either side drops

## Cost

Free tier: 100,000 requests/day. A Ship Tracker session opens one long-lived
WebSocket, so each browser tune = ~1 request. You will not come close to the
limit.
