// Mede os vídeos reais de tests/real contra as duas camadas do Paddle e o fluxo
// completo da câmera. Não é um teste de passa/falha de precisão: a única regra
// é nunca confirmar sozinho uma data diferente da referência.
// Servidor na porta 8765 (ver docs/LEITURA_VALIDADE.md). Resultado em
// tests/real-video-results.json.
import { chromium } from '../experiments/ocr/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const items = JSON.parse(await readFile('tests/real/manifest.json')).filter((m) => m.kind === 'video');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const item of items) {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8765/tests/ocr-fixture.html');
    const frames = await page.evaluate(async ({ file, region }) => {
      const v = document.createElement('video');
      v.src = `/tests/real/${file}`; v.muted = true; v.playsInline = true;
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
      await v.play();
      const [rx, ry, rw, rh] = region;
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * rw); c.height = Math.round(v.videoHeight * rh);
      const out = []; let last = -1; let next = 0;
      // Este encode não é "seekable": toca e amostra a cada meio segundo.
      while (!v.ended) {
        if (v.currentTime === last) { await new Promise((r) => setTimeout(r, 20)); continue; }
        last = v.currentTime;
        if (last < next) continue;
        next = last + 0.5;
        c.getContext('2d').drawImage(v, v.videoWidth * rx, v.videoHeight * ry, v.videoWidth * rw, v.videoHeight * rh, 0, 0, c.width, c.height);
        out.push({ t: Math.round(last * 100) / 100, image: c.toDataURL('image/png') });
      }
      return out;
    }, item);

    const tiers = {};
    for (const tier of ['small', 'medium']) {
      tiers[tier] = await page.evaluate(async ({ tier, frames, reference }) => {
        const { createPaddleReader } = await import('/js/paddleOcr.js');
        const { findExpiryCandidates } = await import('/js/dates.js');
        const reader = createPaddleReader(tier);
        await reader.ready();
        const reads = []; let ms = 0;
        for (const f of frames) {
          const img = new Image(); img.src = f.image; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          const t0 = performance.now(); const r = await reader.read(c); ms += performance.now() - t0;
          const dates = findExpiryCandidates(r.text, '2026-09-27').map((d) => d.iso);
          reads.push({ t: f.t, text: r.text.replace(/\n/g, ' | '), dates });
        }
        reader.dispose();
        const withText = reads.filter((r) => r.text);
        return {
          frames: reads.length,
          framesWithText: withText.length,
          // Fragmento com cara de data (29/DEZ, 29/1…): sinal de que o motor
          // começou a enxergar a linha da data, mesmo sem ler inteira.
          framesWithDateFragment: withText.filter((r) => /\d{2}\s*[/.-]\s*(\d|[A-Z]{3})/i.test(r.text)).length,
          readsOfReference: reads.filter((r) => r.dates.includes(reference.val)).length,
          wrongDates: [...new Set(reads.flatMap((r) => r.dates).filter((d) => d !== reference.val))],
          msPerFrame: Math.round(ms / reads.length),
          reads: withText,
        };
      }, { tier, frames, reference: item.reference });
    }

    const flow = await page.evaluate(async ({ file, region }) => {
      const { readExpiryWithCamera } = await import('/js/views/expiryCam.js');
      const v = document.createElement('video');
      v.src = `/tests/real/${file}`; v.muted = true; v.loop = true; v.playsInline = true;
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
      await v.play();
      const [rx, ry, rw, rh] = region;
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * rw); c.height = Math.round(v.videoHeight * rh);
      const draw = () => c.getContext('2d').drawImage(v, v.videoWidth * rx, v.videoHeight * ry, v.videoWidth * rw, v.videoHeight * rh, 0, 0, c.width, c.height);
      draw();
      const style = document.createElement('style');
      style.textContent = `.viewfinder{width:600px;height:${Math.round(600 * c.height / c.width)}px}`;
      document.head.append(style);
      const stream = c.captureStream(15); const timer = setInterval(draw, 66);
      navigator.mediaDevices.getUserMedia = async () => stream;
      let hard = false; let photo = false;
      const start = performance.now();
      const task = readExpiryWithCamera(document.querySelector('#host'), { onHard: () => { hard = true; }, onBestPhoto: () => { photo = true; } });
      const timeout = setTimeout(() => task.stop(), 90000);
      const accepted = await task; clearTimeout(timeout); clearInterval(timer);
      return { accepted, ms: Math.round(performance.now() - start), suggestedTyping: hard, hadPhotoForTyping: photo };
    }, item);

    assert.ok(flow.accepted === null || flow.accepted === item.reference.val, `${item.file}: confirmou data errada ${flow.accepted}`);
    results.push({ file: item.file, reference: item.reference, tiers, flow });
    console.log(item.file);
    for (const [tier, r] of Object.entries(tiers)) console.log(`  ${tier}: ${r.framesWithText}/${r.frames} quadros com texto, ${r.framesWithDateFragment} com fragmento de data, ${r.readsOfReference} leram a validade, ${r.msPerFrame} ms/quadro, datas erradas: ${r.wrongDates.join(', ') || 'nenhuma'}`);
    console.log(`  fluxo completo: ${flow.accepted ? `confirmou ${flow.accepted}` : 'não confirmou'} em ${(flow.ms / 1000).toFixed(0)} s; sugeriu digitar: ${flow.suggestedTyping}; tinha foto para mostrar: ${flow.hadPhotoForTyping}`);
    await page.close();
  }
} finally {
  await writeFile('tests/real-video-results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
