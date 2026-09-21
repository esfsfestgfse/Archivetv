"""Browser regression for the persisted 2.2 health dashboard."""
import asyncio
import os
import sys
from playwright.async_api import async_playwright


TARGET = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8799/the_dial_mobile.html"
IS_DESKTOP = "desktop" in TARGET
SEED = {
    "version": 4,
    "sessions": 2,
    "events": [
        {"at": 1, "type": "tune-complete", "channel": 11, "ms": 920},
        {"at": 2, "type": "first-visible-frame", "channel": 11, "ms": 1700},
        {"at": 3, "type": "repeat", "channel": 11},
        {"at": 4, "type": "tune-complete", "channel": 50, "ms": 540},
        {"at": 5, "type": "first-visible-frame", "channel": 50, "ms": 980},
    ],
    "channelStats": {
        "11": {"channel": 11, "name": "Modern Rerun TV", "cat": "TV", "source": "sitcommodern", "tunes": 4, "frames": 2, "switchMs": [920, 1050], "frameMs": [1700, 2100], "queueDepths": [1, 2], "repeats": 2, "skips": 3, "stalls": 1, "errors": 1, "failures": 2, "recoveries": 0, "recoveryFailures": 0, "timeouts": 1, "lastAt": 2},
        "50": {"channel": 50, "name": "Sports Center", "cat": "SPORTS", "source": "sports", "tunes": 3, "frames": 3, "switchMs": [540, 610], "frameMs": [980, 1200], "queueDepths": [2, 3], "repeats": 0, "skips": 1, "stalls": 0, "errors": 0, "failures": 0, "recoveries": 1, "recoveryFailures": 0, "timeouts": 0, "lastAt": 5},
    },
}


async def main():
    errors = []
    async with async_playwright() as playwright:
        launch = {"args": ["--no-sandbox"]}
        for chrome in (
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ):
            if os.path.exists(chrome):
                launch["executable_path"] = chrome
                break
        browser = await playwright.chromium.launch(**launch)
        page = await browser.new_page(viewport={"width": 1400 if IS_DESKTOP else 430, "height": 900})
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(f"{TARGET}?telemetry-dashboard-test=1", wait_until="domcontentloaded", timeout=30000)
        await page.evaluate("(value) => localStorage.setItem('realsignal:health:v2', JSON.stringify(value))", SEED)
        await page.reload(wait_until="domcontentloaded")
        try:
            await page.click("#splashGo", timeout=2500)
        except Exception:
            pass
        await page.evaluate("""() => {
            const dialog = document.querySelector('#diagOv');
            if (dialog) dialog.classList.add('show');
            window.__rsRelease2Telemetry.render();
        }""")
        await page.wait_for_selector("#rsHealthLanes", state="visible", timeout=10000)
        build = await page.evaluate("() => window.__ATV_BUILD")
        summary = await page.evaluate("() => window.__rsRelease2Telemetry.summary()")
        lanes = page.locator(".rs-health-lane")
        assert build.startswith(("2.2.1-", "2.2.2-", "3.0.0-rc1")), build
        assert summary["sessions"] == 3, summary
        assert await lanes.count() == 2
        assert await lanes.nth(0).get_attribute("data-rs-channel") == "11"
        lane_text = await lanes.nth(0).text_content()
        assert "Modern Rerun TV" in lane_text
        assert "ERR 2" in lane_text
        panel = await page.locator("#rsHealthPanel").bounding_box()
        assert panel and panel["width"] > 0
        async with page.expect_download(timeout=3000) as download_info:
            await page.click("#rsHealthExport")
        filename = (await download_info.value).suggested_filename
        assert filename.startswith("realsignal-health-") and filename.endswith(".json")
        assert not errors, errors
        print(f"{('desktop' if IS_DESKTOP else 'mobile')}: {build} | {summary['sessions']} sessions | 2 ranked lanes | export passed")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
    print("Telemetry dashboard responsive, persisted scorecard, weakest-lane ranking and export regression passed.")
