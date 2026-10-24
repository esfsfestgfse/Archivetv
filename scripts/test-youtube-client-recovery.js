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
    for(const name of ['v2SourceProgramAllowed','v2PruneSourcePrograms','v2CanPrepareYouTube']){const line=html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'('));if(line)vm.runInNewContext(line,ctx);}
    vm.runInNewContext(tune,ctx);await ctx.tuneV2Preview({num:555,previewKey:'cartoons'},null,1);
    assert.equal(state.items.length,6,`${file}: transient player startup must preserve the catalog`);
    assert.equal(rejects,0,`${file}: startup timeout is not a bad-video rejection`);
    assert.equal(remembers,0,`${file}: unplayed item must not enter viewing history`);
    assert.equal(retries,0,`${file}: do not rebuild the player endlessly`);
    assert.ok(items.every(item=>!item.meta.verification),`${file}: do not poison media verification`);
    ctx.window.__rsCastIsConnected=()=>true;ctx.playFile=async()=>true;await ctx.tuneV2Preview({num:555,previewKey:'cartoons'},null,1);
    assert.equal(remembers,1,`${file}: successful Cast playback retains YouTube freshness history`);
    const order=[];let finishCatalog;
    const early={...ctx,curNum:555,token:1,window:{RealSignalYouTubeEmbed:{prepare(){order.push('prepare');}}},vol:.7,muted:false,screenArea:{},setSig(){},v2PreviewState:{555:{items:[],cursor:0}},V2_PREVIEW_PROFILES:{cartoons:{name:'Cartoons',profileKey:'cartoon-time-machine',providers:['youtube']}},withTO:p=>p,v2LoadProfile(){order.push('catalog');return new Promise(resolve=>{finishCatalog=()=>{early.v2PreviewState[555].items=items;resolve(items);};});}};
    for(const name of ['v2SourceProgramAllowed','v2PruneSourcePrograms','v2CanPrepareYouTube']){const line=html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'('));if(line)vm.runInNewContext(line,early);}
    vm.runInNewContext(tune,early);const waiting=early.tuneV2Preview({num:555,previewKey:'cartoons'},null,1);
    assert.deepEqual(order,['prepare','catalog'],`${file}: prepare synchronously before the catalog await`);finishCatalog();await waiting;
    let destroyed=0,cleared=0;
    const clean={window:{RealSignalYouTubeEmbed:{stop(){destroyed++;}}},screenArea:{querySelectorAll:()=>[]},stopTVPlayback(){},stopRadioHls(){}};
    vm.runInNewContext(html.slice(html.indexOf('function killMedia('),html.indexOf('/* FIX (structural, flagged many times)')),clean);
    clean.killMedia(true);assert.equal(destroyed,0,'compatible handoff preserves the physical YouTube player');clean.killMedia();assert.equal(destroyed,1,'leaving playback still destroys it');
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
    assert.equal(await playerCtx.playV2Embed(items[0],{num:555},null,1),null,`${file}: the verified prepared player owns normal playback`);
    assert.equal(legacyCalls,0);assert.equal(sdkCalls,1);
    playerCtx.location.search='?youtubeSDK=0';
    assert.equal(await playerCtx.playV2Embed(items[0],{num:555},null,1),true);assert.equal(legacyCalls,1);
  }
  console.log('Desktop/mobile pending YouTube startup preserves catalogs/history and stops automatic rejection loops.');
})().catch(error=>{console.error(error);process.exitCode=1;});
