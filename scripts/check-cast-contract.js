#!/usr/bin/env node
/* Static Chromecast wiring check. This intentionally does not call Google services in CI. */
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const issues = [];
for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  for (const [token, reason] of [
    ['cast_sender.js?loadCastFramework=1', 'must load the Google Cast sender SDK'],
    ['window.__onGCastApiAvailable', 'must register the SDK availability callback before the SDK'],
    ['urn:x-cast:com.realsignal.dial', 'must use the RealSignal receiver namespace'],
    ['function request(){', 'must expose a Cast session request'],
    ['window.__rsCastSync=sync', 'must expose live state synchronization'],
    ['castReceiverIdInput', 'must expose one-time receiver ID setup'],
    ['REALSIGNAL_STATE', 'must send a normalized receiver state packet'],
    ['A0A5CD01', 'must carry the published RealSignal receiver ID'],
    ['.015-cast-native-player', 'must carry the current Cast-native-player build stamp'],
    ['__rsCastSdkRetryCount', 'must support recovery when the Cast SDK is delayed'],
    ['rsRetry=', 'must retry a failed Cast SDK load'],
    ['display-mode: standalone', 'must diagnose Android standalone/PWA Cast limitations'],
    ['CAST_STATE_CHANGED', 'must report Cast discovery state'],
    ['NO CAST DEVICES FOUND', 'must explain a discovery failure'],
  ]) if (!source.includes(token)) issues.push(`${file}: ${reason}`);
}
const receiver = fs.readFileSync(path.join(repo, 'realsignal_cast_receiver.html'), 'utf8');
for (const token of ['cast_receiver_framework.js', 'addCustomMessageListener', 'REALSIGNAL_STATE', 'REALSIGNAL_MEDIA', 'cast-media-player', 'getPlayerManager', 'castReceiver']) if (!receiver.includes(token)) issues.push(`receiver: missing ${token}`);
const pages = fs.readFileSync(path.join(repo, '.github/workflows/pages.yml'), 'utf8');
if (!pages.includes('cp realsignal_cast_receiver.html')) issues.push('pages workflow: receiver is not published');
console.log(`cast contract: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
