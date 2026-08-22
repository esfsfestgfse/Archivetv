#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function inspectIss(page, label, testCache) {
  await page.waitForSelector("#issScreen", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#issLatLon")?.textContent.includes("°"), null, { timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll("#issMapSvg polyline").length > 0, null, { timeout: 45000 });

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#issScreen");
    const selectors = [".iss-main", ".iss-map", ".iss-side", ".iss-panel", ".iss-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      source: document.querySelector("#issFresh")?.textContent.trim(),
      latLon: document.querySelector("#issLatLon")?.textContent.trim(),
      altitude: document.querySelector("#issAlt")?.textContent.trim(),
      velocity: document.querySelector("#issVel")?.textContent.trim(),
      visibility: document.querySelector("#issVis")?.textContent.trim(),
      footprint: document.querySelector("#issFoot")?.textContent.trim(),
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      tabs: Array.from(document.querySelectorAll(".iss-tab")).map((button) => button.textContent.trim()),
      activeTab: document.querySelector(".iss-tab.on")?.textContent.trim(),
      currentDots: document.querySelectorAll(".iss-current-dot").length,
      userDots: document.querySelectorAll(".iss-user-dot").length,
      pathSegments: document.querySelectorAll("#issMapSvg polyline").length,
      trackDots: document.querySelectorAll("#issMapSvg > circle").length,
      screen,
      boxes,
      outside
    };
  });

  if (result.channel !== "953") fail(label + ": expected channel 953, got " + result.channel);
  if (!/^WITA TELEMETRY/.test(result.source)) fail(label + ": live source/freshness label did not populate");
  if (!/°[NS]/.test(result.latLon) || !/°[EW]/.test(result.latLon)) fail(label + ": live latitude/longitude missing");
  if (!/^\d+ km$/.test(result.altitude)) fail(label + ": altitude did not populate");
  if (!/^[\d,]+ km\/h$/.test(result.velocity)) fail(label + ": velocity did not populate");
  if (!/DAYLIGHT|ECLIPSED/.test(result.visibility)) fail(label + ": orbital lighting state did not populate");
  if (!/^[\d,]+ km$/.test(result.footprint)) fail(label + ": visibility footprint did not populate");
  if (result.musicGenre !== "gmelectro") fail(label + ": thematic ISS music bed was not selected");
  if (result.tabs.length !== 3) fail(label + ": expected three mission-control panels");
  if (result.currentDots !== 1 || result.pathSegments < 1 || result.trackDots < 5) fail(label + ": live ground track did not render fully");
  if (result.outside.length) fail(label + ": elements escaped ISS frame: " + result.outside.join(", "));
  if (!result.boxes[".iss-map"] || result.boxes[".iss-map"].height < 60) fail(label + ": orbital map is vertically collapsed");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".iss-tab.on")?.textContent.trim() === "NEXT ORBIT");
  if ((await page.locator("#chNum").textContent()).trim() !== "953") fail(label + ": NEXT changed the channel instead of its panel");
  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".iss-tab.on")?.textContent.trim() === "ORBIT DATA");
  if (!/INCLINATION/.test(await page.locator("#issPanel").textContent())) fail(label + ": orbital-elements panel did not render");

  if (testCache) {
    const positionBefore = await page.locator("#issLatLon").textContent();
    await page.route("**/*", (route) => {
      let url = route.request().url();
      try { url = decodeURIComponent(url); } catch (_) {}
      if (url.includes("api.wheretheiss.at/v1/satellites/25544")) return route.abort("failed");
      return route.continue();
    });
    await page.evaluate(() => window.__issRefresh());
    await page.waitForFunction(() => /CACHED/.test(document.querySelector("#issFresh")?.textContent || ""), null, { timeout: 15000 });
    const positionAfter = await page.locator("#issLatLon").textContent();
    if (!positionBefore.includes("°") || !positionAfter.includes("°") || (await page.locator(".iss-current-dot").count()) !== 1) fail(label + ": cached orbital picture disappeared during forced outage");
    await page.unroute("**/*");
  }

  console.log(
    label + ": " + result.build + " | " + result.latLon.split("LIVE")[0].trim() + " | " + result.altitude + " / " + result.velocity +
    " | " + result.trackDots + " orbit samples | NEXT passed" + (testCache ? " | cache fallback passed" : "")
  );
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
      await page.goto(base + "/" + test.file + "?iss-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(900);
      await page.evaluate(() => tuneNum(953));
      await inspectIss(page, test.label, test.cache);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("ISS responsive layout, live schema, orbit track, cache fallback and NEXT regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
