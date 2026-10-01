/* Guard the server-only YouTube catalog depth and diagnostics contract. */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "realsignal_source_catalog.js"), "utf8");
const registry = fs.readFileSync(path.join(root, "source_suite_profile_registry.js"), "utf8");
const issues = [];

if (!/error\.providerDetail = detail/.test(source)) issues.push("provider error detail is not retained safely");
if (!/youtubeChannelPageWindow:/.test(source)) issues.push("normalized profiles are missing bounded YouTube page depth");
if (!/options\.maintenance === true \? profile\.youtubeChannelPageWindow : 1/.test(source)) issues.push("cold starts are not limited to one upload page");
if (!/pageToken/.test(source) || !/pagesFetched/.test(source)) issues.push("maintenance upload pagination is missing");
if (!/youtubeSearchPageCount\(profile, options\)/.test(source) || !/pagesFetched = 0/.test(source)) issues.push("YouTube search continuation pages are missing");
if (!/youtubeSearchOnViewer !== false/.test(source) || !/searchEnabled = profile\.youtubeSearchOnViewer !== false \|\| \(options\.maintenance === true && profile\.youtubeSearchOnMaintenance !== false\)/.test(source)) issues.push("cold viewer starts still depend on quota-expensive YouTube search");
if (!/youtubeSearchOnMaintenance/.test(source) || !/youtubeChannelDiscoveryOnMaintenance/.test(source)) issues.push("maintenance search/discovery cannot be disabled for channel-first movie rails");
if (!/youtubeChannelIdentityRequired/.test(source) || !/channel identity/.test(source)) issues.push("YouTube distributor identity requalification is missing");
if (!/errors: results\.map\(\(result\) => result && result\.error\)/.test(source)) issues.push("YouTube discovery errors are still swallowed");
if (!/errors: lanes\.map\(\(lane\) => lane\.error\)/.test(source)) issues.push("YouTube upload errors are still swallowed");
if ((registry.match(/"youtubeChannelPageWindow": 3/g) || []).length < 2) issues.push("movie profiles do not opt into three rotating upload pages");
if (!registry.includes('"youtubeSearchOnViewer": false')) issues.push("movie profiles must keep cold viewer starts channel-first");
if ((registry.match(/"youtubeSearchOnMaintenance": false/g) || []).length < 2) issues.push("movie profiles must avoid quota-expensive maintenance search when seeded upload rails are deep");
if ((registry.match(/"youtubeChannelDiscoveryOnMaintenance": false/g) || []).length < 2) issues.push("movie profiles must avoid broad channel discovery when seeded upload rails are deep");
if (!registry.includes('"youtubeSearchPageWindow": 2')) issues.push("movie profiles must page YouTube discovery during maintenance");
if (!registry.includes('"@FilmRiseMovies"') || !registry.includes('"@MovieCentral"') || !registry.includes('"@Popcornflix"')) issues.push("modern movie lane is missing approved distributor channel seeds");
if (/"modern-free-cinema": \{[\s\S]{0,220}"fallbackProfiles"/.test(registry) || /"indie-feature-house": \{[\s\S]{0,220}"fallbackProfiles"/.test(registry)) issues.push("modern and indie movie lanes must not share generic fallback profiles");
if (/YOUTUBE_API_KEY[^\n]{0,120}console\.(?:log|warn|error)/.test(source)) issues.push("YouTube key may be written to logs");

if (issues.length) {
  console.error("youtube catalog depth contract: FAILED");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log("youtube catalog depth contract: passed");
