import { chromium } from '../experiments/ocr/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
  const result=await page.evaluate(async()=>{
    const {fixtures,renderFixture}=await import('/experiments/ocr/fixtures.js');
    const {prepareFrame,readResult,releaseOcr}=await import('/js/ocr.js');
    const {findExpiryCandidates}=await import('/js/dates.js');
    const {TESSERACT_VARIANTS,createExpiryConsensus}=await import('/js/expiryRecognition.js');
    const {createPaddleReader}=await import('/js/paddleOcr.js');
    const paddle=createPaddleReader();
    // Exercise the real packaged module worker (not the experimental SDK).
    const raw=renderFixture(fixtures().find(f=>f.id==='shadow'));
    const paddleResult=await paddle.read(raw);
    paddle.dispose();
    const rows=[];
    for(const fixture of fixtures()) {
      const canvas=renderFixture(fixture);const c=createExpiryConsensus();
      let accepted=null;const attempts=[];
      for(let i=0;i<TESSERACT_VARIANTS.length&&!accepted;i++){
        const v=TESSERACT_VARIANTS[i];const input=prepareFrame(canvas,{...v,box:{x:0,y:0,w:1,h:1}});
        const output=await readResult(input,v);const candidates=findExpiryCandidates(output.text,'2026-09-27');
        attempts.push({mode:v.mode,psm:v.psm,text:output.text,confidence:output.confidence});
        accepted=c.add({candidates,engine:'tesseract',confidence:output.confidence,frame:i,at:performance.now()});
      }
      rows.push({id:fixture.id,expected:fixture.expected,accepted,attempts});
    }
    releaseOcr();
    return {paddleText:paddleResult.text,rows};
  });
  assert.match(result.paddleText,/15\/10\/2026/);
  for(const row of result.rows) if(row.accepted) assert.equal(row.accepted,row.expected,`Wrong auto-accept: ${row.id}`);
  await writeFile('tests/ocr-browser-results.json',JSON.stringify(result,null,2));
  console.log('Real motors:',result.rows.filter(r=>r.expected&&r.accepted===r.expected).length,'/16 positive fixtures accepted by Tesseract; no wrong accepts');

  // Full camera flow with a real video track. Close stops the track and workers.
  const camera = await page.evaluate(async()=>{
    const {renderFixture,fixtures}=await import('/experiments/ocr/fixtures.js');
    const {readExpiryWithCamera}=await import('/js/views/expiryCam.js');
    const canvas=renderFixture(fixtures()[0]);const stream=canvas.captureStream(15);
    const timer=setInterval(()=>canvas.getContext('2d').fillRect(849,239,1,1),65);
    navigator.mediaDevices.getUserMedia=async()=>stream;
    const task=readExpiryWithCamera(document.querySelector('#host'));
    const expiry=await Promise.race([task,new Promise((_,reject)=>setTimeout(()=>{task.stop();reject(new Error('Camera timeout'));},20000))]);
    clearInterval(timer);
    return {expiry,stopped:stream.getTracks().every(t=>t.readyState==='ended')};
  });
  assert.equal(camera.expiry,'2026-10-15');assert.equal(camera.stopped,true);
  // Force first-stage failure to exercise the camera's real Paddle fallback
  // and shared vote path, without requiring a particular image to defeat OCR.
  const fallbackPage=await context.newPage();
  await fallbackPage.route('**/js/ocr.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export {prepareFrame} from './ocrImage.js';
    export async function ocrWorker(){};
    export function releaseOcr(){};
    export async function readResult(){window.tessCalls=(window.tessCalls||0)+1;return {text:window.tessCalls<=6?'':'VAL 15/10/2026',confidence:90};}
  `}));
  await fallbackPage.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
  const fallback=await fallbackPage.evaluate(async()=>{
    const {renderFixture,fixtures}=await import('/experiments/ocr/fixtures.js');
    const {readExpiryWithCamera}=await import('/js/views/expiryCam.js');
    const canvas=renderFixture(fixtures()[0]);const stream=canvas.captureStream(15);
    const timer=setInterval(()=>canvas.getContext('2d').fillRect(849,239,1,1),65);
    navigator.mediaDevices.getUserMedia=async()=>stream;
    const task=readExpiryWithCamera(document.querySelector('#host'));
    const expiry=await Promise.race([task,new Promise((_,reject)=>setTimeout(()=>{task.stop();reject(new Error('Fallback timeout'));},30000))]);
    clearInterval(timer);
    return {expiry,calls:window.tessCalls,stopped:stream.getTracks().every(t=>t.readyState==='ended')};
  });
  assert.equal(fallback.expiry,'2026-10-15');assert.equal(fallback.calls,7);assert.equal(fallback.stopped,true);
  await fallbackPage.close();
  // The server's SW caches the optional assets only when requested.
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
  await page.evaluate(async()=>{
    const {createPaddleReader}=await import('/js/paddleOcr.js');
    const {renderFixture,fixtures}=await import('/experiments/ocr/fixtures.js');
    const p=createPaddleReader();await p.read(renderFixture(fixtures()[0]));p.dispose();
  });
  await context.setOffline(true);
  const offline = await page.evaluate(async()=>{
    const {createPaddleReader}=await import('/js/paddleOcr.js');
    const {renderFixture,fixtures}=await import('/experiments/ocr/fixtures.js');
    const p=createPaddleReader();try{return (await p.read(renderFixture(fixtures()[0]))).text;}finally{p.dispose();}
  });
  assert.match(offline,/15\/10\/2026/);
  assert.deepEqual(errors,[]);
  console.log('Camera confirmation, combined-engine fallback, track cleanup and fresh Paddle worker offline: OK');
} finally {await browser.close();}
