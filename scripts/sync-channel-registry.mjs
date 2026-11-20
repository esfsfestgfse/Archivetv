import fs from 'node:fs';
import { SOURCE_PROFILE_REGISTRY, CH } from '../channel_registry.js';

const args = process.argv.slice(2);
if (args.length > 1 || args.length && args[0] !== '--write') throw new Error('Use --write to regenerate the two browser builds');
const write = args[0] === '--write';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const lf = value => value.replace(/\r\n/g, '\n');
const canonical = lf(read('channel_registry.js'));
const projection = lf(read('source_browser_profiles.template')).replace(/@source\(([a-z0-9-]+),(\w+)\)@/g, (_, profile, field) => {
  const rules = SOURCE_PROFILE_REGISTRY[profile];
  if (!rules || !Object.hasOwn(rules, field)) throw new Error('Missing shared source field ' + profile + '.' + field);
  return JSON.stringify(rules[field]);
});
if (projection.includes('@source(') || /<\/script/i.test(projection)) throw new Error('Invalid inline source profile projection');

const sections = [
  ['const CAT={', '};'],
  ['const CH=[', '\n];'],
  ['const CHANNEL_META={', '\n};'],
  ['var CAT_ORDER=[', '];'],
];
function bounds(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error('Missing registry section ' + start);
  return [from, to + end.length];
}
function slice(source, start, end) {
  const [from, to] = bounds(source, start, end);
  return source.slice(from, to);
}
const replacements = sections.map(([start, end]) => [start, end, slice(canonical, start, end)]);
for (const channel of CH) {
  if (channel.previewKey && !Object.hasOwn(SOURCE_PROFILE_REGISTRY, channel.previewKey)) throw new Error('Missing profile for channel ' + channel.num);
}

let drift = false;
for (const surface of ['desktop', 'mobile']) {
  const name = 'the_dial_' + surface + '.html';
  const raw = read(name), original = lf(raw);
  let next = original;
  for (const [start, end, value] of replacements) {
    const [from, to] = bounds(next, start, end);
    next = next.slice(0, from) + value + next.slice(to);
  }
  const sourceStart = next.indexOf('const V2_PREVIEW_PROFILES=');
  const sourceEnd = next.indexOf('/* Black Stage uses', sourceStart);
  if (sourceStart < 0 || sourceEnd < sourceStart || !projection.startsWith('const V2_PREVIEW_PROFILES=')) throw new Error('Missing source profiles in ' + name);
  next = next.slice(0, sourceStart) + projection + next.slice(sourceEnd);
  if (next === original) continue;
  drift = true;
  if (write) {
    fs.writeFileSync(new URL('../' + name, import.meta.url), raw.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
  } else console.error(name + ' differs from the shared channel registry. Run node scripts/sync-channel-registry.mjs --write');
}
if (!write && drift) process.exitCode = 1;
else console.log('Shared channel registry covers ' + CH.length + ' channels and both browser builds.');
