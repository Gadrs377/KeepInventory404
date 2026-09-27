import {chromium} from '../experiments/ocr/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const fixtures=[
 ['0A69', '2028-05-31', [.14,.23,.63,.38]],
 ['6E3D', '2027-02-28', [.18,.37,.53,.24]],
 ['AE3B', '2028-04-30', [.27,.26,.6,.31]],
 ['55A0', '2028-07-31', [.16,.24,.8,.21]],
 ['9B7E', '2028-03-31', [.29,.33,.44,.25]],
 ['D8D3', '2027-06-30', [.14,.36,.76,.25]],
];
const {readdir}=await import('node:fs/promises');
const files=await readdir('tests/private');
const browser=await chromium.launch({headless:true});
const rows=[];
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
 for(const [prefix,expected,region] of fixtures){
  const file=files.find(f=>f.startsWith('IMG_'+prefix));
  const row=await page.evaluate(async({file,expected,region})=>{
   const {prepareFrame,readResult}=await import('/js/ocr.js');
   const {TESSERACT_VARIANTS}=await import('/js/expiryRecognition.js');
   const {findExpiryCandidates}=await import('/js/dates.js');
   const {createPaddleReader}=await import('/js/paddleOcr.js');
   const img=new Image();img.src='/tests/private/'+file;await img.decode();
   const results=[];const paddle=createPaddleReader();
   for(const scope of ['full','aim']){
    const [x,y,w,h]=scope==='full'?[0,0,1,1]:region;
    const box={x,y,w,h};
    for(let i=0;i<TESSERACT_VARIANTS.length;i++){
     const variant=TESSERACT_VARIANTS[i],canvas=prepareFrame(img,{...variant,box});
     const start=performance.now(),r=await readResult(canvas,variant);
     results.push({scope,engine:'tesseract',variant:i,...r,ms:Math.round(performance.now()-start),candidates:findExpiryCandidates(r.text,'2026-09-27')});
    }
    for(const mode of ['raw','gray','otsu','sauvola','adaptive']){
     const canvas=prepareFrame(img,{box,mode,blur:0,width:1000});
     const start=performance.now(),r=await paddle.read(canvas);
     results.push({scope,engine:'paddle',mode,...r,ms:Math.round(performance.now()-start),candidates:findExpiryCandidates(r.text,'2026-09-27')});
    }
   }
   paddle.dispose();return {file,expected,region,results};
  },{file,expected,region});
  rows.push(row);await writeFile(process.env.PHOTO_RESULTS || 'tests/photos-current.json',JSON.stringify(rows,null,2));
  console.log(prefix, row.results.filter(r=>r.candidates.some(c=>c.iso===expected)).length+'/30 correct candidates');
 }
}finally{await browser.close();}
