const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const server = http.createServer((req,res)=>{
  const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(target,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',target.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/the_dial_desktop.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof tuneNum==='function');
  const rows=[];
  for(const num of (process.argv[2]||'153,53,81,10,900,555').split(',').map(Number)){
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>typeof tuneNum==='function');
   const row=await page.evaluate(async num=>{
    powered=true;document.body.classList.add('atv-powered');
    const began=performance.now();void tuneNum(num);
    let frame=null;
    for(let i=0;i<100;i++){
     await new Promise(r=>setTimeout(r,200));
     const v=document.querySelector('#screenArea video');
     if(v&&v.videoWidth>0&&v.currentTime>0&&!v.paused&&getComputedStyle(v).opacity!=='0'){frame=Math.round(performance.now()-began);break;}
    }
    const ch=byNum(num),v=curVideo;
    const result={channel:num,name:ch&&ch.nm,visibleStartMs:frame,media:v?{time:v.currentTime,width:v.videoWidth||0,paused:v.paused}:null,queue:(iaProgramQueues[String(num)]||[]).length,sourceCatalog:(v2PreviewState[num]||{}).items?.length||0};
    const before=performance.now();openGuide();closeGuide();result.guideMs=Math.round(performance.now()-before);
    if(ch&&!ch.source){const my=++token;adQueue=0;adsOn=true;const started=performance.now();result.adStarted=await playAdBreak(ch,slotFor(ch,0),my);result.adMs=Math.round(performance.now()-started);result.adTitle=curItem&&curItem.title;
     result.adDecoded=false;
     if(result.adStarted)for(let i=0;i<50;i++){
      await new Promise(r=>setTimeout(r,200));
      if(curItem&&curItem.title===result.adTitle&&curVideo&&!curVideo.paused&&curVideo.currentTime>0&&(ch.audio||curVideo.videoWidth>0)){result.adDecoded=true;break;}
     }
     result.adVideoWidth=curVideo&&curVideo.videoWidth||0;
    }
    return result;
   },num);
   rows.push(row);console.log(JSON.stringify(row));
  }
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
