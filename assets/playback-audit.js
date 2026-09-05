/* Opt-in, local-only playback diagnostics. Never sends telemetry or alters playback. */
(function(){
  'use strict';
  if(new URLSearchParams(location.search).get('playbackAudit')!=='1')return;
  const report={version:1,measurement:'video compositor callback with visibility check',tunes:[],controls:[]};
  const output=document.createElement('script');output.type='application/json';output.id='rs-playback-audit';document.body.appendChild(output);
  const seen=new Set(),watches=new Set();let active=null;
  function publish(){output.textContent=JSON.stringify(report);}
  function visible(v){const r=v.getBoundingClientRect(),s=getComputedStyle(v);if(!v.isConnected||r.width<2||r.height<2||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<.5)return false;const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===v||v.contains(hit);}
  window.__rsPlaybackAudit={
    begin(channel){
      if(active&&active.firstFrameMs==null)active.superseded=true;
      active={channel,started:performance.now(),firstFrameMs:null,attempts:[],stalls:0,repeated:false};
      report.tunes.push(active);if(report.tunes.length>100)report.tunes.shift();publish();
    },
    control(action){const row={action,started:performance.now()};report.controls.push(row);if(report.controls.length>100)report.controls.shift();requestAnimationFrame(()=>requestAnimationFrame(()=>{row.paintMs=Math.round(performance.now()-row.started);row.guideOpen=!!document.querySelector('#gwrap.show');publish();}));},
    watch(v,item){
      const tune=active;if(!tune)return;
      const attempt={id:item.id||item.identifier||item.url,started:performance.now(),type:item.type,events:[]};
      tune.attempts.push(attempt);let frameId=0,lastFrame=performance.now(),stalled=false;
      const controller=new AbortController();
      const watch={v,stop(){controller.abort();if(frameId&&v.cancelVideoFrameCallback)v.cancelVideoFrameCallback(frameId);watches.delete(watch);},check(){
        if(!v.isConnected||active!==tune){watch.stop();return;}
        if(v.paused||v.ended||document.hidden||!visible(v)){lastFrame=performance.now();return;}
        if(tune.firstFrameMs!=null&&performance.now()-lastFrame>3000&&!stalled){stalled=true;tune.stalls++;publish();}
        if(v.currentTime>2&&!v.videoWidth&&item.type!=='audio')attempt.noVideoTrack=true;
      }};
      watches.add(watch);
      ['playing','waiting','stalled','error','ended'].forEach(type=>v.addEventListener(type,()=>{if(attempt.events.length<40)attempt.events.push({type,ms:Math.round(performance.now()-tune.started),code:v.error&&v.error.code});publish();},{signal:controller.signal}));
      if(v.requestVideoFrameCallback){const frame=()=>{
        if(active!==tune||!v.isConnected){watch.stop();return;}
        lastFrame=performance.now();stalled=false;
        if(tune.firstFrameMs==null&&visible(v)&&v.videoWidth>0){
          tune.firstFrameMs=Math.round(performance.now()-tune.started);tune.id=attempt.id;
          tune.repeated=seen.has(attempt.id);seen.add(attempt.id);publish();
        }
        frameId=v.requestVideoFrameCallback(frame);
      };frameId=v.requestVideoFrameCallback(frame);}else attempt.frameMeasurementUnavailable=true;
      publish();
    }
  };
  const interval=setInterval(()=>{watches.forEach(w=>w.check());publish();},1000);
  addEventListener('pagehide',()=>{clearInterval(interval);watches.forEach(w=>w.stop());},{once:true});
  publish();
})();
