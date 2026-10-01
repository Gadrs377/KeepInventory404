// Folha de produto novo, campo "Onde fica": quem decide o ambiente, o aviso
// "Não tenho certeza", a consulta ao repassador (/area, simulado aqui) e o que
// a casa ensina ao escolher à mão.
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

// Repassador simulado: busca vazia; /area responde o que o teste mandar.
async function openNewByName(webAreas = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  const asked = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://keepinventory-api.gabriel-gadrs377.workers.dev/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/area') {
      const q = url.searchParams.get('q');
      asked.push(q);
      const area = webAreas[q];
      return route.fulfill({ json: area ? { found: true, area } : { found: false } });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(`${server.url}/#/entrada`);
  await page.waitForSelector('[data-type]');
  // O modelo carrega em segundo plano; espera ele antes de digitar.
  await page.waitForFunction(async () => (await import('/js/areas.js')).guessAreaInfo({ name: 'Losartana 50mg' }).by === 'modelo');
  const open = async () => {
    // Produto sem código: Digitar > "Produto sem código de barras".
    await page.click('[data-type]');
    await page.click('.sheet [data-nocode]');
    await page.click('[data-way="name"]');
    await page.waitForSelector('#new-name');
  };
  await open();
  const checked = () => page.$eval('input[name=area]:checked', (el) => el.value);
  const hint = () => page.isVisible('[data-area-hint]');
  const type = async (name) => { await page.fill('#new-name', ''); await page.type('#new-name', name, { delay: 5 }); await page.waitForTimeout(700); };
  return { ctx, page, errors, asked, checked, hint, type, open };
}

test('nome conhecido: decide sozinho, sem aviso e sem perguntar ao repassador', async () => {
  const s = await openNewByName();
  try {
    await s.type('Detergente Ypê Neutro 500ml');
    assert.equal(await s.checked(), 'limpeza');
    assert.equal(await s.hint(), false);
    await s.type('Losartana Potássica 50mg');
    assert.equal(await s.checked(), 'remedios');
    assert.equal(await s.hint(), false);
    assert.deepEqual(s.asked, []);
    assert.deepEqual(s.errors, []);
  } finally { await s.ctx.close(); }
});

test('sem certeza: pergunta ao repassador e usa a resposta', async () => {
  const s = await openNewByName({ 'Zqxw kwyj': 'limpeza' });
  try {
    await s.type('Zqxw kwyj');
    assert.ok(s.asked.includes('Zqxw kwyj'));
    assert.equal(await s.checked(), 'limpeza');
    assert.equal(await s.hint(), false);
  } finally { await s.ctx.close(); }
});

test('ninguém sabe: aviso "Confira onde fica", que some ao tocar num ambiente', async () => {
  const s = await openNewByName();
  try {
    await s.type('Qqzv xxkw');
    assert.equal(await s.hint(), true);
    assert.equal(await s.page.$eval('[data-area]', (el) => el.classList.contains('is-unsure')), true);
    await s.page.click('.segment:has(input[value=beleza])');
    assert.equal(await s.checked(), 'beleza');
    assert.equal(await s.hint(), false);
    // Escolheu à mão: continua escolhido mesmo mudando o nome.
    await s.type('Detergente Ypê');
    assert.equal(await s.checked(), 'beleza');
  } finally { await s.ctx.close(); }
});

test('escolha à mão ensina o próximo parecido (vence o modelo)', async () => {
  const s = await openNewByName();
  try {
    await s.type('Vela Aromática Lavanda');
    assert.equal(await s.checked(), 'limpeza'); // palpite do modelo
    await s.page.click('.segment:has(input[value=beleza])');
    await s.page.click('form [type=submit]');
    await s.page.waitForFunction(async () => (await (await import('/js/store.js')).listProducts()).length === 1);
    const saved = await s.page.evaluate(async () => (await (await import('/js/store.js')).listProducts())[0]);
    assert.equal(saved.area, 'beleza');
    assert.equal(saved.areaByUser, true);
    await s.page.waitForTimeout(400);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(400);
    await s.open();
    await s.type('Vela Aromática Canela');
    assert.equal(await s.checked(), 'beleza');
    assert.equal(await s.hint(), false);
    assert.deepEqual(s.errors, []);
  } finally { await s.ctx.close(); }
});
