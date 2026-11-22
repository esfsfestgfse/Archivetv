const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
const Sports=require('../assets/sports-programs.js');
for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
 test(file+': native sports recovery uses the backup identity and private playback controls',async()=>{
  const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');
  const start=s.indexOf('function playFile('),end=s.indexOf('function playFileOnce(');assert.ok(end>start,'shared sports playback facade must exist');
  const calls=[],c={window:{RealSignalSports:Sports},token:7,powered:true,curNum:54,iaCachedProgramAllowed:()=>true,nlog(){},refreshGuideData(){},
   playFileOnce:async(item,ch,sl,my,fallback,control)=>{calls.push({item,control});return item.id==='backup';}};
  vm.createContext(c);vm.runInContext(s.slice(start,end),c);
  const row={id:'primary',title:'Daytona 500 1990 Full Race',type:'video',url:'https://archive.org/download/primary/race.mp4',runtime:7200,
   sportsCopies:[{identifier:'backup',title:'Daytona 500 — Full Broadcast (1990)',runtime:7200,recoveryVerified:true,subject:'NASCAR',media:{type:'video',url:'https://archive.org/download/backup/race.mp4',runtime:7200,width:640,height:480}}]};
  assert.equal(await c.playFile(row,{num:54},{},7,0),true);assert.deepEqual(calls.map(x=>x.item.id),['primary','backup']);
  assert.equal(calls[1].item.url,row.url);assert.equal(row.id,'backup');assert.equal(row.title,'Daytona 500 — Full Broadcast (1990)');
  assert.equal(calls[1].item.meta.recoveryVerified,true);assert.equal(typeof calls[1].control.onFailure,'function');
 });
 test(file+': Cast handoff bypasses local sports recovery',async()=>{
  const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),start=s.indexOf('function playFile('),end=s.indexOf('function playFileOnce(');assert.ok(end>start);
  let calls=0;const c={window:{RealSignalSports:Sports,__rsCastIsConnected:()=>true},playFileOnce:async()=>{calls++;return true;}};
  vm.createContext(c);vm.runInContext(s.slice(start,end),c);assert.equal(await c.playFile({id:'one',url:'https://archive.org/one'}, {num:54},{},7,0),true);assert.equal(calls,1);
 });
 test(file+': receiver playback remains owned by its existing Cast transport',async()=>{
  const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),start=s.indexOf('function playFile('),end=s.indexOf('function playFileOnce(');assert.ok(end>start);
  let control;const c={window:{RealSignalSports:Sports},document:{body:{classList:{contains:()=>true}}},token:7,powered:true,curNum:54,iaCachedProgramAllowed:()=>true,
   playFileOnce:async(item,ch,sl,my,fallback,options)=>{control=options;return true;}};
  vm.createContext(c);vm.runInContext(s.slice(start,end),c);assert.equal(await c.playFile({id:'one',title:'Daytona 500 1990 Full Race',type:'video',url:'https://archive.org/download/one/race.mp4'}, {num:54},{},7,0),true);assert.equal(control,undefined);
 });
 test(file+': a stalled sports file hands failure to its event recovery owner',()=>{
  const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),handlers={};let timer,recovered=0,retries=0;
  const video={currentTime:120,duration:7200,load(){this.currentTime=0;},addEventListener:(type,fn)=>{(handlers[type]||=[]).push(fn);},removeEventListener(){}};
  const control={onFailure:at=>{assert.equal(at,120);recovered++;}};
  const c={token:7,powered:true,curVideo:video,curNum:54,clearStall(){},showBuffer(){},byNum:()=>({num:54}),iaRetry(){retries++;},setTimeout:fn=>{timer=fn;return 1;},v:video,sig:{},done:true,it:{},my:7,nlog(){},tryAlternate:()=>false,sportsControl:control};
  vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function armStall('),s.indexOf('function clearStall(')),c);
  const start=s.indexOf('v.addEventListener("error",()=>',s.indexOf('function playFileOnce(')),end=s.indexOf('},{signal:sig});',start)+17;
  vm.runInContext(s.slice(start,end),c);
  c.armStall(7,control);timer();handlers.error.forEach(fn=>fn());assert.equal(recovered,1);assert.equal(retries,0);
 });
}

