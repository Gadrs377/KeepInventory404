import { chromium } from '../experiments/ocr/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
  const stopped=await page.evaluate(async()=>{
    const {createPaddleReader}=await import('/js/paddleOcr.js');
    const reader=createPaddleReader();const loading=reader.ready().then(()=>false,()=>true);
    reader.dispose();return loading;
  });
  assert.equal(stopped,true);
  await page.route('**/js/ocr.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export {prepareFrame} from './ocrImage.js';export async function ocrWorker(){};export function releaseOcr(){};
    export async function readResult(){window.calls=(window.calls||0)+1;return {text:window.calls<=6?'':'VAL 15/10/2026',confidence:90};}
  `}));
  await page.route('**/vendor/paddle/v1/worker.js',route=>route.abort());
  const outcome=await page.evaluate(async()=>{
    const {renderFixture,fixtures}=await import('/experiments/ocr/fixtures.js');
    const {readExpiryWithCamera}=await import('/js/views/expiryCam.js');
    const canvas=renderFixture(fixtures()[0]);const stream=canvas.captureStream(15);
    const timer=setInterval(()=>canvas.getContext('2d').fillRect(849,239,1,1),65);
    navigator.mediaDevices.getUserMedia=async()=>stream;
    const reading=readExpiryWithCamera(document.querySelector('#host'));
    const result=await reading;clearInterval(timer);
    // Cancel before getUserMedia resolves: the late stream must be stopped too.
    const late=canvas.captureStream(15);let respond;
    navigator.mediaDevices.getUserMedia=()=>new Promise(r=>{respond=r;});
    const pending=readExpiryWithCamera(document.querySelector('#host'));pending.stop();respond(late);
    await new Promise(r=>setTimeout(r,30));
    return {result,calls:window.calls,cancel:await pending,lateStopped:late.getTracks().every(t=>t.readyState==='ended')};
  });
  assert.equal(outcome.result,'2026-10-15');assert.equal(outcome.calls,8);
  assert.equal(outcome.cancel,null);assert.equal(outcome.lateStopped,true);
  console.log('Paddle download failure keeps Tesseract working; cancellation during initialization and late camera stream: OK');
} finally {await browser.close();}
