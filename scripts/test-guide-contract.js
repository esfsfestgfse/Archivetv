const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const asset = path.join(root, 'assets/guide-contract.js');
const contract = fs.existsSync(asset) ? require(asset) : {};
const channel = { num: 150, key: 'classic-cartoons', nm: 'Classic Cartoons' };
const a = { identifier: 'collection::a.mp4', title: 'Cartoon A', media: { url: 'https://example.org/a.mp4', runtime: 420 }, provider: 'Internet Archive' };
const b = { identifier: 'collection::b.mp4', title: 'Cartoon B', media: { url: 'https://example.org/b.mp4', runtime: 600 } };
const c = { identifier: 'other::c.mp4', title: 'Cartoon C', media: { url: 'https://example.org/c.mp4' } };
function select(input = {}) {
  assert.equal(typeof contract.select, 'function', 'shared guide selector must exist');
  return contract.select({ channel, powered: true, capacity: 3, ...input });
}

test('actual playback wins over a stale catalog and keeps exact file identity', () => {
  const result = select({ current: { ...a, ch: 150 }, queue: [b, c] });
  assert.equal(result.current.id, 'collection::a.mp4');
  assert.equal(result.current.title, 'Cartoon A');
  assert.equal(result.next.id, 'collection::b.mp4');
  assert.equal(result.later.id, 'other::c.mp4');
  assert.equal(result.ready, 3);
  assert.equal(result.state, 'playing');
});

test('previous-channel playback cannot be shown as the new channel current', () => {
  const result = select({ current: { ...a, ch: 11 }, queue: [b] });
  assert.equal(result.current, null);
  assert.equal(result.state, 'ready');
  assert.equal(result.next.title, 'Cartoon B');
  assert.match(contract.listing(result).now, /^UP NEXT · Cartoon B/);
});

test('unresolved metadata and duplicate/current records cannot fill the ready shelf', () => {
  const result = select({ current: { ...a, ch: 150 }, queue: [a, { ...b, media: null }, b, b, c] });
  assert.equal(result.ready, 3);
  assert.equal(result.next.id, 'collection::b.mp4');
  assert.equal(result.later.id, 'other::c.mp4');
});

test('different episodes retain independent identities despite the same display title', () => {
  const result = select({ queue: [a, { ...b, title: a.title }] });
  assert.equal(result.next.id, 'collection::a.mp4');
  assert.equal(result.later.id, 'collection::b.mp4');
});

test('filenames with repeated whitespace remain exact and cannot collapse into one program', () => {
  const result = select({ queue: [{ ...a, identifier: 'series::Episode  1.mp4' }, { ...b, identifier: 'series::Episode 1.mp4' }] });
  assert.equal(result.next.id, 'series::Episode  1.mp4');
  assert.equal(result.later.id, 'series::Episode 1.mp4');
  assert.equal(result.ready, 2);
});

test('a one-item catalog does not advertise its current program as Next', () => {
  const result = select({ current: { ...a, ch: 150 }, queue: [a] });
  assert.equal(result.next, null);
  assert.equal(result.ready, 1);
  assert.match(contract.listing(result).next, /PROGRAM INFORMATION PENDING/);
});

test('a live TV station name does not invent a provider schedule', () => {
  const result = select({ channel: { num: 300, nm: 'Live TV', source: 'livetv' }, live: { now: 'PBS Nature', source: 'FAST' } });
  assert.equal(result.live, true);
  assert.equal(result.current.title, 'PBS Nature');
  assert.equal(result.next, null);
  assert.equal(result.ready, null);
  assert.equal(result.remainingSeconds, null);
  assert.match(contract.listing(result).next, /PROGRAM INFORMATION UNAVAILABLE/);
});

test('weather and radio describe their live service without fake episodes', () => {
  for (const [source, title] of [['weather', 'Current conditions & forecast'], ['liveradio', 'Station directory'], ['sports', 'Scores & live coverage']]) {
    const result = select({ channel: { num: 950, nm: source, source } });
    assert.equal(result.current.title, title);
    assert.equal(result.next, null);
  }
});

test('powered-off snapshots expose standby instead of stale playback', () => {
  const result = select({ powered: false, current: { ...a, ch: 150 }, queue: [b] });
  assert.equal(result.current, null);
  assert.equal(result.next, null);
  assert.equal(result.ready, 0);
  assert.equal(result.state, 'standby');
});

