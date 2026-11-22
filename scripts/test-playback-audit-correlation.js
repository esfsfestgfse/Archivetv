const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('fallback attempts reusing a video element cannot attribute its frame to the failed file',()=>{
 const callbacks=[],output={},v={isConnected:true,videoWidth:1280,paused:false,ended:false,currentTime:1,getBoundingClientRect:()=>({x:0,y:0,width:640,height:360}),contains:()=>false,addEventListener(){},requestVideoFrameCallback:fn=>{callbacks.push(fn);return callbacks.length;},cancelVideoFrameCallback(){}};
 let now=0;
 const scope={URLSearchParams,AbortController,location:{search:'?playbackAudit=1'},performance:{now:()=>now},getComputedStyle:()=>({opacity:'1'}),document:{createElement:()=>output,body:{appendChild(){}},getElementById:()=>null,elementFromPoint:()=>v,hidden:false},window:{},setInterval(){},clearInterval(){},addEventListener(){}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('assets/playback-audit.js','utf8'),scope);
 const audit=scope.window.__rsPlaybackAudit;audit.begin(54);audit.watch(v,{id:'failed-news-item',type:'video'});const stale=callbacks.shift();
 audit.watch(v,{id:'actual-race',type:'video'});now=500;stale();assert.equal(JSON.parse(output.textContent).tunes[0].firstFrameMs,null);
 callbacks.shift()();let row=JSON.parse(output.textContent).tunes[0];assert.equal(row.id,'actual-race');assert.equal(row.firstFrameMs,500);assert.equal(row.attempts.length,2);
 audit.begin(225);callbacks.shift()();row=JSON.parse(output.textContent).tunes[1];assert.equal(row.firstFrameMs,null);
});

test('source-stage timing stays with its tune and never claims a native visible frame',()=>{
 const output={};let now=0;
 const scope={URLSearchParams,location:{search:'?playbackAudit=1'},performance:{now:()=>now},document:{createElement:()=>output,body:{appendChild(){}}},window:{},setInterval(){},clearInterval(){},addEventListener(){}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('assets/playback-audit.js','utf8'),scope);
 const audit=scope.window.__rsPlaybackAudit;audit.begin(539);const record=audit.source(539);
 now=300;record('catalog-ready',{count:21});now=500;record('embed-clock-started',{id:'yt:actual'});
 let rows=JSON.parse(output.textContent).tunes;assert.equal(rows[0].sourceStages[1].ms,500);assert.equal(rows[0].firstFrameMs,null,'an iframe clock is not a compositor frame');
 audit.begin(539);now=900;record('stale-completion',{count:1});rows=JSON.parse(output.textContent).tunes;
 assert.equal(rows[1].sourceStages,undefined,'the old request cannot attach to a new tune of the same channel');
});

function frameHarness() {
  const callbacks = [], overlays = new Map(), output = {};
  let now = 0;
  const video = { isConnected: true, videoWidth: 1280,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    addEventListener() {}, cancelVideoFrameCallback() {},
    requestVideoFrameCallback(fn) { callbacks.push(fn); return callbacks.length; } };
  const document = { createElement: () => output, body: { appendChild() {} },
    hidden: false, getElementById: id => overlays.get(id) || null,
    elementFromPoint: () => video }; // The overlays do not participate in hit-testing.
  const scope = { URLSearchParams, AbortController, location: { search: "?playbackAudit=1" },
    performance: { now: () => now }, document, getComputedStyle: el => el.style || { opacity: "1" },
    window: {}, setInterval() {}, clearInterval() {}, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync("assets/playback-audit.js", "utf8"), scope);
  return { audit: scope.window.__rsPlaybackAudit, video, overlays, callbacks,
    time(ms) { now = ms; }, frame(ms) { now = ms; callbacks.shift()(); },
    tunes: () => JSON.parse(output.textContent).tunes };
}

test("compositor and ready timestamps stay separate from the first frame after the tune overlays clear", () => {
  const h = frameHarness();
  const staticLayer = { style: { opacity: "0.46", pointerEvents: "none" } };
  const tuneLayer = { style: { opacity: "1", pointerEvents: "none" } };
  const bufferLayer = { style: { opacity: "1", pointerEvents: "none" } };
  h.overlays.set("fxStatic", staticLayer);
  h.overlays.set("ov", tuneLayer);
  h.overlays.set("buffOv", bufferLayer);
  h.audit.begin(54);
  h.audit.watch(h.video, { id: "picture", type: "video" });
  h.time(130); h.audit.source(54)("native-ready", { id: "picture" });
  h.frame(171);
  assert.equal(h.tunes()[0].firstFrameMs, null, "pointer-transparent overlays still cover the picture");
  assert.equal(h.tunes()[0].attempts[0].firstCompositorFrameMs, 171);
  assert.equal(h.tunes()[0].sourceStages[0].ms, 130);
  tuneLayer.style.display = "none"; bufferLayer.style.display = "none";
  h.frame(260);
  assert.equal(h.tunes()[0].firstFrameMs, null, "the static burst alone blocks first picture");
  staticLayer.style.opacity = "0"; // The burst class can remain after its animation ends.
  tuneLayer.style.display = "flex";
  h.frame(380);
  assert.equal(h.tunes()[0].firstFrameMs, null, "the tuning overlay alone blocks first picture");
  tuneLayer.style.display = "none"; bufferLayer.style.display = "flex";
  h.frame(400);
  assert.equal(h.tunes()[0].firstFrameMs, null, "the buffering overlay alone blocks first picture");
  bufferLayer.style.display = "none";
  h.frame(420);
  assert.equal(h.tunes()[0].firstFrameMs, 420);
  assert.equal(h.tunes()[0].attempts[0].firstCompositorFrameMs, 171);
});

test("rapidly superseding an obscured tune of the same station keeps its late signals out of the new tune", () => {
  const h = frameHarness();
  h.overlays.set("fxStatic", { style: { opacity: "0.5", pointerEvents: "none" } });
  h.audit.begin(54);
  const staleReady = h.audit.source(54);
  h.audit.watch(h.video, { id: "skipped", type: "video" });
  h.frame(171);
  h.time(180); h.audit.begin(54);
  h.audit.watch(h.video, { id: "current", type: "video" });
  h.overlays.clear();
  h.time(200); staleReady("native-ready", { id: "skipped" });
  h.frame(210); // Queued callback from the skipped tune.
  let [skipped, current] = h.tunes();
  assert.equal(skipped.superseded, true);
  assert.equal(skipped.firstFrameMs, null);
  assert.equal(current.firstFrameMs, null);
  assert.equal(current.sourceStages, undefined);
  h.frame(250);
  [, current] = h.tunes();
  assert.equal(current.id, "current");
  assert.equal(current.firstFrameMs, 70);
});
