const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');
const { rotationContext } = require('./ia-storage-test-helper');
const modules = Promise.all(['realsignal_api_v2_worker.js', 'ia_file_contract.js'].map(file => import(pathToFileURL(path.join(root, file)))));
let fixtureId = 0;
const row = (file, extra = {}) => ({ identifier: 'benson::' + file, title: 'Benson television sitcom full episode', language: 'eng',
  media: { type: 'video', url: 'https://archive.org/download/benson/' + file, runtime: 1514, width: 640, height: 480, verification: 'transport', verifiedAt: Date.now() }, ...extra });
async function fixture() {
  const { default: api, SessionRotation } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')) + '?fixture=' + fixtureId++);
  const objects = new Map(), pending = [], forwarded = [], queueBodies = [];
  let incoming = [row('A.mp4'), row('B.mp4'), row('C.mp4')];
  const env = { RELAY: { fetch: async request => {
    forwarded.push(new URL(request.url).pathname);
    if (new URL(request.url).pathname === '/ia/queue') queueBodies.push(await request.clone().json());
    return Response.json({ ready: incoming.length, items: incoming, candidateItems: incoming });
  } }, ROTATION: { getByName(name) {
    if (!objects.has(name)) objects.set(name, new SessionRotation(rotationContext(), {}));
    return objects.get(name);
  } } };
  const request = (route, body) => api.fetch(new Request('https://api.invalid/api/v3/ia/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { waitUntil: promise => pending.push(promise) });
  return { request, env, incoming: rows => { incoming = rows; }, objects, pending, forwarded, queueBodies };
}

async function catalogFixture(rows) {
  const f = await fixture(), [{ compactCatalogItem }] = await modules;
  const records = rows.map(compactCatalogItem).map(item => ({
    id: item.id, provider: item.provider, source_identifier: item.sourceIdentifier,
    title: item.title, description: item.description, duration_seconds: item.duration,
    aspect_ratio: item.aspectRatio, media_type: item.mediaType, media_url: item.mediaUrl,
    metadata_json: JSON.stringify(item), year: item.year,
  }));
  f.batches = [];
  f.env.realsignal_catalog = {
    prepare(sql) { return { bind(...args) { return {
      sql, args, all: async () => ({ results: /FROM programs p/.test(sql) ? records : [] }),
      first: async () => null, run: async () => ({ success: true }),
    }; } }; },
    async batch(statements) { f.batches.push(statements); },
  };
  return f;
}

test('standard IA prefetch does not mark its three buffered candidates watched',async()=>{
  const f=await catalogFixture(Array.from({length:65},(_,i)=>row('holiday-'+i+'.mp4',{title:'Halloween cartoon animated special '+i,seriesId:'show-'+i%8})));
  for(let rotation=0;rotation<2;rotation++){
    const p=await(await f.request('queue',{channel:'705',serverCatalog:true,sessionId:'played-only-empty',count:3,rotation,viewerRecentIds:[],recentIds:[]})).json();
    assert.equal(p.items.length,3);assert.equal(p.v2.seenInCatalog,0,'queued is not watched');
  }
  await Promise.all(f.pending);
});

test('48 actual IA first selections cannot exhaust a 65-program catalog by counting prefetched tails',async()=>{
  const rows=Array.from({length:65},(_,i)=>row('holiday-'+i+'.mp4',{title:'Halloween cartoon animated special '+i,seriesId:'show-'+i%8})),f=await catalogFixture(rows),played=[];
  for(let rotation=0;rotation<48;rotation++){
    const p=await(await f.request('queue',{channel:'705',serverCatalog:true,sessionId:'played-only-48',count:3,rotation,viewerRecentIds:played,recentIds:played.slice(-36),diversity:{maxPerFamily:1}})).json();
    assert.equal(p.items.length,3);assert.ok(!played.includes(p.items[0].identifier),'repeat at rotation '+rotation);
    assert.equal(p.v2.cycleReset,false,'the viewer has not watched the complete catalog');played.push(p.items[0].identifier);
  }
  await Promise.all(f.pending);
});

test('played-only IA rotation ignores legacy queued-as-seen state and honors personal history beyond 48',async()=>{
  const [{SessionRotation}]=await modules,rows=Array.from({length:65},(_,i)=>row('long-'+i+'.mp4'));
  const ctx=rotationContext({catalog:rows,seen:rows.map(item=>item.identifier),cursor:23}),object=new SessionRotation(ctx,{});
  const p=await(await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify({items:rows,count:3,requirePlayable:true,playedOnly:true,viewerRecentIds:rows.slice(0,61).map(item=>item.identifier)})}))).json();
  assert.equal(p.items.length,3);assert.equal(p.cycleReset,false);
  assert.ok(p.items.every(item=>rows.slice(61).some(fresh=>fresh.identifier===item.identifier)),'all 61 real plays are excluded, not only the last 48');
});

test('standard Modern Game Shows cannot inherit kids from its previous session catalog',async()=>{
  const rows=['A','B','C'].map(file=>row(file+'.mp4',{title:'Wheel of Fortune full episode 1995',year:1995})),f=await catalogFixture(rows);
  const old=f.env.ROTATION.getByName('session:modern-policy:channel:22');
  await old.ctx.storage.put('rotation',{catalog:[row('guts.mp4',{title:'Nickelodeon GUTS full episode 1995',year:1995})],seen:[],cursor:0});
  const p=await(await f.request('queue',{channel:'22',serverCatalog:true,sessionId:'modern-policy',count:3,viewerRecentIds:[]})).json();
  assert.equal(p.items.length,3);assert.ok(p.items.every(item=>! /guts|nickelodeon/i.test(item.title)));
  await Promise.all(f.pending);
});

