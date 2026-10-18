const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
function relay(){
  const s={console,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,Date,setTimeout,clearTimeout};
  vm.createContext(s);vm.runInContext(fs.readFileSync(path.join(root,'afterglow_ais_relay_worker.js'),'utf8').replace('export default','const worker=')+
    ';globalThis.f={iaRepairCollectionSeeds,orderedIaEmergencySeeds,queueTitleFamily};',s);return s.f;
}
test('broad stations retain deep, interleaved file-level recovery without waiting for collection discovery',()=>{
  const f=relay();
  for(const channel of ['10','150']){
    const rows=f.orderedIaEmergencySeeds(channel,0).filter(row=>row.media?.fileName);
    assert.ok(rows.length>=96,channel+' must expose a deep reviewed file bank on cold recovery');
    assert.ok(new Set(rows.map(row=>row.sourceIdentifier)).size>=6,'multiple series must remain available');
    assert.ok(new Set(rows.slice(0,6).map(row=>row.sourceIdentifier)).size>=4,'recovery must interleave shows');
  }
});
test('a guest appearance does not change the episode series identity',()=>{
  const f=relay();
  assert.equal(f.queueTitleFamily({title:'56 10 07 The Jack Benny Program S07E02 George Burns Spike Jones Show'}),'jack benny');
  assert.equal(f.queueTitleFamily({title:'Burns and Allen · Jack Benny visits'}),'burns and allen');
});
test('reviewed collection files retain metadata-provided direct Archive delivery and the canonical fallback',()=>{
  const f=relay();
  for(const channel of ['10','150'])for(const row of f.iaRepairCollectionSeeds(channel).filter(item=>item.media)){
    const url=new URL(row.media.url);
    assert.match(url.hostname,/^(?:ia|dn)[a-z0-9-]+\.(?:us\.)?archive\.org$/i);
    assert.ok(decodeURIComponent(url.pathname).endsWith('/'+row.sourceIdentifier+'/'+row.fileName));
    assert.ok(row.media.alts.some(alt=>alt.startsWith('https://archive.org/download/')));
  }
});
test('a Danish-labelled cartoon is rejected even if its language metadata incorrectly says English',async()=>{
  const {qualifyIaFileRecord}=await import('../ia_file_contract.js');
  const raw={identifier:'spider-man::episode.mp4',title:'Spider-Man The Animated Series S01E01 Night Of The Lizard - Dansk tale',language:'eng',
    media:{type:'video',url:'https://archive.org/download/spider-man/episode.mp4',runtime:1320,width:640,height:480,verification:'transport',verifiedAt:Date.now()}};
  assert.equal(qualifyIaFileRecord(raw,{channel:'150',iaRepair:true}).accepted,false);
  assert.equal(qualifyIaFileRecord({...raw,title:'Cartoon Network Noods bumper compilation'},{channel:'150',iaRepair:true}).accepted,false);
});
