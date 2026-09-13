#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = process.argv[2];
const requested = new Set(String(process.argv[3] || '').split(',').map(value => value.trim()).filter(Boolean));
if (!manifestPath || !requested.size) {
  console.error('Usage: node scripts/print-ia-lane-summary.js <manifest.json> <channel,...>');
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
for (const row of manifest) {
  if (!requested.has(String(row.channel))) continue;
  console.log(JSON.stringify({
    channel: String(row.channel),
    name: row.name,
    queries: (row.queries || []).slice(0, 8).map(query => query.slice(0, 220)),
    themeTerms: row.themeTerms || [],
    requiredTitleTerms: row.requiredTitleTerms || [],
    denyTerms: row.denyTerms || [],
  }));
}