test('played-only IA history excludes another encoding but keeps unseen sibling episodes',async()=>{
  const [{SessionRotation}]=await modules,object=new SessionRotation(rotationContext(),{});
  const rows=['01','02','03'].map(n=>row('James Holzhauer Game '+n+'.mp4',{title:'Jeopardy! full episode 2019',year:2019}));
  const p=await(await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify({items:rows,count:3,requirePlayable:true,playedOnly:true,viewerRecentIds:['BENSON::James Holzhauer Game 01.ia.mp4']})}))).json();
  assert.equal(p.items.length,2);assert.ok(p.items.every(item=>!item.identifier.includes('Game 01')));assert.equal(p.exhaustion.seenInCatalog,1);
});

test('played-only IA resolves a reported parent alias to its actual file without blocking siblings',async()=>{
  const [{SessionRotation}]=await modules,object=new SessionRotation(rotationContext(),{});
  const first={...row('One.mp4'),identifier:'holiday-single',sourceIdentifier:'holiday-single',fileName:'One.mp4'};
  const sibling={...row('Two.mp4'),identifier:'holiday-single::Two.mp4',sourceIdentifier:'holiday-single',fileName:'Two.mp4'};
  const p=await(await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify({items:[first,sibling,row('Other.mp4')],count:3,requirePlayable:true,playedOnly:true,viewerRecentIds:['holiday-single']})}))).json();
  assert.equal(p.items.length,2);assert.ok(!p.items.some(item=>item.identifier==='holiday-single'));
  assert.ok(p.items.some(item=>item.identifier===sibling.identifier));assert.equal(p.exhaustion.seenInCatalog,1);
});

test('played-only IA still returns playable fallback after real viewer exhaustion',async()=>{
  const [{SessionRotation}]=await modules,rows=['A','B','C'].map(file=>row(file+'.mp4')),object=new SessionRotation(rotationContext(),{});
  const p=await(await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify({items:rows,count:3,requirePlayable:true,playedOnly:true,viewerRecentIds:rows.map(item=>item.identifier)})}))).json();
  assert.equal(p.items.length,3);assert.equal(p.cycleReset,true);assert.equal(p.exhaustion.repeatAllowed,true);
});

for(const mode of ['private','legacy','canonical','exhausted'])test('relay-owned IA D1 recovery preserves '+mode+' viewer history after a slot fails admission',async()=>{
  const rows='ABCDEFGHIJKL'.split('').map(letter=>row(letter+'.mp4'));
  const f=await catalogFixture(rows),prepare=f.env.realsignal_catalog.prepare.bind(f.env.realsignal_catalog);
  // Other viewers have received the whole database. That cannot exhaust this viewer.
  f.env.realsignal_catalog.prepare=sql=>/SELECT program_id/.test(sql)?{bind(){return {all:async()=>({results:rows.map(item=>({program_id:item.identifier}))})};}}:prepare(sql);
  const rejected=row('podcast.mp4',{title:'Benson podcast discussion'});
  f.env.RELAY.fetch=async()=>Response.json({channel:'11',rotation:28,rotationApplied:true,ready:3,
    items:[rows[1],rows[2],rejected],candidateItems:[rows[1],rows[2],rejected]});
  const recent=mode==='exhausted'?rows.map(item=>item.identifier):[mode==='canonical'?'BENSON::A.webm':'benson::A.mp4','benson::C.mp4','benson::E.mp4'];
  const request={channel:'11',serverCatalog:true,sessionId:'recovery-'+mode,count:3,rotation:28,recentIds:recent,denyTerms:['podcast']};
  if(mode!=='legacy')request.viewerRecentIds=recent;
  // The legacy case intentionally omits shared served rows to preserve its old semantics.
  if(mode==='legacy')f.env.realsignal_catalog.prepare=prepare;
  const payload=await(await f.request('queue',request)).json();
  assert.equal(payload.catalogRecovery,true,'the fixture must exercise actual D1 recovery');
  assert.equal(payload.items.length,3);assert.ok(payload.items.every(item=>item.media?.url));
  assert.ok(!payload.items.some(item=>item.identifier===rejected.identifier),'recovery cannot weaken admission');
  if(mode!=='exhausted')assert.ok(payload.items.every(item=>!['benson::A.mp4','benson::C.mp4','benson::E.mp4'].includes(item.identifier)),JSON.stringify(payload.items.map(item=>item.identifier)));
  else assert.equal(payload.freshness?.repeatedFallback,true,'genuine exhaustion is visible rather than a dead signal');
  await Promise.all(f.pending);
});

test('a relay-owned recovery keeps the last unseen episode first before repeating to fill the shelf',async()=>{
  const rows='ABCDEF'.split('').map(letter=>row(letter+'.mp4')),f=await catalogFixture(rows);
  f.env.RELAY.fetch=async()=>Response.json({rotationApplied:true,items:rows.slice(0,2),candidateItems:rows.slice(0,2),ready:2});
  const recent=rows.slice(0,5).map(item=>item.identifier);
  const payload=await(await f.request('queue',{channel:'11',serverCatalog:true,sessionId:'last-unseen',count:3,rotation:2,recentIds:recent,viewerRecentIds:recent})).json();
  assert.equal(payload.items[0].identifier,'benson::F.mp4');assert.equal(payload.items.length,3);
  await Promise.all(f.pending);
});

