#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) { throw new Error(message); }

async function boot(page, file) {
  await page.goto(base + "/" + file + "?live-control-room-test=1&remoteTelemetry=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  const splash = page.locator("#splashGo");
  if (await splash.count() && await splash.isVisible()) await splash.click();
  await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
  await page.waitForTimeout(350);
}

async function testShipMap(page, label, mobile) {
  await page.evaluate(() => tuneNum(965));
  await page.waitForSelector("#shipRoot .ship-map-tools", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("#shipRoot .ship-map-tools button").length === 9);
  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    };
    return {
      map: rect(".ship-map-panel"),
      data: rect(".ship-data-panel"),
      buttons: Array.from(document.querySelectorAll("#shipRoot .ship-map-tools button")).map((button) => ({
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
        label: button.getAttribute("aria-label") || button.textContent.trim()
      }))
    };
  });
  if (!result.map || !result.data) fail(label + ": Ship Tracker panels are missing");
  if (result.buttons.some((button) => !button.label)) fail(label + ": an interactive Ship Tracker control is unlabeled");
  if (mobile && result.buttons.some((button) => button.width < 42 || button.height < 42)) fail(label + ": Ship Tracker touch controls are smaller than 42px");
  if (mobile && result.data.y < result.map.bottom - 2) fail(label + ": Ship Tracker data panel did not stack below the map");
  await page.locator("[data-ship-world]").click();
  await page.waitForFunction(() => document.querySelector("#shipMapLabel")?.textContent === "WORLD OVERVIEW");
  await page.locator("[data-ship-home]").click();
  await page.waitForFunction(() => document.querySelector("#shipMapLabel")?.textContent === "GULF OF MEXICO");
}

async function installSportsFixtures(page) {
  await page.evaluate(() => {
    window.fetchSportsIPTV = async () => [
      { name: "Verified Live Arena", url: "https://example.invalid/live.m3u8", tvgId: "fixture-live", src: "Fixture", cat: "Sports", verified: true },
      { name: "Scheduled Unverified Feed", url: "https://example.invalid/scheduled.m3u8", tvgId: "fixture-scheduled", src: "Fixture", cat: "Sports" },
      { name: "Healthy Sports Archive", url: "https://example.invalid/healthy.m3u8", tvgId: "fixture-healthy", src: "Fixture", cat: "Sports", verified: true }
    ];
    window.fetchEPG = async () => (window.epgNow = {
      "fixture-live": { title: "Live Championship", start: Date.now() - 60000, stop: Date.now() + 1800000 },
      "fixture-scheduled": { title: "Scheduled Match", start: Date.now() - 60000, stop: Date.now() + 1800000 }
    });
    window.epgFor = (channel) => {
      const row = window.epgNow && window.epgNow[channel && channel.tvgId];
      return row ? { title: row.title, left: Math.max(0, Math.round((row.stop - Date.now()) / 60000)), start: row.start } : null;
    };
    window.fetchSportsData = async () => ({ events: [
      { name: "Active Match", shortName: "Active Match", date: new Date().toISOString(), status: { type: { state: "in", name: "STATUS_IN_PROGRESS", shortDetail: "2nd Half" } }, competitions: [{ competitors: [] }] },
      { name: "Postponed Match", shortName: "Postponed Match", date: new Date().toISOString(), status: { type: { state: "pre", name: "STATUS_POSTPONED", shortDetail: "Postponed" } }, competitions: [{ competitors: [] }] },
      { name: "Ghost Match", shortName: "Ghost Match", date: new Date(Date.now() - 40 * 3600000).toISOString(), status: { type: { state: "in", name: "STATUS_IN_PROGRESS", shortDetail: "Live" } }, competitions: [{ competitors: [] }] },
      { name: "Upcoming Match", shortName: "Upcoming Match", date: new Date(Date.now() + 3600000).toISOString(), status: { type: { state: "pre", name: "STATUS_SCHEDULED", shortDetail: "Starts soon" } }, competitions: [{ competitors: [] }] }
    ] });
  });
}

