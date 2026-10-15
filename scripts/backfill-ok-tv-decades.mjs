#!/usr/bin/env node
/* Enrich legacy OK TV rows from canonical TVmaze IDs. This bounded
 * maintenance task never discovers media or changes playback URLs. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const wrangler = process.env.WRANGLER_BIN || path.join(root, ".wrangler-runtime", "node_modules", "wrangler", "bin", "wrangler.js");
const config = path.join(root, "wrangler.api.jsonc");

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || `wrangler exited ${result.status}`).trim());
  return String(result.stdout || "").replace(/\u001b\[[0-9;]*m/g, "").trim();
}

function wranglerJson(sql) {
  const output = runWrangler(["d1", "execute", "realsignal-catalog", "--remote", "--config", config, "--json", "--command", sql]);
  const start = output.indexOf("[");
  if (start < 0) throw new Error("Wrangler did not return JSON");
  return JSON.parse(output.slice(start));
}

export function premiere(show) {
  const match = String(show?.premiered || "").match(/^((?:19|20)\d{2})-\d{2}-\d{2}$/);
  if (!match) return null;
  const year = Number(match[1]);
  return { year, decade: Math.floor(year / 10) * 10 };
}

export function updateSql(seriesId, year, decade) {
  if (!/^tvmaze:\d+$/.test(seriesId) || !Number.isInteger(year) || !Number.isInteger(decade)) throw new TypeError("invalid canonical series metadata");
  return `UPDATE programs SET year=CASE WHEN year IS NULL OR year='' THEN '${year}' ELSE year END, metadata_json=json_set(CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,'$.seriesStartYear',${year},'$.seriesDecade',${decade}) WHERE id IN (SELECT cp.program_id FROM channel_programs cp WHERE cp.channel_key='ok-tv-channel') AND json_extract(CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,'$.seriesId')='${seriesId}'`;
}

async function main() {
  const query = "SELECT DISTINCT json_extract(CASE WHEN json_valid(p.metadata_json) THEN p.metadata_json ELSE '{}' END,'$.seriesId') AS series_id FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key='ok-tv-channel' AND p.status='active' AND json_extract(CASE WHEN json_valid(p.metadata_json) THEN p.metadata_json ELSE '{}' END,'$.seriesId') LIKE 'tvmaze:%' AND COALESCE(CAST(json_extract(CASE WHEN json_valid(p.metadata_json) THEN p.metadata_json ELSE '{}' END,'$.seriesStartYear') AS INTEGER),0)=0 ORDER BY series_id LIMIT 96";
  const rows = wranglerJson(query).flatMap((entry) => entry.results || []);
  const updates = [];
  for (const row of rows) {
    const seriesId = String(row.series_id || "");
    const id = seriesId.match(/^tvmaze:(\d+)$/)?.[1];
    if (!id) continue;
    const response = await fetch(`https://api.tvmaze.com/shows/${id}`, { headers: { "user-agent": "RealSignal catalog maintenance" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) continue;
    const dates = premiere(await response.json());
    if (dates) updates.push({ seriesId, ...dates });
  }
  if (apply) {
    for (let offset = 0; offset < updates.length; offset += 10) {
      const sql = updates.slice(offset, offset + 10).map((row) => `${updateSql(row.seriesId, row.year, row.decade)};`).join(" ");
      runWrangler(["d1", "execute", "realsignal-catalog", "--remote", "--config", config, "--command", sql]);
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", unresolvedSeries: rows.length, enrichedSeries: updates.length, updates }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
