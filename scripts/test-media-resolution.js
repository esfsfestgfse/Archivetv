const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) {
    const html = fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const fn = html.slice(html.indexOf('async function resolvePlayable('), html.indexOf('/* NASA video */'));
    const files = [{name:'sound.mp3'}, ...Array.from({length:8},(_,i)=>({name:`episode-${i+1}.mp4`,format:'h.264'}))];
    const context = {IOS:false,mArr:v=>v?[v]:[],mStrip:v=>String(v||''),nlog(){},withTO:p=>p,firstOk:async()=>({files,metadata:{}})};
    vm.createContext(context);vm.runInContext(fn,context);
    assert.equal((await context.resolvePlayable('mixed','video')).type,'video');
    assert.equal((await context.resolvePlayable('mixed','audio')).type,'audio');
    assert.match((await context.resolvePlayable('mixed::episode-8.mp4','video')).url,/episode-8.mp4$/);
    assert.equal(await context.resolvePlayable('mixed::missing.mp4','video'),null);
    assert.equal(await context.resolvePlayable('mixed::sound.mp3','video'),null);
    console.log(file+': mixed media and expanded episode resolution passed');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
