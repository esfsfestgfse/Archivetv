import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { iaGameShowEraAllowed, qualifyIaFileRecord } from '../ia_file_contract.js';
const endpoint=(process.argv[2]||'http://127.0.0.1:4196/api/v3').replace(/\/$/,'');
const rounds=Number(process.argv[3])||12;
const manifest=JSON.parse(execFileSync(process.execPath,['scripts/export-ia-manifest.js'],{encoding:'utf8',maxBuffer:16*1024*1024}));
const report={endpoint,at:new Date().toISOString(),measurement:'transport-qualified queues and acknowledged skips; decoded frames tested separately',channels:[]};
const request=async(path,body)=>{
  const response=await fetch(endpoint+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const payload=await response.json();
  if(!response.ok)throw Error(path+' HTTP '+response.status+' '+JSON.stringify(payload));
  return payload;
};
for(const channel of ['12','22']){
  const rules=manifest.find(row=>row.channel===channel);
  const sessionId='game-show-cert-'+channel+'-'+crypto.randomUUID();
  const seen=new Set(),families=new Set();
  const result={channel,name:rules.name,rotations:[]};
  for(let round=0;round<rounds;round++){
    const started=performance.now();
    const payload=await request('/ia/queue',{...rules,sessionId,iaRepair:true,serverCatalog:true,count:3,minRuntimeSeconds:900,rotation:round});
    const row={round,queueMs:Math.round(performance.now()-started),ready:payload.ready,catalog:payload.v2?.catalogSize||payload.candidates,
      titles:[],years:[],repeats:0,rejected:[]};
    for(const [index,item] of (payload.items||[]).entries()){
      const qualified=qualifyIaFileRecord(item,{...rules,iaRepair:true,minRuntimeSeconds:900});
      const identity=qualified.item.logicalId;
      if(index===0){
        if(seen.has(identity))row.repeats++;
        seen.add(identity);
        families.add(item.seriesTitle||item.seriesId||String(item.title).split(/\s+[·—]\s+/)[0]);
      }
      row.titles.push(item.title);row.years.push(item.year);
      if(!qualified.accepted||!iaGameShowEraAllowed(item,channel))row.rejected.push(qualified.reason);
      if(index===0)await request('/ia/playback',{channel,sessionId,id:item.identifier,event:'skipped'});
    }
    result.rotations.push(row);console.log(JSON.stringify({channel,...row}));
    if(row.ready<1||row.repeats||row.rejected.length)throw Error('game-show certification failed: '+JSON.stringify(row));
  }
  result.uniquePrograms=seen.size;result.uniqueSeries=families.size;report.channels.push(result);
}
fs.writeFileSync(new URL('../artifacts/gameshow-split-certification.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,channels:report.channels.map(row=>({channel:row.channel,uniquePrograms:row.uniquePrograms,uniqueSeries:row.uniqueSeries,catalog:row.rotations.at(-1).catalog}))}));
