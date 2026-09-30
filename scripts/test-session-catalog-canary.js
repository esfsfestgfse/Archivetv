#!/usr/bin/env node
/* Guard the explicit full-IA browser canary for the session-aware V2 catalog. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'realsignal_api_v2_worker.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'the_dial_desktop.html'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'the_dial_mobile.html'), 'utf8');
const issues = [];

const backendAllowlist = api.match(/const IA_SESSION_CATALOG_CANARY_CHANNELS = new Set\(\[([\s\S]*?)\]\);/);
const backendChannelCount = backendAllowlist ? new Set([...backendAllowlist[1].matchAll(/"(\d+)"/g)].map(match => match[1])).size : 0;
if (backendChannelCount < 171) issues.push(`API must declare the full IA backend certification allow-list (found ${backendChannelCount})`);
if (!api.includes('body.catalogCanary === "v2-session"') || !api.includes('IA_SESSION_CATALOG_CANARY_CHANNELS.has(String(body.channel))')) {
  issues.push('API must gate the v2-session marker to the allow-listed channels');
}
for (const [name, source] of [['desktop', desktop], ['mobile', mobile]]) {
  if (!source.includes("new URLSearchParams(location.search).get('v2catalog')==='1'")) issues.push(`${name} must require the explicit v2catalog=1 opt-in`);
  if (!source.includes("new URLSearchParams(location.search).get('api')==='canary'")) issues.push(`${name} must support the explicit isolated canary API selector`);
  if (!source.includes('realsignal-api-canary.tdy1990.workers.dev/api/')) issues.push(`${name} must point the canary selector only at the isolated API Worker`);
  const clientAllowlist = source.match(/var RS_V2_CATALOG_CANARY_CHANNELS=new Set\(\[([\s\S]*?)\]\);/);
  const clientChannelCount = clientAllowlist ? new Set([...clientAllowlist[1].matchAll(/'([0-9]+)'/g)].map(match => match[1])).size : 0;
  if (clientChannelCount < 179) issues.push(`${name} must carry the full certified IA allow-list (found ${clientChannelCount})`);
  if (!source.includes('serverCatalog:true,catalogCanary:"v2-session"')) issues.push(`${name} must mark only opted-in pilot requests for server rotation`);
  if (!source.includes('var requestBody={...body,sessionId:iaSessionId()')) issues.push(`${name} must preserve the stable viewer session ID`);
}
if (!desktop.includes('4.1.198-desktop-session-catalog-full')) issues.push('desktop build stamp must identify the full canary');
if (!mobile.includes('4.1.198-mobile-session-catalog-full')) issues.push('mobile build stamp must identify the full canary');

console.log(`Session catalog canary contract: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
