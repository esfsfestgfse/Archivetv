"""Read-only RealSignal/ReelCast regression coverage.

The browser checks use the shipped HTML as the system under test. IA metadata
is served from a local fixture route so checks remain deterministic and do not
depend on Internet Archive availability.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright


CI_DIR = Path(__file__).resolve().parent
WEB_ROOT = CI_DIR.parent
FIXTURE_PATH = CI_DIR / "fixtures" / "ia_metadata_regression.json"
TARGET = sys.argv[1] if len(sys.argv) > 1 else os.environ.get(
    "REALSIGNAL_TARGET", "http://localhost:8799/the_dial_mobile.html"
)


class RegressionFailure(AssertionError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RegressionFailure(message)


def cast_sender_contract() -> None:
    """Verify the native sender's externally visible Cast sequencing contract."""

    sender = WEB_ROOT / "android-sender"
    source_path = sender / "app" / "src" / "main" / "java" / "com" / "realsignal" / "sender" / "MainActivity.java"
    strings_path = sender / "app" / "src" / "main" / "res" / "values" / "strings.xml"
    require(source_path.is_file(), f"missing native sender source: {source_path}")
    require(strings_path.is_file(), f"missing native sender strings: {strings_path}")

    source = source_path.read_text(encoding="utf-8")
    strings = strings_path.read_text(encoding="utf-8")
    require(
        'CUSTOM_NAMESPACE = "urn:x-cast:com.realsignal.dial"' in source,
        "native sender namespace changed",
    )
    require('<string name="cast_app_id">A0A5CD01</string>' in strings, "Cast receiver id changed")

    def ordered(snippets: list[str], body: str, label: str) -> None:
        positions = [body.find(snippet) for snippet in snippets]
        require(all(pos >= 0 for pos in positions), f"Cast contract missing {label}: {snippets}")
        require(positions == sorted(positions), f"Cast contract order changed for {label}")

    started = source[source.index("onSessionStarted"):source.index("onSessionStartFailed")]
    resumed = source[source.index("onSessionResumed"):source.index("onSessionResumeFailed")]
    ordered(['setStatus("Connected · RealSignal receiver ready")', "sendState();"], started, "session start")
    ordered(['setStatus("Connected · RealSignal receiver ready")', "sendState();"], resumed, "session resume")

    send_state = source[source.index("private void sendState()"):source.index("private void setStatus")]
    ordered(
        [
            "getCurrentCastSession()",
            'state.put("type", "REALSIGNAL_STATE")',
            'state.put("channel", readChannel())',
            'state.put("powered", powerToggle.isChecked())',
            "session.sendMessage(CUSTOM_NAMESPACE, state.toString())",
        ],
        send_state,
        "state packet",
    )

    step = source[source.index("private void stepChannel"):source.index("private int readChannel")]
    ordered(["channelInput.setText", "sendState();"], step, "channel step")


