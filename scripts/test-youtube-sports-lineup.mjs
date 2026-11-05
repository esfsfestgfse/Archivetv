import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import YouTubeSports from "../assets/youtube-sports-lineup.js";
import { qualifySourceItem, sourceCatalogTasks, sourceProfile } from "../realsignal_source_catalog.js";
import api, { catalogFallbackAllowed, compactCatalogItem } from "../realsignal_api_v2_worker.js";

test("the full companion lineup has isolated YouTube profiles", () => {
  assert.deepEqual(YouTubeSports.channels.map(channel => channel.num), Array.from({ length: 34 }, (_, index) => 800 + index));
  const keys = new Set();
  for (const channel of YouTubeSports.channels) {
    assert.equal(channel.source, "v2preview");
    assert.equal(channel.cat, "YTSPORTS");
    const profile = sourceProfile({ profileKey: channel.previewKey, providers: ["archive"] });
    assert.equal(profile.name, channel.nm);
    assert.equal(profile.youtubeSports, true);
    assert.deepEqual(profile.providers, ["youtube"]);
    assert.equal(profile.youtubeSearchOnViewer, false);
    assert.equal(profile.youtubeChannelDiscoveryOnMaintenance, false);
    keys.add(profile.profileKey);
  }
  assert.equal(keys.size, 34);
  assert.equal(sourceProfile({ profileKey: "nascar-classics" }).youtubeSports, false);
});