for(const storage of ['no-d1','overlap'])test('a qualified underfilled relay shelf uses unseen candidates when recovery adds no '+storage+' identities',async()=>{
  const rows='ABCDEFGHIJKL'.split('').map(letter=>row(letter+'.mp4')),f=storage==='no-d1'?await fixture():await catalogFixture(rows);
  const rejected=row('podcast.mp4',{title:'Benson podcast discussion'});
  f.env.RELAY.fetch=async()=>Response.json({channel:'11',rotation:28,rotationApplied:true,items:[rows[0],rows[1],rejected],candidateItems:rows,ready:3});
  const recent=rows.slice(0,2).map(item=>item.identifier);
  const payload=await(await f.request('queue',{channel:'11',serverCatalog:true,sessionId:'no-new-'+storage,count:3,rotation:28,denyTerms:['podcast'],viewerRecentIds:recent,recentIds:recent})).json();
  assert.equal(payload.items.length,3,'ready candidates already exist; no new D1 identity is needed');
  assert.ok(payload.items.every(item=>!recent.includes(item.identifier)),JSON.stringify(payload.items.map(item=>item.identifier)));
  await Promise.all(f.pending);
});

test('recovery history matches a legacy parent playback ID without excluding unseen sibling episodes',async()=>{
  const parent={...row('A.mp4'),identifier:'first-time-out-1995',sourceIdentifier:'first-time-out-1995',fileName:'First Time Out 1x01.mp4'};
  const sibling={...row('B.mp4'),identifier:'first-time-out-1995::First Time Out 1x02.mp4',sourceIdentifier:'first-time-out-1995',fileName:'First Time Out 1x02.mp4'};
  const others=[row('C.mp4'),row('D.mp4'),row('E.mp4')],rows=[parent,...others],f=await catalogFixture(rows);
  f.env.RELAY.fetch=async()=>Response.json({rotationApplied:true,items:[parent],candidateItems:[parent],ready:1});
  const payload=await(await f.request('queue',{channel:'11',serverCatalog:true,sessionId:'parent-id',count:3,rotation:1,viewerRecentIds:['first-time-out-1995']})).json();
  assert.equal(payload.items.length,3);
  assert.ok(payload.items.every(item=>item.identifier!=='first-time-out-1995'),'the actually reported playback ID must be excluded even when it is not the file-level identity');
  await Promise.all(f.pending);
  const g=await catalogFixture([sibling,...others]);
  g.env.RELAY.fetch=async()=>Response.json({rotationApplied:true,items:[sibling],candidateItems:[sibling],ready:1});
  const next=await(await g.request('queue',{channel:'11',serverCatalog:true,sessionId:'parent-sibling',count:3,rotation:1,viewerRecentIds:['first-time-out-1995']})).json();
  assert.ok(next.items.some(item=>item.identifier===sibling.identifier),'playing one legacy parent record cannot ban its unplayed sibling');
  await Promise.all(g.pending);
});

test('API ledger enrichment preserves viewer-specific history separately on relay-owned IA lanes',async()=>{
  const f=await catalogFixture([row('fresh.mp4')]),prepare=f.env.realsignal_catalog.prepare.bind(f.env.realsignal_catalog);
  f.env.realsignal_catalog.prepare=sql=>/SELECT program_id/.test(sql)?{bind(){return {all:async()=>({results:Array.from({length:48},(_,i)=>({program_id:'other-viewer-'+i}))})};}}:prepare(sql);
  const recent=['benson::watched.mp4'];
  await f.request('queue',{channel:'11',serverCatalog:true,sessionId:'viewer-preservation',count:3,recentIds:recent,viewerRecentIds:recent});
  assert.deepEqual(f.queueBodies[0].viewerRecentIds,recent,'shared D1 preference cannot crowd out this viewer');
  await Promise.all(f.pending);
});

