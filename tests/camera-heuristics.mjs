// Exploratory heuristics, deliberately not enabled in the production camera.
import {chromium} from '../experiments/ocr/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {mediaUrl} from './media.mjs';
const photos=JSON.parse(await readFile('tests/photos-baseline.json')).map(p=>({...p,url:mediaUrl(p.file)}));
const revised=JSON.parse(await readFile('tests/photos-experiments.json'));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
 const result=await page.evaluate(async photos=>{
  const signatures=[],sharpness=[],motion=[];
  function analyze(c){
   const small=document.createElement('canvas');small.width=160;small.height=80;
   small.getContext('2d').drawImage(c,0,0,160,80);
   const p=small.getContext('2d').getImageData(0,0,160,80).data,g=new Float32Array(12800);
   for(let i=0;i<g.length;i++)g[i]=.299*p[i*4]+.587*p[i*4+1]+.114*p[i*4+2];
   let s=0,sq=0,n=0;
   for(let y=1;y<79;y++)for(let x=1;x<159;x++){const i=y*160+x,v=4*g[i]-g[i-1]-g[i+1]-g[i-160]-g[i+160];s+=v;sq+=v*v;n++;}
   const thumb=document.createElement('canvas');thumb.width=32;thumb.height=16;thumb.getContext('2d').drawImage(c,0,0,32,16);
   return {sharp:sq/n-(s/n)**2,signature:[...thumb.getContext('2d').getImageData(0,0,32,16).data].filter((_,i)=>i%4!==3)};
  }
  const difference=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length/255;
  for(const photo of photos){
   const img=new Image();img.src=photo.url;await img.decode();
   const [x,y,w,h]=photo.region,source=document.createElement('canvas');source.width=600;source.height=Math.round(600*img.height*h/(img.width*w));
   source.getContext('2d').drawImage(img,x*img.width,y*img.height,w*img.width,h*img.height,0,0,source.width,source.height);
   const variants=[];
   for(const blur of [0,2,5,9]){
    const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.filter=`blur(${blur}px)`;ctx.drawImage(source,0,0);
    variants.push({blur,...analyze(c)});
   }
   signatures.push(variants[0].signature);
   sharpness.push({file:photo.file,values:variants.map(v=>({blur:v.blur,score:v.sharp})),selectedBlur:variants.toSorted((a,b)=>b.sharp-a.sharp)[0].blur});
   const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);ctx.drawImage(source,0,0,source.width,source.height,18,0,source.width,source.height);
   motion.push({file:photo.file,shiftFraction:.03,difference:difference(variants[0].signature,analyze(c).signature)});
  }
  const transitions=[];for(let i=0;i<signatures.length;i++)for(let j=i+1;j<signatures.length;j++)transitions.push({from:i+1,to:j+1,difference:difference(signatures[i],signatures[j]),detected:difference(signatures[i],signatures[j])>.15});
  return {sharpness,motion,transitions,sceneThreshold:.15};
 },photos);
 let preferred=null;
 result.scheduling=revised.map(photo=>{
  const rows=photo.revised.filter(r=>r.engine==='tesseract'&&r.scope==='aim');
  const qualifies=r=>r.confidence>=40&&r.candidates.length===1&&r.candidates[0].labeled;
  const fixed=rows.findIndex(qualifies);
  const ordered=preferred===null?rows:[...rows.filter(r=>r.variant===preferred),...rows.filter(r=>r.variant!==preferred)];
  const adaptive=ordered.findIndex(qualifies),win=ordered[adaptive];
  if(win)preferred=win.variant;
  return {file:photo.file,fixedAttempts:fixed<0?10:fixed+1,adaptiveAttempts:adaptive<0?10:adaptive+1,preferred,correct:!win||win.candidates[0].iso===photo.expected};
 });
 await writeFile('tests/camera-heuristics-results.json',JSON.stringify(result,null,2));
 console.log('Sharpest unblurred:',result.sharpness.filter(r=>r.selectedBlur===0).length+'/6');
 console.log('Detected package changes:',result.transitions.filter(r=>r.detected).length+'/15');
 console.log('Scheduling:',result.scheduling.map(r=>[r.fixedAttempts,r.adaptiveAttempts]));
}finally{await browser.close();}
