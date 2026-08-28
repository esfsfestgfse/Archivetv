#!/usr/bin/env node
/* Export the exact app-generated IA queue manifest without requiring a browser.
 * The soak harness consumes this output against the production relay. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const file = process.argv[2] || path.join(__dirname, "..", "the_dial_desktop.html");
const source = fs.readFileSync(file, "utf8");
const start = source.indexOf("\nconst FNOT=") + 1;
const manifestMarker = "window.__atvIAManifest=function()";
const manifestStart = source.indexOf(manifestMarker);
const manifestEnd = source.indexOf("\nif(new URLSearchParams(location.search)", manifestStart);
const filterStart = source.indexOf("function iaProgramThemeTerms");
const filterEnd = source.indexOf("async function iaQueueRequest", filterStart);
if (start < 0 || manifestStart < 0 || manifestEnd < 0 || filterStart < 0 || filterEnd < 0) throw new Error("Unable to locate the app channel-manifest runtime");

const localStorage = new Map();
const context = {
  window: {},
  localStorage: { getItem: key => localStorage.get(key) || null, setItem: (key, value) => localStorage.set(key, String(value)) },
  location: { search: "" },
  URLSearchParams,
  JSON,
  Date,
  Math,
  String,
  Number,
  Array,
  Object,
  Set,
  Map,
  console,
};
vm.createContext(context);
vm.runInContext(source.slice(start, manifestEnd), context, { filename: path.basename(file) });
vm.runInContext(source.slice(filterStart, filterEnd), context, { filename: path.basename(file) });
const manifest = vm.runInContext(`CH.filter(function(ch){return !ch.source;}).map(function(ch){
  var sl=slotFor(ch,0,{preview:true});
  return {channel:String(ch.num),name:ch.nm,queries:iaQueueQueries(sl),themeTerms:iaProgramThemeTerms(sl),denyTerms:iaProgramDenyTerms(sl),mediaTypes:ch.audio?['audio']:['movies'],themeMinScore:Math.max(1,Math.min(12,Number(sl&&sl.program&&sl.program.themeMinScore)||1))};
})`, context);
const output = process.argv.indexOf("--out");
const json = JSON.stringify(manifest, null, 2) + "\n";
if (output >= 0 && process.argv[output + 1]) fs.writeFileSync(path.resolve(process.argv[output + 1]), json);
else process.stdout.write(json);
