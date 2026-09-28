// Base dos testes de interface da câmera de validade: servidor estático do
// próprio repositório, Chromium com um vídeo falso como câmera (gerado aqui,
// sem arquivos binários no repositório) e o Tesseract simulado, para cada
// teste decidir o que o "leitor" enxerga.
//
// Rodar: node --test tests/ui/
// Playwright vem de experiments/ocr (npm install lá) ou de PLAYWRIGHT=caminho
// para o index.mjs de outra instalação.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const { chromium } = await import(process.env.PLAYWRIGHT || new URL('../../experiments/ocr/node_modules/playwright/index.mjs', import.meta.url).href);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.tar': 'application/x-tar', '.traineddata': 'application/octet-stream', '.gz': 'application/gzip',
};

export async function startServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

// Vídeo YUV 4:2:0 para a câmera falsa do Chromium. `luma(x, y)` dá o brilho
// (0–255) de cada ponto; cor neutra. Poucos quadros: o Chromium repete.
export async function fakeVideo(name, luma, { width = 640, height = 480, frames = 8 } = {}) {
  const y = Buffer.alloc(width * height);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) y[j * width + i] = luma(i, j);
  const uv = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${width} H${height} F15:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from('FRAME\n'), y, uv);
  const dir = await mkdtemp(join(tmpdir(), 'ki-cam-'));
  const file = join(dir, `${name}.y4m`);
  await writeFile(file, Buffer.concat(parts));
  return file;
}

export const VIDEOS = {
  plain: (x, y) => 214, // liso: nada nítido
  dark: () => 20,
  // faixa branca estourada atravessando a mira
  glare: (x, y) => (y > 200 && y < 280 ? 255 : 120),
};

/**
 * Abre a folha de validade de um produto novo com a câmera falsa.
 * O leitor simulado segue `window.__ocr` (dá para mudar no meio do teste):
 *   texts: textos devolvidos em ordem, um por leitura; depois vem `fallback`.
 *   fallback: texto das leituras seguintes ('' = nada lido).
 *   photoWidth/photoText: recorte com pelo menos essa largura (só a foto do
 *   celular chega lá) lê photoText.
 *   delay: ms por leitura.
 */
export async function openExpirySheet(server, { video = 'plain', ocr = {}, query = '', width = 390, permissions = [] } = {}) {
  const file = await fakeVideo(video, VIDEOS[video]);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${file}`] });
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['camera', ...permissions] });
  await ctx.addInitScript((ocr) => {
    window.__ocr = { texts: [], fallback: '', photoWidth: 0, photoText: '', delay: 60, ...ocr };
    window.__calls = []; window.__shutters = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...a) { if (this.classList && this.classList.contains('exp-shutter')) window.__shutters++; return animate.apply(this, a); };
    let real;
    Object.defineProperty(window, 'Tesseract', { configurable: true, get: () => real, set(v) {
      const create = v.createWorker;
      real = { ...v, createWorker: async (...a) => {
        const w = await create(...a);
        return { ...w, setParameters: (...x) => w.setParameters(...x), recognize: async (canvas) => {
          const o = window.__ocr;
          const text = o.photoWidth && canvas.width >= o.photoWidth ? o.photoText : o.texts.length ? o.texts.shift() : o.fallback;
          window.__calls.push({ w: canvas.width, text });
          await new Promise((r) => setTimeout(r, o.delay));
          return { data: { text, confidence: text ? 90 : 0 } };
        } };
      } };
    } });
  }, ocr);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/${query}#/`);
  await page.waitForTimeout(300);
  const code = String(7896006700000 + Math.floor(Math.random() * 9999));
  await page.evaluate(async (code) => { const s = await import('/js/store.js'); await s.addStock(code, 1, { name: 'Teste', area: 'cozinha', source: 'loja' }); }, code);
  await page.evaluate((code) => { location.hash = `#/produto/${code}`; }, code);
  await page.waitForSelector('[data-add-lot]');
  await page.click('[data-add-lot]');
  await page.waitForSelector('.exp-status');
  return {
    browser, page, errors,
    status: () => page.$eval('.exp-status', (e) => e.textContent).catch(() => ''),
    lots: () => page.evaluate(async (code) => (await (await import('/js/store.js')).lotsFor(code)).map((l) => l.expiresAt), code),
    close: () => browser.close(),
  };
}

// Uma "foto do celular" grande (PNG), para o seletor de arquivo.
export async function bigPhoto(page) {
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1500;
    const g = c.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, 2000, 1500);
    g.fillStyle = '#222'; g.font = 'bold 120px sans-serif'; g.fillText('VAL 15/10/26', 300, 800);
    return c.toDataURL('image/png');
  });
  return { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') };
}

// Espera o texto de status bater com `re` (devolve em quantos ms).
export async function waitStatus(page, re, timeout = 20000) {
  const t0 = Date.now();
  await page.waitForFunction((src) => new RegExp(src, 'i').test(document.querySelector('.exp-status')?.textContent || ''), re.source, { timeout });
  return Date.now() - t0;
}