test('unknown or invalid durations and playheads remain unknown', () => {
  for (const duration of [null, '', -1, Infinity, NaN, true, 'PT10M']) {
    const result = select({ current: { ...a, media: null, duration, ch: 150 }, position: { currentTime: 10 } });
    assert.equal(result.current.durationSeconds, null);
    assert.equal(result.remainingSeconds, null);
  }
  for (const time of [null, '', -1, Infinity, NaN, true, 999]) {
    assert.equal(select({ current: { ...a, ch: 150 }, position: { currentTime: time } }).remainingSeconds, null);
  }
});

test('remaining time uses the real matching playhead and preserves zero at the end', () => {
  assert.equal(select({ current: { ...a, ch: 150 }, position: { currentTime: 120 } }).remainingSeconds, 300);
  assert.equal(select({ current: { ...a, ch: 150 }, position: { currentTime: 420 } }).remainingSeconds, 0);
  assert.equal(select({ queue: [a], position: { currentTime: 120 } }).remainingSeconds, null);
});

test('snapshots do not mutate queue, source cursor, media, or program records', () => {
  const input = { current: { ...a, ch: 150 }, queue: [a, b, c], cursor: 2 };
  const before = JSON.stringify(input);
  const snapshot = select(input);
  snapshot.next.title = 'Changed copy';
  assert.equal(JSON.stringify(input), before);
});

test('an empty or missing channel returns a usable pending/standby result', () => {
  const pending = select();
  assert.equal(pending.state, 'pending');
  assert.equal(pending.ready, 0);
  assert.match(contract.listing(pending).now, /PROGRAM INFORMATION PENDING/);
  assert.equal(select({ channel: null }).state, 'standby');
});

function browserAdapter(file, search = '?v6=1') {
  const html = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const match = html.match(/function guidePlaybackSnapshot\(ch(?:,viewing)?\)\{[\s\S]*?\n\}\n/);
  assert.ok(match, 'HTML must expose its real read-only playback adapter');
  const calls = [];
  const context = {
    URLSearchParams, location: { search }, RealSignalGuideContract: contract, powered: true, curNum: 150,
    curItem: { ...a, id: a.identifier, ch: 150 }, curVideo: { currentTime: 100, duration: 420 }, IA_READY_TARGET: 3,
    iaProgramQueues: { '150': [a, b, c] }, iaProgramMedia: { [a.identifier]: a.media, [b.identifier]: b.media },
    iaProgramFailures: {}, iaProgramPendingAt: {}, iaMediaWarmers: {},
    iaPendingTooLong: () => false, iaMediaWarmKey: (ch, item) => String(ch.num) + ':' + item.identifier,
    liveGuideState: {}, __chanStatus: {}, __v2PreviewState: {},
    V2_PREVIEW_PROFILES: { example: { name: 'Example' } },
    iaRepairEnabled: () => false, iaQueueKey: ch => String(ch.num), slotFor: () => ({}), iaProgramAllowed: () => true, iaSkipBlocked: () => false, iaCachedProgramAllowed: () => true, iaDisplayTitle: row => row.title,
    v2NextFreshIndex: (profile, state, currentId) => { state.cursor = 999; return state.items.findIndex(item => item.id !== currentId); },
    v2FreshCursor: (profile, state) => { state.currentTitle = ''; return Number(state.cursor) < state.items.length ? state.cursor : 0; },
    byNum: n => Number(n) === 150 ? channel : null,
    tuneNum: n => { calls.push(['tune', n]); return n; }, skipOne: () => calls.push(['next']),
    openGuide: () => calls.push(['open']), closeGuide: () => calls.push(['close']),
    togglePower: () => calls.push(['power']), toggleInfo: () => calls.push(['info']), toggleOsd: () => calls.push(['menu']),
    fetch: () => { throw Error('snapshot attempted discovery'); }
  };
  context.window = context;
  vm.createContext(context);
  actualFunctions(file, context, ['iaLegacyHandoffMedia']);
  vm.runInContext(match[0], context);
  const bridge = path.join(root, 'assets/guide-contract-client.js');
  assert.ok(fs.existsSync(bridge), 'shared presentation adapter must exist');
  vm.runInContext(fs.readFileSync(bridge, 'utf8'), context);
  return { context, calls, api: context.RealSignalPresentation };
}
function actualFunctions(file, context, names) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  for (const name of names) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'actual function exists: ' + name);
    const lineEnd = source.indexOf('\n', start);
    const end = source.slice(start, lineEnd).endsWith('}') ? lineEnd : source.indexOf('\nfunction ', lineEnd);
    vm.runInContext(source.slice(start, end), context);
  }
}
test('directory uses canonical identities, category ordering and existing favorites/recent without discovery', () => {
  const { api, context, calls } = browserAdapter('the_dial_desktop.html');
  const rows = [{ num: 226, key: 'doc', nm: 'Documentary', cat: 'DOC' },
    { num: 21, key: 'alias', nm: 'Old Court', cat: 'TV' }, { num: 20, key: 'court', nm: 'Courtroom', cat: 'TV' }];
  context.publicLineupChannels = () => rows;
  context.isHiddenConsolidatedMember = ch => ch.num === 21;
  context.GUIDE_CATEGORIES = [{ id: 'all', label: 'All channels' }, { id: 'tv', label: 'TV' }, { id: 'doc', label: 'Archive' }];
  context.guideCategoryFor = ch => context.GUIDE_CATEGORIES[ch.cat === 'TV' ? 1 : 2];
  context.canonicalChannelLabel = ch => ch.num === 20 ? 'Courtroom TV' : ch.nm;
  context.CHANNEL_META = { Documentary: { desc: 'Full documentaries' } };
  context.isFav = num => num === 226;
  context.store = { get: (key, fallback) => key === 'realsignal:guide-recent' ? ['226', '20'] : fallback };
  const before = JSON.stringify(rows), result = api.directory();
  assert.deepEqual(Array.from(result, x => [x.number, x.name, x.categoryId, x.favorite, x.recentIndex]),
    [[20, 'Courtroom TV', 'tv', false, 1], [226, 'Documentary', 'doc', true, 0]]);
  assert.equal(result[1].description, 'Full documentaries');
  result[0].name = 'changed';
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(Array.from(api.categories(), x => x.id), ['all', 'tv', 'doc']);
  assert.deepEqual(calls, []);
});