async function testSports(page, label) {
  await installSportsFixtures(page);
  await page.evaluate(() => tuneNum(50));
  await page.waitForSelector("#sportsSubPicker", { timeout: 15000 });
  await page.locator('[data-sv="livetv"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".sports-live-card").length === 3);
  if (await page.locator(".sports-live-card.onair").count() !== 1) fail(label + ": Live TV did not isolate one trusted on-air feed");
  if (!/Live Championship/.test(await page.locator(".sports-live-card.onair").textContent())) fail(label + ": live programme metadata disappeared after the EPG rerender");
  await page.locator('[data-sports-live-mode="live"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".sports-live-card").length === 1);
  if (!/Verified Live Arena/.test(await page.locator(".sports-live-card").textContent())) fail(label + ": Live Now admitted an unverified or unscheduled feed");
  await page.locator('[data-sports-live-mode="healthy"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".sports-live-card").length === 3);
  await page.locator('[data-sv="today"]').click();
  await page.waitForSelector(".sports-today-head", { timeout: 15000 });
  const todayText = await page.locator("#sportsBody").textContent();
  if (!/Active Match/.test(todayText)) fail(label + ": active event is missing from Live Now");
  if (/Postponed Match|Ghost Match/.test(todayText)) fail(label + ": postponed or stale event leaked into Live Now");
}

async function testTelemetry(page, label) {
  await page.evaluate(async () => {
    const video = document.createElement("video");
    video.id = "rsSyntheticFrame";
    video.style.cssText = "position:fixed;left:4px;top:4px;width:160px;height:90px;z-index:99999;background:#000";
    Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(video, "readyState", { configurable: true, get: () => 4 });
    Object.defineProperty(video, "paused", { configurable: true, get: () => false });
    video.requestVideoFrameCallback = (callback) => setTimeout(() => callback(performance.now(), { presentedFrames: 1 }), 10);
    document.body.appendChild(video);
    await new Promise((resolve) => setTimeout(resolve, 30));
    video.dispatchEvent(new Event("playing"));
  });
  await page.waitForFunction(() => window.__rsRelease2Telemetry?.report.events.some((event) => event.type === "first-visible-frame" && event.source === "video-rvfc"), null, { timeout: 5000 });
  await page.evaluate(() => openGuide());
  await page.waitForFunction(() => window.__rsRelease2Telemetry?.report.events.some((event) => event.type === "guide-open"), null, { timeout: 5000 });
  await page.evaluate(() => closeGuide());
  await page.waitForFunction(() => window.__rsRelease2Telemetry?.report.events.some((event) => event.type === "guide-close"), null, { timeout: 5000 });
  const evidence = await page.evaluate(() => ({ summary: window.__rsRelease2Telemetry.summary(), frame: window.__rsRelease2Telemetry.report.events.find((event) => event.source === "video-rvfc") }));
  if (!evidence.frame || evidence.summary.frames < 1) fail(label + ": composited first-frame telemetry was not recorded");
  if (evidence.summary.guideOpenP50 == null || evidence.summary.guideCloseP50 == null) fail(label + ": guide open/close telemetry was not recorded");
  return evidence;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  try {
    const cases = [
      { label: "desktop", file: "the_dial_desktop.html", viewport: { width: 1440, height: 900 }, mobile: false },
      { label: "mobile", file: "the_dial_mobile.html", viewport: { width: 430, height: 900 }, mobile: true }
    ];
    for (const test of cases) {
      const context = await browser.newContext({ viewport: test.viewport, isMobile: test.mobile, hasTouch: test.mobile });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await boot(page, test.file);
      await testShipMap(page, test.label, test.mobile);
      await testSports(page, test.label);
      const evidence = await testTelemetry(page, test.label);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      console.log(test.label + ": map controls, Sports Live Now, guide timing, and RVFC first-frame passed in " + evidence.frame.ms + " ms");
      await context.close();
    }
    console.log("Live-data control-room browser regression passed for desktop and mobile.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
