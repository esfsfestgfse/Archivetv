/* One opt-in guide presenter. Reads shelves; never discovers or prepares media. */
(function () {
  var api = window.RealSignalPresentation, query = new URLSearchParams(location.search);
  if (!api || query.get('v6') !== '1' || query.get('castReceiver') === '1') return;
  var panel, list, refs = {}, rowRefs = {}, entries = [], selected = null, opener, timer, opened = false;
  var category = 'all', view = 'all', search = '', scroll = 0;
  var oldOpen = window.openGuide, oldClose = window.closeGuide;
  function el(tag, id, text, parent, cls) {
    var node = document.createElement(tag);
    if (id) { node.id = id; refs[id] = node; }
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }
  function put(node, text) { text = String(text == null ? '' : text); if (node.textContent !== text) node.textContent = text; }
  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  function measured(action, started) {
    var ms = Math.max(0, now() - started);
    panel.setAttribute('data-' + action + '-ms', ms.toFixed(2));
    try { if (window.__rsRelease2Telemetry) window.__rsRelease2Telemetry.record({ type: 'guide-' + action, ms: ms, requested: true, presentation: 'v6' }); } catch (_) {}
  }
  function button(id, label, parent, fn, cls) {
    var node = el('button', id, label, parent, cls); node.type = 'button'; node.addEventListener('click', fn); return node;
  }
  function snapshot(number) {
    try { return api.snapshot(number) || {}; } catch (_) { return { state: 'pending' }; }
  }
  function runtime(program) {
    var seconds = program && program.durationSeconds;
    if (!(Number(seconds) > 0) || !Number.isFinite(Number(seconds))) return '';
    var minutes = Math.max(1, Math.round(seconds / 60));
    return minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + ' hr' + (minutes % 60 ? ' ' + minutes % 60 + ' min' : '');
  }
  function programs(s) {
    return { first: s.current || s.next || null, second: s.current ? s.next : s.later,
      label: s.live ? 'Live' : s.current ? (s.current.isAd ? 'Commercial break' : 'Playing') : 'Coming up' };
  }
  function updateRow(row, s) {
    var p = programs(s);
    put(row.now, p.first ? p.first.title : 'Program information pending');
    put(row.next, p.second ? p.second.title : s.live ? 'Program information unavailable' : 'Next program pending');
    put(row.meta, [p.label, runtime(p.first)].filter(Boolean).join(' · '));
    put(row.nextMeta, runtime(p.second));
  }
  function select(number, focus) {
    selected = number;
    entries.forEach(function (entry) {
      var row = rowRefs[entry.number], active = entry.number === selected;
      row.button.setAttribute('aria-pressed', active); row.button.tabIndex = active ? 0 : -1;
      row.favorite.tabIndex = active ? 0 : -1; row.host.classList.toggle('is-selected', active);
    });
    details();
    if (focus && rowRefs[number]) {
      rowRefs[number].button.focus({ preventScroll: true });
      rowRefs[number].host.scrollIntoView({ block: 'nearest' });
    }
  }
  function details() {
    var entry = entries.find(function (item) { return item.number === selected; });
    refs.rsV6GuideWatch.disabled = !entry;
    put(refs.rsV6GuideChannelName, entry ? entry.name : 'Choose a channel');
    put(refs.rsV6GuideNumber, entry ? 'CH ' + entry.number : 'PROGRAM DETAILS');
    put(refs.rsV6GuideDescription, entry ? entry.description || entry.categoryLabel : 'Search or choose a category to browse.');
    var s = entry ? snapshot(entry.number) : {}, p = programs(s);
    put(refs.rsV6GuideProgram, p.first ? p.first.title : 'Program information pending');
    put(refs.rsV6GuideRuntime, [p.label, runtime(p.first), p.first && p.first.provider].filter(Boolean).join(' · '));
    put(refs.rsV6GuideFollowing, p.second ? 'Next · ' + p.second.title + (runtime(p.second) ? ' · ' + runtime(p.second) : '') : s.live ? 'Program information unavailable' : 'Next program pending');
    var remaining = s.remainingSeconds;
    put(refs.rsV6GuideRemaining, remaining != null && Number.isFinite(Number(remaining)) ? Math.ceil(remaining / 60) + ' min remaining' : '');
    put(refs.rsV6GuideWatch, entry ? 'Watch channel ' + entry.number + ' →' : 'Watch channel');
  }
  function favorite(number) {
    var focus = document.activeElement, oldScroll = list.scrollTop;
    api.command('favorite', number); render(); list.scrollTop = oldScroll;
    var row = rowRefs[number];
    if (row && focus && focus.id === 'rsV6GuideFav-' + number) row.favorite.focus({ preventScroll: true });
    else if (focus && !panel.contains(focus)) refs.rsV6GuideFavorites.focus();
  }
  function render() {
    var needle = search.toLowerCase().trim();
    entries = api.directory().filter(function (entry) {
      if (category !== 'all' && entry.categoryId !== category) return false;
      if (view === 'favorites' && !entry.favorite || view === 'recent' && entry.recentIndex < 0) return false;
      if (!needle) return true;
      var s = snapshot(entry.number);
      return [entry.number, entry.name, entry.categoryLabel, entry.description,
        s.current && s.current.title, s.next && s.next.title, s.later && s.later.title].join(' ').toLowerCase().includes(needle);
    });
    if (view === 'recent') entries.sort(function (a, b) { return a.recentIndex - b.recentIndex; });
    if (!entries.some(function (entry) { return entry.number === selected; })) selected = entries.length ? entries[0].number : null;
    list.replaceChildren(); rowRefs = {};
    entries.forEach(function (entry) {
      var host = el('div', '', '', list, 'rsg-row'); host.dataset.channelNum = entry.number;
      var choose = button('rsV6GuideRow-' + entry.number, '', host, function () { select(entry.number, false); }, 'rsg-select');
      var identity = el('span', '', '', choose, 'rsg-channel');
      el('strong', '', String(entry.number), identity, 'rsg-digits');
      el('span', '', entry.name, identity, 'rsg-channel-name');
      var playing = el('span', '', '', choose, 'rsg-program');
      var now = el('span', 'rsV6GuideNow-' + entry.number, '', playing, 'rsg-program-title');
      var meta = el('small', '', '', playing);
      var following = el('span', '', '', choose, 'rsg-next');
      var next = el('span', 'rsV6GuideNext-' + entry.number, '', following, 'rsg-program-title');
      var nextMeta = el('small', '', '', following);
      var fav = button('rsV6GuideFav-' + entry.number, entry.favorite ? '★' : '☆', host, function () { favorite(entry.number); }, 'rsg-favorite');
      fav.setAttribute('aria-label', (entry.favorite ? 'Remove ' : 'Save ') + entry.name + (entry.favorite ? ' from favorites' : ' to favorites'));
      fav.setAttribute('aria-pressed', entry.favorite);
      rowRefs[entry.number] = { host: host, button: choose, favorite: fav, now: now, meta: meta, next: next, nextMeta: nextMeta };
      updateRow(rowRefs[entry.number], snapshot(entry.number));
    });
    refs.rsV6GuideEmpty.hidden = entries.length > 0;
    put(refs.rsV6GuideCount, entries.length + ' channels');
    ['All', 'Favorites', 'Recent'].forEach(function (name) {
      refs['rsV6Guide' + name].setAttribute('aria-pressed', view === name.toLowerCase());
    });
    refs.rsV6GuideCategory.value = category;
    api.categories().forEach(function (group) { var node = refs['rsV6GuideCat-' + group.id]; if (node) node.setAttribute('aria-pressed', category === group.id); });
    select(selected, false);
  }
  function filter() { render(); list.scrollTop = 0; }
  function keydown(event) {
    if (!opened) return;
    event.stopPropagation(); // Keep existing page shortcuts out of this dialog.
    if (event.key === 'Escape' || event.key === 'BrowserBack') { event.preventDefault(); close(); return; }
    if (event.key === 'Tab') {
      var controls = Array.from(panel.querySelectorAll('button,input,select')).filter(function (node) { return !node.disabled && !node.hidden && node.tabIndex >= 0 && node.getClientRects().length; });
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    var row = entries.findIndex(function (entry) { return event.target === rowRefs[entry.number].button; });
    if (row >= 0 && ['ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
      event.preventDefault();
      var index = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : Math.max(0, Math.min(entries.length - 1, row + (event.key === 'ArrowDown' ? 1 : -1)));
      select(entries[index].number, true);
    } else if (row >= 0 && event.key === 'ArrowRight') { event.preventDefault(); refs.rsV6GuideWatch.focus(); }
    else if (event.target === refs.rsV6GuideWatch && event.key === 'ArrowLeft' && selected != null) { event.preventDefault(); rowRefs[selected].button.focus(); }
  }
  function mount() {
    panel = el('section', 'rsV6GuidePanel', '', document.body); panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'rsV6GuideHeading');
    var header = el('header', '', '', panel, 'rsg-header');
    el('span', '', '◉ REALSIGNAL', header, 'rsg-brand'); el('h1', 'rsV6GuideHeading', 'Program guide', header);
    el('span', 'rsV6GuideCount', '', header, 'rsg-count');
    button('rsV6GuideClose', 'Close ✕', header, close);
    var toolbar = el('div', '', '', panel, 'rsg-toolbar');
    var label = el('label', '', 'Search the lineup', toolbar, 'rsg-search-label');
    var input = el('input', 'rsV6GuideSearch', '', label); input.type = 'search'; input.placeholder = 'Channel, genre or program'; input.autocomplete = 'off';
    input.addEventListener('input', function () { search = input.value; filter(); });
    var modes = el('nav', '', '', toolbar, 'rsg-views'); modes.setAttribute('aria-label', 'Channel views');
    ['All','Favorites','Recent'].forEach(function (name) { button('rsV6Guide' + name, name, modes, function () { view = name.toLowerCase(); filter(); }); });
    var body = el('div', '', '', panel, 'rsg-body');
    var categories = el('nav', '', '', body, 'rsg-categories'); categories.setAttribute('aria-label', 'Guide categories');
    var categoryLabel = el('label', '', 'Category', categories, 'rsg-mobile-category');
    var selectCategory = el('select', 'rsV6GuideCategory', '', categoryLabel);
    api.categories().forEach(function (group) {
      var option = el('option', '', group.label, selectCategory); option.value = group.id;
      button('rsV6GuideCat-' + group.id, group.label, categories, function () { category = group.id; filter(); });
    });
    selectCategory.addEventListener('change', function () { category = selectCategory.value; filter(); });
    var main = el('div', '', '', body, 'rsg-main');
    var columns = el('div', '', '', main, 'rsg-columns'); columns.setAttribute('aria-hidden', 'true');
    ['Channel','Playing / coming up','Next'].forEach(function (title) { el('span', '', title, columns); });
    list = el('div', 'rsV6GuideList', '', main); list.setAttribute('aria-label', 'Channels');
    el('p', 'rsV6GuideEmpty', 'No channels match. Try All or clear the search.', main);
    var detail = el('aside', '', '', body, 'rsg-detail'); detail.setAttribute('aria-label', 'Selected channel');
    el('small', 'rsV6GuideNumber', '', detail); el('h2', 'rsV6GuideChannelName', '', detail);
    el('p', 'rsV6GuideDescription', '', detail); el('div', '', 'PROGRAM', detail, 'rsg-eyebrow');
    el('h3', 'rsV6GuideProgram', '', detail); el('p', 'rsV6GuideRuntime', '', detail);
    el('p', 'rsV6GuideRemaining', '', detail); el('p', 'rsV6GuideFollowing', '', detail);
    button('rsV6GuideWatch', 'Watch channel →', detail, function () { if (selected == null) return; var number = selected; close(); api.command('tune', number); }, 'rsg-watch');
    panel.addEventListener('keydown', keydown);
  }
  function refresh() {
    if (!opened) return;
    if (!api.enabled) { close(); return; }
    var bounds = list.getBoundingClientRect();
    entries.forEach(function (entry) {
      var row = rowRefs[entry.number], rect = row.host.getBoundingClientRect();
      if (rect.bottom >= bounds.top && rect.top <= bounds.bottom) updateRow(row, snapshot(entry.number));
    });
    details();
  }
  function open() {
    if (!api.enabled) return false;
    if (opened) return true;
    var started = now();
    if (!panel) mount();
    opener = document.activeElement; opened = true; panel.hidden = false;
    if (selected == null) { var current = api.snapshot(); selected = current.channel && current.channel.number; }
    render(); list.scrollTop = scroll; refs.rsV6GuideSearch.focus({ preventScroll: true });
    timer = setInterval(refresh, 1000); syncDock(); measured('open', started); return true;
  }
  function close() {
    if (!opened) return;
    var started = now();
    scroll = list.scrollTop; opened = false; clearInterval(timer); panel.hidden = true;
    if (api.enabled && opener && opener.isConnected) opener.focus({ preventScroll: true });
    else if (panel.contains(document.activeElement)) document.activeElement.blur();
    syncDock(); measured('close', started);
  }
  function syncDock() { if (window.RealSignalWatchingShell) window.RealSignalWatchingShell.refresh(); }
  window.RealSignalGuide = { open: open, close: close, refresh: refresh, isOpen: function () { return opened; } };
  window.openGuide = function () { if (api.enabled) return open(); return oldOpen.apply(this, arguments); };
  window.closeGuide = function () { if (api.enabled) return close(); return oldClose.apply(this, arguments); };
})();
