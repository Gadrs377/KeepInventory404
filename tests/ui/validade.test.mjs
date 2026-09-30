// Modo Validade (#/validade): lê o código de um produto do armário e já abre a
// câmera da data; mostra as datas que ele já tem e avisa quando a data lida é
// uma delas (a embalagem que já tinha data, e não a nova).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './harness.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT || new URL('../../experiments/ocr/node_modules/playwright/index.mjs', import.meta.url).href);

let server; let browser;
before(async () => {
  server = await startServer();
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
});
after(async () => { await browser.close(); await server.close(); });

async function openMode(seed) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://keepinventory-api.gabriel-gadrs377.workers.dev/**', (route) => route.fulfill({ json: { results: [] } }));
  await page.goto(`${server.url}/#/`);
  await page.evaluate(seed);
  await page.reload();
  await page.click('[data-validade]');
  await page.waitForSelector('.screen-validade [data-manual]');
  const readCode = async (code) => {
    await page.click('.screen-validade [data-manual]');
    await page.waitForSelector('.sheet input');
    await page.fill('.sheet input', code);
    await page.keyboard.press('Enter');
  };
  const typeDate = async (text) => {
    await page.click('.sheet .exp-scan:not([hidden]) [data-type]');
    await page.fill('.exp-type-input', text);
    await page.click('.exp-type [data-next]');
    await page.waitForSelector('.exp-confirm-page:not([hidden])');
  };
  const lots = (code) => page.evaluate(async (c) => (await import('/js/store.js')).lotsFor(c).then((l) => l.map((x) => [x.expiresAt, x.qty])), code);
  return { ctx, page, errors, readCode, typeDate, lots };
}

const LEITE = '7891000100103';

test('produto com parte das datas: mostra as marcadas, avisa a repetida e guarda a nova', async () => {
  const s = await openMode(async () => {
    const st = await import('/js/store.js');
    await st.addStock('7891000100103', 3, { name: 'Leite Integral 1L', area: 'cozinha', barcodes: ['7891000100103'] });
    await st.addLot('7891000100103', 2, '2026-10-15');
  });
  try {
    await s.readCode(LEITE);
    await s.page.waitForSelector('.exp-existing');
    assert.match(await s.page.textContent('.exp-existing'), /15\/10\/2026 \(2 unidades\)/);
    await s.typeDate('15/10/26');
    assert.match(await s.page.textContent('.exp-dup'), /já está marcada em 2 unidades/);
    await s.page.click('[data-other]');
    await s.typeDate('20/11/26');
    assert.equal(await s.page.isVisible('.exp-confirm-page:not([hidden]) .exp-dup'), false);
    await s.page.click('.exp-confirm-page:not([hidden]) [data-done]');
    await s.page.waitForSelector('.screen-validade .receipt-line');
    assert.deepEqual(await s.lots(LEITE), [['2026-10-15', 2], ['2026-11-20', 1]]);
    assert.match(await s.page.textContent('.screen-validade .receipt-lines'), /Leite Integral 1L.*20\/11/s);
    assert.deepEqual(s.errors, []);
  } finally { await s.ctx.close(); }
});

test('todas com data: não abre a câmera, mostra as datas', async () => {
  const s = await openMode(async () => {
    const st = await import('/js/store.js');
    await st.addStock('7891000100103', 2, { name: 'Leite Integral 1L', area: 'cozinha', barcodes: ['7891000100103'] });
    await st.addLot('7891000100103', 2, '2026-10-15');
  });
  try {
    await s.readCode(LEITE);
    await s.page.waitForSelector('.sheet [data-act]');
    assert.match(await s.page.textContent('.sheet'), /Todas as 2 unidades já têm data.*15\/10\/2026/s);
    assert.equal(await s.page.isVisible('.exp-cam'), false);
  } finally { await s.ctx.close(); }
});

test('código que não está no armário: oferece a Entrada', async () => {
  const s = await openMode(async () => {});
  try {
    await s.readCode(LEITE);
    await s.page.waitForSelector('.sheet [data-act]');
    assert.match(await s.page.textContent('.sheet'), /não está no armário/);
    await s.page.click('.sheet [data-act]');
    await s.page.waitForFunction(() => location.hash.startsWith('#/entrada/7891000100103'));
  } finally { await s.ctx.close(); }
});