for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
 test(file+': a restored IA shelf preserves program identity through actual sports playback',async()=>{
  const source=fs.readFileSync(file,'utf8'),identifier='archery-tactics-for-deer-full-vhs::Archery Tactics For Deer MP4.mp4';
  const item={identifier,title:'Archery Tactics For Deer',year:1990,sourceIdentifier:'archery-tactics-for-deer-full-vhs',fileName:'Archery Tactics For Deer MP4.mp4',subject:'archery field sport',sportsCopies:[{identifier:'backup'}],media:{type:'video',url:'https://dn600308.us.archive.org/0/items/archery-tactics-for-deer-full-vhs/Archery%20Tactics%20For%20Deer%20MP4.mp4',runtime:1695,width:640,height:480}};
  let played;
  const c={iaReadyShelves:{'65':{at:Date.now(),items:[item]}},iaReadyShelfKey:ch=>String(ch.num),IA_READY_SHELF_TTL:86400000,iaReadyShelfAllowed:()=>true,iaProgramMedia:{},iaProgramQueues:{},store:{set(){}},window:{RealSignalSports:Sports},token:9,powered:true,curNum:65,iaCachedProgramAllowed:()=>true,playFileOnce:async value=>{played=value;return true;}};
  vm.createContext(c);const start=source.indexOf('function iaReadyShelfRestore('),end=source.indexOf('/* A catalog hit is not necessarily',start);assert.ok(end>start);vm.runInContext(source.slice(start,end),c);c.iaReadyShelfRestore({num:65},{channel:65});
  const media=c.iaProgramMedia[identifier];assert.equal(media.id,identifier,'URL-only restoration makes Skip omit its history write');assert.equal(media.meta.identifier,identifier);assert.equal(media.meta.fileName,item.fileName);assert.equal(media.title,item.title);assert.equal(media.meta.sportsCopies.length,1);
  vm.runInContext(source.slice(source.indexOf('function playFile('),source.indexOf('function playFileOnce(')),c);assert.equal(await c.playFile(media,{num:65},{channel:65},9,0),true);assert.equal(played.id,identifier);assert.equal(played.meta.identifier,identifier);
 });
}

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': an unlisted Sports Vault event shares a single start deadline across routes', async () => {
  const source = fs.readFileSync(file, 'utf8');
  const calls = [];
  let now = 0;
  const scope = { window: { RealSignalSports: Sports }, token: 7, powered: true, curNum: 53,
    performance: { now: () => now }, iaCachedProgramAllowed: () => true, nlog() {},
    async playFileOnce(item, ch, sl, token, fallback, control) {
      calls.push(control.startTimeout);
      now += control.startTimeout || 4000;
      return false;
    } };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function playFile('), source.indexOf('function playFileOnce(')), scope);
  const program = { id: 'event', type: 'video', title: '1989 NHL All Star Game Full Game',
    url: 'https://ia800100.us.archive.org/0/items/event/game.mp4',
    alts: ['https://archive.org/download/event/game.mp4', 'https://ia800101.us.archive.org/0/items/event/game.mp4'] };
  assert.equal(await scope.playFile(program, { num: 53 }, {}, 7, 0, { allowBuffered: true }), false);
  assert.deepEqual(calls, [2500, 1000], 'three URLs cannot spend three full startup windows');
  now = 0; calls.length = 0;
  assert.equal(await scope.playFile(program, { num: 53 }, {}, 7, 0, { listed: true }), false);
  assert.deepEqual(calls, [undefined, undefined, undefined], 'a listed game keeps its same-event recovery budget');
});

function sportsDesk(file, dependencies = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const nodes = {};
  let tab, mode, day, clock = Date.parse('2026-11-22T18:00:00Z');
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
    getFullYear() { return this.getUTCFullYear(); }
    getMonth() { return this.getUTCMonth(); }
    getDate() { return this.getUTCDate(); }
    setDate(day) { return this.setUTCDate(day); }
  }
  function node(handler) {
    return { innerHTML: '', value: '', textContent: '',
      addEventListener(type, callback) { this[type] = callback; },
      querySelectorAll(selector) { return handler?.(selector) || []; }
    };
  }
  function control(dataset, callback) {
    return { dataset, classList: { toggle() {} }, addEventListener(_, fn) { callback(fn); } };
  }
  nodes.sportsPicker = node();
  nodes.sportsSubPicker = node(() => ['today', 'livetv', 'scores'].map(sv =>
    control({ sv }, fn => { (tab ||= {})[sv] = fn; })));
  nodes.sportsBody = node(selector => {
    if (selector === '[data-day]') return [-1, 0, 1].map(value =>
      control({ day: value }, fn => { (day ||= {})[value] = fn; }));
    if (selector === '[data-sports-live-mode]') return ['healthy', 'live'].map(value =>
      control({ sportsLiveMode: value }, fn => { (mode ||= {})[value] = fn; }));
    return [];
  });
  for (const id of ['sportsRefreshBtn', 'sportsLiveList', 'sportsLiveSearch', 'sportsLiveCount']) nodes[id] = node();
  nodes.sportsRefreshBtn.classList = { add() {}, remove() {} };
  const timers = new Map();
  let timerId = 0;
  const feeds = [
    { name: 'Arena One', tvgId: 'one', verified: true },
    { name: 'Arena Two', tvgId: 'two', checked: true }
  ];
  const scope = {
    window: {}, token: 1, sportsSubView: 'scores', sportsTimer: null, SPORTS_LIST: [
      { k: 'a', label: 'ALPHA', cat: 'Team', espn: 'football/a' },
      { k: 'b', label: 'BETA', cat: 'Team', espn: 'baseball/b' }
    ],
    Date: FixtureDate, AbortController, screenArea: {}, $: id => nodes[id],
    clearInterval() {}, rtInterval() {}, hideOv() {}, setSig() {}, showNow() {},
    nlog() {}, esch: String, ensureTVCSS() {}, stopTVPlayback() {},
    mergeTVChannels: items => items.slice(), sortByHealthThenName: items => items,
    cullDead: list => ({ list }), sportsTVChannels: items => items,
    fetchSportsData: async () => ({ events: [] }), fetchSportsIPTV: async () => feeds,
    setTimeout(fn, ms) { timers.set(++timerId, { fn, at: clock + ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    ...dependencies
  };
  vm.createContext(scope);
  for (const [start, end] of [['function withTO(', 'function fetchJSON('],
    ['var epgNow=', 'async function fetchSportsIPTV('], ['async function tuneSports(', '/* Public WebSDR']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), scope);
  }
  scope.tuneSports({ num: 50 }, {}, 1);
  return {
    body: nodes.sportsBody, list: nodes.sportsLiveList, count: nodes.sportsLiveCount, scope,
    tab: value => tab[value](), mode: value => mode[value](), day: value => day[value](),
    tick(ms) {
      clock += ms;
      for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    }
  };
}

const flushSports = () => new Promise(setImmediate);
const sportsEvent = (name, date = '2026-11-22T19:00:00Z') => ({
  name, date, status: { type: { state: 'pre' } }
});
function epgProgramme(id, start, stop, title = 'Live Match') {
  return '<programme channel="' + id + '" start="' + start + ' +0000" stop="' + stop +
    ' +0000"><title>' + title + '</title></programme>';
}
const currentProgramme = id => epgProgramme(id, '20261122170000', '20261122190000');
const expiredProgramme = id => epgProgramme(id, '20261119170000', '20261119190000');
const gapProgrammes = id => epgProgramme(id, '20261122150000', '20261122160000') +
  epgProgramme(id, '20261122200000', '20261122210000');
const guideResponse = programmes => ({ ok: true, text: async () => '<tv>' + programmes + '</tv>' });

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  test(file + ': On Today identifies fresh events, confirmed empty, partial, stale and failed feeds', async () => {
    for (const [alpha, beta, expected, absent] of [
      [{ events: [sportsEvent('Fresh Match')] }, { events: [] }, /Fresh Match/, /Partial schedule/],
      [{ events: [] }, { events: [] }, /Nothing scheduled today/],
      [{ events: [sportsEvent('Fresh Match')] }, Error('offline'), /Partial schedule[\s\S]*Fresh Match/, /Nothing scheduled/],
      [{ events: [] }, Error('offline'), /Schedule unavailable/, /Nothing scheduled/],
      [{ day: { date: '2026-11-19' }, events: [] }, { events: [sportsEvent('Stale Match', '2026-11-19T19:00:00Z')] }, /Schedule unavailable[\s\S]*out of date/, /Nothing scheduled|Stale Match/],
      [Error('offline'), {}, /Schedule unavailable/, /Nothing scheduled/]
    ]) {
      const desk = sportsDesk(file, { async fetchSportsData(url) {
        const value = url.includes('football/a') ? alpha : beta;
        if (value instanceof Error) throw value;
        return value;
      } });
      desk.tab('today');
      assert.match(desk.body.innerHTML, /Loading/);
      await flushSports();
      assert.match(desk.body.innerHTML, expected);
      if (absent) assert.doesNotMatch(desk.body.innerHTML, absent);
    }
  });

  test(file + ': On Today has a 10s deadline, preserves partial results and ignores prior dates', async () => {
    let finishLate, signal;
    const desk = sportsDesk(file, { async fetchSportsData(url, tag, requestSignal) {
      if (tag !== 'today') return { events: [] };
      if (url.endsWith('dates=20261123')) return { events: [sportsEvent('Tomorrow Match', '2026-11-23T19:00:00Z')] };
      if (url.includes('football/a')) return { events: [sportsEvent('Today Match')] };
      signal = requestSignal;
      return new Promise(resolve => { finishLate = resolve; });
    } });
    desk.tab('today');
    await flushSports();
    desk.tick(9999);
    assert.match(desk.body.innerHTML, /Loading/);
    desk.tick(1);
    await flushSports();
    assert.match(desk.body.innerHTML, /Partial schedule[\s\S]*timed out[\s\S]*Today Match/);
    assert.equal(signal.aborted, true);
    desk.day(1);
    await flushSports();
    finishLate({ events: [sportsEvent('Late Today')] });
    await flushSports();
    assert.match(desk.body.innerHTML, /Tomorrow Match/);
    assert.doesNotMatch(desk.body.innerHTML, /Today Match|Late Today/);

    const offline = sportsDesk(file, { fetchSportsData: () => new Promise(() => {}) });
    offline.tab('today');
    offline.tick(10000);
    await flushSports();
    assert.match(offline.body.innerHTML, /Schedule unavailable[\s\S]*timed out/);

    let finishYesterday;
    const switched = sportsDesk(file, { async fetchSportsData(url, tag) {
      if (tag !== 'today') return { events: [] };
      if (url.endsWith('dates=20261121')) return new Promise(resolve => { finishYesterday = resolve; });
      return { events: [sportsEvent('Current Match')] };
    } });
    switched.tab('today');
    switched.day(-1);
    switched.day(0);
    finishYesterday({ events: [sportsEvent('Yesterday Match', '2026-11-21T19:00:00Z')] });
    await flushSports();
    assert.match(switched.body.innerHTML, /Current Match/);
    assert.doesNotMatch(switched.body.innerHTML, /Yesterday Match/);
  });

  test(file + ': Live Now separates current, empty, partial, expired and failed XMLTV coverage', async () => {
    for (const [response, expected, absent] of [
      [guideResponse(currentProgramme('one') + currentProgramme('two')), /Live Match/, /Partial guide coverage/],
      [guideResponse(gapProgrammes('one') + gapProgrammes('two')), /No verified live programming/, /unavailable|Partial guide coverage/],
      [guideResponse(currentProgramme('one') + expiredProgramme('two')), /Partial guide coverage[\s\S]*Arena One/, /Arena Two/],
      [guideResponse(gapProgrammes('one') + expiredProgramme('two')), /Partial guide coverage/, /No verified live programming/],
      [guideResponse(currentProgramme('other')), /Live Now unavailable[\s\S]*sports guide coverage/, /No verified live programming/],
      [guideResponse(expiredProgramme('one') + expiredProgramme('two')), /Live Now unavailable[\s\S]*expired/, /No verified live programming/],
      [{ ok: false, status: 503, text: async () => '' }, /Live Now unavailable/, /No verified live programming/]
    ]) {
      const desk = sportsDesk(file, { fetch: async () => response });
      desk.tab('livetv');
      await flushSports();
      desk.mode('live');
      assert.match(desk.list.innerHTML, expected);
      if (absent) assert.doesNotMatch(desk.list.innerHTML, absent);
      if (expected.source === "Live Match") {
        desk.tick(3600000);
        assert.match(desk.list.innerHTML, /Guide coverage has expired/);
        assert.doesNotMatch(desk.list.innerHTML, /Live Match/);
      }
      desk.mode('healthy');
      assert.match(desk.list.innerHTML, /Arena One[\s\S]*Arena Two/);
    }
  });

  test(file + ': Live Now keeps healthy feeds available while loading or timed out and ignores late XMLTV', async () => {
    let finishLate;
    const desk = sportsDesk(file, { fetch: () => new Promise(resolve => { finishLate = resolve; }) });
    desk.tab('livetv');
    await flushSports();
    assert.match(desk.list.innerHTML, /Arena One/);
    desk.mode('live');
    assert.match(desk.list.innerHTML, /Loading/);
    desk.tick(10000);
    await flushSports();
    assert.match(desk.list.innerHTML, /Live Now unavailable[\s\S]*timed out/);
    finishLate(guideResponse(currentProgramme('one') + currentProgramme('two')));
    await flushSports();
    assert.match(desk.list.innerHTML, /Live Now unavailable[\s\S]*timed out/);
    desk.mode('healthy');
    assert.match(desk.list.innerHTML, /Arena One[\s\S]*Arena Two/);
  });
}
