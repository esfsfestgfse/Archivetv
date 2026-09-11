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
  check(html.includes('1.9.7-' + (file.includes('mobile') ? 'mobile' : 'desktop') + '.140-ia-depth-fallback'), `${file}: build stamp is 140 IA depth fallback`);
  check(/var onAirById=\{\};[\s\S]*?if\(e\)\{ onAirById\[String\(id\)\]=e; \}/.test(html), `${file}: sports EPG live-now index is populated before sorting`);
  check(html.includes('var queuePending=refillIAQueue(ch,sl,1)'), `${file}: active IA tune requests one candidate first`);
  check(html.includes('var IA_READY_TARGET=3'), `${file}: rolling IA shelf keeps one active plus two hot replacements`);
  check(html.includes('followCount=ask===1?IA_READY_TARGET:ask'), `${file}: IA refill promotes exactly two replacements after the active item`);
  check(html.includes('iaProgramQueues[k].length<IA_READY_TARGET'), `${file}: IA background refill uses the rolling shelf target`);
  check(html.includes('setTimeout(function(){if(powered)primeIAQueues();},12000)'), `${file}: broad IA warmup is deferred`);
  check(html.includes('all=all.filter(function(c){return c.num!==curNum;}).slice(0,8)'), `${file}: background warmup excludes active channel`);
  check(html.includes('q.slice(0,limit===undefined?5:Math.max(0,Number(limit)||0))'), `${file}: IA media resolver fan-out is bounded`);
  check(html.includes('ask===1?1:((typeof curNum!=="undefined"&&ch.num===curNum)?2:1)'), `${file}: active IA gets priority over companion media warmup`);
  check(html.includes('realsignal-api.tdy1990.workers.dev/api/v2'), `${file}: IA queue uses the V2 API boundary`);
  check(html.includes('function iaQueueFetch(body)'), `${file}: IA queue keeps a direct-relay fallback`);
  check(html.includes('inlinePrimary=inlineUrls.find(function(u){return /archive\\.org\\/download\\//i.test(String(u));})'), `${file}: stable Archive download URL is preferred for inline queue media`);
  check(html.includes('AD_RECENT_TTL=7*24*3600e3'), `${file}: extended ad freshness ledger`);
  check(html.includes('runtime>=45*60'), `${file}: long-program ad budget`);
}

if (failures) process.exitCode = 1;
else console.log('Release 2 runtime contract passed.');
