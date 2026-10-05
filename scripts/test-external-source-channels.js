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
    "ok-movie-channel": "ok",
    "ok-tv-channel": "ok",
    "vimeo-movie-channel": "vimeo",
    "vimeo-tv-channel": "vimeo",
  };
  for (const [key, provider] of Object.entries(expected)) {
    const profile = sourceProfile({ profileKey: key });
    assert.ok(profile, `${key} must be approved server-side`);
    assert.deepEqual(profile.providers, [provider], `${key} must stay isolated to its declared source family`);
    assert.equal(profile.minRuntime || 15 * 60, 15 * 60, `${key} must retain the fifteen-minute floor`);
    assert.ok(profile.deny.includes("shorts"), `${key} must reject Shorts`);
    assert.ok(profile.deny.includes("podcast"), `${key} must reject podcasts`);
    assert.ok(profile.deny.includes("parody"), `${key} must reject parody uploads`);
  }

  assert.match(catalog, /async function vimeo\(/, "Vimeo adapter is missing");
  assert.match(catalog, /async function okRu\(/, "OK.ru adapter is missing");
  assert.match(catalog, /Authorization: `bearer \$\{token\}`/, "Vimeo token must be sent as an authorization header");
  assert.match(catalog, /method: "POST"/, "OK.ru credentials must be sent in a POST body");
  assert.match(catalog, /hostname !== "api\.ok\.ru"/, "OK.ru endpoint must be allowlisted");
  assert.doesNotMatch(catalog, /url\.searchParams\.set\("access_token"/, "OK access tokens must not be placed in URLs");
  assert.match(api, /providerAvailability: sourceProviderAvailability/, "API responses must expose external provider availability");
  console.log("external source channel contract passed: four isolated channels, server-only credentials, safe provider transport, and shared qualification gates.");
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
