#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function activeView(page) {
  return page.locator(".seismic-tab.on").textContent();
}

async function inspectSeismic(page, label, testCache) {
  await page.waitForSelector("#seismicScreen", { timeout: 15000 });
  await page.waitForFunction(() => {
    const count = Number((document.querySelector("#seismicStats span")?.textContent || "0").replace(/,/g, ""));
    return count > 0 && document.querySelectorAll("[data-seis-qrow]").length > 0 && document.querySelectorAll(".seis-dot").length > 0;
  }, null, { timeout: 45000 });

  if ((await activeView(page)).trim() !== "LATEST") fail(label + ": channel did not open on LATEST");

  await page.locator("[data-seis-qrow]").first().click();
  if (await page.locator(".seismic-detail").count() < 1) fail(label + ": selecting a quake did not open its detail card");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".seismic-tab.on")?.textContent.trim() === "NEARBY");
  if (await page.locator("[data-seis-qrow]").count() < 1) fail(label + ": NEARBY desk is empty");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".seismic-tab.on")?.textContent.trim() === "SIGNIFICANT");
  if (await page.locator("[data-seis-qrow]").count() < 1) fail(label + ": SIGNIFICANT desk is empty");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".seismic-tab.on")?.textContent.trim() === "VOLCANOES");
  await page.waitForFunction(() => document.querySelectorAll("[data-seis-vrow]").length > 0, null, { timeout: 30000 });
  await page.locator("[data-seis-vrow]").first().click();
  if (await page.locator(".seismic-detail").count() < 1) fail(label + ": selecting a volcano did not open its notice detail");

  const volcanoRows = await page.locator("[data-seis-vrow]").count();
  const volcanoMarkers = await page.locator(".seis-volcano").count();

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".seismic-tab.on")?.textContent.trim() === "LATEST");

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#seismicScreen");
    const selectors = [".seismic-head", ".seismic-main", ".seismic-mapbox", ".seismic-map", ".seismic-activity", ".seismic-side", ".seismic-panel", ".seismic-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      fresh: document.querySelector("#seismicFresh")?.textContent.trim(),
      stats: Array.from(document.querySelectorAll(".seismic-stat span")).map((el) => el.textContent.trim()),
      tabs: document.querySelectorAll(".seismic-tab").length,
      active: document.querySelector(".seismic-tab.on")?.textContent.trim(),
      quakeRows: document.querySelectorAll("[data-seis-qrow]").length,
      quakeDots: document.querySelectorAll(".seis-dot").length,
      activityBars: document.querySelectorAll(".seismic-bar").length,
      activityReadouts: document.querySelectorAll(".seismic-readout").length,
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      boxes,
      outside
    };
  });
  result.volcanoRows = volcanoRows;
  result.volcanoMarkers = volcanoMarkers;

  if (result.channel !== "956") fail(label + ": expected channel 956, got " + result.channel);
  if (!/USGS LIVE|CACHED/.test(result.fresh || "")) fail(label + ": USGS freshness label did not populate");
  if (result.tabs !== 4 || result.active !== "LATEST") fail(label + ": four NEXT desks did not cycle back to LATEST");
  if (Number(String(result.stats[0]).replace(/,/g, "")) < 1 || !/^M\d/.test(result.stats[2])) fail(label + ": live quake statistics did not populate");
  if (Number(String(result.stats[3]).replace(/,/g, "")) < 1 || result.volcanoRows < 1 || result.volcanoMarkers < 1) fail(label + ": elevated volcano lane did not populate");
  if (result.quakeRows < 1 || result.quakeDots < 20) fail(label + ": earthquake list or global map is too sparse");
  if (label === "desktop" && (result.activityBars !== 24 || result.activityReadouts !== 3 || !result.boxes[".seismic-activity"])) fail(label + ": 24-hour activity desk did not render");
  if (result.musicGenre !== "gmelectro") fail(label + ": thematic seismic music bed was not selected");
  if (result.outside.length) fail(label + ": elements escaped Seismic Watch frame: " + result.outside.join(", "));
  if (!result.boxes[".seismic-map"] || result.boxes[".seismic-map"].height < 55) fail(label + ": world map is vertically collapsed");

  if (testCache) {
    const rowsBefore = await page.locator("[data-seis-qrow]").count();
    const dotsBefore = await page.locator(".seis-dot").count();
    await page.route("**/*", (route) => {
      let url = route.request().url();
      try { url = decodeURIComponent(url); } catch (_) {}
      if (url.includes("earthquake.usgs.gov/earthquakes/feed") || url.includes("volcanoes.usgs.gov/vsc/api/volcanoApi/elevated")) return route.abort("failed");
      return route.continue();
    });
    await page.evaluate(() => window.__seismicRefresh());
    await page.waitForFunction(() => /CACHED/.test(document.querySelector("#seismicFresh")?.textContent || ""), null, { timeout: 15000 });
    const rowsAfter = await page.locator("[data-seis-qrow]").count();
    const dotsAfter = await page.locator(".seis-dot").count();
    if (rowsBefore < 1 || rowsAfter < 1 || dotsBefore < 20 || dotsAfter < 20) fail(label + ": last-good seismic desk disappeared during forced outage");
    await page.unroute("**/*");
  }

  console.log(label + ": " + result.build + " | " + result.stats[0] + " quakes / 24h | largest " + result.stats[2] + " | " + result.stats[3] + " elevated volcanoes | NEXT passed" + (testCache ? " | cache fallback passed" : ""));
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
      await page.goto(base + "/" + test.file + "?seismic-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      const splashGo = page.locator("#splashGo");
      if (await splashGo.count() && await splashGo.isVisible()) await splashGo.click();
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(800);
      await page.evaluate(() => tuneNum(956));
      await inspectSeismic(page, test.label, test.cache);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("Seismic Watch responsive layout, full USGS feed, four NEXT desks, elevated volcanoes and outage cache regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