// Run the emitted SQL against SQLite, not a fake returning every database row.
// A newest-first LIMIT before qualification must fail the older-episode tests.
async function sqliteCatalogFixture(rows, channel = '10') {
  const f = await fixture(), [{ compactCatalogItem }] = await modules;
  const db = new DatabaseSync(':memory:');
  for (const migration of ['0001_realsignal_catalog.sql', '0003_realsignal_v4_adaptive_catalog.sql']) {
    db.exec(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
  }
  const insert = db.prepare('INSERT INTO programs (id,provider,source_identifier,title,description,duration_seconds,aspect_ratio,media_type,media_url,metadata_json,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const link = db.prepare('INSERT INTO channel_programs (channel_key,program_id,last_seen_at) VALUES (?,?,?)');
  rows.forEach((raw, i) => {
    const item = compactCatalogItem(raw), at = rows.length - i;
    insert.run(item.id, item.provider, item.sourceIdentifier, item.title, item.description, item.duration,
      item.aspectRatio, item.mediaType, raw.metadataOnlyUrl ? null : item.mediaUrl, JSON.stringify(item), at, at);
    link.run(channel, item.id, at);
  });
  f.db = db; f.batches = [];
  f.env.realsignal_catalog = {
    prepare(sql) { return { bind(...args) { return {
      sql, args,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      first: async () => db.prepare(sql).get(...args) || null,
      run: async () => db.prepare(sql).run(...args),
    }; } }; },
    async batch(statements) {
      f.batches.push(statements);
      return statements.map(statement => db.prepare(statement.sql).run(...statement.args));
    },
  };
  return f;
}

test('older qualified shows survive hundreds of newer incomplete catalog rows', async () => {
  const pending = Array.from({ length: 600 }, (_, i) => row('incomplete-' + i + '.mp4', {
    media: { ...row('incomplete-' + i + '.mp4').media, verification: 'metadata-only', verifiedAt: 0 },
  }));
  const healthy = ['Beaver', 'Benson', 'Lucy', 'Dragnet'].map(seriesId => row(seriesId + '.mp4', { seriesId }));
  const f = await sqliteCatalogFixture(pending.concat(healthy));
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'older-healthy', count: 3, diversity: { maxPerFamily: 1 } })).json();
    assert.equal(payload.ready, 3);
    assert.ok(payload.items.every(item => healthy.some(record => record.identifier === item.identifier)),
      'use older qualified programs, not the unrelated emergency relay shelf');
    assert.equal(new Set(payload.items.map(item => item.seriesId)).size, 3);
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('repaired IA outage fallback retains more than the old ninety-six-record window', async () => {
  const records = Array.from({ length: 140 }, (_, i) => row('deep-' + i + '.mp4', { seriesId: 'show-' + i % 10 }));
  const f = await sqliteCatalogFixture(records, '150');
  f.env.RELAY.fetch = async () => new Response('temporary relay outage', { status: 503 });
  try {
    const payload = await (await f.request('queue', { channel: '150', iaRepair: true, serverCatalog: true, sessionId: 'wide-window', count: 3 })).json();
    assert.equal(payload.v2.catalogSize, 140);
    assert.equal(payload.items.length, 3, 'widen the catalog, not the public playing shelf');
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('classic cartoon D1 fallback enforces its canonical editorial exclusions', async () => {
  const records = [
    row('review.mp4', { title: 'Cartoon Network Review by ADOTJ', subject: 'classic cartoon animation', seriesId: 'review-show' }),
    row('top-cat.mp4', { title: 'Top Cat S01E01', subject: 'classic cartoon animation', seriesId: 'top-cat' }),
    row('popeye.mp4', { title: 'Popeye Meets Sinbad', subject: 'classic cartoon animation', seriesId: 'popeye' }),
    row('jetsons.mp4', { title: 'The Jetsons S01E01', subject: 'classic cartoon animation', seriesId: 'jetsons' }),
  ];
  const f = await sqliteCatalogFixture(records, '150');
  f.env.RELAY.fetch = async () => new Response('temporary relay outage', { status: 503 });
  try {
    const payload = await (await f.request('queue', { channel: '150', iaRepair: true, serverCatalog: true,
      sessionId: 'cartoon-editorial', count: 3, themeTerms: ['cartoon', 'animation'] })).json();
    assert.equal(payload.ready, 3);
    assert.ok(payload.candidateItems.every(item => !/\breview\b/i.test(item.title)),
      'stale genreVerified rows cannot bypass the channel profile deny list');
    assert.ok(payload.items.some(item => /top cat|popeye|jetsons/i.test(item.title)));
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('a full old cartoon D1 catalog cannot mask newly verified relay families', async () => {
  const old=Array.from({length:50},(_,i)=>row('old-cartoon-'+i+'.mp4',{title:'Top Cat cartoon episode '+i,subject:'classic cartoon animation',seriesId:'top-cat'}));
  const fresh=['Underdog','Jabberjaw','Wacky Races'].map(show=>row(show+'.mp4',{title:show+' · Complete Episode Collection',subject:'classic cartoon animation',seriesId:show}));
  const f=await sqliteCatalogFixture(old,'150');f.incoming(fresh);
  f.env.RELAY.fetch=async()=>Response.json({ready:3,items:fresh,candidateItems:fresh,rotationApplied:true});
  try {
    const payload=await(await f.request('queue',{channel:'150',iaRepair:true,serverCatalog:true,sessionId:'new-cartoon-families',count:3,themeTerms:['cartoon','animation'],diversity:{maxPerFamily:1}})).json();
    assert.notEqual(payload.fastCatalogLane,true,'the small old D1 union cannot own the expanded cartoon station');
    assert.equal(payload.items.length,3);
    assert.ok(payload.items.every(item=>fresh.some(candidate=>candidate.identifier===item.identifier)),'new families must be selectable immediately');
    await Promise.all(f.pending);
  }finally{f.db.close();}
});

test('verified older metadata URLs remain available when the normalized URL column is empty', async () => {
  const records = ['A', 'B', 'C'].map(file => row('old-' + file + '.mp4', { metadataOnlyUrl: true }));
  const f = await sqliteCatalogFixture(records);
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'legacy-url', count: 3 })).json();
    assert.deepEqual(new Set(payload.items.map(item => item.identifier)), new Set(records.map(item => item.identifier)));
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('background repaired catalog imports keep qualified episodes beyond ninety-six', async () => {
  const f = await catalogFixture([row('cached-A.mp4'), row('cached-B.mp4'), row('cached-C.mp4')]);
  const discovered = Array.from({ length: 140 }, (_, i) => row('discovered-' + i + '.mp4'));
  f.incoming(discovered);
  await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'wide-import', count: 3 });
  await Promise.all(f.pending);
  const inserted = new Set(f.batches.flat().filter(statement => /INSERT INTO programs/.test(statement.sql)).map(statement => statement.args[0]));
  assert.ok(inserted.has('benson::discovered-139.mp4'), 'qualified tail episodes must not vanish at persistence');
  assert.ok(f.batches.every(batch => batch.length <= 32), 'deeper imports stay in bounded write batches');
});

test('a dominant series does not crowd older healthy series out of the database window', async () => {
  const dominant = Array.from({ length: 600 }, (_, i) => row('dominant-' + i + '.mp4', { seriesId: 'Bonanza' }));
  const others = ['Beaver', 'Lucy', 'Dragnet'].map(seriesId => row(seriesId + '.mp4', { seriesId }));
  const f = await sqliteCatalogFixture(dominant.concat(others));
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'show-breadth', count: 3, diversity: { maxPerFamily: 1 } })).json();
    assert.equal(new Set(payload.items.map(item => item.seriesId)).size, 3);
    assert.ok(payload.candidateItems.some(item => item.seriesId === 'Lucy'));
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('incomplete members do not consume a healthy episode family position', async () => {
  const incomplete = Array.from({ length: 600 }, (_, i) => row('incomplete-lucy-' + i + '.mp4', {
    seriesId: 'Lucy', media: { ...row('incomplete.mp4').media, verification: 'metadata-only', verifiedAt: 0 },
  }));
  const dominant = Array.from({ length: 600 }, (_, i) => row('bonanza-' + i + '.mp4', { seriesId: 'Bonanza' }));
  const healthy = ['Lucy', 'Beaver', 'Dragnet'].map(seriesId => row(seriesId + '.mp4', { seriesId }));
  const f = await sqliteCatalogFixture(incomplete.concat(dominant, healthy));
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'family-rank', count: 3 })).json();
    assert.ok(payload.candidateItems.some(item => item.seriesId === 'Lucy'), 'unverified siblings cannot bury the verified Lucy episode');
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('policy rejects trigger bounded database refill instead of erasing healthy older shows', async () => {
  const blocked = Array.from({ length: 600 }, (_, i) => row('blocked-' + i + '.mp4', {
    title: 'Unrelated television full episode', seriesId: 'blocked-' + i,
  }));
  const healthy = ['Beaver', 'Lucy', 'Dragnet'].map(seriesId => row(seriesId + '.mp4', { seriesId }));
  const f = await sqliteCatalogFixture(blocked.concat(healthy));
  try {
    const payload = await (await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'policy-refill', denyTerms: ['unrelated'], count: 3 })).json();
    assert.deepEqual(new Set(payload.items.map(item => item.identifier)), new Set(healthy.map(item => item.identifier)),
      'keep the strict deny rule and find the older healthy shows, not emergency relay items');
    await Promise.all(f.pending);
  } finally { f.db.close(); }
});

