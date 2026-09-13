#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const reportPath = path.resolve(process.argv[2] || 'tmp/ia-full-soak-160-batched.json');
const manifestPath = path.resolve(process.argv[3] || 'C:/Users/tdy19/Documents/Codex/ia-manifest-153.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const byChannel = new Map(manifest.map(row => [String(row.channel), row]));
const failures = report.results.filter(row => !row.ok);
const underfilled = report.results.filter(row => row.depthUnderfilled);
const duplicates = report.results.slice().sort((a, b) => (b.duplicateItems || 0) - (a.duplicateItems || 0)).slice(0, 30);
console.log('FAILURES');
for (const row of failures) {
  const source = byChannel.get(String(row.channel)) || {};
  console.log(JSON.stringify({channel: row.channel, name: row.name, error: row.error, readyDepths: row.readyDepths, itemDepths: row.itemDepths, sources: row.sources, caches: row.caches, attempts: row.attempts, queryCount: (source.queries || []).length, firstQueries: (source.queries || []).slice(0, 3).map(q => String(q).slice(0, 160)), themeTerms: source.themeTerms, denyCount: (source.denyTerms || []).length, requiredTitleTerms: source.requiredTitleTerms, diversity: source.diversity}));
}
console.log('UNDERFILLED');
for (const row of underfilled) {
  console.log(JSON.stringify({channel: row.channel, name: row.name, readyDepths: row.readyDepths, itemDepths: row.itemDepths, duplicates: row.duplicateItems}));
}
console.log('DUPLICATES');
for (const row of duplicates) {
  console.log(JSON.stringify({channel: row.channel, name: row.name, duplicates: row.duplicateItems, uniqueItems: row.uniqueItems, readyDepths: row.readyDepths}));
}
