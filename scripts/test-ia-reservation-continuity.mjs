import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {SessionRotation} from '../realsignal_api_rotation.js';
const {rotationContext}=createRequire(import.meta.url)('./ia-storage-test-helper.js');
const item=(family,n)=>({identifier:family+'::episode-'+n+'.mp4',seriesTitle:family,title:family+' · Episode '+n,media:{url:'https://archive.org/download/'+family+'/episode-'+n+'.mp4'}});
const call=(rotation,body)=>rotation.fetch(new Request('https://rotation.internal/select',{method:'POST',body:JSON.stringify(body)}));

test('a played item evicted by a deep catalog refresh still accepts its skip acknowledgement',async()=>{
 const ctx=rotationContext(),r=new SessionRotation(ctx,{}),first=item('cartoons',0);
 await call(r,{mode:'reserve',items:[first],count:1});
 assert.equal((await call(r,{mode:'commit',id:first.identifier,event:'started'})).status,200);
 await call(r,{mode:'reserve',items:Array.from({length:1024},(_,i)=>item('deep',i)),count:3});
 const response=await call(r,{mode:'commit',id:first.identifier,event:'skipped'});
 assert.equal(response.status,200,'Next must not poison the acknowledgement outbox after a bounded catalog evicts an already played record');
 assert.equal((await call(r,{mode:'commit',id:'unknown::forged.mp4',event:'started'})).status,400,'unknown identities remain rejected');
 assert.ok(ctx.snapshot().catalog.length<=1024);
});

test('a prior version may already have evicted the playing record; no history reset is needed',async()=>{
 const first=item('cartoons',0),ctx=rotationContext({catalog:[item('other',0)],seen:[first.identifier],playing:first.identifier,reserved:[],cursor:1}),r=new SessionRotation(ctx,{});
 assert.equal((await call(r,{mode:'commit',id:first.identifier,event:'skipped'})).status,200);
 assert.equal(ctx.snapshot().playing,'');
 assert.ok(ctx.snapshot().seen.includes(first.identifier));
});

test('a late completion for an evicted episode cannot clear a newer playing episode',async()=>{
 const first=item('cartoons',0),next=item('other',0),ctx=rotationContext({catalog:[next],seen:[first.identifier,next.identifier],playing:next.identifier,reserved:[],cursor:2}),r=new SessionRotation(ctx,{});
 assert.equal((await call(r,{mode:'commit',id:first.identifier,event:'completed'})).status,200);
 assert.equal(ctx.snapshot().playing,next.identifier);
 assert.equal((await call(r,{mode:'commit',id:first.identifier,event:'started'})).status,400,'past history is not permission to start an evicted record');
 assert.equal((await call(r,{mode:'commit',id:'unknown::forged.mp4',event:'skipped'})).status,400);
});

test('terminal events clear a legacy parent alias for the selected file',async()=>{
 const first={...item('cartoons',0),identifier:'legacy-parent',sourceIdentifier:'legacy-parent',fileName:'episode-0.mp4'},ctx=rotationContext({catalog:[first],seen:['legacy-parent::episode-0.mp4'],playing:'legacy-parent',reserved:[],cursor:1}),r=new SessionRotation(ctx,{});
 assert.equal((await call(r,{mode:'commit',id:'legacy-parent',event:'completed'})).status,200);
 assert.equal(ctx.snapshot().playing,'');
 assert.equal((await (await call(r,{mode:'reserve',items:[first],count:1})).json()).items.length,1,'an exhausted singleton can start a new cycle');
});

test('returning families alternate after each has played once while fresh episodes remain',async()=>{
 const ctx=rotationContext(),r=new SessionRotation(ctx,{}),families=['Benson','Beaver','Munsters'];
 const items=families.flatMap(f=>Array.from({length:15},(_,i)=>item(f,i))),starts=[];
 for(let i=0;i<15;i++){
  const p=await (await call(r,{mode:'reserve',items,count:3,diversity:{maxPerFamily:1}})).json(),next=p.items[0];
  assert.ok(next); starts.push(next);
  await call(r,{mode:'commit',id:next.identifier,event:'started'});
  await call(r,{mode:'commit',id:next.identifier,event:'skipped'});
 }
 assert.equal(new Set(starts.map(x=>x.identifier)).size,15);
 for(let i=3;i<starts.length;i++)assert.notEqual(starts[i].seriesTitle,starts[i-1].seriesTitle,'one series must not monopolize the shelf after the first family pass');
});
