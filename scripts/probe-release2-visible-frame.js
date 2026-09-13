#!/usr/bin/env node
/* Browser-backed Release 2 probe. This measures the first visible media event
   separately from relay queue readiness. It is intentionally a small sample
   because provider-backed media playback is not equivalent to metadata health. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const channels = (process.argv[2] || '12,75,104,219,555').split(',').map(Number).filter(Number.isFinite);
const html = fs.readFileSync(path.join(root, 'the_dial_desktop.html'), 'utf8');

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (target.endsWith('the_dial_desktop.html')) { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  fs.readFile(target, (error, data) => { if (error) { res.writeHead(404).end(); return; } res.end(data); });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  try {
    const page = await browser.newPage();
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/the_dial_desktop.html?r2Telemetry=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof tuneNum === 'function' && window.__rsRelease2Telemetry);
    const results = [];
    for (const channel of channels) {
      const before = await page.evaluate(() => window.__rsRelease2Telemetry.summary());
      const started = Date.now();
      await page.evaluate(async ch => {
        powered = true;
        document.body.classList.add('atv-powered');
        await tuneNum(ch);
      }, channel);
      const deadline = Date.now() + 20000;
      let summary = before;
      while (Date.now() < deadline) {
        await wait(500);
        summary = await page.evaluate(() => window.__rsRelease2Telemetry.summary());
        if (summary.frames > before.frames || summary.errors > before.errors) break;
      }
      results.push({ channel, elapsedMs: Date.now() - started, before, after: summary, currentTitle: await page.evaluate(() => String(typeof curItem !== 'undefined' && curItem ? curItem.title || '' : '')), sourceState: await page.evaluate(ch => { const state = typeof v2PreviewState !== 'undefined' ? v2PreviewState[ch] : null; return state ? { items: Array.isArray(state.items) ? state.items.length : 0, titles: Array.isArray(state.items) ? state.items.map(item => String(item.title || '')).slice(0, 20) : [], provider: state.provider || '', health: state.health || {} } : null; }, channel) });
    }
    console.log(JSON.stringify({ channels, results, browserErrors }));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error.stack || error); server.close(); process.exitCode = 1; });
