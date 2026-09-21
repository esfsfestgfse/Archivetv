/* RealSignal 3.0 telemetry bridge.
 *
 * Playback remains local by default. A canary can opt in with
 * ?v3Telemetry=1; only bounded playback measurements are sent to the V3 API
 * (no titles, URLs, account data, or media content). The local Release 2
 * dashboard remains the source of truth when this bridge is disabled.
 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  if (params.get('v3Telemetry') !== '1') return;
  var endpoint = String(window.__RS_V3_TELEMETRY_ENDPOINT || 'https://realsignal-api.tdy1990.workers.dev/api/v3/telemetry');
  var lastIndex = 0;
  var session = '';
  try {
    session = localStorage.getItem('realsignal:v3-session') || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + String(Math.random()).slice(2));
    localStorage.setItem('realsignal:v3-session', session);
  } catch (_) { session = 'ephemeral-' + String(Date.now()); }

  function surface() {
    var mobile = document.documentElement && document.documentElement.classList.contains('mob');
    var cast = false;
    try { cast = typeof window.__rsCastIsConnected === 'function' && !!window.__rsCastIsConnected(); } catch (_) {}
    return { surface: mobile ? 'mobile' : 'desktop', castConnected: cast };
  }
  function send() {
    var telemetry = window.__rsRelease2Telemetry;
    if (!telemetry || !telemetry.report || !Array.isArray(telemetry.report.events)) return;
    var events = telemetry.report.events.slice(lastIndex).slice(-24);
    lastIndex = telemetry.report.events.length;
    if (!events.length) return;
    var state = surface();
    var safe = events.map(function (event) {
      return {
        type: String(event.type || '').slice(0, 48),
        channel: Number(event.channel || 0) || 0,
        ms: Number.isFinite(Number(event.ms)) ? Number(event.ms) : undefined,
        depth: Number.isFinite(Number(event.depth)) ? Number(event.depth) : undefined,
        source: String(event.source || '').slice(0, 80),
        status: String(event.status || '').slice(0, 80),
        reason: String(event.reason || '').slice(0, 120),
        castConnected: state.castConnected,
        surface: state.surface
      };
    }).filter(function (event) { return event.channel > 0 && event.type; });
    if (!safe.length) return;
    fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      headers: { 'content-type': 'application/json', 'x-realsignal-client': 'desktop-mobile-v3', 'x-realsignal-session': session },
      body: JSON.stringify({ sessionId: session, surface: state.surface, castConnected: state.castConnected, events: safe })
    }).catch(function () { /* telemetry must never affect playback */ });
  }
  window.__rsV3Telemetry = { flush: send, enabled: true, endpoint: endpoint };
  setInterval(send, 15000);
  window.addEventListener('pagehide', send, { passive: true });
})();
