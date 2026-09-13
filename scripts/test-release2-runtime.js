const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(repo, 'assets', 'release2-runtime.js'), 'utf8');
const guide = fs.readFileSync(path.join(repo, 'assets', 'guide-overhaul.js'), 'utf8');
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
check(runtime.includes('guideOpenP50') && runtime.includes('guideCloseP50'), 'Guide open/close measurement exists');
check(runtime.includes('queue-sample') && runtime.includes('queueCurrent'), 'Queue depth measurement exists');
check(runtime.includes("action==='skip'") && runtime.includes('skips:'), 'Skip measurement exists');
check(runtime.includes('sourceFailures') && runtime.includes('sourceRecoveries'), 'Source failure/recovery summary exists');
check(runtime.includes('statusLabel') && runtime.includes('__rsCastIsConnected'), 'Mobile/Cast status measurement exists');
check(runtime.includes("addEventListener('online'"), 'Online recovery hook exists');
check(guide.includes('realsignal:guide-recent') && guide.includes('rsGuideRecentOnly'), 'Guide recently-watched view exists');
check(guide.includes('rsGuideRecentSort') && guide.includes('CHANNEL ORDER'), 'Guide order control exists');
check(fs.existsSync(path.join(repo, 'assets', 'source-catalog-client.js')), 'Server catalog bridge asset exists');

for (const file of builds) {
  const html = fs.readFileSync(path.join(repo, file), 'utf8');
  check(html.includes('assets/release2-runtime.js'), `${file}: Release 2 runtime loaded`);
  check(html.includes('assets/guide-overhaul.css') && html.includes('assets/guide-overhaul.js'), `${file}: shared guide overhaul assets loaded`);
  check(html.includes('rsHealthPanel') && html.includes('rsHealthFrame'), `${file}: APP HEALTH panel is present`);
  check(html.includes('currentDuration') && html.includes('guideItemRuntime(nextItem)'), `${file}: guide exposes Source Suite current/next runtime data`);
  check(html.includes('2.1.1-' + (file.includes('mobile') ? 'mobile' : 'desktop') + '.211-queue-recovery'), `${file}: build stamp is RealSignal 2.1.1 — queue recovery`);
  check(html.includes('var chanRT={timers:[],teardowns:[]};') && html.includes('chanRT.teardowns.splice(0)'), `${file}: live-channel teardown callbacks are executed`);
  check(html.includes('shipSocket.close()') && html.includes('clearTimeout(publicViewTimer)'), `${file}: Ship Tracker closes sockets and pending viewport retries on channel change`);
  const gearHeadStart = html.indexOf('"Gear Head": {');
  const gearHeadEnd = html.indexOf('\n  /* Deadline', gearHeadStart);
  const gearHead = gearHeadStart >= 0 && gearHeadEnd > gearHeadStart ? html.slice(gearHeadStart, gearHeadEnd) : '';
  check(gearHead.includes("jay leno's garage") && gearHead.includes('jay leno car show') && gearHead.includes("leno's garage"), `${file}: Gear Head prioritizes Jay Leno automotive programming`);
  check(gearHead.includes('the tonight show') && gearHead.includes('talk show') && gearHead.includes('monologue'), `${file}: Gear Head rejects Jay Leno late-night/talk-show bleed`);
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
