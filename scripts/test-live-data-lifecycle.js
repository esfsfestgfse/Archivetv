const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
async function test(file) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
  const solar = html.slice(html.indexOf('async function tuneSolar('), html.indexOf('async function tuneQuakeMap('));
  const stats = solar.slice(solar.indexOf('  async function fetchStats()'), solar.indexOf('  rotateImg(); await fetchStats();'));
  const tail = solar.slice(solar.indexOf('  rotateImg(); await fetchStats();'), solar.indexOf('\n}\n', solar.indexOf('  rotateImg(); await fetchStats();')));
  for (const outcome of ['success', 'failure']) {
    const pending = deferred();
    const panel = { innerHTML: 'NEW CHANNEL', textContent: 'NEW CHANNEL' };
    const context = vm.createContext({
      my: 1, token: 1, powered: true, solarBug: null, ch: {num: 973},
      fetchJSONResilient: () => pending.promise,
      document: { getElementById: () => panel },
      xrayClass: () => ({letter: 'A', number: '1', risk: 'quiet'}),
      setChanStatus() {}, nlog() {}, esch: String,
    });
    vm.runInContext(stats, context);
    const job = context.fetchStats();
    context.token = 2;
    if (outcome === 'success') pending.resolve([]); else pending.reject(new Error('offline'));
    await job;
    assert.equal(panel.innerHTML, 'NEW CHANNEL', file + ': solar late ' + outcome + ' changed new panel');
    assert.equal(panel.textContent, 'NEW CHANNEL', file + ': solar late ' + outcome + ' changed new labels');
  }
  // Finish the X-ray request, then switch away while a secondary feed waits.
  {
    const pending = deferred(), secondary = deferred();
    const panel = { innerHTML: 'NEW CHANNEL', textContent: '' };
    let calls = 0;
    const context = vm.createContext({my:1, token:1, powered:true, solarBug:null, ch:{num:973},
      fetchJSONResilient: () => ++calls === 1 ? pending.promise : secondary.promise,
      document:{getElementById:()=>panel}, xrayClass:()=>({letter:'A',number:'1',risk:'quiet'}),
      setChanStatus(){}, nlog(){}, esch:String});
    vm.runInContext(stats, context);
    const job = context.fetchStats();
    pending.resolve([]);
    await new Promise(resolve => setImmediate(resolve));
    context.token = 2; panel.textContent = 'NEW CHANNEL';
    secondary.resolve([]);
    await job;
    assert.equal(panel.innerHTML, 'NEW CHANNEL', file + ': solar secondary response changed new channel');
  }
  {
    const pending = deferred(); let timers = 0;
    const context = vm.createContext({my:1, token:1, powered:true, rotateImg(){},
      fetchStats:()=>pending.promise, rtInterval:()=>++timers, chanRT:{}, clearInterval(){}});
    const job = vm.runInContext('(async function(){' + tail + '})()', context);
    context.token = 2; pending.resolve(); await job;
    assert.equal(timers, 0, file + ': solar restarted timers after leaving');
  }
  {
    const pending = deferred(); let timers = 0;
    const panel = {innerHTML:'', textContent:'NEW CHANNEL'};
    const fn = html.slice(html.indexOf('async function tuneHometown('), html.indexOf('var STATE_NAMES='));
    const context = vm.createContext({token:1, powered:true, screenArea:{},
      hideOv(){}, setSig(){}, showNow(){}, startIAJazz(){}, nlog(){}, $:()=>panel,
      getWxLocation:async()=>({lat:31.55,lon:-97.15}), resolveLocale:async()=>({city:'Waco'}),
      homeLoc:{}, store:{get:()=>({at:Date.now(),arts:[{title:'Waco'}]})},
      fetchJSONResilient:()=>pending.promise, rtInterval:()=>++timers});
    vm.runInContext(fn, context);
    const job = context.tuneHometown({}, {}, 1);
    await new Promise(resolve => setImmediate(resolve));
    context.token = 2; panel.textContent = 'NEW CHANNEL';
    pending.reject(new Error('offline')); await job;
    assert.equal(panel.textContent, 'NEW CHANNEL', file + ': hometown late error changed new labels');
    assert.equal(timers, 0, file + ': hometown restarted timers after leaving');
  }
  console.log(file + ': delayed feed/channel-change tests passed');
}
(async () => { for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) await test(file); })()
  .catch(error => {console.error(error); process.exitCode = 1;});
