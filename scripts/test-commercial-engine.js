const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const files = process.argv.slice(2);
if (!files.length) files.push('the_dial_desktop.html', 'the_dial_mobile.html');

function commercialBlock(source, file) {
  const start = source.indexOf('/* ===== commercial breaks:');
  const end = start < 0 ? -1 : source.indexOf('/* Station Bumpers', start);
  assert(start >= 0 && end > start, `${file}: commercial engine block is missing`);
  return source.slice(start, end);
}

function queryFor(block, channel) {
  const saved = new Map();
  const sandbox = {
    store: {
      get(key, fallback) { return saved.has(key) ? saved.get(key) : fallback; },
      set(key, value) { saved.set(key, value); }
    },
    programPhrase(value) { return `"${String(value)}"`; },
    console,
    Date,
    Math,
    Promise
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(block, context, { timeout: 1000 });
  return vm.runInContext(`adQueries(${JSON.stringify(channel)})`, context, { timeout: 1000 });
}

for (const file of files) {
  const block = commercialBlock(fs.readFileSync(file, 'utf8'), file);
  const sports = queryFor(block, { cat: 'SPORTS', nm: 'Sports Vault', audio: false });
  assert(sports.length >= 20, `${file}: sports break catalog is too shallow`);
  assert(sports.every(query => query.includes('mediatype:movies')), `${file}: video stations must query movie media only`);
  assert(sports.every(query => query.includes('AND NOT (subject:("audio only" OR "radio commercial"')), `${file}: video stations must explicitly exclude radio/audio ads`);
  assert(sports.some(query => query.includes('"automobile commercial"')), `${file}: sports breaks need station-aware product context`);
  assert(sports.some(query => query.includes('AND (subject:("automobile commercial" OR "sporting goods commercial"')), `${file}: sports context must be a prioritized query clause, not merely an OR hint`);

  const animation = queryFor(block, { cat: 'TOON', nm: 'Modern Cartoons', audio: false });
  assert(animation.some(query => query.includes('"toy commercial"')), `${file}: animation breaks need toy/family context`);

  const outdoor = queryFor(block, { cat: 'TV', nm: 'Tight Lines', audio: false });
  assert(outdoor.some(query => query.includes('"fishing gear commercial"')), `${file}: outdoor breaks need gear context`);

  const scoring = (() => {
    const saved = new Map();
    const context = vm.createContext({ store: { get: (key, fallback) => saved.has(key) ? saved.get(key) : fallback, set: (key, value) => saved.set(key, value) }, programPhrase: value => `"${String(value)}"`, Date, Math, Promise, console });
    vm.runInContext(block, context, { timeout: 1000 });
    return context;
  })();
  const sportsScore = vm.runInContext(`adItemContextScore({title:"Vintage automobile commercial",subject:["sports drink commercial"]},{cat:"SPORTS",nm:"Sports Vault",audio:false})`, scoring, { timeout: 1000 });
  const genericScore = vm.runInContext(`adItemContextScore({title:"Time Savers for House Makers",subject:["classic television commercials"]},{cat:"SPORTS",nm:"Sports Vault",audio:false})`, scoring, { timeout: 1000 });
  assert(sportsScore > genericScore, `${file}: a sports-matched break must outrank a generic commercial`);
  const autoScore = vm.runInContext(`adItemContextScore({title:"Automobile commercial",subject:[]},{cat:"SPORTS",nm:"Sports Vault",audio:false})`, scoring, { timeout: 1000 });
  const snackScore = vm.runInContext(`adItemContextScore({title:"Snack commercial",subject:[]},{cat:"SPORTS",nm:"Sports Vault",audio:false})`, scoring, { timeout: 1000 });
  assert(autoScore > snackScore, `${file}: sports auto spots must outrank generic snacks`);
  const adultTruck = vm.runInContext(`adItemContextScore({title:"Dodge Ram truck commercial",subject:[]},{cat:"TV",nm:"Tight Lines",audio:false})`, scoring, { timeout: 1000 });
  const toyTruck = vm.runInContext(`adItemContextScore({title:"Toy fire truck commercial for kids",subject:[]},{cat:"TV",nm:"Tight Lines",audio:false})`, scoring, { timeout: 1000 });
  assert(adultTruck > toyTruck, `${file}: outdoor stations must prefer real vehicle spots over toy truck ads`);

  const radio = queryFor(block, { cat: 'MUS', nm: 'RealSignal Radio', audio: true });
  assert(radio.length >= 4, `${file}: audio break catalog must retain all four rotation lanes`);
  assert(radio.every(query => query.includes('mediatype:audio')), `${file}: audio stations must query audio media only`);
  assert(radio.some(query => query.includes('"radio commercial"')), `${file}: radio stations need radio sponsor vocabulary`);
  assert(radio.every(query => !query.includes('"audio only"')), `${file}: radio sponsor searches must not use the video-only exclusion`);
  assert(radio.every(query => query.includes('NOT (subject:podcast OR title:podcast OR collection:podcasts)')), `${file}: radio sponsor searches must exclude podcast clutter`);

  console.log(`${file}: commercial engine context and media-lane checks passed`);
}
