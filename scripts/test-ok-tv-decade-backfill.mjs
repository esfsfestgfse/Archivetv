import assert from "node:assert/strict";
import { premiere, updateSql } from "./backfill-ok-tv-decades.mjs";

assert.deepEqual(premiere({ premiered: "1984-09-20" }), { year: 1984, decade: 1980 });
assert.equal(premiere({ premiered: null }), null);
assert.match(updateSql("tvmaze:44", 1984, 1980), /seriesStartYear',1984,'\$\.seriesDecade',1980/);
assert.match(updateSql("tvmaze:44", 1984, 1980), /channel_key='ok-tv-channel'/);
assert.throws(() => updateSql("bad:44", 1984, 1980));
console.log("OK TV decade backfill contract passed.");
