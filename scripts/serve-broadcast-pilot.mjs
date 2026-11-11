import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.REALSIGNAL_BROADCAST_PORT || 4194);
const stateDirectory = path.resolve(root, process.env.REALSIGNAL_BROADCAST_STATE || 'output/broadcast-pilot-preview');
const scheduleRoute = '/output/broadcast-pilot-preview/preview.json';
const files = new Map([
  ['/broadcast_preview.html', [path.join(root, 'broadcast_preview.html'), 'text/html; charset=utf-8']],
  ['/assets/broadcast-clock.mjs', [path.join(root, 'assets/broadcast-clock.mjs'), 'text/javascript; charset=utf-8']],
  ['/assets/broadcast-player.mjs', [path.join(root, 'assets/broadcast-player.mjs'), 'text/javascript; charset=utf-8']],
  [scheduleRoute, [path.join(stateDirectory, 'preview.json'), 'application/json; charset=utf-8']]
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  if (pathname === '/') {
    response.writeHead(302, { Location: '/broadcast_preview.html' }).end();
    return;
  }
  const file = files.get(pathname);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file[0]);
    response.writeHead(200, { 'Content-Type': file[1], 'Content-Length': body.length,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error('Broadcast preview read failed:', error.code || error.message);
    response.writeHead(pathname === scheduleRoute ? 503 : 500, { 'Cache-Control': 'no-store' }).end();
  }
});

let builder;
function refresh() {
  if (builder) return;
  builder = spawn(process.execPath, ['scripts/build-broadcast-pilot.mjs', stateDirectory], { cwd: root, stdio: 'inherit' });
  builder.on('error', error => console.error('Could not launch schedule refresh:', error.message));
  builder.on('close', (code, signal) => {
    builder = null;
    if (code !== 0) console.error('Schedule refresh ended:', code ?? signal);
  });
}

server.listen(port, '127.0.0.1', () => {
  console.log(`Broadcast pilot listening at http://127.0.0.1:${port}/broadcast_preview.html`);
  refresh();
  setInterval(refresh, 15 * 60_000).unref();
});
