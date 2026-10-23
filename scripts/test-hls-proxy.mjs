import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../hls_proxy_worker.js',import.meta.url),'utf8');
function worker(fetch){const scope={URL,Headers,Request,Response,fetch};vm.createContext(scope);vm.runInContext(source.replace('export default {','globalThis.worker = {'),scope);return scope.worker;}
test('Roku relative playlists are resolved against the final allowed CDN, not jmp2.uk',async()=>{
 const visited=[];
 const relay=worker(async url=>{visited.push(url);return url.includes('jmp2.uk')?new Response(null,{status:302,headers:{location:'https://aka-live1050.delivery.roku.com/live/master.m3u8'}}):new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000\nlow.m3u8\n',{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});});
 const response=await relay.fetch(new Request('https://relay.example/?url='+encodeURIComponent('https://jmp2.uk/roku-sports.m3u8')));
 assert.equal(response.status,200);const playlist=await response.text();
 const child=new URL(playlist.split('\n').find(x=>x.startsWith('https://')));
 assert.equal(child.searchParams.get('url'),'https://aka-live1050.delivery.roku.com/live/low.m3u8');assert.equal(visited.length,2);
});
test('unapproved origins and redirected private targets remain blocked',async()=>{
 let count=0;const relay=worker(async()=>{count++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});});
 assert.equal((await relay.fetch(new Request('https://relay.example/?url=https://untrusted.example/a.m3u8'))).status,403);
 assert.equal(count,0);
 assert.equal((await relay.fetch(new Request('https://relay.example/?url=https://jmp2.uk/a.m3u8'))).status,502);assert.equal(count,1);
});
test('keys stay binary and video segments remain streamed',async()=>{
 const bytes=new Uint8Array([0,255,2,3]);const relay=worker(async()=>new Response(bytes,{headers:{'content-type':'application/vnd.apple.mpegurl'}}));
 const key=await relay.fetch(new Request('https://relay.example/?url=https://media.pluto.tv/a.key'));
 assert.equal(key.headers.get('content-type'),'application/octet-stream');assert.deepEqual(new Uint8Array(await key.arrayBuffer()),bytes);
});
