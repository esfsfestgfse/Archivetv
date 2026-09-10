const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.ok(source.includes('if(!isAudio&&!(v.videoWidth>0))'), file + ': video channels must reject audio-only derivatives');
  assert.ok(source.includes('else fin(false);'), file + ': pictureless playback must fall through to recovery');
  assert.ok(source.includes('while(adQueue>0&&attempts<4)'), file + ': a failed ad candidate must permit bounded recovery candidates');
  console.log(file + ': video-frame guard passed');
}
