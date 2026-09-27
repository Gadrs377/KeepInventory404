import {chromium} from '../experiments/ocr/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const photos=JSON.parse(await readFile('tests/photos-baseline.json'));
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const photo of photos){
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const result=await page.evaluate(async photo=>{
   const {readExpiryWithCamera}=await import('/js/views/expiryCam.js');
   const img=new Image();img.src='/tests/private/'+photo.file;await img.decode();
   const [x,y,w,h]=photo.region,c=document.createElement('canvas');c.width=Math.round(img.width*w);c.height=Math.round(img.height*h);
   const ctx=c.getContext('2d'),draw=()=>ctx.drawImage(img,img.width*x,img.height*y,img.width*w,img.height*h,0,0,c.width,c.height);draw();
   const style=document.createElement('style');style.textContent=`.viewfinder{width:600px;height:${600*c.height/c.width}px}`;document.head.append(style);
   const stream=c.captureStream(15),timer=setInterval(draw,66);navigator.mediaDevices.getUserMedia=async()=>stream;
   let evidence=null;const start=performance.now(),task=readExpiryWithCamera(document.querySelector('#host'),{onEvidence:e=>{evidence=e;}});
   const timeout=setTimeout(()=>task.stop(),30000);
   const accepted=await task;clearTimeout(timeout);clearInterval(timer);
   let evidenceSize=null;
   if(evidence){const preview=new Image();preview.src=evidence.image;await preview.decode();evidenceSize=[preview.width,preview.height];}
   return {accepted,ms:Math.round(performance.now()-start),evidence:!!evidence,monthOnly:evidence?.monthOnly,evidenceSize,stopped:stream.getTracks().every(t=>t.readyState==='ended')};
  },photo);
  assert.equal(result.stopped,true);assert.deepEqual(errors,[]);
  if(result.accepted){assert.equal(result.accepted,photo.expected,photo.file);assert.equal(result.evidence,true);assert.equal(result.monthOnly,true);}
  results.push({file:photo.file,expected:photo.expected,...result});
  await writeFile('tests/photo-camera-results.json',JSON.stringify(results,null,2));
  console.log(photo.file.slice(0,12),JSON.stringify(result));
  await page.close();
 }
}finally{await browser.close();}
