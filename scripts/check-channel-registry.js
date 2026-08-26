const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = ["the_dial_desktop.html", "the_dial_mobile.html"];

function blockBetween(source, begin, end, filename) {
  const start = source.indexOf(begin);
  const finish = source.indexOf(end, start);
  if (start < 0 || finish < 0) throw new Error(`${filename}: cannot find ${begin}`);
  return source.slice(start, finish + end.length);
}

function readRegistry(filename) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  const channelBlock = blockBetween(source, "const CH=[", "\n];", filename);
  const categoryBlock = blockBetween(source, "const CAT={", "};", filename);
  const metadataBlock = blockBetween(source, "const CHANNEL_META={", "\n};", filename);
  const programBlock = blockBetween(source, "const PROGRAM = {", "\n};\n\n/* Editorial lane overlay", filename);
  const orderMatch = source.match(/var CAT_ORDER=\[([^\]]+)\]/);
  if (!orderMatch) throw new Error(`${filename}: cannot find CAT_ORDER`);
  const channels = [...channelBlock.matchAll(/\{nm:"([^"]+)",\s*num:(\d+),\s*cat:"([^"]+)",\s*(?:gl:"([^"]+)"|source:"([^"]+)")/g)]
    .map((match) => ({ name: match[1], number: Number(match[2]), category: match[3], identity: match[4] || match[5] }));
  const categories = [...categoryBlock.matchAll(/([A-Z]+):"/g)].map((match) => match[1]);
  const order = [...orderMatch[1].matchAll(/"([A-Z]+)"/g)].map((match) => match[1]);
  const metadataNames = new Set([...metadataBlock.matchAll(/^"([^"]+)":\{/gm)].map((match) => match[1]));
  const programNames = new Set([...programBlock.matchAll(/^\s*"([^"]+)"\s*:\s*\{/gm)].map((match) => match[1]));
  return { channels, categories, order, metadataNames, programNames };
}

function duplicates(values, key) {
  const seen = new Map();
  for (const value of values) {
    const current = seen.get(value[key]) || [];
    current.push(value);
    seen.set(value[key], current);
  }
  return [...seen.values()].filter((group) => group.length > 1);
}

const registries = files.map((file) => ({ file, ...readRegistry(file) }));
const problems = [];

for (const registry of registries) {
  for (const duplicate of duplicates(registry.channels, "number")) {
    problems.push(`${registry.file}: duplicate channel ${duplicate[0].number} (${duplicate.map((entry) => entry.name).join(", ")})`);
  }
  for (const duplicate of duplicates(registry.channels, "name")) {
    problems.push(`${registry.file}: duplicate channel name ${duplicate[0].name}`);
  }
  for (const channel of registry.channels) {
    if (!registry.categories.includes(channel.category)) problems.push(`${registry.file}: ${channel.name} uses unknown category ${channel.category}`);
    if (!channel.identity) problems.push(`${registry.file}: ${channel.name} has no source or genre identity`);
  }
  for (const category of registry.categories) {
    if (!registry.order.includes(category)) problems.push(`${registry.file}: category ${category} is missing from CAT_ORDER`);
  }
  for (const channel of registry.channels.filter((entry) => entry.category === "BRIT")) {
    if (!registry.metadataNames.has(channel.name)) problems.push(`${registry.file}: British channel ${channel.name} is missing guide metadata`);
    if (!registry.programNames.has(channel.name)) problems.push(`${registry.file}: British channel ${channel.name} is missing an IA program lock`);
  }
}

const desktopShape = registries[0].channels.map((entry) => `${entry.number}|${entry.name}|${entry.category}|${entry.identity}`);
const mobileShape = registries[1].channels.map((entry) => `${entry.number}|${entry.name}|${entry.category}|${entry.identity}`);
if (desktopShape.join("\n") !== mobileShape.join("\n")) problems.push("desktop and mobile channel registries differ");

if (problems.length) {
  console.error("Channel registry check failed:\n" + problems.map((problem) => `- ${problem}`).join("\n"));
  process.exit(1);
}

console.log(`Channel registry OK: ${registries[0].channels.length} channels, ${registries[0].categories.length} categories, desktop/mobile aligned.`);
