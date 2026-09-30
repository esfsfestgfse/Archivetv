#!/usr/bin/env node
/* Verify the family-aware IA shelf selector without contacting Archive. */
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'afterglow_ais_relay_worker.js'), 'utf8');
const start = source.indexOf('function familyBalancedIaWindow');
const end = source.indexOf('function orderedIaEmergencySeeds', start);
if (start < 0 || end < 0) throw new Error('familyBalancedIaWindow was not found');

const context = {
  queueDiversityKeys: (item) => ({ family: item.family || '' }),
  iaPlayableIdentity: (item) => item.id || item.identifier || '',
};
vm.runInNewContext(source.slice(start, end) +
  '\nthis.familyBalancedIaWindow = familyBalancedIaWindow;', context);

const shelf = context.familyBalancedIaWindow([
  { id: 'a-1', identifier: 'a-1', family: 'alpha' },
  { id: 'a-2', identifier: 'a-2', family: 'alpha' },
  { id: 'b-1', identifier: 'b-1', family: 'beta' },
  { id: 'c-1', identifier: 'c-1', family: 'gamma' },
  { id: 'b-2', identifier: 'b-2', family: 'beta' },
  { id: 'a-3', identifier: 'a-3', family: 'alpha' },
], 0, 5, 1);
const firstPassFamilies = new Set(shelf.slice(0, 3).map((item) => item.family));
if (shelf.length !== 5 || firstPassFamilies.size !== 3) throw new Error('family spread did not precede shelf fill');

const sparse = context.familyBalancedIaWindow([
  { id: 'only-1', identifier: 'only-1', family: 'only-show' },
  { id: 'only-2', identifier: 'only-2', family: 'only-show' },
], 0, 5, 1);
if (sparse.length !== 2) throw new Error('sparse verified catalog was padded with invalid rows');

console.log('IA family rotation: passed');
