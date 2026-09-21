#!/usr/bin/env node
/* Safe client canary contract: V2 remains the default and V3 is opt-in. */
const fs = require('node:fs');
const path = require('node:path');

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  if (!source.includes("new URLSearchParams(location.search).get('v3')==='1'")) throw new Error(`${file}: missing opt-in V3 flag`);
  if (!source.includes('api/v3') || !source.includes('api/v2')) throw new Error(`${file}: missing versioned API paths`);
  if (!source.includes('RS_V3_CANARY?')) throw new Error(`${file}: V3 flag does not select API base`);
}
console.log('V3 client canary contract passed: V2 default preserved; V3 is opt-in.');
