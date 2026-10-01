// Movimento do celular no iPhone: o Safari só dá a licença se o pedido vier
// no fim de um toque (o pedido no começo do toque era recusado sem aviso e o
// app não tentava de novo). Aqui o "Safari" é simulado: requestPermission só
// aceita com ativação do usuário, como no iPhone.
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

async function iphone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    window.__asked = [];
    // Como o Safari: vale só durante um evento de fim de toque (ou clique).
    let current = '';
    for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'change']) {
      window.addEventListener(t, () => { current = t; setTimeout(() => { if (current === t) current = ''; }, 0); }, true);
    }
    DeviceOrientationEvent.requestPermission = () => {
      const ok = ['pointerup', 'touchend', 'click', 'change'].includes(current);
      window.__asked.push(ok ? 'granted' : 'blocked');
      return ok ? Promise.resolve('granted') : Promise.reject(new DOMException('Requesting device orientation access requires a user gesture to prompt', 'NotAllowedError'));
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://keepinventory-api.gabriel-gadrs377.workers.dev/**', (route) => route.fulfill({ json: { results: [] } }));
  await page.goto(`${server.url}/#/`);
  await page.evaluate(async () => {
    const s = await import('/js/store.js');
    await s.addStock('SEM-tilt', 1, { barcodes: [], name: 'Dipirona 1g', size: '10 comprimidos', area: 'remedios' });
  });
  return { ctx, page, errors };
}
const tiltPhone = (page) => page.evaluate(async () => {
  const fire = (g) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: g, beta: 40, alpha: 0 }));
  for (let i = 0; i <= 20; i++) { fire(i * 0.6); await new Promise((r) => setTimeout(r, 16)); }
  return document.querySelector('.mbox-3d').style.transform;
});

test('tocar na caixa do remédio pede a licença no fim do toque e a caixa mexe', async () => {
  const { ctx, page, errors } = await iphone();
  try {
    await page.goto(page.url().replace(/#.*$/, '') + '#/produto/SEM-tilt');
    await page.waitForSelector('.mbox-3d');
    await page.waitForTimeout(800);
    await page.tap('.mbox-3d');
    await page.waitForFunction(() => window.__asked.length > 0);
    assert.deepEqual(await page.evaluate(() => window.__asked), ['granted']);
    assert.match(await tiltPhone(page), /rotateY/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a chave em Mais pede a licença e fica ligada', async () => {
  const { ctx, page, errors } = await iphone();
  try {
    await page.goto(page.url().replace(/#.*$/, '') + '#/dados');
    const sw = await page.waitForSelector('[data-tilt]');
    assert.equal(await sw.isChecked(), false, 'sem licença, aparece desligada');
    await page.tap('[data-tilt]');
    await page.waitForFunction(() => window.__asked.length > 0);
    assert.deepEqual(await page.evaluate(() => window.__asked), ['granted']);
    await page.waitForTimeout(100);
    assert.equal(await sw.isChecked(), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
