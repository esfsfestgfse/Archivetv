const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  "realsignal_roku_session.js",
  "roku_remote.html",
  "roku-receiver/manifest",
  "roku-receiver/components/MainScene.xml",
  "roku-receiver/components/MainScene.brs",
  "roku-receiver/components/ApiTask.xml",
  "roku-receiver/components/ApiTask.brs",
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) throw new Error(`missing Roku preview files: ${missing.join(", ")}`);

const api = read("realsignal_api_v2_worker.js");
const config = read("wrangler.api.jsonc");
const session = read("realsignal_roku_session.js");
const remote = read("roku_remote.html");
const receiver = read("roku-receiver/components/MainScene.brs");
const apiTask = read("roku-receiver/components/ApiTask.brs");

const checks = [
  [api.includes('from "./realsignal_roku_session.js"'), "API imports Roku session object"],
  [api.includes('kind === "roku-session"'), "API routes the opt-in Roku session"],
  [api.includes('handleRokuSession(request, env, ctx, id)'), "API dispatches Roku requests"],
  [api.includes('"roku-session"'), "Roku traffic has a bounded edge guard"],
  [config.includes('"name": "ROKU_SESSION"') && config.includes('"class_name": "RokuSession"'), "Wrangler binds RokuSession"],
  [config.includes('"tag": "v3"') && config.includes('"RokuSession"'), "Wrangler migrates RokuSession"],
  [session.includes("class RokuSession") && session.includes("MAX_COMMANDS"), "Roku state is durable and bounded"],
  [session.includes('"TUNE"') && session.includes('"NEXT"') && session.includes('"GUIDE"'), "Roku commands are explicit"],
  [remote.includes("ROKU PREVIEW") && remote.includes("/api/v3/roku/session"), "Remote is opt-in and uses the v3 session"],
  [apiTask.includes("/ia/queue") && receiver.includes("playItem"), "Receiver requests verified media and plays it"],
];
const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) throw new Error(`Roku contract failed: ${failures.join("; ")}`);
console.log(`Roku contract passed (${checks.length} checks)`);