async def browser_regressions(fixtures: dict[str, Any]) -> None:
    errors: list[str] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 412, "height": 915})
        page.on("pageerror", lambda error: errors.append(str(error)))

        async def route(request_route):
            url = request_route.request.url
            prefix = "https://archive.org/metadata/"
            if url.startswith(prefix):
                identifier = url[len(prefix):].split("?", 1)[0]
                item = fixtures["items"].get(identifier)
                if item is None:
                    await request_route.fulfill(status=404, body="{}", content_type="application/json")
                else:
                    await request_route.fulfill(status=200, body=json.dumps(item), content_type="application/json")
                return
            if "localhost" in url or "127.0.0.1" in url:
                await request_route.continue_()
            else:
                await request_route.fulfill(status=200, body="")

        await page.route("**/*", route)
        await page.goto(TARGET, wait_until="domcontentloaded")
        await page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
        await page.reload(wait_until="domcontentloaded")

        resolved = await page.evaluate(
            """async ids => {
                const out = {};
                for (const id of ids) out[id] = await resolvePlayable(id);
                return out;
            }""",
            list(fixtures["items"]),
        )
        valid = resolved["fixture-valid-h264"]
        require(valid["type"] == "video", "valid fixture did not resolve as video")
        require(valid["url"].endswith("/reels/clip%20main.mp4"), "H.264 derivative was not preferred or path was not encoded")
        require(valid["captions"] == {"url": "https://archive.org/download/fixture-valid-h264/captions.vtt", "kind": "vtt"}, "VTT caption metadata changed")
        require(valid["meta"]["creator"] == "Ada Lovelace, Charles Babbage", "creator metadata was not normalized")
        require(valid["meta"]["collection"] == "prelinger", "specific collection was not preferred")
        require("<" not in valid["meta"]["description"], "HTML was not stripped from description metadata")

        non_english = resolved["fixture-non-english"]
        require(non_english["type"] == "video", "non-English fixture did not resolve as video")
        require("%E4%B8%96%E7%95%8C/%E7%9F%AD%E7%B7%A8.mp4" in non_english["url"], "non-English path was not preserved and encoded")
        require(resolved["fixture-short"]["type"] == "video", "short fixture was not playable")
        require(resolved["fixture-trailer"]["type"] == "video", "trailer fixture was not inspectable")
        require(resolved["fixture-long"]["type"] == "video", "long fixture was not inspectable")

        duplicate = await page.evaluate(
            """() => {
                const originalRandom = Math.random;
                try {
                    recentTitles.length = 0;
                    recentTitles.push(normTitle("The Great Reel"));
                    seenMap = {};
                    banned = [];
                    Math.random = () => 0;
                    return choose([
                        {identifier: "duplicate", title: "The Great Reel (1955)"},
                        {identifier: "fresh", title: "東京のニュース映画 — Año nuevo"}
                    ]);
                } finally {
                    Math.random = originalRandom;
                }
            }"""
        )
        require(duplicate["identifier"] == "fresh", "near-duplicate title was reselected")
        require(duplicate["title"] == "東京のニュース映画 — Año nuevo", "non-English title was not preserved")

        token = await page.evaluate("() => token")
        filtered = await page.evaluate(
            """async ({token}) => {
                const candidates = [
                    {identifier: "fixture-trailer", title: "Festival Trailer", runtime: "00:02:00"},
                    {identifier: "fixture-long", title: "The Long Feature", runtime: "01:20:00"},
                    {identifier: "fixture-short", title: "Station Ident", runtime: "00:00:12"}
                ];
                const played = [];
                const original = {
                    pick: window.pickFromQueries,
                    resolve: window.resolvePlayable,
                    play: window.playFile,
                    noSignal: window.noSignal
                };
                let cursor = 0;
                window.schedMap = {};
                window.preloadCache = null;
                window.stationMgr = false;
                window.lastMeta = null;
                window.powered = true;
                window.pickFromQueries = async () => candidates[cursor++] || null;
                window.resolvePlayable = async id => ({type: "video", id, url: "https://fixture.invalid/" + id + ".mp4"});
                window.playFile = async item => { played.push(item.id); return true; };
                window.noSignal = () => { played.push("NO_SIGNAL"); };
                try {
                    await tuneIA(
                        {num: 777, nm: "Fixture Reel", cat: "RETRO"},
                        {show: "Fixture Reel", queries: ["fixture"], program: {deny: {title: ["trailer"]}, require: {runtime_max_s: 600}}},
                        token
                    );
                    return {played, cursor};
                } finally {
                    window.pickFromQueries = original.pick;
                    window.resolvePlayable = original.resolve;
                    window.playFile = original.play;
                    window.noSignal = original.noSignal;
                }
            }""",
            {"token": token},
        )
        require(filtered == {"played": ["fixture-short"], "cursor": 3}, "trailer/runtime filtering did not advance to the fresh playable item")

        stale_queue = await page.evaluate(
            """async ({token}) => {
                const played = [];
                const original = {pick: window.pickFromQueries, resolve: window.resolvePlayable, play: window.playFile, noSignal: window.noSignal};
                window.schedMap = {};
                window.preloadCache = {chNum: 778, pl: {id: "stale-preload"}, at: Date.now() - 1800001};
                window.stationMgr = false;
                window.lastMeta = null;
                window.powered = true;
                window.pickFromQueries = async () => ({identifier: "fixture-short", title: "Station Ident"});
                window.resolvePlayable = async id => ({type: "video", id, url: "https://fixture.invalid/" + id + ".mp4"});
                window.playFile = async item => { played.push(item.id); return true; };
                window.noSignal = () => { played.push("NO_SIGNAL"); };
                try {
                    await tuneIA({num: 778, nm: "Queue Fixture", cat: "RETRO"}, {queries: ["fixture"]}, token);
                    return played;
                } finally {
                    window.pickFromQueries = original.pick;
                    window.resolvePlayable = original.resolve;
                    window.playFile = original.play;
                    window.noSignal = original.noSignal;
                }
            }""",
            {"token": token},
        )
        require(stale_queue == ["fixture-short"], "stale preload item was consumed instead of a fresh queue item")

        guide_state = await page.evaluate(
            """async () => {
                const before = curNum;
                for (let i = 0; i < 5; i++) { openGuide(); closeGuide(); }
                openGuide();
                const openRows = document.querySelectorAll("#chList .chcell").length;
                Promise.resolve().then(() => closeGuide());
                await new Promise(resolve => setTimeout(resolve, 20));
                return {before, after: curNum, open: document.getElementById("gwrap").classList.contains("show"), openRows};
            }"""
        )
        require(guide_state["openRows"] > 0, "guide did not render channel rows")
        require(guide_state["before"] == guide_state["after"], "guide open/close race changed the tuned channel")
        require(not guide_state["open"], "guide remained open after close raced with render")
        require(not errors, f"page errors during regression harness: {errors[:3]}")
        await browser.close()


async def main() -> int:
    fixtures = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    failures: list[str] = []
    try:
        cast_sender_contract()
        print("  Cast sender contract: PASS")
    except Exception as error:
        failures.append(f"Cast sender contract: {error}")
        print(f"  Cast sender contract: FAIL — {error}")
    try:
        await browser_regressions(fixtures)
        print("  Browser regressions: PASS")
    except Exception as error:
        failures.append(f"Browser regressions: {error}")
        print(f"  Browser regressions: FAIL — {error}")
    print(f"\n=== {len(failures)} failures out of 2 checks ===")
    if failures:
        for failure in failures:
            print(f"FAILURE: {failure}")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
