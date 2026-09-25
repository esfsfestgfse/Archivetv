#!/usr/bin/env node
/*
 * Build verified pilot manifests from Internet Archive metadata.
 * This job writes only a local generated manifest. It never mutates Archive.org
 * and never downloads media; it only checks metadata and the media URL headers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IA_CANONICAL_PILOT_PROFILES, buildCanonicalManifest } from "../ia_canonical_station.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv.includes("--out")
  ? path.resolve(process.argv[process.argv.indexOf("--out") + 1])
  : path.join(root, "ia_canonical_pilot_manifest.js");
const maxDocs = Math.max(12, Math.min(200, Number(process.env.IA_PILOT_MAX_DOCS || 100)));
const maxMetadata = Math.max(12, Math.min(160, Number(process.env.IA_PILOT_MAX_METADATA || 80)));
const maxFilesPerDoc = Math.max(1, Math.min(12, Number(process.env.IA_PILOT_MAX_FILES_PER_DOC || 8)));
const timeoutMs = Math.max(1000, Math.min(12000, Number(process.env.IA_PILOT_TIMEOUT_MS || 7000)));
const searchTimeoutMs = Math.max(timeoutMs, Math.min(20000, Number(process.env.IA_PILOT_SEARCH_TIMEOUT_MS || 12000)));
const retryDelayMs = Math.max(100, Math.min(3000, Number(process.env.IA_PILOT_RETRY_DELAY_MS || 500)));
const requestedProfiles = new Set(String(process.env.IA_PILOT_PROFILES || "").split(",").map((value) => value.trim()).filter(Boolean));

function withTimeout(promise, ms = timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return Promise.resolve(promise(controller.signal)).finally(() => clearTimeout(timer));
}

async function getJson(url, timeout = timeoutMs) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await withTimeout((signal) => fetch(url, { signal, headers: { accept: "application/json" } }), timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw lastError;
}

async function headPlayable(url) {
  try {
    const response = await withTimeout((signal) => fetch(url, { method: "HEAD", redirect: "follow", signal }));
    return response.status >= 200 && response.status < 400;
  } catch (_) {
    return false;
  }
}

function queryUrl(query, page = 1, sort = "downloads desc") {
  const params = new URLSearchParams({ q: query, output: "json", rows: String(maxDocs), page: String(page), "sort[]": sort });
  ["identifier", "title", "description", "year", "subject", "collection", "creator", "license", "rights"].forEach((field) => params.append("fl[]", field));
  return `https://archive.org/advancedsearch.php?${params.toString()}`;
}

function fileStem(name) {
  return String(name || "")
    .split("/")
    .pop()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferYear(profile, ...values) {
  const candidates = [];
  for (const value of values) {
    const matches = String(value || "").match(/\b(?:18|19|20)\d{2}\b/g) || [];
    for (const match of matches) candidates.push(Number(match));
  }
  return candidates.find((year) => year >= profile.era[0] && year <= profile.era[1]) || candidates[0] || "";
}

function parseRuntime(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  const parts = raw.split(":").map(Number);
  if (parts.every(Number.isFinite)) {
    if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  }
  const minutes = Number(raw.match(/(\d+(?:\.\d+)?)\s*(?:min|m\b)/i)?.[1]);
  return Number.isFinite(minutes) ? Math.round(minutes * 60) : 0;
}

function fileScore(file) {
  const name = String(file?.name || "");
  const format = String(file?.format || "").toLowerCase();
  if (!/\.(mp4|m4v|webm)$/i.test(name)) return 99;
  if (/(thumb|sample|trailer|preview|poster|logo|transcript|caption)/i.test(name)) return 99;
  if (/h\.?264|avc|mpeg-4/i.test(format)) return 0;
  if (/webm|vp8|vp9|av1/i.test(format) || /\.webm$/i.test(name)) return 2;
  return 1;
}

function buildSearches(profile) {
  /* Archive upload years are often modern even when the underlying episode is
     historic. Apply the era locally after inspecting the filename/metadata so
     complete-series items are not discarded at search time. */
  const base = "mediatype:movies";
  const subject = profile.includeAny.slice(0, 8).map((term) => `subject:("${term}")`).join(" OR ");
  const collectionQueries = profile.collections.slice(0, 8).map((collection) => `${base} AND collection:${collection}`);
  const titleQueries = profile.titleAny.slice(0, 8).map((term) => `${base} AND title:("${term}")`);
  return [...profile.searchQueries.map((query) => `${base} AND (${query})`), `${base} AND (${subject})`, ...titleQueries, ...collectionQueries];
}

