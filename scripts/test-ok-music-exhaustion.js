const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
(async () => {
  const root = path.resolve(__dirname,'..');
  for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) {
    const html = fs.readFileSync(path.join(root,file),'utf8');
    for (const profileKey of ['ok-soul-flow-channel','ok-country-video-channel','ok-video-hits-channel']) {
      for (const scenario of ['exhausted','new-discovery','cancelled','manual']) {
        const profile={profileKey,name:profileKey}, ch={num:599,source:'v2preview',previewKey:profileKey};
        const a={id:'ok:a'},b={id:'ok:b'},fresh={id:'ok:c'};
        const state={items:[a,b],cursor:0,currentId:a.id};
        const tunes=[],retries=[];
        const context={token:9,powered:true,curNum:599,retryTimer:null,
          V2_SOURCE_READY_BUFFER:5,V2_PREVIEW_PROFILES:{[profileKey]:profile},
          v2PreviewState:{599:state},v2PreviewAdvance:{},v2PreviewInflight:{},
          byNum:()=>ch,v2Recent:()=>[a.id,b.id],quickBanner(){},
          clearTimeout(){},setTimeout(fn){retries.push(fn);return 1;},
          tuneNum(){tunes.push(state.items[state.cursor].id);},
          v2LoadProfile:async()=>{
            if(scenario==='new-discovery')state.items=[a,b,fresh];
            if(scenario==='cancelled')context.token=10;
          },
          window:{RealSignalOKEmbed:{musicProfile:p=>p?.profileKey===profileKey}}
        };
        vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('function v2TuneRefreshed(')),context);
        vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('window.__v2PreviewNext=')),context);
        context.window.__v2PreviewNext(scenario==='manual');
        if(context.v2PreviewAdvance[profile.name])await context.v2PreviewAdvance[profile.name];
        if(scenario==='cancelled')assert.equal(tunes.length,0,'a cancelled refresh cannot tune another channel');
        else {
          assert.equal(tunes[0],scenario==='new-discovery'?fresh.id:b.id,file+' '+profileKey+' '+scenario+': EOF/Next must continue; new songs outrank exhausted inventory');
          assert.equal(retries.length,0,'exhausted music does not enter an endless retry loop');
        }
      }
    }
  }
  console.log('Music EOF/Next passed: all three profiles, both clients, exhaustion, fresh discovery and cancelled handoff.');
})().catch(error=>{console.error(error);process.exitCode=1;});