test('favorite command resolves its latest owner and preserves its target channel', () => {
  const { api, context, calls } = browserAdapter('the_dial_desktop.html');
  context.toggleFav = num => calls.push(['favorite', num]);
  api.command('favorite', 226);
  assert.deepEqual(calls, [['favorite', 226]]);
});
for (const file of ['the_dial_mobile.html', 'the_dial_desktop.html']) {
  test(file + ': guide reads actual IA current and resolved queue without discovery', () => {
    const { api, calls, context } = browserAdapter(file);
    // C is metadata-only in this owner's media map; it is not ready yet.
    const result = api.snapshot(150);
    assert.equal(result.current.title, 'Cartoon A');
    assert.equal(result.next.title, 'Cartoon B');
    assert.equal(result.later, null);
    assert.equal(result.ready, 2);
    assert.equal(result.remainingSeconds, 320);
    assert.deepEqual(calls, []);
    assert.equal(context.iaProgramQueues['150'].length, 3);
  });
  test(file + ': Source Suite previews the same next selection on a cursor copy', () => {
    const { api, context } = browserAdapter(file);
    const source = { num: 555, nm: 'Source channel', source: 'v2preview', previewKey: 'example' };
    context.curNum = 555; context.curItem = { id: 'one', title: 'Real current', ch: 555 };
    context.__v2PreviewState[555] = { cursor: 0, items: [{ id: 'one', title: 'One', url: 'https://example.org/1' }, { id: 'two', title: 'Two', url: 'https://example.org/2' }] };
    const before = JSON.stringify(context.__v2PreviewState);
    assert.equal(api.snapshot(source).next.id, 'two');
    assert.equal(JSON.stringify(context.__v2PreviewState), before);
  });
  test(file + ': Source Suite Up Next skips the program already selected during pre-roll', () => {
    const { api, context } = browserAdapter(file);
    const source = { num:535, nm:'Comedy Circuit', source:'v2preview', previewKey:'example' };
    context.curNum = 535;
    context.curItem = null;
    context.__v2PreviewState[535] = {
      cursor:0, pendingId:'loading',
      items:[{id:'loading',title:'Performance loading',url:'https://example.org/1'},
        {id:'next',title:'Next performance',url:'https://example.org/2'}],
    };
    const before = JSON.stringify(context.__v2PreviewState);
    const snapshot = api.snapshot(source);
    assert.equal(snapshot.current, null, 'the ad does not count as the performance starting');
    assert.equal(snapshot.next.id,'next');
    assert.equal(JSON.stringify(context.__v2PreviewState),before);
  });
  test(file + ': Cookhouse Up Next uses the same canonical and era-aware decision as manual Next', () => {
    const { api, context, calls } = browserAdapter(file);
    const cookhouse = { num:608, nm:'OK Cookhouse', source:'v2preview', previewKey:'ok-cookhouse-channel' };
    const profile = { name:cookhouse.nm, profileKey:cookhouse.previewKey, personalRotation:true };
    context.V2_PREVIEW_PROFILES[cookhouse.previewKey] = profile;
    context.byNum = () => cookhouse;
    context.curNum = 608;
    const make = (id, key, seriesId, year) => ({id, canonicalProgramKey:key, seriesId, year, title:id, url:'https://ok.ru/videoembed/123'});
    const one = make('one','show-a:1','show-a',1994);
    const copy = make('copy','show-a:1','show-a',1994);
    const two = make('two','show-b:1','show-b',1996);
    const three = make('three','show-c:1','show-c',1971);
    context.curItem = { ...one, ch:608 };
    const state = context.__v2PreviewState[608] = { items:[one,copy,two,three], cursor:0, currentId:one.id };
    context.v2PreviewState = context.__v2PreviewState;
    context.store = {get(key, fallback) { return ({
      'v2recent:OK Cookhouse':['one'],
      'v2recentPrograms:OK Cookhouse':['show-a:1'],
      'v2recentSeries:OK Cookhouse':['show-a'],
      'v2recentEras:OK Cookhouse':[1990]
    })[key] ?? fallback; }};
    context.v2PruneSourcePrograms = () => {};
    context.v2LoadProfile = async () => [];
    context.quickBanner = () => {};
    context.token = 1;
    context.V2_SOURCE_READY_BUFFER = 2;
    context.tuneNum = (number,id) => calls.push([number,id]);
    vm.runInContext(fs.readFileSync(path.join(root,'assets/ok-embed-runtime.js'),'utf8'), context);
    actualFunctions(file, context, ['v2Recent','v2RecentSeries','v2NextFreshIndex']);
    const html = fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(html.split(/\r?\n/).find(line => line.startsWith('window.__v2PreviewNext=function')), context);
    const before = JSON.stringify(state);
    assert.equal(api.snapshot(cookhouse).current.id,'one');
    assert.equal(api.snapshot(cookhouse).next.id,'three');
    assert.equal(JSON.stringify(state),before);
    context.__v2PreviewNext(true);
    assert.deepEqual(calls,[[608,'three']]);
  });
  test(file + ': commands use the latest playback wrappers and invalid commands do nothing', () => {
    const { api, context, calls } = browserAdapter(file);
    context.tuneNum = n => { calls.push(['latest', n]); return n; };
    assert.equal(api.command('tune', 150), 150);
    api.command('next'); api.command('guide-open'); api.command('guide-close');
    assert.equal(api.command('unrecognized'), false);
    assert.deepEqual(calls, [['latest', 150], ['next'], ['open'], ['close']]);
  });
  test(file + ': explicit rollback and cast receivers keep their current guide contract', () => {
    assert.equal(browserAdapter(file, '?v6=0').api.enabled, false);
    assert.equal(browserAdapter(file, '?v6=1&castReceiver=1').api.enabled, false);
    const { api, calls } = browserAdapter(file, '?v6=0');
    assert.equal(api.command('next'), false);
    assert.deepEqual(calls, []);
  });
  test(file + ': release presentation is available and enabled without a query flag', () => {
    const { api } = browserAdapter(file, '');
    assert.equal(api.available, true); assert.equal(api.enabled, true);
  });
  test(file + ': reading eligibility does not prune expired skip or failure ledgers', () => {
    const { api, context } = browserAdapter(file), writes = [];
    Object.assign(context, { banned: [], skipUntil: { [b.identifier]: 1 }, iaSkipLedger: { '150': [{ id: 'expired', at: 1 }] }, IA_SKIP_LEDGER_TTL: 21600000,
      store: { set: (...args) => writes.push(args) }, iaProgramFailures: { [b.identifier]: 1 },
      iaReviewedFileAllowed: () => true, iaKnownVideoPolicyViolation: () => false, blockedId: () => false, iaThemeMatches: () => true,
      slotFor: () => ({ channel: 150, program: {} }), normTitle: value => value.toLowerCase() });
    actualFunctions(file, context, ['iaProgramFailed', 'isTemporarilySkipped', 'iaSkipPrune', 'iaSkipBlocked', 'iaProgramAllowed']);
    const before = JSON.stringify([context.skipUntil, context.iaSkipLedger, context.iaProgramFailures]);
    assert.equal(api.snapshot(150).next.id, b.identifier);
    assert.deepEqual(writes, []);
    assert.equal(JSON.stringify([context.skipUntil, context.iaSkipLedger, context.iaProgramFailures]), before);
    context.isTemporarilySkipped(b.identifier);
    assert.equal(writes.length, 1, 'normal playback retains its existing expiry cleanup');
  });
  test(file + ': IA guide Next matches actual decoded-warmer priority without consuming it', () => {
    const { api, context } = browserAdapter(file);
    context.curItem = null;
    context.iaMediaWarmers['150:' + b.identifier] = { el: { readyState: 2 } };
    Object.assign(context, { iaProgramPendingAt: {}, isTemporarilySkipped: () => false,
      refillIAQueue: () => {}, iaReadyShelfSave: () => {}, iaAdvanceQueueRotation: () => {}, warmIAQueueHead: () => {} });
    const before = JSON.stringify(context.iaProgramQueues);
    const advertised = api.snapshot(150).next.id;
    assert.equal(JSON.stringify(context.iaProgramQueues), before);
    actualFunctions(file, context, ['takeIAQueue']);
    assert.equal(advertised, context.takeIAQueue(channel, {}, true, context.iaLegacyHandoffMedia).identifier);
    assert.equal(advertised, b.identifier);
  });
  test(file + ': read-only eligibility still enforces active skip and failed-media cooldowns', () => {
    const { api, context } = browserAdapter(file);
    Object.assign(context, { banned: [], skipUntil: {}, iaSkipLedger: {}, IA_SKIP_LEDGER_TTL: 21600000,
      store: { set: () => { throw Error('unexpected history write'); } },
      iaReviewedFileAllowed: () => true, iaKnownVideoPolicyViolation: () => false, blockedId: () => false, iaThemeMatches: () => true,
      slotFor: () => ({ channel: 150, program: {} }), normTitle: value => value.toLowerCase() });
    actualFunctions(file, context, ['iaProgramFailed', 'isTemporarilySkipped', 'iaSkipPrune', 'iaSkipBlocked', 'iaProgramAllowed']);
    context.iaProgramMedia[c.identifier] = c.media;
    context.skipUntil[b.identifier] = Date.now() + 60000;
    assert.equal(api.snapshot(150).next.id, c.identifier);
    context.iaProgramQueues['150'][1] = { ...b, _freshnessFallback: true };
    assert.equal(api.snapshot(150).next.id, b.identifier, 'approved exhaustion recovery can reuse a skipped item');
    context.iaProgramFailures[b.identifier] = Date.now() + 60000;
    assert.equal(api.snapshot(150).next.id, c.identifier, 'freshness fallback never overrides failed media');
    context.iaProgramFailures = {}; context.skipUntil = {};
    context.iaProgramQueues['150'][1] = b;
    context.iaSkipLedger['150'] = [{ id: b.identifier, title: 'cartoon b', at: Date.now() }];
    assert.equal(api.snapshot(150).next.id, c.identifier);
  });
  test(file + ': music preview includes actual artist/program selection rules', () => {
    const { api, context } = browserAdapter(file);
    const ch = { num: 599, nm: 'OK Video Hits', source: 'v2preview', previewKey: 'example' };
    const items = [{ id: 'current', title: 'Current', url: 'https://example.org/current', musicArtistId: 'recent', programKey: 'current' },
      { id: 'same-artist', title: 'Same artist', url: 'https://example.org/same', musicArtistId: 'recent', programKey: 'same' },
      { id: 'new-artist', title: 'Different artist', url: 'https://example.org/new', musicArtistId: 'new', programKey: 'new' }];
    const history = { 'v2recent:Example': ['current'], 'v2recentArtists:Example': ['recent'], 'v2recentPrograms:Example': ['current'] };
    Object.assign(context, { curNum: 599, curItem: { id: 'current', title: 'Current', ch: 599 }, store: { get: (k, fallback) => history[k] || fallback } });
    context.V2_PREVIEW_PROFILES.example = { name: 'Example', profileKey: 'ok-video-hits' };
    context.RealSignalOKEmbed = { musicProfile: () => true, programKey: item => item.programKey };
    context.__v2PreviewState[599] = { items, cursor: 0, currentTitle: 'Current' };
    actualFunctions(file, context, ['v2Recent', 'v2RecentSeries', 'v2NextFreshIndex', 'v2FreshCursor']);
    const before = JSON.stringify(context.__v2PreviewState);
    assert.equal(api.snapshot(ch).next.id, 'new-artist');
    assert.equal(JSON.stringify(context.__v2PreviewState), before);
  });
}

