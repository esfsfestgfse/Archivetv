/* Weather Watch: one selected network, using the app's existing guarded HLS player. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RealSignalWeather=api;})(typeof window!=='undefined'?window:this,function(){
  /* Public network entries from iptv-org/iptv streams/us.m3u. No login tokens.
     Availability remains controlled by each upstream; never substitute another network. */
  var feeds={
    fox:{name:'FOX Weather',cat:'Weather',src:'FOX Weather',followAppAudio:true,url:'https://247wlive.foxweather.com/stream/index.m3u8'},
    twc:{name:'The Weather Channel',cat:'Weather',src:'The Weather Channel',followAppAudio:true,url:'https://twcprod-live.twc-tv.com/v1/manifest/b4d4d63a49309cc5140171fb2e92485c31be1e9e/DSP_6228e4760505741a116f1ba2_twcprod-live/6bf09ce5-366b-463c-b67e-c4b799f73c3f/4.m3u8'}
  };
  function mount(root,options){
    var selected='local',disposed=false,local=root.querySelector('#wxScreen'),network=root.querySelector('#wxNetwork'),bindings=[];
    var buttons=Array.prototype.slice.call(root.querySelectorAll('[data-weather-view]'));
    function paint(){
      local.hidden=selected!=='local';network.hidden=selected==='local';
      buttons.forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.weatherView===selected));});
    }
    buttons.forEach(function(button){
      function click(){
        var id=button.dataset.weatherView;
        if(disposed||!options.isCurrent()||id===selected||id!=='local'&&!Object.prototype.hasOwnProperty.call(feeds,id))return;
        options.stop();selected=id;paint();options.onSelect(id==='local'?null:Object.assign({},feeds[id]));
      }
      button.addEventListener('click',click);bindings.push([button,click]);
    });
    paint();
    return {current:function(){return selected;},dispose:function(){
      if(disposed)return;disposed=true;bindings.forEach(function(b){b[0].removeEventListener('click',b[1]);});options.stop();
    }};
  }
  return {feeds:feeds,mount:mount};
});
