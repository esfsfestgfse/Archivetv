#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function inspectHam(page, label, testCache) {
  await page.waitForSelector("#hfScreen", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll(".hf-row:not(.hf-row-head)").length > 0, null, { timeout: 60000 });
  await page.waitForFunction(() => /^\d+$/.test(document.querySelector("#hfFlux")?.textContent.trim() || ""), null, { timeout: 35000 });

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#hfScreen");
    const selectors = [".hf-prop", ".hf-band-conditions", ".hf-toolbar", ".hf-list", ".hf-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    const rows = Array.from(document.querySelectorAll(".hf-row:not(.hf-row-head)")).map((row) => ({
      mhz: Number(row.dataset.hfMhz),
      band: row.dataset.hfBand,
      text: row.textContent.trim()
    }));
    const mappingErrors = rows.filter((row) =>
      (row.mhz >= 13.8 && row.mhz <= 14.5 && row.band !== "20m") ||
      (row.mhz >= 6.8 && row.mhz <= 7.4 && row.band !== "40m") ||
      (row.mhz >= 9.9 && row.mhz <= 10.3 && row.band !== "30m") ||
      (row.mhz >= 3.3 && row.mhz <= 4.1 && row.band !== "80m")
    );
    const checkedMappings = rows.filter((row) =>
      (row.mhz >= 13.8 && row.mhz <= 14.5) ||
      (row.mhz >= 6.8 && row.mhz <= 7.4) ||
      (row.mhz >= 9.9 && row.mhz <= 10.3) ||
      (row.mhz >= 3.3 && row.mhz <= 4.1)
    ).length;
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      source: document.querySelector("#hfFresh")?.textContent.trim(),
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      summaryCards: document.querySelectorAll(".hf-summary-card").length,
      conditions: document.querySelectorAll(".hf-band-cond").length,
      filters: Array.from(document.querySelectorAll(".hf-filter")).map((button) => button.textContent.trim()),
      activeFilter: document.querySelector(".hf-filter.on")?.textContent.trim(),
      rows,
      mappingErrors,
      checkedMappings,
      screen,
      boxes,
      outside
    };
  });

  if (result.channel !== "952") fail(label + ": expected channel 952, got " + result.channel);
  if (result.musicGenre !== "gmelectro") fail(label + ": thematic Ham Radio music bed was not selected");
  if (result.summaryCards !== 4) fail(label + ": expected four live summary cards");
  if (result.conditions !== 5) fail(label + ": expected five propagation-condition bands");
  if (result.rows.length < 1) fail(label + ": live WSPR rows did not populate");
  if (result.checkedMappings < 1) fail(label + ": current live sample did not contain a testable HF band");
  if (result.mappingErrors.length) fail(label + ": incorrect frequency-to-band mapping: " + JSON.stringify(result.mappingErrors.slice(0, 3)));
  if (result.rows.some((row) => !/MHz/.test(row.text) || !/dBm/.test(row.text) || !/km/.test(row.text))) fail(label + ": rich frequency/power/distance fields are missing");
  if (result.filters.length < 2) fail(label + ": live band filters did not populate");
  if (result.outside.length) fail(label + ": elements escaped Ham Radio frame: " + result.outside.join(", "));
  if (!result.boxes[".hf-list"] || result.boxes[".hf-list"].height < 45) fail(label + ": live spot list is vertically collapsed");

  const before = result.activeFilter;
  await page.evaluate(() => skipOne());
  await page.waitForFunction((oldFilter) => document.querySelector(".hf-filter.on")?.textContent.trim() !== oldFilter, before);
  const after = await page.locator(".hf-filter.on").textContent();
  const channelAfter = await page.locator("#chNum").textContent();
  if (after.trim() === before || channelAfter.trim() !== "952") fail(label + ": NEXT did not cycle Ham Radio bands in place");

  if (testCache) {
    const rowsBefore = await page.locator(".hf-row:not(.hf-row-head)").count();
    await page.route("**/*", (route) => {
      let url = route.request().url();
      try { url = decodeURIComponent(url); } catch (_) {}
      if (url.includes("db1.wspr.live")) return route.abort("failed");
      return route.continue();
    });
    await page.evaluate(() => window.__hfRefresh());
    await page.waitForFunction(() => /CACHED/.test(document.querySelector("#hfFresh")?.textContent || ""), null, { timeout: 15000 });
    const rowsAfter = await page.locator(".hf-row:not(.hf-row-head)").count();
    if (rowsBefore < 1 || rowsAfter < 1) fail(label + ": cached WSPR rows disappeared during a forced outage");
    await page.unroute("**/*");
  }

  console.log(
    label + ": " + result.build + " | " + result.rows.length + " paths | " +
    result.filters.length + " live filters | " + result.source + " | NEXT passed" + (testCache ? " | cache fallback passed" : "")
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
      await page.goto(base + "/" + test.file + "?ham-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(900);
      await page.evaluate(() => tuneNum(952));
      await inspectHam(page, test.label, test.cache);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("Ham Radio responsive layout, live schema, band mapping, outage cache and NEXT regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
