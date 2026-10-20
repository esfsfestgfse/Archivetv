#!/usr/bin/env node
/* Whole-lineup diagnostics only. Never imports or mutates production state.
   URL, metadata, transport and decoded-video evidence are separate measures. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {normalizeIaFileRecord,qualifyIaFileRecord} from '../ia_file_contract.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);

export function readIaLineup(htmlPath=path.join(root,'the_dial_desktop.html')) {
  const file=path.resolve(htmlPath);let app,output='';
  const exporter=fs.readFileSync(path.join(root,'scripts/export-ia-manifest.js'),'utf8');
  vm.runInNewContext(exporter,{__dirname:path.join(root,'scripts'),console,URLSearchParams,
    process:{argv:[process.execPath,'scripts/export-ia-manifest.js',file],stdout:{write:s=>{output+=s;}}},
    require(name){return name==='node:vm'?{createContext(c){app=vm.createContext(c);return app;},runInContext:vm.runInContext}:require(name);}},
    {filename:'IA audit: existing exporter',timeout:15000});
  const manifest=JSON.parse(output),contracts=JSON.parse(JSON.stringify(vm.runInContext(`CH.filter(ch=>!ch.source).map(ch=>({channel:String(ch.num),
    canonicalChannel:String(canonicalTuneNum(ch.num)),hiddenAlias:isHiddenConsolidatedMember(ch),
    name:slotFor(ch,0,{preview:true}).show||ch.nm,category:ch.cat}))`,app,{timeout:10000})));
  const byId=new Map(contracts.map(r=>[r.channel,r]));
  if(byId.size!==manifest.length)throw Error('IA inventory has missing or duplicate identities');
  const lanes=[],aliases=[];
  for(const rules of manifest){const c=byId.get(rules.channel);if(!c)throw Error('Unmapped IA channel '+rules.channel);
    if(c.hiddenAlias)aliases.push(c);else lanes.push({...rules,...c});}
  if(aliases.some(a=>!lanes.some(l=>l.channel===a.canonicalChannel)))throw Error('IA alias has no canonical station');
  const html=fs.readFileSync(file,'utf8');
  return {build:html.match(/window\.__ATV_BUILD="([^"]+)"/)?.[1]||'unknown',lanes,aliases,
    promoted:(html.match(/name="realsignal-ia-repair-channels" content="([^"]+)"/)?.[1]||'').split(',').filter(Boolean)};
}

export function summarizeIaCatalog(rules,payload={}) {
  const raw=[...(Array.isArray(payload.items)?payload.items:[]),...(Array.isArray(payload.candidateItems)?payload.candidateItems:[])];
  const records=new Map();
  for(const item of raw){const n=normalizeIaFileRecord(item);if(n.logicalId&&!records.has(n.logicalId))records.set(n.logicalId,n);}
  const policyViolations={},titleCounts=new Map(),families=new Set(),years={};
  let resolvedFiles=0,metadataQualified=0,transportVerified=0,needsMetadata=0,knownSeconds=0;
  const violations=[];
  for(const item of records.values()){
    if(item.media.url)resolvedFiles++;
    const check=qualifyIaFileRecord(item,{...rules,requireTransport:false});
    if(check.accepted){metadataQualified++;knownSeconds+=item.runtimeSeconds||0;}
    else if(check.needsHydration)needsMetadata++;
    else {policyViolations[check.reason]=(policyViolations[check.reason]||0)+1;
      if(violations.length<16)violations.push({id:item.identifier,title:item.title,reason:check.reason});}
    if(check.accepted&&item.verification==='transport'&&item.verifiedAt>Date.now()-86400000&&item.verifiedAt<=Date.now()+60000)transportVerified++;
    const title=String(item.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(title.length>=8)titleCounts.set(title,(titleCounts.get(title)||0)+1);
    families.add(item.seriesTitle||item.seriesId||item.sourceIdentifier);
    const year=Number(item.broadcastYear||item.year);if(year>=1880&&year<=new Date().getFullYear()){const d=Math.floor(year/10)*10;years[d]=(years[d]||0)+1;}
  }
  return {logicalFiles:records.size,resolvedFiles,metadataQualified,transportVerified,needsMetadata,knownQualifiedHours:knownSeconds/3600,
    declaredFamilies:[...families].filter(Boolean).length,declaredDecades:years,
    duplicateTitleSuspects:[...titleCounts.values()].reduce((n,count)=>n+Math.max(0,count-1),0),policyViolations,violations,
    readyUrls:(payload.items||[]).filter(x=>normalizeIaFileRecord(x).media.url).length,
    reportedCatalogDepth:Number(payload.catalogDepth||payload.v2?.catalogSize||payload.candidates)||records.size};
}

export function buildIaCoverage(lineup,snapshots=[],rotationAudit={channels:[]}) {
  const ids=new Set(lineup.lanes.map(x=>x.channel));
  if(ids.size!==lineup.lanes.length)throw Error('Duplicate canonical IA channel');
  const observed=new Map(snapshots.map(x=>[String(x.channel),x])),rotated=new Map((rotationAudit.channels||[]).map(x=>[String(x.channel),x]));
  for(const id of [...observed.keys(),...rotated.keys()])if(!ids.has(id))throw Error('Evidence outside canonical IA inventory: '+id);
  const lanes=lineup.lanes.map(rule=>{
    const snapshot=observed.get(rule.channel),rotation=rotated.get(rule.channel),rounds=rotation?.rotations||[];
    const measured=snapshot?summarizeIaCatalog(rule,snapshot.payload||{}):null,reasons=[];
    if(snapshot&&(snapshot.error||snapshot.http!==200))reasons.push('snapshot-failed');
    if(measured&&measured.readyUrls===0)reasons.push('empty-ready-shelf');
    if(measured&&measured.logicalFiles<5)reasons.push('shallow-observed-catalog');
    if(measured&&Object.keys(measured.policyViolations).length)reasons.push('known-policy-violation');
    if(rounds.some(r=>r.error||r.skipError||r.rejected?.length))reasons.push('rotation-or-skip-failed');
    const selected=new Set();let observedExhaustionRepeats=0,nearExhaustionShelves=0,prematureRepeats=0,underfilled=0;
    for(const r of rounds){
      const depth=Number(r.catalog)||0,remaining=depth?Math.max(0,depth-selected.size):null;
      const exhausted=r.cycleReset===true||(remaining===0&&depth>0);
      if(r.repeat){if(exhausted)observedExhaustionRepeats++;else prematureRepeats++;}
      if(r.ready<3&&!r.error&&!r.cycleReset){
        if(remaining!==null&&remaining>0&&r.ready>=remaining)nearExhaustionShelves++;else underfilled++;
      }
      if(r.logicalId||r.id)selected.add(r.logicalId||r.id);
    }
    if(prematureRepeats)reasons.push('premature-repeat');
    if(underfilled)reasons.push('underfilled-unseen-shelf');
    if(observedExhaustionRepeats)reasons.push('observed-catalog-exhaustion');
    const times=rounds.filter(r=>Number.isFinite(r.ms)).map(r=>r.ms).sort((a,b)=>a-b);
    return {channel:rule.channel,name:rule.name,category:rule.category,status:!snapshot&&!rounds.length?'unchecked':reasons.length?'needs-repair':'tested',
      repairReasons:reasons,catalog:measured,rotations:rounds.length,uniqueSelected:rotation?.uniqueSelected??null,
      repeatedSelections:rounds.filter(r=>r.repeat).length,genuineExhaustionRepeats:rounds.filter(r=>r.repeat&&r.cycleReset).length,
      observedExhaustionRepeats,nearExhaustionShelves,
      medianQueueMs:times.length?times[Math.floor(times.length/2)]:null,p95QueueMs:times.length?times[Math.ceil(times.length*.95)-1]:null,
      visiblePlayback:'unmeasured',editorialGenreReview:'unmeasured',snapshotRelease:snapshot?.release||null};
  });
  return {at:new Date().toISOString(),build:lineup.build,measurement:'Observed catalog windows and session/skip selection; NOT total Archive inventory or decoded-device certification',
    aliases:lineup.aliases,summary:{lanes:lanes.length,unchecked:lanes.filter(l=>l.status==='unchecked').length,tested:lanes.filter(l=>l.status==='tested').length,
      needsRepair:lanes.filter(l=>l.status==='needs-repair').length},lanes};
}

export function renderIaCoverage(report){
  const esc=x=>String(x??'—').replace(/\|/g,'/').replace(/[\r\n]+/g,' ');
  return '# Whole-lineup IA coverage\n\nInventory build: '+report.build+' · '+report.at+'\n\n'+report.measurement+'. Snapshot releases are recorded per lane in the JSON; the inventory build is not proof that a snapshot used that release. Metadata-qualified hours and declared decades are not licensing, transport or decoded-frame proof. Same-title uploads are suspects, not automatically the same episode. Missing metadata remains unknown, not bad content.\n\n'+
    JSON.stringify(report.summary)+'\n\n| Ch | Station | Status | Observed files | Metadata-qualified | Transport-proven | Known hours | Families | Title duplicate suspects | Rotations / unique | Repair reasons |\n|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|\n'+
    report.lanes.map(r=>{const c=r.catalog;return '| '+[r.channel,r.name,r.status,c?.logicalFiles,c?.metadataQualified,c?.transportVerified,c?c.knownQualifiedHours.toFixed(1):null,c?.declaredFamilies,c?.duplicateTitleSuspects,r.rotations+' / '+(r.uniqueSelected??'—'),r.repairReasons.join(', ')||'No issue caught; editorial/playback review unmeasured'].map(esc).join(' | ')+' |';}).join('\n')+
    '\n\n## Legacy aliases (not counted twice)\n\n'+report.aliases.map(a=>a.channel+' → '+a.canonicalChannel+' · '+a.name).join('\n')+'\n';
}

export async function writeAuditFile(file,text,ops=fs){
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{
    for(let attempt=0;;attempt++){
      try{ops.writeFileSync(temp,text);ops.renameSync(temp,file);return;}
      catch(error){if(attempt>=3||!['UNKNOWN','EBUSY','EPERM','EACCES'].includes(error.code))throw error;
        await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)));}
    }
  }finally{if(ops.existsSync(temp))ops.unlinkSync(temp);}
}

async function main(){
  const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
  const lineup=readIaLineup(arg('--html',path.join(root,'the_dial_desktop.html')));
  const out=path.resolve(arg('--out','artifacts/ia-coverage-5620.json')),snapshotPath=out.replace(/\.json$/,'.catalogs.json');
  if(out===snapshotPath)throw Error('--out must end with .json');
  const rotationPath=arg('--rotations','');
  const snapshots=fs.existsSync(snapshotPath)?JSON.parse(fs.readFileSync(snapshotPath,'utf8')).snapshots:[];
  const publish=async()=>{const rotations=fs.existsSync(rotationPath)?JSON.parse(fs.readFileSync(rotationPath,'utf8')):{channels:[]};
    const report=buildIaCoverage(lineup,snapshots,rotations);fs.mkdirSync(path.dirname(out),{recursive:true});
    await writeAuditFile(snapshotPath,JSON.stringify({at:new Date().toISOString(),build:lineup.build,snapshots}));
    await writeAuditFile(out,JSON.stringify(report,null,2));await writeAuditFile(out.replace(/\.json$/,'.md'),renderIaCoverage(report));return report;};
  await publish();
  if(args.includes('--capture'))for(const rule of lineup.lanes){
    if(snapshots.some(s=>s.channel===rule.channel))continue;
    const row={channel:rule.channel},started=performance.now();
    try{const response=await fetch(arg('--endpoint','https://realsignal-api.tdy1990.workers.dev/api/v3')+'/ia/queue',{
      method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),
      body:JSON.stringify({...rule,serverCatalog:true,iaRepair:lineup.promoted.includes(rule.channel),sessionId:'coverage-'+crypto.randomUUID(),viewerRecentIds:[],count:3})});
      row.http=response.status;row.release=response.headers.get('x-realsignal-release');const p=await response.json();
      row.payload={items:p.items||[],candidateItems:p.candidateItems||[],ready:p.ready,candidates:p.candidates,catalogDepth:p.catalogDepth,v2:p.v2};
    }catch(error){row.error=error.message;}
    row.ms=Math.round(performance.now()-started);snapshots.push(row);await publish();
    if(snapshots.length%20===0)console.log(JSON.stringify({captured:snapshots.length,total:lineup.lanes.length}));
  }
  const report=await publish();console.log(JSON.stringify({out,summary:report.summary}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
