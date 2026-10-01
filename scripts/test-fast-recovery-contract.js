const fs = require('fs');

const desktop = fs.readFileSync('the_dial_desktop.html', 'utf8');
const mobile = fs.readFileSync('the_dial_mobile.html', 'utf8');
const proxy = fs.readFileSync('hls_proxy_worker.js', 'utf8');

for (const [name, source] of [['desktop', desktop], ['mobile', mobile]]) {
  for (const needle of [
    'sourceAlternates=',
    'retrying alternate provider',
    'manifestNeedsUnsupportedCodec',
    'function(_,data)',
    'fastMapLimit(FAST_FEEDS,3',
    'fetchFASTFeed(feed)',
    'fastSeedCatalog(FAST_FEEDS.slice(0,6))',
    'FAST_PROVIDER_COOLDOWN_MS',
    'loadIptvCatalog()',
    'label:"FAST · VERIFIED"',
    'FreeLiveSports',
    'freelivesports.m3u',
    'HP FAST',
    'https://www.apsattv.com/hp.m3u',
    'iGoCast',
    'https://www.apsattv.com/igocast.m3u',
    'window.__tvRefreshSources(out)',
    'function tvHealthScore(e)',
    'c._healthScore',
    'tuneStartedAt=Date.now()',
    'label:"Live services"',
  ]) {
    if (!source.includes(needle)) throw new Error(`${name}: missing FAST recovery contract ${needle}`);
  }
}

for (const host of ['samsungtv.plus', 'cloudfront.net', 'akamaized.net']) {
  if (!proxy.includes(`"${host}"`)) throw new Error(`HLS proxy: missing approved FAST host ${host}`);
}

console.log('FAST recovery contract: passed');
