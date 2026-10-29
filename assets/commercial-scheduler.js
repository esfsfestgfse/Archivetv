/* Inter-program eligibility and an ad ledger separate from program history. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RealSignalCommercials = api;
})(typeof window !== 'undefined' ? window : this, function () {
  function isSuperBowlChannel(ch) { return !!ch && !ch.audio && !ch.source && String(ch.num) === '51'; }
  function superBowlQueries() {
    var base = 'mediatype:movies AND (title:("super bowl" OR superbowl) OR subject:("super bowl" OR superbowl)) AND title:(commercial OR commercials OR advertisement OR ads)' +
      ' AND NOT (title:(podcast OR reaction OR review OR ranking OR parody OR remake OR fake OR "full game" OR "with commercials" OR "radio commercial" OR "audio only"))';
    return [[1970,1979],[1980,1989],[1990,1999],[2000,2009],[2010,2019],[2020,2026]].map(function (years) {
      return base + ' AND year:[' + years[0] + ' TO ' + years[1] + ']';
    }).concat([base]);
  }
  function superBowlFiles(item, metadata) {
    var title = String(item && item.title || ''), id = String(item && item.identifier || '').split('::')[0];
    if (!id || !/super\s*bowl/i.test(title) || !/\b(?:commercials?|advertisements?|ads?)\b/i.test(title) ||
      /\b(?:podcast|reactions?|reviews?|ranking|parody|remake|fake|rejected|full game|with commercials|w\/commercials|audio only|radio commercial|ai generated)\b/i.test(title)) return [];
    var year = title.match(/\b(?:19|20)\d{2}\b/), chosen = {}, rows = [];
    var files = (metadata && metadata.files || []).filter(function (f) {
      var seconds = Number(f && (f.length || f.duration || f.runtime));
      return f && /\.mp4$/i.test(f.name || '') && seconds >= 10 && seconds <= 125 &&
        Number(f.width) >= Number(f.height) && Number(f.height) > 0 &&
        !/\b(?:teaser|review|reaction|podcast|compilation|countdown|remake|parody|fake|rejected|ai[ _-]+generated|fan[ _-]*made)\b/i.test(f.name.replace(/[._-]+/g, " "));
    }).sort(function (a, b) { return (/h\.?264/i.test(b.format) ? 1 : 0) - (/h\.?264/i.test(a.format) ? 1 : 0); });
    files.forEach(function (f) {
      var key = String(f.original || f.name).replace(/\.ia(?=\.mp4$)/i, '');
      if (chosen[key]) return; chosen[key] = true;
      var path = f.name.split('/').map(encodeURIComponent).join('/'), archive = 'https://archive.org/download/' + encodeURIComponent(id) + '/' + path;
      var host = String(metadata.d1 || metadata.server || ''), dir = String(metadata.dir || '').replace(/\/+$/, '');
      var url = /^[a-z0-9.-]+\.archive\.org$/i.test(host) && dir ? 'https://' + host + dir + '/' + path : archive;
      var spotTitle = title + (files.length > 1 ? ' — ' + f.name.replace(/(?:\.ia)?\.mp4$/i, '') : '');
      rows.push({ identifier: id + '::' + f.name, title: spotTitle, year: year ? Number(year[0]) : null,
        subject: 'Super Bowl television commercial', media: { type: 'video', url: url, alts: url === archive ? [] : [archive],
          runtime: Number(f.length || f.duration || f.runtime), width: Number(f.width), height: Number(f.height), sourceIdentifier: id, fileName: f.name } });
    });
    return rows;
  }
  var superBowlSeedData = [
  [
    "apple-super-bowl-1984-commercial",
    "apple1984.mp4",
    "Apple: 1984 \u2014 Super Bowl XVIII (1984)",
    1984,
    61.89,
    320,
    240,
    "https://dn600303.us.archive.org/0/items/apple-super-bowl-1984-commercial/apple1984.mp4"
  ],
  [
    "eds-super-bowl-commercial",
    "edscatherding.mp4",
    "EDS: Cat Herders \u2014 Super Bowl XXXIV (2000)",
    2000,
    60.22,
    320,
    240,
    "https://dn800306.us.archive.org/0/items/eds-super-bowl-commercial/edscatherding.mp4"
  ],
  [
    "youtube-DjaWKK6ylQg",
    "DjaWKK6ylQg.mp4",
    "Coca-Cola: Mean Joe Greene \u2014 Super Bowl XIV (1980)",
    1980,
    123.14,
    448,
    336,
    "https://dn801201.us.archive.org/0/items/youtube-DjaWKK6ylQg/DjaWKK6ylQg.mp4"
  ],
  [
    "eds-squirrels-super-bowl-commercial",
    "edsrunningwithsquirrels.mp4",
    "EDS: Running with the Squirrels \u2014 Super Bowl XXXV (2001)",
    2001,
    60.22,
    320,
    240,
    "https://dn600309.us.archive.org/0/items/eds-squirrels-super-bowl-commercial/edsrunningwithsquirrels.mp4"
  ],
  [
    "super-bowl-xl-commercial-ford-escape-hybrid-replace-version",
    "Super Bowl XL Commercial  Ford Escape Hybrid (Replace version).ia.mp4",
    "Super Bowl XL Commercial Ford Escape Hybrid (Replace Version)",
    2006,
    32.33,
    320,
    240,
    "https://ia601004.us.archive.org/6/items/super-bowl-xl-commercial-ford-escape-hybrid-replace-version/Super%20Bowl%20XL%20Commercial%20%20Ford%20Escape%20Hybrid%20(Replace%20version).ia.mp4"
  ],
  [
    "yt-5s.com-go-daddy-body-paint-2012-super-bowl-ad-360p",
    "yt5s.com-Go Daddy Body Paint 2012 Super Bowl Ad(360p).mp4",
    "GoDaddy Super Bowl XLVI Commercial: \"Body Paint\"",
    2012,
    30,
    640,
    360,
    "https://dn600206.us.archive.org/0/items/yt-5s.com-go-daddy-body-paint-2012-super-bowl-ad-360p/yt5s.com-Go%20Daddy%20Body%20Paint%202012%20Super%20Bowl%20Ad(360p).mp4"
  ],
  [
    "2-broke-girls-super-bowl-commercial-hd",
    "2 Broke Girls Super Bowl Commercial (HD).ia.mp4",
    "2 Broke Girls Spectacular Superbowl Commercial",
    2013,
    39.07,
    1920,
    1080,
    "https://ia902807.us.archive.org/27/items/2-broke-girls-super-bowl-commercial-hd/2%20Broke%20Girls%20Super%20Bowl%20Commercial%20(HD).ia.mp4"
  ],
  [
    "tweakers007175",
    "tweakers007175.mp4",
    "tweakers / 7175 / Rogen en Rudd in Samsungs Super Bowl-commercial",
    2013,
    120.16,
    1920,
    1080,
    "https://dn600207.us.archive.org/0/items/tweakers007175/tweakers007175.mp4"
  ],
  [
    "NintendoSwitchSuperBowlCommercialFebruary2017",
    "Nintendo Switch Super Bowl Commercial (February 2017).mp4",
    "Nintendo Switch Super Bowl Commercial ( February 2017)",
    2017,
    101.03,
    1280,
    720,
    "https://dn601205.us.archive.org/0/items/NintendoSwitchSuperBowlCommercialFebruary2017/Nintendo%20Switch%20Super%20Bowl%20Commercial%20(February%202017).mp4"
  ],
  [
    "xfinity-jurassic-park",
    "Jurassic Park... Works \uff5c Big Game Commercial 2026 \uff5c Xfinity.mp4",
    "Xfinity Jurassic Park ads (Super Bowl LX 2026)",
    2026,
    60.12,
    1920,
    1080,
    "https://ia600607.us.archive.org/28/items/xfinity-jurassic-park/Jurassic%20Park...%20Works%20%EF%BD%9C%20Big%20Game%20Commercial%202026%20%EF%BD%9C%20Xfinity.mp4"
  ],
  [
    "squarespace-sallys-seashells-super-bowl-2022-commercial-prores",
    "D001_Q122_SuperBowl_Longform_Online_Video_60.mp4",
    "Squarespace \u201cSally\u2019s Seashells\u201d Super Bowl 2022 Commercial (ProRes)",
    2022,
    60.1,
    854,
    480,
    "https://dn601208.us.archive.org/0/items/squarespace-sallys-seashells-super-bowl-2022-commercial-prores/D001_Q122_SuperBowl_Longform_Online_Video_60.mp4"
  ],
  [
    "dailymotion-x7rfeor",
    "Marvel_Studios_on_Disney+_Super_Bowl_Commercial_2020-x7rfeor.mp4",
    "Marvel Studios on Disney+ Super Bowl Commercial 2020",
    2020,
    30.14,
    1920,
    960,
    "https://dn601208.us.archive.org/0/items/dailymotion-x7rfeor/Marvel_Studios_on_Disney%2B_Super_Bowl_Commercial_2020-x7rfeor.mp4"
  ]
]; // File-level spots verified before release; background searches extend this pool.
  function superBowlSeeds() {
    return superBowlSeedData.map(function (row) {
      var id = row[0], file = row[1], archive = 'https://archive.org/download/' + encodeURIComponent(id) + '/' + file.split('/').map(encodeURIComponent).join('/');
      return { identifier: id + '::' + file, title: row[2], year: row[3], subject: 'Super Bowl television commercial',
        media: { type: 'video', url: row[7], alts: [archive], runtime: row[4], width: row[5], height: row[6], sourceIdentifier: id, fileName: file } };
    });
  }
  function create(store) {
    function read(key) { try { return store.get(key, {}) || {}; } catch (_) { return {}; } }
    function save(key, value) { try { store.set(key, value); } catch (_) {} }
    function era(item) { var year = String(item.year || '').match(/\b(?:19|20)\d{2}\b/); return year ? String(Math.floor(Number(year[0]) / 10) * 10) : 'undated'; }
    return {
      due: function (ch, seconds) {
        if (!ch || ch.source || ch.gl === 'commercials') return false;
        if (String(ch.cat).toUpperCase() !== 'TOON') return true;
        var blocks = read('realsignal:commercial-blocks:v1'), key = String(ch.num);
        var total = Number(blocks[key] || 0) + Math.max(0, Number(seconds) || 0), ready = total >= 25 * 60;
        blocks[key] = ready ? 0 : total; save('realsignal:commercial-blocks:v1', blocks);
        return ready;
      },
      choose: function (items, score) {
        var history = read('realsignal:commercial-history:v1'), seen = history.seen || {}, eras = history.eras || {};
        var fresh = items.filter(function (item) { return !seen[item.identifier]; });
        var choices = (fresh.length ? fresh : items).slice();
        choices.sort(function (a, b) { return Number(eras[era(a)] || 0) - Number(eras[era(b)] || 0) ||
          (score ? score(b) - score(a) : 0) || Number(seen[a.identifier] || 0) - Number(seen[b.identifier] || 0); });
        return choices[0] || null;
      },
      remember: function (item) {
        if (!item || !item.identifier) return;
        var history = read('realsignal:commercial-history:v1'); history.seen = history.seen || {}; history.eras = history.eras || {};
        history.seen[item.identifier] = Date.now(); var key = era(item); history.eras[key] = Number(history.eras[key] || 0) + 1;
        var ids = Object.keys(history.seen).sort(function (a, b) { return history.seen[b] - history.seen[a]; });
        ids.slice(128).forEach(function (id) { delete history.seen[id]; });
        save('realsignal:commercial-history:v1', history);
      }
    };
  }
  return { create: create, isSuperBowlChannel: isSuperBowlChannel, superBowlQueries: superBowlQueries,
    superBowlFiles: superBowlFiles, superBowlSeeds: superBowlSeeds };
});
