#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const root = path.resolve(__dirname, "..");
  const desktop = fs.readFileSync(path.join(root, "the_dial_desktop.html"), "utf8");
  const mobile = fs.readFileSync(path.join(root, "the_dial_mobile.html"), "utf8");
  const catalog = fs.readFileSync(path.join(root, "realsignal_source_catalog.js"), "utf8");
  const okManifest = fs.readFileSync(path.join(root, "ok_public_embed_catalog.js"), "utf8");
  const api = fs.readFileSync(path.join(root, "realsignal_api_v2_worker.js"), "utf8");
  const keys = ["ok-movie-channel", "ok-tv-channel", "vimeo-movie-channel", "vimeo-tv-channel"];
  const channels = ["OK Movie Channel", "OK TV Channel", "Vimeo Movie Channel", "Vimeo TV Channel"];

  for (const source of [desktop, mobile]) {
    for (const key of keys) assert.match(source, new RegExp(`previewKey:"${key}"`), `${key} must be registered on both clients`);
    for (const channel of channels) assert.match(source, new RegExp(`nm:"${channel}"`), `${channel} must be registered on both clients`);
    assert.match(source, /v2RightsOkay\(value,provider,item\)/, "external embed permission must be checked client-side");
    assert.doesNotMatch(source, /api\.vimeo\.com|OK_ACCESS_TOKEN|OK_APPLICATION_KEY|OK_API_SIG/, "provider credentials must stay server-side");
  }

  const { sourceProfile } = await import(pathToFileURL(path.join(root, "realsignal_source_catalog.js")));
  const expected = {
    "ok-movie-channel": "ok-api",
    "ok-tv-channel": "ok-api",
    "vimeo-movie-channel": "vimeo",
    "vimeo-tv-channel": "vimeo",
  };
  for (const [key, provider] of Object.entries(expected)) {
    const profile = sourceProfile({ profileKey: key });
    assert.ok(profile, `${key} must be approved server-side`);
    if (key.startsWith("ok-")) assert.deepEqual(profile.providers, ["ok-search", "ok-manifest"], `${key} must use title search with a verified fallback, not tag/sitemap contamination`);
    else assert.deepEqual(profile.providers, [provider], `${key} must stay isolated to its declared source family`);
    assert.equal(profile.minRuntime || 15 * 60, 15 * 60, `${key} must retain the fifteen-minute floor`);
    assert.ok(profile.deny.includes("shorts"), `${key} must reject Shorts`);
    assert.ok(profile.deny.includes("podcast"), `${key} must reject podcasts`);
    assert.ok(profile.deny.includes("parody"), `${key} must reject parody uploads`);
  }
  const titleQualityProfiles = [
    ["OK Movie Channel", sourceProfile({ profileKey: "ok-movie-channel" })],
    ["OK TV Channel", sourceProfile({ profileKey: "ok-tv-channel" })],
  ];
  for (const [label, profile] of titleQualityProfiles) {
    for (const marker of ["4k", "1080p", "bdrip", "blu-ray", "dvd rip", "vhs rip", "yts"]) {
      assert.ok(profile.titleRequiredTerms.includes(marker), `${label} must require ${marker} in the title`);
    }
    assert.ok(profile.okApiBroadQueries.length >= 12, `${label} must keep a broad OK.ru discovery pool behind its title gate`);
    assert.ok(profile.okApiTitleQueries.length >= 20, `${label} must keep a title-specific OK.ru discovery pool`);
    assert.ok(profile.okApiTitleQualifiers.length >= 5, `${label} must pair title searches with quality qualifiers`);
  }
  const movieProfile = titleQualityProfiles[0][1];
  for (const term of ["tv series", "television series", "season", "episode"]) {
    assert.ok(movieProfile.deny.includes(term), `OK Movie Channel must reject ${term} entries`);
  }

  assert.match(catalog, /async function vimeo\(/, "Vimeo adapter is missing");
  assert.match(catalog, /async function okApi\(/, "OK.ru signed API adapter is missing");
  assert.match(catalog, /function okPublicManifest\(/, "OK.ru public-embed fallback is missing");
  assert.match(catalog, /OK_APPLICATION_KEY|OK_APPLICATION_SECRET|OK_SESSION_KEY|OK_ACCESS_TOKEN/, "OK.ru secret bindings are missing");
  assert.match(catalog, /OK_PUBLIC_EMBED_MANIFEST/, "OK.ru public-embed manifest is not wired");
  assert.match(catalog, /Authorization: `bearer \$\{token\}`/, "Vimeo token must be sent as an authorization header");
  assert.match(catalog, /search\.tagContents/, "OK.ru API search method is missing");
  assert.match(catalog, /search\.tagSearch/, "OK.ru tag expansion method is missing");
  assert.match(catalog, /sitemap-index-video/, "OK.ru public video sitemap is not wired");
  assert.match(catalog, /allow_embed/, "OK.ru sitemap admission must require a public embed URL");
  assert.match(catalog, /expandedTags/, "OK.ru catalog health must expose tag expansion diagnostics");
  assert.match(catalog, /expandedTitleTags/, "OK.ru catalog health must expose title-tag expansion diagnostics");
  assert.match(catalog, /candidateSamples/, "OK.ru catalog health must expose bounded rejected-candidate samples");
assert.match(catalog, /multi-day "movie" is a unit signal/, "OK.ru duration must normalize legacy millisecond-sized generic duration fields");
assert.match(catalog, /function okAdmissionStats\(/, "OK.ru admission must expose aggregate gate diagnostics for the source health view");
assert.match(catalog, /function okApiDimensions\(/, "OK.ru adapter must read nested landscape dimensions before admitting embeds");
  assert.doesNotMatch(catalog, /OK_API_SIG/, "legacy OK API signature binding must not be used");
  assert.match(okManifest, /videoembed\/1570971190743/, "OK.ru manifest must contain its public embed URL");
  assert.match(okManifest, /CC0|public domain/i, "OK.ru manifest must retain a rights note");
  assert.match(api, /providerAvailability: sourceProviderAvailability/, "API responses must expose external provider availability");
  console.log("external source channel contract passed: four isolated channels, server-only credentials, safe provider transport, and shared qualification gates.");
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
