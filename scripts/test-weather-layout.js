#!/usr/bin/env node
"use strict";

// Optional real-provider check; deterministic fixtures run in ci/test_regression.py.
const { chromium } = require("playwright");
const base=(process.env.ATV_TEST_URL||"http://127.0.0.1:4176").replace(/\/+$/,"");
const chrome=process.env.CHROME_PATH||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
function check(ok,message){if(!ok)throw Error(message);}
async function inspectWeather(page,label,source){
  await page.locator('#wxScreen').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('.wxl-day').length>=7,null,{timeout:40000});
  const update=await page.locator('#wxUpd').innerText();
  check(!source||update.includes(source),label+': wrong fallback source: '+update);
  await page.locator('[data-wx-panel="week"]').click();
  const forecast=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-innerWidth,
    days:[...document.querySelectorAll('.wxl-day')].map(e=>({name:e.querySelector('h4').textContent,width:e.clientWidth,clipped:e.scrollHeight>e.clientHeight+2,icon:!!e.querySelector('.wx-pixel-art')}))
  }));
  check(forecast.days.length===7&&forecast.days.every(d=>d.width>100&&!d.clipped&&d.icon),label+': seven readable animated day cards required');
  check(forecast.overflow<=1,label+': page has horizontal overflow');
  await page.locator('.wxl-day').last().scrollIntoViewIfNeeded();
  check(await page.locator('.wxl-day').last().isVisible(),label+': final day unreachable');
  await page.locator('[data-wx-panel="hourly"]').click();
  check(await page.locator('.wxl-hour').count()>=6,label+': hourly feed missing');
  await page.locator('[data-wx-panel="radar"]').click();
  await page.locator('[data-wx-radar="local"]').click();
  await page.locator('#rsV6Next').click();
  check(await page.locator('[data-wx-radar="regional"]').getAttribute('aria-pressed')==='true',label+': Next must advance local to regional radar');
  check(await page.locator('#wxRadar').evaluate(e=>getComputedStyle(e).objectFit==='contain'),label+': radar must preserve complete geography');
  if(source==='OPEN-METEO')check((await page.locator('#wxTicker').innerText()).includes('unavailable'),label+': NWS outage must not claim no alerts');
  console.log(label+': seven days, hourly, full map and Next passed | '+update);
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:chrome});
  try{
    for(const test of [
      {label:'desktop',file:'the_dial_desktop.html',viewport:{width:1440,height:900}},
      {label:'compact desktop',file:'the_dial_desktop.html',viewport:{width:390,height:844}},
      {label:'mobile',file:'the_dial_mobile.html',viewport:{width:430,height:900}},
      {label:'NWS outage fallback',file:'the_dial_desktop.html',viewport:{width:1440,height:900},source:'OPEN-METEO'}
    ]){
      const context=await browser.newContext({viewport:test.viewport}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      if(test.source)await page.route('https://api.weather.gov/**',r=>r.abort('failed'));
      await page.goto(base+'/'+test.file+'?weather-layout-test=1&telemetry=0',{waitUntil:'domcontentloaded'});
      await page.locator('#rsV6Power').click();
      await page.locator('#rsV6Guide').click();
      const category=page.getByRole('combobox',{name:'Category',exact:true});
      if(await category.isVisible())await category.selectOption({label:'Live channels'});
      else await page.getByRole('button',{name:'Live channels',exact:true}).click();
      await page.locator('#rsV6GuideRow-950').click();
      await page.locator('#rsV6GuideWatch').click();
      await inspectWeather(page,test.label,test.source);
      check(!errors.length,test.label+': '+errors.join(' | '));
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
