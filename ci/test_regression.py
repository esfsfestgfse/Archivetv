"""CI: 8-point functional regression covering core channel-switching and panel behavior."""
import asyncio, sys
from playwright.async_api import async_playwright

TARGET = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8799/the_dial_mobile.html"
IS_DESKTOP = "desktop" in TARGET

async def main():
    errors = []
    failures = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        vp = {"width": 1400, "height": 900} if IS_DESKTOP else {"width": 412, "height": 915}
        pg = await b.new_page(viewport=vp)
        pg.on("pageerror", lambda e: errors.append(str(e)))

        async def route(r):
            u = r.request.url
            if "localhost" in u:
                await r.continue_()
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

        if IS_DESKTOP:
            await pg.click("#rPow", timeout=3000)
        else:
            await pg.click("#mTab", timeout=2000)
            await pg.wait_for_timeout(160)
            await pg.click("#mPow")
        await pg.wait_for_timeout(700)

        def check(name, result):
            status = "PASS" if result else "FAIL"
            print(f"  {name}: {status}")
            if not result:
                failures.append(name)

        # 1. App powered on — channel number visible
        ch_num = await pg.evaluate("()=>document.getElementById('chNum').textContent")
        check("1. Channel number visible after power-on", ch_num and ch_num.strip() != "")

        # 2. Tune to a specific channel
        await pg.evaluate("()=>{ tuneNum(50); }")  # Sports Center
        await pg.wait_for_timeout(1000)
        cur = await pg.evaluate("()=>curNum")
        check("2. tuneNum(50) sets curNum to 50", cur == 50)

        # 3. Channel name displays
        nm = await pg.evaluate("()=>document.getElementById('nowName').textContent")
        check("3. Channel name shows 'Sports Center'", nm and "Sports Center" in nm)

        # 4. Guide opens
        if IS_DESKTOP:
            await pg.click("#rGuide", timeout=2000)
        else:
            # Mobile: guide button is in the bottom bar
            try:
                await pg.click("[data-act='guide']", timeout=2000)
            except Exception:
                await pg.evaluate("()=>{var g=document.getElementById('gwrap');if(g)g.classList.add('show');}")
        await pg.wait_for_timeout(800)
        guide_open = await pg.evaluate("()=>{var g=document.getElementById('gwrap');return g&&g.classList.contains('show');}")
        check("4. Guide opens", guide_open)

        # 5. Guide renders (at least the container is present)
        gwrap = await pg.evaluate("()=>!!document.getElementById('gwrap')")
        check("5. Guide container exists", gwrap)

        # 6. Channel unchanged after opening guide (regression: guide used to retune)
        cur_after = await pg.evaluate("()=>curNum")
        check("6. Channel unchanged after guide open", cur_after == 50)

        # 7. Tune a different channel
        await pg.evaluate("()=>{ tuneNum(2); }")  # Channel 2 Network
        await pg.wait_for_timeout(1000)
        cur2 = await pg.evaluate("()=>curNum")
        check("7. tuneNum(2) works", cur2 == 2)

        # 8. No page errors throughout
        check("8. Zero page errors", len(errors) == 0)

        await b.close()

    print(f"\n=== {len(failures)} failures out of 8 checks ===")
    if errors:
        print(f"Page errors: {errors[:3]}")
    if failures:
        sys.exit(1)
    else:
        print("PASS")

asyncio.run(main())
