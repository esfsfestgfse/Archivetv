const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=process.env.REALSIGNAL_TEST_ROOT||path.join(__dirname,'..');
for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': guarded IA catalog identity remains stable across Next while real profile edits invalidate it',()=>{
 const source=fs.readFileSync(path.join(root,file),'utf8'),s={window:{},location:{search:''},URLSearchParams,console,sportsEra:'all',localStorage:{getItem:()=>null,setItem:()=>{}},banned:[],curItem:null,isTemporarilySkipped:()=>false,blockedId:()=>false,iaProgramFailed:()=>false,iaSkipBlocked:()=>false};vm.createContext(s);
 const marker=source.indexOf('window.__atvIAManifest=function()'),end=source.indexOf('\nif(new URLSearchParams(location.search)',marker);
 vm.runInContext(source.slice(source.indexOf('\nconst FNOT=')+1,end),s);
 vm.runInContext(source.slice(source.indexOf('function iaRuntimeSeconds('),source.indexOf('async function iaQueueRequest(')),s);
 vm.runInContext(source.slice(source.indexOf('function iaRepairEnabled('),source.indexOf('async function tuneIA(ch,sl,my)')),s);
 const values=vm.runInContext(`var requested=CH.find(ch=>ch.num===10);var packets=[];for(var i=0;i<8;i++)packets.push(iaRepairBody(requested,slotFor(requested,0)));packets;`,s);
 assert.equal(new Set(values.map(body=>JSON.stringify(body.queries))).size,1,'Next must not create a fresh empty server catalog for each query rotation');
 const changed=vm.runInContext(`var changedSlot=slotFor(requested,0,{preview:true});changedSlot.program={...changedSlot.program,minRuntimeSeconds:1800,deny:{title:['unrelated'],subject:[]}};iaRepairBody(requested,changedSlot);`,s);
 assert.equal(changed.minRuntimeSeconds,1800);assert.ok(changed.denyTerms.includes('unrelated'),'a real editorial update must not reuse stale rules');
});
