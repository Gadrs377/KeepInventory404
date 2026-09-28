// Fluxo da câmera de validade no navegador, com câmera e leitor simulados
// (ver harness.mjs). Cada teste abre um Chromium próprio. Leva uns minutos:
// o Paddle de verdade carrega quando o Tesseract não resolve.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openExpirySheet, bigPhoto, waitStatus } from './harness.mjs';

let server;
before(async () => { server = await startServer(); });
after(() => server.close());

const noErrors = (errors) => assert.deepEqual(errors, [], `erros na página: ${errors.join(' | ')}`);

test('duas imagens com VAL confirmam sozinhas e salvam', async () => {
  const cam = await openExpirySheet(server, { ocr: { fallback: 'VAL 15/10/26' } });
  try {
    await cam.page.waitForSelector('.exp-confirm-date', { timeout: 30000 });
    assert.match(await cam.page.$eval('.exp-confirm-date', (e) => e.textContent), /15 de outubro de 2026/);
    await cam.page.click('[data-done]');
    await cam.page.waitForTimeout(500);
    assert.deepEqual(await cam.lots(), ['2026-10-15']);
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

test('datas lidas viram botões na ordem em que chegaram, com a contagem', async () => {
  const cam = await openExpirySheet(server, { ocr: { texts: ['15/10/26 20/11/26', '', '15/10/26', '', '15/10/26'], delay: 250 } });
  try {
    await cam.page.waitForFunction(() => document.querySelectorAll('.exp-pick').length === 2, null, { timeout: 30000 });
    await cam.page.waitForFunction(() => document.querySelector('.exp-pick[data-iso="2026-10-15"]')?.textContent.includes('3×'), null, { timeout: 30000 });
    const chips = await cam.page.$$eval('.exp-pick', (els) => els.map((e) => ({ iso: e.dataset.iso, likely: e.classList.contains('is-likely') })));
    // Nada troca de lugar: a mais vista ganha destaque onde está.
    assert.deepEqual(chips.map((c) => c.iso), ['2026-11-20', '2026-10-15']);
    assert.deepEqual(chips.map((c) => c.likely), [false, true]);
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

test('data sem rótulo vista várias vezes vira pergunta; "Não" guarda o botão e não pergunta de novo', async () => {
  const cam = await openExpirySheet(server, { ocr: { fallback: '11/08/27 CC22326', delay: 150 } });
  try {
    await cam.page.waitForSelector('.exp-ask:not([hidden])', { timeout: 30000 });
    assert.match(await cam.page.$eval('.exp-ask-text', (e) => e.textContent), /Li 11\/08\/2027 várias vezes\. É a validade\?/);
    assert.match(await cam.status(), /Confira a data abaixo/);
    // Nunca confirma sozinha: sem rótulo, só a pessoa decide.
    assert.equal(await cam.page.$('.exp-confirm-date'), null);
    await cam.page.click('[data-ask-no]');
    assert.equal(await cam.page.$eval('.exp-ask', (e) => e.hidden), true);
    await cam.page.waitForTimeout(3000);
    assert.equal(await cam.page.$eval('.exp-ask', (e) => e.hidden), true);
    assert.deepEqual(await cam.page.$$eval('.exp-pick', (els) => els.map((e) => e.dataset.iso)), ['2027-08-11']);
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

test('"Sim" vai para a confirmação', async () => {
  const cam = await openExpirySheet(server, { ocr: { fallback: '11/08/27 CC22326', delay: 150 } });
  try {
    await cam.page.waitForSelector('.exp-ask:not([hidden])', { timeout: 30000 });
    await cam.page.click('[data-ask-yes]');
    await cam.page.waitForSelector('.exp-confirm-date', { timeout: 5000 });
    assert.match(await cam.page.$eval('.exp-confirm-date', (e) => e.textContent), /11 de agosto de 2027/);
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

test('digitar já vem com a data mais vista, selecionada', async () => {
  const cam = await openExpirySheet(server, { ocr: { fallback: '11/08/27 CC22326', delay: 150 } });
  try {
    await cam.page.waitForFunction(() => document.querySelector('.exp-pick')?.textContent.includes('2×'), null, { timeout: 30000 });
    await cam.page.click('[data-type]');
    await cam.page.waitForSelector('.exp-type-input');
    await cam.page.waitForTimeout(500);
    assert.equal(await cam.page.$eval('.exp-type-input', (e) => e.value), '11/08/27');
    assert.match(await cam.page.$eval('#exp-type-note', (e) => e.textContent), /A câmera leu 11 de agosto de 2027 em \d+ imagens/);
    // Digitar por cima troca tudo.
    await cam.page.keyboard.type('150926');
    assert.equal(await cam.page.$eval('.exp-type-input', (e) => e.value), '15/09/26');
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

test('embalagem difícil: fotos automáticas, aviso, digitar olhando a melhor foto', async () => {
  const cam = await openExpirySheet(server);
  try {
    await cam.page.waitForSelector('.exp-struggle.is-hard', { timeout: 120000 });
    assert.ok(await cam.page.evaluate(() => window.__shutters) >= 1, 'tirou foto automática');
    assert.ok(await cam.page.$eval('[data-type]', (e) => e.classList.contains('is-suggested')));
    await cam.page.click('[data-type]');
    await cam.page.waitForSelector('.exp-type-photo img');
    await cam.page.click('.exp-type-zoom', { position: { x: 120, y: 60 } });
    assert.equal(await cam.page.$eval('.exp-type-zoom', (e) => e.getAttribute('aria-pressed')), 'true');
    await cam.page.fill('.exp-type-input', '15/10/26');
    await cam.page.click('[data-next]');
    await cam.page.waitForSelector('.exp-confirm-date');
    assert.ok(await cam.page.$('.exp-evidence img'), 'a foto vai junto como prova');
    await cam.page.click('[data-done]');
    await cam.page.waitForTimeout(500);
    assert.deepEqual(await cam.lots(), ['2026-10-15']);
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

test('foto do celular: vira botão e abre o painel; "Sim" lê só o pedaço e confirma', async () => {
  const cam = await openExpirySheet(server, { ocr: { photoWidth: 99999 } });
  try {
    await cam.page.waitForSelector('.exp-struggle:not([hidden])', { timeout: 30000 });
    const [chooser] = await Promise.all([cam.page.waitForEvent('filechooser'), cam.page.click('[data-photo]')]);
    assert.equal(await (await chooser.element()).getAttribute('capture'), 'environment');
    await chooser.setFiles(await bigPhoto(cam.page));
    // O leitor rápido (Paddle small) lê a foto inteira: a data vira botão…
    await waitStatus(cam.page, /Achei uma data/, 180000);
    assert.deepEqual(await cam.page.$$eval('.exp-pick', (els) => els.map((e) => e.dataset.iso)), ['2026-10-15']);
    assert.equal(await cam.page.$('.exp-confirm-date'), null, 'uma foto sozinha não confirma');
    // …e a foto abre no painel com o palpite de onde está a validade.
    await cam.page.waitForSelector('.exp-find:not([hidden]) [data-find-yes]:not([hidden])');
    assert.equal(await cam.page.textContent('[data-find-title]'), 'A validade está aqui?');
    await cam.page.click('[data-find-yes]');
    await cam.page.waitForSelector('.exp-confirm-date', { timeout: 240000 });
    assert.match(await cam.page.$eval('.exp-confirm-date', (e) => e.textContent), /15 de outubro de 2026/);
    assert.ok(await cam.page.$('.exp-evidence img'), 'o pedaço lido vai como prova');
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

test('painel: tocar longe da data mostra "Não consegui ler aí" com o pedaço e Digitar', async () => {
  const cam = await openExpirySheet(server, { ocr: { photoWidth: 99999 } });
  try {
    await cam.page.waitForSelector('.exp-struggle:not([hidden])', { timeout: 30000 });
    const [chooser] = await Promise.all([cam.page.waitForEvent('filechooser'), cam.page.click('[data-photo]')]);
    await chooser.setFiles(await bigPhoto(cam.page));
    await cam.page.waitForSelector('.exp-find:not([hidden]) [data-find-yes]:not([hidden])', { timeout: 180000 });
    const box = await cam.page.$eval('[data-find-img]', (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    await cam.page.mouse.click(box[0] + box[2] * 0.5, box[1] + box[3] * 0.12); // parte lisa, sem texto
    await cam.page.waitForSelector('[data-find-fail]:not([hidden])', { timeout: 240000 });
    assert.match(await cam.page.textContent('[data-find-note]'), /Não consegui ler aí/);
    assert.ok(await cam.page.$eval('[data-find-crop]', (e) => e.src.startsWith('data:image/jpeg')));
    await cam.page.click('[data-find-type]');
    await cam.page.waitForSelector('.exp-type-input');
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

for (const [video, re] of [['dark', /escuro/], ['glare', /reflexo/], ['plain', /Segure parado/]]) {
  test(`aviso de imagem: ${video}`, async () => {
    const cam = await openExpirySheet(server, { video });
    try {
      await waitStatus(cam.page, re, 15000);
      noErrors(cam.errors);
    } finally { await cam.close(); }
  });
}

test('diagnóstico (?debug): mostra o motivo de cada leitura e copia em JSON', async () => {
  const cam = await openExpirySheet(server, { query: '?debug', permissions: ['clipboard-read', 'clipboard-write'], ocr: { fallback: '11/08/27 CC22326', delay: 150 } });
  try {
    await cam.page.waitForSelector('.exp-debug-log li');
    await cam.page.waitForFunction(() => /data sem rótulo de validade/.test(document.querySelector('.exp-debug-log').textContent), null, { timeout: 15000 });
    await cam.page.click('[data-debug-copy]');
    await cam.page.waitForTimeout(300);
    const copied = JSON.parse(await cam.page.evaluate(() => navigator.clipboard.readText()));
    assert.ok(copied.log.some((e) => e.kind === 'read' && e.result === 'unlabeled' && e.dates[0].iso === '2027-08-11'));
    // "Enviar para o Claude" abre a Bancada (a página que guarda os resultados).
    assert.match(await cam.page.getAttribute('[data-debug-send]', 'href'), /^https:\/\/claude\.ai\/artifact\//);
    noErrors(cam.errors);
  } finally { await cam.close(); }
});

test('sem ?debug o painel não aparece', async () => {
  const cam = await openExpirySheet(server);
  try {
    await cam.page.waitForTimeout(800);
    assert.equal(await cam.page.$('.exp-debug'), null);
  } finally { await cam.close(); }
});
