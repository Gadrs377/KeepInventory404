import { PaddleOCR } from '@paddleocr/paddleocr-js';
import { fixtures, renderFixture } from './fixtures.js';
const status = document.querySelector('#status');
const buttons = [document.querySelector('#run'), document.querySelector('#photo')];
const variants = [[1,1000],[2,700],[1,550],[3,1000],[1,450],[0,1000],[2,550],[4,1000],[1,700]];
let engines;
let report;
async function initialize() {
  if (engines) return engines;
  status.textContent = 'Carregando os dois leitores…';
  const baseURL = new URL('/baseline/js/ocr.js', location.href).href;
  const datesURL = new URL('/baseline/js/dates.js', location.href).href;
  const base = await import(/* @vite-ignore */ baseURL);
  const dates = await import(/* @vite-ignore */ datesURL);
  let start=performance.now(); await base.ocrWorker(); const tesseractInitMs=performance.now()-start;
  start=performance.now();
  const paddle=await PaddleOCR.create({
    textDetectionModelName:'PP-OCRv5_mobile_det', textRecognitionModelName:'PP-OCRv5_mobile_rec',
    textDetectionModelAsset:{url:new URL('/models/PP-OCRv5_mobile_det.tar',location.href).href},
    textRecognitionModelAsset:{url:new URL('/models/PP-OCRv5_mobile_rec.tar',location.href).href},
    worker:true, textRecognitionBatchSize:1,
    ortOptions:{backend:'wasm',numThreads:1,wasmPaths:new URL('/ort/',location.href).href,simd:true}
  });
  engines={base,dates,paddle,tesseractInitMs,paddleInitMs:performance.now()-start};
  return engines;
}
async function recognize(canvas) {
  const {base,dates,paddle}=await initialize();
  // Both engines receive the identical region; only baseline preprocessing differs.
  canvas.videoWidth=canvas.width;canvas.videoHeight=canvas.height;
  let start=performance.now(); const votes={};const passes=[]; let iso=null;
  for(const [blur,width] of variants) {
    const prepared=base.prepareFrame(canvas,{box:{x:0,y:0,w:1,h:1},blur,width});
    const text=await base.readText(prepared); const found=dates.findExpiry(text,'2026-09-27');
    passes.push({text,iso:found?.iso||null,blur,width});
    if(found){votes[found.iso]=(votes[found.iso]||0)+1;const ranked=Object.entries(votes).sort((a,b)=>b[1]-a[1]);if(ranked[0][1]>=2&&ranked[0][1]-(ranked[1]?.[1]||0)>=2){iso=ranked[0][0];break;}}
  }
  const tesseract={iso,ms:performance.now()-start,passes};
  start=performance.now();
  const rawText=await base.readText(canvas);
  const tesseractRaw={iso:dates.findExpiry(rawText,'2026-09-27')?.iso||null,ms:performance.now()-start,text:rawText};
  start=performance.now();
  const [result]=await paddle.predict(canvas,{textDetLimitSideLen:960,textDetLimitType:'max',textRecScoreThresh:0});
  const text=result.items.map(i=>i.text).join('\n');
  return {tesseract,tesseractRaw,paddle:{iso:dates.findExpiry(text,'2026-09-27')?.iso||null,ms:performance.now()-start,text,items:result.items,metrics:result.metrics}};
}
function showRow(row) {
  const tr=document.createElement('tr');
  for(const text of [row.id,row.expected===undefined?'Conferir na foto':row.expected||'Nenhuma validade',...['tesseract','tesseractRaw','paddle'].map(k=>`${row[k].iso||'Sem data'} · ${(row[k].ms/1000).toFixed(2)} s${row.expected!==undefined?(row[k].iso===row.expected?' ✓':' ✕'):''}`)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}
  document.querySelector('#rows').append(tr);
}
function summarize() {
  const known=report.rows.filter(r=>r.expected!==undefined);
  report.summary=Object.fromEntries(['tesseract','tesseractRaw','paddle'].map(k=>{
    const times=report.rows.map(r=>r[k].ms).sort((a,b)=>a-b);
    return [k,{cases:known.length,correct:known.filter(r=>r[k].iso===r.expected).length,wrongDate:known.filter(r=>r[k].iso&&r[k].iso!==r.expected).length,missed:known.filter(r=>!r[k].iso&&r.expected).length,medianMs:times.length?times[Math.floor(times.length/2)]:null}];
  }));
  document.querySelector('#summary').textContent=JSON.stringify(report.summary,null,2);
}
async function run(cases) {
  buttons.forEach(b=>b.disabled=true);document.querySelector('#export').disabled=true;
  document.querySelector('#rows').replaceChildren();
  try {
    const e=await initialize();
    report={baseCommit:'b611d76c1df2ddb313dcb12e3872d21c9bf4f10d',referenceDate:'2026-09-27',userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,crossOriginIsolated,backend:'wasm, 1 thread',tesseractInitMs:e.tesseractInitMs,paddleInitMs:e.paddleInitMs,method:'Synthetic frozen crops, baseline up to 9 variants with 2-vote acceptance; raw Tesseract control one pass; Paddle one detection/recognition pass; unchanged findExpiry for all. Not equivalent acceptance policies, live-camera or iPhone measurements. Initialization served from localhost, not internet download time.',rows:[]};
    for(const [i,c] of cases.entries()) {
      status.textContent=`Lendo ${i+1}/${cases.length}: ${c.id}`;
      const canvas=c.canvas||renderFixture(c); document.querySelector('#preview').replaceChildren(canvas);
      const row={id:c.id,...(Object.hasOwn(c,'expected')?{expected:c.expected}:{}),...await recognize(canvas)};
      report.rows.push(row);showRow(row);summarize();
      console.log('OCR_CASE',JSON.stringify(row));
    }
    status.textContent='Comparação concluída. Confira também o texto bruto nos resultados exportados.';
    document.querySelector('#export').disabled=false;
    return report;
  } finally {buttons.forEach(b=>b.disabled=false);}
}
function failed(e){status.textContent=`Não foi possível concluir: ${e.message}`;console.error(e);}
document.querySelector('#run').onclick=()=>run(fixtures()).catch(failed);
document.querySelector('#photo').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{const bitmap=await createImageBitmap(f);const canvas=document.createElement('canvas');const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();await run([{id:f.name,canvas}]);}catch(err){failed(err);}
};
document.querySelector('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='comparativo-ocr.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.ocrExperiment={run:()=>run(fixtures()),getReport:()=>report};
