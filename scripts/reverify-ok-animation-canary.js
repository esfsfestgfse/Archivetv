/* Recheck public candidate metadata against current show-identity rules. */
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const source=await import(pathToFileURL(path.join(root,'realsignal_source_catalog.js')));
  const helper=await import(pathToFileURL(path.join(root,'ok_animation_catalog.js')));
  const file=path.join(root,'artifacts/ok-animation-public-canary.json');
  const data=JSON.parse(fs.readFileSync(file,'utf8')),cache=new Map();
  const getJson=async url=>{for(let retry=0;retry<3;retry++){const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(response.status===429){await new Promise(resolve=>setTimeout(resolve,3000));continue}if(!response.ok)throw new Error('metadata HTTP '+response.status);return response.json()}throw new Error('metadata cooldown')};
  for(const[key,catalog]of Object.entries(data.catalogs)){
    const profile=source.sourceProfile({profileKey:key}),items=[];
    for(const item of catalog.items){const identity=await helper.okAnimationIdentity(profile,item,getJson,cache);const verified=identity&&source.qualifySourceItem(profile,{...item,...identity});if(verified)items.push(verified)}
    console.log(JSON.stringify({profileKey:key,before:catalog.items.length,after:items.length,series:new Set(items.map(i=>i.seriesId)).size}));catalog.items=items;
    if(items.length<5)throw new Error(key+' underfilled after requalification');
  }
  data.at=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(data,null,2));
  const vimeo=JSON.parse(fs.readFileSync(path.join(root,'artifacts/vimeo-public-playback-canary.json'),'utf8'));
  fs.writeFileSync(path.join(root,'artifacts/vimeo-ok-combined-canary.json'),JSON.stringify({...data,catalogs:{...vimeo.catalogs,...data.catalogs}}));
})().catch(error=>{console.error(error.message);process.exitCode=1});
