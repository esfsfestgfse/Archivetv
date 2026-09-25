#!/usr/bin/env node
/* Read-only production audit for every approved Source Suite profile.
 * It measures durable depth, freshness/exhaustion, runtime violations,
 * duplicate IDs, provider mix, and verified guide coverage without forcing
 * a discovery refresh or spending upstream search quota. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const args = process.argv.slice(2);
const base = (args.find(arg => arg.startsWith('--base=')) || '').slice(7) || 'https://realsignal-api.tdy1990.workers.dev/api/v3';
const out = (args.find(arg => arg.startsWith('--out=')) || '').slice(6);
const concurrency = Math.max(1, Math.min(8, Number((args.find(arg => arg.startsWith('--concurrency=')) || '').slice(14)) || 4));

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      try { output[index] = await fn(values[index]); }
      catch (error) { output[index] = { key: values[index], error: String(error && error.message || error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

async function json(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { headers: { 'x-realsignal-client': 'source-production-audit' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally { clearTimeout(timer); }
}

(async () => {
  const registryUrl = pathToFileURL(path.join(__dirname, '..', 'source_suite_profile_registry.js'));
  const { SOURCE_PROFILE_REGISTRY } = await import(registryUrl);
  const keys = Object.keys(SOURCE_PROFILE_REGISTRY).sort();
  const rows = await mapLimit(keys, concurrency, async key => {
    const encoded = encodeURIComponent(key);
    const started = Date.now();
    const [catalog, guide] = await Promise.all([
      json(`${base}/catalog?channel=${encoded}&limit=96`),
      json(`${base}/guide?channel=${encoded}&limit=8`),
    ]);
    const items = Array.isArray(catalog.items) ? catalog.items : [];
    const ids = items.map(item => String(item && (item.id || item.identifier || item.sourceIdentifier) || '')).filter(Boolean);
    const providerCounts = {};
    let runtimeViolations = 0;
    for (const item of items) {
      const provider = String(item && item.provider || 'unknown');
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      const runtime = Number(item && (item.duration || item.runtime || item.duration_seconds)) || 0;
      if (runtime > 0 && runtime < 900) runtimeViolations += 1;
    }
    return {
      key,
      name: SOURCE_PROFILE_REGISTRY[key].name,
      depth: Number(catalog.catalogDepth || catalog.candidates || items.length),
      returned: items.length,
      unseen: Number(catalog.unseenCatalogItems ?? guide.unseenCount ?? items.length),
      seen: Number(catalog.seenCatalogItems ?? guide.seenCount ?? 0),
      exhausted: catalog.catalogExhausted === true || guide.catalogExhausted === true,
      duplicates: Math.max(0, ids.length - new Set(ids).size),
      runtimeViolations,
      providers: providerCounts,
      guideItems: Array.isArray(guide.items) ? guide.items.length : 0,
      guideProvider: String(guide.current && guide.current.provider || ''),
      elapsedMs: Date.now() - started,
    };
  });
  const failures = rows.filter(row => row.error);
  const valid = rows.filter(row => !row.error);
  const summary = {
    generatedAt: new Date().toISOString(),
    base,
    profiles: rows.length,
    failures: failures.length,
    zeroDepth: valid.filter(row => row.depth === 0).length,
    underFive: valid.filter(row => row.depth < 5).length,
    underTwelve: valid.filter(row => row.depth < 12).length,
    deep: valid.filter(row => row.depth >= 12).length,
    duplicateRows: valid.reduce((sum, row) => sum + row.duplicates, 0),
    runtimeViolations: valid.reduce((sum, row) => sum + row.runtimeViolations, 0),
    exhausted: valid.filter(row => row.exhausted).length,
    averageDepth: valid.length ? Number((valid.reduce((sum, row) => sum + row.depth, 0) / valid.length).toFixed(1)) : 0,
  };
  const report = { summary, rows };
  console.log(JSON.stringify(summary, null, 2));
  for (const row of rows.filter(row => row.error || row.depth < 12 || row.duplicates || row.runtimeViolations)) {
    console.log(`${row.error ? 'FAIL' : row.depth < 5 ? 'P0' : 'P1'} ${row.key} depth=${row.depth ?? 0} unseen=${row.unseen ?? 0} duplicates=${row.duplicates ?? 0} short=${row.runtimeViolations ?? 0}${row.error ? ` error=${row.error}` : ''}`);
  }
  if (out) fs.writeFileSync(path.resolve(out), JSON.stringify(report, null, 2) + '\n');
  if (failures.length || summary.zeroDepth || summary.duplicateRows || summary.runtimeViolations) process.exitCode = 1;
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
