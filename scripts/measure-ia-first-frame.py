#!/usr/bin/env python3
"""Measure decoded first-frame time for a small IA pilot sample.

This is deliberately a canary, not a release gate by itself: it loads direct
provider media URLs in a muted video element and records loadeddata/error. It
does not change the app or the generated manifests.
"""
import argparse
import json
import os
import re
import time
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright


def load_manifest(path):
    source = Path(path).read_text(encoding="utf-8")
    start = source.index("Object.freeze(") + len("Object.freeze(")
    end = source.rfind(");")
    return json.loads(source[start:end])


def api_queue(api, channel, rotation, profile=None):
    relay = "ais-relay" in api or api.rstrip("/").endswith("/ia")
    body = {"channel": int(channel), "count": 5, "rotation": rotation, "recentIds": []}
    if relay and profile:
        rules = profile.get("rules") or profile
        # The live relay accepts thematic search phrases, not the Archive
        # advanced-search decade expressions used by the offline builder.
        relay_queries = [
            query for query in rules.get("searchQueries", [])
            if not str(query).lstrip().lower().startswith("year:")
        ][:3]
        body.update({
            "queries": relay_queries,
            "themeTerms": rules.get("includeAny", [])[:12],
            "denyTerms": rules.get("excludeAny", [])[:16],
            "requiredTitleTerms": [],
            "mediaTypes": ["movies"],
            "themeMinScore": 1,
        })
    endpoint = f"{api.rstrip('/')}/queue" if relay else f"{api.rstrip('/')}/ia/queue"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode())
    except Exception as exc:
        return {"error": str(exc)}


async def measure(page, url, timeout_ms):
    started = time.perf_counter()
    await page.set_content("<video id='v' muted playsinline preload='auto'></video>")
    await page.evaluate(
        """(url) => {
          const video = document.getElementById('v');
          window.__rsFrame = null;
          const finish = (status) => {
            if (window.__rsFrame) return;
            window.__rsFrame = { status, ms: Math.round(performance.now()) };
          };
          video.addEventListener('loadeddata', () => finish('loadeddata'), { once: true });
          video.addEventListener('error', () => finish('error'), { once: true });
          video.src = url;
          video.load();
          video.play().catch(() => {});
        }""",
        url,
    )
    try:
        await page.wait_for_function("window.__rsFrame !== null", timeout=timeout_ms)
        result = await page.evaluate("window.__rsFrame")
    except Exception as exc:
        result = {"status": "timeout", "error": str(exc)}
    result["wallMs"] = round((time.perf_counter() - started) * 1000)
    result["url"] = url
    return result


async def main(args):
    manifests = load_manifest(args.manifest)
    report = {"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "samplesPerLane": args.samples, "lanes": {}}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, executable_path=os.environ.get("RS_CHROMIUM_PATH") or None)
        page = await browser.new_page()
        try:
            for profile_key, manifest in manifests.items():
                canonical_urls = [item.get("mediaUrl") for item in manifest.get("items", []) if item.get("mediaUrl")][:args.samples]
                current_items = []
                for rotation in range(4):
                    current = api_queue(args.api, manifest.get("channel"), rotation, manifest)
                    current_items.extend(current.get("candidateItems") or current.get("items") or [])
                current_urls = [item.get("mediaUrl") or item.get("url") or (item.get("media") or {}).get("url") for item in current_items]
                current_urls = [url for url in current_urls if url][:args.samples]
                if not current_urls:
                    current_items = []
                    for rotation in range(4):
                        legacy = api_queue(args.relay, manifest.get("channel"), rotation, manifest)
                        current_items.extend(legacy.get("candidateItems") or legacy.get("items") or [])
                    current_urls = [item.get("mediaUrl") or item.get("url") or (item.get("media") or {}).get("url") for item in current_items]
                    current_urls = [url for url in current_urls if url][:args.samples]
                if not current_urls:
                    # A strict profile body can be rejected by an older relay
                    # deployment. Keep the canary useful by measuring the
                    # relay's channel-default fallback as a separate baseline.
                    current_items = []
                    for rotation in range(4):
                        legacy = api_queue(args.relay, manifest.get("channel"), rotation)
                        current_items.extend(legacy.get("candidateItems") or legacy.get("items") or [])
                    current_urls = [item.get("mediaUrl") or item.get("url") or (item.get("media") or {}).get("url") for item in current_items]
                    current_urls = [url for url in current_urls if url][:args.samples]
                canonical = [await measure(page, url, args.timeout_ms) for url in canonical_urls]
                baseline = [await measure(page, url, args.timeout_ms) for url in current_urls]
                report["lanes"][profile_key] = {
                    "channel": manifest.get("channel"),
                    "manifestVerified": manifest.get("verified") is True,
                    "canonical": canonical,
                    "current": baseline,
                }
        finally:
            await browser.close()
    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="ia_canonical_pilot_manifest.js")
    parser.add_argument("--api", default="https://realsignal-api.tdy1990.workers.dev/api/v3")
    parser.add_argument("--relay", default="https://ais-relay.tdy1990.workers.dev/ia")
    parser.add_argument("--samples", type=int, default=2)
    parser.add_argument("--timeout-ms", type=int, default=12000)
    parser.add_argument("--out", default="ia-canonical-first-frame-canary.json")
    asyncio = __import__("asyncio")
    asyncio.run(main(parser.parse_args()))
