#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edgeUrl = "https://ais-relay.tdy1990.workers.dev/live/adsb?lat=40.641&lon=-73.778&radius=78";

function fail(message) {
  throw new Error(message);
}

async function inspectSky(page, label, testCache) {
  await page.waitForSelector("#skyBeaconScreen", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#skyBeaconFresh")?.textContent.includes("ADS-B"), null, { timeout: 45000 });

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => /NEW YORK/.test(document.querySelector("#skyBeaconLoc")?.textContent || ""), null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll(".skybeacon-row").length > 0, null, { timeout: 45000 });

  await page.locator('[data-sky-view="1"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".skybeacon-wx").length >= 3, null, { timeout: 45000 });
  const weatherRows = await page.locator(".skybeacon-wx").count();
  await page.locator('[data-sky-view="0"]').click();

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#skyBeaconScreen");
    const selectors = [".skybeacon-main", ".skybeacon-radar", ".skybeacon-side", ".skybeacon-panel", ".skybeacon-regions", ".skybeacon-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      source: document.querySelector("#skyBeaconFresh")?.textContent.trim(),
      location: document.querySelector("#skyBeaconLoc")?.textContent.trim(),
      stats: Array.from(document.querySelectorAll(".skybeacon-stat span")).map((el) => el.textContent.trim()),
      rows: document.querySelectorAll(".skybeacon-row").length,
      blips: document.querySelectorAll("#skyBeaconScope .scope-blips .sky-blip").length,
      weather: document.querySelectorAll(".skybeacon-wx").length,
      regions: document.querySelectorAll(".skybeacon-region").length,
      activeRegion: document.querySelector(".skybeacon-region.on")?.textContent.trim(),
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      screen,
      boxes,
      outside
    };
  });
  result.weather = weatherRows;

  if (result.channel !== "955") fail(label + ": expected channel 955, got " + result.channel);
  if (!/NEW YORK/.test(result.location) || result.activeRegion !== "NEW YORK") fail(label + ": NEXT did not move to JFK in place");
  if (!/adsb\.lol|adsb\.one|adsb\.fi|opensky/i.test(result.source)) fail(label + ": edge ADS-B source label did not populate");
  if (result.stats.length !== 4 || Number(result.stats[0].replace(/,/g, "")) < 1) fail(label + ": live airborne summary did not populate");
  if (result.rows < 1 || result.blips < 1) fail(label + ": aircraft list or radar blips did not populate");
  if (result.weather < 3) fail(label + ": batched airport weather did not populate");
  if (result.regions !== 19) fail(label + ": expected local airspace plus eighteen world hubs");
  if (result.musicGenre !== "gmelectro") fail(label + ": thematic Sky Beacon music bed was not selected");
  if (result.outside.length) fail(label + ": elements escaped Sky Beacon frame: " + result.outside.join(", "));
  if (!result.boxes[".skybeacon-radar"] || result.boxes[".skybeacon-radar"].height < 60) fail(label + ": ADS-B radar is vertically collapsed");

  if (testCache) {
    const rowsBefore = await page.locator(".skybeacon-row").count();
    await page.route("**/*", (route) => {
      let url = route.request().url();
      try { url = decodeURIComponent(url); } catch (_) {}
      if (url.includes("/live/adsb") || url.includes("api.adsb.lol") || url.includes("api.adsb.one") || url.includes("opendata.adsb.fi") || url.includes("api.cors.syrins.tech") || url.includes("opensky-network.org")) return route.abort("failed");
      return route.continue();
    });
    await page.evaluate(() => window.__skyBeaconRefresh());
    await page.waitForFunction(() => /CACHED/.test(document.querySelector("#skyBeaconFresh")?.textContent || ""), null, { timeout: 15000 });
    const rowsAfter = await page.locator(".skybeacon-row").count();
    if (rowsBefore < 1 || rowsAfter < 1 || (await page.locator("#skyBeaconScope .scope-blips .sky-blip").count()) < 1) fail(label + ": last-good radar disappeared during forced outage");
    await page.unroute("**/*");
  }

  console.log(
    label + ": " + result.build + " | " + result.stats[0] + " aircraft at JFK | " + result.weather + " METARs | NEXT passed" + (testCache ? " | cache fallback passed" : "")
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  try {
    const probeContext = await browser.newContext();
    let first = null;
    let firstJson = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      first = await probeContext.request.get(edgeUrl);
      firstJson = await first.json();
      if (first.ok() && Array.isArray(firstJson.ac)) break;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    const second = await probeContext.request.get(edgeUrl);
    const secondJson = await second.json();
    if (!first.ok() || !second.ok() || !Array.isArray(firstJson.ac) || !Array.isArray(secondJson.ac)) fail("Cloudflare ADS-B edge route did not recover: first=" + first.status() + " " + (firstJson.error || "bad payload") + " second=" + second.status() + " " + (secondJson.error || "bad payload"));
    if (!/adsb\.lol|adsb\.one|adsb\.fi|opensky/.test(String(secondJson.source || ""))) fail("Cloudflare ADS-B edge route did not identify its upstream source");
    if (second.headers()["x-afterglow-cache"] !== "hit") fail("second Cloudflare ADS-B probe was not served from the edge cache");
    console.log("edge relay: " + secondJson.source + " | " + secondJson.ac.length + " raw aircraft | cache hit passed");
    await probeContext.close();

    const cases = [
      { label: "desktop", file: "the_dial_desktop.html", viewport: { width: 1440, height: 900 }, cache: true },
      { label: "compact desktop", file: "the_dial_desktop.html", viewport: { width: 360, height: 900 } },
      { label: "mobile", file: "the_dial_mobile.html", viewport: { width: 430, height: 900 } }
    ];
    for (const test of cases) {
      const context = await browser.newContext({ viewport: test.viewport });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(base + "/" + test.file + "?sky-beacon-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      const splashGo = page.locator("#splashGo");
      if (await splashGo.count() && await splashGo.isVisible()) await splashGo.click();
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(900);
      await page.evaluate(() => tuneNum(955));
      await inspectSky(page, test.label, test.cache);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("Sky Beacon edge relay, responsive layout, live radar, batched METAR, cache fallback and NEXT regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
