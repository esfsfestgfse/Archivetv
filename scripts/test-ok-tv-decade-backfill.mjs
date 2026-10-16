import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { premiere, updateSql } from "./backfill-ok-tv-decades.mjs";

assert.deepEqual(premiere({ premiered: "1984-09-20" }), { year: 1984, decade: 1980 });
assert.equal(premiere({ premiered: null }), null);
assert.match(updateSql("tvmaze:44", 1984, 1980), /seriesStartYear',1984,'\$\.seriesDecade',1980/);
assert.match(updateSql("tvmaze:44", 1984, 1980), /channel_key='ok-tv-channel'/);
assert.throws(() => updateSql("bad:44", 1984, 1980));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "realsignal-api.yml"), "utf8");
assert.match(workflow, /Install Wrangler for catalog maintenance[\s\S]*npm install --prefix \.wrangler-runtime --no-save wrangler@4/,
  "API deployment must provision the pinned Wrangler runtime used by catalog maintenance");
assert.match(workflow, /Repair canonical OK TV premiere metadata[\s\S]*node scripts\/backfill-ok-tv-decades\.mjs --apply/,
  "API deployment must repair unresolved canonical TV years after the Worker is live");
assert.match(workflow, /Repair canonical OK TV premiere metadata[\s\S]*continue-on-error: true/,
  "optional D1 metadata repair must not turn a successful Worker deployment red when the token lacks D1 edit permission");
console.log("OK TV decade backfill contract passed.");
