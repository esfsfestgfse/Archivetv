#!/usr/bin/env node
/* Exercise the exact in-page language gate with representative metadata.
   Static rules are not enough here: YouTube often omits audio-language metadata. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
let failures = 0;

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const text = source.match(/function v2Text\(v\)\{[^\n]+\}/)?.[0];
  const gate = source.match(/function v2YouTubeEnglish\(item\)\{[^\n]+\}/)?.[0];
  if (!text || !gate) {
    console.log(`${file}: language gate extraction: FAIL`);
    failures++;
    continue;
  }
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${text}\n${gate}`, context);
  const cases = [
    ['rejects regional-language channel identity with blank API language', {title:'Baby Looney Tunes compilation cartoon for kids', account:'Cartoon Network India'}, false],
    ['accepts an English cartoon about India from a neutral account', {title:'The History of Animation in India', account:'Archive Television'}, true],
    ['rejects declared non-English audio', {title:'Classic cartoon full episode', defaultAudioLanguage:'es', account:'Cartoon Vault'}, false],
    ['rejects non-Latin titles', {title:'日本のアニメ 完全版', account:'Animation Vault'}, false],
    ['accepts an English full episode from an unbranded account', {title:'Classic Cartoon Full Episode', account:'Cartoon Vault'}, true],
  ];
  for (const [label, item, expected] of cases) {
    const actual = context.v2YouTubeEnglish(item);
    const pass = actual === expected;
    console.log(`${file}: ${label}: ${pass ? 'ok' : `FAIL (got ${actual})`}`);
    if (!pass) failures++;
  }
}

if (failures) process.exitCode = 1;
