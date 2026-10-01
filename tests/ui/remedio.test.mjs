// Remédio: ligar o uso contínuo não pode travar a tela (o seletor "Toma por
// dia" gravava ao montar e a tela entrava num ciclo sem fim), todo remédio
// tem a caixa, mesmo sem os dados da Anvisa, e o aviso de receita só aparece
// quando a farmácia fica com ela.
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

async function open(seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://keepinventory-api.gabriel-gadrs377.workers.dev/**', (route) => route.fulfill({ json: { results: [] } }));
  await page.goto(`${server.url}/#/`);
  await page.evaluate(seed);
  return { ctx, page, errors };
}

test('ligar o uso contínuo mostra a cartela e a tela continua respondendo', async () => {
  const { ctx, page, errors } = await open(async () => {
    const s = await import('/js/store.js');
    await s.addStock('SEM-rem1', 1, { barcodes: [], name: 'Losartana 50mg', size: '30 comprimidos', area: 'remedios' });
  });
  try {
    await page.goto(page.url().replace(/#.*$/, '') + '#/produto/SEM-rem1');
    await page.waitForSelector('[data-cont-toggle]');
    await page.click('[data-cont-toggle]');
    await page.waitForSelector('.blister');
    // Se a tela travou, o clique não termina e o número não muda.
    await page.click('[data-use="1"]', { timeout: 3000 });
    await page.waitForFunction(() => document.querySelector('.hero-qty .tag-n')?.textContent === '2', null, { timeout: 3000 });
    // O seletor "Toma por dia" muda sem entrar em ciclo.
    await page.click('[data-perday] [data-step="1"]', { timeout: 3000 });
    await page.waitForFunction(async () => (await (await import('/js/store.js')).getProduct('SEM-rem1')).cont.perDay === 2, null, { timeout: 3000 });
    const writes = await page.evaluate(async () => {
      const s = await import('/js/store.js');
      let n = 0;
      const off = s.onChange(() => { n += 1; });
      await new Promise((r) => setTimeout(r, 800));
      off();
      return n;
    });
    assert.equal(writes, 0, 'nada grava sozinho depois de ligar');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('remédio sem os dados da Anvisa também tem a caixa', async () => {
  const { ctx, page, errors } = await open(async () => {
    const s = await import('/js/store.js');
    await s.addStock('SEM-rem2', 1, { barcodes: [], name: 'Cloridrato de tiamina + cloridrato de piridoxina + cianocobalamina', brand: 'Laboratório Muito Comprido Ltda', size: '30 comprimidos', area: 'remedios' });
  });
  try {
    await page.goto(page.url().replace(/#.*$/, '') + '#/produto/SEM-rem2');
    await page.waitForSelector('.product-hero .mbox');
    // O nome cabe na caixa (diminui até caber, no máximo duas linhas).
    const fits = await page.$eval('.mbox-name', (el) => el.scrollWidth <= el.clientWidth + 1);
    assert.ok(fits, 'o nome não passa da largura da caixa');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('aviso de receita só quando a farmácia fica com ela; a tarja continua na caixa', async () => {
  const { ctx, page, errors } = await open(async () => {
    const s = await import('/js/store.js');
    const m = (tarja) => ({ nome: 'Remédio', substancia: 'teste', tamanho: '500 mg, 20 comprimidos', laboratorio: 'EMS', tipo: 'Genérico', tarja });
    for (const t of ['livre', 'vermelha', 'vermelha-retencao', 'preta']) {
      await s.addStock(`SEM-rx-${t}`, 1, { barcodes: [], name: `Remédio ${t}`, area: 'remedios', med: m(t) });
    }
  });
  try {
    const base = page.url().replace(/#.*$/, '');
    const seen = {};
    for (const t of ['livre', 'vermelha', 'vermelha-retencao', 'preta']) {
      await page.goto(`${base}#/produto/SEM-rx-${t}`);
      await page.waitForFunction((name) => document.querySelector('.product-hero .page-title')?.textContent === name && document.querySelector('.product-hero .mbox'), `Remédio ${t}`);
      seen[t] = await page.evaluate(() => ({
        card: !!document.querySelector('.rx-card'),
        tarja: document.querySelector('.mbox-tarja')?.textContent || '',
        venda: [...document.querySelectorAll('.fact dt')].some((d) => d.textContent === 'Venda'),
      }));
    }
    assert.equal(seen.livre.card, false);
    assert.equal(seen.vermelha.card, false, 'tarja vermelha comum não ganha aviso');
    assert.equal(seen['vermelha-retencao'].card, true);
    assert.equal(seen.preta.card, true);
    assert.match(seen.vermelha.tarja, /PRESCRIÇÃO/, 'a tarja continua na caixa');
    assert.match(seen.preta.tarja, /DEPENDÊNCIA/);
    assert.ok(Object.values(seen).every((x) => !x.venda), 'a ficha não repete a venda');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
