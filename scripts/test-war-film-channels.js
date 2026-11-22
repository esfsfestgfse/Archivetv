const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sourcePolicy = require("../assets/source-program-policy.js");
const { DatabaseSync } = require("node:sqlite");

(async () => {
  const { default: worker } = await import("../realsignal_api_v2_worker.js");
  const { qualifySourceItem, sourceProfile } = await import("../realsignal_source_catalog.js");
  const { reviewedWarFilms } = await import("../war_film_catalog.js");
  const sql = new DatabaseSync(":memory:");
  try {
    for (const file of ["0001_realsignal_catalog.sql", "0002_realsignal_v3_observability.sql", "0003_realsignal_v4_adaptive_catalog.sql"]) {
      sql.exec(fs.readFileSync(path.resolve(__dirname, "../migrations", file), "utf8"));
    }
    const db = {
      prepare(query) {
        return { bind(...args) {
          return { query, args, async all() { return { results: sql.prepare(query).all(...args) }; } };
        } };
      },
      async batch(statements) {
        return statements.map(statement => sql.prepare(statement.query).all(...statement.args));
      }
    };
    const background = [];
    const ctx = { waitUntil(promise) { background.push(promise); } };
    const env = { realsignal_catalog: db };
    const endpoint = "https://example.test/api/v3/source/";
    const listings = [
      ["ok-war-movies", "OK.ru", 622],
      ["youtube-war-movies", "YouTube", 623],
      ["ia-war-movies", "Internet Archive", 624]
    ];
    const archiveFilm = reviewedWarFilms("ia-war-movies").find(item => item.id === "ia-war:what-price-glory-1926");
    assert.ok(archiveFilm, "retain the film identity across Archive routes");
    const stalledRoute = "https://archive.org/download/what-price-glory-1926/What%20Price%20Glory%20(1926).mp4";
    const staleFilm = { ...archiveFilm, url: stalledRoute };
    assert.equal(sourcePolicy.allow("ia-war-movies", staleFilm), false, "saved playback must drop the slow route");
    assert.equal(sourcePolicy.allow("ia-war-movies", archiveFilm), true, "a new copy retains the program's identity");
    assert.notEqual(archiveFilm.url, stalledRoute);
    assert.equal(qualifySourceItem(sourceProfile({profileKey:"ia-war-movies"}), staleFilm), null);
    sql.prepare("INSERT INTO programs (id,provider,source_identifier,title,duration_seconds,aspect_ratio,media_url,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,1,1)")
      .run(archiveFilm.id, archiveFilm.provider, "legacy-archive-source-id", "Stale catalog title", archiveFilm.duration, archiveFilm.aspectRatio, stalledRoute);
    sql.prepare("INSERT INTO channel_programs (channel_key,program_id,last_seen_at) VALUES (?,?,1)")
      .run("ia-war-movies", archiveFilm.id);
    const firstFilms = [];
    for (const [profileKey, provider, channel] of listings) {
      for (const surface of ["desktop", "mobile"]) {
        const body = fs.readFileSync(path.resolve(__dirname, "../the_dial_" + surface + ".html"), "utf8");
        assert.match(body, new RegExp('num:' + channel + '[^\\n]+previewKey:"' + profileKey + '"'));
        const saved = new Map();
        const browser = {
          window: { RealSignalSourcePrograms: sourcePolicy },
          V2_SOURCE_READY_BUFFER: 5,
          store: { get: key => saved.get(key), set: (key, value) => saved.set(key, value) },
        };
        vm.createContext(browser);
        for (const name of ["v2Shuffle", "v2Recent", "v2Rejected", "v2Shelf", "v2CatalogOrder"]) {
          vm.runInContext(body.match(new RegExp("^function " + name + "\\(.*$", "m"))[0], browser);
        }
        vm.runInContext(body.match(/^function v2WarFilmOrder\([\s\S]*?^}/m)[0], browser);
        if (profileKey === "ia-war-movies") {
          for (const name of ["v2SourceProgramAllowed", "v2PruneSourcePrograms"]) {
            vm.runInContext(body.match(new RegExp("^function " + name + ".*$", "m"))[0], browser);
          }
          const state = { items: [staleFilm, archiveFilm], cursor: 0 };
          browser.v2PruneSourcePrograms({profileKey}, state);
          assert.equal(state.items.length, 1);
          assert.equal(state.items[0].url, archiveFilm.url, "an already loaded shelf must drop the slow file");
        }
        const movies = reviewedWarFilms(profileKey);
        const watched = movies.find(item => item.year >= 2000);
        saved.set("v2recent:" + profileKey, [watched.id]);
        const ordered = browser.v2CatalogOrder(profileKey, movies, profileKey);
        assert.ok(ordered.slice(0, 5).some(item => item.year < 1980), "viewer shelf keeps the classics");
        if (profileKey !== "ia-war-movies") {
          assert.ok(ordered.slice(0, 5).filter(item => item.year >= 2000).length >= 2, "client shuffle keeps a modern mix");
        }
        assert.equal(ordered.at(-1).id, watched.id, "viewer history wins over era balancing");
      }
      const profile = sourceProfile({ profileKey });
      assert.equal(sourceProfile({ channel })?.profileKey, profileKey, "API must use the shared channel-to-source mapping");
      assert.equal(profile.minRuntimeSeconds, 3600);
      const status = await worker.fetch(new Request(endpoint + "status?profileKey=" + profileKey), env, ctx);
      assert.equal(status.status, 200);
      const { items } = await status.json();
      assert.ok(items.length >= 5, profileKey + " must have a usable catalog");
      assert.equal(items.length, reviewedWarFilms(profileKey).length, "persisted copies must not inflate catalog depth");
      assert.equal(new Set(items.map(item => item.id)).size, items.length);
      assert.ok(!items.some(item => item.title === "Stale catalog title"));
      assert.equal(new Set(items.map(item => item.title)).size, items.length);
      for (const item of items) {
        assert.equal(item.provider, provider);
        assert.ok(item.duration >= 3600 && item.aspectRatio >= 1.2);
        assert.ok(item.genreVerified && item.recoveryVerified, "the client must receive reviewed film evidence");
      }
      const request = history => new Request(endpoint + "catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileKey, count: 5, recentIds: history })
      });
      const initial = await (await worker.fetch(request([]), env, ctx)).json();
      assert.equal(initial.items.length, 5);
      assert.ok(items.every(item => Number.isInteger(item.year)), "each reviewed release must have a film year");
      if (profileKey === "ok-war-movies" || profileKey === "youtube-war-movies") {
        const countModern = rows => rows.filter(item => item.year >= 2000).length;
        assert.ok(countModern(initial.items) >= 2, "opening shelf should include at least two modern films");
        assert.ok(initial.items.some(item => item.year < 1980), "opening shelf should keep a classic film");
        if (profileKey === "ok-war-movies") {
          assert.ok(initial.items.some(item => item.year >= 1980 && item.year < 2000), "include the middle era when available");
        } else {
          assert.ok(items.length >= 12, "add licensed feature-length uploads to the YouTube catalog");
        }
        const unseen = items.filter(item => item.year >= 2000).slice(0, 3);
        const watched = items.filter(item => !unseen.includes(item)).map(item => item.id);
        const freshTail = await (await worker.fetch(request(watched), env, ctx)).json();
        assert.deepEqual(new Set(freshTail.items.map(item => item.id)), new Set(unseen.map(item => item.id)),
          "a classic era slot cannot replay a watched movie before the remaining films have aired");
      }
      const next = await (await worker.fetch(request([initial.items[0].id]), env, ctx)).json();
      assert.equal(next.items.length, 5);
      assert.ok(!next.items.some(item => item.id === initial.items[0].id), "history must exclude the first film");
      if (profileKey === "ia-war-movies") {
        assert.ok(initial.items.filter(item => item.year >= 2000).length >= 2, "start with a mix of distinct modern Archive features");
        assert.ok(initial.items.some(item => item.year >= 1980 && item.year < 2000), "keep the middle era in rotation");
        assert.ok(initial.items.some(item => item.year < 1939), "keep the early classics in rotation");
        assert.equal(items.find(item => item.id === archiveFilm.id)?.url, archiveFilm.url, "status must return the verified replacement");
        const played = items.filter(item => item.id !== archiveFilm.id).map(item => item.id);
        const remaining = await (await worker.fetch(request(played), env, ctx)).json();
        assert.equal(remaining.items[0]?.id, archiveFilm.id, "retain the same title in late rotation");
        assert.equal(remaining.items[0]?.url, archiveFilm.url, "late rotation must use the verified replacement");
      }
      firstFilms.push([profile, initial.items[0]]);
    }
    for (const [profile, film] of firstFilms) {
      for (const [other, otherFilm] of firstFilms) {
        if (profile !== other) assert.equal(qualifySourceItem(profile, otherFilm), null);
      }
      assert.equal(qualifySourceItem(profile, { ...film, id: "unreviewed-trailer" }), null);
    }
    await Promise.all(background);
    console.log("Three war film stations pass provider isolation, runtime, catalog depth and Next.");
  } finally {
    sql.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
