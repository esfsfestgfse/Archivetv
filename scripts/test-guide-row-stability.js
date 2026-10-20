#!/usr/bin/env node
/*
  Background queue warming must never replace guide buttons that a viewer may
  already be clicking. This is deliberately a source contract: browser tests
  cover the whole UI, while this keeps the race from returning unnoticed.
*/
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = ['the_dial_desktop.html', 'the_dial_mobile.html'];
let failures = 0;

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing ${signature}`);
  const open = source.indexOf('{', start);
  let depth = 1;
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`Unclosed ${signature}`);
}

for (const name of files) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  const guideListingBody = functionBody(source, 'function guideListing(ch)');
  const checks = [
    ['guide rows carry a stable channel number', source.includes('row.dataset.channelNum=ch.num')],
    ['incremental guide refresh exists', source.includes('function refreshGuideRows()')],
    ['incremental refresh preserves guide button DOM', !functionBody(source, 'function refreshGuideRows()').includes('innerHTML=')],
    ['queue refill uses incremental guide refresh', functionBody(source, 'async function refillIAQueue(').includes('refreshGuideRows()')],
    ['guide warming uses incremental guide refresh', functionBody(source, 'function primeGuideQueues(').includes('refreshGuideRows()')],
    ['initial guide render still builds the rows', functionBody(source, 'function renderGuide()').includes('renderRail()')],
    ['guide has a dedicated movies lane', source.includes('id:"movies"')],
    ['stale decade pilot lane is not a browse category', !source.includes('id:"decades"')],
    ['guide keeps canonical rows and numbers stable while grouping families', source.includes('canonical channels · ') && source.includes('numbers stable')],
    ['core family labels are explicit', source.includes('function guideFamilyLabel(ch)') && /Live television/.test(source) && /Live sports/.test(source) && /Live weather/.test(source) && /Live radio/.test(source)],
    ['live stream updates feed current/next guide data', source.includes('function noteLiveStreamGuide(c)') && guideListingBody.includes('live.next')],
    ['IA guide reports the rolling hot shelf', guideListingBody.includes('IA_READY_TARGET') && /hot replacements|HOT SHELF/.test(guideListingBody)],
    ['IA guide has no stale five-show warming promise', !guideListingBody.includes('FIVE-SHOW BUFFER WARMING')],
  ];
  for (const [label, passed] of checks) {
    console.log(`${name}: ${label}: ${passed ? 'ok' : 'FAIL'}`);
    if (!passed) failures++;
  }
}
if (failures) process.exitCode = 1;

// Execute the same channel declarations and browse functions as the client.
// Displayed canonical labels must remain searchable after a real merge.
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
function guideRuntime(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const context = {window:{},location:{search:''},URLSearchParams,console,sportsEra:'all',favOnly:false,
    localStorage:{getItem:()=>null,setItem:()=>{}}};
  vm.createContext(context);
  const marker = source.indexOf('window.__atvIAManifest=function()');
  const end = source.indexOf('\nif(new URLSearchParams(location.search)',marker);
  vm.runInContext(source.slice(source.indexOf('\nconst FNOT=')+1,end),context);
  vm.runInContext(source.slice(source.indexOf('var catFilter='),source.indexOf('window.__chanStatus=window.__chanStatus||{};')),context);
  return (query,category='all')=>{
    context.window.__gQuery=query;context.catFilter=category;
    return Array.from(vm.runInContext('visibleChannels().map(ch=>ch.num)',context));
  };
}
for (const file of files) {
  test(file+': merged guide cards are searchable by their displayed canonical label',()=>{
    const search=guideRuntime(file);
    for(const [query,number] of [['Courtroom TV',20],['Cooking & Food',201],['Travel & People',206],
      ['Newsreel & Current Affairs',210],['Nature & Earth',212],['Space & NASA',213]])
      assert.deepEqual(search(query),[number],query+' must resolve to its single canonical card');
    assert.deepEqual(search('  COURTROOM TV  ','movies'),[20],'search remains case-insensitive and crosses categories');
  });
  test(file+': legacy channel names and number searches still resolve without restoring merged duplicates',()=>{
    const search=guideRuntime(file);
    assert.deepEqual(search('The Court Room'),[20]);
    assert.deepEqual(search('Classic Cartoons'),[150]);
    assert.ok(search('20').includes(20));
    const all=search('');assert.ok(all.includes(20));assert.ok(!all.includes(21));
    assert.equal(new Set(all).size,all.length);
  });
}
