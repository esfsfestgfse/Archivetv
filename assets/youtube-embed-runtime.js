/* Official IFrame API ownership. Readiness is not playback or a visible frame. */
(function (root) {
  'use strict';
  var transport = null, owner = null, sdk = null;
  function loadSDK() {
    if (root.YT && root.YT.Player) return Promise.resolve(root.YT.Player);
    if (!sdk) sdk = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), previous = root.onYouTubeIframeAPIReady, timer, finished = false;
      function finish(error) {
        if (finished) return;
        finished = true; clearTimeout(timer); script.onerror = null;
        if (root.onYouTubeIframeAPIReady === ready) root.onYouTubeIframeAPIReady = previous;
        if (error) { sdk = null; script.remove(); reject(error); }
        else resolve(root.YT.Player);
      }
      function ready() {
        try { if (typeof previous === 'function') previous(); } catch (_) {}
        finish(root.YT && root.YT.Player ? null : new Error('YouTube SDK unavailable'));
      }
      root.onYouTubeIframeAPIReady = ready;
      script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
      script.onerror = function () { finish(new Error('YouTube SDK unavailable')); };
      timer = setTimeout(function () { finish(new Error('YouTube SDK timeout')); }, 8000);
      document.head.appendChild(script);
    });
    return sdk;
  }
  function current(job) { return owner === job && transport === job.transport && !job.cancelled && job.options.isCurrent(); }
  function settle(job,status,code) { if(!job.settled){job.settled=true;job.resolve({status:status,code:code});} }
  function cancel(job) {
    if(!job||job.cancelled)return;
    job.cancelled=true;clearTimeout(job.timer);clearInterval(job.clock);
    if(job.handlers)Object.keys(job.handlers).forEach(function(name){try{job.transport.player.removeEventListener(name,job.handlers[name]);}catch(_){}});
    if(owner===job)owner=null;
    settle(job,'cancelled');
  }
  function stop() {
    cancel(owner);var old=transport;transport=null;
    if(!old)return;
    if(old.player){try{old.player.destroy();}catch(_){}}
    old.frame.remove();
  }
  // A direct-media attempt must not destroy the already navigated iframe.
  // Cancel its program and stop playback while retaining only the transport.
  function suspend() {
    cancel(owner);
    if(!transport)return null;
    transport.suspended=true;
    if(transport.ready){try{transport.player.stopVideo();}catch(_){}}
    transport.frame.hidden=true;transport.frame.style.display='none';
    return transport.frame;
  }
  function volume(level, muted) {
    if (!transport) return false;
    transport.level = level; transport.muted = !!muted;
    if (!transport.player || !transport.ready) return false;
    try {
      transport.player.setVolume(Math.round(Math.max(0, Math.min(1, Number(level) || 0)) * 100));
      if (muted) transport.player.mute(); else transport.player.unMute();
      return true;
    } catch (_) { return false; }
  }
  function toggle() {
    if (!owner || !current(owner) || !transport.player || !transport.ready) return false;
    try { if (transport.player.getPlayerState() === 1) transport.player.pauseVideo(); else transport.player.playVideo(); } catch (_) {}
    return true;
  }
  function matches(job) {
    try{return String(job.transport.player.getVideoData().video_id||'')===job.videoId;}catch(_){return false;}
  }
  function pending(job,code) {
    if(!current(job))return;
    clearTimeout(job.timer);job.transport.frame.dataset.playbackState='pending';
    if(!job.transport.ready)job.transport.failed=true;
    settle(job,'pending',code);
    if(job.options.onPending)job.options.onPending({code:code,ready:job.transport.ready});
  }
  function sample(job) {
    if(!current(job)){cancel(job);return;}
    if(!job.issued||!job.transport.ready||job.started)return;
    try{
      var player=job.transport.player,time=Number(player.getCurrentTime());
      if(!matches(job)||player.getPlayerState()!==1||!Number.isFinite(time)){job.lastTime=null;return;}
      if(job.lastTime!==null&&time-job.lastTime>=0.05){
        job.started=true;clearTimeout(job.timer);clearInterval(job.clock);
        job.transport.frame.dataset.playbackState='playing';
        if(job.options.onStarted)job.options.onStarted();settle(job,'playing');
      }
      job.lastTime=time;
    }catch(_){}
  }
  function activate(job) {
    if(!current(job)||!job.transport.ready||job.issued)return;
    job.issued=true;volume(job.transport.level,job.transport.muted);
    var state=job.transport,player=state.player;
    // Listener closures belong to this program, not whichever owner exists
    // when a previously queued SDK callback eventually runs.
    job.handlers={
      onStateChange:function(event){
        if(!current(job)||!matches(job))return;
        if(Number(event.data)===0&&player.getPlayerState()===0&&job.started&&!job.advanced){job.advanced=true;if(job.options.onEnded)job.options.onEnded();}
        else sample(job);
      },
      onAutoplayBlocked:function(){
        if(!current(job)||job.mutedRetry)return;
        job.mutedRetry=true;player.mute();player.playVideo();if(job.options.onMuted)job.options.onMuted();
      },
      onError:function(event){
        if(!current(job)||!matches(job)||player.getPlayerState()===1)return;
        var code=Number(event&&event.data),unavailable=code===100||code===101||code===150;
        if(!unavailable){pending(job,code||'player-error');return;}
        var notice=job.started||job.settled;settle(job,'unavailable',code);cancel(job);
        if(notice&&job.options.onError)job.options.onError({code:code});
      }
    };
    Object.keys(job.handlers).forEach(function(name){player.addEventListener(name,job.handlers[name]);});
    if(job.options.onReady)job.options.onReady();
    player.loadVideoById(job.videoId);
  }
  function prepare(options) {
    var state=transport;
    if(state&&(state.container!==options.container||state.frame.parentNode!==options.container||state.failed)){stop();state=null;}
    cancel(owner);
    if(state&&state.ready){try{state.player.stopVideo();}catch(_){}}
    if(!state){
      var frame=document.createElement('iframe');
      frame.src='https://www.youtube-nocookie.com/embed/?autoplay=0&controls=1&enablejsapi=1&playsinline=1&origin='+encodeURIComponent(root.location.origin);
      frame.title='YouTube television player';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
      frame.referrerPolicy='strict-origin-when-cross-origin';frame.dataset.playbackState='preparing';
      state={frame:frame,container:options.container,player:null,ready:false,level:options.volume,muted:!!options.muted};
      transport=state;options.container.appendChild(frame);
      function bind(Player){
        if(transport!==state)return;
        state.player=new Player(frame,{events:{
          onReady:function(event){
            if(transport!==state)return;
            state.player=event.target;state.ready=true;state.failed=false;frame.dataset.playbackState='ready';volume(state.level,state.muted);
            if(state.suspended){try{state.player.stopVideo();}catch(_){}return;}
            if(owner)activate(owner);
          }
        }});
      }
      if(root.YT&&root.YT.Player)bind(root.YT.Player);
      else loadSDK().then(bind).catch(function(){if(transport!==state)return;state.failed=true;if(owner)pending(owner,'sdk-unavailable');});
    }
    if(options.volume!==undefined)state.level=options.volume;
    if(options.muted!==undefined)state.muted=!!options.muted;
    state.suspended=false;state.frame.hidden=false;state.frame.style.display='';
    Array.prototype.slice.call(options.container.children||[]).forEach(function(node){if(node!==state.frame)node.remove();});
    return state.frame;
  }
  function play(options) {
    var url;
    try{url=new URL(options.item.embedUrl||options.item.url);}catch(_){return Promise.resolve({status:'unavailable'});}
    if(!/^https:\/\/www\.youtube(?:-nocookie)?\.com$/.test(url.origin)||!/^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname))return Promise.resolve({status:'unavailable'});
    prepare(options);
    return new Promise(function(resolve){
      var job={transport:transport,options:options,videoId:url.pathname.split('/').pop(),resolve:resolve,lastTime:null};owner=job;
      transport.frame.title=options.item.title||'YouTube program';transport.frame.dataset.playbackState='loading';
      job.timer=setTimeout(function(){pending(job,'startup-timeout');},12000);
      job.clock=setInterval(function(){sample(job);},200);
      activate(job);
    });
  }
  root.RealSignalYouTubeEmbed = {prepare:prepare,play:play,suspend:suspend,stop:stop,volume:volume,toggle:toggle};
  // Fetch before interaction to avoid a serial SDK request on a cold tune.
  // If still pending, bind once ready; stop() invalidates that continuation.
  loadSDK().catch(function(){});
})(window);
