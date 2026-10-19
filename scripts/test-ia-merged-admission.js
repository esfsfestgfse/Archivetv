const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const program=(title,subject)=>({identifier:'original-comedy::episode.mp4',title,subject,language:'eng',media:{type:'video',url:'https://archive.org/download/original-comedy/episode.mp4',runtime:1800,width:640,height:480,verification:'transport',verifiedAt:Date.now()}});
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': a comedy merge admits both approved member formats, not the intersection of their prohibitions',async()=>{
  const {catalogFallbackAllowed}=await import('../realsignal_api_v2_worker.js');
  const manifest=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/export-ia-manifest.js'),path.join(root,file)],{encoding:'utf8',maxBuffer:16e6}));
  for(const channel of ['202','222']){
    const rules={...manifest.find(x=>x.channel===channel),iaRepair:true};
    assert.equal(catalogFallbackAllowed(program('SCTV · Full Television Episode','sketch comedy comedy television'),rules),true,'sketch member stays eligible on '+channel);
    assert.equal(catalogFallbackAllowed(program('Stand-Up Comedy Hour · Full Special','stand-up comedy stand-up special comedy'),rules),true,'stand-up member stays eligible on '+channel);
    assert.equal(catalogFallbackAllowed(program('Comedy podcast about SCTV','sketch comedy podcast'),rules),false,'shared podcast rejection survives');
    assert.equal(catalogFallbackAllowed(program('SCTV fan-made parody','comedy television'),rules),false,'shared fan/parody rejection survives');
    assert.equal(catalogFallbackAllowed(program('Stand-up special Trailer','stand-up comedy'),rules),false,'a format merge cannot discard trailer rejection');
    assert.equal(catalogFallbackAllowed(program('SCTV episode review','sketch comedy'),rules),false,'reviews are not episodes');
  }
});
