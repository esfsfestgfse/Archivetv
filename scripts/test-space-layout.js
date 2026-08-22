#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function activeView(page) {
  return (await page.locator(".space-tab.on").textContent()).trim();
}

async function inspectSpace(page, label, testCache) {
  await page.waitForSelector("#spaceScreen", { timeout: 15000 });
  await page.waitForFunction(() => {
    const values = Array.from(document.querySelectorAll("#spaceStats span"), (el) => el.textContent.trim());
    return values.length === 4 && values.every((value) => value && value !== "--") && document.querySelectorAll("[data-space-index]").length > 0;
  }, null, { timeout: 45000 });

  if (await activeView(page) !== "LAUNCHES") fail(label + ": channel did not open on LAUNCHES");
  const launchRows = await page.locator("[data-space-index]").count();
  if (launchRows < 2) fail(label + ": launch board is underfilled");
  if (!/T[−+-]|LAUNCHED/.test((await page.locator("#spaceCountdown").textContent()).trim())) fail(label + ": live launch countdown is missing");
  await page.waitForFunction(() => document.querySelector(".space-launch-img")?.naturalWidth > 0, null, { timeout: 20000 });

  await page.locator("[data-space-index]").nth(1).click();
  if (await page.locator(".space-detail").count() < 1) fail(label + ": selecting a launch did not open details");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".space-tab.on")?.textContent.trim() === "NEAR EARTH");
  const approachRows = await page.locator("[data-space-index]").count();
  const rocks = await page.locator(".space-rock").count();
  if (approachRows < 5 || rocks < 10) fail(label + ": JPL near-Earth radar is underfilled");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".space-tab.on")?.textContent.trim() === "FIREBALLS");
  const fireballRows = await page.locator("[data-space-index]").count();
  const fireballs = await page.locator(".space-fire").count();
  if (fireballRows < 5 || fireballs < 5) fail(label + ": JPL fireball map is underfilled");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".space-tab.on")?.textContent.trim() === "MISSIONS");
  const imageRows = await page.locator("[data-space-index]").count();
  if (imageRows < 5 || await page.locator(".space-gallery-img").count() !== 1) fail(label + ": NASA mission gallery did not render");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".space-tab.on")?.textContent.trim() === "LAUNCHES");

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#spaceScreen");
    const selectors = [".space-head", ".space-stats", ".space-main", ".space-stage", ".space-side", ".space-tabs", ".space-panel", ".space-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      fresh: document.querySelector("#spaceFresh")?.textContent.trim(),
      stats: Array.from(document.querySelectorAll("#spaceStats span"), (el) => el.textContent.trim()),
      tabs: document.querySelectorAll(".space-tab").length,
      active: document.querySelector(".space-tab.on")?.textContent.trim(),
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      boxes,
      outside
    };
  });

  if (result.channel !== "957") fail(label + ": expected channel 957, got " + result.channel);
  if (!/EDGE LIVE|CACHED/.test(result.fresh || "")) fail(label + ": edge freshness label did not populate");
  if (result.tabs !== 4 || result.active !== "LAUNCHES") fail(label + ": four NEXT desks did not cycle back to LAUNCHES");
  if (result.musicGenre !== "gmelectro") fail(label + ": thematic electronic music bed was not selected");
  if (result.outside.length) fail(label + ": elements escaped Space Operations frame: " + result.outside.join(", "));
  if (!result.boxes[".space-stage"] || result.boxes[".space-stage"].height < 75) fail(label + ": visual stage is vertically collapsed");
  if (!result.boxes[".space-panel"] || result.boxes[".space-panel"].height < 50) fail(label + ": operations list is vertically collapsed");

  if (testCache) {
    const before = await page.locator("[data-space-index]").count();
    await page.route("**/live/space", (route) => route.abort("failed"));
    await page.evaluate(() => window.__spaceRefresh());
    await page.waitForFunction(() => /CACHED/.test(document.querySelector("#spaceFresh")?.textContent || ""), null, { timeout: 16000 });
    const after = await page.locator("[data-space-index]").count();
    if (before < 2 || after < 2) fail(label + ": last-good operations board disappeared during forced outage");
    await page.unroute("**/live/space");
  }

  console.log(label + ": " + result.build + " | " + result.stats.join(" | ") + " | " + launchRows + " launches | " + approachRows + " approaches | " + fireballRows + " fireballs | " + imageRows + " images | NEXT passed" + (testCache ? " | cache fallback passed" : ""));
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
      await page.goto(base + "/" + test.file + "?space-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      const splashGo = page.locator("#splashGo");
      if (await splashGo.count() && await splashGo.isVisible()) await splashGo.click();
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(800);
      await page.evaluate(() => tuneNum(957));
      await inspectSpace(page, test.label, test.cache);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("Space Operations responsive layout, four live feeds, instant NEXT navigation and outage cache regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
