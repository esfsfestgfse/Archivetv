/* Presentation commands resolve the current wrapper at invocation time. */
(function () {
  var query = new URLSearchParams(location.search);
  var optedIn = query.get('v6') === '1' && query.get('castReceiver') !== '1';
  function enabled() {
    return optedIn && !(typeof window.__rsCastIsConnected === 'function' && window.__rsCastIsConnected());
  }
  var commands = { tune: 'tuneNum', next: 'skipOne', 'guide-open': 'openGuide', 'guide-close': 'closeGuide', power: 'togglePower', info: 'toggleInfo', menu: 'toggleOsd', 'channel-step': 'step', 'volume-step': 'setVol', mute: 'toggleMute', cast: '__rsCastRequest' };
  var api = {
    snapshot: function (channel) {
      var ch = channel && typeof channel === 'object' ? channel : byNum(Number(channel == null ? curNum : channel));
      return guidePlaybackSnapshot(ch);
    },
    command: function (name, value) {
      if (!enabled() || !Object.prototype.hasOwnProperty.call(commands, name)) return false;
      if (name === 'channel-step' && value !== -1 && value !== 1) return false;
      if (name === 'volume-step' && value !== -0.1 && value !== 0.1) return false;
      var fn = window[commands[name]];
      if (typeof fn !== 'function') return false;
      return name === 'tune' || name === 'channel-step' || name === 'volume-step' ? fn.call(window, value) : fn.call(window);
    }
  };
  Object.defineProperty(api, 'enabled', { get: enabled });
  window.RealSignalPresentation = api;
})();
