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
  ]) {
    if (!source.includes(needle)) throw new Error(`${name}: missing FAST recovery contract ${needle}`);
  }
}

for (const host of ['samsungtv.plus', 'cloudfront.net', 'akamaized.net']) {
  if (!proxy.includes(`"${host}"`)) throw new Error(`HLS proxy: missing approved FAST host ${host}`);
}

console.log('FAST recovery contract: passed');
