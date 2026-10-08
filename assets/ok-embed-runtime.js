/* OK's official embed emits started/timeupdate/ended/error events.
 * Keep HTML players out of <video>, and never use elapsed wall time as EOF. */
(function (root) {
  "use strict";
  var active = null;
  function normalize(item) {
    if (!item || item.provider !== "OK.ru") return item;
    var url = String(item.embedUrl || item.url || "");
    return /^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/i.test(url)
      ? Object.assign({}, item, { type: "embed", url: url, embedUrl: url, embedAllowed: true }) : item;
  }
  function qualify(profile, item) {
    if (!profile || String(profile.profileKey || "").indexOf("ok-") !== 0) return true;
    if (!item) return false;
    var title = String(item.title || ""), lower = title.toLowerCase();
    var family = /^ok-(kids|adult|anime)-channel$/.exec(String(profile.profileKey || ""));
    if (family) {
      return item.animationVerified === true && item.animationVerificationVersion === 2 && item.animationFamily === family[1] && item.language === "en"
        && (!(Number(item.animationEpisodeRuntime)>0) || Number(item.duration)<=Number(item.animationEpisodeRuntime)*1.35 || /\b(?:compilation|marathon|complete series|complete season|all episodes|full series|full season|mega comp)\b/i.test(title))
        && /^tvmaze:\d+$/.test(String(item.seriesId || ""))
        && /^https:\/\/www\.tvmaze\.com\/shows\/\d+(?:\/|$)/.test(String(item.identityReference || ""))
        && /^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/.test(String(item.embedUrl || item.url || ""))
        && item.embedAllowed === true && Number(item.duration || item.runtime) >= 900 && Number(item.aspectRatio) >= 1.2
        && !/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff]/.test(title)
        && !/\b(?:vostfr|truefrench|subbed|subesp|rus|russian|french|spanish|german|hindi|tamil|telugu|italian|hungarian|dublado|dual|multi|donghua|latino|espa[nñ]ol|fran[cç]ais|episodul|portugu[eê]s|subtitulado)\b/i.test(title)
        && !/\b(?:shorts?|clip|trailer|teaser|recap|reaction|review|podcast|how[ -]to|tutorial|fan[ -]?(?:made|film|edit|animation)|parody|amv|gacha|gameplay|porn|hentai|nsfw|audio only)\b/i.test(title)
        && (family[1] !== "anime" || /\b(?:english[ ._-]+dub(?:bed)?|dub(?:bed)?[ ._-]+english)\b/i.test(title));
    }
    var tv = profile.intent === "television", reference = String(item.identityReference || "");
    if (item.language !== "en" || (tv
      ? !/^https:\/\/www\.tvmaze\.com\/shows\/\d+(?:\/|$)/.test(reference) || !/^tvmaze:\d+$/.test(String(item.seriesId || ""))
      : !/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(reference))) return false;
    var url = String(item.embedUrl || item.url || "");
    if (!/^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/i.test(url)) return false;
    if (Number(item.duration || item.runtime) < (profile.intent === "film" ? 3600 : 900)) return false;
    if (!(Number(item.aspectRatio) >= 1)) return false;
    if (!(profile.titleRequiredTerms || []).some(function (term) { return lower.indexOf(String(term).toLowerCase()) >= 0; })) return false;
    if ((profile.deny || []).some(function (term) {
      return new RegExp("(?:^|[^a-z0-9])" + String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:$|[^a-z0-9])", "i").test(title);
    })) return false;
    if (/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff]/.test(title)) return false;
    if (/\b(?:TRUEFRENCH|VOSTFR|SUBESP|FRENCH|GERMAN|HUN|RUS|DUBLADO|DUBBED|DUAL|MULTI|BTTH|donghua|Apotheosis|concert|full set|dj set|fan[ -]?made|parody|podcast)\b/i.test(title)) return false;
    if (/(?:[._ -](?:TR|FR|ES|RU|HU|DE)[._ -]|\((?:spanish|french|german|italian|portuguese)\b|\bteljes\s+film\b|\bmagyar\b)/i.test(title)) return false;
    if (/\b(?:UKR|DVO|UKRAINIAN|DUBLAJ|COMMENTARY\s+ONLY|AUDIO\s+ONLY|HDCAM|CAMRIP)\b/i.test(title)) return false;
    return !item.language || /^en(?:[-_]|$)/i.test(item.language);
  }
  function stop() { if (active) active(); active = null; }
  function order(profile, items) {
    var groups = new Map(), seen = new Set(), result = [], tv = profile.intent === "television" || /^ok-(?:kids|adult|anime)-channel$/.test(String(profile.profileKey || ""));
    items.forEach(function (item) {
      var series = String(item.seriesId || item.seriesTitle || item.id);
      var episode = String(item.title || "").match(/\b(?:s\d{1,2}[ ._-]*e\d{1,3}|\d{1,2}x\d{1,3})\b/i);
      var key = tv && episode ? series + ":" + episode[0].toLowerCase().replace(/[ ._-]/g, "") : !tv && item.identityReference ? item.identityReference : item.id;
      if (seen.has(key)) return; seen.add(key);
      if (!groups.has(series)) groups.set(series, []);
      groups.get(series).push(item);
    });
    while (Array.from(groups.values()).some(function (list) { return list.length; })) {
      groups.forEach(function (list) { if (list.length) result.push(list.shift()); });
    }
    return result;
  }
  function play(options) {
    stop();
    return new Promise(function (resolve) {
      var frame = document.createElement("iframe"), disposed = false, loaded = false, playing = false, advanced = false, settled = false, timer;
      function settle(value) { if (!settled) { settled = true; resolve(value); } }
      function cleanup() {
        disposed = true; clearTimeout(timer); root.removeEventListener("message", message); frame.onload = null;
        if (active === cleanup) active = null;
        settle(false);
      }
      function fail() {
        if (disposed || !options.isCurrent()) return;
        var wasLoaded = loaded;
        cleanup(); frame.remove();
        if (wasLoaded) options.onError();
      }
      function message(event) {
        if (disposed || !options.isCurrent() || event.source !== frame.contentWindow || event.origin !== "https://ok.ru") return;
        var data = event.data;
        try { if (typeof data === "string") data = JSON.parse(data); } catch (_) { return; }
        if (!data || typeof data !== "object") return;
        if (data.event === "error") { fail(); return; }
        if (data.event === "started" || data.event === "timeupdate" && Number(data.time) > 0) {
          if (!playing) { playing = true; clearTimeout(timer); frame.dataset.playbackState = "playing"; options.onStarted(); }
        }
        if (data.event === "ended" && playing && !advanced) { advanced = true; options.onEnded(); }
      }
      frame.title = options.item.title || "OK.ru program";
      var url = new URL(options.item.embedUrl || options.item.url);
      if (url.origin !== "https://ok.ru" || !/^\/videoembed\/\d+$/.test(url.pathname)) { settle(false); return; }
      url.searchParams.set("autoplay", "1");
      frame.src = url.href;
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true; frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.dataset.playbackState = "loading";
      frame.onload = function () {
        if (disposed || !options.isCurrent()) { cleanup(); return; }
        if (!loaded) { loaded = true; frame.dataset.playbackState = "ready"; options.onReady(); settle(true); }
      };
      root.addEventListener("message", message);
      active = cleanup;
      options.container.appendChild(frame);
      // Only an iframe that never loads may fail by timeout. Autoplay policy,
      // paused content and provider ads must never trigger reconnect/skip loops.
      timer = setTimeout(function () { if (!loaded) fail(); }, 20000);
    });
  }
  root.RealSignalOKEmbed = { play: play, stop: stop, qualify: qualify, order: order, normalize: normalize };
})(window);
