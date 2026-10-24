const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('fallback attempts reusing a video element cannot attribute its frame to the failed file',()=>{
 const callbacks=[],output={},v={isConnected:true,videoWidth:1280,paused:false,ended:false,currentTime:1,getBoundingClientRect:()=>({x:0,y:0,width:640,height:360}),contains:()=>false,addEventListener(){},requestVideoFrameCallback:fn=>{callbacks.push(fn);return callbacks.length;},cancelVideoFrameCallback(){}};
 let now=0;
 const scope={URLSearchParams,AbortController,location:{search:'?playbackAudit=1'},performance:{now:()=>now},getComputedStyle:()=>({opacity:'1'}),document:{createElement:()=>output,body:{appendChild(){}},elementFromPoint:()=>v,hidden:false},window:{},setInterval(){},clearInterval(){},addEventListener(){}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('assets/playback-audit.js','utf8'),scope);
 const audit=scope.window.__rsPlaybackAudit;audit.begin(54);audit.watch(v,{id:'failed-news-item',type:'video'});const stale=callbacks.shift();
 audit.watch(v,{id:'actual-race',type:'video'});now=500;stale();assert.equal(JSON.parse(output.textContent).tunes[0].firstFrameMs,null);
 callbacks.shift()();let row=JSON.parse(output.textContent).tunes[0];assert.equal(row.id,'actual-race');assert.equal(row.firstFrameMs,500);assert.equal(row.attempts.length,2);
 audit.begin(225);callbacks.shift()();row=JSON.parse(output.textContent).tunes[1];assert.equal(row.firstFrameMs,null);
});
