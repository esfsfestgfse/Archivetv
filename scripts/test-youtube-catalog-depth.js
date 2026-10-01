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
if (!/errors: results\.map\(\(result\) => result && result\.error\)/.test(source)) issues.push("YouTube discovery errors are still swallowed");
if (!/errors: lanes\.map\(\(lane\) => lane\.error\)/.test(source)) issues.push("YouTube upload errors are still swallowed");
if ((registry.match(/"youtubeChannelPageWindow": 3/g) || []).length < 2) issues.push("movie profiles do not opt into three rotating upload pages");
if (/YOUTUBE_API_KEY[^\n]{0,120}console\.(?:log|warn|error)/.test(source)) issues.push("YouTube key may be written to logs");

if (issues.length) {
  console.error("youtube catalog depth contract: FAILED");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log("youtube catalog depth contract: passed");
