#!/usr/bin/env node
/* Probe one representative IA search rail per genre definition. This is a
 * diagnostic companion to audit-ia-channels.js; it never changes the app. */
const fs = require('node:fs');
const path = require('node:path');
const file = (process.argv[2] && !process.argv[2].startsWith('--'))
  ? process.argv[2] : path.join(__dirname, '..', 'the_dial_mobile.html');
const source = fs.readFileSync(file, 'utf8');

function objectBlock(marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const open = source.indexOf('{', start), begin = open + 1;
  let depth = 1, quote = null, escaped = false;
  for (let i = begin; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(begin, i);
  }
  throw new Error(`Unclosed ${marker}`);
}
function list(body, key) { const m=body.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`)); return m?[...m[1].matchAll(/"([^"]*)"/g)].map(x=>x[1]):[]; }
function nums(body, key) { const m=body.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`)); return m?[...m[1].matchAll(/-?\d+/g)].map(x=>+x[0]):null; }
function parseGenres(block) {
  const out={}; let current=null, depth=0;
  for (const line of block.split(/\r?\n/)) {
    if (!current) { const m=line.match(/^\s*([A-Za-z0-9_]+):\s*\{/); if(!m) continue; current={name:m[1],body:line.slice(line.indexOf('{')+1)}; depth=(line.match(/\{/g)||[]).length-(line.match(/\}/g)||[]).length; if(depth<=0){out[current.name]=current.body;current=null;} continue; }
    current.body+='\n'+line; depth+=(line.match(/\{/g)||[]).length-(line.match(/\}/g)||[]).length; if(depth<=0){out[current.name]=current.body;current=null;}
  }
  return Object.fromEntries(Object.entries(out).map(([name,body]) => [name, {
    name, mt:(body.match(/mt:"([^"]+)"/)||[])[1]||'movies', col:list(body,'col'),
    fcol:list(body,'fcol'), subj:list(body,'subj'), era:nums(body,'era')
  }]));
}
function makeQuery(g) {
  const era=g.era||[1930,1990], yr=`year:[${era[0]} TO ${era[1]}]`, subj=g.subj.map(s=>`"${s}"`).join(' OR ');
  if (subj && g.col.length) return `collection:${g.col[0]} AND mediatype:${g.mt} AND subject:(${subj}) AND ${yr}`;
  if (!subj && g.col.length) return `collection:${g.col[0]} AND mediatype:${g.mt} AND ${yr}`;
  if (subj) return `mediatype:${g.mt} AND subject:(${subj}) AND ${yr}`;
  if (g.fcol.length) return `collection:${g.fcol[0]} AND mediatype:${g.mt} AND ${yr}`;
  return `mediatype:${g.mt} AND ${yr}`;
}

async function main(){
const genres=parseGenres(objectBlock('\nconst G={'));
const names=Object.keys(genres);
async function mapWithConcurrency(values, limit, fn) {
  const results = Array(values.length); let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await fn(values[index]);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, values.length)}, worker));
  return results;
}
const results=await mapWithConcurrency(names, 3, async name=>{
  const q=makeQuery(genres[name]);
  const url='https://archive.org/advancedsearch.php?'+new URLSearchParams({q,'fl[]':'identifier,title,year,mediatype,collection,subject','rows':'3','page':'1','output':'json'});
  try{
    const res=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!res.ok) throw new Error(`http ${res.status}`);
    const data=await res.json(), docs=data?.response?.docs||[], total=data?.response?.numFound||0;
    return {name,query:q,status:res.status,total,samples:docs.map(x=>({id:x.identifier,title:x.title,year:x.year,mediatype:x.mediatype}))};
  }catch(error){ return {name,query:q,error:String(error)}; }
});
const report=JSON.stringify({file:path.basename(file),generatedAt:new Date().toISOString(),genres:results},null,2)+'\n';
const oi=process.argv.indexOf('--out');
if(oi>=0&&process.argv[oi+1]){fs.mkdirSync(path.dirname(path.resolve(process.argv[oi+1])),{recursive:true});fs.writeFileSync(path.resolve(process.argv[oi+1]),report);console.log(`Wrote ${process.argv[oi+1]}`);}else console.log(report);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