for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) test(file + ': the pilot guide and Next agree on a decoded and stable reservation', async () => {
  const {api,context} = browserAdapter(file);
  const shelf={rows:()=>[b,c],peek:()=>b};
  context.iaRepairEnabled=()=>true;
  context.RealSignalIAShelf={enabled:true,tracksRoutes:()=>true,client:()=>shelf};
  context.iaCachedProgramAllowed=(_ch,program)=>program.media.runtime>=120;
  context.iaDisplayTitle=item=>item.title;
  context.token=1;
  actualFunctions(file,context,['iaPilotBuffered']);
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const start=source.indexOf('async function tuneIARepair('),end=source.indexOf('async function tuneIA(',start);
  vm.runInContext(source.slice(start,end),context);
  assert.equal(api.snapshot(150).next,null,'a transport URL alone cannot be a guide promise');
  const prepared=(readyOrder,videoWidth=640,duration=1440)=>({readyOrder,el:{readyState:2,videoWidth,videoHeight:480,duration}});
  context.iaMediaWarmers['150:'+b.identifier]=prepared(1,0);
  context.iaMediaWarmers['150:'+c.identifier]=prepared(2);
  assert.equal(api.snapshot(150).next.id,c.identifier,'a pictureless candidate remains pending');
  context.iaMediaWarmers['150:'+b.identifier]=prepared(3);
  assert.equal(api.snapshot(150).next.id,c.identifier,'a newer buffer cannot displace the listed title');
  context.playFile=async (program)=>{assert.equal(program.id,c.identifier);return true;};
  await context.tuneIARepair(channel,{},1);
});

