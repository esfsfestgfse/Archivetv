#!/usr/bin/env node
/* Static guard for the deployed V2 API boundary. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'realsignal_api_v2_worker.js'), 'utf8');
const rotation = fs.readFileSync(path.join(root, 'realsignal_api_rotation.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'wrangler.api.jsonc'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations', '0001_realsignal_catalog.sql'), 'utf8');
const checks = [
  [worker.includes('const API_PREFIX = "/api/v2"'), 'versioned V2 route'],
  [worker.includes('readBoundedJson') && worker.includes('MAX_BODY_BYTES'), 'bounded JSON input'],
  [worker.includes('env.RELAY.fetch') && worker.includes('relay.internal'), 'internal relay service binding'],
  [worker.includes('env.ROTATION.getByName') && worker.includes('session:${session}:channel:${channel}'), 'per-session channel sharding'],
  [rotation.includes('await this.ctx.storage.put("rotation", next)'), 'persisted rotation state'],
  [worker.includes('env.realsignal_catalog_refresh.send') && worker.includes('async queue(batch, env)'), 'asynchronous catalog ingestion'],
  [worker.includes('env.realsignal_catalog.batch') && worker.includes('catalogFallback'), 'D1 catalog write and playback fallback'],
  [config.includes('"d1_databases"') && config.includes('"durable_objects"') && config.includes('"queues"'), 'production bindings'],
  [migration.includes('CREATE TABLE IF NOT EXISTS programs') && migration.includes('channel_programs'), 'normalized catalog schema'],
];
const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
console.log(`V2 API contract: ${failed.length ? 'FAILED' : 'passed'}`);
for (const label of failed) console.log(`P0 ${label}`);
if (failed.length) process.exitCode = 1;
