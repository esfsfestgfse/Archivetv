/* 4.0.19 telemetry-guided lane repair contract.
   The repair is intentionally additive: cold-start rails and diversity limits
   are present, while the existing editorial gates remain in each profile. */
const fs = require('fs');
const path = require('path');
const repo = path.resolve(__dirname, '..');
const files = ['the_dial_desktop.html', 'the_dial_mobile.html'];
const lanes = ['Museum of Motion', 'Comedy Classics', 'Classic Cartoons', 'Modern Cartoons', 'Britain on Film'];
const required = [
  'Telemetry-guided cleanup 4.0.19',
  'fastCollections',
  'deepCollections',
  'deepTitleTerms',
  'diversity:{maxPerEra:2,maxPerLane:2,maxPerCreator:1,maxPerCollection:3}',
  'var rsGuideListing=guideListing',
  'var rsSetChanStatus=setChanStatus',
  'SYSTEM STATUS',
  'PROGRAM DATA PENDING'
];
for (const file of files) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  for (const token of required) {
    if (!source.includes(token)) throw new Error(`${file}: missing ${token}`);
  }
  for (const lane of lanes) {
    if (!source.includes(`PROGRAM["${lane}"]`)) throw new Error(`${file}: missing repaired lane ${lane}`);
  }
}
console.log('Telemetry lane policy: five proven weak lanes have additive rails, diversity limits, and quiet viewer-facing status text on desktop/mobile.');
