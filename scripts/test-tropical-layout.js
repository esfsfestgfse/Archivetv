#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const base = (process.env.ATV_TEST_URL || "http://127.0.0.1:4176").replace(/\/+$/, "");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fail(message) {
  throw new Error(message);
}

async function activeView(page) {
  return (await page.locator(".tropical-tab.active").textContent()).trim();
}

async function waitForStageImage(page, label) {
  try {
    await page.waitForFunction(() => {
      const image = document.querySelector(".tropical-stage-img");
      return !image || (image.complete && image.naturalWidth > 0);
    }, null, { timeout: 30000 });
  } catch (error) {
    const imageState = await page.evaluate(() => {
      const image = document.querySelector(".tropical-stage-img");
      return image ? { src: image.currentSrc || image.src, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight } : null;
    });
    fail(label + ": official image timed out: " + JSON.stringify(imageState));
  }
  const image = page.locator(".tropical-stage-img");
  if (await image.count()) {
    const decoded = await image.evaluate((node) => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0);
    if (!decoded) fail(label + ": official Tropical Watch image did not decode");
  }
}

async function inspectTropical(page, label, testCache) {
  await page.waitForSelector("#tropicalOps", { timeout: 15000 });
  await page.waitForFunction(() => {
    const active = document.querySelector("#tropicalActive")?.textContent.trim();
    return active && active !== "--" && document.querySelectorAll(".tropical-tab").length === 4 &&
      document.querySelector(".tropical-stage-img, .tropical-empty");
  }, null, { timeout: 45000 });

  if (await activeView(page) !== "STORMS") fail(label + ": channel did not open on STORMS");
  await waitForStageImage(page, label + " STORMS");

  const stormCount = await page.locator("[data-tropical-storm]").count();
  const quietSeason = stormCount === 0;
  if (quietSeason) {
    if (!/NO ACTIVE NHC TROPICAL CYCLONES/.test(await page.locator("#tropicalPanel").textContent())) {
      fail(label + ": quiet-season state is missing its clear status");
    }
  } else {
    if (!await page.locator(".tropical-stage-img").count()) fail(label + ": an active storm has no official cone image");
    if (stormCount > 1) {
      await page.locator("[data-tropical-storm]").nth(1).click();
      await waitForStageImage(page, label + " second storm");
      if (await page.locator("[data-tropical-storm].selected").count() !== 1) fail(label + ": storm selection did not move");
    }
  }

  const initial = await page.evaluate(() => ({
    view: document.querySelector(".tropical-tab.active")?.textContent.trim(),
    source: document.querySelector(".tropical-stage-img")?.currentSrc || document.querySelector(".tropical-stage-img")?.src || ""
  }));
  await page.waitForTimeout(1200);
  const afterPause = await page.evaluate(() => ({
    view: document.querySelector(".tropical-tab.active")?.textContent.trim(),
    source: document.querySelector(".tropical-stage-img")?.currentSrc || document.querySelector(".tropical-stage-img")?.src || ""
  }));
  if (initial.view !== afterPause.view || initial.source !== afterPause.source) fail(label + ": Tropical Watch auto-rotated without NEXT");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".tropical-tab.active")?.textContent.trim() === "FORECAST");
  if (quietSeason) {
    if (!/NO ACTIVE FORECAST TRACKS/.test(await page.locator("#tropicalPanel").textContent())) fail(label + ": quiet forecast desk is unclear");
  } else {
    const forecastRows = await page.locator(".tropical-forecast-row").count();
    const trackDots = await page.locator(".tropical-track-dot").count();
    if (forecastRows < 5 || trackDots < 5 || await page.locator(".tropical-track-line").count() !== 1) {
      fail(label + ": official forecast timeline is underfilled");
    }
  }

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".tropical-tab.active")?.textContent.trim() === "OUTLOOKS");
  if (await page.locator("[data-tropical-basin]").count() !== 3) fail(label + ": expected three official NHC basin outlooks");
  await waitForStageImage(page, label + " outlook");
  for (let i = 0; i < 3; i += 1) {
    await page.locator("[data-tropical-basin]").nth(i).click();
    await page.waitForTimeout(100);
    if (await page.locator("[data-tropical-basin].active").count() !== 1) fail(label + ": basin selector lost active state");
    if (!await page.locator(".tropical-card, .tropical-quiet").count()) fail(label + ": basin outlook has no data or quiet state");
  }

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".tropical-tab.active")?.textContent.trim() === "SATELLITE");
  if (await page.locator("[data-tropical-sat]").count() !== 4) fail(label + ": expected four bounded GOES satellite sectors");
  await waitForStageImage(page, label + " satellite");
  await page.locator("[data-tropical-sat]").nth(1).click();
  await waitForStageImage(page, label + " second satellite");

  await page.evaluate(() => skipOne());
  await page.waitForFunction(() => document.querySelector(".tropical-tab.active")?.textContent.trim() === "STORMS");
  await page.waitForFunction(() => document.querySelector("#chNum")?.textContent.trim() === "959");
  await waitForStageImage(page, label + " cycle");

  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === "none") return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const screen = rect("#tropicalOps");
    const selectors = [".tropical-head", ".tropical-stats", ".tropical-main", ".tropical-stage", ".tropical-side", ".tropical-tabs", ".tropical-panel", ".tropical-ticker"];
    const boxes = Object.fromEntries(selectors.map((selector) => [selector, rect(selector)]));
    const outside = Object.entries(boxes)
      .filter(([, box]) => box && screen)
      .filter(([, box]) => box.x < screen.x - 2 || box.right > screen.right + 2 || box.y < screen.y - 2 || box.bottom > screen.bottom + 2)
      .map(([selector]) => selector);
    const screenText = document.querySelector("#tropicalOps")?.textContent || "";
    const timeless = window.__atvTimelessAudit();
    return {
      build: window.__ATV_BUILD,
      channel: document.querySelector("#chNum")?.textContent.trim(),
      live: document.querySelector("#tropicalLive")?.textContent.trim(),
      tabs: document.querySelectorAll(".tropical-tab").length,
      active: document.querySelector(".tropical-tab.active")?.textContent.trim(),
      musicGenre: typeof iaJazzGenre === "string" ? iaJazzGenre : "",
      imageSize: (() => { const image = document.querySelector(".tropical-stage-img"); return image ? image.naturalWidth + "x" + image.naturalHeight : "data-only"; })(),
      imageSource: (() => { const image = document.querySelector(".tropical-stage-img"); if (!image) return ""; try { return new URL(image.currentSrc || image.src).searchParams.get("src") || image.currentSrc || image.src; } catch { return image.currentSrc || image.src; } })(),
      forbidden: /NO SIGNAL|THE LATE LATE SHOW|NIGHTCAP|PRIMETIME|DAYPART|BEST (MORNING|AFTERNOON|EVENING|NIGHT)/i.test(screenText),
      timeless,
      boxes,
      outside
    };
  });

  if (result.channel !== "959") fail(label + ": expected channel 959, got " + result.channel);
  if (result.live !== "LIVE NHC DATA") fail(label + ": production NHC label did not populate");
  if (result.tabs !== 4 || result.active !== "STORMS") fail(label + ": four NEXT desks did not cycle back to STORMS");
  if (result.musicGenre !== "gmtropical") fail(label + ": thematic tropical music bed was not selected");
  if (!quietSeason && result.imageSize !== "900x540") fail(label + ": active-storm stage must use the bounded 900x540 GOES source, got " + result.imageSize);
  if (result.forbidden) fail(label + ": a forbidden fallback or time-based programming label appeared");
  if (!result.timeless.ok || !result.timeless.channel10?.identity || result.timeless.channel10.show !== "Classic Rerun TV") fail(label + ": IA timeless identity audit failed");
  if (result.outside.length) fail(label + ": elements escaped Tropical Watch frame: " + result.outside.join(", "));
  if (!result.boxes[".tropical-stage"] || result.boxes[".tropical-stage"].height < 70) fail(label + ": official imagery stage is vertically collapsed");
  if (!result.boxes[".tropical-side"] || result.boxes[".tropical-side"].height < 70) fail(label + ": operations panel is vertically collapsed");

  if (testCache && process.env.ATV_QA_SCREENSHOT) {
    await page.screenshot({ path: process.env.ATV_QA_SCREENSHOT, fullPage: true });
  }

  if (testCache) {
    const relayContract = await page.evaluate(async () => {
      const source = document.querySelector(".tropical-stage-img")?.currentSrc || document.querySelector(".tropical-stage-img")?.src;
      const imageResponse = await fetch(source, { cache: "no-store" });
      const blockedResponse = await fetch("https://ais-relay.tdy1990.workers.dev/live/tropical/image?src=" + encodeURIComponent("https://example.com/not-allowed.png"), { cache: "no-store" });
      return {
        imageStatus: imageResponse.status,
        imageType: imageResponse.headers.get("content-type") || "",
        imageSource: imageResponse.headers.get("x-afterglow-source") || "",
        blockedStatus: blockedResponse.status
      };
    });
    if (relayContract.imageStatus !== 200 || !/^image\//.test(relayContract.imageType) || !/goes-image-relay/.test(relayContract.imageSource)) {
      fail(label + ": bounded GOES image relay contract failed: " + JSON.stringify(relayContract));
    }
    if (relayContract.blockedStatus !== 400) fail(label + ": tropical image relay accepted a non-NOAA host");
  }

  if (testCache) {
    const before = await page.locator("#tropicalPanel").textContent();
    await page.route("**/live/tropical**", (route) => route.abort("failed"));
    await page.evaluate(() => window.__tropicalRefresh());
    await page.waitForFunction(() => /LAST-GOOD/.test(document.querySelector("#tropicalLive")?.textContent || ""), null, { timeout: 20000 });
    const after = await page.locator("#tropicalPanel").textContent();
    if (!before.trim() || !after.trim() || await page.locator(".tropical-tab").count() !== 4) fail(label + ": last-good tropical desk disappeared during forced outage");
    await page.unroute("**/live/tropical**");
  }

  console.log(label + ": " + result.build + " | " + (quietSeason ? "quiet-season mode" : stormCount + " active storms") + " | " + result.imageSize + " stage source | four NEXT desks passed" + (testCache ? " | cache fallback passed" : "") + " | IA timeless identity passed");
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
      await page.goto(base + "/" + test.file + "?tropical-layout-test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
      const splashGo = page.locator("#splashGo");
      if (await splashGo.count() && await splashGo.isVisible()) await splashGo.click();
      await page.evaluate(() => { if (!document.body.classList.contains("atv-powered")) powerOn(); });
      await page.waitForTimeout(800);
      await page.evaluate(() => tuneNum(959));
      await inspectTropical(page, test.label, test.cache);
      if (errors.length) fail(test.label + ": page errors: " + errors.join(" | "));
      await context.close();
    }
    console.log("Tropical Watch official storm, forecast, outlook, satellite, responsive, outage-cache and timeless-programming regression passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
