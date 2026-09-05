const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
async function test(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
  const request = source.slice(source.indexOf('async function iaQueueRequest('), source.indexOf('\nfunction warmIAQueue('));
  const refill = source.slice(source.indexOf('async function refillIAQueue('), source.indexOf('\nfunction takeIAQueue('));
  const timers = [], item = {identifier:'on-genre', media:{url:'https://example.com/video.mp4'}};
  const s = {console, powered:true, IA_RELAY_BASE:'https://example.com',
    fetch:async()=>{throw Error('timeout');}, withTO:p=>p, nlog(){},
    iaQueueQueries:()=>['genre'], iaQueueKey:()=> '12', iaQueueRotationFor:()=>0,
    iaProgramThemeTerms:()=>[], iaProgramDenyTerms:()=>[], iaQueueDiversity:()=>({}),
    iaProgramAllowed:()=>true, iaLocalQueueFallback:()=>[item],
    iaReadyShelfRestore(){}, iaProgramInflight:{}, iaProgramQueues:{}, iaQueueRetries:{},
    iaProgramFailed:()=>false, iaPendingTooLong:()=>false, iaEmergencyItems:()=>[],
    warmIAQueue(){}, iaReadyShelfSave(){}, gwrap:null,
    setTimeout(fn,ms){timers.push({fn,ms});}};
  vm.createContext(s); vm.runInContext(request+'\n'+refill,s);
  const fallback = await vm.runInContext('iaQueueRequest({num:12},{},5)',s);
  assert.equal(fallback.localFallback,true, file+': fallback must be identified');
  assert.equal(fallback.partial,true, file+': local shelf needs background recovery');
  for(let i=0;i<4;i++) await vm.runInContext('refillIAQueue({num:12},{})',s);
  assert.deepEqual(timers.map(t=>t.ms),[5000,10000,20000],file+': bounded exponential recovery');
  assert.equal(s.iaProgramQueues['12'][0],item,'keep the usable fallback available');
  s.fetch=async()=>({ok:true,json:async()=>({items:[item],ready:5,candidates:5})});
  await vm.runInContext('refillIAQueue({num:12},{})',s);
  assert.equal(s.iaQueueRetries['12'],0,'successful response resets backoff');
  s.fetch=async()=>{throw Error('timeout');};
  await vm.runInContext('refillIAQueue({num:12},{})',s);
  assert.equal(timers.at(-1).ms,5000);
  s.powered=false; let called=false; s.refillIAQueue=()=>{called=true;};
  timers.at(-1).fn(); assert.equal(called,false,'standby blocks scheduled refill');
  console.log(file+': local fallback recovery passed');
}
(async()=>{await test('the_dial_desktop.html'); await test('the_dial_mobile.html');})()
  .catch(error=>{console.error(error);process.exitCode=1;});
