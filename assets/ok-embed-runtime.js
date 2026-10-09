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
    if (profile.profileKey === "ok-soul-flow-channel") {
      var clean = function (value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
      var artist = String(item.musicArtist || ""), input = title.trim();
      var song = artist && clean(input.slice(0,artist.length)) === clean(artist) && /^[\s\-–—_:,.]+/.test(input.slice(artist.length))
        ? input.slice(artist.length).replace(/^[\s\-–—_:,.]+/, "")
          .replace(/\([^)]*(?:official|music video|remaster|\b(?:19|20)\d{2}\b|\b(?:hd|hq|4k|1080p|720p)\b)[^)]*\)/gi, "")
          .replace(/\[[^\]]*\]/g, "")
          .replace(/\b(?:official(?: music)? video|music video|official|remastered|hd|hq|4k|1080p|720p)\b.*$/i, "")
          .replace(/\b(?:feat\.?|ft\.?)\s+.*$/i, "")
          .replace(/["“”]/g, "").replace(/\s*\((?:\d+)\)\s*$/, "").replace(/[\s\-_:,]+$/, "").trim() : "";
      var mbid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
      return item.musicVerified === true && item.musicVerificationVersion === 2
        && item.musicReleaseYear >= 1980 && item.musicReleaseYear <= 2009
        && mbid.test(String(item.musicArtistId || "")) && mbid.test(String(item.musicRecordingId || ""))
        && item.identityReference === "https://musicbrainz.org/recording/" + item.musicRecordingId
        && !!item.id && !!song && song.length <= 160 && clean(artist) + ":" + clean(song) === item.musicTrackKey
        && item.embedAllowed === true && /^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/.test(String(item.embedUrl || item.url || ""))
        && Number(item.duration) >= 120 && Number(item.duration) <= 900 && Number(item.aspectRatio) >= 1.2
        && !/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff]|\b(?:vostfr|subesp|dublado|latino|espa[nñ]ol|fran[cç]ais)\b/i.test(title)
        && !/\b(?:lyrics?|live|concert|reaction|review|podcast|interview|tutorial|trailer|teaser|cover|karaoke|remix|bootleg|dj[ -]?edit|tribute|slideshow|mashup|parody|fan[ -]?(?:made|edit|video)|unofficial|audio[ -]?only|visualizer|shorts?|vertical|dance practice|behind the scenes|making of)\b/i.test(title);
    }
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
    var curated = /^ok-(britannia|history-vault|factory-floor|black-tv)-channel$/.exec(String(profile.profileKey || ""));
    if (curated) {
      var expectedFamily = curated[1] === "history-vault" ? "history" : curated[1] === "factory-floor" ? "factory" : curated[1];
      return item.curatedVerified === true && item.curatedVerificationVersion === 1 && item.curatedFamily === expectedFamily
        && item.language === "en" && String(item.seriesId || "").indexOf("realsignal-ok:" + expectedFamily + ":") === 0
        && /^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/.test(String(item.embedUrl || item.url || ""))
        && item.embedAllowed === true && Number(item.duration || item.runtime) >= 900 && Number(item.aspectRatio) >= 1.2
        && !/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff]/.test(title)
        && !/\b(?:shorts?|clip|trailer|teaser|recap|reaction|review|podcast|how[ -]?to|tutorial|fan[ -]?(?:made|film|edit)|parody|gameplay|audio only)\b/i.test(title);
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
  function programKey(item) {
    if (!item) return "";
    if (item.musicVerified && item.identityReference) return item.identityReference;
    var value = String(item.title || "").replace(/[_.:-]+/g, " ");
    var pair = value.match(/\bs\s*(\d{1,2})\s*e\s*(\d{1,3})\b/i)
      || value.match(/\b(\d{1,2})\s*x\s*(\d{1,3})\b/i)
      || value.match(/\bseason\s*(\d{1,2})\s*(?:episode|ep)\s*(\d{1,3})\b/i);
    var episode = pair ? "s" + String(Number(pair[1])).padStart(2, "0") + "e" + String(Number(pair[2])).padStart(2, "0")
      : (value.match(/\b(?:episode|ep)\s*(\d{1,3})\b/i) || [])[1];
    if (!pair && episode) episode = "episode" + Number(episode);
    episode = episode || item.episodeIdentity;
    return item.seriesId && episode ? item.seriesId + ":" + episode
      : !item.seriesId && item.identityReference ? item.identityReference : item.id;
  }
  function order(profile, items, recentArtists) {
    var groups = new Map(), seen = new Set(), result = [], tv = profile.intent === "television" || /^ok-(?:kids|adult|anime)-channel$/.test(String(profile.profileKey || ""));
    items.forEach(function (item) {
      var series = String(item.musicArtistId || item.seriesId || item.seriesTitle || item.id);
      var key = item.musicVerified ? programKey(item) : tv ? programKey(item) : item.identityReference || item.id;
      if (seen.has(key)) return; seen.add(key);
      if (!groups.has(series)) groups.set(series, []);
      groups.get(series).push(item);
    });
    var artists = (Array.isArray(recentArtists) ? recentArtists : []).slice(0,8).reverse();
    while (Array.from(groups.values()).some(function (list) { return list.length; })) {
      var available = Array.from(groups.entries()).filter(function (entry) { return entry[1].length; });
      var music = available.some(function (entry) { return entry[1][0].musicVerified; });
      if (music) {
        var selected = available.find(function (entry) { return artists.indexOf(entry[0]) < 0; }) || available[0];
        result.push(selected[1].shift()); artists.push(selected[0]); artists = artists.slice(-8);
      } else groups.forEach(function (list) { if (list.length) result.push(list.shift()); });
    }
    return result;
  }
  // Background discovery must not replace the item a tune is awaiting.
  function reconcileShelf(state, items) {
    var selectedId = String(state.pendingId || state.currentId || "");
    var selected = (state.items || []).find(function (item) { return String(item.id) === selectedId; });
    var selectedKey = selected && programKey(selected);
    var next = items.filter(function (item) { return !selectedKey || programKey(item) !== selectedKey || String(item.id) === selectedId; });
    var index = next.findIndex(function (item) { return String(item.id) === selectedId; });
    if (selected && index < 0) { next.unshift(selected); index = 0; }
    return { items: next, cursor: index >= 0 ? index : 0 };
  }
  function play(options) {
    stop();
    return new Promise(function (resolve) {
      var frame = document.createElement("iframe"), disposed = false, loaded = false, playing = false, startSuppressed = false, advanced = false, settled = false, timer;
      function settle(value) { if (!settled) { settled = true; resolve(value); } }
      function cleanup() {
        disposed = true; clearTimeout(timer); root.removeEventListener("message", message); frame.onload = null;
        if (active === cleanup) active = null;
        settle(false);
      }
      function armStartTimer() {
        clearTimeout(timer);
        if (startSuppressed) return;
        timer = setTimeout(function () { if (!playing) fail(); }, 15000);
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
        // Explicit pauses, autoplay restrictions and ads are not failed media.
        if (/^(?:paused|autoplaySoundProhibited|adShown|adStarted)$/.test(data.event)) { startSuppressed = true; clearTimeout(timer); return; }
        if (/^(?:resumed|adCompleted)$/.test(data.event)) { startSuppressed = false; if (!playing) armStartTimer(); }
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
        if (!loaded) { loaded = true; frame.dataset.playbackState = "ready"; if (!playing) armStartTimer(); options.onReady(); settle(true); }
      };
      root.addEventListener("message", message);
      active = cleanup;
      options.container.appendChild(frame);
      // Page load is not video start. A silent, unstarted player gets one
      // bounded recovery; actual EOF alone advances a playing program.
      timer = setTimeout(function () { if (!loaded) fail(); }, 20000);
    });
  }
  root.RealSignalOKEmbed = { play: play, stop: stop, qualify: qualify, order: order, normalize: normalize, programKey: programKey, reconcileShelf: reconcileShelf };
})(window);