test('repaired relay catalogs retain qualified tail episodes on their way to session rotation', async () => {
  const f = await fixture();
  f.incoming(Array.from({ length: 140 }, (_, i) => row('relay-depth-' + i + '.mp4')));
  const payload = await (await f.request('queue', { channel: '11', iaRepair: true, serverCatalog: true, sessionId: 'relay-window', count: 3 })).json();
  assert.equal(payload.v2.catalogSize, 140);
  assert.equal(payload.items.length, 3);
  await Promise.all(f.pending);
});

test('deep repaired catalog imports fit queue message limits without losing episodes', async () => {
  const f = await fixture(), queued = [];
  f.incoming(Array.from({ length: 140 }, (_, i) => row('large-' + i + '.mp4', {
    description: 'Classic television full episode. ' + 'é'.repeat(1900),
  })));
  f.env.realsignal_catalog_refresh = { send: async job => {
    assert.ok(Buffer.byteLength(JSON.stringify(job)) <= 120000, 'leave room under the 128 KB queue limit');
    queued.push(job);
  } };
  await f.request('queue', { channel: '11', iaRepair: true, serverCatalog: true, sessionId: 'large-import', count: 3 });
  await Promise.all(f.pending);
  assert.ok(queued.length > 1, 'split the large union into bounded messages');
  assert.equal(new Set(queued.flatMap(job => job.items.map(item => item.id))).size, 140);
  assert.ok(queued.every(job => job.iaRepair === true && job.channelKey === '11'));
});

test('a playable fast catalog above fifteen keeps discovering in background without blocking tunes', async () => {
  const old = Array.from({ length: 30 }, (_, i) => row('old-' + i + '.mp4'));
  const f = await catalogFixture(old), refreshed = old.concat(row('new.mp4'));
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  f.env.RELAY.fetch = async request => {
    f.queueBodies.push(await request.json());
    await delayed;
    return Response.json({ items: refreshed.slice(0, 3), candidateItems: refreshed });
  };
  const body = { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'deep-fast', count: 3, recentIds: ['watched'] };
  const response = await f.request('queue', body), payload = await response.json();
  await f.request('queue', body);
  const callsBeforeRelease = f.queueBodies.length;
  release();
  await Promise.all(f.pending);
  assert.equal(payload.ready, 3, 'a tune uses the verified database shelf while discovery is pending');
  assert.equal(callsBeforeRelease, 1, 'coalesce foreground-triggered background discovery');
  assert.deepEqual(f.queueBodies[0].recentIds, []);
  assert.ok(f.batches.flat().some(statement => /INSERT INTO programs/.test(statement.sql) && statement.args[0] === 'benson::new.mp4'));
});

test('a shallow fast catalog cannot mask a deeper relay catalog', async () => {
  const cached = Array.from({ length: 9 }, (_, i) => row('cached-' + i + '.mp4', { seriesId: 'cached-' + i }));
  const discovered = Array.from({ length: 30 }, (_, i) => row('discovered-' + i + '.mp4', { seriesId: 'show-' + i }));
  const f = await catalogFixture(cached);
  f.incoming(discovered);
  const payload = await (await f.request('queue', {
    channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'shallow-fast-fallthrough',
    count: 3, queries: ['classic television full episode'], diversity: { maxPerFamily: 1 },
  })).json();
  assert.equal(payload.items.length, 3, 'the viewer still gets the small immediate shelf');
  assert.ok(payload.candidateItems.length >= 39, 'the deeper relay union retains the verified cached history');
  assert.ok(payload.candidateItems.some(item => item.identifier === 'benson::cached-0.mp4'),
    'falling through for depth must not discard already verified programs');
  assert.ok(f.queueBodies.length >= 1, 'a shallow database shortcut must fall through to the source adapter');
  await Promise.all(f.pending);
});

test('same-sized qualified refreshes can add new episodes rather than preserving an old snapshot', async () => {
  const old = Array.from({ length: 24 }, (_, i) => row('old-' + i + '.mp4'));
  const f = await catalogFixture(old), replacement = Array.from({ length: 24 }, (_, i) => row('new-' + i + '.mp4'));
  f.incoming(replacement);
  const response = await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'same-depth', count: 3 });
  await Promise.all(f.pending);
  assert.equal((await response.json()).ready, 3);
  assert.ok(f.batches.flat().some(statement => /INSERT INTO programs/.test(statement.sql) && statement.args[0] === 'benson::new-0.mp4'),
    'equal depth does not mean equal catalog identities; preserve the durable union');
});

