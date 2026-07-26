"""CI: Tune all channels in sequence, assert zero JavaScript page errors."""
import asyncio, sys
from playwright.async_api import async_playwright

TARGET = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8799/the_dial_mobile.html"
IS_DESKTOP = "desktop" in TARGET

async def main():
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        vp = {"width": 1400, "height": 900} if IS_DESKTOP else {"width": 412, "height": 915}
        pg = await b.new_page(viewport=vp)
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # Mock all external APIs so CI doesn't depend on ESPN/NOAA/IA being up
        async def route(r):
            u = r.request.url
            if "localhost" in u:
                await r.continue_()
            elif "scoreboard" in u or "standings" in u:
                await r.fulfill(status=200, content_type="application/json", body='{"events":[]}')
            elif "radio-browser" in u:
                await r.fulfill(status=200, content_type="application/json", body='[]')
            elif "somafm" in u:
                await r.fulfill(status=200, content_type="application/json", body='{"channels":[]}')
            else:
                await r.fulfill(status=200, body="")
        await pg.route("**/*", route)

        await pg.goto(TARGET, wait_until="load")
        await pg.evaluate("()=>localStorage.clear()")
        await pg.reload(wait_until="load")
        try:
            await pg.click("#splashGo", timeout=2500)
        except Exception:
            pass

        # Power on
        if IS_DESKTOP:
            await pg.click("#rPow", timeout=3000)
        else:
            await pg.click("#mTab", timeout=2000)
            await pg.wait_for_timeout(160)
            await pg.click("#mPow")
        await pg.wait_for_timeout(700)

        # Get all channel numbers
        nums = await pg.evaluate("()=>CH.map(c=>c.num)")
        print(f"Tuning {len(nums)} channels...")

        ch_errors = []
        pre = len(errors)
        for i, n in enumerate(nums):
            pre_count = len(errors)
            await pg.evaluate("(n)=>tuneNum(n)", n)
            await pg.wait_for_timeout(800)
            if len(errors) > pre_count:
                nm = await pg.evaluate(f"()=>CH.find(c=>c.num==={n}).nm")
                ch_errors.append((n, nm, errors[-1][:120]))
                print(f"  ERROR ch {n} ({nm}): {errors[-1][:80]}")

        await b.close()

    print(f"\n=== {len(ch_errors)} channels with page errors out of {len(nums)} ===")
    if ch_errors:
        for n, nm, e in ch_errors:
            print(f"  ch {n} {nm}: {e}")
        sys.exit(1)
    else:
        print("PASS")

asyncio.run(main())
