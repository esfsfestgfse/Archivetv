#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function inspectAurora(page, label, expectedSource, allowNoForecast) {
  await page.waitForSelector("#auroraScreen", { timeout: 15000 });
  await page.waitForFunction(() => /^Kp \d/.test(document.querySelector("#auroraKpBig")?.textContent || ""), null, { timeout: 35000 });
  await page.waitForFunction(() => document.querySelector("#chNum")?.textContent.trim() === "951");

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#auroraScreen");
    const selectors = [".aur-main", ".aur-hero", ".aur-oval-wrap", ".aur-detail", ".aur-panel", ".aur-ticker"];
    const boxes = Object.fromEntries(selectors.map((s) => [s, rect(s)]));
    const outside = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([s]) => s);
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      kp: document.querySelector("#auroraKpBig")?.textContent.trim(),
      scale: document.querySelector("#auroraG")?.textContent.trim(),
      source: document.querySelector("#auroraFresh")?.textContent.trim(),
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      metrics: document.querySelectorAll(".aur-metric").length,
      forecast: document.querySelectorAll(".aur-fc").length,
      activePanel: document.querySelector(".aur-tab.on")?.textContent.trim(),
      screen,
      boxes,
      outside
    };
  });

  if (result.channel !== "951") fail(label + ": expected channel 951, got " + result.channel);
  if (!/^Kp \d/.test(result.kp)) fail(label + ": current Kp did not populate");
  if (!/^G[0-5]$/.test(result.scale)) fail(label + ": NOAA G scale did not populate");
  if (!/^NOAA /.test(result.source) || !/OBS /.test(result.source)) fail(label + ": source/freshness label missing");
  if (expectedSource && !result.source.includes(expectedSource)) fail(label + ": expected " + expectedSource + " fallback, got " + result.source);
  if (result.musicGenre !== "gmelectro") fail(label + ": thematic Aurora music bed was not selected");
  if (result.metrics < 4) fail(label + ": live solar-wind metrics are missing");
  if (!allowNoForecast && result.forecast < 3) fail(label + ": expected three forecast-day cards");
  if (result.outside.length) fail(label + ": elements escaped Aurora frame: " + result.outside.join(", "));
  if (result.boxes[".aur-main"].height < result.screen.height * 0.25) fail(label + ": main Aurora desk is too short");
  if (result.boxes[".aur-oval-wrap"].height < result.boxes[".aur-main"].height * 0.62) fail(label + ": OVATION visual is vertically collapsed");

  const before = result.activePanel;
  await page.evaluate(() => skipOne());
  await page.waitForFunction((oldPanel) => document.querySelector(".aur-tab.on")?.textContent.trim() !== oldPanel, before);
  const after = await page.locator(".aur-tab.on").textContent();
  const channelAfter = await page.locator("#chNum").textContent();
  if (!/NOAA NOTICES/.test(after) || channelAfter.trim() !== "951") fail(label + ": NEXT did not cycle Aurora panels in place");

  console.log(
    label + ": " + result.build + " | " + result.kp + " / " + result.scale + " | " +
    result.source + " | oval " + Math.round(result.boxes[".aur-oval-wrap"].width) + "x" + Math.round(result.boxes[".aur-oval-wrap"].height) +
    " | NEXT passed"
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  try {
    const cases = [
      { label: "desktop", file: "the_dial_desktop.html", viewport: { width: 1440, height: 900 } },
      { label: "compact desktop", file: "the_dial_desktop.html", viewport: { width: 360, height: 900 } },
      { label: "mobile", file: "the_dial_mobile.html", viewport: { width: 430, height: 900 } },
      { label: "Kp primary outage", file: "the_dial_desktop.html", viewport: { width: 1440, height: 900 }, blockPrimary: true, source: "FORECAST OBS" },
      { label: "Kp double outage", file: "the_dial_desktop.html", viewport: { width: 1440, height: 900 }, blockKp: true, source: "1-MIN KP", allowNoForecast: true }
    ];
    for (const test of cases) {
      const context = await browser.newContext({ viewport: test.viewport });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      if (test.blockPrimary || test.blockKp) {
        await page.route("**/*", (route) => {
          let url = route.request().url();
          try { url = decodeURIComponent(url); } catch (_) {}
          if (url.includes("noaa-planetary-k-index.json") || (test.blockKp && url.includes("noaa-planetary-k-index-forecast.json"))) return route.abort("failed");
          return route.continue();
        });
      }
      await page.goto(base + "/" + test.file + "?aurora-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(900);
      await page.evaluate(() => tuneNum(951));
      await inspectAurora(page, test.label, test.source, test.allowNoForecast);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("Aurora responsive layout, live schema, fallback and NEXT regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
