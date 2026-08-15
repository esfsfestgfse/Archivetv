# Ship Tracker Relay Worker — deploy in 5 minutes

The Ship Tracker channel (num 965) uses a Cloudflare Worker so provider keys
stay out of the public web app. It has two independent data paths:

- **AISStream WebSocket** for low-latency updates when that service is healthy.
- **Kpler AIS snapshots** every minute when the stream is unavailable.

The browser automatically uses either path. The Worker is one file; deploy it
once and update its secrets as providers change.

## Prerequisites
- A Cloudflare account (free tier is fine)
- An aisstream.io API key (optional: keeps the live WebSocket fast path)
- A Kpler AIS API key (recommended: provides the reliable snapshot fallback)

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

## Set provider secrets

8. Back at the Worker's overview, **Settings** tab → **Variables and Secrets**
   → **Add variable**.
9. **Type**: Secret (not plaintext).
10. Add `AIS_API_KEY` and paste the aisstream.io API key (optional).
11. Add `KPLER_API_KEY` and paste the Kpler API key exactly as provided for
    the documented `Authorization: Basic <API_KEY>` header (recommended).
12. Save and redeploy the Worker after changing a secret.

The Worker injects the AISStream key into WebSocket subscriptions and sends
Kpler credentials only from its server-side snapshot request. The browser
never sees either secret.

## Repeat deployments

The repository now includes `wrangler.jsonc`, so subsequent source updates can
be deployed without re-creating the Worker. After authenticating Wrangler or
the Cloudflare MCP integration, deploy from the repository root with:

```powershell
pnpm dlx wrangler@latest deploy --keep-vars
```

`--keep-vars` preserves the provider variables already configured in the
dashboard. Do not place provider keys in this repository or in `wrangler.jsonc`.

## Test it

13. Open `<worker-url>/` in a browser. It returns a small health JSON object.
    Confirm it reports `"snapshot": true` after the Kpler secret is saved.
14. Open `<worker-url>/snapshot`. It should return JSON with
    `"source":"kpler"` and a GeoJSON `features` list. The result is cached
    for one minute to protect the provider quota during normal app use.

## Tell Afterglow to use it

15. The deployed Afterglow build already targets `/snapshot` on the configured
    relay URL. No browser-side credential is required.

## What the Worker does

- Accepts a WebSocket connection and relays AISStream when configured
- Fetches a fixed Gulf-of-Mexico Kpler snapshot at `/snapshot`
- Caches snapshots for one minute, including through transient provider blips
- Restricts the paid upstream query to the single region used by Ship Tracker
- Never sends a provider key to the browser

## Cost

Free tier: 100,000 requests/day. A Ship Tracker session opens one long-lived
WebSocket, while snapshot clients share a one-minute cached response. Review
your Kpler contract for its data-request allowance.
