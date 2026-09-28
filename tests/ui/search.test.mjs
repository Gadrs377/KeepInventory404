// Barra de busca do Armário no navegador: o X, Esc, ordem por relevância,
// destaque e "Mostrar" quando o que bate está fora do ambiente ou filtro.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './harness.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT || new URL('../../experiments/ocr/node_modules/playwright/index.mjs', import.meta.url).href);

let server; let browser;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser.close(); await server.close(); });

const ITEMS = [
  ['7896006711117', 'Leite em Pó Ninho', 'Nestlé', 'cozinha'],
  ['7891000100103', 'Leite Condensado', 'Moça', 'cozinha'],
  ['7896005800018', 'Feijão Carioca', 'Camil', 'cozinha'],
  ['7891024134702', 'Detergente Líquido', 'Ypê', 'limpeza'],
  ['7896104998462', 'Papel Higiênico Folha Dupla', 'Neve', 'limpeza'],
];

async function openHome() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/#/`);
  await page.waitForTimeout(300);
  await page.evaluate(async (items) => {
    const s = await import('/js/store.js');
    for (const [code, name, brand, area] of items) await s.addStock(code, 2, { name, brand, area, source: 'loja' });
  }, ITEMS);
  await page.waitForSelector('.row-item');
  const names = () => page.$$eval('.row-item .row-name', (els) => els.map((e) => e.textContent));
  return { ctx, page, errors, names };
}

test('X aparece com texto, apaga, e o campo continua em foco', async () => {
  const { ctx, page, errors, names } = await openHome();
  try {
    assert.equal(await page.isVisible('.search-clear'), false);
    await page.fill('input[type=search]', 'feijao');
    assert.equal(await page.isVisible('.search-clear'), true);
    assert.deepEqual(await names(), ['Feijão Carioca']);
    await page.click('.search-clear');
    assert.equal(await page.inputValue('input[type=search]'), '');
    assert.equal(await page.isVisible('.search-clear'), false);
    assert.equal(await page.evaluate(() => document.activeElement.type), 'search');
    assert.equal((await names()).length, ITEMS.length);
    // Esc também apaga.
    await page.keyboard.type('leite');
    await page.keyboard.press('Escape');
    assert.equal(await page.inputValue('input[type=search]'), '');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('busca tolerante, com o mais parecido primeiro e o pedaço que bateu em destaque', async () => {
  const { ctx, page, errors, names } = await openHome();
  try {
    await page.fill('input[type=search]', 'detergnte');
    assert.deepEqual(await names(), ['Detergente Líquido']);
    await page.fill('input[type=search]', 'ninho lei');
    assert.deepEqual(await names(), ['Leite em Pó Ninho']);
    assert.deepEqual(await page.$$eval('.row-name mark.hit', (els) => els.map((e) => e.textContent)), ['Lei', 'Ninho']);
    await page.fill('input[type=search]', 'papelhigienico');
    assert.deepEqual(await names(), ['Papel Higiênico Folha Dupla']);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('o que bate fora do ambiente escolhido não some: "Buscar no armário todo"', async () => {
  const { ctx, page, errors, names } = await openHome();
  try {
    await page.click('[data-area=cozinha]');
    await page.waitForTimeout(400);
    await page.fill('input[type=search]', 'papel');
    assert.match(await page.textContent('.empty-filter p'), /Nada com “papel” em Cozinha, mas tem 1 produto no resto do armário/);
    await page.click('[data-widen]');
    await page.waitForTimeout(500);
    assert.deepEqual(await names(), ['Papel Higiênico Folha Dupla']);
    assert.equal(await page.getAttribute('[data-area=tudo]', 'aria-pressed'), 'true');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
