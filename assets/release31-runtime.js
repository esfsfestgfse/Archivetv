/* RealSignal 3.1 diagnostics and live-data polish.
 *
 * This layer is deliberately read-only from the playback path. It adds a
 * remote D1 scorecard to the existing diagnostics panel only when the user
 * opens it, and turns the app's existing live-data status cache into a useful
 * freshness/recovery view. No media request waits for this script.
 */
(function () {
  'use strict';
  var endpoint = String(window.__RS_V31_HEALTH_ENDPOINT || 'https://realsignal-api.tdy1990.workers.dev/api/v3/health/summary');
  var state = { data: null, loading: false, error: '' };

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function liveChannels() {
    var rows = [];
    try {
      if (typeof CH !== 'undefined' && Array.isArray(CH)) rows = CH.filter(function (row) { return row && row.cat === 'LDATA'; });
    } catch (_) { rows = []; }
    var status = window.__chanStatus || {};
    var guide = window.__atvLiveGuideState || {};
    return rows.map(function (row) {
      var entry = guide[row.num] || {};
      var at = Number(entry.at || 0);
      var age = at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : null;
      return { num: Number(row.num), name: String(row.nm || 'LIVE DATA'), source: String(row.source || ''), text: String(entry.text || status[row.num] || 'WAITING FOR SOURCE'), age: age };
    });
  }

  function ageLabel(seconds) {
    if (seconds == null) return 'WAITING';
    if (seconds < 60) return 'UPDATED JUST NOW';
    if (seconds < 3600) return Math.round(seconds / 60) + 'M AGO';
    return Math.round(seconds / 3600) + 'H AGO';
  }

  function ensure() {
    var panel = document.getElementById('rsHealthPanel');
    if (!panel) { setTimeout(ensure, 1200); return; }
    if (document.getElementById('rs31Panel')) return;
    if (!document.getElementById('rs31Styles')) {
      var style = document.createElement('style'); style.id = 'rs31Styles'; style.textContent = '#diagOv[aria-label="Network diagnostics"]{max-height:88vh;overflow-y:auto}.rs31-panel{max-height:42vh;overflow:auto;margin-top:12px;padding:10px;border:1px solid rgba(103,255,148,.22);border-radius:10px;background:rgba(2,15,10,.7);color:#d8ffe4;font:11px/1.35 monospace}.rs31-head,.rs31-summary,.rs31-live-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.rs31-head small,.rs31-summary small,.rs31-live-head span,.rs31-server-row small,.rs31-source-row small,.rs31-live-row small{display:block;color:rgba(204,239,214,.62);font-size:9px}.rs31-head button{border:1px solid #63ff92;border-radius:5px;background:#0e301e;color:#aaffbd;font:700 10px monospace;padding:5px 9px;cursor:pointer}.rs31-summary{margin:9px 0;padding:8px;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}.rs31-score{font-size:24px;color:#76ff9d}.rs31-score.watch,.rs31-wait{color:#ffe88a}.rs31-score.repair,.rs31-bad,.rs31-live-row.bad,.rs31-server-row.repair{color:#ff9b9b}.rs31-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rs31-grid>b,.rs31-live-head{font-size:9px;letter-spacing:.08em;color:#84ffa2}.rs31-server-row,.rs31-source-row,.rs31-live-row{display:grid;width:100%;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;margin-top:4px;padding:6px;border:1px solid rgba(255,255,255,.08);border-radius:5px;background:rgba(255,255,255,.03);color:#d8ffe4;text-align:left;font:10px monospace}.rs31-server-row{cursor:pointer}.rs31-server-row small,.rs31-live-row small{grid-column:1 / 2}.rs31-server-row em,.rs31-source-row em,.rs31-live-row em{grid-column:2;grid-row:1 / span 2;align-self:center;font-style:normal;color:#8cffaa}.rs31-server-row.watch,.rs31-live-row.warn{border-color:rgba(255,224,125,.35)}.rs31-server-row.repair,.rs31-live-row.bad,.rs31-source-row.bad{border-color:rgba(255,111,111,.4)}.rs31-source-row{grid-template-columns:minmax(0,1fr) auto}.rs31-live-head{margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}.rs31-live-row{grid-template-columns:38px minmax(0,1fr) auto;cursor:pointer}.rs31-live-num{color:#78ff9a;font-weight:700}.rs31-muted{color:rgba(204,239,214,.55)}.rs31-wait{color:#ffe88a}@media(max-width:600px){.rs31-grid{grid-template-columns:1fr}.rs31-panel{font-size:10px}}'; document.head.appendChild(style);
    }
    var node = document.createElement('section');
    node.id = 'rs31Panel';
    node.className = 'rs31-panel';
    node.innerHTML = '<div class="rs31-head"><div><b>REALSignal 3.1 · REMOTE HEALTH</b><small>D1 telemetry · read-only · last 24 hours</small></div><button type="button" id="rs31RemoteRefresh">LOAD</button></div>' +
      '<div class="rs31-summary" id="rs31Summary"><span class="rs31-wait">Press LOAD to fetch the server scorecard.</span></div>' +
      '<div class="rs31-grid"><div><b>WEAKEST SERVER LANES</b><div id="rs31Channels"><span class="rs31-muted">No remote sample loaded.</span></div></div><div><b>SOURCE HEALTH</b><div id="rs31Sources"><span class="rs31-muted">No remote sample loaded.</span></div></div></div>' +
      '<div class="rs31-live-head"><b>LIVE-DATA FRESHNESS</b><span>LOCAL STATUS CACHE</span></div><div class="rs31-live" id="rs31Live"></div>';
    panel.appendChild(node);
    document.getElementById('rs31RemoteRefresh').addEventListener('click', load);
    renderLive();
  }

  function renderLive() {
    var host = document.getElementById('rs31Live');
    if (!host) return;
    var rows = liveChannels();
    host.innerHTML = rows.length ? rows.map(function (row) {
      var tone = row.age == null || row.age > 900 ? 'bad' : row.age > 180 ? 'warn' : 'good';
      return '<button type="button" class="rs31-live-row ' + tone + '" data-rs31-channel="' + row.num + '"><span class="rs31-live-num">' + String(row.num).padStart(3, '0') + '</span><span><b>' + safe(row.name) + '</b><small>' + safe(row.text) + ' · ' + safe(row.source || 'LIVE') + '</small></span><em>' + ageLabel(row.age) + '</em></button>';
    }).join('') : '<span class="rs31-muted">No live-data registry rows available.</span>';
    if (!host.dataset.wired) {
      host.dataset.wired = '1';
      host.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('[data-rs31-channel]');
        if (!button || typeof window.tuneNum !== 'function') return;
        window.tuneNum(Number(button.getAttribute('data-rs31-channel')));
      });
    }
  }

  function renderRemote() {
    var summary = document.getElementById('rs31Summary');
    var channels = document.getElementById('rs31Channels');
    var sources = document.getElementById('rs31Sources');
    if (!summary || !channels || !sources) return;
    if (state.loading) { summary.innerHTML = '<span class="rs31-wait">Loading server telemetry…</span>'; return; }
    if (state.error) { summary.innerHTML = '<span class="rs31-bad">REMOTE HEALTH UNAVAILABLE · ' + safe(state.error) + '</span>'; return; }
    if (!state.data) return;
    var data = state.data;
    var score = data.overallScore == null ? '—' : data.overallScore;
    var total = data.totals || {};
    var freshness = Array.isArray(data.freshness) ? data.freshness : [];
    var ledgerItems = freshness.reduce(function (sum, row) { return sum + Number(row.ledger_items || 0); }, 0);
    summary.innerHTML = '<strong class="rs31-score ' + (data.status || 'waiting') + '">' + score + '</strong><span><b>' + safe(String(data.status || 'WAITING').toUpperCase()) + '</b><small>' + Number(total.events || 0) + ' events · ' + Number(total.failures || 0) + ' failures · ' + Number(total.repeats || 0) + ' repeats · ' + freshness.length + ' freshness ledgers / ' + ledgerItems + ' served items · ' + safe(String(data.generatedAt || '').replace('T', ' ').replace('Z', '')) + '</small></span>';
    var rows = Array.isArray(data.channels) ? data.channels.slice().sort(function (a, b) { return Number(a.score || 0) - Number(b.score || 0); }).slice(0, 8) : [];
    channels.innerHTML = rows.length ? rows.map(function (row) {
      return '<button type="button" class="rs31-server-row ' + safe(row.band || 'watch') + '" data-rs31-channel="' + Number(row.channel_key || 0) + '"><span><b>' + String(Number(row.channel_key || 0)).padStart(3, '0') + '</b> ' + safe(row.last_status || 'CHANNEL') + '</span><em>' + Number(row.score || 0) + '</em><small>F ' + safe(row.first_frame_avg_ms == null ? '—' : Math.round(row.first_frame_avg_ms) + 'ms') + ' · ERR ' + Number(row.failures || 0) + ' · REP ' + Number(row.repeats || 0) + '</small></button>';
    }).join('') : '<span class="rs31-muted">No server channel sample in this window.</span>';
    var sourceRows = Array.isArray(data.sources) ? data.sources.slice(0, 8) : [];
    sources.innerHTML = sourceRows.length ? sourceRows.map(function (row) {
      var tone = row.cooldownActive ? 'bad' : Number(row.failures || 0) ? 'warn' : 'good';
      return '<div class="rs31-source-row ' + tone + '"><span><b>' + safe(row.source_key) + '</b><small>' + Number(row.successes || 0) + ' ok · ' + Number(row.failures || 0) + ' failed</small></span><em>' + (row.cooldownActive ? 'COOLDOWN' : 'READY') + '</em></div>';
    }).join('') : '<span class="rs31-muted">No source health sample in this window.</span>';
    renderLive();
  }

  async function load() {
    if (state.loading) return;
    state.loading = true; state.error = ''; renderRemote();
    try {
      var response = await fetch(endpoint + '?hours=24&limit=40', { mode: 'cors', cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      state.data = await response.json();
    } catch (error) { state.error = String(error && error.message || error).slice(0, 120); }
    state.loading = false; renderRemote();
  }

  window.__rs31Health = { load: load, render: renderRemote, live: renderLive, endpoint: endpoint };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  setInterval(renderLive, 30000);
})();
