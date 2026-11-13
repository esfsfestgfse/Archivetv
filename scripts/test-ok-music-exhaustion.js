const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
(async () => {
  const root = path.resolve(__dirname,'..');
  for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) {
    const html = fs.readFileSync(path.join(root,file),'utf8');
    for (const profileKey of ['ok-soul-flow-channel','ok-country-video-channel','ok-video-hits-channel','ok-soul-flow-channel-2000-2019']) {
      const playback = {
        V2_PREVIEW_PROFILES: {[profileKey]: {profileKey,name:profileKey}},
        v2PreviewState: {599: {items: [{id:'ok:current'},{id:'ok:next'},{id:'ok:third'}],cursor:0}},
        token: 9,
        V2_SOURCE_READY_BUFFER: 1,
        v2CanPrepareYouTube: () => false,
        v2PruneSourcePrograms() {},
        v2FreshCursor: (profile,state) => {state.cursor=0;},
        window: {},
        playV2Embed: async item => { playback.started = item.id; return true; },
        v2Remember() {}, refreshGuideData() {}, setChanStatus() {}
      };
      playback.v2PreviewState[599].items.forEach(item=>Object.assign(item,{type:'embed',provider:'OK.ru'}));
      const tuneSource = html.slice(html.indexOf('async function tuneV2Preview('), html.indexOf('function v2TuneRefreshed('));
      vm.runInNewContext(tuneSource,playback);
      await playback.tuneV2Preview({num:599,previewKey:profileKey},{},9,'ok:next');
      assert.equal(playback.started,'ok:next',file+' must start the program selected by Next even when the old one has not started');
      const rapid = {
        window: {RealSignalOKEmbed: {musicProfile: () => true, programKey: item => item.id}},
        store: {get: (_, fallback) => fallback}, v2Recent: () => [],
      };
      for (const name of ['v2NextFreshIndex','v2FreshCursor']) vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),rapid);
      const pending = {items:[{id:'ok:a'},{id:'ok:b'},{id:'ok:c'}],cursor:1,nextSkipped:['ok:a']};
      assert.equal(rapid.v2NextFreshIndex({profileKey},pending,'ok:b'),2,file+' must move past earlier skipped tracks even when playback never started');
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
          tuneNum(number,programId){assert.equal(number,ch.num);tunes.push(programId);},
          v2LoadProfile:async()=>{
            if(scenario==='new-discovery')state.items=[a,b,fresh];
            if(scenario==='cancelled')context.token=10;
          },
          window:{RealSignalOKEmbed:{musicProfile:p=>p?.profileKey===profileKey}}
        };
        for(const name of ['v2SourceProgramAllowed','v2PruneSourcePrograms','v2CanPrepareYouTube'])vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),context);
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
  console.log('Music EOF/Next passed on both clients: era station handoff, exhaustion, fresh discovery and cancelled tunes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
