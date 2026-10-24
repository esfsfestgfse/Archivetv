const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
(async()=>{
  for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const tune=html.slice(html.indexOf('async function tuneV2Preview('),html.indexOf('\nfunction v2TuneRefreshed'));
    const items=Array.from({length:6},(_,i)=>({id:`youtube:item-${i}`,type:'embed',provider:'YouTube',title:`Full program ${i}`,duration:1500,meta:{}}));
    let rejects=0,remembers=0,retries=0;
    const state={items,cursor:0};
    const ctx={window:{},token:1,powered:true,curNum:555,V2_PREVIEW_PROFILES:{cartoons:{name:'Cartoons'}},v2PreviewState:{555:state},v2PreviewInflight:{},V2_SOURCE_READY_BUFFER:5,v2FreshCursor(){},v2YouTubeSDKEnabled:()=>true,playV2Embed:async()=>null,v2Reject(){rejects++;},v2Remember(){remembers++;},refreshGuideData(){},setChanStatus(){},showOv(){},clearTimeout(){},setTimeout(){retries++;},retryTimer:null};
    for(const name of ['v2SourceProgramAllowed','v2PruneSourcePrograms'])vm.runInNewContext(html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'(')),ctx);
    vm.runInNewContext(tune,ctx);await ctx.tuneV2Preview({num:555,previewKey:'cartoons'},null,1);
    assert.equal(state.items.length,6,`${file}: transient player startup must preserve the catalog`);
    assert.equal(rejects,0,`${file}: startup timeout is not a bad-video rejection`);
    assert.equal(remembers,0,`${file}: unplayed item must not enter viewing history`);
    assert.equal(retries,0,`${file}: do not rebuild the player endlessly`);
    assert.ok(items.every(item=>!item.meta.verification),`${file}: do not poison media verification`);
    ctx.window.__rsCastIsConnected=()=>true;ctx.playFile=async()=>true;await ctx.tuneV2Preview({num:555,previewKey:'cartoons'},null,1);
    assert.equal(remembers,1,`${file}: successful Cast playback retains YouTube freshness history`);
    const unblock=html.slice(html.indexOf('function tryUnblockSound('),html.indexOf('\ndocument.addEventListener("pointerdown",tryUnblockSound'));
    let unmuted=0;
    const sound={window:{RealSignalYouTubeEmbed:{volume(level,muted){assert.equal(level,0.7);assert.equal(muted,false);unmuted++;return true;}}},lastGesture:0,soundBlocked:true,curVideo:null,muted:false,vol:0.7,pendingMusicRestart:null,needSound(on){this.soundBlocked=on;}};
    vm.runInNewContext(unblock,sound);sound.tryUnblockSound();
    assert.equal(unmuted,1,`${file}: user gesture restores blocked YouTube sound through the owning player`);
    let sdkCalls=0,legacyCalls=0;
    const playerCtx={window:{RealSignalYouTubeEmbed:{play(){sdkCalls++;return Promise.resolve({status:'pending'});}}},URLSearchParams,location:{search:''},token:1,powered:true,curNum:555,killMedia(){},screenArea:{innerHTML:''},performance:{now:()=>0},chanRT:{teardowns:[]},vol:.5,muted:false,playLegacyYouTubeEmbed:async()=>{legacyCalls++;return true;}};
    const enabled=html.match(/^function v2YouTubeSDKEnabled\(.*$/m);
    if(enabled)vm.runInNewContext(enabled[0],playerCtx);
    vm.runInNewContext(html.match(/^function playV2Embed\(.*$/m)[0],playerCtx);
    assert.equal(await playerCtx.playV2Embed(items[0],{num:555},null,1),true,`${file}: normal viewers stay on the production player until canary certification`);
    assert.equal(legacyCalls,1);assert.equal(sdkCalls,0);
    playerCtx.location.search='?youtubeSDK=1';
    assert.equal(await playerCtx.playV2Embed(items[0],{num:555},null,1),null);assert.equal(sdkCalls,1);
  }
  console.log('Desktop/mobile pending YouTube startup preserves catalogs/history and stops automatic rejection loops.');
})().catch(error=>{console.error(error);process.exitCode=1;});
