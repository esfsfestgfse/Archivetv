#!/usr/bin/env node
/* Version 4 hybrid lineup guard: era lanes must be present and identical on
   desktop/mobile without colliding with existing live-data channel numbers. */
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'ia_canonical_station.mjs'), 'utf8');
const channelModule = Function(`${source.replace(/export\s+(?=(const|function|\{))/g, '')}; return { IA_HYBRID_STATION_BLUEPRINTS };`)();
const blueprints = channelModule.IA_HYBRID_STATION_BLUEPRINTS;
const issues = [];

if (!Array.isArray(blueprints) || blueprints.length !== 17) issues.push(`expected 17 hybrid era stations, found ${blueprints?.length || 0}`);
const blueprintIds = blueprints.map((station) => String(station.channel));
if (new Set(blueprintIds).size !== blueprintIds.length) issues.push('hybrid era station channel numbers must be unique');
for (const station of blueprints) {
  if (station.stationKind !== 'era' || station.balanceMode !== 'strict-era') issues.push(`${station.stationKey}: missing strict-era contract`);
  if (!Array.isArray(station.era) || station.era.length !== 2 || station.era[0] > station.era[1]) issues.push(`${station.stationKey}: invalid era range`);
}

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const html = fs.readFileSync(path.join(repo, file), 'utf8');
  const records = [...html.matchAll(/\{nm:"([^"]+)",\s*num:(\d+),[^\n]*?gl:"([^"]+)"/g)];
  const ids = records.map((match) => match[2]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) issues.push(`${file}: duplicate channel ids ${duplicateIds.join(', ')}`);
  for (const station of blueprints) {
    const gl = station.stationKey.replace(/-/g, '_');
    const record = records.find((match) => match[2] === String(station.channel));
    if (!record) issues.push(`${file}: missing channel ${station.channel} (${station.name})`);
    else {
      if (record[1] !== station.name) issues.push(`${file}: channel ${station.channel} name mismatch`);
      if (record[3] !== gl) issues.push(`${file}: channel ${station.channel} query profile mismatch`);
      if (!html.includes(`${gl}:`)) issues.push(`${file}: missing query profile ${gl}`);
    }
  }
}

console.log(`IA hybrid lineup: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
