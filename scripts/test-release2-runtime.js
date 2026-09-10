const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(repo, 'assets', 'release2-runtime.js'), 'utf8');
const builds = ['the_dial_desktop.html', 'the_dial_mobile.html'];
let failures = 0;

function check(ok, message) {
  console.log(`${message}: ${ok ? 'ok' : 'FAILED'}`);
  if (!ok) failures++;
}

check(runtime.includes('window.__rsRelease2Telemetry'), 'Release 2 telemetry API exists');
check(runtime.includes('first-visible-frame'), 'First visible frame measurement exists');
check(runtime.includes('uniquePrograms') && runtime.includes("type==='repeat'"), 'Repeat and unique-program measurement exists');
check(runtime.includes('source-recovery'), 'Source recovery measurement exists');
check(runtime.includes("addEventListener('online'"), 'Online recovery hook exists');

for (const file of builds) {
  const html = fs.readFileSync(path.join(repo, file), 'utf8');
  check(html.includes('assets/release2-runtime.js'), `${file}: Release 2 runtime loaded`);
  check(html.includes('1.9.7-' + (file.includes('mobile') ? 'mobile' : 'desktop') + '.121-release2-freshness'), `${file}: build stamp is 121 freshness`);
  check(html.includes('AD_RECENT_TTL=7*24*3600e3'), `${file}: extended ad freshness ledger`);
  check(html.includes('runtime>=45*60'), `${file}: long-program ad budget`);
}

if (failures) process.exitCode = 1;
else console.log('Release 2 runtime contract passed.');
