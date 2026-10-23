/* Read-only public feed/media probe. Bounded samples are not provider certification. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'the_dial_desktop.html'),'utf8');
const scope={URL,URLSearchParams,console,Date,window:{},store:{get:(k,v)=>v,set(){}},v2Hash:x=>x};
vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(root,'assets/fast-catalog.js'),'utf8'),scope);
vm.runInContext(html.slice(html.indexOf('function streamProxyList('),html.indexOf('function ensureTVCSS(')),scope);
const extra=[['Tablo','https://www.apsattv.com/tablo.m3u'],['Fire TV','https://www.apsattv.com/firetv.m3u']];
const wanted=String(process.env.FAST_PROBE_PROVIDERS||'').split(',').filter(Boolean);
const feeds=[...scope.FAST_FEEDS,...extra.filter(x=>!scope.FAST_FEEDS.some(y=>x[0]===y[0]))].filter(x=>!wanted.length||wanted.includes(x[0]));
const limit=Number(process.env.FAST_PROBE_SAMPLES||2),results=[];
async function text(url){const r=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('HTTP '+r.status);return {body:await r.text(),url:r.url};}
scope.fetchM3UTextBounded=async url=>(await text(url)).body;scope.nlog=()=>{};
async function media(url,depth=0){
 const r=await fetch(url,{signal:AbortSignal.timeout(8000)});
 if(!r.ok){await r.body?.cancel();throw Error('HTTP '+r.status);}
 const body=await r.text();if(!/^\s*#EXTM3U/.test(body))throw Error('not HLS');
 if(/#EXT-X-(?:SESSION-)?KEY:[^\n]*METHOD=(?:SAMPLE-AES|SAMPLE-AES-CTR)/.test(body))throw Error('protected HLS');
 const child=body.split(/\r?\n/).find(x=>x.trim()&&!x.startsWith('#'));
 if(!child)throw Error('empty HLS');
 const next=new URL(child.trim(),r.url).href;
 if(body.includes('#EXT-X-STREAM-INF')){if(depth>=3)throw Error('nested HLS limit');return media(next,depth+1);}
 const segment=await fetch(next,{signal:AbortSignal.timeout(8000)});
 if(!segment.ok){await segment.body?.cancel();throw Error('segment HTTP '+segment.status);}
 const reader=segment.body.getReader(),first=await reader.read();await reader.cancel();
 if(!first.value?.length)throw Error('empty segment');
 const type=segment.headers.get('content-type')||'',prefix=new TextDecoder().decode(first.value.slice(0,80));
 if(/text\/html|application\/(?:json|vnd.apple.mpegurl|x-mpegurl)/i.test(type)||/^\s*(?:<!doctype|<html|\{|#EXTM3U)/i.test(prefix))throw Error('segment is not media: '+type);
 if(!/video|audio|octet-stream/i.test(type))throw Error('unrecognized media type: '+type);
 return {hls:true,segment:true,bytes:first.value.length,type,host:new URL(next).hostname};
}
await scope.fastMapLimit(feeds,2,async feed=>{
 const row={provider:feed[0],feed:feed[1],samples:[]};
 try{
  const items=await scope.fetchM3USource(feed[0],feed[1]);row.entries=items.length;
  if(!items.length)throw Error('no admitted catalog rows');
  const picks=items.filter(c=>!scope.looksNonEnglish(c.name)&&(!process.env.FAST_PROBE_REGION||c.cat===process.env.FAST_PROBE_REGION)).slice(0,limit);
  for(const item of picks){
   item.src=feed[0];const sample={name:item.name,routes:[]};
   for(const proxy of scope.tvPlaybackProxies(item)){
    const at=Date.now(),route={proxy:proxy?new URL(proxy).hostname:'direct'};
    try{Object.assign(route,await media(scope.proxiedVia(proxy,item.url,{ua:item.ua,ref:item.ref})));}catch(e){route.error=e.message;}
    route.ms=Date.now()-at;sample.routes.push(route);if(route.segment)break;
   }
   row.samples.push(sample);
  }
 }catch(e){row.error=e.message;}
 results.push(row);console.log(JSON.stringify(row));return [];
});
const out=process.argv[2];if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),sampleLimit:limit,results},null,2));}
console.log(JSON.stringify({feeds:results.length,withPassingSample:results.filter(x=>x.samples.some(s=>s.routes.some(r=>r.segment))).length,unproven:results.filter(x=>!x.samples.some(s=>s.routes.some(r=>r.segment))).map(x=>x.provider)}));