test("replay identity ignores title punctuation and failed embeds stay out of both player queues", () => {
  assert.equal(YouTubeSports.programKey({ title: "Team A vs Team B | Full Game" }),
    YouTubeSports.programKey({ title: "TEAM A vs Team B — Full Game" }));
  for (const surface of ["desktop", "mobile"]) {
    const html = readFileSync(new URL("../the_dial_" + surface + ".html", import.meta.url), "utf8");
    const rows = new Map();
    const store = { get: (key, fallback) => rows.get(key) ?? fallback, set: (key, value) => rows.set(key, value) };
    const rejection = html.split(/\r?\n/).filter(line => /^function v2Reject(?:ed)?\(/.test(line)).join("\n");
    const context = { store };
    runInNewContext(rejection, context);
    context.v2Reject("Gridiron", { id: "yt:first" });
    context.v2Reject("Gridiron", { id: "yt:second" });
    assert.deepEqual(Array.from(context.v2Rejected("Gridiron")), ["yt:second", "yt:first"]);
  }
});

test("maintenance rotations retain one-page curated sports playlists", async () => {
  const originalFetch = globalThis.fetch;
  const publisher = "UCJtI-l6La0zniodFtSHYrBg";
  const videoId = "examplePack";
  const title = "1970-1979 | Great Losses";
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith("/channels")) return Response.json({
      items: url.searchParams.get("forHandle") === "packers" ? [{ id: publisher, contentDetails: { relatedPlaylists: { uploads: "packers-uploads" } } }] : [],
    });
    if (url.pathname.endsWith("/playlistItems")) return Response.json({
      items: [{ snippet: { title, resourceId: { videoId } } }],
    });
    if (url.pathname.endsWith("/search")) return Response.json({ items: [] });
    assert.ok(url.pathname.endsWith("/videos"));
    return Response.json({ items: url.searchParams.get("id").split(",").filter(id => id === videoId).map(id => ({
      id, snippet: { title, channelId: publisher, channelTitle: "Green Bay Packers", defaultAudioLanguage: "en", liveBroadcastContent: "none" },
      contentDetails: { duration: "PT1H" }, status: { privacyStatus: "public", embeddable: true },
      player: { embedWidth: 960, embedHeight: 540 },
    })) });
  };
  try {
    const { tasks } = sourceCatalogTasks({ profileKey: "yt-sports-hard-count" }, { YOUTUBE_API_KEY: "test-fixture" }, 5, { maintenance: true });
    const [lane] = await Promise.all(tasks);
    assert.deepEqual(lane.items.map(item => item.id), ["yt:" + videoId]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sports maintenance rotates older archives and keeps current uploads available", async () => {
  const originalFetch = globalThis.fetch;
  const publisher = "UC1234567890123456789012";
  const profileKey = "yt-sports-racquet";
  const archives = YouTubeSports.profiles[profileKey].sportsArchives["@usopen"];
  const ids = ["currentOpen", "oldArchive1", "oldArchive2", "oldArchive3"];
  const readIds = [];
  let failArchive = false;
  const titleFor = id => "US Open: Player A vs Player " + ids.indexOf(id);
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith("/channels")) return Response.json({
      items: url.searchParams.get("forHandle") === "usopen" ? [{ id: publisher, contentDetails: { relatedPlaylists: { uploads: "uploads" } } }] : [],
    });
    if (url.pathname.endsWith("/playlistItems")) {
      const list = url.searchParams.get("playlistId");
      readIds.push(list);
      if (failArchive && list !== "uploads") return Response.json({ error: { message: "gone" } }, { status: 404 });
      const id = list === "uploads" ? ids[0] : ids[1 + archives.findIndex(archive => archive.id === list)];
      return Response.json({ items: [{ snippet: { title: list === "uploads" ? "Full Match · " + titleFor(id) : titleFor(id), resourceId: { videoId: id } } }] });
    }
    if (url.pathname.endsWith("/search")) return Response.json({ items: [] });
    assert.ok(url.pathname.endsWith("/videos"));
    return Response.json({ items: url.searchParams.get("id").split(",").map(id => ({
      id, snippet: { title: id === ids[0] ? "Full Match · " + titleFor(id) : titleFor(id), channelId: publisher, channelTitle: "US Open Tennis", defaultAudioLanguage: "en", liveBroadcastContent: "none" },
      contentDetails: { duration: "PT2H" }, status: { privacyStatus: "public", embeddable: true },
      player: { embedWidth: 960, embedHeight: 540 },
    })) });
  };
  try {
    const collect = async (rotation, options) => {
      readIds.length = 0;
      const { tasks } = sourceCatalogTasks({ profileKey }, { YOUTUBE_API_KEY: "test-fixture" }, rotation, options);
      return (await Promise.all(tasks))[0].items.map(item => item.id);
    };
    assert.deepEqual(new Set(await collect(0, { maintenance: true })), new Set(["yt:currentOpen", "yt:oldArchive1"]));
    assert.deepEqual(readIds, ["uploads", archives[0].id]);
    assert.deepEqual(new Set(await collect(1, { maintenance: true })), new Set(["yt:currentOpen", "yt:oldArchive2"]));
    assert.deepEqual(readIds, ["uploads", archives[1].id]);
    assert.deepEqual(await collect(0, { firstLane: true }), ["yt:currentOpen"]);
    assert.deepEqual(readIds, ["uploads"]);
    failArchive = true;
    assert.deepEqual(await collect(0, { maintenance: true }), ["yt:currentOpen"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sports upload and cache admission reject unrelated, restricted and unverified videos", async () => {
  const originalFetch = globalThis.fetch;
  const publisher = "UC1234567890123456789012";
  const title = "Judd Trump vs Neil Robertson | FULL MATCH | Championship League Snooker";
  const videoIds = ["example0001", "example0002", "example0003", "example0004", "example0005", "example0006", "example0007", "example0008"];
  const expected = "yt:" + videoIds[0];
  let searched = false;
  globalThis.fetch = async input => {
    const url = new URL(input);
    assert.equal(url.hostname, "www.googleapis.com");
    if (url.pathname.endsWith("/channels")) {
      assert.equal(url.searchParams.get("forHandle"), "MatchroomMultiSport");
      return Response.json({ items: [{ id: publisher, contentDetails: { relatedPlaylists: { uploads: "approved" } } }] });
    }
    if (url.pathname.endsWith("/playlistItems")) {
      return Response.json({ items: videoIds.map(id => ({ snippet: { title, resourceId: { videoId: id } } })) });
    }
    if (url.pathname.endsWith("/search")) {
      searched = true;
      return Response.json({ items: [] });
    }
    assert.ok(url.pathname.endsWith("/videos"));
    assert.equal(url.searchParams.get("maxWidth"), "960");
    return Response.json({ items: videoIds.map((id, index) => ({
      id,
      snippet: { title: index === 1 ? title + " Highlights" : index === 7 ? "Full Match | Soccer World Cup" : title,
        channelTitle: "Matchroom Multi Sport", channelId: index === 2 ? "different-publisher" : publisher,
        liveBroadcastContent: index === 6 ? "upcoming" : "none", defaultAudioLanguage: "en" },
      contentDetails: { duration: index === 3 ? "PT4M" : "PT1H",
        ...(index === 4 ? { regionRestriction: { blocked: ["US"] } } : {}) },
      status: { privacyStatus: "public", embeddable: true },
      player: index === 5 ? {} : { embedWidth: 960, embedHeight: 540 },
    })) });
  };
  try {
    const { profile, tasks } = sourceCatalogTasks({ profileKey: "yt-sports-cue-sports" }, { YOUTUBE_API_KEY: "test-fixture" }, 0, { firstLane: true });
    const [lane] = await Promise.all(tasks);
    assert.deepEqual(lane.items.map(item => item.id), [expected], JSON.stringify(lane.health));
    assert.equal(searched, false);
    const [item] = lane.items;
    assert.ok(qualifySourceItem(profile, item));
    assert.ok(catalogFallbackAllowed(item, { channel: profile.profileKey, sourceCatalog: true }));
    assert.equal(catalogFallbackAllowed({ ...item, title: "Snooker highlights" }, { channel: profile.profileKey, sourceCatalog: true }), false);
    assert.equal(qualifySourceItem(profile, { ...item, embedAllowed: false }), null);
    assert.equal(qualifySourceItem(profile, { ...item, provider: "Internet Archive" }), null);
    for (const [key, channelSeed, account, replay, offGenre] of [
      ["boxing", "@MatchroomBoxing", "Matchroom Boxing", "Dalton Smith vs Alberto Puello | Full Fight", "Dalton Smith Vs Alberto Puello Weigh In | Matchroom Boxing"],
      ["baseball", "@MLB", "MLB", "Brewers vs. Rays World Series Game 5 | Full Game", "Brewers vs. Rays World Series Game 5 LIVE Batting Practice"],
      ["gridiron", "@ACCDigitalNetwork", "ACC Digital Network", "Alabama vs. Florida State Full Game Replay | 2025 ACC Football", "Duke vs. Louisville Full Game Replay | ACC Basketball"],
      ["grand-prix", "@Formula1", "FORMULA 1", "British Grand Prix Full Race Replay", "Replay · United States Grand Prix Post-Race Show (2026-10-25)"],
      ["range-field", "@WorldArcheryTV", "World Archery", "Hyundai Archery World Cup Final | Full Event", "Replay · Familiarisation | Saltillo 2026 Hyundai Archery World Cup Final (2026-09-11)"],
      ["rodeo", "@PRCAProRodeo", "PRCA PRORODEO", "2012 National Finals Rodeo | Full Event", "2012 National Finals Rodeo Best Of Team Roping"],
    ]) {
      const replayProfile = sourceProfile({ profileKey: "yt-sports-" + key });
      const candidate = { ...item, channelSeed, account, title: replay, duration: 7200 };
      assert.ok(qualifySourceItem(replayProfile, candidate), replay);
      assert.equal(qualifySourceItem(replayProfile, { ...candidate, title: offGenre }), null, offGenre);
    }
    assert.equal(qualifySourceItem(sourceProfile({ profileKey: "yt-sports-gridiron" }), {
      ...item, id: "yt:3spDLtPhepE", channelSeed: "@NFL", account: "NFL", duration: 7200,
      url: "https://www.youtube-nocookie.com/embed/3spDLtPhepE", embedUrl: "https://www.youtube-nocookie.com/embed/3spDLtPhepE",
      title: "Los Angeles Rams vs. Seattle Seahawks FULL GAME | NFL 2025 Season NFC Conference Championship",
    }), null);
    assert.ok(qualifySourceItem(sourceProfile({ profileKey: "yt-sports-gridiron" }), {
      ...item, id: "yt:2ES28KSI0Cs", channelSeed: "@NFL", account: "NFL", duration: 7200,
      url: "https://www.youtube-nocookie.com/embed/2ES28KSI0Cs", embedUrl: "https://www.youtube-nocookie.com/embed/2ES28KSI0Cs",
      title: "Cowboys Dominate the Broncos in Super Bowl XII | NFL Full Game",
    }));
    const compact = compactCatalogItem(item);
    const row = { id: compact.id, provider: compact.provider, title: compact.title,
      duration_seconds: compact.duration, aspect_ratio: compact.aspectRatio,
      media_type: compact.mediaType, media_url: compact.mediaUrl, source_url: compact.sourceUrl,
      rights: compact.rights, metadata_json: JSON.stringify(compact) };
    const env = { realsignal_catalog: { prepare(sql) { return {
      bind() { return this; }, first: async () => null,
      all: async () => ({ results: /FROM programs p/.test(sql) ? [row] : [] }),
    }; } } };
    const status = await api.fetch(new Request("https://api.invalid/api/v3/source/status?profileKey=" + profile.profileKey), env, { waitUntil() {} });
    const stored = await status.json();
    assert.equal(stored.ready, 1, JSON.stringify(stored));
    assert.equal(stored.items[0].channelSeed, "@MatchroomMultiSport");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
