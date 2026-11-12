/* Default V6 presentation. Existing playback/rotation retain ownership; v6=0 rolls back UI. */
(function () {
  var api = window.RealSignalPresentation;
  if (!api || !api.available) return;
  var preview = new URLSearchParams(location.search).get('guidePreview') !== '0';
  var root = document.documentElement, dock, more, idleTimer, state, guideWasOpen = false, guideWasV6 = false;
  var refs = {};
  function element(tag, id, text, parent) {
    var el = document.createElement(tag);
    if (id) { el.id = id; refs[id] = el; }
    if (text) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }
  function text(id, value) {
    var el = refs[id];
    if (el && el.textContent !== value) el.textContent = value;
  }
  function visiblePanel(id) {
    if (id === 'gwrap' && window.RealSignalGuide && window.RealSignalGuide.isOpen()) return true;
    var el = document.getElementById(id);
    return el && !el.classList.contains('hide') && (id !== 'gwrap' || el.classList.contains('show'));
  }
  function keepAwake() {
    return !state || (state.state !== 'playing' && (!preview || state.state !== 'live')) || dock.contains(document.activeElement) ||
      more && !more.hidden || visiblePanel('gwrap') || visiblePanel('infoPanel') || visiblePanel('osdMenu');
  }
  function wake() {
    if (!dock || dock.hidden) return;
    dock.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (!keepAwake()) dock.classList.add('is-idle'); }, 4500);
  }
  function button(id, label, name, value, parent, aria) {
    var el = element('button', 'rsV6' + id, label, parent);
    el.type = 'button';
    if (aria) el.setAttribute('aria-label', aria);
    el.addEventListener('keydown', function (event) {
      if (/^[0-9]$/.test(event.key)) { el.blur(); return; }
      // Keep native button activation; legacy document shortcuts must not consume it.
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
    el.addEventListener('click', function () {
      if (parent === more && ['info','menu','cast'].includes(name)) { showMore(false); refs.rsV6More.focus(); }
      api.command(name, value); wake(); refresh();
    });
    return el;
  }
  function showMore(open) {
    more.hidden = !open;
    refs.rsV6More.setAttribute('aria-expanded', open);
    wake();
  }
  function mount() {
    dock = element('section', 'rsV6Dock', '', document.body);
    dock.setAttribute('aria-label', 'RealSignal television controls');
    var readout = element('div', 'rsV6Readout', '', dock);
    var dial = element('div', 'rsV6Dial', '', readout);
    element('small', '', 'CHANNEL', dial);
    element('strong', 'rsV6Channel', '—', dial);
    var copy = element('div', 'rsV6Copy', '', readout);
    element('div', 'rsV6Brand', 'REALSIGNAL / RETRO CABLE', copy);
    element('div', 'rsV6Title', 'Television is off', copy);
    element('div', 'rsV6Status', 'STANDBY', copy);
    button('Live', 'Back to Live', 'broadcast-live', null, readout).hidden = true;
    var clock = element('div', 'rsV6Clock', '', readout);
    element('time', 'rsV6Time', '', clock);
    element('div', 'rsV6Date', '', clock);
    var controls = element('nav', 'rsV6Controls', '', dock);
    controls.setAttribute('aria-label', 'Playback controls');
    button('Power', '⏻ Power', 'power', null, controls);
    button('ChDown', 'CH −', 'channel-step', -1, controls, 'Previous channel');
    button('ChUp', 'CH +', 'channel-step', 1, controls, 'Next channel');
    button('Guide', 'Guide', 'guide-open', null, controls);
    button('Next', 'Next ▶', 'next', null, controls, 'Play the next program');
    if (preview) {
      var toggle = element('button', 'rsV6More', 'More', controls);
      toggle.type = 'button';
      toggle.setAttribute('aria-controls', 'rsV6MoreControls');
      toggle.addEventListener('click', function () { showMore(more.hidden); });
      more = element('div', 'rsV6MoreControls', '', controls);
      showMore(false);
      document.addEventListener('pointerdown', function (event) {
        if (!more.hidden && !dock.contains(event.target)) showMore(false);
      });
      dock.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !more.hidden) {
          event.stopPropagation(); showMore(false); toggle.focus();
        }
      });
    }
    var extra = more || controls;
    button('Info', 'Info', 'info', null, extra);
    button('Menu', 'Menu', 'menu', null, extra);
    button('VolDown', 'VOL −', 'volume-step', -0.1, extra, 'Lower volume');
    button('VolUp', 'VOL +', 'volume-step', 0.1, extra, 'Raise volume');
    button('Mute', 'Mute', 'mute', null, extra);
    button('Cast', 'Cast', 'cast', null, extra, 'Cast RealSignal to a television');
    document.addEventListener('pointermove', wake);
    document.addEventListener('pointerdown', wake);
    document.addEventListener('keydown', wake);
    document.addEventListener('focusin', wake);
    document.addEventListener('focusout', wake);
  }
  function refresh() {
    var active = !!api.enabled;
    root.classList.toggle('rs-v6-watch', active);
    if (preview) root.classList.toggle('rs-guide-preview', active);
    if (!active) {
      if (dock) { dock.hidden = true; clearTimeout(idleTimer); }
      guideWasOpen = false;
      guideWasV6 = false;
      return;
    }
    if (!dock) mount();
    var entering = dock.hidden;
    dock.hidden = false;
    state = api.snapshot();
    text('rsV6Channel', state.state === 'standby' ? '—' : String(state.channel && state.channel.number || '—'));
    text('rsV6Title', state.current ? state.current.title : state.state === 'standby' ? 'Press Power to start watching' : state.channel ? state.channel.name : 'Select a channel');
    text('rsV6Status', state.state === 'standby' ? 'STANDBY' : [state.state.toUpperCase(), state.channel && state.channel.name].filter(Boolean).join(' · '));
    var now = new Date();
    text('rsV6Time', now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toUpperCase());
    text('rsV6Date', now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase());
    refs.rsV6Power.setAttribute('aria-pressed', state.state !== 'standby');
    refs.rsV6Mute.setAttribute('aria-pressed', typeof muted !== 'undefined' && !!muted);
    refs.rsV6Live.hidden = !window.RealSignalBroadcast?.watchingAhead();
    var guideOpen = !!visiblePanel('gwrap');
    refs.rsV6Guide.setAttribute('aria-expanded', guideOpen);
    if (guideOpen && more && !more.hidden) showMore(false);
    if (guideWasOpen && !guideOpen && !guideWasV6) refs.rsV6Guide.focus();
    guideWasOpen = guideOpen;
    guideWasV6 = !!(window.RealSignalGuide && window.RealSignalGuide.isOpen());
    if (entering || keepAwake()) wake();
  }
  window.RealSignalWatchingShell = { refresh: refresh };
  refresh();
  wake();
  setInterval(refresh, 1000);
})();
