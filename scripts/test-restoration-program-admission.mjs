import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {qualifySourceItem,sourceProfile} from '../realsignal_source_catalog.js';
import {catalogFallbackAllowed} from '../realsignal_api_v2_worker.js';
const require=createRequire(import.meta.url),policy=require('../assets/source-program-policy.js');
const item=(title,extra={})=>({id:'yt:abcdefghijk',title,description:'A full restoration documentary.',provider:'YouTube',duration:1800,aspectRatio:16/9,language:'en',type:'embed',url:'https://www.youtube-nocookie.com/embed/abcdefghijk',...extra});
for(const title of ['Free software game restoration II','BOY WITH A BLINDFOLD 1950s EYE BANK FOR SIGHT RESTORATION ORGAN DONATION AWARENESS FILM','MSP-Maastricht: Sublimestone: A Dual Microbial System for the Restoration of Limestone (2023) - Team Presentation [English]','Building of New Church - Bill Voelker - home movie 1956 - restoration by AJ Video - Baltimore, MD.'])test('reject wrong restoration subject: '+title,()=>{
 const x=item(title);assert.equal(policy.allow('restoration-row',x),false);
 assert.equal(qualifySourceItem(sourceProfile({profileKey:'restoration-row'}),x),null);
 assert.equal(catalogFallbackAllowed(x,{channel:'restoration-row',sourceCatalog:true}),false);
});
test('retain varied actual restoration, repaired film, original games hardware and building conservation',()=>{
 for(const title of ['The Art of Aircraft Restoration | Full Documentary','Professional Restoration of a Moldy Watercolor Painting','Restoring a 1920s Antique Desk','Classic Car Restoration Full Episode','Rebuilding Notre-Dame: The Science Behind the Restoration | FULL DOCUMENTARY','Restoring an Arcade Game Cabinet | Full Restoration','Silent Film Restoration: The Complete Process','Restoring a Vintage Computer | Full Documentary','Restoration of an Antique Medical Cabinet']){
  const x=item(title);assert.equal(policy.allow('restoration-row',x),true,title);assert.ok(qualifySourceItem(sourceProfile({profileKey:'restoration-row'}),x),title);
  assert.equal(catalogFallbackAllowed(x,{channel:'restoration-row',sourceCatalog:true}),true,title);
 }
});
test('restoration-specific boundaries do not restrict other suites',()=>{
 assert.equal(policy.allow('science-dispatch',item('A Dual Microbial System for Limestone Restoration - Team Presentation')),true);
 assert.equal(policy.allow('restoration-row',item('Eye Bank Organ Donation Documentary',{description:'Physical furniture restoration at a hospital.'})),false);
});
