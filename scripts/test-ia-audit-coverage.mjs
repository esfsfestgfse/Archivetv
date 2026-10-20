import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const audit=await import('./ia-audit-coverage.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const video=(id,extra={})=>({identifier:id,title:'Original television episode',sourceIdentifier:id.split('::')[0],
  media:{type:'video',url:'https://archive.org/download/'+id.replace('::','/'),runtime:1320,width:640,height:480},...extra});
const rules={channel:'10',mediaTypes:['movies'],minRuntimeSeconds:900};

test('coverage includes every canonical lane and does not call an unchecked lane healthy',()=>{
  assert.equal(typeof audit.buildIaCoverage,'function');
  const lineup={lanes:[{...rules,name:'First'},{...rules,channel:'11',name:'Second'}],aliases:[{channel:'21',canonicalChannel:'20'}]};
  const out=audit.buildIaCoverage(lineup,[],{channels:[]});
  assert.equal(out.lanes.length,2);assert.deepEqual(out.lanes.map(x=>x.status),['unchecked','unchecked']);
  assert.equal(out.aliases.length,1);assert.ok(out.lanes.every(x=>x.visiblePlayback==='unmeasured'));
});

test('catalog depth deduplicates encodings and keeps metadata, URLs and transport proof separate',()=>{
  assert.equal(typeof audit.summarizeIaCatalog,'function');
  const p={items:[video('show::One.mp4')],candidateItems:[video('show::One.mp4'),video('show::One.ia.mp4'),
    video('show::Portrait.mp4',{media:{type:'video',url:'https://archive.org/download/show/Portrait.mp4',runtime:1320,width:360,height:640}}),
    {identifier:'show::Unknown.mp4',title:'Unknown',media:{type:'video',url:'https://archive.org/download/show/Unknown.mp4'}}]};
  const m=audit.summarizeIaCatalog(rules,p);
  assert.equal(m.logicalFiles,3);assert.equal(m.resolvedFiles,3);assert.equal(m.metadataQualified,1);assert.equal(m.transportVerified,0);
  assert.equal(m.needsMetadata,1);assert.equal(m.policyViolations['portrait-media'],1);assert.equal(m.knownQualifiedHours,1320/3600);
});

test('same-title uploads remain duplicate suspects rather than being falsely merged into one episode',()=>{
  const p={items:[],candidateItems:[video('first::Episode1.mp4'),video('second::Episode1.mp4')]};
  const m=audit.summarizeIaCatalog(rules,p);
  assert.equal(m.logicalFiles,2);assert.equal(m.duplicateTitleSuspects,1);
});

test('audio and reviewed original cartoons keep their correct runtime contracts',()=>{
  const cartoon=video('looney-tunes-complete::Duck Amuck.mp4',{title:'Duck Amuck',media:{type:'video',url:'https://archive.org/download/looney-tunes-complete/Duck%20Amuck.mp4',runtime:420,width:640,height:480}});
  assert.equal(audit.summarizeIaCatalog({...rules,channel:'150',minRuntimeSeconds:120},{items:[cartoon]}).metadataQualified,1);
  const audio={identifier:'radio::Track.mp3',title:'A short music recording',media:{type:'audio',url:'https://archive.org/download/radio/Track.mp3',runtime:180}};
  assert.equal(audit.summarizeIaCatalog({channel:'900',mediaTypes:['audio']},{items:[audio]}).metadataQualified,1);
});

test('genuine exhaustion is separated from premature repetition and near-exhaustion underfill',()=>{
  const lineup={lanes:[rules],aliases:[]},payload={items:[video('show::One.mp4')],candidateItems:Array.from({length:20},(_,i)=>video('show::'+i+'.mp4'))};
  const checked=audit.buildIaCoverage(lineup,[{channel:'10',http:200,payload}],{channels:[{channel:'10',rotations:[{ready:1,repeat:true,cycleReset:true}]}]});
  assert.ok(!checked.lanes[0].repairReasons.includes('premature-repeat'));
  assert.ok(!checked.lanes[0].repairReasons.includes('underfilled-unseen-shelf'));
  const bad=audit.buildIaCoverage(lineup,[{channel:'10',http:200,payload}],{channels:[{channel:'10',rotations:[{ready:3,repeat:true,cycleReset:false}]}]});
  assert.ok(bad.lanes[0].repairReasons.includes('premature-repeat'));assert.equal(bad.lanes[0].status,'needs-repair');
});

test('current desktop/mobile inventory parity covers all IA identities and keeps aliases explicit',()=>{
  assert.equal(typeof audit.readIaLineup,'function');
  const d=audit.readIaLineup('the_dial_desktop.html'),m=audit.readIaLineup('the_dial_mobile.html');
  const original=JSON.parse(execFileSync(process.execPath,['scripts/export-ia-manifest.js'],{encoding:'utf8',maxBuffer:16e6}));
  assert.equal(d.lanes.length+d.aliases.length,original.length);assert.equal(d.lanes.length,m.lanes.length);
  assert.deepEqual(d.lanes.map(x=>x.channel).sort(),m.lanes.map(x=>x.channel).sort());
  for(const id of ['22','65','204','705','900'])assert.ok(d.lanes.some(x=>x.channel===id),id+' cannot disappear');
  assert.ok(d.aliases.every(a=>d.lanes.some(x=>x.channel===a.canonicalChannel)));
});

test('a twelve-item catalog exhausting after twelve real plays is shallow, not a premature repeat or broken refill',()=>{
  const rows=Array.from({length:12},(_,i)=>video('show::'+i+'.mp4'));
  const rotations=rows.map((item,i)=>({id:item.identifier,logicalId:item.identifier,ready:Math.min(3,12-i),catalog:12,repeat:false,cycleReset:false}));
  rotations.push({...rotations[0],repeat:true});
  const report=audit.buildIaCoverage({lanes:[rules],aliases:[]},[{channel:'10',http:200,payload:{items:rows.slice(0,3),candidateItems:rows}}],{channels:[{channel:'10',rotations}]});
  const lane=report.lanes[0];
  assert.ok(!lane.repairReasons.includes('premature-repeat'));
  assert.ok(!lane.repairReasons.includes('underfilled-unseen-shelf'));
  assert.equal(lane.observedExhaustionRepeats,1);assert.equal(lane.nearExhaustionShelves,2);
  assert.ok(lane.repairReasons.includes('observed-catalog-exhaustion'));
});

test('audit checkpoints survive a transient Windows rename lock without truncating existing evidence',async()=>{
  assert.equal(typeof audit.writeAuditFile,'function');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ia-audit-checkpoint-')),file=path.join(dir,'report.json');
  fs.writeFileSync(file,'{"old":true}');let attempts=0;
  try{
    await audit.writeAuditFile(file,'{"new":true}',{...fs,renameSync(from,to){
      if(attempts++===0){assert.equal(fs.readFileSync(file,'utf8'),'{"old":true}');throw Object.assign(Error('locked'),{code:'UNKNOWN'});}
      fs.renameSync(from,to);
    }});
    assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{new:true});assert.equal(fs.readdirSync(dir).length,1);
  }finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
});
