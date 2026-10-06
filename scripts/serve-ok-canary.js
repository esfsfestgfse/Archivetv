/* Loopback-only visual canary using actual provider-verified public metadata.
 * It exercises the repaired clients without mutating the production catalog. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/ok-title-playback-canary.json'), 'utf8')).catalogs;
const port = Number(process.env.OK_CANARY_PORT || 4186);
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && url.pathname === '/api/v3/source/catalog') {
      let raw = ''; for await (const part of req) { raw += part; if (raw.length > 10000) throw new Error('body too large'); }
      const body = JSON.parse(raw), items = catalog[body.profileKey]?.items || [];
      const unseen = items.filter(item => !(body.recentIds || []).includes(item.id));
      const pool = unseen.length ? unseen : items;
      const offset = Math.abs(Number(body.rotation) || 0) % Math.max(1, pool.length);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ items: pool.slice(offset).concat(pool.slice(0, offset)).slice(0, 5), candidateItems: items, catalogDepth: items.length, hydrating: false, source: 'loopback-public-metadata-canary' })); return;
    }
    if (url.pathname.startsWith('/api/v3/')) {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'ready', events: [] })); return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/the_dial_desktop.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    let content = fs.readFileSync(file);
    if (/\.html$/.test(file)) {
      content = content.toString().replace(/^var IA_API_BASE=.*;$/m, `var IA_API_BASE="http://127.0.0.1:${port}/api/v3";`);
    }
    res.writeHead(200, { 'content-type': /\.html$/.test(file) ? 'text/html' : /\.js$/.test(file) ? 'text/javascript' : /\.css$/.test(file) ? 'text/css' : /\.json$/.test(file) ? 'application/json' : 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(content);
  } catch (_) { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`OK client canary: http://127.0.0.1:${port}/the_dial_desktop.html`));
