/* Real queue/skip canary. This measures transport admission, not decoded frames. */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {qualifyIaFileRecord} from '../ia_file_contract.js';
const endpoint=(process.argv[2]||'http://127.0.0.1:4197/api/v3').replace(/\/$/,'');
const channels=(process.argv[3]||'10,150').split(','),rounds=Number(process.argv[4])||16;
const manifest=JSON.parse(execFileSync(process.execPath,['scripts/export-ia-manifest.js'],{encoding:'utf8',maxBuffer:16e6}));
const report={endpoint,at:new Date().toISOString(),measurement:'transport-qualified queues and acknowledged skips; not device decode certification',channels:[]};
const post=async(route,body)=>{
  const response=await fetch(endpoint+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const result=await response.json();if(!response.ok)throw Error(route+' HTTP '+response.status);return result;
};
for(const channel of channels){
  const rules=manifest.find(row=>row.channel===channel);if(!rules)throw Error('unknown channel '+channel);
  const sessionId='station-cert-'+channel+'-'+crypto.randomUUID(),seen=new Set(),families=new Set();
  const result={channel,name:rules.name,rotations:[]};
  for(let round=0;round<rounds;round++){
    const start=performance.now(),payload=await post('/ia/queue',{...rules,iaRepair:true,serverCatalog:true,sessionId,count:3,rotation:round});
    const checks=(payload.items||[]).map(item=>qualifyIaFileRecord(item,{...rules,iaRepair:true})),item=checks[0]?.item;
    const row={round,ms:Math.round(performance.now()-start),ready:checks.length,catalog:payload.v2?.catalogSize||payload.candidates||0,
      title:item?.title,repeat:item&&seen.has(item.logicalId),reset:!!payload.v2?.cycleReset,rejected:checks.filter(check=>!check.accepted).map(check=>check.reason)};
    result.rotations.push(row);console.log(JSON.stringify({channel,...row}));
    if(!item||row.repeat||row.rejected.length)throw Error('station rotation failed: '+JSON.stringify(row));
    seen.add(item.logicalId);families.add(String(item.title||'').split(/\s+[·—]\s+/)[0]);
    await post('/ia/playback',{channel,sessionId,id:item.identifier,event:'skipped'});
  }
  result.uniqueEpisodes=seen.size;result.uniqueTitleFamilies=families.size;report.channels.push(result);
}
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/ia-station-rotation-certification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,channels:report.channels.map(row=>({channel:row.channel,episodes:row.uniqueEpisodes,titleFamilies:row.uniqueTitleFamilies,catalog:row.rotations.at(-1).catalog}))}));
