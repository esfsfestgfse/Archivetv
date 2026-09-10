const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const start = html.indexOf('function v2AspectRatio(');
  const end = html.indexOf('\nfunction v2Landscape', start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  assert.equal(context.v2AspectRatio('<iframe width="1280" height="720"></iframe>'), 16 / 9);
  assert.equal(context.v2AspectRatio({ embedHtml: '<iframe width="720" height="1280"></iframe>' }), 9 / 16);
  assert.equal(context.v2AspectRatio({ player: 'unused' }), 0);
  console.log(file + ': source embed aspect-ratio parsing passed');
}
