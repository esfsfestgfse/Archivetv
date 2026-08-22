#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function inspectApod(page, label, testCache) {
  await page.waitForSelector("#apodScreen", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll(".apod-day").length >= 5, null, { timeout: 60000 });
  await page.waitForFunction(() => (document.querySelector("#apodTitle")?.textContent.trim() || "").length > 4);

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const screen = rect("#apodScreen");
    const selectors = [".apod-main", ".apod-hero", ".apod-story", ".apod-strip", ".apod-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, r]) => r && screen)
      .filter(([, r]) => r.x < screen.x - 2 || r.right > screen.right + 2 || r.y < screen.y - 2 || r.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      source: document.querySelector("#apodFresh")?.textContent.trim(),
      title: document.querySelector("#apodTitle")?.textContent.trim(),
      date: document.querySelector("#apodHeroDate")?.textContent.trim(),
      explanation: document.querySelector("#apodExplanation")?.textContent.trim(),
      credit: document.querySelector("#apodCredit")?.textContent.trim(),
      gallery: document.querySelectorAll(".apod-day").length,
      active: document.querySelector(".apod-day.on span")?.textContent.trim(),
      media: document.querySelectorAll("#apodMedia img,#apodMedia video,#apodMedia iframe").length,
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      screen,
      boxes,
      outside
    };
  });

  if (result.channel !== "954") fail(label + ": expected channel 954, got " + result.channel);
  if (!/NASA APOD|NASA IMAGE LIBRARY/.test(result.source)) fail(label + ": NASA source label did not populate");
  if (result.title.length < 5 || result.explanation.length < 20) fail(label + ": title or editorial explanation is missing");
  if (!/^CREDIT · /.test(result.credit)) fail(label + ": image/video credit is missing");
  if (result.gallery < 5 || result.gallery > 7) fail(label + ": seven-day gallery did not populate correctly");
  if (result.media !== 1) fail(label + ": hero media did not render exactly once");
  if (result.musicGenre !== "gmelectro") fail(label + ": thematic APOD music bed was not selected");
  if (result.outside.length) fail(label + ": elements escaped APOD frame: " + result.outside.join(", "));
  if (!result.boxes[".apod-hero"] || result.boxes[".apod-hero"].height < 60) fail(label + ": APOD hero is vertically collapsed");

  const before = result.active;
  await page.evaluate(() => skipOne());
  await page.waitForFunction((oldDate) => document.querySelector(".apod-day.on span")?.textContent.trim() !== oldDate, before);
  const after = await page.locator(".apod-day.on span").textContent();
  if (after.trim() === before || (await page.locator("#chNum").textContent()).trim() !== "954") fail(label + ": NEXT did not advance the gallery in place");

  if (testCache) {
    const titleBefore = await page.locator("#apodTitle").textContent();
    await page.route("**/*", (route) => {
      let url = route.request().url();
      try { url = decodeURIComponent(url); } catch (_) {}
      if (url.includes("api.nasa.gov/planetary/apod") || url.includes("apod.nasa.gov/apod/astropix.html") || url.includes("images-api.nasa.gov/search")) return route.abort("failed");
      return route.continue();
    });
    await page.evaluate(() => window.__apodRefresh());
    await page.waitForFunction(() => /CACHED/.test(document.querySelector("#apodFresh")?.textContent || ""), null, { timeout: 15000 });
    const titleAfter = await page.locator("#apodTitle").textContent();
    if (!titleBefore.trim() || !titleAfter.trim() || (await page.locator(".apod-day").count()) < 5) fail(label + ": cached NASA gallery disappeared during forced outage");
    await page.unroute("**/*");
  }

  console.log(
    label + ": " + result.build + " | " + result.gallery + " days | " + result.title.slice(0, 42) + " | NEXT passed" + (testCache ? " | cache fallback passed" : "")
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
      await page.goto(base + "/" + test.file + "?apod-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(900);
      await page.evaluate(() => tuneNum(954));
      await inspectApod(page, test.label, test.cache);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("APOD responsive layout, seven-day gallery, rich media, cache fallback and NEXT regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
