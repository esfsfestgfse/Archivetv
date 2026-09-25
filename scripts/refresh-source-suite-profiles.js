#!/usr/bin/env node
/* Controlled Source Suite catalog refresher.
 * Refreshes a named, small batch of profiles through the production API with
 * bounded concurrency. It never marks items as played and leaves the Worker
 * to persist its verified provider union in the background. */
const args = process.argv.slice(2);
const base = (args.find(arg => arg.startsWith('--base=')) || '').slice(7) || 'https://realsignal-api.tdy1990.workers.dev/api/v3';
const supplied = (args.find(arg => arg.startsWith('--keys=')) || '').slice(7);
const keys = supplied.split(',').map(value => value.trim()).filter(Boolean);
const rotation = Number((args.find(arg => arg.startsWith('--rotation=')) || '').slice(11)) || 0;
const concurrency = Math.max(1, Math.min(3, Number((args.find(arg => arg.startsWith('--concurrency=')) || '').slice(14)) || 2));
if (!keys.length) throw new Error('provide --keys=profile-a,profile-b');

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      try { output[index] = await fn(values[index], index); }
      catch (error) { output[index] = { profileKey: values[index], error: String(error && error.message || error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

(async () => {
  const results = await mapLimit(keys, concurrency, async (profileKey, index) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${base}/source/catalog`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-realsignal-client': 'source-suite-controlled-refresh' },
        body: JSON.stringify({ profileKey, refresh: true, maintenance: true, rotation: rotation + index, minimumReady: 12 }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      return {
        profileKey,
        status: response.status,
        ready: Number(body.ready || 0),
        catalogDepth: Number(body.catalogDepth || body.candidates || 0),
        hydrating: body.hydrating === true,
        exhausted: body.catalogExhausted === true,
        source: body.source || '',
        providers: body.providerAvailability || {},
        error: body.error || '',
      };
    } finally { clearTimeout(timer); }
  });
  console.log(JSON.stringify({ refreshedAt: new Date().toISOString(), base, rotation, results }, null, 2));
  if (results.some(row => row.error || row.status >= 400)) process.exitCode = 1;
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
