// Abrir um produto pela lista: a foto, o nome e a etiqueta voam da linha até
// a página (View Transition). Trocar a etiqueta no meio da abertura cancelava a
// animação e a página aparecia num supetão; aqui a troca tem de ir até o fim.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './harness.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT || new URL('../../experiments/ocr/node_modules/playwright/index.mjs', import.meta.url).href);

let server; let browser;
before(async () => {
  server = await startServer();
  browser = await chromium.launch();
});
after(async () => { await browser.close(); await server.close(); });

test('abrir e voltar do produto anima até o fim', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://keepinventory-api.gabriel-gadrs377.workers.dev/**', (route) => route.fulfill({ json: { results: [] } }));
  try {
    await page.goto(`${server.url}/#/`);
    await page.evaluate(async () => {
      const s = await import('/js/store.js');
      await s.addStock('SEM-vt1', 1, { barcodes: [], name: 'Arroz Teste', size: '5 kg', area: 'cozinha', minQty: 1 });
      await s.addStock('SEM-vt2', 3, { barcodes: [], name: 'Feijão Teste', size: '1 kg', area: 'cozinha' });
    });
    await page.reload();
    await page.waitForSelector('.row-item[data-code="SEM-vt1"]');
    await page.waitForTimeout(600);
    // Mede quanto cada troca de tela durou.
    await page.evaluate(() => {
      window.__vt = [];
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = (cb) => {
        const t0 = performance.now();
        const t = start(cb);
        t.finished.then(() => window.__vt.push(performance.now() - t0));
        return t;
      };
    });
    await page.click('.row-item[data-code="SEM-vt1"] a.row');
    await page.waitForFunction(() => window.__vt.length === 1, null, { timeout: 3000 });
    await page.waitForTimeout(300);
    await page.click('.nav-bar a.icon-btn');
    await page.waitForFunction(() => window.__vt.length === 2, null, { timeout: 3000 });
    const [open, back] = await page.evaluate(() => window.__vt);
    assert.ok(open > 300, `a abertura foi cortada (${Math.round(open)} ms)`);
    assert.ok(back > 300, `a volta foi cortada (${Math.round(back)} ms)`);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
