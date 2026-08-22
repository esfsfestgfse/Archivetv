#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function activeView(page) {
  return (await page.locator(".wc2-tab.active").textContent()).trim();
}

async function inspectWorldClock(page, label, tuneStarted) {
  await page.waitForSelector("#worldClockOps", { timeout: 8000 });
  const tuneElapsed = await page.evaluate((started) => performance.now() - started, tuneStarted);
  if (tuneElapsed > 2000) fail(label + ": local-only World Clock took " + Math.round(tuneElapsed) + "ms to appear");
  await page.waitForFunction(() => {
    const local = document.querySelector("#worldLocalStat")?.textContent.trim();
    return local && local !== "--" && document.querySelectorAll("[data-world-city]").length >= 20 &&
      document.querySelectorAll("[data-world-marker]").length >= 10 && document.querySelectorAll(".wc2-tab").length === 4;
  }, null, { timeout: 10000 });

  if (await activeView(page) !== "WORLD") fail(label + ": channel did not open on WORLD");
  if (await page.locator("#worldClockOps img").count()) fail(label + ": World Clock still depends on an external map image");

  const utcBefore = await page.locator("#worldUtcHead").textContent();
  await page.waitForFunction((before) => document.querySelector("#worldUtcHead")?.textContent !== before, utcBefore, { timeout: 3000 });
  if (await activeView(page) !== "WORLD") fail(label + ": World Clock auto-rotated without NEXT");

  const tokyo = page.locator('[data-world-city="Asia/Tokyo"]');
  if (!await tokyo.count()) fail(label + ": Tokyo is missing from the world hub board");
  const choice = page.locator("[data-world-city]:visible").nth(1);
  const chosenZone = await choice.getAttribute("data-world-city");
  await choice.click();
  await page.waitForFunction((zone) => document.querySelector('[data-world-city="' + CSS.escape(zone) + '"]')?.classList.contains("selected"), chosenZone);
  if (await page.locator('[data-world-city="' + chosenZone + '"].selected').count() !== 1) fail(label + ": city selection did not persist");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".wc2-tab.active")?.textContent.trim() === "ZONES");
  if (await page.locator("[data-world-zone]").count() < 20) fail(label + ": IANA zone board is underfilled");
  const zoneText = await page.locator("#worldClockStage").textContent();
  if (!/UTC[+−]\d{2}/.test(zoneText) || !/DST|STANDARD/.test(zoneText)) fail(label + ": zone board lost offset or DST state");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".wc2-tab.active")?.textContent.trim() === "SUNLIGHT");
  if (await page.locator(".world-light-row").count() < 20 || await page.locator("[data-world-marker]").count() < 10) fail(label + ": sunlight desk is underfilled");
  const sunlightText = await page.locator("#worldClockPanel").textContent();
  if (!/DAYLIGHT|TWILIGHT|NIGHT/.test(sunlightText) || !/H DAY/.test(sunlightText)) fail(label + ": sunlight desk lost solar elevation/day-length data");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".wc2-tab.active")?.textContent.trim() === "OVERLAP");
  if (await page.locator(".wc2-meeting-row").count() !== 8) fail(label + ": meeting overlap desk needs eight anchor cities");
  if (await page.locator(".wc2-meeting-row span").count() !== 96 || await page.locator(".wc2-meeting-row span.open").count() < 20) fail(label + ": 24-hour business-overlap matrix is incomplete");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".wc2-tab.active")?.textContent.trim() === "WORLD");
  await page.waitForFunction(() => document.querySelector("#chNum")?.textContent.trim() === "960");

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === "none") return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const screen = rect("#worldClockOps");
    const selectors = [".wc2-head", ".wc2-stats", ".wc2-main", ".wc2-stage", ".wc2-side", ".wc2-tabs", ".wc2-panel", ".wc2-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, box]) => box && screen)
      .filter(([, box]) => box.x < screen.x - 2 || box.right > screen.right + 2 || box.y < screen.y - 2 || box.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    const timeless = window.__atvTimelessAudit();
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      live: document.querySelector(".wc2-live")?.textContent.trim(),
      tabs: document.querySelectorAll(".wc2-tab").length,
      active: document.querySelector(".wc2-tab.active")?.textContent.trim(),
      markers: document.querySelectorAll("[data-world-marker]").length,
      cities: document.querySelectorAll("[data-world-city]").length,
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      forbidden: /NO SIGNAL|THE LATE LATE SHOW|NIGHTCAP|PRIMETIME/i.test(document.querySelector("#worldClockOps")?.textContent || ""),
      timeless,
      boxes,
      outside
    };
  });

  if (result.channel !== "960") fail(label + ": expected channel 960, got " + result.channel);
  if (result.live !== "LIVE IANA TIME") fail(label + ": live IANA identity did not render");
  if (result.tabs !== 4 || result.active !== "WORLD") fail(label + ": four NEXT desks did not cycle back to WORLD");
  if (result.markers < 10 || result.cities < 20) fail(label + ": world map or city board is underfilled");
  if (result.musicGenre !== "gmjazz") fail(label + ": World Clock did not select its international lounge-jazz bed");
  if (result.forbidden) fail(label + ": a forbidden fallback/programming label appeared");
  if (!result.timeless.ok || !result.timeless.channel10?.identity || result.timeless.channel10.show !== "Classic Rerun TV") fail(label + ": IA timeless identity audit failed");
  if (result.outside.length) fail(label + ": elements escaped World Clock frame: " + result.outside.join(", "));
  if (!result.boxes[".wc2-stage"] || result.boxes[".wc2-stage"].height < 70) fail(label + ": world stage is vertically collapsed");
  if (!result.boxes[".wc2-side"] || result.boxes[".wc2-side"].height < 70) fail(label + ": world data board is vertically collapsed");

  if (process.env.ATV_QA_SCREENSHOT && label === "desktop") {
    await page.screenshot({ path: process.env.ATV_QA_SCREENSHOT, fullPage: true });
  }

  console.log(label + ": " + result.build + " | " + result.cities + " IANA hubs | " + result.markers + " map markers | four instant NEXT desks passed | no network map dependency | IA timeless identity passed");
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  try {
    const cases = [
      { label: "desktop", file: "the_dial_desktop.html", viewport: { width: 1440, height: 900 } },
      { label: "compact desktop", file: "the_dial_desktop.html", viewport: { width: 360, height: 900 } },
      { label: "mobile", file: "the_dial_mobile.html", viewport: { width: 430, height: 900 } }
    ];
    for (const test of cases) {
      const context = await browser.newContext({ viewport: test.viewport });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(base + "/" + test.file + "?world-clock-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      const splashGo = page.locator("#splashGo");
      if (await splashGo.count() && await splashGo.isVisible()) await splashGo.click();
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(500);
      const tuneStarted = await page.evaluate(() => performance.now());
      await page.evaluate(() => tuneNum(960));
      await inspectWorldClock(page, test.label, tuneStarted);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("World Clock responsive planetary map, IANA zone, sunlight, meeting-overlap and timeless-programming regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
