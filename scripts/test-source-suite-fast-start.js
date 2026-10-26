#!/usr/bin/env node
/* Proves Source Suite YouTube discovery is server-owned. The browser must not
   make direct YouTube API calls or depend on a client credential for startup;
   the API Worker owns discovery and returns the first verified lane. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

async function run(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.equal(/youtube\/v3|YOUTUBE_KEY/.test(source), false, `${file}: browser contains a direct YouTube API path`);
  const serverStart = source.indexOf('async function v2YouTube(');
  const serverEnd = source.indexOf('\nfunction v2IsoDuration', serverStart);
  assert.ok(serverStart >= 0 && serverEnd > serverStart, `${file}: could not extract server-only YouTube adapter`);
  const serverContext = {};
  vm.createContext(serverContext);
  vm.runInContext(source.slice(serverStart, serverEnd), serverContext);
  const serverResult = await serverContext.v2YouTube({ name: 'Server-Owned Unit' });
  assert.equal(serverResult.items.length, 0);
  assert.equal(serverResult.health.reason, 'server catalog required');
  console.log(`${file}: browser YouTube adapter is server-only`);
  return;
}

async function darkroomAdmission() {
  const { sourceProfile, qualifySourceItem } = await import('../realsignal_source_catalog.js');
  const profile = sourceProfile({ profileKey: 'darkroom' });
  const good = { id: 'youtube:photo-proof', provider: 'YouTube', title: 'The History of Camera Flashes', duration: 1700, aspectRatio: 16 / 9, language: 'en', rights: 'Standard YouTube license', url: 'https://www.youtube-nocookie.com/embed/photo-proof' };
  assert.ok(qualifySourceItem(profile, good), 'photography programming remains admitted');
  const badTitle = 'DARKROOM & X -RAY FILM PROCESSING |150 ONE-LINERS +100 MCQ | AIIMS CRE PHASE-4 |RADIOGRAPHER';
  assert.equal(qualifySourceItem(profile, { ...good, title: badTitle }), null, 'clinical exam preparation is not photography programming');
  for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
    const row = fs.readFileSync(path.join(root, file), 'utf8').split('\n').find(line => line.trim().startsWith('"darkroom":'));
    const client = vm.runInNewContext('({' + row.trim().replace(/,$/, '') + '})').darkroom;
    assert.ok(client.deny.some(term => badTitle.toLowerCase().includes(term)), `${file}: retained client caches reject the same clinical result`);
  }
  console.log('Darkroom admission preserves photography and rejects clinical exam material.');
}

Promise.all([...['the_dial_desktop.html', 'the_dial_mobile.html'].map(run), darkroomAdmission()]).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

async function namedProgramDepth(){
  const {sourceProfile,qualifySourceItem}=await import('../realsignal_source_catalog.js');
  const base={provider:'YouTube',duration:1800,aspectRatio:16/9,language:'en',rights:'Standard YouTube license',url:'https://www.youtube-nocookie.com/embed/program-proof'};
  const positives=[
    ['classroom','The Mechanical Universe: Newtons Laws','David Goodstein teaches mechanics in this educational television episode.'],
    ['classroom','Bill Nye The Science Guy - Full Episode - Electricity','An episode about electricity with science demonstrations.'],
    ['comfort-television','The New Yankee Workshop - Farmhouse Table - Full Episode','Norm Abram makes a farmhouse table.'],
    ['comfort-television','The Joy of Painting - Mountain Lake - Full Episode','Bob Ross paints a mountain lake.'],
    ['foodways',"Rick Stein's Spain - Episode 1",'A journey through regional Spanish cooking and culinary heritage.'],
    ['foodways','Food Safari - Lebanese Cuisine - Full Episode','A documentary about Lebanese cuisine and traditional food.'],
    ['black-stage','August Wilsons The Piano Lesson - Full Stage Production','A complete theatrical production of the play by August Wilson.']
  ];
  for(const [key,title,description]of positives){const profile=sourceProfile({profileKey:key});assert.equal(profile.longForm,true,key+': the normalized search profile must retain its long-form discovery contract');assert.ok(qualifySourceItem(profile,{...base,id:'youtube:'+key+title,title,description}),key+': preserve the actual named program '+title);}
  for(const [key,title,description]of [
    ['classroom','Product training webinar for classroom software','Training for a classroom software product.'],
    ['comfort-television','New Yankee Workshop Simulator Gameplay','A fictional workshop in a video game.'],
    ['foodways','Food Safari Podcast - Culinary History Discussion','A podcast about food culture.'],
    ['black-stage','August Wilson Interview - The Piano Lesson','An interview discussing the playwrights work.']
  ])assert.equal(qualifySourceItem(sourceProfile({profileKey:key}),{...base,id:'youtube:bad-'+key,title,description}),null,key+': reject the wrong format');
  for(const [key,title,description]of positives){const profile=sourceProfile({profileKey:key});assert.equal(qualifySourceItem(profile,{...base,id:'youtube:short-'+key,title,description,duration:120}),null);assert.equal(qualifySourceItem(profile,{...base,id:'youtube:portrait-'+key,title,description,aspectRatio:9/16}),null);}
  assert.equal(qualifySourceItem(sourceProfile({profileKey:'comfort-television'}),{...base,id:'youtube:wrong-comfort',title:'Chariots of the Gods? The Mysteries Continue (1996)',description:'Hosted by Richard Karn of Home Improvement fame, a documentary about ancient astronauts.'}),null,'an actors Home Improvement credit does not make a documentary crafts television');
  for(const [key,title,account] of [
    ['black-stage','A Raisin in the Sun Audio Act 1 Scene 2','Hedaya Kelani'],
    ['black-stage','A Raisin in the Sun - FULL AUDIO','Mackintosh Legagneur'],
    ['black-stage','Family, legacy and conflict in August Wilsons The Piano Lesson','WDET 101.9 FM Detroit'],
    ['black-stage','Stage@Home RERUNS | Revisiting August Wilsons Fences','FloridaRepTheatre'],
    ['black-stage','The Gallery - The Piano Lesson','University of Central Florida'],
    ['classroom','Neil deGrasse Tyson and Bill Nye Catch Up','StarTalk'],
    ['classroom','Bill Nye Debates Ken Ham - HD (Official)','Answers in Genesis'],
    ['foodways',"The Most Elite Plays in Hell's Kitchen History","Hell's Kitchen"],
    ['foodways','The Life and Death of Anthony Bourdain: What Really Happened?','Factinate']
  ])assert.equal(qualifySourceItem(sourceProfile({profileKey:key}),{...base,id:'youtube:measured-contamination',title,account}),null,key+': reject measured format contamination');
  for(const file of ['the_dial_desktop.html','the_dial_mobile.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8'),profiles={};
    for(const key of [...new Set(positives.map(row=>row[0]))]){const line=html.split('\n').find(l=>l.trim().startsWith('"'+key+'":'));profiles[key]=vm.runInNewContext('({'+line.trim().replace(/,$/,'')+'})')[key];}
    const scope={window:{RealSignalSourcePrograms:require('../assets/source-program-policy.js')},V2_PREVIEW_PROFILES:profiles};vm.createContext(scope);
    vm.runInContext(html.slice(html.indexOf('const V2_SOURCE_MODE_GROUPS='),html.indexOf('function v2ProgramTopics(')),scope);
    const names=['v2ProgramTopics','v2ProgramDeny','v2ProgramTitleDeny','v2ProgramCategoryOkay','v2ProgramFormats','v2Text','v2TextUnique','v2SourceTokens','v2TermHit','v2QueryTokens','v2StrictProgramFallback','v2Relevant','v2SourceProgramAllowed','v2CandidateRelevant'];
    vm.runInContext(names.map(name=>html.split('\n').find(l=>l.trim().startsWith('function '+name+'('))).join('\n'),scope);
    for(const [key,title,description]of positives)assert.ok(scope.v2CandidateRelevant(profiles[key],{...base,id:'youtube:client-proof',title,description}),file+': viewer must retain the admitted named program '+title);
    for(const [key,title]of [['black-stage','A Raisin in the Sun - FULL AUDIO'],['classroom','Neil deGrasse Tyson and Bill Nye Catch Up'],['foodways',"The Most Elite Plays in Hell's Kitchen History"]])assert.equal(scope.v2CandidateRelevant(profiles[key],{...base,id:'youtube:bad-client',title}),false,file+': retain client editorial rejection');
  }
  for(const item of [{language:'fr'}, {language:'en',title:positives[4][1]+' - Spanish dubbed'}, {language:'en',description:'Full episode [FR] French'}])assert.equal(qualifySourceItem(sourceProfile({profileKey:'foodways'}),{...base,id:'youtube:language-negative',title:positives[4][1],description:positives[4][2],...item}),null,'subject-language exception must not admit a non-English release');
  console.log('Named Source Suite programs deepen four profiles without weakening runtime, orientation or format admission.');
}
namedProgramDepth().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
