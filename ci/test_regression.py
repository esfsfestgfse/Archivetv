"""CI: functional regression for default V6 controls and explicit UI rollback."""
import asyncio, sys
from datetime import datetime, timezone, timedelta
from playwright.async_api import async_playwright
from fixture_network import is_local_fixture_url
from build_stamp import visible_build_matches

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

        weather_alerts_fail = False
        weather_time = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        weather_periods = [{"name": "Period " + str(i), "startTime": (weather_time + timedelta(hours=i*12)).isoformat(), "endTime": (weather_time + timedelta(hours=(i+1)*12)).isoformat(), "isDaytime": i % 2 == 0, "temperature": 82 if i % 2 == 0 else 56, "shortForecast": "Sunny" if i % 2 == 0 else "Clear", "detailedForecast": "Readable fixture forecast.", "windSpeed": "5 mph", "windDirection": "S"} for i in range(14)]
        weather_hours = [{"startTime": (weather_time + timedelta(hours=i)).isoformat(), "endTime": (weather_time + timedelta(hours=i+1)).isoformat(), "temperature": 80, "shortForecast": "Sunny", "isDaytime": True} for i in range(24)]

        async def route(r):
            u = r.request.url
            if is_local_fixture_url(u, TARGET):
                await r.continue_()
            elif "api.weather.gov" in u:
                if "/alerts/" in u:
                    if weather_alerts_fail:
                        await r.abort()
                        return
                    value = {"features": []}
                elif "/points/" in u:
                    value = {"properties": {"forecast": "https://api.weather.gov/ci/forecast", "forecastHourly": "https://api.weather.gov/ci/hourly", "observationStations": "https://api.weather.gov/ci/stations", "radarStation": "KGRK", "timeZone": "America/Chicago", "relativeLocation": {"properties": {"city": "Waco", "state": "TX"}}}}
                elif u.endswith("/forecast"):
                    value = {"properties": {"periods": weather_periods}}
                elif u.endswith("/hourly"):
                    value = {"properties": {"periods": weather_hours}}
                elif u.endswith("/latest"):
                    value = {"properties": {"timestamp": weather_time.isoformat(), "temperature": {"value": 28}, "textDescription": "Clear"}}
                else:
                    value = {"features": [{"properties": {"stationIdentifier": "KACT"}}]}
                await r.fulfill(status=200, json=value, headers={"Access-Control-Allow-Origin": "*"})
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

        v6 = await pg.locator('#rsV6Power').is_visible()
        if v6:
            await pg.locator('#rsV6Power').click()
        elif IS_DESKTOP:
            await pg.get_by_role("button", name="Turn television on or off").click(timeout=3000)
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
        if v6:
            await pg.locator('#rsV6Guide').click()
        elif IS_DESKTOP:
            await pg.get_by_role("button", name="GUIDE", exact=True).click(timeout=2000)
        else:
            # Mobile: guide button is in the bottom bar
            await pg.locator('#mGuide').click(timeout=2000)
        await pg.wait_for_timeout(800)
        guide_open = await pg.evaluate("()=>window.RealSignalGuide?window.RealSignalGuide.isOpen():document.getElementById('gwrap').classList.contains('show')")
        check("4. Guide opens", guide_open)

        # 5. Guide renders (at least the container is present)
        gwrap = await pg.evaluate("()=>{var g=document.getElementById('rsV6GuideList');return g?g.children.length>0:!!document.getElementById('gwrap');}")
        check("5. Guide container exists", gwrap)

        # 6. Channel unchanged after opening guide (regression: guide used to retune)
        cur_after = await pg.evaluate("()=>curNum")
        check("6. Channel unchanged after guide open", cur_after == 50)

        # 7. Guide closes without changing the tuned channel
        if v6:
            await pg.locator('#rsV6GuideClose').click()
        else:
            await pg.evaluate("()=>{if(typeof closeGuide==='function')closeGuide();}")
        await pg.wait_for_timeout(120)
        guide_closed = await pg.evaluate("()=>window.RealSignalGuide?!window.RealSignalGuide.isOpen():!document.getElementById('gwrap').classList.contains('show')")
        check("7. Guide closes cleanly", guide_closed)

        # 8. Tune a different channel
        await pg.evaluate("()=>{ tuneNum(2); }")  # Channel 2 Network
        await pg.wait_for_timeout(1000)
        cur2 = await pg.evaluate("()=>curNum")
        check("8. tuneNum(2) works", cur2 == 2)

        # 9. The user-visible stamp must identify the exact runtime build.
        runtime_build = await pg.evaluate("()=>String(window.__ATV_BUILD||'')")
        visible_build = await pg.evaluate("()=>{var e=document.getElementById('atv-build-stamp-value');return e?e.textContent.trim():'';}")
        version_chip = await pg.evaluate("()=>{var e=document.getElementById('verChip');return e?e.textContent.trim():'';}")
        check("9. Visible build stamp matches runtime build", visible_build_matches(runtime_build, visible_build, version_chip))

        # Weather network UI must use the full remaining stage, not the legacy
        # live-TV thumbnail max-height. External video is deliberately mocked in CI.
        await pg.evaluate("()=>tuneNum(950)")
        await pg.locator('[data-weather-view="local"]').wait_for(state='visible')
        check("13. Weather defaults to local forecast", await pg.locator('#wxScreen').is_visible() and not await pg.locator('#wxNetwork').is_visible())
        await pg.locator('[data-weather-view="fox"]').click()
        fits = await pg.evaluate("""()=>{
            const host=document.getElementById('wxNetwork').getBoundingClientRect();
            const pane=document.getElementById('tvPane').getBoundingClientRect();
            const buttons=[...document.querySelectorAll('[data-weather-view]')];
            return pane.height >= host.height-2 && pane.width >= host.width-2 &&
              buttons.every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1;});
        }""")
        check("14. Weather network fills stage and controls fit", fits)
        await pg.locator('[data-weather-view="local"]').click()
        check("15. Local forecast returns and network media stops", await pg.locator('#wxScreen').is_visible() and await pg.evaluate("()=>!tvHls&&!document.querySelector('#tvPane video')?.getAttribute('src')"))
        await pg.locator('[data-wx-panel="week"]').click()
        await pg.wait_for_function("()=>document.querySelectorAll('#wxDaily .wxl-day').length===7")
        readable = await pg.evaluate("()=>[...document.querySelectorAll('#wxDaily .wxl-day')].every(e=>{const r=e.getBoundingClientRect();return r.width>100&&getComputedStyle(e).display!=='none'&&e.scrollHeight<=e.clientHeight+2;})")
        check("16. All seven forecast days are reachable and unclipped", readable)
        await pg.locator('[data-wx-panel="radar"]').click()
        await pg.locator('[data-wx-radar="national"]').click()
        check("17. Full radar map and explicit layer selection", await pg.evaluate("()=>document.querySelector('[data-wx-radar=national]').getAttribute('aria-pressed')==='true'&&getComputedStyle(document.querySelector('#wxRadar')).objectFit==='contain'"))
        weather_alerts_fail = True
        await pg.locator('#wxRefresh').wait_for(state='visible')
        await pg.wait_for_function("()=>!document.getElementById('wxRefresh').disabled")
        await pg.locator('#wxRefresh').click()
        await pg.wait_for_function("()=>document.getElementById('wxTicker').textContent.includes('unavailable')")
        check("18. Alert outages never claim an all-clear", "No active" not in await pg.locator('#wxTicker').inner_text())

        # The rollback is an explicit supported presentation, not a hidden-control
        # workaround when the default guide fails.
        await pg.goto(TARGET + ('&' if '?' in TARGET else '?') + 'v6=0', wait_until='load')
        check("11. Explicit rollback leaves the V6 dock unmounted", await pg.locator('#rsV6Dock').count() == 0)
        if IS_DESKTOP:
            await pg.locator('#glassGuide').click()
        else:
            await pg.locator('#mTab').click()
            await pg.locator('#mGuide').click()
        check("12. Rollback opens only the legacy guide", await pg.evaluate("()=>document.getElementById('gwrap').classList.contains('show')&&!document.getElementById('rsV6GuidePanel')"))

        # 10. No page errors throughout either supported presentation
        check("10. Zero page errors", len(errors) == 0)

        await b.close()

    print(f"\n=== {len(failures)} failures out of 18 checks ===")
    if errors:
        print(f"Page errors: {errors[:3]}")
    if failures:
        sys.exit(1)
    else:
        print("PASS")

asyncio.run(main())
