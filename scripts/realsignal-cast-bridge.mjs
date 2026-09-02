#!/usr/bin/env node
/*
 * Free, local Chromecast media bridge.
 * Each Cast tune gets an isolated HLS job and segment namespace so a channel
 * switch cannot invalidate the playlist that Chromecast is still reading.
 */
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.REALSIGNAL_BRIDGE_PORT || 8788);
const FFMPEG = process.env.REALSIGNAL_FFMPEG || 'ffmpeg';
const RETIRE_MS = 45000;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'realsignal-cast-'));
const jobs = new Map();
const allJobs = new Map();
let currentKey = '';

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
function safeSession(raw) { return /^[a-z0-9_-]{1,100}$/i.test(raw || '') ? raw : 'current'; }
function cleanupJob(job) {
  if (!job || job.cleanupTimer) return;
  job.cleanupTimer = setTimeout(() => fs.rm(job.dir, { recursive: true, force: true }, () => {}), 2000);
  job.cleanupTimer.unref?.();
}
function stopJob(job) {
  if (!job || job.stopped) return;
  job.stopped = true;
  try { job.proc?.kill('SIGTERM'); } catch (_) {}
  cleanupJob(job);
}
function retireJob(job) {
  if (!job || job.retireTimer) return;
  job.retireAt = Date.now() + RETIRE_MS;
  job.retireTimer = setTimeout(() => {
    stopJob(job);
    if (jobs.get(job.key) === job) jobs.delete(job.key);
    allJobs.delete(job.id);
  }, RETIRE_MS);
  job.retireTimer.unref?.();
}
function start(source, mode, key) {
  const old = jobs.get(key);
  if (old && old.source === source && old.mode === mode && !old.exit && !old.stopped) return old;
  if (old) retireJob(old);
  if (currentKey && currentKey !== key) {
    const previous = jobs.get(currentKey);
    if (previous) retireJob(previous);
  }
  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const dir = path.join(root, id); fs.mkdirSync(dir, { recursive: true });
  const playlist = path.join(dir, 'live.m3u8');
  const segment = path.join(dir, 'seg-%05d.ts');
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-y', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4', '-re', '-i', source];
  if (mode === 'audio') args.push('-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2');
  else args.push('-map', '0:V:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2');
  args.push('-f', 'hls', '-hls_time', '2', '-hls_list_size', '6', '-hls_flags', 'delete_segments+independent_segments', '-hls_segment_filename', segment, playlist);
  const proc = spawn(FFMPEG, args, { windowsHide: true });
  const job = { id, key, source, mode, dir, playlist, proc, startedAt: Date.now(), error: '', stopped: false };
  jobs.set(key, job); allJobs.set(id, job); currentKey = key;
  proc.stderr?.on('data', chunk => { if (!job.exit) job.error = String(chunk).trim().slice(-500); });
  proc.on('error', error => { job.error = error.message; job.exit = { code: null, error: error.code || 'spawn_error' }; cleanupJob(job); });
  proc.on('exit', (code, signal) => { job.exit = { code, signal }; });
  return job;
}
function playlistReady(job) {
  try {
    const text = fs.readFileSync(job.playlist, 'utf8');
    return /#EXTM3U/.test(text) && /(?:^|\r?\n)seg-\d+\.ts(?:\r?\n|$)/.test(text);
  } catch (_) { return false; }
}
function waitForPlaylist(job, ms = 15000) {
  return new Promise(resolve => {
    const started = Date.now();
    const tick = () => {
      if (playlistReady(job)) return resolve(true);
      if (job.exit || Date.now() - started >= ms) return resolve(false);
      setTimeout(tick, 120);
    };
    tick();
  });
}
function validSource(raw) {
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; }
}
function jobById(id) { return allJobs.get(id) || null; }
function serveFile(res, job, file) {
  if (!job) return res.writeHead(404).end();
  const safe = path.resolve(file); if (!safe.startsWith(path.resolve(job.dir) + path.sep)) return res.writeHead(403).end();
  if (!fs.existsSync(safe)) return res.writeHead(404).end();
  const type = safe.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl; charset=utf-8' : 'video/mp2t';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); fs.createReadStream(safe).pipe(res);
}
function servePlaylist(res, job) {
  try {
    const text = fs.readFileSync(job.playlist, 'utf8').split(/\r?\n/).map(line => {
      const name = line.trim(); return /^seg-\d+\.ts$/.test(name) ? `/hls/${job.id}/${name}` : line;
    }).join('\n');
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(text);
  } catch (_) { res.writeHead(404).end(); }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': '*' }).end();
  if (url.pathname === '/health') {
    const current = jobs.get(currentKey);
    return json(res, 200, { ok: true, port: PORT, active: current ? { id: current.id, key: current.key, source: current.source, mode: current.mode, startedAt: current.startedAt, exit: current.exit || null, error: current.error } : null, jobs: [...allJobs.values()].map(job => ({ id: job.id, key: job.key, mode: job.mode, exit: job.exit || null })), urls: lanAddresses() });
  }
  if (url.pathname === '/stop') { for (const job of allJobs.values()) stopJob(job); allJobs.clear(); jobs.clear(); currentKey = ''; return json(res, 200, { ok: true }); }
  if (url.pathname === '/live.m3u8') {
    const source = validSource(url.searchParams.get('source') || '');
    if (!source) return json(res, 400, { ok: false, error: 'source must be an HTTP(S) URL' });
    const mode = url.searchParams.get('mode') === 'audio' ? 'audio' : 'video';
    const key = safeSession(url.searchParams.get('session') || 'current');
    const job = start(source, mode, key);
    if (!await waitForPlaylist(job)) return json(res, job.exit ? 502 : 503, { ok: false, retry: !job.exit, error: job.error || 'transcoder has not produced a valid playlist' });
    return servePlaylist(res, job);
  }
  const match = url.pathname.match(/^\/hls\/([a-z0-9-]+)\/(seg-\d+\.ts)$/i);
  if (match) { const job = jobById(match[1]); return serveFile(res, job, path.join(job?.dir || root, match[2])); }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' }).end('RealSignal Cast Bridge\nUse /health or /live.m3u8?source=...\n');
});
server.listen(PORT, '0.0.0.0', () => { console.log(`RealSignal Cast Bridge listening on port ${PORT}`); for (const url of lanAddresses()) console.log(`Bridge URL: ${url}`); });
function shutdown() { for (const job of allJobs.values()) stopJob(job); server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