function pickFiles(metadata) {
  const files = Array.isArray(metadata?.files) ? metadata.files : [];
  return files
    .filter((file) => fileScore(file) < 99)
    .sort((a, b) => fileScore(a) - fileScore(b) || String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, maxFilesPerDoc);
}

async function mapLimit(values, limit, mapper) {
  const input = Array.from(values || []);
  const output = new Array(input.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= input.length) return;
      try { output[index] = await mapper(input[index], index); }
      catch (error) { output[index] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), input.length || 1) }, () => worker()));
  return output;
}

async function collectProfile(profile) {
  const docs = new Map();
  const searchModes = ["downloads desc", "title asc"];
  for (const query of buildSearches(profile)) {
    for (const sort of searchModes) {
      try {
        const payload = await getJson(queryUrl(query, 1, sort), searchTimeoutMs);
        for (const doc of payload?.response?.docs || []) if (doc?.identifier && !docs.has(doc.identifier)) docs.set(doc.identifier, doc);
      } catch (error) {
        console.warn(`${profile.profileKey}: search failed: ${error.message}`);
      }
      if (docs.size >= maxDocs) break;
    }
    if (docs.size >= maxDocs) break;
  }
  const metadataRows = await mapLimit([...docs.values()].slice(0, maxMetadata), 2, async (doc) => {
    try {
      const metadata = await getJson(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
      return { doc, metadata, files: pickFiles(metadata) };
    } catch (error) {
      console.warn(`${profile.profileKey}: metadata failed for ${doc.identifier}: ${error.message}`);
      return null;
    }
  });
  const candidates = metadataRows
    .filter((row) => row && !row.error && row.files.length)
    .flatMap((row) => row.files.map((file) => ({ ...row, file })));
  const checked = await mapLimit(candidates, 4, async (candidate) => {
    const { doc, metadata, file } = candidate;
    const mediaUrl = `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${String(file.name).split("/").map(encodeURIComponent).join("/")}`;
    if (!(await headPlayable(mediaUrl))) return null;
    const parentTitle = metadata?.metadata?.title || doc.title || doc.identifier;
    const description = metadata?.metadata?.description || doc.description || "";
    const subject = metadata?.metadata?.subject || doc.subject || "";
    const parentYear = inferYear(profile, metadata?.metadata?.year, metadata?.metadata?.date, doc.year, doc.title, description, subject);
    const childTitle = fileStem(file.name);
    const title = childTitle && childTitle.toLowerCase() !== String(parentTitle).toLowerCase()
      ? `${parentTitle} — ${childTitle}`
      : parentTitle;
    return {
      archiveId: doc.identifier,
      file: file.name,
      title,
      description,
      year: inferYear(profile, childTitle, title, parentYear, metadata?.metadata?.year, doc.year),
      runtimeSeconds: parseRuntime(file.length || file.runtime || metadata?.metadata?.runtime || doc.runtime),
      collection: metadata?.metadata?.collection || doc.collection || "",
      subject,
      creator: metadata?.metadata?.creator || doc.creator || "",
      rights: metadata?.metadata?.license || metadata?.metadata?.rights || doc.license || doc.rights || "",
      mediaUrl,
      sourceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
      playability: "header-verified",
    };
  });
  const raw = checked.filter(Boolean);
  return buildCanonicalManifest(profile, raw);
}

const manifests = {};
for (const profile of Object.values(IA_CANONICAL_PILOT_PROFILES).filter((candidate) => !requestedProfiles.size || requestedProfiles.has(candidate.profileKey))) {
  console.log(`Building ${profile.name} (${profile.channel})`);
  manifests[profile.profileKey] = await collectProfile(profile);
  console.log(`  verified=${manifests[profile.profileKey].verified} depth=${manifests[profile.profileKey].catalogDepth}`);
}

let preserved = {};
if (requestedProfiles.size && fs.existsSync(output)) {
  try { preserved = (await import(`${pathToFileURL(output).href}?preserve=${Date.now()}`)).IA_CANONICAL_PILOT_MANIFESTS || {}; }
  catch (_) { /* a partial rebuild may start from an empty generated file */ }
}
const outputManifests = { ...preserved, ...manifests };
const body = `/* Generated by scripts/build-ia-canonical-pilot.mjs. */\nexport const IA_CANONICAL_PILOT_MANIFESTS = Object.freeze(${JSON.stringify(outputManifests, null, 2)});\n`;
fs.writeFileSync(output, body);
console.log(`Wrote ${output}`);
