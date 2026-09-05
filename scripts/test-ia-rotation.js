const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const code=html.slice(html.indexOf('function iaQueueKey('),html.indexOf('function iaMediaWarmKey('));
  const saved={};
  const s={iaQueueRotation:{12:126,121:8},store:{set(key,value){saved[key]=JSON.parse(JSON.stringify(value));}}};
  vm.createContext(s);vm.runInContext(code,s);
  const next=()=>vm.runInContext('iaAdvanceQueueRotation({num:12});iaQueueRotationFor({num:12})',s);
  assert.equal(next(),127);assert.equal(next(),0,'rotation must wrap rather than stick at 127');
  assert.equal(next(),1);assert.equal(saved.iaQueueRotation[12],1);
  assert.equal(saved.iaQueueRotation[121],8,'other channels retain independent rotations');
  const visited=new Set();for(let i=0;i<256;i++)visited.add(next());
  assert.equal(visited.size,128,'all supported rotations remain reachable across repeated cycles');
  console.log(file+': persisted queue rotation wrap passed');
}