test('relay-family channels also reserve identities in the IA repair canary', async () => {
  const f = await fixture(), body = { channel: '11', iaRepair: true, serverCatalog: true, sessionId: 'review', count: 3 };
  const queue = await (await f.request('queue', body)).json();
  assert.equal(queue.items.length, 3);
  const start = await f.request('playback', { ...body, id: queue.items[0].identifier, event: 'started' });
  assert.equal(start.status, 202);
  await Promise.all(f.pending);
});

test('committed items are excluded before the relay spends its next hydration budget', async () => {
  const f = await fixture(), body = { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'hydrate', count: 3 };
  const first = await (await f.request('queue', body)).json();
  await f.request('playback', { ...body, id: first.items[0].identifier, event: 'skipped' });
  await f.request('queue', body);
  assert.ok(f.queueBodies.at(-1).hydrationExcludeIds.includes(first.items[0].identifier));
});

test('movie hydration uses the feature floor before filling the small shelf', async () => {
  const f = await fixture();
  await f.request('queue', { channel: '702', iaRepair: true, serverCatalog: true, sessionId: 'feature', count: 3 });
  assert.equal(f.queueBodies.at(-1).minRuntimeSeconds, 3600);
  await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'tv', count: 3 });
  assert.equal(f.queueBodies.at(-1).minRuntimeSeconds, 900);
  await f.request('queue', { channel: '920', iaRepair: true, mediaTypes: ['audio'], sessionId: 'radio', count: 3 });
  assert.equal(f.queueBodies.at(-1).minRuntimeSeconds, 0);
});

test('repair queue never returns unreserved media when rotation is unavailable', async () => {
  const f = await fixture(); delete f.env.ROTATION;
  const response = await f.request('queue', { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'offline', count: 3 });
  assert.equal(response.status, 503);
});

test('new encoding cannot invalidate the original outstanding acknowledgement', async () => {
  const [{ SessionRotation }] = await modules;
  const object = new SessionRotation(rotationContext(), {});
  const send = body => object.fetch(new Request('https://rotation.internal/select', { method: 'POST', body: JSON.stringify(body) }));
  await send({ mode: 'reserve', items: [row('episode.mp4')], count: 1 });
  await send({ mode: 'reserve', items: [row('episode_512kb.mp4', { media: { ...row('episode_512kb.mp4').media, verifiedAt: Date.now() + 1 } })], count: 1 });
  assert.equal((await send({ mode: 'commit', id: 'benson::episode.mp4', event: 'started' })).status, 200);
});

test('watched derivative cannot replay while another episode is unseen', async () => {
  const [{ SessionRotation }] = await modules;
  const object = new SessionRotation(rotationContext(), {});
  const select = async body => (await object.fetch(new Request('https://rotation.internal/select', { method: 'POST', body: JSON.stringify(body) }))).json();
  await select({ mode: 'reserve', items: [row('episode.mp4')], count: 1 });
  await select({ mode: 'commit', id: 'benson::episode.mp4', event: 'started' });
  const next = await select({ mode: 'reserve', items: [row('fresh.mp4'), row('episode_512kb.mp4')], count: 1 });
  assert.equal(next.items[0].identifier, 'benson::fresh.mp4');
  assert.equal(next.catalogSize, 2);
});

test('a played parent ID stays watched when the same exact file is later indexed canonically', async () => {
  const [{ SessionRotation }] = await modules;
  const object = new SessionRotation(rotationContext(), {});
  const select = async body => (await object.fetch(new Request('https://rotation.internal/select', { method:'POST',body:JSON.stringify(body) }))).json();
  const first={...row('episode.mp4'),identifier:'benson'};
  await select({mode:'reserve',items:[first],count:1});
  await select({mode:'commit',id:'benson',event:'skipped'});
  const next=await select({mode:'reserve',items:[row('episode.mp4',{media:{...row('episode.mp4').media,verifiedAt:Date.now()+5}}),row('unseen.mp4'),row('also-unseen.mp4')],count:3});
  assert.ok(next.items.every(item=>!item.identifier.includes('::episode.mp4')),'the played episode cannot occupy any ready slot');
  assert.equal(next.items.length,2);
  assert.equal(next.cycleReset,false,'an identity upgrade cannot erase playback history');
});

test('standard IA D1 rotation cannot replace a resolved shelf with metadata-only catalog rows',async()=>{
  const pending=Array.from({length:24},(_,i)=>row('pending-'+i+'.mp4',{media:{type:'video',url:''}}));
  const ready=Array.from({length:24},(_,i)=>row('ready-'+i+'.mp4'));
  const f=await sqliteCatalogFixture([...pending,...ready],'70');
  const response=await f.request('queue',{channel:'70',serverCatalog:true,sessionId:'ready-only',count:3});
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-realsignal-source'),'d1-catalog-fast-lane+session-rotation');
  assert.equal(payload.ready,3);
  assert.ok(payload.items.every(item=>item.media?.url),'every ready row must have resolved media');
  assert.equal(payload.candidateItems.length,48,'pending discovery is retained, not deleted');
  await Promise.all(f.pending);
});

