const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('afterglow_ais_relay_worker.js', 'utf8');
const start = source.indexOf('function queueKey(value)');
const end = source.indexOf('\nfunction queueEraKey', start);
if (start < 0 || end < 0) throw new Error('family parser boundary not found');
const context = { module: { exports: {} } };
vm.runInNewContext(`${source.slice(start, end)}\nmodule.exports = { queueTitleFamily };`, context);
const { queueTitleFamily } = context.module.exports;

const family = (title, sourceIdentifier = '') => queueTitleFamily({ title, sourceIdentifier, identifier: title });
const assertSame = (label, values) => {
  const actual = values.map((value) => value);
  if (new Set(actual).size !== 1) throw new Error(`${label}: ${JSON.stringify(actual)}`);
};
const assertDifferent = (label, left, right) => {
  if (left === right) throw new Error(`${label}: both resolved to ${left}`);
};

assertSame('dated 1960s episodes', [
  family("1960's Television: ''Ozzie and Harriet'' (''A Letter About Harriet'', 1 April 1964)"),
  family("1960's Television: ''Ozzie and Harriet'' (''The Lost Episode'', 8 May 1965)"),
]);
assertSame('broadcast-date episodes', [
  family("Brian Henderson's Bandstand - 8 June 1963"),
  family("Brian Henderson's Bandstand - 19 November 1966"),
]);
assertSame('complete-series files', [
  family('The Net (Complete TV Series) 1998-1999 · The Net - S01E18 - Y2K'),
  family('The Net (Complete TV Series) 1998-1999 · The Net - S01E19 - Zero'),
]);
assertSame('expanded Father Ted files', [
  family('Father Ted (1995) Complete Series · Father Ted S1 E01 - Good Luck Father Ted', 'father-ted_202601'),
  family('Father Ted (1995) Complete Series · Father Ted S3 E04 - The Mainland', 'father-ted_202601'),
]);
assertDifferent('different shows remain different', family('Ozzie and Harriet - 1 April 1964'), family('As the World Turns - 21 April 1961'));
console.log('IA family inference: passed');
