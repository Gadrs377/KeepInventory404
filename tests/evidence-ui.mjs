// Tests confirmation rendering separately from OCR (scanner deliberately stubbed).
import {chromium} from '../experiments/ocr/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/js/views/expiryCam.js',route=>route.fulfill({contentType:'text/javascript',body:`
 export function readExpiryWithCamera(host,{onEvidence}){
  const c=document.createElement('canvas');c.width=640;c.height=200;const ctx=c.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,640,200);ctx.fillStyle='#111';ctx.font='50px sans-serif';ctx.fillText('V 06/27',40,100);
  const task=Promise.resolve().then(()=>{onEvidence({image:c.toDataURL(),monthOnly:true,raw:'06/27'});return '2027-06-30';});task.stop=()=>{};return task;
 }`}));
 await page.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
 await page.addStyleTag({url:'/css/app.css'});
 await page.evaluate(()=>{const root=document.createElement('div');root.id='sheet-root';document.body.append(root);});
 await page.evaluate(async()=>{const {expirySheet}=await import('/js/views/expiryLots.js');window.result=expirySheet({free:1});});
 await page.locator('.exp-evidence img').waitFor();
 await page.evaluate(()=>document.getAnimations().forEach(animation=>animation.finish()));
 assert.match(await page.locator('.exp-evidence figcaption').innerText(),/último dia do mês/);
 const box=await page.locator('.exp-evidence img').boundingBox();assert.ok(box.width<=390&&box.height<=180);
 await page.screenshot({path:'tests/private/evidence-ui.png'});
 await page.locator('[data-done]').click();
 assert.deepEqual(await page.evaluate(()=>window.result),[{expiresAt:'2027-06-30',qty:1}]);
 console.log('Confirmation image, month precision, mobile width and save: OK');
}finally{await browser.close();}
