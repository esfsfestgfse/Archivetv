#!/usr/bin/env node
"use strict";

/* Small decoded-media canary for the release gate. It asks production for one
 * verified candidate from representative IA lanes, then measures the browser's
 * first composited video frame with requestVideoFrameCallback. */
const { chromium } = require("playwright");

const API = process.env.RS_API || "https://realsignal-api.tdy1990.workers.dev/api/v3";
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const lanes = (process.env.RS_FRAME_CHANNELS || "11,12,150").split(",").map(Number).filter(Boolean);
const timeoutMs = Math.max(3000, Number(process.env.RS_FRAME_TIMEOUT_MS) || 12000);

async function candidate(channel) {
  const response = await fetch(API + "/ia/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel, count: 3, rotation: Date.now() % 97, recentIds: [] })
  });
  if (!response.ok) throw new Error("queue " + channel + " returned " + response.status);
  const payload = await response.json();
  const items = payload.candidateItems || payload.items || [];
  const item = items.find((row) => row && (row.url || row.mediaUrl || row.media?.url));
  if (!item) throw new Error("queue " + channel + " returned no playable candidate");
  return { channel, id: item.id || item.identifier || "", title: item.title || "", url: item.url || item.mediaUrl || item.media.url };
}

async function measure(page, item) {
  await page.setContent('<video id="probe" muted playsinline preload="auto" style="width:640px;height:360px;background:#000"></video>');
  const started = Date.now();
  await page.evaluate(({ url, timeout }) => {
    const video = document.querySelector("#probe");
    window.__frameResult = null;
    const finish = (status, detail) => {
      if (window.__frameResult) return;
      window.__frameResult = { status, detail: detail || "", ms: Math.round(performance.now()) };
    };
    const timer = setTimeout(() => finish("timeout"), timeout);
    video.addEventListener("playing", () => {
      if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(() => { clearTimeout(timer); finish("frame"); });
      else requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); finish("paint-fallback"); }));
    }, { once: true });
    video.addEventListener("error", () => { clearTimeout(timer); finish("error", String(video.error && video.error.code || "media-error")); }, { once: true });
    video.src = url;
    video.load();
    video.play().catch((error) => finish("play-rejected", String(error && error.message || error)));
  }, { url: item.url, timeout: timeoutMs });
  await page.waitForFunction(() => window.__frameResult !== null, null, { timeout: timeoutMs + 1500 });
  const result = await page.evaluate(() => window.__frameResult);
  return { ...item, ...result, wallMs: Date.now() - started };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  const page = await browser.newPage();
  const results = [];
  try {
    for (const channel of lanes) {
      try { results.push(await measure(page, await candidate(channel))); }
      catch (error) { results.push({ channel, status: "error", detail: String(error && error.message || error) }); }
    }
  } finally { await browser.close(); }
  results.forEach((row) => console.log("CH " + row.channel + " · " + row.status + (row.wallMs != null ? " · " + row.wallMs + " ms" : "") + " · " + (row.title || row.detail || row.id || "")));
  const passed = results.filter((row) => row.status === "frame" || row.status === "paint-fallback").length;
  if (passed !== results.length) process.exitCode = 1;
  else console.log("Decoded first-frame canary passed for " + passed + " / " + results.length + " production lanes.");
})().catch((error) => { console.error(error && error.stack ? error.stack : error); process.exit(1); });
