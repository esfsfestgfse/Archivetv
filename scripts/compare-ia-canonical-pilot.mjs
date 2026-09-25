#!/usr/bin/env node
/* Compare the current relay/API shelf with the guarded canonical manifests.
 * This is intentionally read-only. Queue latency is measured here; decoded
 * first-frame latency is left explicit for the browser/device canary because a
 * server process cannot prove that a receiver rendered a frame. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IA_CANONICAL_PILOT_PROFILES, canonicalItemAccepted, normalizeCanonicalItem } from "../ia_canonical_station.mjs";
import { IA_CANONICAL_PILOT_MANIFESTS } from "../ia_canonical_pilot_manifest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv.includes("--out") ? path.resolve(process.argv[process.argv.indexOf("--out") + 1]) : path.join(root, "ia-canonical-pilot-comparison.json");
const apiBase = String(process.env.IA_COMPARE_API || "https://realsignal-api.tdy1990.workers.dev/api/v3").replace(/\/$/, "");
const requestTimeoutMs = Math.max(2000, Math.min(30_000, Number(process.env.IA_COMPARE_TIMEOUT_MS || 10_000)));
const rotations = Math.max(1, Math.min(8, Number(process.env.IA_COMPARE_ROTATIONS || 4)));

function queueKey(item) { return String(item?.programId || item?.id || item?.identifier || item?.url || item?.mediaUrl || "").trim(); }
function average(values) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; }
function unique(items) { const seen = new Set(); return items.filter((item) => { const key = queueKey(item); if (!key || seen.has(key)) return false; seen.add(key); return true; }); }
function metricSet(profile, items) {
  const normalized = items.map((item) => normalizeCanonicalItem(item, profile));
  const evaluable = normalized.filter((item) => Number.isFinite(Number(item.year)) && Number(item.runtimeSeconds) > 0 && item.mediaUrl);
  const accepted = evaluable.filter((item) => canonicalItemAccepted(item, profile));
  const runtimes = accepted.map((item) => Number(item.runtimeSeconds || 0)).filter(Boolean);
  const repeats = items.length - unique(items).length;
  return {
    catalogDepth: unique(items).length,
    genreAccuracy: evaluable.length ? Number((accepted.length / evaluable.length).toFixed(3)) : null,
    genreEvaluatedItems: evaluable.length,
    genreUnscoredItems: Math.max(0, items.length - evaluable.length),
    acceptedItems: accepted.length,
    averageRuntimeSeconds: average(runtimes),
    medianRuntimeSeconds: median(runtimes),
    repeats,
  };
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const started = performance.now();
    const response = await fetch(url, { ...init, signal: controller.signal, headers: { accept: "application/json", ...(init.headers || {}) } });
    const payload = await response.json();
    return { response, payload, latencyMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}

async function oldApiLane(profile) {
  const items = [];
  const latencies = [];
  const errors = [];
  for (let rotation = 0; rotation < rotations; rotation += 1) {
    try {
      const result = await fetchJson(`${apiBase}/ia/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel: Number(profile.channel), count: 5, rotation, recentIds: [] }) });
      latencies.push(result.latencyMs);
      if (!result.response.ok) errors.push(`HTTP ${result.response.status}`);
      for (const item of [...(result.payload?.candidateItems || []), ...(result.payload?.items || [])]) items.push(item);
    } catch (error) { errors.push(String(error.message || error)); }
  }
  const uniqueItems = unique(items);
  return {
    ...metricSet(profile, items),
    uniqueDepth: uniqueItems.length,
    queueResponseMs: { average: average(latencies), median: median(latencies), samples: latencies.length },
    firstFrameMs: null,
    firstFrameStatus: "requires-browser-canary",
    errors,
  };
}

const report = { schemaVersion: "ia-canonical-comparison-1", generatedAt: new Date().toISOString(), apiBase, rotations, lanes: {} };
for (const profile of Object.values(IA_CANONICAL_PILOT_PROFILES)) {
  const manifest = IA_CANONICAL_PILOT_MANIFESTS[profile.profileKey] || { items: [], verified: false, catalogDepth: 0 };
  const canonical = { ...metricSet(profile, manifest.items || []), uniqueDepth: unique(manifest.items || []).length, verified: manifest.verified === true, firstFrameMs: null, firstFrameStatus: "requires-browser-canary" };
  const current = await oldApiLane(profile);
  report.lanes[profile.profileKey] = { channel: profile.channel, name: profile.name, profile, current, canonical, delta: { catalogDepth: canonical.catalogDepth - current.catalogDepth, genreAccuracy: canonical.genreAccuracy != null && current.genreAccuracy != null ? Number((canonical.genreAccuracy - current.genreAccuracy).toFixed(3)) : null, medianRuntimeSeconds: (canonical.medianRuntimeSeconds || 0) - (current.medianRuntimeSeconds || 0), repeats: canonical.repeats - current.repeats, queueResponseMs: null, firstFrameMs: null } };
}
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`Wrote ${output}`);
