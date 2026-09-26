/* 4.1.0 custom channel foundation contract. */
const fs = require('fs');
const path = require('path');
const repo = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(repo, 'realsignal_api_v2_worker.js'), 'utf8');
const migration = fs.readFileSync(path.join(repo, 'migrations', '0004_custom_channels.sql'), 'utf8');
const htmlFiles = ['the_dial_desktop.html', 'the_dial_mobile.html'];
for (const token of [
  'custom-channel-v1',
  '/custom-channels',
  'normalizeCustomRecipe',
  'custom-channel-recipes',
  'queueModel: "rolling-1-plus-2"',
  'freshnessWindow'
]) {
  if (!worker.includes(token)) throw new Error(`worker missing ${token}`);
}
for (const token of ['CREATE TABLE IF NOT EXISTS custom_channels', 'owner_key', 'recipe_json', 'idx_custom_channels_owner']) {
  if (!migration.includes(token)) throw new Error(`migration missing ${token}`);
}
for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  for (const token of ['CUSTOM CHANNEL BUILDER', 'customNameInput', 'btnCustomSave', 'toggleCustomChannels', 'custom-channel-foundation']) {
    if (!source.includes(token)) throw new Error(`${file} missing ${token}`);
  }
}
console.log('Custom channel contract: recipe schema, D1 persistence, local fallback, freshness settings, and desktop/mobile builder are present.');
