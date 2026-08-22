#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function activeView(page) {
  return (await page.locator(".water-tab.active").textContent()).trim();
}

async function inspectWater(page, label, testCache) {
  await page.waitForSelector("#waterScreen", { timeout: 15000 });
  await page.waitForFunction(() => {
    const count = Number(document.querySelector("#waterGaugeCount")?.textContent.trim());
    return count >= 10 && document.querySelectorAll("[data-water-row]").length >= 5 &&
      document.querySelectorAll(".water-marker").length >= 8 && document.querySelector(".water-observed-line");
  }, null, { timeout: 45000 });

  if (await activeView(page) !== "NEAREST") fail(label + ": channel did not open on NEAREST");
  const gaugeCount = Number((await page.locator("#waterGaugeCount").textContent()).trim());
  const markerCount = await page.locator(".water-marker").count();
  const observedPoints = Number(await page.locator(".water-observed-line").getAttribute("data-points"));
  if (gaugeCount < 10 || markerCount < 8 || observedPoints < 20) fail(label + ": live hydrology desk is underfilled");

  const waco = page.locator('[data-water-row="WBAT2"]');
  if (await waco.count()) {
    await waco.click();
    await page.waitForFunction(() => /ACTION/.test(document.querySelector("#waterThresholds")?.textContent || ""));
    if (!/OFFICIAL NOAA GAUGE/.test(await page.locator(".water-expanded").textContent())) fail(label + ": selected gauge details did not expand");
  } else {
    await page.locator("[data-water-row]").nth(1).click();
    if (await page.locator(".water-expanded").count() !== 1) fail(label + ": selected gauge details did not expand");
  }

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".water-tab.active")?.textContent.trim() === "HIGH WATER");
  if (await page.locator("[data-water-row]").count() < 5) fail(label + ": HIGH WATER desk is empty when no flood is active");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".water-tab.active")?.textContent.trim() === "LAKES");
  if (await page.locator(".water-kind.lake").count() < 1) fail(label + ": LAKES desk has no lake gauges");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".water-tab.active")?.textContent.trim() === "TRENDS");
  if (await page.locator(".water-observed-line").count() !== 1) fail(label + ": TRENDS desk lost its hydrograph");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".water-tab.active")?.textContent.trim() === "NEAREST");
  await page.waitForFunction(() => document.querySelector("#chNum")?.textContent.trim() === "958");

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#waterScreen");
    const selectors = [".water-head", ".water-stats", ".water-main", ".water-left", ".water-mapbox", ".water-chartbox", ".water-side", ".water-tabs", ".water-list", ".water-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    const timeless = window.__atvTimelessAudit();
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      live: document.querySelector("#waterLive")?.textContent.trim(),
      gaugeCount: Number(document.querySelector("#waterGaugeCount")?.textContent.trim()),
      tabs: document.querySelectorAll(".water-tab").length,
      active: document.querySelector(".water-tab.active")?.textContent.trim(),
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      noSignal: /NO SIGNAL|THE LATE LATE SHOW/.test(document.querySelector("#waterScreen")?.textContent || ""),
      timeless,
      boxes,
      outside
    };
  });

  if (result.channel !== "958") fail(label + ": expected channel 958, got " + result.channel);
  if (result.live !== "LIVE NOAA DATA") fail(label + ": production live-data label did not populate");
  if (result.tabs !== 4 || result.active !== "NEAREST") fail(label + ": four NEXT desks did not cycle back to NEAREST");
  if (result.musicGenre !== "fieldrec") fail(label + ": thematic field-recording music bed was not selected");
  if (result.noSignal) fail(label + ": River & Lake Watch exposed a forbidden fallback/programming label");
  if (!result.timeless.ok || !result.timeless.channel10?.identity || result.timeless.channel10.show !== "Classic Rerun TV") fail(label + ": IA timeless identity audit failed");
  if (result.outside.length) fail(label + ": elements escaped River & Lake Watch frame: " + result.outside.join(", "));
  if (!result.boxes[".water-mapbox"] || result.boxes[".water-mapbox"].height < 55) fail(label + ": gauge map is vertically collapsed");
  if (!result.boxes[".water-side"] || result.boxes[".water-side"].height < 70) fail(label + ": gauge board is vertically collapsed");

  if (testCache) {
    const before = await page.locator("[data-water-row]").count();
    await page.route("**/live/water**", (route) => route.abort("failed"));
    await page.evaluate(() => window.__waterRefresh());
    await page.waitForFunction(() => /LAST-GOOD/.test(document.querySelector("#waterLive")?.textContent || ""), null, { timeout: 20000 });
    const after = await page.locator("[data-water-row]").count();
    if (before < 5 || after < 5 || await page.locator(".water-observed-line").count() !== 1) fail(label + ": last-good water desk disappeared during forced outage");
    await page.unroute("**/live/water**");
  }

  console.log(label + ": " + result.build + " | " + gaugeCount + " gauges | " + markerCount + " map markers | " + observedPoints + " trend points | four NEXT desks passed" + (testCache ? " | cache fallback passed" : "") + " | IA timeless identity passed");
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  try {
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
      await page.goto(base + "/" + test.file + "?water-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      const splashGo = page.locator("#splashGo");
      if (await splashGo.count() && await splashGo.isVisible()) await splashGo.click();
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(800);
      await page.evaluate(() => tuneNum(958));
      await inspectWater(page, test.label, test.cache);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("River & Lake Watch responsive map, hydrograph, four live desks, outage cache and IA timeless-programming regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
