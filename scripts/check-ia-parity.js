#!/usr/bin/env node
/* Keep the shared IA catalog identical across the mobile and desktop builds. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mobile = fs.readFileSync(path.join(root, 'the_dial_mobile.html'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'the_dial_desktop.html'), 'utf8');

function blockAfter(source, marker, open, close) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const begin = source.indexOf(open, start) + 1;
  let depth = 1, quote = null, escaped = false;
  for (let i = begin; i < source.length; i++) {
    const char = source[i];
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = null; continue; }
    if (char === '/' && source[i + 1] === '/') { const end = source.indexOf('\n', i + 2); if (end < 0) break; i = end; continue; }
    if (char === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error(`Unclosed comment after ${marker}`); i = end + 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === open) depth++;
    if (char === close && --depth === 0) return source.slice(begin, i);
  }
  throw new Error(`Unclosed ${marker}`);
}
function normalize(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '').replace(/\s+/g, '');
}
function fingerprint(source, marker, open, close) {
  return crypto.createHash('sha256').update(normalize(blockAfter(source, marker, open, close))).digest('hex');
}

const sections = [
  ['genre definitions', '\nconst G={', '{', '}'],
  ['program definitions', '\nconst PROGRAM =', '{', '}'],
];
let failures = 0;
for (const [name, marker, open, close] of sections) {
  const same = fingerprint(mobile, marker, open, close) === fingerprint(desktop, marker, open, close);
  console.log(`${name}: ${same ? 'in parity' : 'MISMATCH'}`);
  if (!same) failures++;
}
if (failures) process.exitCode = 1;
