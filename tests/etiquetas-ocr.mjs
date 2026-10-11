// Lê as fotos de etiquetas de preço (tests/real/etiquetas) com o Paddle
// (pequeno e médio) e o leitor de código de barras do app, e grava o texto lido
// em tests/real/etiquetas/leitura.json. Medição, não teste: o Modo Mercado
// ainda não existe. node tests/etiquetas-ocr.mjs
import { startServer } from './ui/harness.mjs';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import('../experiments/ocr/node_modules/playwright/index.mjs');
const dir = new URL('./real/etiquetas', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => /^zaffari-\d+\.jpg$/.test(f)).sort();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`${server.url}/tests/ocr-fixture.html`);
const out = {};
for (const f of files) {
  const data = 'data:image/jpeg;base64,' + readFileSync(`${dir}/${f}`).toString('base64');
  const r = await page.evaluate(async ({ data }) => {
    const { createPaddleReader } = await import('/js/paddleOcr.js');
    const img = new Image(); img.src = data; await img.decode();
    const canvasAt = (max) => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; };
    const res = {};
    for (const tier of ['small', 'medium']) {
      const reader = createPaddleReader(tier, { readTimeout: 120000 });
      const t0 = performance.now();
      try { const o = await reader.read(canvasAt(1600)); res[tier] = { text: o.text, ms: Math.round(performance.now() - t0) }; }
      catch (e) { res[tier] = { error: String(e) }; }
      reader.dispose();
    }
    try {
      const mod = await import('/vendor/barcode-detector/ponyfill.js');
      const wasmUrl = new URL('/vendor/barcode-detector/zxing_reader.wasm', location.href).href;
      mod.setZXingModuleOverrides({ locateFile: (p, pre) => (p.endsWith('.wasm') ? wasmUrl : pre + p) });
      const det = new mod.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a'] });
      const codes = await det.detect(canvasAt(2576));
      res.barcodes = codes.map((c) => `${c.format}:${c.rawValue}`);
    } catch (e) { res.barcodes = ['erro ' + e]; }
    return res;
  }, { data });
  out[f] = r;
  console.log(f, JSON.stringify(r.barcodes), (r.small.text || r.small.error || '').replace(/\n/g, ' | ').slice(0, 140));
}
writeFileSync(`${dir}/leitura.json`, JSON.stringify(out, null, 2));
await browser.close(); await server.close();
