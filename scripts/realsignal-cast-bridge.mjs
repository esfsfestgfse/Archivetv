#!/usr/bin/env node
/*
 * Free, local Chromecast media bridge.
 * It converts one remote HTTP(S) source at a time to Chromecast-safe HLS.
 */
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.REALSIGNAL_BRIDGE_PORT || 8788);
const FFMPEG = process.env.REALSIGNAL_FFMPEG || 'ffmpeg';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'realsignal-cast-'));
let active = null;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}
function lanAddresses() {
  const out = [];
  for (const entries of Object.values(os.networkInterfaces())) for (const item of entries || []) {
    if (item.family === 'IPv4' && !item.internal) out.push(`http://${item.address}:${PORT}`);
  }
  return out;
}
function stopActive() {
  if (!active) return;
  try { active.proc?.kill('SIGTERM'); } catch (_) {}
  active = null;
}
function start(source) {
  if (active?.source === source) return active;
  stopActive();
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = path.join(root, id); fs.mkdirSync(dir, { recursive: true });
  const playlist = path.join(dir, 'live.m3u8');
  const segment = path.join(dir, 'seg-%05d.ts');
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-y', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4', '-i', source,
    '-map', '0:v:0?', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0', '-r', '30',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6', '-hls_flags', 'delete_segments+independent_segments', '-hls_segment_filename', segment, playlist];
  const proc = spawn(FFMPEG, args, { windowsHide: true });
  active = { id, source, dir, playlist, proc, startedAt: Date.now(), error: '' };
  proc.stderr?.on('data', chunk => { active && (active.error = String(chunk).trim().slice(-500)); });
  proc.on('exit', (code, signal) => { if (active?.id === id) active.exit = { code, signal }; });
  return active;
}
function waitFor(file, ms = 15000) {
  return new Promise(resolve => {
    const startAt = Date.now();
    const tick = () => { if (fs.existsSync(file)) return resolve(true); if (Date.now() - startAt >= ms) return resolve(false); setTimeout(tick, 150); };
    tick();
  });
}
function validSource(raw) {
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; }
}
function serveFile(res, file) {
  if (!active) return res.writeHead(404).end();
  const safe = path.resolve(file); if (!safe.startsWith(path.resolve(active.dir) + path.sep)) return res.writeHead(403).end();
  if (!fs.existsSync(safe)) return res.writeHead(404).end();
  const type = safe.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); fs.createReadStream(safe).pipe(res);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': '*' }).end();
  if (url.pathname === '/health') return json(res, 200, { ok: true, port: PORT, active: active ? { source: active.source, startedAt: active.startedAt, exit: active.exit || null, error: active.error } : null, urls: lanAddresses() });
  if (url.pathname === '/stop') { stopActive(); return json(res, 200, { ok: true }); }
  if (url.pathname === '/live.m3u8') {
    const source = validSource(url.searchParams.get('source') || '');
    if (!source) return json(res, 400, { ok: false, error: 'source must be an HTTP(S) URL' });
    const job = start(source); if (!await waitFor(job.playlist)) return json(res, 503, { ok: false, retry: true, error: job.error || 'transcoder has not produced a playlist yet' });
    return serveFile(res, job.playlist);
  }
  if (active && /^\/seg-\d+\.ts$/.test(url.pathname)) return serveFile(res, path.join(active.dir, path.basename(url.pathname)));
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' }).end('RealSignal Cast Bridge\nUse /health or /live.m3u8?source=...\n');
});
server.listen(PORT, '0.0.0.0', () => { console.log(`RealSignal Cast Bridge listening on port ${PORT}`); for (const url of lanAddresses()) console.log(`Bridge URL: ${url}`); });
process.on('SIGINT', () => { stopActive(); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { stopActive(); server.close(() => process.exit(0)); });
