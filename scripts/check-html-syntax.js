const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..');
const files = ['the_dial_mobile.html', 'the_dial_desktop.html'];
const stamps = {};
let failures = 0;

for (const file of files) {
  const fullPath = path.join(repo, file);
  const html = fs.readFileSync(fullPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const stampMatches = [...html.matchAll(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/g)];

  if (stampMatches.length !== 1) {
    console.error(`${file}: expected exactly one build stamp, found ${stampMatches.length}`);
    failures++;
  } else {
    stamps[file] = stampMatches[0][1];
  }

  for (let index = 0; index < scripts.length; index++) {
    try {
      new vm.Script(scripts[index][1], { filename: `${file}:script${index}` });
    } catch (error) {
      console.error(`${file}:script${index}: ${error.message}`);
      failures++;
    }
  }

  console.log(`${file}: ${html.length} bytes, ${scripts.length} script blocks, stamp ${stamps[file] || 'INVALID'}`);
}

const mobileNumber = Number((stamps['the_dial_mobile.html'] || '').split('.').pop());
const desktopNumber = Number((stamps['the_dial_desktop.html'] || '').split('.').pop());
if (Number.isFinite(mobileNumber) && Number.isFinite(desktopNumber) && mobileNumber < desktopNumber) {
  console.error(`Build stamp regression: mobile ${mobileNumber} is behind desktop ${desktopNumber}`);
  failures++;
}

if (failures) {
  process.exitCode = 1;
} else {
  console.log('HTML syntax and build-stamp checks passed.');
}
