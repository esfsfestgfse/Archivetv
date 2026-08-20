#!/usr/bin/env node
/*
 * Static IA channel audit.
 *
 * This intentionally does not call Internet Archive. It inventories the
 * program contract first, so live endpoint results can be added later without
 * confusing query-design defects with temporary provider outages.
 */
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const file = (process.argv[2] && !process.argv[2].startsWith('--'))
  ? process.argv[2] : path.join(repo, 'the_dial_mobile.html');
const source = fs.readFileSync(file, 'utf8');

function blockAfter(marker, open, close) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const bodyStart = source.indexOf(open, start) + open.length;
  let depth = 1;
  let quote = null;
  let escaped = false;
  for (let i = bodyStart; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') { const end = source.indexOf('\n', i + 2); if (end < 0) break; i = end; continue; }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error(`Unclosed comment after ${marker}`); i = end + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    if (c === close && --depth === 0) return source.slice(bodyStart, i);
  }
  throw new Error(`Unclosed ${marker}`);
}

function parseArray(text, key) {
  const m = text.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/-?\d+/g)].map(x => Number(x[0])) : null;
}

function parseQuotedList(text, key) {
  const m = text.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1]) : [];
}

const chBlock = blockAfter('const CH=[', '[', ']');
const channels = [...chBlock.matchAll(/\{nm:"([^"]+)",\s*num:(\d+)([^}]*)\}/g)]
  .map(m => {
    const tail = m[3];
    return {
      num: Number(m[2]), name: m[1], category: (tail.match(/cat:"([^"]+)"/) || [])[1] || null,
      gl: (tail.match(/gl:"([^"]+)"/) || [])[1] || null,
      profile: (tail.match(/profile:"([^"]+)"/) || [])[1] || null,
      era: parseArray(tail, 'era'),
      source: (tail.match(/source:"([^"]+)"/) || [])[1] || null,
      ns: (tail.match(/ns:"([^"]+)"/) || [])[1] || null,
    };
  });

/* The source contains historical comments that mention `const G={`. Anchor on
 * the actual line-start declaration rather than the comment text. */
const gBlock = blockAfter('\nconst G={', '{', '}');
const genres = {};
for (const line of gBlock.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+):\s*\{(.*)\},?\s*(?:\/\/.*)?$/);
  if (!m) continue;
  const body = m[2];
  genres[m[1]] = {
    mt: (body.match(/mt:"([^"]+)"/) || [])[1] || null,
    col: parseQuotedList(body, 'col'), fcol: parseQuotedList(body, 'fcol'),
    subj: parseQuotedList(body, 'subj'), era: parseArray(body, 'era'),
    subjRequired: /subjRequired:true/.test(body), noBlindFallback: /noBlindFallback:true/.test(body),
  };
}

const metadataNames = new Set([...source.matchAll(/^\s*"([^"]+)":\s*\{/gm)].map(m => m[1]));
const programStart = source.indexOf('\nconst PROGRAM =');
const programNames = new Set(programStart >= 0
  ? [...source.slice(programStart).matchAll(/^\s*"([^"]+)":\s*\{/gm)].map(m => m[1])
  : []);
const iaChannels = channels.filter(c => !c.source && (c.gl || c.profile));
const issues = [];
for (const c of iaChannels) {
  const g = c.gl ? genres[c.gl] : null;
  const hasProgram = programNames.has(c.name);
  if (c.gl && !g && !hasProgram) issues.push({severity: 'P0', channel: c, issue: `Missing genre definition G.${c.gl} and no PROGRAM override`});
  if (!metadataNames.has(c.name)) issues.push({severity: 'P2', channel: c, issue: 'Missing CHANNEL_META description'});
  if (g && !hasProgram) {
    if (!g.era && !c.era) issues.push({severity: 'P1', channel: c, issue: 'No era constraint'});
    if (!g.col.length && !g.fcol.length && !g.subj.length) issues.push({severity: 'P1', channel: c, issue: 'Unscoped query family'});
    if (!g.subjRequired && !g.noBlindFallback && g.subj.length) issues.push({severity: 'P2', channel: c, issue: 'Subject terms can fall back to a broad mediatype query'});
  }
}

const duplicateGenres = Object.entries(iaChannels.reduce((m, c) => { if (c.gl) (m[c.gl] ||= []).push(c.name); return m; }, {}))
  .filter(([, names]) => names.length > 1);

const report = {
  file: path.relative(repo, file), generatedAt: new Date().toISOString(),
  totals: { channels: channels.length, iaChannels: iaChannels.length, liveChannels: channels.filter(c => c.source).length, genres: Object.keys(genres).length },
  channels: iaChannels.map(c => ({...c, genre: c.gl ? genres[c.gl] || null : null, program: programNames.has(c.name), metadata: metadataNames.has(c.name)})),
  duplicateGenres: Object.fromEntries(duplicateGenres), issues,
};

const outIndex = process.argv.indexOf('--out');
if (outIndex >= 0 && process.argv[outIndex + 1]) {
  const outBase = path.resolve(process.argv[outIndex + 1]);
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  fs.writeFileSync(`${outBase}.json`, JSON.stringify(report, null, 2) + '\n');
  const rows = report.channels.map(c => {
    const flags = [];
    if (c.program) flags.push('PROGRAM');
    if (c.genre) flags.push(c.genre.mt || 'genre');
    if (!c.metadata) flags.push('missing metadata');
    return `| ${c.num} | ${c.name} | ${c.gl || c.profile || '—'} | ${flags.join(', ') || '—'} |`;
  });
  const issueRows = issues.map(i => `| ${i.severity} | ${i.channel.num} | ${i.channel.name} | ${i.issue} |`);
  const md = [
    '# Internet Archive channel audit', '',
    `Generated: ${report.generatedAt}`, '',
    `Inventory: ${report.totals.iaChannels} IA channels out of ${report.totals.channels} total channels; ${report.totals.genres} base genre definitions.`, '',
    '## Findings', '',
    '| Severity | Channel | Name | Finding |', '|---|---:|---|---|', ...issueRows, '',
    '## IA inventory', '',
    '| Ch | Channel | Mapping | Contract |', '|---:|---|---|---|', ...rows, '',
  ].join('\n');
  fs.writeFileSync(`${outBase}.md`, md + '\n');
  console.log(`Wrote ${outBase}.json and ${outBase}.md`);
}

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`IA channels: ${report.totals.iaChannels}/${report.totals.channels}`);
  console.log(`Genre definitions: ${report.totals.genres}`);
  console.log(`Issues: ${issues.length}`);
  for (const i of issues) console.log(`${i.severity} ${i.channel.num} ${i.channel.name}: ${i.issue}`);
}

if (issues.some(i => i.severity === 'P0')) process.exitCode = 1;