for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) test(file + ': a pending Next can switch to a newly buffered item without marking the other episode failed', async () => {
  const {context}=browserAdapter(file);
  context.iaRepairEnabled=()=>true;
  context.RealSignalIAShelf={enabled:true,tracksRoutes:()=>true,client:()=>({rows:()=>[b,c],peek:()=>b})};
  context.iaDisplayTitle=item=>item.title;
  context.token=1;
  context.iaCachedProgramAllowed=()=>true;
  let played=[];
  context.iaRepairEvent=()=>assert.fail('an unadvertised alternate was never a failed episode');
  context.iaRetry=()=>assert.fail('expected a decoded spare');
  context.nlog=()=>{};
  context.playFile=async (program,_ch,_sl,_token,_fallback,handoff)=>{
    played.push(program.id);
    if(program.id===b.identifier){assert.equal(handoff.allowBuffered,true);handoff.buffered=c;return false;}
    assert.equal(handoff.allowBuffered,false);
    return true;
  };
  actualFunctions(file,context,['iaPilotBuffered']);
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const start=source.indexOf('async function tuneIARepair('),end=source.indexOf('async function tuneIA(',start);
  vm.runInContext(source.slice(start,end),context);
  await context.tuneIARepair(channel,{},1);
  assert.deepEqual(played,[b.identifier,c.identifier]);
});
