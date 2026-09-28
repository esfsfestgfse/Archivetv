#!/usr/bin/env node
/*
 * Read-only Internet Archive file-level harvester for the v4.1.150 underfill
 * repair. It deliberately emits only concrete derivatives with enough
 * metadata to enforce RealSignal's playback policy. The output is an audit
 * artifact for selecting recovery records; it never edits the catalog or
 * uploads anything by itself.
 */
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = process.argv[2];
const channelArg = process.argv[3] || "3,11,20,66,81,118,212,500,902,905,906,907,914,929";
const outputPath = process.argv[4] || "";
if (!manifestPath) {
  console.error("Usage: node scripts/harvest-ia-underfills-v150.js <manifest.json> [channels]");
  process.exit(2);
}

const rows = JSON.parse(fs.readFileSync(path.resolve(manifestPath), "utf8"));
const wanted = new Set(channelArg.split(",").map(value => value.trim()).filter(Boolean));
const manifest = rows.filter(row => wanted.has(String(row.channel)));
if (manifest.length !== wanted.size) {
  throw new Error("One or more requested channels are missing from the manifest");
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
]);
const globalDeny = /fan\s*(made|film|movie)?|parody|podcast|reaction|review|shorts?|short\s+film|trailer|teaser|vertical|portrait|clip|promo(?:tion)?|commercial|bumper/i;
const videoExt = /\.(?:mp4|m4v|mov|ogv|webm)$/i;
const audioExt = /\.(?:mp3|flac|ogg|oga|wav|m4a|aac)$/i;

async function search(query) {
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set("q", query);
  for (const field of ["identifier", "title", "year", "subject", "collection", "mediatype"]) url.searchParams.append("fl[]", field);
  url.searchParams.set("rows", "40");
  url.searchParams.set("page", "1");
  url.searchParams.set("output", "json");
  const response = await timeout(fetch(url, { headers: { accept: "application/json", "user-agent": "RealSignal IA depth harvester" } }), 12000);
  if (!response.ok) throw new Error(`search HTTP ${response.status}`);
  return (await response.json())?.response?.docs || [];
}

async function metadata(identifier) {
  const response = await timeout(fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { headers: { accept: "application/json", "user-agent": "RealSignal IA depth harvester" } }), 12000);
  if (!response.ok) return null;
  return response.json();
}

function compactText(value) {
  return Array.isArray(value) ? value.join(" ") : String(value || "");
}

function editorialMatch(doc, row) {
  const title = String(doc?.title || "").toLowerCase();
  const text = `${title} ${compactText(doc?.subject)}`.toLowerCase();
  const terms = Array.isArray(row.themeTerms) ? row.themeTerms : [];
  const score = terms.reduce((total, term) => total + (text.includes(String(term || "").toLowerCase()) ? 1 : 0), 0);
  if (score < Math.max(1, Number(row.themeMinScore) || 1)) return false;
  const required = Array.isArray(row.requiredTitleTerms) ? row.requiredTitleTerms : [];
  return !required.length || required.some(term => title.includes(String(term || "").toLowerCase()));
}

function duration(file) {
  const value = Number(file?.length ?? file?.runtime ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function candidateFiles(doc, body, row) {
  const audioLane = (row.mediaTypes || []).includes("audio");
  const minimum = audioLane ? 150 : 900;
  const titleText = `${doc.title || ""} ${compactText(doc.subject)}`;
  if (globalDeny.test(titleText)) return [];
  if (!editorialMatch(doc, row)) return [];
  return (body?.files || [])
    .filter(file => {
      const name = String(file?.name || "");
      const isMedia = audioLane ? audioExt.test(name) : videoExt.test(name);
      if (!isMedia || globalDeny.test(name)) return false;
      if (Number(file?.size || 0) < (audioLane ? 200000 : 1000000)) return false;
      if (duration(file) < minimum) return false;
      if (!audioLane) {
        const width = Number(file?.width || 0);
        const height = Number(file?.height || 0);
        /* A known portrait derivative is never allowed. Unknown dimensions
           stay out of this audit so they cannot silently regress policy. */
        if (!width || !height || width < height) return false;
      }
      return true;
    })
    .map(file => ({
      name: file.name,
      length: duration(file),
      width: Number(file.width || 0),
      height: Number(file.height || 0),
      size: Number(file.size || 0),
      format: file.format || "",
    }))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

async function harvest(row) {
  const docs = [];
  const seen = new Set();
  const queries = Array.isArray(row.queries) ? row.queries.slice(0, 10) : [];
  for (const query of queries) {
    try {
      for (const doc of await search(query)) {
        const id = String(doc?.identifier || "");
        if (id && !seen.has(id)) {
          seen.add(id);
          docs.push(doc);
        }
      }
    } catch (error) {
      console.error(JSON.stringify({ channel: row.channel, query: query.slice(0, 100), error: String(error.message || error) }));
    }
    await sleep(100);
  }
  const selected = [];
  for (let offset = 0; offset < docs.length && selected.length < 18; offset += 5) {
    const batch = await Promise.all(docs.slice(offset, offset + 5).map(async doc => {
      try {
        const body = await metadata(doc.identifier);
        const files = candidateFiles(doc, body, row);
        return files.length ? { doc, files } : null;
      } catch {
        return null;
      }
    }));
    for (const item of batch.filter(Boolean)) {
      for (const file of item.files) {
        selected.push({
          identifier: `${item.doc.identifier}::${file.name}`,
          sourceIdentifier: item.doc.identifier,
          fileName: file.name,
          title: item.doc.title || item.doc.identifier,
          subject: compactText(item.doc.subject),
          year: Number(item.doc.year || 0) || 0,
          mediaType: (row.mediaTypes || []).includes("audio") ? "audio" : "video",
          runtime: file.length,
          width: file.width,
          height: file.height,
          size: file.size,
          format: file.format,
          url: `https://archive.org/download/${item.doc.identifier}/${encodeURIComponent(file.name).replace(/%2F/g, "/")}`,
        });
        if (selected.length >= 18) break;
      }
      if (selected.length >= 18) break;
    }
    await sleep(100);
  }
  return { channel: row.channel, name: row.name, mediaTypes: row.mediaTypes, selected };
}

(async () => {
  const results = [];
  for (const row of manifest) {
    console.error(`harvesting ${row.channel} ${row.name}`);
    results.push(await harvest(row));
  }
  const output = JSON.stringify(results, null, 2);
  if (outputPath) fs.writeFileSync(path.resolve(outputPath), output + "\n");
  else console.log(output);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
