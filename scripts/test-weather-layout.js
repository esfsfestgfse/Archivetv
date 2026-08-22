#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function inspectWeather(page, label, expectedSource) {
  await page.waitForSelector("#wxScreen", { timeout: 15000 });
  await page.waitForFunction(
    () => /F$/.test((document.querySelector(".wx-temp") || {}).textContent || ""),
    null,
    { timeout: 35000 }
  );
  await page.waitForFunction(() => document.querySelector("#chNum")?.textContent.trim() === "950");

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      if (getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#wxScreen");
    const selectors = ["#wxMain", ".wx-left", "#wxRadarWrap", "#wxFcGrid", "#wxTicker", "#hazTicker", "#wxBug"];
    const boxes = Object.fromEntries(selectors.map((s) => [s, rect(s)]));
    const within = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([s]) => s);
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector(".chnum")?.textContent.trim(),
      temperature: document.querySelector(".wx-temp")?.textContent.trim(),
      update: document.querySelector("#wxUpd")?.textContent.trim(),
      radarLabel: document.querySelector("#wxRadarLbl")?.textContent.trim(),
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      hourly: document.querySelectorAll(".wx-hr").length,
      daily: document.querySelectorAll(".wx-day").length,
      screen,
      boxes,
      within
    };
  });

  if (result.channel !== "950") fail(label + ": expected channel 950, got " + result.channel);
  if (!/^(NWS|OPEN-METEO) \u00b7 /.test(result.update)) fail(label + ": observation/source freshness label missing");
  if (expectedSource && !result.update.startsWith(expectedSource + " \u00b7 ")) fail(label + ": expected " + expectedSource + " data, got " + result.update);
  if (result.hourly < 6) fail(label + ": expected at least six hourly periods");
  if (result.daily < 4) fail(label + ": expected at least four forecast periods");
  if (result.musicGenre !== "gmjazz") fail(label + ": thematic Weather Watch music bed was not selected");
  if (result.within.length) fail(label + ": elements escaped Weather Watch frame: " + result.within.join(", "));
  if (result.boxes["#wxMain"].height < result.screen.height * 0.25) fail(label + ": current/radar panel is too short (" + Math.round(result.boxes["#wxMain"].height) + " of " + Math.round(result.screen.height) + "px)");
  if (result.boxes["#wxRadarWrap"].height < result.boxes["#wxMain"].height * 0.72) fail(label + ": radar is still vertically collapsed (" + Math.round(result.boxes["#wxRadarWrap"].height) + " of " + Math.round(result.boxes["#wxMain"].height) + "px)");
  if (result.boxes["#wxFcGrid"] && result.boxes["#wxFcGrid"].height > result.screen.height * 0.35) fail(label + ": forecast rail consumes too much screen height");

  const before = result.radarLabel;
  await page.evaluate(() => skipOne());
  await page.waitForFunction((oldLabel) => document.querySelector("#wxRadarLbl")?.textContent !== oldLabel, before);
  const after = await page.locator("#wxRadarLbl").textContent();
  if (before === after || !/REGIONAL/.test(after)) fail(label + ": NEXT did not advance to regional radar");

  console.log(
    label + ": " + result.build + " | " + result.temperature + " | radar " +
    Math.round(result.boxes["#wxRadarWrap"].width) + "x" + Math.round(result.boxes["#wxRadarWrap"].height) +
    " | " + result.hourly + " hourly / " + result.daily + " forecast | NEXT passed"
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  try {
    const cases = [
      { label: "desktop", file: "the_dial_desktop.html", viewport: { width: 1440, height: 900 } },
      { label: "compact desktop", file: "the_dial_desktop.html", viewport: { width: 360, height: 900 } },
      { label: "mobile", file: "the_dial_mobile.html", viewport: { width: 430, height: 900 } },
      { label: "NWS outage fallback", file: "the_dial_desktop.html", viewport: { width: 1440, height: 900 }, blockNws: true, source: "OPEN-METEO" }
    ];
    for (const test of cases) {
      const context = await browser.newContext({ viewport: test.viewport });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      if (test.blockNws) {
        await page.route("**/*", (route) => {
          let url = route.request().url();
          try { url = decodeURIComponent(url); } catch (_) {}
          if (url.includes("api.weather.gov")) return route.abort("failed");
          return route.continue();
        });
      }
      await page.goto(base + "/" + test.file + "?weather-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(900);
      await page.evaluate(() => tuneNum(950));
      await inspectWeather(page, test.label, test.source);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("Weather Watch responsive layout and NEXT regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
