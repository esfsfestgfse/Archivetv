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
  const checks = [
    ['guide rows carry a stable channel number', source.includes('row.dataset.channelNum=ch.num')],
    ['incremental guide refresh exists', source.includes('function refreshGuideRows()')],
    ['incremental refresh preserves guide button DOM', !functionBody(source, 'function refreshGuideRows()').includes('innerHTML=')],
    ['queue refill uses incremental guide refresh', functionBody(source, 'async function refillIAQueue(').includes('refreshGuideRows()')],
    ['guide warming uses incremental guide refresh', functionBody(source, 'function primeGuideQueues(').includes('refreshGuideRows()')],
    ['initial guide render still builds the rows', functionBody(source, 'function renderGuide()').includes('renderRail()')],
  ];
  for (const [label, passed] of checks) {
    console.log(`${name}: ${label}: ${passed ? 'ok' : 'FAIL'}`);
    if (!passed) failures++;
  }
}
if (failures) process.exitCode = 1;
