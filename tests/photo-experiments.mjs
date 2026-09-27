import {chromium} from '../experiments/ocr/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {findExpiryCandidates} from '../js/dates.js';
import {textRows} from '../js/ocrLayout.js';
const baseline=JSON.parse(await readFile('tests/photos-baseline.json'));
const browser=await chromium.launch({headless:true});
const report=[];
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
 for(const photo of baseline){
  const revised=photo.results.map(r=>({...r,candidates:findExpiryCandidates(r.text,'2026-09-27'),spatial:r.items?findExpiryCandidates(textRows(r.items).map(r=>r.text).join('\n'),'2026-09-27'):[]}));
  const extra=await page.evaluate(async(photo)=>{
   const {prepareFrame,readResult}=await import('/js/ocr.js');
   const {createPaddleReader}=await import('/js/paddleOcr.js');
   const {findExpiryCandidates}=await import('/js/dates.js');
   const {textRows}=await import('/js/ocrLayout.js');
   const img=new Image();img.src='/tests/private/'+photo.file;await img.decode();
   const paddle=createPaddleReader(),results=[];
   // Automatic detector crops: no manually specified validity line.
   const full=prepareFrame(img,{mode:'raw',box:{x:0,y:0,w:1,h:1}});
   const detection=photo.results.find(r=>r.engine==='paddle'&&r.scope==='full'&&r.mode==='raw');
   for(const [index,row] of textRows(detection.items).entries()){
    if(!/\d/.test(row.text))continue;
    const pad=Math.max(8,row.h*.15),box={x:Math.max(0,(row.x-pad)/full.width),y:Math.max(0,(row.y-pad)/full.height),w:(row.w+2*pad)/full.width,h:(row.h+2*pad)/full.height};
    // Map detector coordinates back to original image, avoiding upscaling the thumbnail.
    for(const mode of ['raw','gray','otsu','sauvola','adaptive']){
     const c=prepareFrame(img,{mode,box,width:1000,blur:0});
     const start=performance.now(),r=await readResult(c,{psm:7});
     results.push({kind:'detector-crop',index,detectorText:row.text,mode,...r,ms:Math.round(performance.now()-start),candidates:findExpiryCandidates(r.text,'2026-09-27')});
    }
   }
   // Extra low-contrast experiments on the same manually framed area as baseline.
   const [x,y,w,h]=photo.region;
   for(const mode of ['red','green','blue','contrast','localContrast']){
    const c=prepareFrame(img,{mode:'raw',box:{x,y,w,h},width:900});
    const ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height),p=data.data;
    const gray=new Float32Array(c.width*c.height);
    for(let i=0;i<gray.length;i++)gray[i]=mode==='red'?p[i*4]:mode==='green'?p[i*4+1]:mode==='blue'?p[i*4+2]:.299*p[i*4]+.587*p[i*4+1]+.114*p[i*4+2];
    if(mode==='localContrast'){
     const stride=c.width+1,sum=new Float64Array(stride*(c.height+1));
     for(let y=1;y<=c.height;y++){let row=0;for(let x=1;x<=c.width;x++){row+=gray[(y-1)*c.width+x-1];sum[y*stride+x]=sum[(y-1)*stride+x]+row;}}
     for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
      const a=Math.max(0,x-30),b=Math.min(c.width,x+31),d=Math.max(0,y-30),e=Math.min(c.height,y+31);
      const mean=(sum[e*stride+b]-sum[d*stride+b]-sum[e*stride+a]+sum[d*stride+a])/((b-a)*(e-d));
      gray[y*c.width+x]=Math.max(0,Math.min(255,127+4*(gray[y*c.width+x]-mean)));
     }
    }
    const sorted=Float32Array.from(gray).sort(),lo=sorted[Math.floor(sorted.length*.01)],hi=sorted[Math.floor(sorted.length*.99)];
    for(let i=0;i<gray.length;i++){const v=255*(gray[i]-lo)/Math.max(1,hi-lo);p[i*4]=p[i*4+1]=p[i*4+2]=v;}
    ctx.putImageData(data,0,0);
    for(const engine of ['tesseract','paddle']){
     const start=performance.now(),r=engine==='paddle'?await paddle.read(c):await readResult(c,{psm:6});
     const text=r.items?textRows(r.items).map(r=>r.text).join('\n'):r.text;
     results.push({kind:'contrast',mode,engine,...r,ms:Math.round(performance.now()-start),candidates:findExpiryCandidates(text,'2026-09-27')});
    }
   }
   paddle.dispose();return results;
  },photo);
  report.push({file:photo.file,expected:photo.expected,revised,extra});
  await writeFile('tests/photos-experiments.json',JSON.stringify(report,null,2));
  console.log(photo.file.slice(0,12),'parser',revised.filter(r=>r.candidates.some(c=>c.iso===photo.expected)).length,'spatial',revised.filter(r=>r.spatial.some(c=>c.iso===photo.expected)).length,'extra',extra.filter(r=>r.candidates.some(c=>c.iso===photo.expected)).length);
 }
}finally{await browser.close();}
