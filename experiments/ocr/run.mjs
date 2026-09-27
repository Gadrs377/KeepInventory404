import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  const externalRequests=[];
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(!['127.0.0.1','localhost'].includes(url.hostname)){
      externalRequests.push(url.href);return route.abort();
    }
    return route.continue();
  });
  page.on('console',msg=>console.log(msg.type(),msg.text()));
  page.on('pageerror',e=>console.error('PAGE_ERROR',e));
  page.on('requestfailed',r=>console.error('REQUEST_FAILED',r.url(),r.failure()));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(()=>!!window.ocrExperiment,{},{timeout:60000});
  const result=await page.evaluate(()=>window.ocrExperiment.run());
  result.externalRequestsBlocked=externalRequests;
  await writeFile('results.local.json',JSON.stringify(result,null,2));
  console.log('SUMMARY',JSON.stringify(result.summary));
} finally {await browser.close();}
