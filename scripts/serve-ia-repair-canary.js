/* Loopback-only canary: actual API, session rotation, relay and public Archive
   transports. No production database, keys, queue or Worker is mutated. */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..'), port = Number(process.env.IA_CANARY_PORT || 4188);
async function main() {
  const { default: api, SessionRotation } = await import(pathToFileURL(path.join(root, 'realsignal_api_v2_worker.js')));
  const cache = new Map(), kv = new Map(), sessions = new Map(), jobs = [], stats = { queueRequests: 0, played: 0, backgroundJobs: 0, errors: [] };
  const pending = new Set(), queueTrace = [], relayTrace = [];
  const ctx = { waitUntil(p) { pending.add(p); Promise.resolve(p).catch(error => { stats.errors.push(String(error)); }).finally(() => pending.delete(p)); } };
  const scope = { console, URL, URLSearchParams, Request, Response, Headers, AbortController, AbortSignal, TextEncoder, TextDecoder, Date, setTimeout, clearTimeout, fetch, crypto: require('node:crypto').webcrypto,
    caches: { default: { match: async key => cache.get(key.url || key)?.clone(), put: async (key, response) => { cache.set(key.url || key, response.clone()); } } } };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8').replace('export default', 'globalThis.relay ='), scope);
  const relayEnv = { REALSIGNAL_QUEUE: { get: async key => JSON.parse(kv.get(key) || 'null'), put: async (key, value) => { kv.set(key, value); } }, IA_HARVEST_QUEUE: { send: async body => { if (jobs.length < 32) jobs.push(body); } } };
  const env = { RELAY: { fetch: async (request) => {
    const response = await scope.relay.fetch(request, relayEnv, ctx);
    if (new URL(request.url).pathname === '/ia/queue') {
      const payload = await response.clone().json();
      relayTrace.push({ ready: payload.ready, candidates: payload.candidates, error: payload.error,
        sample: (payload.candidateItems || []).slice(0, 2).map(item => ({ id: item.identifier, media: item.media })) });
      if (relayTrace.length > 10) relayTrace.shift();
    }
    return response;
  } }, ROTATION: { getByName(name) {
    if (!sessions.has(name)) {
      const data = new Map(); let tail = Promise.resolve();
      const storage = { get: async key => Array.isArray(key) ? new Map(key.map(k => [k, structuredClone(data.get(k))])) : structuredClone(data.get(key)),
        put: async (key, value) => { if (typeof key === 'object') Object.entries(key).forEach(([k, v]) => data.set(k, structuredClone(v))); else data.set(key, structuredClone(value)); },
        delete: async keys => (Array.isArray(keys) ? keys : [keys]).forEach(k => data.delete(k)), transaction: async fn => fn(storage) };
      sessions.set(name, new SessionRotation({ storage, blockConcurrencyWhile(fn) { const work = tail.then(fn); tail = work.catch(() => {}); return work; } }, {}));
    }
    return sessions.get(name);
  } } };
  relayEnv.IA_STATE_OWNER = env.ROTATION;
  let busy = false;
  const pump = setInterval(async () => {
    if (busy || !jobs.length) return; busy = true;
    const body = jobs.shift(); stats.backgroundJobs++;
    try { await scope.relay.queue({ messages: [{ body, ack() {}, retry() { jobs.push(body); } }] }, relayEnv, ctx); }
    catch (error) { stats.errors.push(String(error)); }
    finally { busy = false; }
  }, 2000);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1:' + port);
      if (url.pathname === '/__ia-canary') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ...stats, queueTrace, relayTrace, pendingJobs: jobs.length, sessions: sessions.size })); return; }
      if (url.pathname.startsWith('/api/v3/') || url.pathname.startsWith('/ia/')) {
        let raw = ''; for await (const part of req) { raw += part; if (raw.length > 2 * 1024 * 1024) throw Error('body too large'); }
        if (url.pathname.endsWith('/ia/queue')) stats.queueRequests++;
        if (url.pathname.endsWith('/ia/playback')) stats.played++;
        const request = new Request(url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: raw }) });
        const result = url.pathname.startsWith('/api/') ? await api.fetch(request, env, ctx) : await scope.relay.fetch(request, relayEnv, ctx);
        if (url.pathname.endsWith('/ia/queue')) {
          const body = JSON.parse(raw), payload = await result.clone().json();
          queueTrace.push({ channel: body.channel, queries: body.queries, status: result.status, ready: payload.ready, candidates: payload.candidates, error: payload.error,
            sample: (payload.candidateItems || []).slice(0, 2).map(item => ({ id: item.identifier, media: item.media })) });
          if (queueTrace.length > 20) queueTrace.shift();
        }
        res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer())); return;
      }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/the_dial_desktop.html' : url.pathname));
      const allowed = /^\/(?:the_dial_(?:desktop|mobile)\.html|assets\/[^.][^]*\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?|mp3)|favicon\.ico)$/i.test(url.pathname);
      if (!file.startsWith(root + path.sep) || url.pathname.includes('/.') || !allowed) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      let content = fs.readFileSync(file);
      if (/\.html$/.test(file)) content = content.toString().replace(/^var IA_API_BASE=.*;$/m, 'var IA_API_BASE="http://127.0.0.1:' + port + '/api/v3";').replace(/^var IA_RELAY_BASE=.*;$/m, 'var IA_RELAY_BASE="http://127.0.0.1:' + port + '/ia";').replace('<head>', '<head><script>window.__RS_REMOTE_TELEMETRY_ENDPOINT="http://127.0.0.1:' + port + '/api/v3/telemetry";window.__RS_REMOTE_HEALTH_ENDPOINT="http://127.0.0.1:' + port + '/api/v3/health/summary";</script>');
      res.writeHead(200, { 'content-type': /\.html$/.test(file) ? 'text/html' : /\.js$/.test(file) ? 'text/javascript' : /\.css$/.test(file) ? 'text/css' : 'application/octet-stream', 'cache-control': 'no-store' }); res.end(content);
    } catch (error) { stats.errors.push(String(error)); res.writeHead(500); res.end('Canary error'); }
  });
  server.listen(port, '127.0.0.1', () => console.log('IA repair canary: http://127.0.0.1:' + port + '/the_dial_desktop.html?iaRepair=1&playbackAudit=1&telemetry=0'));
  process.on('SIGINT', () => { clearInterval(pump); server.close(); process.exit(); });
}
main().catch(error => { console.error(error); process.exit(1); });
