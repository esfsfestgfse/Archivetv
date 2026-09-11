const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../realsignal_api_worker.js"), "utf8");
const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;

(async () => {
  const { default: worker } = await import(moduleUrl);
  const calls = [];
  const env = {
    RELAY: {
      async fetch(request) {
        calls.push({ url: request.url, method: request.method, body: request.method === "POST" ? await request.text() : "" });
        return new Response(JSON.stringify({ items: [{ id: "episode-1" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  };
  const ctx = {};

  const health = await worker.fetch(new Request("https://api.example/api/v1/health"), env, ctx);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).apiVersion, "v1");

  const search = await worker.fetch(new Request("https://api.example/api/v1/ia/search?q=cartoons&page=2"), env, ctx);
  assert.equal(search.status, 200);
  assert.equal(search.headers.get("X-RealSignal-API"), "v1");
  assert.equal(calls[0].url, "https://api.example/ia/search?q=cartoons&page=2");

  const queueBody = JSON.stringify({ channel: "150", count: 3 });
  const queue = await worker.fetch(new Request("https://api.example/api/v1/ia/queue", { method: "POST", body: queueBody, headers: { "Content-Type": "application/json" } }), env, ctx);
  assert.equal(queue.status, 200);
  assert.equal(calls[1].url, "https://api.example/ia/queue");
  assert.equal(calls[1].body, queueBody);

  const badMethod = await worker.fetch(new Request("https://api.example/api/v1/ia/queue"), env, ctx);
  assert.equal(badMethod.status, 405);
  const missingBinding = await worker.fetch(new Request("https://api.example/api/v1/ia/search?q=x"), {}, ctx);
  assert.equal(missingBinding.status, 503);

  console.log("API Worker contract: versioned health, service binding forwarding, methods, and failure response passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