test('ordinary IA SQL windows prioritize older resolved media before a newer metadata-only burst',async()=>{
  const pending=Array.from({length:130},(_,i)=>row('pending-'+i+'.mp4',{media:{type:'video',url:''}}));
  const f=await sqliteCatalogFixture([...pending,row('older-A.mp4'),row('older-B.mp4'),row('older-C.mp4')],'70');
  const response=await f.request('queue',{channel:'70',serverCatalog:true,sessionId:'older-ready',count:3});
  const payload=await response.json();
  assert.equal(payload.ready,3);
  assert.deepEqual(payload.items.map(x=>x.identifier).sort(),['benson::older-A.mp4','benson::older-B.mp4','benson::older-C.mp4']);
  assert.equal(response.headers.get('x-realsignal-source'),'d1-catalog-fast-lane+session-rotation','resolved D1 media must not wait for relay discovery');
  await Promise.all(f.pending);
});

test('standard IA rotation keeps unresolved records out of the ready shelf and seen ledger',async()=>{
  const [{SessionRotation}]=await modules,ctx=rotationContext(),object=new SessionRotation(ctx,{});
  const select=async body=>(await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify(body)}))).json();
  const pending=Array.from({length:5},(_,i)=>({identifier:'pending-'+i,title:'Pending episode '+i,media:{type:'video',url:''}}));
  const ready=[row('A.mp4'),row('B.mp4'),row('C.mp4')];
  const first=await select({items:[...pending,...ready],count:3,requirePlayable:true});
  assert.deepEqual(first.items.map(x=>x.identifier).sort(),['benson::A.mp4','benson::B.mp4','benson::C.mp4']);
  assert.equal(first.catalog.length,8);
  assert.ok(ctx.snapshot().seen.every(id=>!id.startsWith('pending-')),'a metadata preload is not a watch');
  const hydrated={...pending[0],media:{type:'video',url:'https://archive.org/download/pending/episode.mp4'}};
  const next=await select({items:[hydrated],count:3,requirePlayable:true});
  assert.deepEqual(next.items.map(x=>x.identifier),['pending-0'],'newly hydrated inventory stays unseen until selected');
  assert.equal(next.cycleReset,false);
});

test('standard IA state from an older deployment cannot inject unresolved rows into a later ready shelf',async()=>{
  const [{SessionRotation}]=await modules,ctx=rotationContext({catalog:[{identifier:'legacy-pending',media:{url:''}},row('A.mp4'),row('B.mp4')],seen:[],cursor:0});
  const object=new SessionRotation(ctx,{});
  const result=await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify({items:[row('C.mp4')],count:3,requirePlayable:true})}));
  const payload=await result.json();
  assert.ok(payload.items.every(x=>x.media?.url));
  assert.equal(payload.items.length,3);assert.equal(payload.catalog.length,4);
});

test('a full legacy metadata window cannot crowd newly resolved IA media out of rotation',async()=>{
  const [{SessionRotation}]=await modules;
  const ctx=rotationContext({catalog:Array.from({length:96},(_,i)=>({identifier:'pending-'+i,media:{url:''}})),seen:[],cursor:0});
  const object=new SessionRotation(ctx,{});
  const result=await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify({items:[row('A.mp4'),row('B.mp4'),row('C.mp4')],count:3,requirePlayable:true})}));
  const payload=await result.json();
  assert.equal(payload.items.length,3);assert.ok(payload.items.every(x=>x.media?.url));
  assert.equal(payload.catalog.length,96,'keep the existing bounded window');
});

test('large IA session catalogs preserve the seen ledger within real storage value limits',async()=>{
  const [{SessionRotation}]=await modules,ctx=rotationContext(),object=new SessionRotation(ctx,{});
  const items=Array.from({length:96},(_,i)=>row('large-'+i+'.mp4',{description:'é'.repeat(2000)}));
  const send=async body=>(await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify(body)}))).json();
  const first=await send({items,count:3,requirePlayable:true});
  const next=await send({items,count:3,requirePlayable:true});
  assert.equal(first.catalogSize,96);assert.equal(next.catalogSize,96);
  assert.ok(next.items.every(item=>!first.items.some(old=>old.identifier===item.identifier)),'overflow must not discard rotation history');
  for(const value of ctx.data.values())assert.ok(Buffer.byteLength(JSON.stringify(value))<128*1024);
});

test('resolved upstream IA shelf survives a separate metadata-only candidate list',async()=>{
  const f=await fixture(),items=[row('ready-A.mp4'),row('ready-B.mp4'),row('ready-C.mp4')];
  f.env.RELAY.fetch=async()=>Response.json({ready:3,items,candidateItems:Array.from({length:96},(_,i)=>row('pending-'+i+'.mp4',{media:{type:'video',url:''}}))});
  const payload=await(await f.request('queue',{channel:'51',serverCatalog:true,sessionId:'separate-ready',count:3})).json();
  assert.equal(payload.ready,3);assert.deepEqual(new Set(payload.items.map(x=>x.identifier)),new Set(items.map(x=>x.identifier)));
  await Promise.all(f.pending);
});

test('one resolved IA item stays playable during rotation outage without padding readiness with metadata',async()=>{
  const f=await fixture();delete f.env.ROTATION;
  f.incoming([row('A-pending.mp4',{media:{type:'video',url:''}}),row('B-pending.mp4',{media:{type:'video',url:''}}),row('Z-ready.mp4')]);
  const payload=await (await f.request('queue',{channel:'51',serverCatalog:true,sessionId:'outage',count:3})).json();
  assert.equal(payload.ready,1);
  assert.deepEqual(payload.items.map(x=>x.identifier),['benson::Z-ready.mp4']);
  assert.equal(payload.candidateItems.length,3);
  await Promise.all(f.pending);
});

