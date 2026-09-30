#!/usr/bin/env node
/* Guard the bounded real-client rollout for the session-aware V2 catalog. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'realsignal_api_v2_worker.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'the_dial_desktop.html'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'the_dial_mobile.html'), 'utf8');
const expectedChannels = ['12', '153', '700', '702'];
const issues = [];

const expectedSet = 'new Set(["12", "153", "700", "702"])';
if (!api.includes(expectedSet)) issues.push('API must declare the four-channel session catalog canary allow-list');
if (!api.includes('body.catalogCanary === "v2-session"') || !api.includes('IA_SESSION_CATALOG_CANARY_CHANNELS.has(String(body.channel))')) {
  issues.push('API must gate the v2-session marker to the allow-listed channels');
}
for (const [name, source] of [['desktop', desktop], ['mobile', mobile]]) {
  if (!source.includes("new URLSearchParams(location.search).get('v2catalog')==='1'")) issues.push(`${name} must require the explicit v2catalog=1 opt-in`);
  if (!source.includes("new Set(['12','153','700','702'])")) issues.push(`${name} must carry the same four-channel allow-list`);
  if (!source.includes('serverCatalog:true,catalogCanary:"v2-session"')) issues.push(`${name} must mark only opted-in pilot requests for server rotation`);
  if (!source.includes('var requestBody={...body,sessionId:iaSessionId()')) issues.push(`${name} must preserve the stable viewer session ID`);
  for (const channel of expectedChannels) {
    if (!source.includes(`'${channel}'`)) issues.push(`${name} is missing pilot channel ${channel}`);
  }
}
if (!desktop.includes('4.1.194-desktop-session-catalog-canary')) issues.push('desktop build stamp must identify the canary');
if (!mobile.includes('4.1.194-mobile-session-catalog-canary')) issues.push('mobile build stamp must identify the canary');

console.log(`Session catalog canary contract: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