test('outage fallback prefers a resolved recent item over an unresolved unseen catalog',async()=>{
  const f=await fixture();delete f.env.ROTATION;
  f.incoming([...Array.from({length:4},(_,i)=>row('pending-'+i+'.mp4',{media:{type:'video',url:''}})),row('ready.mp4')]);
  const payload=await(await f.request('queue',{channel:'51',serverCatalog:true,sessionId:'recent-outage',recentIds:['benson::ready.mp4'],count:3})).json();
  assert.equal(payload.ready,1);assert.equal(payload.items[0].identifier,'benson::ready.mp4');
  await Promise.all(f.pending);
});

test('standard IA handoff repair does not reorder guarded upstream reservations',async()=>{
  const f=await fixture(),candidateItems=[row('B.mp4'),row('C.mp4'),row('D.mp4')];
  f.env.RELAY.fetch=async()=>Response.json({ready:1,items:[row('A.mp4')],candidateItems});
  const payload=await(await f.request('queue',{channel:'10',iaRepair:true,serverCatalog:true,sessionId:'guarded-order',count:3})).json();
  assert.deepEqual(payload.items.map(item=>item.identifier),candidateItems.map(item=>item.identifier));
  await Promise.all(f.pending);
});

test('standard IA shelves balance available series instead of selecting three episodes from one show',async()=>{
  const f=await fixture();
  const rows=['show-A','show-B','show-C'].flatMap(seriesId=>Array.from({length:8},(_,i)=>row(seriesId+'-'+i+'.mp4',{seriesId})));
  f.incoming(rows);const seen=new Set();
  for(let rotation=0;rotation<4;rotation++){
    const payload=await(await f.request('queue',{channel:'51',serverCatalog:true,sessionId:'standard-series',count:3,rotation,diversity:{maxPerFamily:1}})).json();
    assert.equal(payload.items.length,3);assert.equal(new Set(payload.items.map(x=>x.seriesId)).size,3);
    for(const item of payload.items){assert.ok(!seen.has(item.identifier));seen.add(item.identifier);}
  }
  await Promise.all(f.pending);
});

test('IA family diversity does not invent programs or underfill a single-series catalog',async()=>{
  const [{SessionRotation}]=await modules,object=new SessionRotation(rotationContext(),{});
  const rows=Array.from({length:4},(_,i)=>row('only-'+i+'.mp4',{seriesId:'only-show'}));
  const payload=await(await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify({items:rows,count:3,requirePlayable:true,diversity:{maxPerFamily:1}})}))).json();
  assert.equal(payload.items.length,3);assert.ok(payload.items.every(x=>rows.some(r=>r.identifier===x.identifier)));
});

test('generic non-IA rotation retains its existing selection when given diversity fields',async()=>{
  const [{SessionRotation}]=await modules,object=new SessionRotation(rotationContext(),{});
  const rows=['A','A','A','B','C'].map((seriesId,i)=>row('generic-'+i+'.mp4',{seriesId}));
  const payload=await(await object.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify({items:rows,count:3,diversity:{maxPerFamily:1}})}))).json();
  assert.deepEqual(payload.items.map(x=>x.identifier),['benson::generic-0.mp4','benson::generic-1.mp4','benson::generic-2.mp4']);
});

test('an unresolved-only IA catalog reports zero ready without discarding discovery',async()=>{
  const f=await fixture();
  f.incoming([row('A.mp4',{media:{type:'video',url:''}}),row('B.mp4',{media:{type:'video',url:''}})]);
  const payload=await (await f.request('queue',{channel:'51',serverCatalog:true,sessionId:'pending-only',count:3})).json();
  assert.equal(payload.ready,0);assert.equal(payload.items.length,0);assert.equal(payload.candidateItems.length,2);
  await Promise.all(f.pending);
});

test('stored canary reservations cannot resurrect explicit failed media', async () => {
  const f = await fixture(), body = { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'failed', count: 3 };
  const before = await (await f.request('queue', body)).json(); assert.equal(before.items.length, 3);
  f.incoming(before.items.map(item => ({ ...item, media: { ...item.media, verification: 'failed' } })));
  const after = await (await f.request('queue', body)).json();
  assert.equal(after.items.length, 0);
});

test('provider-less relay compaction uses the canonical IA provider identity', async () => {
  const [{ compactCatalogItem }] = await modules;
  assert.equal(compactCatalogItem(row('episode.mp4')).provider, 'Internet Archive');
});

test('audio runtime and geometry exemptions do not admit a failed transport', async () => {
  const [, { qualifyIaFileRecord }] = await modules;
  assert.equal(qualifyIaFileRecord({ identifier: 'radio', media: { type: 'audio', url: 'https://archive.org/download/radio/program.mp3', verification: 'failed', verifiedAt: 1 } }, { iaRepair: true, channel: '920', mediaTypes: ['audio'] }).accepted, false);
});

test('strict audio still requires recent successful transport verification', async () => {
  const [, { qualifyIaFileRecord }] = await modules;
  const item = { identifier: 'radio', media: { type: 'audio', url: 'https://archive.org/download/radio/program.mp3' } };
  const rules = { iaRepair: true, channel: '920', mediaTypes: ['audio'] };
  assert.equal(qualifyIaFileRecord(item, rules).accepted, false);
  assert.equal(qualifyIaFileRecord({ ...item, media: { ...item.media, verification: 'transport', verifiedAt: Date.now() } }, rules).accepted, true);
});

test('repeated start acknowledgements do not double-write watched telemetry', async () => {
  const f = await fixture(), body = { channel: '10', iaRepair: true, serverCatalog: true, sessionId: 'ack', count: 3 };
  const queue = await (await f.request('queue', body)).json(), started = { ...body, id: queue.items[0].identifier, event: 'started' };
  await f.request('playback', started); await f.request('playback', started); await Promise.all(f.pending);
  assert.equal(f.forwarded.filter(path => path === '/ia/played').length, 1);
});
